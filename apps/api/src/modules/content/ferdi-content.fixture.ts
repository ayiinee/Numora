import { randomUUID } from 'node:crypto';
import { ForbiddenException, type INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  assessmentAttempts,
  assessmentPackages,
  attemptAnswers,
  attemptItems,
  chapters,
  closeDatabaseConnection,
  competencies,
  getDatabase,
  levels,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
  scoringPolicyVersions,
  subchapters,
  users,
} from '@tka/database';
import { configureApplication } from '../../bootstrap';
import { IdentityService } from '../identity/identity.service';
import { ReportsModule } from '../reports/reports.module';
import { IrtModule } from '../irt/irt.module';
import { LearningModule } from '../learning/learning.module';
import { R2MediaStorage } from './r2-media.storage';
import { ContentModule } from './content.module';
import type { CreateDrillPackageDto } from './drill-packages.dto';
const url = process.env.TEST_DATABASE_URL;
export const databaseSuite = url ? describe : describe.skip;
export function installFerdiFixture() {
  let app: INestApplication;
  let base: string;
  let admin: string;
  let student: string;
  let other: string;
  let level: string;
  let subchapter: string;
  let policy: string;
  let canonicalPackage: string;
  let attemptId: string;
  let itemId: string;
  let versionIds: string[];
  let body: CreateDrillPackageDto;
  const suffix = randomUUID().slice(0, 8);
  const previousKey = process.env.IRT_PSEUDONYM_KEY;
  async function request(path: string, method = 'GET', body?: object, token = 'admin') {
    return fetch(`${base}/${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  beforeAll(async () => {
    if (
      !url ||
      !['127.0.0.1', 'localhost'].includes(new URL(url).hostname) ||
      process.env.NODE_ENV !== 'test'
    )
      throw Error('Only a local test database is permitted.');
    process.env.DATABASE_URL = url;
    process.env.IRT_PSEUDONYM_KEY = 'TEST_ONLY_NOT_A_REAL_PSEUDONYM_KEY_32';
    const { db } = getDatabase();
    const identities = await db
      .insert(users)
      .values(
        Array.from({ length: 32 }, (_, i) => ({
          authUserId: randomUUID(),
          role: i === 0 ? ('ADMIN' as const) : ('STUDENT' as const),
          displayName: `TEST person ${i}`,
          email: `ferdi-${suffix}-${i}@example.test`,
        })),
      )
      .returning({ id: users.id });
    admin = identities[0]!.id;
    student = identities[1]!.id;
    other = identities[2]!.id;
    const [chapter] = await db
      .insert(chapters)
      .values({
        code: `FERDI-${suffix}`,
        slug: `FERDI-${suffix}`.toLowerCase(),
        name: 'TEST chapter',
        displayOrder: (parseInt(suffix, 16) % 1_000_000) + 200_000,
        status: 'READY',
      })
      .returning();
    const [sub] = await db
      .insert(subchapters)
      .values({
        chapterId: chapter!.id,
        code: 'SUB',
        slug: 'SUB'.toLowerCase(),
        name: 'TEST subchapter',
        displayOrder: 1,
        status: 'READY',
      })
      .returning();
    subchapter = sub!.id;
    const [comp] = await db
      .insert(competencies)
      .values({
        subchapterId: subchapter,
        code: 'COMP',
        description: 'TEST competency',
        status: 'READY',
      })
      .returning();
    const [lev] = await db
      .insert(levels)
      .values({ subchapterId: subchapter, levelNumber: 1, status: 'READY' })
      .returning();
    level = lev!.id;
    // TEST ONLY approval/configuration; never represents Curriculum/Product acceptance.
    const [p] = await db
      .insert(scoringPolicyVersions)
      .values({
        policyCode: 'NUMORA_DRILL_V06',
        version: (parseInt(suffix, 16) % 1000000000) + 1,
        configuration: {
          fixture: 'TEST_ONLY',
          contractVersion: 'NUMORA_ASSESSMENT_V1',
          assessmentType: 'DRILL',
          scoreRounding: 'HALF_UP',
          xpRounding: 'HALF_UP',
          itemPointRounding: 'HALF_UP',
          drillXpBasis: 'EQUIVALENT_CORRECT',
          itemWeights: { SINGLE_CHOICE: 2 },
        },
        status: 'PUBLISHED',
        approvedByUserId: admin,
        approvedAt: new Date(),
        approvalReference: `TEST_ONLY_NOT_ACADEMIC_APPROVAL_${suffix}`,
      })
      .returning();
    policy = p!.id;
    versionIds = [];
    for (let i = 0; i < 10; i++) {
      const [q] = await db
        .insert(questions)
        .values({
          primaryCompetencyId: comp!.id,
          status: 'READY',
          usageType: 'DRILL',
          curriculumLevelNumber: 1,
        })
        .returning();
      const [v] = await db
        .insert(questionVariants)
        .values({ questionId: q!.id, variantCode: 'ORIGINAL', kind: 'ORIGINAL', origin: 'TEST' })
        .returning();
      const [version] = await db
        .insert(questionVersions)
        .values({
          variantId: v!.id,
          versionNumber: 1,
          questionType: 'SINGLE_CHOICE',
          stem: { text: 'TEST 1 + 1?' },
          optionsOrStatements: ['A', 'B', 'C', 'D'].map((id) => ({
            id,
            content: { text: id === 'A' ? '2' : '3' },
          })),
          answerKey: { optionId: 'A' },
          explanation: { text: 'TEST 2' },
          difficulty: 'EASY',
          contentStatus: 'READY',
          reviewedByUserId: admin,
          reviewedAt: new Date(),
        })
        .returning();
      versionIds.push(version!.id);
    }
    body = {
      familyCode: `FERDI-${suffix}`,
      packageVersion: 1,
      name: 'TEST Drill',
      levelId: level,
      variantIndex: 1,
      scoringPolicyVersionId: policy,
      questionVersionIds: versionIds,
    };
    const module = await Test.createTestingModule({
      imports: [ContentModule, ReportsModule, IrtModule, LearningModule],
    })
      .overrideProvider(IdentityService)
      .useValue({
        me: async (authorization?: string) => {
          if (
            ![
              'Bearer admin',
              'Bearer student',
              'Bearer other',
              'Bearer teacher',
              'Bearer disabled',
            ].includes(authorization ?? '')
          )
            throw new UnauthorizedException();
          if (authorization === 'Bearer disabled') throw new ForbiddenException();
          return {
            id:
              authorization === 'Bearer admin'
                ? admin
                : authorization === 'Bearer other'
                  ? other
                  : student,
            role:
              authorization === 'Bearer admin'
                ? 'ADMIN'
                : authorization === 'Bearer teacher'
                  ? 'TEACHER'
                  : 'STUDENT',
            status: 'ACTIVE',
            adminRole: 'CONTENT_DATA_MODERATION',
          };
        },
      })
      .overrideProvider(R2MediaStorage)
      .useValue({
        readLink: async (_bucket: string, key: string) => ({
          url: `https://media.example.invalid/${key}`,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        }),
      }) // TEST ONLY private storage signer.
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
    // Canonical graded fixtures, not an implementation of Qurotul's assessment engine.
    const [pkg] = await db
      .insert(assessmentPackages)
      .values({
        familyCode: `IRT-${suffix}`,
        packageVersion: 1,
        name: 'TEST canonical',
        isDemo: true,
        assessmentType: 'DRILL',
        levelId: level,
        scoringPolicyVersionId: policy,
        status: 'PUBLISHED',
      })
      .returning();
    canonicalPackage = pkg!.id;
    const [pi] = await db
      .insert(packageItems)
      .values({
        packageId: pkg!.id,
        questionVersionId: versionIds[0]!,
        displayOrder: 1,
        maxPoints: '1',
      })
      .returning();
    for (const person of identities.slice(1, 31)) {
      const [a] = await db
        .insert(assessmentAttempts)
        .values({
          studentId: person.id,
          packageId: pkg!.id,
          assessmentType: 'DRILL',
          levelIdAtStart: level,
          scoringPolicyVersionId: policy,
          status: 'IN_PROGRESS',
          startedAt: new Date(Date.now() - 1000),
        })
        .returning();
      const [ai] = await db
        .insert(attemptItems)
        .values({
          attemptId: a!.id,
          packageId: pkg!.id,
          packageItemId: pi!.id,
          questionVersionId: versionIds[0]!,
          displayOrder: 1,
          maxPoints: '1',
        })
        .returning();
      await db.insert(attemptAnswers).values({
        attemptItemId: ai!.id,
        answer: { optionId: 'A' },
        awardedPoints: '1',
        gradedAt: new Date(),
      });
      await db
        .update(assessmentAttempts)
        .set({ status: 'GRADED', finishedAt: new Date(), score0To100: '70' })
        .where(eq(assessmentAttempts.id, a!.id));
      if (person.id === student) {
        attemptId = a!.id;
        itemId = ai!.id;
      }
    }
  }, 60_000);
  afterAll(async () => {
    if (app) await app.close();
    await closeDatabaseConnection();
    if (previousKey === undefined) delete process.env.IRT_PSEUDONYM_KEY;
    else process.env.IRT_PSEUDONYM_KEY = previousKey;
  });

  return {
    request,
    get admin() {
      return admin;
    },
    get student() {
      return student;
    },
    get other() {
      return other;
    },
    get level() {
      return level;
    },
    get subchapter() {
      return subchapter;
    },
    get policy() {
      return policy;
    },
    get canonicalPackage() {
      return canonicalPackage;
    },
    get attemptId() {
      return attemptId;
    },
    get itemId() {
      return itemId;
    },
    get versionIds() {
      return versionIds;
    },
    get body() {
      return body;
    },
    get suffix() {
      return suffix;
    },
  };
}
