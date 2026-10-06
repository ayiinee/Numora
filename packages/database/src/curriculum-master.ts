import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type postgres from 'postgres';

export interface MasterChapter {
  code: string;
  slug: string;
  name: string;
  materialCategory: 'numbers' | 'algebra' | 'geometry' | 'statistics';
  sourceOrder: number;
  sourceTableRow: number;
}
export interface MasterSubchapter {
  chapterCode: string;
  code: string;
  slug: string;
  name: string;
  sourceOrder: number;
  sourceTableRow: number;
}
export interface CurriculumMaster {
  schemaVersion: 1;
  status: 'DRAFT';
  source: {
    documentId: string;
    title: string;
    revisionId: string;
    url: string;
    tabId: string;
    tabTitle: string;
    extractedAt: string;
    prdVersion: string;
  };
  chapters: MasterChapter[];
  subchapters: MasterSubchapter[];
}
export interface ChapterRow {
  id: string;
  code: string;
  slug: string;
  name: string;
  displayOrder: number;
  status: string;
}
export interface SubchapterRow extends ChapterRow {
  chapterCode: string;
}
export interface CurriculumSession {
  query<T extends object>(statement: string, values?: string[]): Promise<T[]>;
}
export interface CurriculumDatabase extends CurriculumSession {
  transaction<T>(work: (tx: CurriculumSession) => Promise<T>): Promise<T>;
}

const key = (chapter: string, value: string) => `${chapter}:${value}`;
const normalizedName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const codePattern = /^[A-Za-z0-9_-]{1,128}$/;

export class CurriculumConflict extends Error {
  constructor(public readonly conflicts: string[]) {
    super(`Curriculum master conflicts: ${conflicts.join(', ')}`);
  }
}

export function validateCurriculumMaster(master: CurriculumMaster) {
  if (
    master?.schemaVersion !== 1 ||
    master.status !== 'DRAFT' ||
    !master.source?.documentId ||
    !master.source.revisionId ||
    master.source.url !== `https://docs.google.com/document/d/${master.source.documentId}/edit` ||
    !Array.isArray(master.chapters) ||
    !Array.isArray(master.subchapters) ||
    !master.chapters.length ||
    !master.subchapters.length
  )
    throw new Error('Invalid curriculum master manifest or source provenance.');
  const codes = new Set<string>(),
    slugs = new Set<string>(),
    orders = new Set<number>();
  for (const c of master.chapters) {
    if (
      typeof c.code !== 'string' ||
      typeof c.slug !== 'string' ||
      typeof c.name !== 'string' ||
      !codePattern.test(c.code) ||
      !slugPattern.test(c.slug) ||
      !c.name.trim() ||
      !['numbers', 'algebra', 'geometry', 'statistics'].includes(c.materialCategory) ||
      !Number.isInteger(c.sourceOrder) ||
      c.sourceOrder < 1 ||
      !Number.isInteger(c.sourceTableRow) ||
      c.sourceTableRow < 1 ||
      codes.has(c.code) ||
      slugs.has(c.slug) ||
      orders.has(c.sourceOrder)
    )
      throw new Error('Invalid or duplicate chapter identity/order.');
    codes.add(c.code);
    slugs.add(c.slug);
    orders.add(c.sourceOrder);
  }
  const subCodes = new Set<string>(),
    subSlugs = new Set<string>(),
    subOrders = new Set<string>();
  for (const s of master.subchapters) {
    if (
      typeof s.code !== 'string' ||
      typeof s.slug !== 'string' ||
      typeof s.name !== 'string' ||
      !codes.has(s.chapterCode) ||
      !codePattern.test(s.code) ||
      !slugPattern.test(s.slug) ||
      !s.name?.trim() ||
      !Number.isInteger(s.sourceOrder) ||
      s.sourceOrder < 1 ||
      !Number.isInteger(s.sourceTableRow) ||
      s.sourceTableRow < 1 ||
      subCodes.has(key(s.chapterCode, s.code)) ||
      subSlugs.has(key(s.chapterCode, s.slug)) ||
      subOrders.has(key(s.chapterCode, String(s.sourceOrder)))
    )
      throw new Error('Invalid or duplicate subchapter identity/order/parent.');
    subCodes.add(key(s.chapterCode, s.code));
    subSlugs.add(key(s.chapterCode, s.slug));
    subOrders.add(key(s.chapterCode, String(s.sourceOrder)));
  }
}

export async function loadCurriculumMaster() {
  const source = resolve(__dirname, '../seeds/curriculum-master.json');
  const master = JSON.parse(await readFile(source, 'utf8')) as CurriculumMaster;
  validateCurriculumMaster(master);
  return master;
}

