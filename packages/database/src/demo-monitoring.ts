import { createHash } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDatabase } from './client.js';
import { seedDemoLearning } from './demo-learning.js';
import {
  assessmentAttempts,
  assessmentPackages,
  attemptAnswers,
  attemptItems,
  classMemberships,
  classes,
  feedback,
  levelProgress,
  levels,
  packageItems,
  scoringPolicyVersions,
  questionVersions,
  schools,
  teacherSchoolMemberships,
  teacherVerificationTokens,
  users,
} from './schema/index.js';

type DbExecutor = Pick<ReturnType<typeof getDatabase>['db'], 'insert' | 'select'>;

function assertLocalDemoSeedAllowed() {
  if (process.env.NODE_ENV !== 'development' || process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Demo seed requires NODE_ENV=development and ALLOW_DEMO_SEED=true.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');
  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)) {
    throw new Error('Monitoring demo profiles use placeholder Auth IDs and are restricted to a localhost database.');
  }
}

const id = (namespace: number, value: number) =>
  `00000000-0000-4000-9000-${(namespace * 100_000 + value).toString().padStart(12, '0')}`;
const learningId = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

const CHAPTER_ID = learningId(100);
const LEVEL_ONE = learningId(102);
const LEVEL_TWO = learningId(103);
const PACKAGE_ONE = learningId(501);
const PACKAGE_TWO = learningId(502);
const SCHOOL_CODE = 'DEMO-SCHOOL';

// Namespace 9 is reserved for these deterministic local Monitoring fixtures.
const NS = {
  teacherAuth: 1,
  studentAuth: 2,
  token: 3,
  teacherSchool: 4,
  class: 5,
  membership: 6,
  attempt: 7,
  attemptQuestion: 8,
  progress: 9,
  feedback: 10,
};
const fixtureUserAuthId = (role: 'teacher' | 'student', number: number) =>
  `00000000-0000-4000-9000-${((role === 'teacher' ? NS.teacherAuth : NS.studentAuth) * 100_000 + number).toString().padStart(12, '0')}`;

const adminFixture = {
  authUserId: '00000000-0000-4000-8000-000000000001',
  role: 'ADMIN' as const,
  displayName: 'DEMO Admin',
  email: 'admin.demo@example.invalid',
};

const teachers = [
  { key: 'A', number: 1, displayName: 'DEMO Guru A', email: 'monitoring.teacher.a@example.invalid' },
  { key: 'B', number: 2, displayName: 'DEMO Guru B', email: 'monitoring.teacher.b@example.invalid' },
] as const;

const students = [
  { key: 's1', number: 1, displayName: 'DEMO Siswa 1', email: 'monitoring.student.1@example.invalid' },
  { key: 's2', number: 2, displayName: 'DEMO Siswa 2', email: 'monitoring.student.2@example.invalid' },
  { key: 's3', number: 3, displayName: 'DEMO Siswa 3', email: 'monitoring.student.3@example.invalid' },
  { key: 's4', number: 4, displayName: 'DEMO Siswa 4', email: 'monitoring.student.4@example.invalid' },
  { key: 'outsider', number: 5, displayName: 'DEMO Siswa Luar Kelas', email: 'monitoring.student.outsider@example.invalid' },
] as const;

const classesFixture = [
  { number: 1, teacher: 'A', name: 'DEMO Kelas IX A', joinCode: 'DEMO-IX-A', members: ['s1', 's2', 's3', 's4'] },
  { number: 2, teacher: 'B', name: 'DEMO Kelas IX B', joinCode: 'DEMO-IX-B', members: ['outsider'] },
] as const;

const feedbackFixtures = [
  {
    number: 1,
    teacher: 'teacher-A',
    student: 's1',
    classNumber: 1,
    body: 'DEMO: Periksa kembali langkah pengerjaan soal pecahan.',
    sentAt: new Date('2026-09-29T08:00:00.000Z'),
    readAt: null,
  },
  {
    number: 2,
    teacher: 'teacher-A',
    student: 's2',
    classNumber: 1,
    body: 'DEMO: Bagus, lanjutkan latihan secara konsisten.',
    sentAt: new Date('2026-09-29T08:05:00.000Z'),
    readAt: new Date('2026-09-29T10:00:00.000Z'),
  },
] as const;

