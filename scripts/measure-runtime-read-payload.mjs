// Compare the changed SQL groups, not complete HTTP requests or billed Supabase Usage.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, createServer } from 'node:net';
const load = createRequire(new URL('../packages/database/package.json', import.meta.url));
const postgres = load('postgres');

export async function measureRuntimeReads(url) {
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
  let bytes = 0;
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
      bytes += chunk.length;
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
      connection: { application_name: 'numora_runtime_payload_read_audit' },
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
      const groups = [];
      const measured = async (label, queryCount, read) => {
        bytes = 0;
        const started = performance.now();
        const value = await read();
        return {
          value,
          metrics: {
            label,
            queryCount,
            responseTlsBytes: bytes,
            durationMs: Math.round(performance.now() - started),
          },
        };
      };
      const versions =
        await tx`select id from question_versions where question_type='SINGLE_CHOICE' and content_status='READY' order by id limit 20`;
      const ids = versions.map((row) => row.id);
      if (ids.length) {
        const [size] =
          await tx`select coalesce(sum(octet_length(to_jsonb(v)::text)),0)::bigint as estimate from question_versions v where v.id in ${tx(ids)}`;
        if (Number(size.estimate) <= 512 * 1024) {
          const before = await measured(
            'before',
            1,
            () => tx`select * from question_versions where id in ${tx(ids)} order by id`,
          );
          const after = await measured(
            'after',
            1,
            () =>
              tx`select question_type,stem,options_or_statements,answer_key,explanation from question_versions where id in ${tx(ids)} order by id`,
          );
          const fields = (rows) =>
            rows.map((row) => ({
              questionType: row.question_type,
              stem: row.stem,
              options: row.options_or_statements,
              key: row.answer_key,
              explanation: row.explanation,
            }));
          if (JSON.stringify(fields(before.value)) !== JSON.stringify(fields(after.value)))
            throw Object.assign(new Error(), { code: 'PVP_DECODER_INPUT_MISMATCH' });
          groups.push({
            group: 'pvp_snapshot_version_projection',
            status: 'measured',
            versions: ids.length,
            equivalent: true,
            measurements: [before.metrics, after.metrics],
          });
        } else
          groups.push({
            group: 'pvp_snapshot_version_projection',
            status: 'sample_over_transfer_budget',
          });
      } else
        groups.push({
          group: 'pvp_snapshot_version_projection',
          status: 'no_ready_single_choice_version',
        });
      const [pack] =
        await tx`select id,octet_length(to_jsonb(p)::text)::integer as estimate from assessment_packages p where assessment_type='TRYOUT' order by id limit 1`;
      if (pack && pack.estimate <= 512 * 1024) {
        const before = await measured(
          'before',
          1,
          () => tx`select * from assessment_packages where id=${pack.id}`,
        );
        const after = await measured(
          'after',
          1,
          () => tx`select id,name from assessment_packages where id=${pack.id}`,
        );
        if (
          JSON.stringify(before.value.map((row) => ({ id: row.id, name: row.name }))) !==
          JSON.stringify(after.value)
        )
          throw Object.assign(new Error(), { code: 'NOTIFICATION_TITLE_MISMATCH' });
        groups.push({
          group: 'notification_package_projection',
          status: 'measured',
          packages: 1,
          equivalent: true,
          measurements: [before.metrics, after.metrics],
        });
      } else
        groups.push({
          group: 'notification_package_projection',
          status: pack ? 'sample_over_transfer_budget' : 'no_tryout_package',
        });

      return { status: 'measured', readOnly: true, groups };
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
      'Usage: node --env-file=<chosen cloud env file> scripts/measure-runtime-read-payload.mjs',
    );
    console.log(
      'Read-only PvP decoder and notification title SQL projections. Outputs aggregate measurements only.',
    );
  } else {
    measureRuntimeReads(process.env.DATABASE_URL)
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