// Preserve every existing ID, display order and status. A drift is a review item, never an upsert.
export function planCurriculumMaster(
  master: CurriculumMaster,
  chapters: ChapterRow[],
  subchapters: SubchapterRow[],
) {
  validateCurriculumMaster(master);
  const conflicts: string[] = [];
  const newChapters: (MasterChapter & { displayOrder: number })[] = [];
  const newSubchapters: (MasterSubchapter & { displayOrder: number })[] = [];
  let chapterOrder = Math.max(0, ...chapters.map((c) => c.displayOrder));
  for (const c of [...master.chapters].sort((a, b) => a.sourceOrder - b.sourceOrder)) {
    const existing = chapters.find((row) => row.code === c.code);
    if (existing) {
      if (
        existing.slug !== c.slug ||
        normalizedName(existing.name) !== normalizedName(c.name) ||
        existing.status === 'ARCHIVED'
      )
        conflicts.push(`CHAPTER_METADATA:${c.code}`);
    } else if (
      chapters.some(
        (row) => row.slug === c.slug || normalizedName(row.name) === normalizedName(c.name),
      )
    ) {
      conflicts.push(`CHAPTER_IDENTITY:${c.code}`);
    } else newChapters.push({ ...c, displayOrder: ++chapterOrder });
  }
  const nextOrder = new Map<string, number>();
  for (const c of master.chapters) {
    nextOrder.set(
      c.code,
      Math.max(
        0,
        ...subchapters.filter((s) => s.chapterCode === c.code).map((s) => s.displayOrder),
      ),
    );
  }
  for (const s of [...master.subchapters].sort((a, b) => a.sourceOrder - b.sourceOrder)) {
    const scoped = subchapters.filter((row) => row.chapterCode === s.chapterCode);
    const existing = scoped.find((row) => row.code === s.code);
    if (existing) {
      if (
        existing.slug !== s.slug ||
        normalizedName(existing.name) !== normalizedName(s.name) ||
        existing.status === 'ARCHIVED'
      )
        conflicts.push(`SUBCHAPTER_METADATA:${key(s.chapterCode, s.code)}`);
    } else if (
      scoped.some(
        (row) => row.slug === s.slug || normalizedName(row.name) === normalizedName(s.name),
      )
    ) {
      conflicts.push(`SUBCHAPTER_IDENTITY:${key(s.chapterCode, s.code)}`);
    } else {
      const order = nextOrder.get(s.chapterCode)! + 1;
      newSubchapters.push({ ...s, displayOrder: order });
      nextOrder.set(s.chapterCode, order);
    }
  }
  return {
    newChapters,
    newSubchapters,
    conflicts,
    existingChapters: master.chapters.filter((c) => chapters.some((row) => row.code === c.code))
      .length,
    existingSubchapters: master.subchapters.filter((s) =>
      subchapters.some((row) => row.chapterCode === s.chapterCode && row.code === s.code),
    ).length,
  };
}

export async function readCurriculumPlan(tx: CurriculumSession, master: CurriculumMaster) {
  const chapters =
    await tx.query<ChapterRow>(`SELECT id,code,slug,name,display_order AS "displayOrder",status
    FROM public.chapters ORDER BY display_order`);
  const subchapters = await tx.query<SubchapterRow>(`SELECT s.id,s.code,s.slug,s.name,
    s.display_order AS "displayOrder",s.status,c.code AS "chapterCode"
    FROM public.subchapters s JOIN public.chapters c ON c.id=s.chapter_id
    ORDER BY c.display_order,s.display_order`);
  return planCurriculumMaster(master, chapters, subchapters);
}

export async function seedCurriculumMaster(db: CurriculumDatabase, master: CurriculumMaster) {
  validateCurriculumMaster(master);
  return db.transaction(async (tx) => {
    await tx.query("SET LOCAL lock_timeout='5s'");
    await tx.query("SET LOCAL statement_timeout='30s'");
    // Both tables allocate display_order. Serialize all writers, not just this seed's callers.
    await tx.query('LOCK TABLE public.chapters, public.subchapters IN SHARE ROW EXCLUSIVE MODE');
    const plan = await readCurriculumPlan(tx, master);
    if (plan.conflicts.length) throw new CurriculumConflict(plan.conflicts);
    // Bind serialized JSON as text so the driver's JSON codec cannot encode it a second time.
    if (plan.newChapters.length)
      await tx.query(
        `INSERT INTO public.chapters
      (code,slug,name,material_category,display_order,status)
      SELECT code,slug,name,"materialCategory","displayOrder",'DRAFT'
      FROM jsonb_to_recordset($1::text::jsonb) AS seed(code text,slug text,name text,
        "materialCategory" text,"displayOrder" integer)`,
        [JSON.stringify(plan.newChapters)],
      );
    if (plan.newSubchapters.length)
      await tx.query(
        `INSERT INTO public.subchapters
      (chapter_id,code,slug,name,display_order,status)
      SELECT c.id,s.code,s.slug,s.name,s."displayOrder",'DRAFT'
      FROM jsonb_to_recordset($1::text::jsonb) AS s("chapterCode" text,code text,slug text,name text,"displayOrder" integer)
      JOIN public.chapters c ON c.code=s."chapterCode"`,
        [JSON.stringify(plan.newSubchapters)],
      );
    const verified = await readCurriculumPlan(tx, master);
    if (verified.conflicts.length || verified.newChapters.length || verified.newSubchapters.length)
      throw new Error('Curriculum seed verification failed before commit.');
    return {
      createdChapters: plan.newChapters.length,
      createdSubchapters: plan.newSubchapters.length,
      verifiedChapters: master.chapters.length,
      verifiedSubchapters: master.subchapters.length,
    };
  });
}

export function postgresCurriculumDatabase(client: postgres.Sql): CurriculumDatabase {
  const session = (sql: postgres.Sql | postgres.TransactionSql): CurriculumSession => ({
    query: async <T extends object>(statement: string, values: string[] = []) => [
      ...(await sql.unsafe<T[]>(statement, values)),
    ],
  });
  return {
    ...session(client),
    transaction: async (work) => {
      const result = await client.begin(async (tx) => ({ value: await work(session(tx)) }));
      return result.value;
    },
  };
}