type AttemptPlan = {
  number: number;
  student: string;
  packageId: string;
  startedAt: string;
  completedAt: string | null;
  answers: boolean[];
};

const attempts: AttemptPlan[] = [
  {
    number: 1,
    student: 's1',
    packageId: PACKAGE_ONE,
    startedAt: '2026-09-25T08:00:00.000Z',
    completedAt: '2026-09-25T08:12:00.000Z',
    answers: [true, true, true, true, true, true, true, true, false, false],
  },
  {
    number: 2,
    student: 's2',
    packageId: PACKAGE_ONE,
    startedAt: '2026-09-26T08:00:00.000Z',
    completedAt: '2026-09-26T08:12:00.000Z',
    answers: [true, true, true, true, true, true, true, false, false, false],
  },
  {
    number: 3,
    student: 's2',
    packageId: PACKAGE_TWO,
    startedAt: '2026-09-27T08:00:00.000Z',
    completedAt: '2026-09-27T08:12:00.000Z',
    answers: [true, true, true, true, true, true, false, false, false, false],
  },
  {
    number: 4,
    student: 's4',
    packageId: PACKAGE_ONE,
    startedAt: '2026-09-28T08:00:00.000Z',
    completedAt: null,
    answers: [true, false, true],
  },
];

const expected: Record<
  string,
  {
    latest: number | null;
    levels: { unlocked: boolean; inProgress: boolean; latest: number | null; best: number | null }[];
  }
> = {
  s1: { latest: 80, levels: [{ unlocked: true, inProgress: false, latest: 80, best: 80 }, { unlocked: true, inProgress: false, latest: null, best: null }] },
  s2: { latest: 60, levels: [{ unlocked: true, inProgress: false, latest: 60, best: 70 }, { unlocked: false, inProgress: false, latest: null, best: null }] },
  s3: { latest: null, levels: [{ unlocked: true, inProgress: false, latest: null, best: null }, { unlocked: false, inProgress: false, latest: null, best: null }] },
  s4: { latest: null, levels: [{ unlocked: true, inProgress: true, latest: null, best: null }, { unlocked: false, inProgress: false, latest: null, best: null }] },
};

function scoreDrill(correctCount: number, questionCount: number) {
  const score = Math.round((correctCount * 100) / questionCount);
  return {
    score,
    mastered: score >= 80,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('DEMO question content has an invalid JSON shape.');
  }
  return value as Record<string, unknown>;
}

function richText(value: unknown): string {
  const text = record(value).text;
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('DEMO question version is missing rich-text content.');
  }
  return text;
}

function choiceOptions(value: unknown): { id: string; text: string }[] {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error('DEMO SINGLE_CHOICE version must contain exactly four options.');
  }
  const options = value.map((option) => {
    const item = record(option);
    const content = record(item.content);
    if (typeof item.id !== 'string' || typeof content.text !== 'string') {
      throw new Error('DEMO question option has an invalid shape.');
    }
    return { id: item.id, text: content.text };
  });
  if (options.map((option) => option.id).sort().join(',') !== 'A,B,C,D') {
    throw new Error('DEMO SINGLE_CHOICE options must use the A–D identifiers required by the Drill API.');
  }
  return options;
}

function correctOption(value: unknown): string {
  const key = record(value);
  if (typeof key.optionId === 'string') return key.optionId;
  if (Array.isArray(key.correctOptionIds) && key.correctOptionIds.length === 1 && typeof key.correctOptionIds[0] === 'string') {
    return key.correctOptionIds[0];
  }
  throw new Error('DEMO Drill fixture expects a single-choice answer key with one correct option.');
}

