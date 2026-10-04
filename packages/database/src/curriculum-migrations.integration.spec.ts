import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)('curriculum upgrade after frozen measurement/dispatch schema', () => {
  it('backfills scoped slugs without losing IDs or guessing historical levels', async () => {
    const url = new URL(testUrl!);
    if (process.env.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost'].includes(url.hostname))
      throw new Error('Isolated local test PostgreSQL required');
    const suffix = randomUUID().replaceAll('-', '');
    const database = `numora_test_curriculum_${suffix}`;
    const folder = join(tmpdir(), `numora-test-curriculum-${suffix}`);
    const admin = postgres(testUrl!, { max: 1, onnotice: () => {} });
    url.pathname = '/' + database;
    const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
    try {
      await admin.unsafe(`CREATE DATABASE "${database}"`);
      const journal = JSON.parse(await readFile(resolve('drizzle/meta/_journal.json'), 'utf8')) as {
        entries: { tag: string }[];
      };
      const entries = journal.entries.slice(0, 19);
      expect(entries.at(-1)?.tag).toBe('0018_mysterious_maelstrom');
      await mkdir(join(folder, 'meta'), { recursive: true });
      await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
      for (const entry of entries)
        await copyFile(resolve('drizzle', entry.tag + '.sql'), join(folder, entry.tag + '.sql'));
      await migrate(drizzle(client), { migrationsFolder: folder });
      const chapters = await client<{ id: string }[]>`INSERT INTO chapters(code,name,display_order)
        VALUES('TEST-A','Bilangan!',1),('TEST-B','Bilangan?',2),('TEST-C','中文',3) RETURNING id`;
      const [first, second] = chapters;
      const subs = await client<
        { id: string; chapter_id: string }[]
      >`INSERT INTO subchapters(chapter_id,code,name,display_order)
        VALUES(${first!.id},'TEST-A','Pecahan!',1),(${first!.id},'TEST-B','Pecahan?',2),(${second!.id},'TEST-A','Pecahan!',1) RETURNING id,chapter_id`;
      const [competency] =
        await client`INSERT INTO competencies(subchapter_id,code,description) VALUES(${subs[0]!.id},'TEST-I','TEST ONLY') RETURNING id`;
      const [question] =
        await client`INSERT INTO questions(primary_competency_id) VALUES(${competency!.id}) RETURNING id`;
      const history =
        await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
      await migrate(drizzle(client), { migrationsFolder: resolve('drizzle') });
      const result = await client<
        { id: string; slug: string }[]
      >`SELECT id,slug FROM chapters ORDER BY display_order`;
      expect(result.map((r) => r.id)).toEqual(chapters.map((r) => r.id));
      expect(result[0]!.slug).toBe('bilangan-' + first!.id);
      expect(result[1]!.slug).toBe('bilangan-' + second!.id);
      expect(result[2]!.slug).toBe('chapter');
      const scoped = await client<
        { id: string; slug: string }[]
      >`SELECT id,slug FROM subchapters ORDER BY id`;
      expect(scoped.find((s) => s.id === subs[0]!.id)!.slug).toBe('pecahan-' + subs[0]!.id);
      expect(scoped.find((s) => s.id === subs[1]!.id)!.slug).toBe('pecahan-' + subs[1]!.id);
      expect(scoped.find((s) => s.id === subs[2]!.id)!.slug).toBe('pecahan');
      await client`UPDATE chapters SET name='TEST renamed' WHERE id=${first!.id}`;
      expect((await client`SELECT slug FROM chapters WHERE id=${first!.id}`)[0]!.slug).toBe(
        result[0]!.slug,
      );
      expect(
        (await client`SELECT curriculum_level_number FROM questions WHERE id=${question!.id}`)[0]!
          .curriculum_level_number,
      ).toBeNull();
      await expect(
        client`UPDATE questions SET curriculum_level_number=0 WHERE id=${question!.id}`,
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        client`INSERT INTO chapters(code,slug,name,display_order) VALUES('TEST-X','Bad Slug','TEST',4)`,
      ).rejects.toMatchObject({ code: '23514' });
      expect(
        (await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`).slice(
          0,
          history.length,
        ),
      ).toEqual(history);
      expect(
        (await client`SELECT to_regclass('public.analysis_request_dispatches') AS dispatch`)[0]!
          .dispatch,
      ).toBe('analysis_request_dispatches');
      await migrate(drizzle(client), { migrationsFolder: resolve('drizzle') });
      expect(await client`SELECT id FROM chapters`).toHaveLength(3);
    } finally {
      await client.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await admin.end();
      if (
        dirname(resolve(folder)) !== resolve(tmpdir()) ||
        !basename(folder).startsWith('numora-test-curriculum-')
      )
        throw new Error('Unexpected test fixture directory');
      await rm(folder, { recursive: true, force: true });
    }
  }, 120000);
});
