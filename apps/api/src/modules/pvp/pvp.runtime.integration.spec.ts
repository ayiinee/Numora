import { pvpDemoId, seedPvpDemo, seedPvpTestScenarios } from '@tka/database/testing';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assessmentBlueprintVersions,
  assessmentPackages,
  closeDatabaseConnection,
  getDatabase,
  packageItems,
} from '@tka/database';
import { eq, sql } from 'drizzle-orm';
import { pvpFixture } from './pvp.test-fixture';
import { resolvePvpPolicy } from './pvp-runtime.policy';
import { PvpEngineService } from './pvp-engine.service';
import { pvpMode } from './pvp.policy';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('owner-approved runtime policy and DEMO publication boundary', () => {
  let fixture: Awaited<ReturnType<typeof pvpFixture>>;
  const testPackages: string[] = [];
  const runtimePackages = new Map<string, string>();
  beforeAll(async () => {
    process.env.ALLOW_SYNTHETIC_CONTENT = 'true';
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ALLOW_DEMO_SEED = 'true';
    fixture = await pvpFixture();
    const ready = await seedPvpTestScenarios();
    for (const [difficulty, id] of ready) {
      runtimePackages.set(difficulty, id);
      testPackages.push(id);
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
  it('requires live scheduling and skips malformed candidates without blocking valid later packages', async () => {
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
  it('official mode rejects DEMO and unsigned packages and accepts manifest-bound Curriculum evidence', async () => {
    process.env.PVP_MODE = 'official';
    const policy = await resolvePvpPolicy();
    const engine = new PvpEngineService(policy);
    engine.setSchedulerReady(true);
    expect((await engine.availability()).available).toBe(false);
    const { db } = getDatabase();
    const [demo] = await db
      .select()
      .from(assessmentPackages)
      .where(eq(assessmentPackages.id, runtimePackages.get('easy')!));
    const [pack] = await db
      .insert(assessmentPackages)
      .values({
        familyCode: randomUUID(),
        packageVersion: 1,
        name: 'TEST ONLY approval boundary',
        assessmentType: 'PVP',
        isDemo: false,
        status: 'DRAFT',
        releaseAt: new Date('2026-01-01T00:00:00Z'),
        manifestDigest: demo!.manifestDigest,
        scoringPolicyVersionId: policy!.policyVersionId,
      })
      .returning();
    const items = await db.select().from(packageItems).where(eq(packageItems.packageId, demo!.id));
    await db.insert(packageItems).values(
      items.map((i) => ({
        packageId: pack!.id,
        questionVersionId: i.questionVersionId,
        displayOrder: i.displayOrder,
        maxPoints: i.maxPoints,
      })),
    );
    await db
      .update(assessmentPackages)
      .set({ status: 'PUBLISHED', frozenAt: new Date() })
      .where(eq(assessmentPackages.id, pack!.id));
    expect((await engine.availability()).available).toBe(false);
    testPackages.push(pack!.id);
    await db
      .update(assessmentPackages)
      .set({ status: 'ARCHIVED' })
      .where(eq(assessmentPackages.id, pack!.id));
    const [blueprint] = await db
      .insert(assessmentBlueprintVersions)
      .values({
        code: `TEST_ONLY_${randomUUID()}`,
        version: 1,
        definition: { testOnly: true, assessmentType: 'PVP' },
        digest: 'test-only-blueprint',
        status: 'SEALED',
      })
      .returning();
    const [approved] = await db
      .insert(assessmentPackages)
      .values({
        familyCode: randomUUID(),
        packageVersion: 1,
        name: 'TEST ONLY approved boundary',
        blueprintVersionId: blueprint!.id,
        assessmentType: 'PVP',
        isDemo: false,
        status: 'DRAFT',
        releaseAt: new Date('2026-01-01T00:00:00Z'),
        scoringPolicyVersionId: policy!.policyVersionId,
      })
      .returning();
    testPackages.push(approved!.id);
    await db.insert(packageItems).values(
      items.map((i) => ({
        packageId: approved!.id,
        questionVersionId: i.questionVersionId,
        displayOrder: i.displayOrder,
        maxPoints: i.maxPoints,
      })),
    );
    const [manifest] = await db.execute<{ digest: string }>(
      sql`select irt_compute.payload_digest(jsonb_build_object('packageId',p.id,'blueprintVersionId',p.blueprint_version_id,'scoringPolicyVersionId',p.scoring_policy_version_id,'items',(select jsonb_agg(to_jsonb(i) order by i.display_order,i.id) from public.package_items i where i.package_id=p.id))) as digest from public.assessment_packages p where p.id=${approved!.id}`,
    );
    await db
      .update(assessmentPackages)
      .set({
        status: 'PUBLISHED',
        frozenAt: new Date(),
        curriculumApproval: {
          reference: 'TEST ONLY — not an actual academic approval',
          approvedAt: new Date().toISOString(),
          manifestDigest: manifest!.digest,
        },
      })
      .where(eq(assessmentPackages.id, approved!.id));
    const state = await engine.availability();
    expect(state.difficulties.map((d) => d.available)).toEqual([true, false, false]);
    const room = await engine.create(fixture.students[0]!.id, 'easy', randomUUID());
    expect(room.isDemo).toBe(false);
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
