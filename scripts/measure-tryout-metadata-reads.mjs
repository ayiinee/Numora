// Measures changed SQL groups only. Never invoke TryoutService.packages on cloud:
// that read path may automatically finalize attempts and therefore write data.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, createServer } from 'node:net';
const load = createRequire(new URL('../packages/database/package.json', import.meta.url));
const postgres = load('postgres');

export async function measureTryoutMetadataReads(url) {
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
      connection: { application_name: 'numora_tryout_metadata_read_audit' },
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
      const equal = (before, after, code) => {
        if (JSON.stringify(before) !== JSON.stringify(after))
          throw Object.assign(new Error(), { code });
      };
      // Candidate sample, not the API visibility/routing query. No student identity is logged.
      const [student] =
        await tx`select student_id from assessment_attempts where assessment_type='TRYOUT' group by student_id order by count(*) desc,student_id limit 1`;
      if (student) {
        const packs =
          await tx`select p.id from assessment_packages p where p.assessment_type='TRYOUT' and p.purpose='REGULAR' and p.status in ('PUBLISHED','CLOSED','ARCHIVED') and p.release_at<=now() order by p.release_at desc,p.id desc limit 20`;
        const ids = packs.map((pack) => pack.id);
        if (ids.length) {
          const [size] =
            await tx`select coalesce(sum(octet_length(to_jsonb(a)::text)),0)::bigint as estimate from assessment_packages p join lateral (select * from assessment_attempts a where a.student_id=${student.student_id} and a.package_id=p.id and a.assessment_type='TRYOUT' limit 1) a on true where p.id in ${tx(ids)}`;
          if (Number(size.estimate) <= 512 * 1024) {
            const before = await measured('before', ids.length * 2, async () => {
              const result = [];
              for (const id of ids) {
                const [attempt] =
                  await tx`select * from assessment_attempts where student_id=${student.student_id} and package_id=${id} and assessment_type='TRYOUT' limit 1`;
                const [items] =
                  await tx`select count(*)::integer as total from package_items where package_id=${id}`;
                result.push({
                  packageId: id,
                  attempt: attempt ? { id: attempt.id, status: attempt.status } : null,
                  total: items.total,
                });
              }
              return result;
            });
            const after = await measured('after', 2, async () => {
              const attempts =
                await tx`select a.id,a.package_id,a.status from assessment_packages p join lateral (select id,package_id,status from assessment_attempts a where a.student_id=${student.student_id} and a.package_id=p.id and a.assessment_type='TRYOUT' limit 1) a on true where p.id in ${tx(ids)}`;
              const items =
                await tx`select i.package_id,count(i.id)::integer as total,count(v.id)::integer as versions,count(*) filter(where v.content_status='READY')::integer as ready,count(*) filter(where v.question_type<>'SINGLE_CHOICE')::integer as non_single from package_items i left join question_versions v on v.id=i.question_version_id where i.package_id in ${tx(ids)} group by i.package_id`;
              const byPackage = new Map(attempts.map((a) => [a.package_id, a]));
              const counts = new Map(items.map((i) => [i.package_id, i.total]));
              return ids.map((id) => {
                const a = byPackage.get(id);
                return {
                  packageId: id,
                  attempt: a ? { id: a.id, status: a.status } : null,
                  total: counts.get(id) ?? 0,
                };
              });
            });
            equal(before.value, after.value, 'TRYOUT_METADATA_MISMATCH');
            groups.push({
              group: 'tryout_attempt_and_count',
              status: 'measured',
              packages: ids.length,
              attempts: before.value.filter((row) => row.attempt).length,
              equivalent: true,
              measurements: [before.metrics, after.metrics],
            });
          } else
            groups.push({
              group: 'tryout_attempt_and_count',
              status: 'sample_over_transfer_budget',
            });
        } else groups.push({ group: 'tryout_attempt_and_count', status: 'no_candidate_package' });
      } else groups.push({ group: 'tryout_attempt_and_count', status: 'no_tryout_student' });

      const [schoolClass] =
        await tx`select c.id from classes c join schools s on s.id=c.school_id where c.archived_at is null and s.status='ACTIVE' and exists(select 1 from teacher_school_memberships t where t.teacher_user_id=c.teacher_user_id and t.school_id=c.school_id and t.ended_at is null) and exists(select 1 from class_memberships m join users u on u.id=m.student_user_id where m.class_id=c.id and m.left_at is null and u.role='STUDENT') order by c.id limit 1`;
      if (schoolClass) {
        const [size] =
          await tx`select count(*)::integer as total,coalesce(sum(octet_length(u.id::text)+octet_length(u.display_name)+32),0)::bigint as estimate from class_memberships m join users u on u.id=m.student_user_id where m.class_id=${schoolClass.id} and m.left_at is null and u.role='STUDENT'`;
        if (Number(size.estimate) <= 512 * 1024) {
          const before = await measured(
            'before',
            1,
            () =>
              tx`select u.id,u.display_name from class_memberships m join users u on u.id=m.student_user_id where m.class_id=${schoolClass.id} and m.left_at is null and u.role='STUDENT' order by u.display_name,u.id`,
          );
          const targetId = before.value[0].id;
          const after = await measured(
            'after',
            1,
            () =>
              tx`select u.id,u.display_name from class_memberships m join users u on u.id=m.student_user_id where m.class_id=${schoolClass.id} and m.left_at is null and u.role='STUDENT' and m.student_user_id=${targetId} order by u.display_name,u.id`,
          );
          equal(
            before.value.filter((row) => row.id === targetId),
            after.value,
            'MONITORING_STUDENT_MISMATCH',
          );
          groups.push({
            group: 'monitoring_target_student',
            status: 'measured',
            roster: size.total,
            returned: after.value.length,
            equivalent: true,
            measurements: [before.metrics, after.metrics],
          });
        } else
          groups.push({
            group: 'monitoring_target_student',
            status: 'sample_over_transfer_budget',
          });
      } else groups.push({ group: 'monitoring_target_student', status: 'no_active_owned_class' });
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
      'Usage: node --env-file=<chosen cloud env file> scripts/measure-tryout-metadata-reads.mjs',
    );
    console.log(
      'Read-only candidate Tryout SQL groups and targeted roster lookup. Aggregate output only.',
    );
  } else {
    measureTryoutMetadataReads(process.env.DATABASE_URL)
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
