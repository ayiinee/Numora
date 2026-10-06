import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assessmentPackages,
  closeDatabaseConnection,
  getDatabase,
  packageItems,
  questionVersions,
  questionVariants,
  questions,
} from '@tka/database';
import { seedPvpDemo, pvpDemoId } from '@tka/database/testing';
import { eq } from 'drizzle-orm';
import { pvpFixture } from './pvp.test-fixture';
import { resolvePvpPolicy } from './pvp-runtime.policy';
import { PvpEngineService } from './pvp-engine.service';
import { pvpMode } from './pvp.policy';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('runtime policy and READY Drill publication boundary', () => {
  let fixture: Awaited<ReturnType<typeof pvpFixture>>;
  const testPackages: string[] = [];
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ALLOW_DEMO_SEED = 'true';
    fixture = await pvpFixture();
    for (const difficulty of ['MEDIUM', 'HARD']) {
      for (let i = 0; i < 10; i++) {
        const [q] = await getDatabase().db.insert(questions).values({
          primaryCompetencyId: fixture.competency.id, usageType: 'DRILL', status: 'READY',
        }).returning();
        const [variant] = await getDatabase().db.insert(questionVariants).values({
          questionId: q!.id, variantCode: randomUUID(), kind: 'ORIGINAL', origin: 'TEST',
        }).returning();
        await getDatabase().db.insert(questionVersions).values({
          variantId: variant!.id, versionNumber: 1, questionType: 'SINGLE_CHOICE',
          stem: { text: 'TEST ONLY: 1 + 1?' },
          optionsOrStatements: [{ id: 'A', content: { text: '2' } }, { id: 'B', content: { text: '3' } }],
          answerKey: { optionId: 'A' }, explanation: { text: 'TEST ONLY: 2' },
          difficulty, contentStatus: 'READY', reviewedByUserId: fixture.contentAdmin.id, reviewedAt: new Date(),
        });
      }
    }
  });
  afterAll(async () => {
    for (const id of testPackages)
      await getDatabase()
        .db.update(assessmentPackages)
        .set({ status: 'ARCHIVED' })
        .where(eq(assessmentPackages.id, id));
    delete process.env.PVP_MODE;
    delete process.env.ALLOW_DEMO_SEED;
    await closeDatabaseConnection();
  });
  it('defaults off, rejects invalid modes and seeds three immutable replay-safe DEMO packages', async () => {
    delete process.env.PVP_MODE;
    expect(await resolvePvpPolicy()).toBeNull();
    expect(() => pvpMode({ PVP_MODE: 'fixture' })).toThrow();
    expect(await seedPvpDemo()).toEqual({ packages: 3, questions: 30, isDemo: true });
    expect(await seedPvpDemo()).toEqual({ packages: 3, questions: 30, isDemo: true });
    for (const difficulty of ['easy', 'medium', 'hard']) {
      const rows = await getDatabase()
        .db.select()
        .from(packageItems)
        .where(eq(packageItems.packageId, pvpDemoId(`package:${difficulty}`)));
      expect(rows).toHaveLength(10);
    }
  });
  it('requires live scheduling and ignores prebuilt PvP packages when selecting READY Drill content', async () => {
    process.env.PVP_MODE = 'demo';
    const policy = await resolvePvpPolicy();
    const engine = new PvpEngineService(policy);
    expect((await engine.availability()).reasonCode).toBe('PVP_SCHEDULER_UNAVAILABLE');
    engine.setSchedulerReady(true);
    const [invalid] = await getDatabase()
      .db.insert(assessmentPackages)
      .values({
        familyCode: randomUUID(),
        packageVersion: 1,
        name: 'TEST ONLY invalid first candidate',
        assessmentType: 'PVP',
        isDemo: true,
        status: 'PUBLISHED',
        scoringPolicyVersionId: policy!.policyVersionId,
        releaseAt: new Date(),
      })
      .returning();
    testPackages.push(invalid!.id);
    const available = await engine.availability(fixture.students[0]!.id);
    expect(available.difficulties.every((d) => d.available)).toBe(true);
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const room = await engine.create(fixture.students[0]!.id, difficulty, randomUUID());
      expect(room.isDemo).toBe(true);
      expect((await engine.availability(fixture.students[0]!.id)).activeMatchId).toBe(room.matchId);
      expect(room.expiresAt).not.toBeNull();
      await engine.leave(fixture.students[0]!.id, room.matchId);
    }
    await getDatabase()
      .db.update(assessmentPackages)
      .set({ status: 'ARCHIVED' })
      .where(eq(assessmentPackages.id, invalid!.id));
  });
  it('official mode uses the READY Drill bank without separate PvP package approval', async () => {
    process.env.PVP_MODE = 'official';
    const engine = new PvpEngineService(await resolvePvpPolicy());
    engine.setSchedulerReady(true);
    const state = await engine.availability();
    expect(state.difficulties.every((d) => d.available)).toBe(true);
    const room = await engine.create(fixture.students[0]!.id, 'easy', randomUUID());
    expect(room.isDemo).toBe(false);
    const [match] = await getDatabase().client`select package_id from pvp_matches where id=${room.matchId}`;
    const [pack] = await getDatabase().db.select().from(assessmentPackages)
      .where(eq(assessmentPackages.id, match!.package_id));
    expect(pack!.curriculumApproval).toBeNull();
    expect(pack!.frozenAt).not.toBeNull();
    expect(pack!.manifestDigest).toBeTruthy();
    expect(pack!.isDemo).toBe(false);
    await engine.leave(fixture.students[0]!.id, room.matchId);
  });
  it('disables new rooms while keeping an active match and retries recoverable', async () => {
    process.env.PVP_MODE = 'demo';
    const engine = new PvpEngineService(await resolvePvpPolicy());
    engine.setSchedulerReady(true);
    const key = randomUUID();
    const room = await engine.create(fixture.students[0]!.id, 'easy', key);
    try {
      process.env.PVP_NEW_MATCHES_ENABLED = 'false';
      expect(await engine.availability(fixture.students[0]!.id)).toMatchObject({
        available: false,
        reasonCode: 'PVP_NEW_MATCHES_DISABLED',
        activeMatchId: room.matchId,
      });
      await expect(
        engine.create(fixture.students[2]!.id, 'easy', randomUUID()),
      ).rejects.toMatchObject({ response: { code: 'PVP_NEW_MATCHES_DISABLED' } });
      expect((await engine.create(fixture.students[0]!.id, 'easy', key)).matchId).toBe(
        room.matchId,
      );
      await engine.join(fixture.students[1]!.id, room.roomCode);
      await engine.ready(fixture.students[0]!.id, room.matchId);
      const running = await engine.ready(fixture.students[1]!.id, room.matchId);
      expect(running.status).toBe('RUNNING');
      expect(
        (
          await engine.answer(
            fixture.students[0]!.id,
            room.matchId,
            running.question!.id,
            'A',
            randomUUID(),
          )
        ).question?.answered,
      ).toBe(true);
    } finally {
      delete process.env.PVP_NEW_MATCHES_ENABLED;
      await engine.leave(fixture.students[0]!.id, room.matchId);
    }
  });
});
