import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { describe, it, expect } from 'vitest';
import { migrateIntegratedDatabase } from './integrated-migrations.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PvP additive migration and durable uniqueness',
  { timeout: 120_000 },
  () => {
    it('upgrades/replays without rewriting archives and prevents cross-room participation at the database boundary', async () => {
      const target = new URL(process.env.TEST_DATABASE_URL!);
      if (process.env.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost'].includes(target.hostname))
        throw new Error('Local isolated database required');
      const admin = postgres(target.toString(), { max: 1, onnotice: () => {} });
      const name = `numora_job16_upgrade_${randomUUID().replaceAll('-', '')}`;
      target.pathname = `/${name}`;
      const client = postgres(target.toString(), { max: 1, onnotice: () => {} });
      const baseline = await mkdtemp(join(tmpdir(), 'numora-job16-baseline-'));
      try {
        await admin.unsafe(`create database "${name}"`);
        const folder = resolve('drizzle');
        const journal = JSON.parse(await readFile(join(folder, 'meta/_journal.json'), 'utf8'));
        const entries = journal.entries.slice(0, 29) as { tag: string }[];
        await mkdir(join(baseline, 'meta'));
        await writeFile(
          join(baseline, 'meta/_journal.json'),
          JSON.stringify({ ...journal, entries }),
        );
        for (const entry of entries)
          await copyFile(join(folder, `${entry.tag}.sql`), join(baseline, `${entry.tag}.sql`));
        await migrate(drizzle(client), { migrationsFolder: baseline });
        for (const role of ['anon', 'authenticated', 'service_role']) {
          await client.unsafe(
            `do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if; end $$`,
          );
          await client.unsafe(
            `alter default privileges in schema public grant all on tables to ${role}; alter default privileges in schema public grant execute on functions to ${role}`,
          );
        }
        const [student] =
          await client`insert into users(auth_user_id,role,display_name,email) values(${randomUUID()},'STUDENT','TEST upgrade','upgrade@example.test') returning id`;
        const [pack] =
          await client`insert into assessment_packages(family_code,package_version,name,assessment_type,is_demo) values(${randomUUID()},1,'TEST upgrade','PVP',true) returning id`;
        const [archive] =
          await client`insert into leaderboard_periods(starts_at,ends_at,status,archived_at) values('2026-09-02T17:00:00Z','2026-09-09T17:00:00Z','ARCHIVED',now()) returning id`;
        const [entry] =
          await client`insert into pvp_leaderboard_entries(period_id,student_id,difficulty,best_points,rank) values(${archive!.id},${student!.id},'easy',123.5,3) returning *`;
        const [waiting] =
          await client`insert into pvp_matches(room_code,creator_student_id,package_id,difficulty) values(${randomUUID()},${student!.id},${pack!.id},'easy') returning id`;
        await migrateIntegratedDatabase(client, folder);
        expect(
          (await client`select * from pvp_leaderboard_entries where id=${entry!.id}`)[0],
        ).toMatchObject({ ...entry, data_mode: 'legacy' });
        expect(
          (
            await client`select rank_policy_version from leaderboard_periods where id=${archive!.id}`
          )[0]!.rank_policy_version,
        ).toBe('legacy-competition-v0');
        expect(
          (await client`select status,end_reason from pvp_matches where id=${waiting!.id}`)[0],
        ).toEqual({ status: 'CANCELLED', end_reason: 'POLICY_UPGRADE' });
        const history = await client`select * from drizzle.__drizzle_migrations order by id`;
        await migrateIntegratedDatabase(client, folder);
        expect(await client`select * from drizzle.__drizzle_migrations order by id`).toEqual(
          history,
        );
        const rooms =
          await client`insert into pvp_matches(room_code,creator_student_id,package_id,difficulty,data_mode) values
        (${randomUUID()},${student!.id},${pack!.id},'easy','demo'),(${randomUUID()},${student!.id},${pack!.id},'easy','demo') returning id`;
        const [player] =
          await client`insert into pvp_players(match_id,student_id,player_slot) values(${rooms[0]!.id},${student!.id},1) returning id`;
        await expect(
          client`insert into pvp_players(match_id,student_id,player_slot) values(${rooms[1]!.id},${student!.id},1)`,
        ).rejects.toMatchObject({ code: '23505' });
        await client`update pvp_players set left_at=now() where id=${player!.id}`;
        await client`insert into pvp_players(match_id,student_id,player_slot) values(${rooms[1]!.id},${student!.id},1)`;
        expect(
          await client`select * from pvp_active_rooms where student_id=${student!.id}`,
        ).toHaveLength(1);
        await client`update pvp_matches set status='CANCELLED' where id=${rooms[1]!.id}`;
        expect(
          await client`select * from pvp_active_rooms where student_id=${student!.id}`,
        ).toHaveLength(0);
        const [permissions] =
          await client`select has_table_privilege('numora_main_runtime','pvp_active_rooms','SELECT') as main,exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid='pvp_active_rooms'::regclass and a.grantee=0 and a.privilege_type='SELECT') as browser`;
        expect(permissions).toEqual({ main: true, browser: false });
        for (const role of ['anon', 'authenticated', 'service_role']) {
          const [browser] =
            await client`select has_table_privilege(${role},'pvp_active_rooms','SELECT') as table_access,has_function_privilege(${role},'track_pvp_participation()','EXECUTE') as function_access`;
          expect(browser).toEqual({ table_access: false, function_access: false });
        }
      } finally {
        await client.end();
        await admin.unsafe(`drop database if exists "${name}" with (force)`);
        await admin.end();
        if (
          !resolve(baseline).startsWith(resolve(tmpdir()) + '\\') &&
          !resolve(baseline).startsWith(resolve(tmpdir()) + '/')
        )
          throw new Error('Invalid temporary cleanup target');
        await rm(baseline, { recursive: true, force: true });
      }
    });
  },
);
