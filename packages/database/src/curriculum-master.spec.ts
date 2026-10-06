import { describe, expect, it } from 'vitest';
import {
  loadCurriculumMaster,
  planCurriculumMaster,
  validateCurriculumMaster,
  type ChapterRow,
  type SubchapterRow,
} from './curriculum-master.js';
import { curriculumCloudTarget } from './seed-curriculum.js';

describe('Curriculum chapter/subchapter seed', () => {
  it('uses the four source chapters and ten scoped subchapters, with stable sample codes', async () => {
    const master = await loadCurriculumMaster();
    expect(master.chapters.map((c) => c.code)).toEqual(['CH-BIL', 'CH-ALG', 'CH-GP', 'CH-DP']);
    expect(master.subchapters.map((s) => [s.chapterCode, s.code])).toEqual([
      ['CH-BIL', 'SC-BR'],
      ['CH-ALG', 'SC-PPL'],
      ['CH-ALG', 'SC-BA'],
      ['CH-ALG', 'SC-FUNGSI'],
      ['CH-ALG', 'SC-BD'],
      ['CH-GP', 'SC-OG'],
      ['CH-GP', 'SC-TG'],
      ['CH-GP', 'SC-PENG'],
      ['CH-DP', 'SC-DATA'],
      ['CH-DP', 'SC-PELUANG'],
    ]);
    expect(master.status).toBe('DRAFT');
    expect(master.source.tabTitle).toBe('Main Draft Soal');
  });
  it('rejects dangling parents, duplicate scoped slugs and implicit academic publication', async () => {
    const master = await loadCurriculumMaster();
    const dangling = structuredClone(master);
    dangling.subchapters[0]!.chapterCode = 'UNKNOWN';
    expect(() => validateCurriculumMaster(dangling)).toThrow();
    const duplicate = structuredClone(master);
    duplicate.subchapters[2]!.slug = duplicate.subchapters[1]!.slug;
    expect(() => validateCurriculumMaster(duplicate)).toThrow();
    expect(() =>
      validateCurriculumMaster({ ...master, status: 'READY' } as unknown as typeof master),
    ).toThrow();
  });
  it('appends after existing demo content without reassigning its display orders', async () => {
    const master = await loadCurriculumMaster();
    const existing: ChapterRow[] = [
      {
        id: 'demo',
        code: 'DEMO-BILANGAN',
        slug: 'demo-bilangan',
        name: 'Bab Demo: Bilangan',
        displayOrder: 9,
        status: 'READY',
      },
    ];
    const before = structuredClone(existing);
    const plan = planCurriculumMaster(master, existing, []);
    expect(plan.newChapters.map((c) => c.displayOrder)).toEqual([10, 11, 12, 13]);
    expect(plan.conflicts).toEqual([]);
    expect(existing).toEqual(before);
  });
  it('reuses a scoped identity and preserves existing UUID, status and order on replay', async () => {
    const master = await loadCurriculumMaster();
    const chapters: ChapterRow[] = master.chapters.map((c) => ({
      id: c.code,
      code: c.code,
      slug: c.slug,
      name: c.name,
      displayOrder: c.sourceOrder + 20,
      status: 'READY',
    }));
    const subs: SubchapterRow[] = master.subchapters.map((s) => ({
      id: s.code,
      chapterCode: s.chapterCode,
      code: s.code,
      slug: s.slug,
      name: s.name,
      displayOrder: s.sourceOrder + 10,
      status: 'DRAFT',
    }));
    const before = structuredClone({ chapters, subs });
    const plan = planCurriculumMaster(master, chapters, subs);
    expect(plan.newChapters).toEqual([]);
    expect(plan.newSubchapters).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect({ chapters, subs }).toEqual(before);
  });
  it('reports alternative codes sharing a slug, metadata drift, and archived identities', async () => {
    const master = await loadCurriculumMaster();
    const base: ChapterRow = {
      id: 'existing',
      code: 'LEGACY',
      slug: 'bilangan',
      name: 'Bilangan',
      displayOrder: 1,
      status: 'READY',
    };
    expect(planCurriculumMaster(master, [base], []).conflicts).toContain('CHAPTER_IDENTITY:CH-BIL');
    expect(
      planCurriculumMaster(master, [{ ...base, code: 'CH-BIL', slug: 'old' }], []).conflicts,
    ).toContain('CHAPTER_METADATA:CH-BIL');
    expect(
      planCurriculumMaster(master, [{ ...base, code: 'CH-BIL', status: 'ARCHIVED' }], []).conflicts,
    ).toContain('CHAPTER_METADATA:CH-BIL');
    const scoped: SubchapterRow = {
      ...base,
      code: 'LEGACY',
      slug: 'bilangan-real',
      name: 'Bilangan Real',
      chapterCode: 'CH-BIL',
    };
    expect(planCurriculumMaster(master, [], [scoped]).conflicts).toContain(
      'SUBCHAPTER_IDENTITY:CH-BIL:SC-BR',
    );
    // A matching slug under another chapter is legal, never the target subchapter.
    expect(
      planCurriculumMaster(master, [], [{ ...scoped, chapterCode: 'DEMO' }]).conflicts,
    ).toEqual([]);
  });
  it('requires matching project, session connection and TLS, without accepting lookalike hosts', () => {
    const ref = 'abcdefghijklmnopqrst';
    const env = {
      SUPABASE_PROJECT_REF: ref,
      DATABASE_MIGRATION_URL: `postgresql://postgres:TEST_ONLY@db.${ref}.supabase.co:5432/postgres?sslmode=require`,
    };
    expect(curriculumCloudTarget(env).ref).toBe(ref);
    expect(
      curriculumCloudTarget({
        ...env,
        DATABASE_MIGRATION_URL: `postgresql://postgres.${ref}:TEST_ONLY@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require`,
      }).ref,
    ).toBe(ref);
    for (const url of [
      env.DATABASE_MIGRATION_URL.replace(ref, 'zyxwvutsrqponmlkjihg'),
      env.DATABASE_MIGRATION_URL.replace(':5432/', ':6543/'),
      env.DATABASE_MIGRATION_URL.replace('sslmode=require', 'sslmode=disable'),
      env.DATABASE_MIGRATION_URL.replace('/postgres?', '/another?'),
      env.DATABASE_MIGRATION_URL.replace('.supabase.co:', '.supabase.co.example.com:'),
    ]) {
      expect(() => curriculumCloudTarget({ ...env, DATABASE_MIGRATION_URL: url })).toThrow();
    }
  });
});
