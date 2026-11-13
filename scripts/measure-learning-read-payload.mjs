// Compare the changed SQL groups, not complete HTTP requests or billed Supabase Usage.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, createServer } from 'node:net';
const load = createRequire(new URL('../packages/database/package.json', import.meta.url));
const postgres = load('postgres');

export async function measureLearningReads(url) {
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
      connection: { application_name: 'numora_learning_payload_read_audit' },
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
      const [attempt] =
        await tx`select id from assessment_attempts where assessment_type='PRETEST' and status in ('GRADED','SUBMITTED') order by finished_at desc,id desc limit 1`;
      if (attempt) {
        const [size] =
          await tx`select coalesce(sum(octet_length(to_jsonb(i)::text)+octet_length(to_jsonb(v)::text)+coalesce(octet_length(to_jsonb(a)::text),0)),0)::bigint as estimate from attempt_items i join question_versions v on v.id=i.question_version_id left join attempt_answers a on a.attempt_item_id=i.id where i.attempt_id=${attempt.id}`;
        if (Number(size.estimate) <= 512 * 1024) {
          const before = await measured(
            'before',
            1,
            () =>
              tx`select i.*,v.*,a.answer,a.revision from attempt_items i join question_versions v on v.id=i.question_version_id left join attempt_answers a on a.attempt_item_id=i.id where i.attempt_id=${attempt.id} order by i.display_order`,
          );
          const after = await measured(
            'after',
            1,
            () => tx`select count(*)::int as n from attempt_items where attempt_id=${attempt.id}`,
          );
          if (before.value.length !== after.value[0].n)
            throw Object.assign(new Error(), { code: 'PRETEST_COUNT_MISMATCH' });
          groups.push({
            group: 'pretest_result_item_count',
            status: 'measured',
            items: before.value.length,
            equivalent: true,
            measurements: [before.metrics, after.metrics],
          });
        } else
          groups.push({
            group: 'pretest_result_item_count',
            status: 'sample_over_transfer_budget',
          });
      } else groups.push({ group: 'pretest_result_item_count', status: 'no_terminal_pretest' });

      const [student] =
        await tx`select id from users where role='STUDENT' and status='ACTIVE' order by id limit 1`;
      if (student) {
        const [size] =
          await tx`select (select count(*) from levels l join subchapters s on s.id=l.subchapter_id join chapters c on c.id=s.chapter_id where l.status='READY' and s.status='READY' and c.status='READY')+(select count(*) from level_progress where student_id=${student.id} and completed_at is not null) as rows`;
        if (Number(size.rows) * 64 <= 512 * 1024) {
          const before = await measured('before', 2, async () => {
            const published =
              await tx`select l.id from levels l join subchapters s on s.id=l.subchapter_id join chapters c on c.id=s.chapter_id where l.status='READY' and s.status='READY' and c.status='READY'`;
            const done =
              await tx`select level_id from level_progress where student_id=${student.id} and completed_at is not null`;
            const visible = new Set(published.map((row) => row.id));
            return {
              totalLevels: published.length,
              completedLevels: done.filter((row) => visible.has(row.level_id)).length,
            };
          });
          const after = await measured('after', 1, async () => {
            const [counts] =
              await tx`select count(*)::int as total, count(p.completed_at)::int as completed from levels l join subchapters s on s.id=l.subchapter_id join chapters c on c.id=s.chapter_id left join level_progress p on p.level_id=l.id and p.student_id=${student.id} where l.status='READY' and s.status='READY' and c.status='READY'`;
            return { totalLevels: counts.total, completedLevels: counts.completed };
          });
          if (JSON.stringify(before.value) !== JSON.stringify(after.value))
            throw Object.assign(new Error(), { code: 'PROGRESS_COUNT_MISMATCH' });
          groups.push({
            group: 'progress_counts',
            status: 'measured',
            totalLevels: after.value.totalLevels,
            completedLevels: after.value.completedLevels,
            equivalent: true,
            measurements: [before.metrics, after.metrics],
          });
        } else groups.push({ group: 'progress_counts', status: 'sample_over_transfer_budget' });
      } else groups.push({ group: 'progress_counts', status: 'no_student' });
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
      'Usage: node --env-file=<chosen cloud env file> scripts/measure-learning-read-payload.mjs',
    );
    console.log(
      'Read-only Pretest item count and student progress query groups. Outputs aggregate measurements only.',
    );
  } else {
    measureLearningReads(process.env.DATABASE_URL)
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