async function ensureUser(
  db: DbExecutor,
  authUserId: string,
  fixture: { role: 'ADMIN' | 'TEACHER' | 'STUDENT'; displayName: string; email: string },
) {
  const [existing] = await db
    .select({ id: users.id, role: users.role, displayName: users.displayName, email: users.email, status: users.status })
    .from(users)
    .where(eq(users.authUserId, authUserId))
    .limit(1);
  if (existing) {
    if (
      existing.role !== fixture.role ||
      existing.displayName !== fixture.displayName ||
      existing.email !== fixture.email ||
      existing.status !== 'ACTIVE'
    ) {
      throw new Error(`Auth profile ${authUserId} exists but does not match the DEMO ${fixture.role} fixture.`);
    }
    return existing.id;
  }
  const [created] = await db
    .insert(users)
    .values({ authUserId, ...fixture })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (created) return created.id;
  const [conflict] = await db.select({ id: users.id }).from(users).where(eq(users.authUserId, authUserId)).limit(1);
  if (!conflict) throw new Error(`DEMO ${fixture.role} profile conflicted on another unique key.`);
  return conflict.id;
}

function authIdForStudent(studentKey: string) {
  const student = students.find((item) => item.key === studentKey);
  if (!student) throw new Error(`Unknown DEMO student key: ${studentKey}.`);
  return fixtureUserAuthId('student', student.number);
}

async function loadPackage(db: DbExecutor, packageId: string) {
  const rows = await db
    .select({
      packageItemId: packageItems.id,
      sortOrder: packageItems.displayOrder,
      maxPoints: packageItems.maxPoints,
      questionVersionId: questionVersions.id,
      stem: questionVersions.stem,
      options: questionVersions.optionsOrStatements,
      answerKey: questionVersions.answerKey,
      explanation: questionVersions.explanation,
      questionType: questionVersions.questionType,
    })
    .from(packageItems)
    .innerJoin(questionVersions, eq(questionVersions.id, packageItems.questionVersionId))
    .where(eq(packageItems.packageId, packageId))
    .orderBy(asc(packageItems.displayOrder));

  return rows.map((row) => {
    if (row.questionType !== 'SINGLE_CHOICE') {
      throw new Error(`DEMO Drill package ${packageId} contains a non-SINGLE_CHOICE item.`);
    }
    const options = choiceOptions(row.options);
    const answer = correctOption(row.answerKey);
    if (!options.some((option) => option.id === answer)) {
      throw new Error(`DEMO question version ${row.questionVersionId} has an answer outside its options.`);
    }
    if (Number(row.maxPoints) !== 1) {
      throw new Error(`DEMO package item ${row.packageItemId} must be worth one point.`);
    }
    return {
      packageItemId: row.packageItemId,
      sortOrder: row.sortOrder,
      questionVersionId: row.questionVersionId,
      maxPoints: row.maxPoints,
      stem: richText(row.stem),
      options,
      correctOptionId: answer,
      explanation: richText(row.explanation),
    };
  });
}

