import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  chapters,
  subchapters,
  competencies,
  questions,
  questionVariants,
  questionVersions,
  getDatabase,
  closeDatabaseConnection,
  users,
  contentImports,
  contentImportIdentities,
  contentImportVersions,
} from '@tka/database';
import { ContentService } from './content.service';
import { AssessmentPoliciesService } from './assessment-policies.service';
import { AssessmentReadinessService } from './assessment-readiness.service';

const context = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@tka/database', async (load) => {
  const actual = await load<typeof import('@tka/database')>();
  return { ...actual, getDatabase: () => (context.db ? { db: context.db } : actual.getDatabase()) };
});
const url =
  process.env.TEST_DATABASE_URL ??
  (process.env.ADMIN_CATALOG_SANDBOX_CHECK === 'true' ? process.env.DATABASE_URL : undefined);
if (!process.env.TEST_DATABASE_URL && url) {
  const target = new URL(url);
  const ref = 'pkamenfnwmoeisccnrnk';
  if (
    process.env.SUPABASE_URL !== `https://${ref}.supabase.co` ||
    !(
      target.hostname === `db.${ref}.supabase.co` ||
      (target.hostname.endsWith('.pooler.supabase.com') && target.username === `postgres.${ref}`)
    )
  ) {
    throw new Error('Catalog sandbox check requires the isolated Development project.');
  }
}
(url ? describe : describe.skip)('Admin compact demo catalog with PostgreSQL (rolled back)', () => {
  afterAll(async () => {
    context.db = null;
    await closeDatabaseConnection();
  });
  it('deduplicates fixtures before pagination, preserves differing payloads and real content, and leaves history intact', async () => {
    process.env.DATABASE_URL = url;
    const { db } = getDatabase();
    const service = new ContentService(
      {} as AssessmentPoliciesService,
      {} as AssessmentReadinessService,
    );
    const code = `TEST-${randomUUID()}`;
    const rollback = new Error('Intentional rollback of catalog test fixtures');
    try {
      await db.transaction(async (tx) => {
        context.db = tx;
        const [chapter] = await tx
          .insert(chapters)
          .values({ code, slug: code.toLowerCase(), name: code, displayOrder: 99999 })
          .returning();
        const [sub] = await tx
          .insert(subchapters)
          .values({
            chapterId: chapter!.id,
            code,
            slug: code.toLowerCase(),
            name: code,
            displayOrder: 1,
          })
          .returning();
        const [competency] = await tx
          .insert(competencies)
          .values({ subchapterId: sub!.id, code, description: code })
          .returning();
        async function insert(origin: string, stem: string, options: object[], n: number) {
          const [question] = await tx
            .insert(questions)
            .values({ primaryCompetencyId: competency!.id, sourceRef: code })
            .returning();
          const [variant] = await tx
            .insert(questionVariants)
            .values({
              questionId: question!.id,
              variantCode: `${code}-${n}`,
              kind: 'ORIGINAL',
              origin,
            })
            .returning();
          const [version] = await tx
            .insert(questionVersions)
            .values({
              variantId: variant!.id,
              versionNumber: 1,
              questionType: 'SINGLE_CHOICE',
              stem: { text: stem },
              optionsOrStatements: options,
              answerKey: { optionId: 'A' },
              explanation: { text: 'TEST ONLY' },
              difficulty: 'EASY',
              createdAt: new Date(Date.UTC(2099, 0, 1, 0, 0, n)),
            })
            .returning();
          return version!.id;
        }
        const options = [
          { id: 'A', content: { text: '2' } },
          { id: 'B', content: { text: '3' } },
        ];
        const demoIds: string[] = [];
        for (let i = 0; i < 12; i++)
          demoIds.push(await insert('DEMO', `${code}: demo ${i}`, options, i));
        const duplicateOld = await insert('DEMO', `${code}: 1+1`, options, 20);
        const duplicateNew = await insert('DEMO', `${code}: 1+1`, options, 21);
        const differing = await insert(
          'DEMO',
          `${code}: 1+1`,
          [...options, { id: 'C', content: { text: '4' } }],
          22,
        );
        const officialA = await insert('CURRICULUM', `${code}: official`, options, 23);
        const officialB = await insert('CURRICULUM', `${code}: official`, options, 24);
        const [actor] = await tx
          .insert(users)
          .values({
            authUserId: randomUUID(),
            role: 'ADMIN',
            adminRole: 'CONTENT_DATA_MODERATION',
            displayName: 'TEST ONLY catalog',
            email: `${code.toLowerCase()}@example.invalid`,
          })
          .returning();
        async function markImport(
          versionId: string,
          namespace: string,
          sourceName: string,
          sourceReference: string,
        ) {
          const [row] = await tx
            .select({ questionId: questionVariants.questionId })
            .from(questionVersions)
            .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
            .where(eq(questionVersions.id, versionId));
          const [operation] = await tx
            .insert(contentImports)
            .values({
              actorUserId: actor!.id,
              idempotencyKey: namespace,
              fingerprint: '0'.repeat(64),
              sourceNamespace: namespace,
              report: {},
            })
            .returning();
          const [identity] = await tx
            .insert(contentImportIdentities)
            .values({
              sourceNamespace: namespace,
              externalId: versionId,
              questionId: row!.questionId,
            })
            .returning();
          await tx.insert(contentImportVersions).values({
            questionVersionId: versionId,
            identityId: identity!.id,
            importId: operation!.id,
            contentHash: '0'.repeat(64),
            provenance: {
              packageSource: { sourceName, sourceReference, sourceNamespace: namespace },
            },
          });
        }
        const smoke = await insert('JSON_IMPORT_V2', `${code}: smoke`, options, 25);
        await markImport(
          smoke,
          `R2SMOKE-${code}`,
          'TEST ONLY — Excel R2 pipeline',
          'Synthetic QA smoke, not Curriculum content',
        );
        const legacySmoke = await insert('JSON_IMPORT_V2', `${code}: legacy smoke`, options, 26);
        await markImport(
          legacySmoke,
          `UPLOAD_${randomUUID().replaceAll('-', '')}`,
          'TEST_ONLY_V5.xlsx',
          'Upload test',
        );
        const officialUpload = await insert(
          'JSON_IMPORT_V2',
          `${code}: official upload`,
          options,
          27,
        );
        await markImport(
          officialUpload,
          `UPLOAD_${randomUUID().replaceAll('-', '')}`,
          'approved-bank.xlsx',
          'Curriculum',
        );
        const first = await service.versions({ limit: 5, offset: 0, catalog: 'COMPACT_DEMO' });
        expect(first.items).toHaveLength(5);
        expect(first.nextOffset).toBe(5);
        const compact = await service.versions({ limit: 100, offset: 0, catalog: 'COMPACT_DEMO' });
        const ids = compact.items.map((r) => r.id);
        expect(ids).toEqual(
          expect.arrayContaining([duplicateNew, differing, officialA, officialB, officialUpload]),
        );
        expect(ids).not.toContain(duplicateOld);
        expect(ids).not.toContain(smoke);
        expect(ids).not.toContain(legacySmoke);
        expect(
          ids.filter((id) => [...demoIds, duplicateNew, differing].includes(id)).length,
        ).toBeLessThanOrEqual(10);
        const all = await service.versions({ limit: 100, offset: 0 });
        expect(all.items.map((r) => r.id)).toEqual(
          expect.arrayContaining([
            duplicateOld,
            duplicateNew,
            differing,
            officialA,
            officialB,
            officialUpload,
            smoke,
            legacySmoke,
            ...demoIds,
          ]),
        );
        const second = await service.versions({ limit: 5, offset: 5, catalog: 'COMPACT_DEMO' });
        expect(second.items.some((r) => first.items.some((a) => a.id === r.id))).toBe(false);
        const end = await service.versions({
          limit: 5,
          offset: compact.items.length - 5,
          catalog: 'COMPACT_DEMO',
        });
        expect(end.items).toHaveLength(5);
        expect(end.nextOffset).toBeNull();
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      context.db = null;
    }
  }, 30000);
});
