// Read-only Supabase audit. Keep these projections aligned with ContentUploadsService.list.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, connect } from 'node:net';
import { createHash } from 'node:crypto';
const load = createRequire(new URL('../packages/database/package.json', import.meta.url));
const postgres = load('postgres');

const joined = `from public.content_upload_sessions u
join public.users a on a.id=u.actor_user_id
left join public.assessment_packages p on p.id=u.package_id
where u.id=any($1::uuid[]) order by u.created_at desc,u.id desc`;
const beforeSql = `select u.*,a.display_name as actor_name,p.name as package_title,
p.assessment_type::text as package_type,coalesce(p.status::text,u.state) as current_status ${joined}`;
const afterSql = `select u.id,u.file_name,u.created_at,u.revision,u.state,u.package_id,u.error,
coalesce(jsonb_array_length(u.preview->'selectedIds'),jsonb_array_length(u.report->'items'),0) as question_count,
u.preview->'destination'->>'title' as preview_title,u.preview->'destination'->>'assessmentType' as preview_type,
coalesce((u.preview->'validationCounts'->>'content')::int,0) as content_issues,
coalesce((u.preview->'validationCounts'->>'mapping')::int,0) as mapping_issues,
coalesce(jsonb_array_length(u.preview->'issues'),0) as parsing_issues,
u.report is not null and u.report<>'null'::jsonb as has_report,
coalesce((u.report->>'canImportDraft')::boolean,false) as can_import_draft,
a.display_name as actor_name,p.name as package_title,p.assessment_type::text as package_type,
coalesce(p.status::text,u.state) as current_status ${joined}`;

function summary(row, projected) {
  const content = projected ? row.content_issues : (row.preview?.validationCounts?.content ?? 0);
  const mapping = projected ? row.mapping_issues : (row.preview?.validationCounts?.mapping ?? 0);
  const parsing = projected ? row.parsing_issues : (row.preview?.issues.length ?? 0);
  const hasReport = projected ? row.has_report : !!row.report;
  const canImport = projected ? row.can_import_draft : !!row.report?.canImportDraft;
  return {
    id: row.id,
    fileName: row.file_name,
    createdAt: row.created_at.toISOString(),
    revision: row.revision,
    state: row.state,
    packageId: row.package_id,
    error: row.error,
    actorName: row.actor_name,
    title:
      row.package_title ??
      (projected ? row.preview_title : (row.preview?.destination?.title ?? null)),
    assessmentType:
      row.package_type ??
      (projected ? row.preview_type : (row.preview?.destination?.assessmentType ?? null)),
    status: row.current_status,
    questionCount: projected
      ? row.question_count
      : (row.preview?.selectedIds.length ?? row.report?.items.length ?? 0),
    validationResult:
      row.error ??
      (content || mapping
        ? `Konten: ${content} masalah; pemetaan: ${mapping} belum selesai`
        : parsing
          ? `${parsing} masalah parsing`
          : hasReport
            ? canImport
              ? 'Isi valid'
              : 'Pemetaan/validasi belum lengkap'
            : 'Belum divalidasi'),
  };
}