async function seedRows(db: DbExecutor) {
  await seedDemoLearning(db);

  await db
    .insert(schools)
    .values({ code: SCHOOL_CODE, name: 'DEMO School', status: 'ACTIVE' })
    .onConflictDoNothing();
  const [school] = await db.select().from(schools).where(eq(schools.code, SCHOOL_CODE)).limit(1);
  if (!school || school.name !== 'DEMO School' || school.status !== 'ACTIVE') {
    throw new Error('DEMO-SCHOOL exists but does not match the expected active fixture.');
  }

  const adminId = await ensureUser(db, adminFixture.authUserId, adminFixture);
  const userIds = new Map<string, string>();
  for (const teacher of teachers) {
    userIds.set(
      `teacher-${teacher.key}`,
      await ensureUser(db, fixtureUserAuthId('teacher', teacher.number), {
        role: 'TEACHER', displayName: teacher.displayName, email: teacher.email,
      }),
    );
  }
  for (const student of students) {
    userIds.set(
      student.key,
      await ensureUser(db, fixtureUserAuthId('student', student.number), {
        role: 'STUDENT', displayName: student.displayName, email: student.email,
      }),
    );
  }

  const requireUser = (key: string) => {
    const userId = userIds.get(key);
    if (!userId) throw new Error(`Missing DEMO user fixture ${key}.`);
    return userId;
  };

  const tokenCreatedAt = new Date('2026-09-20T09:00:00.000Z');
  const tokenUsedAt = new Date('2026-09-21T09:00:00.000Z');
  for (const teacher of teachers) {
    const tokenId = id(NS.token, teacher.number);
    const teacherId = requireUser(`teacher-${teacher.key}`);
    await db
      .insert(teacherVerificationTokens)
      .values({
        id: tokenId,
        schoolId: school.id,
        tokenHash: createHash('sha256').update(`NUMORA-LOCAL-DEMO-CONSUMED-${teacher.key}`).digest('hex'),
        createdByUserId: adminId,
        createdAt: tokenCreatedAt,
        expiresAt: new Date('2026-09-23T09:00:00.000Z'),
        usedAt: tokenUsedAt,
        usedByUserId: teacherId,
      })
      .onConflictDoNothing();
    await db
      .insert(teacherSchoolMemberships)
      .values({
        id: id(NS.teacherSchool, teacher.number),
        teacherUserId: teacherId,
        schoolId: school.id,
        verificationTokenId: tokenId,
        verifiedAt: tokenUsedAt,
      })
      .onConflictDoNothing();
  }

  for (const classFixture of classesFixture) {
    const classId = id(NS.class, classFixture.number);
    const teacherId = requireUser(`teacher-${classFixture.teacher}`);
    await db
      .insert(classes)
      .values({
        id: classId,
        schoolId: school.id,
        teacherUserId: teacherId,
        name: classFixture.name,
        joinCode: classFixture.joinCode,
        createdAt: new Date('2026-09-22T08:00:00.000Z'),
        updatedAt: new Date('2026-09-22T08:00:00.000Z'),
      })
      .onConflictDoNothing();
    const [storedClass] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
    if (
      !storedClass || storedClass.teacherUserId !== teacherId || storedClass.schoolId !== school.id ||
      storedClass.name !== classFixture.name || storedClass.joinCode !== classFixture.joinCode || storedClass.archivedAt !== null
    ) {
      throw new Error(`DEMO class ${classFixture.name} conflicts with an existing record.`);
    }

    for (const memberKey of classFixture.members) {
      const member = students.find((item) => item.key === memberKey);
      if (!member) throw new Error(`Unknown DEMO class member ${memberKey}.`);
      const studentId = requireUser(memberKey);
      await db
        .insert(classMemberships)
        .values({
          id: id(NS.membership, member.number),
          classId,
          studentUserId: studentId,
          joinedAt: new Date('2026-09-23T00:00:00.000Z'),
        })
        .onConflictDoNothing();
      const [activeMembership] = await db
        .select({ id: classMemberships.id })
        .from(classMemberships)
        .where(and(eq(classMemberships.classId, classId), eq(classMemberships.studentUserId, studentId), isNull(classMemberships.leftAt)))
        .limit(1);
      const [anyActiveMembership] = await db
        .select({ classId: classMemberships.classId })
        .from(classMemberships)
        .where(and(eq(classMemberships.studentUserId, studentId), isNull(classMemberships.leftAt)))
        .limit(1);
      if (!activeMembership || anyActiveMembership?.classId !== classId) {
        throw new Error(`${member.displayName} already has a conflicting active class membership.`);
      }
    }
  }

  for (const fixture of feedbackFixtures) {
    await db
      .insert(feedback)
      .values({
        id: id(NS.feedback, fixture.number),
        teacherId: requireUser(fixture.teacher),
        studentId: requireUser(fixture.student),
        classIdAtSend: id(NS.class, fixture.classNumber),
        body: fixture.body,
        sentAt: fixture.sentAt,
        readAt: fixture.readAt,
      })
      .onConflictDoNothing();
  }

  const [firstLevel] = await db.select().from(levels).where(eq(levels.id, LEVEL_ONE)).limit(1);
  const [secondLevel] = await db.select().from(levels).where(eq(levels.id, LEVEL_TWO)).limit(1);
  if (!firstLevel || !secondLevel || firstLevel.status !== 'READY' || secondLevel.status !== 'READY') {
    throw new Error('DEMO learning seed did not create the expected READY levels.');
  }

  const packageRows = new Map<string, Awaited<ReturnType<typeof loadPackage>>>();
  const packagePolicyIds = new Map<string, string>();
  for (const packageId of [PACKAGE_ONE, PACKAGE_TWO]) {
    const [demoPackage] = await db
      .select({
        levelId: assessmentPackages.levelId,
        isDemo: assessmentPackages.isDemo,
        assessmentType: assessmentPackages.assessmentType,
        status: assessmentPackages.status,
        scoringPolicyVersionId: assessmentPackages.scoringPolicyVersionId,
        policyCode: scoringPolicyVersions.policyCode,
        policyVersion: scoringPolicyVersions.version,
        policyStatus: scoringPolicyVersions.status,
      })
      .from(assessmentPackages)
      .innerJoin(scoringPolicyVersions, eq(scoringPolicyVersions.id, assessmentPackages.scoringPolicyVersionId))
      .where(eq(assessmentPackages.id, packageId))
      .limit(1);
    if (
      !demoPackage || !demoPackage.scoringPolicyVersionId || demoPackage.levelId !== LEVEL_ONE || demoPackage.isDemo !== true ||
      demoPackage.assessmentType !== 'DRILL' || demoPackage.status !== 'PUBLISHED' ||
      demoPackage.policyCode !== 'DRILL_PG_DEMO' || demoPackage.policyVersion !== 1 || demoPackage.policyStatus !== 'PUBLISHED'
    ) {
      throw new Error(`DEMO Drill package ${packageId} is missing or inconsistent.`);
    }
    const questions = await loadPackage(db, packageId);
    if (questions.length !== 10) throw new Error(`DEMO Drill package ${packageId} must have 10 questions.`);
    packageRows.set(packageId, questions);
    packagePolicyIds.set(packageId, demoPackage.scoringPolicyVersionId);
  }

  for (const plan of attempts) {
    const questions = packageRows.get(plan.packageId);
    if (!questions) throw new Error(`Missing DEMO package ${plan.packageId}.`);
    const scoringPolicyVersionId = packagePolicyIds.get(plan.packageId);
    if (!scoringPolicyVersionId) throw new Error(`Missing scoring policy for DEMO package ${plan.packageId}.`);
    const studentId = requireUser(plan.student);
    const attemptId = id(NS.attempt, plan.number);
    const completed = plan.completedAt !== null;
    const correctCount = plan.answers.filter(Boolean).length;
    const score = completed ? scoreDrill(correctCount, questions.length) : null;
    const [membership] = await db
      .select({ classId: classMemberships.classId })
      .from(classMemberships)
      .where(and(eq(classMemberships.studentUserId, studentId), isNull(classMemberships.leftAt)))
      .limit(1);
    if (!membership) throw new Error(`${plan.student} must have an active class for this Monitoring fixture.`);
    await db
      .insert(assessmentAttempts)
      .values({
        id: attemptId,
        studentId,
        packageId: plan.packageId,
        assessmentType: 'DRILL',
        chapterIdAtStart: CHAPTER_ID,
        levelIdAtStart: LEVEL_ONE,
        classIdAtStart: membership.classId,
        scoringPolicyVersionId,
        startedAt: new Date(plan.startedAt),
        finishedAt: plan.completedAt ? new Date(plan.completedAt) : null,
        status: completed ? 'GRADED' : 'IN_PROGRESS',
        rawPoints: score ? String(correctCount) : null,
        score0To100: score ? String(score.score) : null,
        // Drill v1.2 leaves star thresholds OPEN; synthetic seed results must not invent them.
        stars: null,
        unlockedLevelId: score?.mastered ? LEVEL_TWO : null,
      })
      .onConflictDoNothing();

    await db
      .insert(attemptItems)
      .values(
        questions.map((question) => {
          return {
            id: id(NS.attemptQuestion, plan.number * 100 + question.sortOrder),
            attemptId,
            packageId: plan.packageId,
            packageItemId: question.packageItemId,
            questionVersionId: question.questionVersionId,
            displayOrder: question.sortOrder,
            maxPoints: question.maxPoints,
          };
        }),
      )
      .onConflictDoNothing();

    const savedAnswers = questions.flatMap((question) => {
      const correct = plan.answers[question.sortOrder - 1];
      if (correct === undefined && !completed) return [];
      const selectedOptionId = correct === undefined
        ? null
        : correct
          ? question.correctOptionId
          : question.options.find((option) => option.id !== question.correctOptionId)?.id ?? null;
      return [{
        attemptItemId: id(NS.attemptQuestion, plan.number * 100 + question.sortOrder),
        answer: { optionId: selectedOptionId },
        savedAt: new Date(plan.completedAt ?? plan.startedAt),
        awardedPoints: completed ? String(correct ? 1 : 0) : null,
        gradedAt: completed ? new Date(plan.completedAt!) : null,
      }];
    });
    if (savedAnswers.length > 0) {
      await db.insert(attemptAnswers).values(savedAnswers).onConflictDoNothing();
    }
  }

  type ProgressData = {
    unlockedAt: Date;
    completedAt: Date | null;
    completionAttemptId: string | null;
    unlockingAttemptId: string | null;
    latestScore: number | null;
    bestScore: number | null;
    bestStars: number | null;
  };
  const progressRows = new Map<string, Map<string, ProgressData>>();
  for (const plan of attempts) {
    if (!plan.completedAt) continue;
    const packageQuestions = packageRows.get(plan.packageId);
    if (!packageQuestions) continue;
    const finishedAt = new Date(plan.completedAt);
    const attemptId = id(NS.attempt, plan.number);
    const scored = scoreDrill(plan.answers.filter(Boolean).length, packageQuestions.length);
    const studentProgress = progressRows.get(plan.student) ?? new Map<string, ProgressData>();
    const prior = studentProgress.get(LEVEL_ONE);
    studentProgress.set(LEVEL_ONE, {
      unlockedAt: prior?.unlockedAt ?? finishedAt,
      completedAt: scored.mastered ? finishedAt : (prior?.completedAt ?? null),
      completionAttemptId: scored.mastered ? (prior?.completionAttemptId ?? attemptId) : (prior?.completionAttemptId ?? null),
      unlockingAttemptId: null,
      latestScore: scored.score,
      bestScore: Math.max(prior?.bestScore ?? 0, scored.score),
      // Star thresholds are DRL-OPEN-03; keep demo progress pending rather than applying v0.5 ranges.
      bestStars: null,
    });
    if (scored.mastered && !studentProgress.has(LEVEL_TWO)) {
      studentProgress.set(LEVEL_TWO, {
        unlockedAt: finishedAt,
        completedAt: null,
        completionAttemptId: null,
        unlockingAttemptId: attemptId,
        latestScore: null,
        bestScore: null,
        bestStars: null,
      });
    }
    progressRows.set(plan.student, studentProgress);
  }

  for (const student of students) {
    const studentProgress = progressRows.get(student.key);
    if (!studentProgress) continue;
    for (const [levelId, progress] of studentProgress) {
      const isUnlockedNextLevel = levelId === LEVEL_TWO;
      await db
        .insert(levelProgress)
        .values({
          id: id(NS.progress, student.number * 10 + (isUnlockedNextLevel ? 2 : 1)),
          studentId: userIds.get(student.key)!,
          levelId,
          unlockedAt: progress.unlockedAt,
          completedAt: progress.completedAt,
          completionAttemptId: progress.completionAttemptId,
          unlockingAttemptId: progress.unlockingAttemptId,
          unlockSource: isUnlockedNextLevel ? 'DRILL' : null,
          latestScore: progress.latestScore,
          bestScore: progress.bestScore,
          bestStars: progress.bestStars,
        })
        .onConflictDoNothing();
    }
  }
}

