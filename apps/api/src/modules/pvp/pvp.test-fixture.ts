/** Test fixtures only. No module, seed command or runtime entry point imports this file. */
import { randomUUID } from 'node:crypto';
import {
  assessmentPackages,
  chapters,
  classMemberships,
  classes,
  competencies,
  getDatabase,
  packageItems,
  questionVariants,
  questionVersions,
  questions,
  schools,
  scoringPolicyVersions,
  subchapters,
  users,
} from '@tka/database';
import type { PvpPolicy } from './pvp.policy';
export async function pvpFixture() {
  const { db } = getDatabase();
  const suffix = randomUUID();
  const students = await db
    .insert(users)
    .values(
      [1, 2, 3].map((n) => ({
        authUserId: randomUUID(),
        role: 'STUDENT' as const,
        displayName: `Fixture student ${n}`,
        email: `${suffix}-${n}@example.test`,
      })),
    )
    .returning();
  const [teacher] = await db
    .insert(users)
    .values({
      authUserId: randomUUID(),
      role: 'TEACHER',
      displayName: 'Fixture teacher',
      email: `${suffix}-teacher@example.test`,
    })
    .returning();
  const [school] = await db
    .insert(schools)
    .values({ code: suffix, name: 'Fixture school' })
    .returning();
  const [schoolClass] = await db
    .insert(classes)
    .values({
      schoolId: school!.id,
      teacherUserId: teacher!.id,
      name: 'Fixture class',
      joinCode: suffix.slice(0, 12).toUpperCase(),
    })
    .returning();
  await db
    .insert(classMemberships)
    .values(students.slice(0, 2).map((s) => ({ studentUserId: s.id, classId: schoolClass!.id })));
  const [chapter] = await db
    .insert(chapters)
    .values({
      code: suffix, slug: (suffix).toLowerCase(),
      name: 'PvP fixture chapter',
      displayOrder: Math.floor(Math.random() * 1_000_000_000) + 1,
      status: 'READY',
    })
    .returning();
  const [subchapter] = await db
    .insert(subchapters)
    .values({
      chapterId: chapter!.id,
      code: suffix, slug: (suffix).toLowerCase(),
      name: 'PvP fixture subchapter',
      displayOrder: 1,
      status: 'READY',
    })
    .returning();
  const [competency] = await db
    .insert(competencies)
    .values({
      subchapterId: subchapter!.id,
      code: suffix,
      description: 'Test only',
      status: 'READY',
    })
    .returning();
  const [policy] = await db
    .insert(scoringPolicyVersions)
    .values({
      policyCode: `PVP_TEST_ONLY_${suffix}`,
      version: 1,
      status: 'PUBLISHED',
      configuration: { fixture: true, correctPoints: 100, bonusMax: 50 },
    })
    .returning();
  const [pack] = await db
    .insert(assessmentPackages)
    .values({
      familyCode: suffix,
      packageVersion: 1,
      name: 'PvP TEST FIXTURE',
      assessmentType: 'PVP',
      status: 'PUBLISHED',
      isDemo: true,
      releaseAt: new Date(Date.now() - 60_000),
      scoringPolicyVersionId: policy!.id,
    })
    .returning();
  for (let order = 1; order <= 10; order++) {
    const [q] = await db
      .insert(questions)
      .values({ primaryCompetencyId: competency!.id, sourceRef: suffix, status: 'READY' })
      .returning();
    const [variant] = await db
      .insert(questionVariants)
      .values({
        questionId: q!.id,
        variantCode: `${suffix}-${order}`,
        kind: 'ORIGINAL',
        origin: 'TEST',
      })
      .returning();
    const [version] = await db
      .insert(questionVersions)
      .values({
        variantId: variant!.id,
        versionNumber: 1,
        questionType: 'SINGLE_CHOICE',
        stem: { text: `Fixture ${order}: 1 + 1?` },
        optionsOrStatements: [
          { id: 'A', content: { text: '2' } },
          { id: 'B', content: { text: '3' } },
        ],
        answerKey: { optionId: 'A' },
        explanation: { text: 'Test explanation' },
        difficulty: 'EASY',
      })
      .returning();
    await db
      .insert(packageItems)
      .values({
        packageId: pack!.id,
        questionVersionId: version!.id,
        displayOrder: order,
        maxPoints: '150',
      });
  }
  const fixturePolicy: PvpPolicy = {
    policyVersionId: policy!.id,
    roomLifetimeSeconds: 600,
    inviteLifetimeSeconds: 60,
    simultaneousDisconnect: 'cancel',
  };
  return {
    students,
    teacher: teacher!,
    schoolClass: schoolClass!,
    pack: pack!,
    policy: fixturePolicy,
  };
}