export async function measureUploadPayload(url) {
  let remote;
  try {
    remote = new URL(url);
  } catch {
    return { status: 'error', code: 'DATABASE_URL_REQUIRED' };
  }
  if (
    !/\.supabase\.(co|com)$/.test(remote.hostname) ||
    !['require', 'verify-full'].includes(remote.searchParams.get('sslmode'))
  )
    return { status: 'error', code: 'SUPABASE_TLS_URL_REQUIRED' };
  const sockets = new Set();
  let responseBytes = 0;
  const proxy = createServer((downstream) => {
    const upstream = connect(Number(remote.port || 5432), remote.hostname);
    for (const socket of [upstream, downstream]) {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => {
        upstream.destroy();
        downstream.destroy();
      });
    }
    upstream.on('data', (chunk) => {
      responseBytes += chunk.length;
    });
    upstream.pipe(downstream);
    downstream.pipe(upstream);
  });
  let client;
  try {
    await new Promise((done, fail) => proxy.once('error', fail).listen(0, '127.0.0.1', done));
    client = postgres(url, {
      max: 1,
      connect_timeout: 10,
      idle_timeout: 2,
      onnotice: () => {},
      connection: { application_name: 'numora_content_payload_read_audit' },
      // Preserve the configured DSN and TLS hostname while routing through the byte counter.
      socket: async () => {
        const socket = connect(proxy.address().port, '127.0.0.1');
        socket.host = remote.hostname;
        socket.port = Number(remote.port || 5432);
        await new Promise((done, fail) => socket.once('connect', done).once('error', fail));
        return socket;
      },
    });
    return await client.begin('isolation level repeatable read read only', async (tx) => {
      await tx`set local statement_timeout='10s'`;
      await tx`set local lock_timeout='1s'`;
      const [mode] = await tx`show transaction_read_only`;
      if (mode.transaction_read_only !== 'on')
        throw Object.assign(new Error(), { code: 'READ_ONLY_REQUIRED' });
      const [relations] =
        await tx`select to_regclass('public.content_upload_sessions') is not null as available`;
      if (!relations.available) return { status: 'table_missing', readOnly: true };
      // Only IDs and size estimates leave PostgreSQL during sample selection.
      const candidates =
        await tx`select id,octet_length(to_jsonb(u)::text)::int as estimated_bytes from public.content_upload_sessions u order by created_at desc,id desc limit 20`;
      let estimate = 0;
      const ids = [];
      for (const candidate of candidates) {
        if (estimate + candidate.estimated_bytes > 512 * 1024) break;
        ids.push(candidate.id);
        estimate += candidate.estimated_bytes;
      }
      if (!ids.length)
        return {
          status: candidates.length ? 'sample_over_transfer_budget' : 'empty_table',
          readOnly: true,
          candidates: candidates.length,
          firstRowEstimatedBytes: candidates[0]?.estimated_bytes ?? 0,
        };
      const measurements = [];
      const hashes = [];
      for (const [label, query] of [
        ['before', beforeSql],
        ['after', afterSql],
      ]) {
        responseBytes = 0;
        const started = performance.now();
        const rows = await tx.unsafe(query, [ids]);
        const [total] =
          await tx`select count(*)::int as count from public.content_upload_sessions u left join public.assessment_packages p on p.id=u.package_id`;
        measurements.push({
          label,
          rows: rows.length,
          queryCount: 2,
          responseTlsBytes: responseBytes,
          durationMs: Math.round(performance.now() - started),
        });
        // Never print rows or hashes; comparison includes all API summary fields.
        hashes.push(
          createHash('sha256')
            .update(
              JSON.stringify({
                items: rows.map((row) => summary(row, label === 'after')),
                total: total.count,
              }),
            )
            .digest('hex'),
        );
      }
      if (hashes[0] !== hashes[1]) throw Object.assign(new Error(), { code: 'SUMMARY_MISMATCH' });
      return {
        status: 'measured',
        readOnly: true,
        summaryEquivalent: true,
        candidates: candidates.length,
        sampleEstimatedBytes: estimate,
        measurements,
      };
    });
  } catch (error) {
    const code = /^[A-Z0-9_]{1,50}$/.test(error.code ?? '') ? error.code : 'MEASUREMENT_FAILED';
    return { status: 'error', code };
  } finally {
    await client?.end({ timeout: 2 }).catch(() => {});
    for (const socket of sockets) socket.destroy();
    await new Promise((done) => proxy.close(() => done()));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: node --env-file=<chosen cloud env file> scripts/measure-content-upload-payload.mjs',
    );
    console.log(
      'Read-only sample, maximum 20 rows / 512 KiB estimated row data. Prints aggregate measurements only.',
    );
  } else {
    measureUploadPayload(process.env.DATABASE_URL)
      .then((result) => {
        console.log(JSON.stringify(result));
        if (result.status === 'error') process.exitCode = 1;
      })
      .catch(() => {
        console.log(JSON.stringify({ status: 'error', code: 'MEASUREMENT_FAILED' }));
        process.exitCode = 1;
      });
  }
}