// Produces no partial fixture: content and Monitoring rows commit or roll back together.
export async function seedDemoMonitoring() {
  assertLocalDemoSeedAllowed();
  const { db } = getDatabase();
  await db.transaction(async (tx) => {
    await seedRows(tx);
    const problems = await verifyDemoMonitoring(tx);
    if (problems.length > 0) throw new Error(problems.join('\n'));
  });
}

export async function verifyDemoMonitoring(db: DbExecutor = getDatabase().db) {
  const problems: string[] = [];
  const [school] = await db.select().from(schools).where(eq(schools.code, SCHOOL_CODE)).limit(1);
  if (!school || school.status !== 'ACTIVE') problems.push('DEMO school is missing or inactive.');

  for (const teacher of teachers) {
    const [teacherProfile] = await db
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(eq(users.authUserId, fixtureUserAuthId('teacher', teacher.number)))
      .limit(1);
    const teacherId = teacherProfile?.id;
    if (!teacherId || teacherProfile.role !== 'TEACHER' || teacherProfile.status !== 'ACTIVE' || !school) {
      problems.push(`${teacher.displayName}: active school verification is missing.`);
      continue;
    }
    const [verification] = await db
      .select({
        membershipId: teacherSchoolMemberships.id,
        membershipEndedAt: teacherSchoolMemberships.endedAt,
        tokenUsedAt: teacherVerificationTokens.usedAt,
        tokenUsedByUserId: teacherVerificationTokens.usedByUserId,
      })
      .from(teacherSchoolMemberships)
      .innerJoin(teacherVerificationTokens, eq(teacherVerificationTokens.id, teacherSchoolMemberships.verificationTokenId))
      .where(and(
        eq(teacherSchoolMemberships.teacherUserId, teacherId),
        eq(teacherSchoolMemberships.schoolId, school.id),
        isNull(teacherSchoolMemberships.endedAt),
      ))
      .limit(1);
    if (!verification || !verification.tokenUsedAt || verification.tokenUsedByUserId !== teacherId) {
      problems.push(`${teacher.displayName}: no active membership backed by its consumed verification token.`);
    }
    const classFixture = classesFixture.find((item) => item.teacher === teacher.key);
    if (!classFixture) continue;
    const classId = id(NS.class, classFixture.number);
    const [ownedClass] = await db
      .select({ id: classes.id, teacherUserId: classes.teacherUserId, schoolId: classes.schoolId, archivedAt: classes.archivedAt })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!ownedClass || ownedClass.teacherUserId !== teacherId || ownedClass.schoolId !== school.id || ownedClass.archivedAt) {
      problems.push(`${teacher.displayName}: expected an active owned DEMO class.`);
    }
  }

  const demoLevels = await db
    .select({ id: levels.id, levelNumber: levels.levelNumber })
    .from(levels)
    .where(inArray(levels.id, [LEVEL_ONE, LEVEL_TWO]))
    .orderBy(asc(levels.levelNumber));
  if (demoLevels.length !== 2) return ['Expected both DEMO READY levels.'];

  for (const student of students) {
    const want = expected[student.key];
    if (!want) continue;
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.authUserId, authIdForStudent(student.key)))
      .limit(1);
    if (!user) {
      problems.push(`${student.displayName}: profile is missing.`);
      continue;
    }
    const progress = await db.select().from(levelProgress).where(eq(levelProgress.studentId, user.id));
    const active = await db
      .select({ levelId: assessmentAttempts.levelIdAtStart })
      .from(assessmentAttempts)
      .where(and(
        eq(assessmentAttempts.studentId, user.id),
        eq(assessmentAttempts.assessmentType, 'DRILL'),
        eq(assessmentAttempts.status, 'IN_PROGRESS'),
      ));
    const [latest] = await db
      .select({ score: assessmentAttempts.score0To100 })
      .from(assessmentAttempts)
      .where(and(
        eq(assessmentAttempts.studentId, user.id),
        eq(assessmentAttempts.assessmentType, 'DRILL'),
        eq(assessmentAttempts.status, 'GRADED'),
      ))
      .orderBy(desc(assessmentAttempts.finishedAt), desc(assessmentAttempts.id))
      .limit(1);
    if ((latest?.score === null || latest?.score === undefined ? null : Number(latest.score)) !== want.latest) {
      problems.push(`${student.displayName}: latest score mismatch (got ${latest?.score ?? null}, expected ${want.latest}).`);
    }
    demoLevels.forEach((level, index) => {
      const expectedLevel = want.levels[index];
      if (!expectedLevel) return;
      const state = progress.find((row) => row.levelId === level.id);
      const actual = {
        unlocked: Boolean(state?.unlockedAt) || level.levelNumber === 1,
        inProgress: active.some((row) => row.levelId === level.id),
        latest: state?.latestScore ?? null,
        best: state?.bestScore ?? null,
      };
      if (JSON.stringify(actual) !== JSON.stringify(expectedLevel)) {
        problems.push(`${student.displayName} Level ${level.levelNumber}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expectedLevel)}.`);
      }
    });
  }

  const feedbackRows = await db
    .select({
      id: feedback.id,
      teacherId: feedback.teacherId,
      studentId: feedback.studentId,
      classIdAtSend: feedback.classIdAtSend,
      body: feedback.body,
      sentAt: feedback.sentAt,
      readAt: feedback.readAt,
    })
    .from(feedback)
    .where(inArray(feedback.id, feedbackFixtures.map((row) => id(NS.feedback, row.number))));
  if (feedbackRows.length !== feedbackFixtures.length) {
    problems.push(`Found ${feedbackRows.length} DEMO feedback rows; expected ${feedbackFixtures.length}.`);
  }
  for (const fixture of feedbackFixtures) {
    const row = feedbackRows.find((item) => item.id === id(NS.feedback, fixture.number));
    const expectedTeacherId = fixtureUserAuthId('teacher', 1);
    const teacher = await db.select({ id: users.id }).from(users).where(eq(users.authUserId, expectedTeacherId)).limit(1);
    const student = students.find((item) => item.key === fixture.student);
    const studentId = student ? fixtureUserAuthId('student', student.number) : '';
    const studentProfile = await db.select({ id: users.id }).from(users).where(eq(users.authUserId, studentId)).limit(1);
    if (
      !row || row.teacherId !== teacher[0]?.id || row.studentId !== studentProfile[0]?.id ||
      row.classIdAtSend !== id(NS.class, fixture.classNumber) || row.body !== fixture.body ||
      row.sentAt.getTime() !== fixture.sentAt.getTime() ||
      (row.readAt?.getTime() ?? null) !== (fixture.readAt?.getTime() ?? null)
    ) {
      problems.push(`DEMO feedback ${fixture.number} is missing or inconsistent.`);
    }
  }

  const attemptIds = attempts.map((attempt) => id(NS.attempt, attempt.number));
  const snapshots = await db
    .select({ attemptId: attemptItems.attemptId, answer: attemptAnswers.answer, awardedPoints: attemptAnswers.awardedPoints })
    .from(attemptItems)
    .leftJoin(attemptAnswers, eq(attemptAnswers.attemptItemId, attemptItems.id))
    .where(inArray(attemptItems.attemptId, attemptIds));
  for (const attempt of attempts) {
    const attemptId = id(NS.attempt, attempt.number);
    const rows = snapshots.filter((row) => row.attemptId === attemptId);
    if (rows.length !== 10) problems.push(`Attempt ${attemptId} has ${rows.length} canonical attempt items; expected 10.`);
    const answered = rows.filter((row) => row.answer !== null).length;
    const expectedAnswers = attempt.completedAt ? 10 : attempt.answers.length;
    if (answered !== expectedAnswers) {
      problems.push(`Attempt ${attemptId} has ${answered} saved answers; expected ${expectedAnswers}.`);
    }
    if (attempt.completedAt && rows.some((row) => row.awardedPoints === null)) {
      problems.push(`Completed attempt ${attemptId} has ungraded answers.`);
    }
  }
  return problems;
}