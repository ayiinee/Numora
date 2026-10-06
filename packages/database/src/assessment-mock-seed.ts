import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDatabase } from './client.js';
import {
  buildAssessmentMockBank,
  type MockQuestion,
  type MockTopic,
} from './assessment-mock-questions.js';
import {
  assessmentPackages,
  chapters,
  competencies,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
  scoringPolicyVersions,
  subchapters,
  users,
} from './schema/index.js';
import { tryoutBatchCloseAt } from './tryout-visibility.js';

export const assessmentMockNamespace = 'NUMORA-ASSESSMENT-MOCK-V1';
export const assessmentMockChapters: Record<string, MockTopic> = {
  'DEMO-BILANGAN': 'numbers',
  'DEMO-UI-ALJABAR': 'algebra',
  'DEMO-TEACHER-GEOMETRI': 'geometry',
  'DEMO-TEACHER-STATISTIKA': 'statistics',
};
export function mockId(label: string) {
  const bytes = createHash('sha256')
    .update(`${assessmentMockNamespace}:${label}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function assertAssessmentMockTarget(env: NodeJS.ProcessEnv = process.env) {
  if (env.ALLOW_DEMO_SEED !== 'true') throw new Error('Explicit ALLOW_DEMO_SEED=true is required.');
  const target = new URL(env.DATABASE_URL ?? '');
  if (env.NODE_ENV === 'test' && ['localhost', '127.0.0.1'].includes(target.hostname)) return;
  const ref = 'pkamenfnwmoeisccnrnk';
  if (
    env.NODE_ENV !== 'development' ||
    new URL(env.SUPABASE_URL ?? '').hostname !== `${ref}.supabase.co` ||
    target.pathname !== '/postgres' ||
    !['require', 'verify-full'].includes(target.searchParams.get('sslmode') ?? '') ||
    !(
      (target.hostname === `db.${ref}.supabase.co` &&
        decodeURIComponent(target.username) === 'postgres') ||
      (target.hostname.endsWith('.pooler.supabase.com') &&
        target.port === '5432' &&
        decodeURIComponent(target.username) === `postgres.${ref}`)
    )
  )
    throw new Error(
      'Only the designated development sandbox or isolated localhost test database is allowed.',
    );
}
export function mockWeekRelease(now: Date) {
  const local = new Date(now.getTime() + 7 * 3600 * 1000);
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - 7 * 3600 * 1000);
}
function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
/** Existing immutable rows must match; never repair drift by overwriting history. */
function assertRows(
  expected: { id: string; [key: string]: unknown }[],
  actual: { id: string; [key: string]: unknown }[],
) {
  if (actual.length !== expected.length) throw new Error('Incomplete mock seed rows.');
  const byId = new Map(actual.map((row) => [row.id, row]));
  for (const row of expected) {
    const stored = byId.get(row.id);
    if (
      !stored ||
      Object.entries(row).some(([key, value]) => canonical(stored[key]) !== canonical(value))
    )
      throw new Error(
        'Mock fixture drift detected; bump fixture version instead of overwriting existing rows.',
      );
  }
}
export async function seedAssessmentMocks() {
  assertAssessmentMockTarget();
  const { db } = getDatabase();
  const bank = buildAssessmentMockBank();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${assessmentMockNamespace}))`);
    const [clock] = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
    const now = new Date(clock!.now);
    const releaseAt = mockWeekRelease(now);
    const closeAt = tryoutBatchCloseAt(releaseAt);
    const tryoutId = mockId(`tryout:${releaseAt.toISOString()}`);
    const [otherWeekly] = await tx
      .select({ id: assessmentPackages.id })
      .from(assessmentPackages)
      .where(
        and(
          eq(assessmentPackages.assessmentType, 'TRYOUT'),
          eq(assessmentPackages.status, 'PUBLISHED'),
          eq(assessmentPackages.releaseAt, releaseAt),
        ),
      );
    if (otherWeekly && otherWeekly.id !== tryoutId)
      throw new Error('This week already has a published Tryout; the seed will not replace it.');
    if (now >= closeAt)
      throw new Error('The current batch has closed; seed again after Monday release.');
    const [reviewer] = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.role, 'ADMIN'),
          eq(users.status, 'ACTIVE'),
          inArray(users.adminRole, ['SUPER_ADMIN', 'CONTENT_DATA_MODERATION']),
        ),
      )
      .orderBy(users.id)
      .limit(1);
    if (!reviewer)
      throw new Error(
        'An existing active content-capable Admin is required; this seed creates no accounts.',
      );
    const taxonomy = await tx
      .select({ id: chapters.id, code: chapters.code, competencyId: competencies.id })
      .from(chapters)
      .innerJoin(subchapters, eq(subchapters.chapterId, chapters.id))
      .innerJoin(competencies, eq(competencies.subchapterId, subchapters.id))
      .where(
        and(
          inArray(chapters.code, Object.keys(assessmentMockChapters)),
          eq(chapters.status, 'READY'),
          eq(subchapters.status, 'READY'),
          eq(competencies.status, 'READY'),
        ),
      )
      .orderBy(subchapters.displayOrder, competencies.code);
    const topicChapter = new Map<MockTopic, (typeof taxonomy)[number]>();
    for (const row of taxonomy) {
      const topic = assessmentMockChapters[row.code]!;
      if (!topicChapter.has(topic)) topicChapter.set(topic, row);
    }
    if (topicChapter.size !== 4)
      throw new Error('The four existing READY DEMO chapters/competencies are required.');
    const [tryoutPolicy] = await tx
      .select()
      .from(scoringPolicyVersions)
      .where(
        and(
          eq(scoringPolicyVersions.policyCode, 'TRYOUT_PRD_V06'),
          eq(scoringPolicyVersions.version, 1),
          eq(scoringPolicyVersions.status, 'PUBLISHED'),
        ),
      );
    if (!tryoutPolicy) throw new Error('Apply the normal migrations before seeding.');
    const policy = {
      id: mockId('pretest-policy'),
      policyCode: `${assessmentMockNamespace}-PRETEST`,
      version: 1,
      configuration: {
        testOnly: true,
        questionCount: 20,
        placement: 'PRD_V06_SYNTHETIC_CHAPTER',
        approvedCurriculum: false,
      },
      status: 'PUBLISHED' as const,
    };
    await tx.insert(scoringPolicyVersions).values(policy).onConflictDoNothing();
    assertRows(
      [policy],
      await tx.select().from(scoringPolicyVersions).where(eq(scoringPolicyVersions.id, policy.id)),
    );
    const packageRows = [...topicChapter.entries()].map(([topic, row]) => ({
      id: mockId(`pretest:${topic}`),
      familyCode: `${assessmentMockNamespace}-PRETEST-${topic}`,
      packageVersion: 1,
      name: `DEMO Mock Pretest · ${row.code} · 20 soal`,
      assessmentType: 'PRETEST' as const,
      chapterId: row.id,
      isDemo: true,
      scoringPolicyVersionId: policy.id,
      status: 'PUBLISHED' as const,
    }));
    const tryoutPackage = {
      id: tryoutId,
      familyCode: `${assessmentMockNamespace}-TRYOUT-${releaseAt.toISOString().slice(0, 10)}`,
      packageVersion: 1,
      name: `DEMO Mock Tryout · ${new Date(releaseAt.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10)} · 30 soal`,
      assessmentType: 'TRYOUT' as const,
      isDemo: true,
      scoringPolicyVersionId: tryoutPolicy.id,
      durationSeconds: 600,
      releaseAt,
      closeAt,
      status: 'PUBLISHED' as const,
    };
    await tx
      .insert(assessmentPackages)
      .values([...packageRows, tryoutPackage])
      .onConflictDoNothing();
    const packages = await tx
      .select()
      .from(assessmentPackages)
      .where(inArray(assessmentPackages.id, [...packageRows.map((p) => p.id), tryoutId]));
    assertRows(
      packageRows,
      packages.filter((p) => p.assessmentType === 'PRETEST'),
    );
    assertRows(
      [tryoutPackage],
      packages.filter((p) => p.id === tryoutId),
    );
    const entries: { question: MockQuestion; packageId: string; order: number }[] = [
      ...topicChapter.keys(),
    ].flatMap((topic) =>
      bank.pretest[topic].map((question, i) => ({
        question,
        packageId: mockId(`pretest:${topic}`),
        order: i + 1,
      })),
    );
    entries.push(
      ...bank.tryout.map((question, i) => ({ question, packageId: tryoutId, order: i + 1 })),
    );
    const qRows = entries.map(({ question: q }) => ({
      id: mockId(`question:${q.code}`),
      primaryCompetencyId: topicChapter.get(q.topic)!.competencyId,
      sourceRef: `${assessmentMockNamespace}:${q.code}`,
      status: 'READY' as const,
    }));
    const variantRows = entries.map(({ question: q }) => ({
      id: mockId(`variant:${q.code}`),
      questionId: mockId(`question:${q.code}`),
      variantCode: `${assessmentMockNamespace}:${q.code}`,
      kind: 'ORIGINAL' as const,
      origin: 'DEMO_QA_NOT_CURRICULUM_APPROVED',
    }));
    const versionRows = entries.map(({ question: q }) => ({
      id: mockId(`version:${q.code}`),
      variantId: mockId(`variant:${q.code}`),
      versionNumber: 1,
      questionType: q.questionType,
      stem: q.stem,
      optionsOrStatements: q.optionsOrStatements,
      answerKey: q.answerKey,
      explanation: q.explanation,
      difficulty: 'DEMO_EASY',
      contentStatus: 'READY' as const,
    }));
    await tx.insert(questions).values(qRows).onConflictDoNothing();
    await tx.insert(questionVariants).values(variantRows).onConflictDoNothing();
    await tx
      .insert(questionVersions)
      .values(versionRows.map((q) => ({ ...q, reviewedByUserId: reviewer.id, reviewedAt: now })))
      .onConflictDoNothing();
    assertRows(
      qRows,
      await tx
        .select()
        .from(questions)
        .where(
          inArray(
            questions.id,
            qRows.map((q) => q.id),
          ),
        ),
    );
    assertRows(
      variantRows,
      await tx
        .select()
        .from(questionVariants)
        .where(
          inArray(
            questionVariants.id,
            variantRows.map((q) => q.id),
          ),
        ),
    );
    const versions = await tx
      .select()
      .from(questionVersions)
      .where(
        inArray(
          questionVersions.id,
          versionRows.map((q) => q.id),
        ),
      );
    assertRows(versionRows, versions);
    if (
      versions.some((q) => q.questionType !== 'SINGLE_CHOICE' && q.scoringRubricVersionId !== null)
    )
      throw new Error('Mock PGK must not carry an invented numeric rubric.');
    const itemRows = entries.map(({ question: q, packageId, order }) => ({
      id: mockId(`item:${packageId}:${order}`),
      packageId,
      questionVersionId: mockId(`version:${q.code}`),
      displayOrder: order,
      maxPoints: '1.00',
    }));
    // maxPoints is a required schema placeholder; mixed DEMO finalization never grades it.
    await tx.insert(packageItems).values(itemRows).onConflictDoNothing();
    const actualItems = await tx
      .select()
      .from(packageItems)
      .where(
        inArray(
          packageItems.packageId,
          packages.map((p) => p.id),
        ),
      );
    assertRows(itemRows, actualItems);
    const pgkVersionIds = new Set(
      versions.filter((q) => q.questionType !== 'SINGLE_CHOICE').map((q) => q.id),
    );
    if (
      actualItems.some(
        (i) =>
          pgkVersionIds.has(i.questionVersionId) &&
          (i.rubricVersionId !== null || i.maximumScoreCategory !== null),
      )
    )
      throw new Error('Mock items must not invent a PGK rubric.');
    return {
      demoOnly: true,
      pretestPackages: packageRows.map((p) => ({
        id: p.id,
        chapterId: p.chapterId,
        name: p.name,
        items: 20,
      })),
      tryoutPackage: {
        id: tryoutId,
        name: tryoutPackage.name,
        items: 30,
        formats: { pg: 10, multiAnswer: 10, category: 10 },
        releaseAt,
        closeAt,
        durationSeconds: 600,
      },
      questionCount: 110,
    };
  });
}
