import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { assessmentPackages, closeDatabaseConnection, getDatabase } from '@tka/database';
import { eq } from 'drizzle-orm';
import { packageAvailability } from '../content/content-package-availability';
import type { IdentityService } from '../identity/identity.service';
import { DrillAssessmentService } from './drill-assessment.service';
import { configuredDrillSet } from './drill-distribution';

describe('Drill pilot configuration', () => {
  it('opts in only valid UUID mappings and fails closed on malformed configuration', () => {
    const level = randomUUID();
    const set = randomUUID();
    try {
      vi.stubEnv('NUMORA_DRILL_AB_LEVEL_SETS', '');
      expect(configuredDrillSet(level)).toBeUndefined();
      vi.stubEnv('NUMORA_DRILL_AB_LEVEL_SETS', JSON.stringify({ [level.toUpperCase()]: set }));
      expect(configuredDrillSet(level)).toBe(set);
      expect(configuredDrillSet(randomUUID())).toBeUndefined();
      for (const invalid of [
        '[1]',
        '{',
        '{"invalid":"value"}',
        JSON.stringify({ [level]: null }),
      ]) {
        vi.stubEnv('NUMORA_DRILL_AB_LEVEL_SETS', invalid);
        expect(configuredDrillSet(level)).toBeNull();
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

type Client = ReturnType<typeof getDatabase>['client'];

/** All academic approval records created here are TEST ONLY. */
async function seedPilot(client: Client) {
  const chapter = randomUUID();
  const subchapter = randomUUID();
  const level = randomUUID();
  const competency = randomUUID();
  const context = randomUUID();
  const blueprint = randomUUID();
  const policy = randomUUID();
  const set = randomUUID();
  const original = randomUUID();
  const variant = randomUUID();
  const rubric = randomUUID();
  const admin = randomUUID();
  const studentA = randomUUID();
  const studentB = randomUUID();
  const newcomer = randomUUID();
  const legacy = randomUUID();
  const [scoring] = await client<{ id: string }[]>`select id from scoring_policy_versions
    where policy_code = 'DRILL_PRD_V06' and version = 1 and status = 'PUBLISHED'`;
  if (!scoring) throw new Error('Test scoring policy missing');
  const originals: string[] = [];
  const variants: string[] = [];
  const replacements: string[] = [];

  await client.begin(async (tx) => {
    await tx`insert into users (id, auth_user_id, role, admin_role, display_name, email)
      values (${admin}, ${randomUUID()}, 'ADMIN', 'CONTENT_DATA_MODERATION', 'TEST ONLY', ${admin + '@example.test'})`;
    for (const student of [studentA, studentB, newcomer, legacy]) {
      await tx`insert into users (id, auth_user_id, role, display_name, email)
        values (${student}, ${randomUUID()}, 'STUDENT', 'TEST ONLY', ${student + '@example.test'})`;
    }
    await tx`insert into chapters (id, code, slug, name, display_order, status)
      values (${chapter}, ${chapter}, ${chapter}, 'TEST ONLY', ${parseInt(chapter.slice(0, 7), 16) + 1}, 'READY')`;
    await tx`insert into subchapters (id, chapter_id, code, slug, name, display_order, status)
      values (${subchapter}, ${chapter}, ${subchapter}, ${subchapter}, 'TEST ONLY', 1, 'READY')`;
    await tx`insert into levels (id, subchapter_id, level_number, status) values (${level}, ${subchapter}, 1, 'READY')`;
    await tx`insert into competencies (id, subchapter_id, code, description, status)
      values (${competency}, ${subchapter}, ${competency}, 'TEST ONLY', 'READY')`;
    await tx`insert into measurement_contexts (id, ecosystem, dimension, level_id, scale_code)
      values (${context}, 'DRILL', 'TEST', ${level}, ${context})`;
    await tx`insert into scoring_rubric_versions
      (id, code, version, question_type, maximum_score_category, definition, digest, status, approved_by_user_id, approved_at)
      values (${rubric}, ${rubric}, 1, 'SINGLE_CHOICE', 1, '{}', 'TEST', 'SEALED', ${admin}, now())`;

    const families: string[] = [];
    for (let index = 0; index < 10; index++) {
      const family = randomUUID();
      const source = randomUUID();
      const alternate = randomUUID();
      const originalVersion = randomUUID();
      families.push(family);
      await tx`insert into questions (id, primary_competency_id, status) values (${family}, ${competency}, 'READY')`;
      await tx`insert into question_variants (id, question_id, variant_code, kind, origin)
        values (${source}, ${family}, 'ORIGINAL', 'ORIGINAL', 'TEST')`;
      const addVersion = (id: string, variantId: string, version: number, parent: string | null) =>
        tx`insert into question_versions
          (id, variant_id, version_number, question_type, stem, options_or_statements, answer_key, explanation,
           media, difficulty, level_id, scoring_rubric_version_id, content_status, reviewed_by_user_id,
           reviewed_at, parent_original_question_version_id)
          values (${id}, ${variantId}, ${version}, 'SINGLE_CHOICE', '{"text":"TEST"}',
            '[{"id":"A","content":{"text":"1"}},{"id":"B","content":{"text":"2"}}]',
            '{"optionId":"A"}', '{"text":"TEST"}',
            '[]', 'MEDIUM', ${level}, ${rubric}, 'READY', ${admin}, now(), ${parent})`;
      await addVersion(originalVersion, source, 1, null);
      originals.push(originalVersion);
      if (index < 3) {
        variants.push(originalVersion);
        replacements.push(originalVersion);
      } else {
        await tx`insert into question_variants (id, question_id, variant_code, kind, origin, original_variant_id)
          values (${alternate}, ${family}, 'VARIANT', 'VARIANT', 'TEST', ${source})`;
        const v1 = randomUUID();
        const v2 = randomUUID();
        await addVersion(v1, alternate, 1, originalVersion);
        await addVersion(v2, alternate, 2, originalVersion);
        variants.push(v1);
        replacements.push(v2);
      }
    }
    await tx`insert into assessment_blueprint_versions
      (id, code, version, definition, digest, status, approved_by_user_id, approved_at, approval_reference)
      values (${blueprint}, ${blueprint}, 1, jsonb_build_object('anchorQuestionVersionIds', ${originals.slice(0, 3)}::uuid[],
        'familyIds', ${families.sort()}::uuid[]), 'TEST', 'SEALED', ${admin}, now(), 'TEST ONLY')`;
    await tx`insert into assessment_distribution_policies (id, code, version, definition, digest, approved_by_user_id, approved_at)
      values (${policy}, ${policy}, 1, jsonb_build_object('contextId', ${context}::text, 'ecosystem', 'DRILL',
        'regularRewards', true, 'preserveHistory', true, 'allowOriginalFallback', true), '', ${admin}, now())`;
    await tx`insert into assessment_arm_sets (id, context_id, blueprint_version_id, policy_id)
      values (${set}, ${context}, ${blueprint}, ${policy})`;
    await tx`insert into assessment_arms (id, set_id, code, kind)
      values (${original}, ${set}, 'A', 'ORIGINAL'), (${variant}, ${set}, 'B', 'VARIANT')`;
  });

  async function revision(armId: string, version: number, items: string[], approved = true) {
    const packageId = randomUUID();
    const revisionId = randomUUID();
    await client.begin(async (tx) => {
      await tx`insert into assessment_packages
        (id, family_code, package_version, name, assessment_type, chapter_id, level_id, scoring_policy_version_id, distribution_arm_id)
        values (${packageId}, ${armId}, ${version}, 'TEST ONLY', 'DRILL', ${chapter}, ${level}, ${scoring!.id}, ${armId})`;
      for (const [index, item] of items.entries()) {
        await tx`insert into package_items (package_id, question_version_id, display_order, max_points)
          values (${packageId}, ${item}, ${index + 1}, 1)`;
      }
      await tx`update assessment_packages set status = 'PUBLISHED', curriculum_approval = case when ${approved} then jsonb_build_object(
        'reference', 'TEST ONLY', 'approvedAt', now(), 'compositionDigest', irt_compute.payload_digest(jsonb_build_object(
          'packageId', id, 'items', (select jsonb_agg(to_jsonb(i) order by display_order, i.id)
          from package_items i where i.package_id = ${packageId})))) end where id = ${packageId}`;
      await tx`insert into assessment_arm_revisions (id, arm_id, package_id, revision, anchor_question_version_ids, manifest_digest)
        values (${revisionId}, ${armId}, ${packageId}, ${version}, ${originals.slice(0, 3)}::uuid[], '')`;
      await tx`update assessment_arms set current_revision_id = ${revisionId}, status = 'ACTIVE' where id = ${armId}`;
      await tx`insert into assessment_arm_distribution_events (revision_id, state, reason, actor_user_id)
        values (${revisionId}, 'PROVISIONAL', 'TEST ONLY', ${admin})`;
    });
    return { packageId, revisionId };
  }

  const a = await revision(original, 1, originals);
  const b = await revision(variant, 1, variants);
  await client`update assessment_arm_sets set status = 'OPEN' where id = ${set}`;
  return {
    level,
    set,
    original,
    variant,
    a,
    b,
    admin,
    studentA,
    studentB,
    newcomer,
    legacy,
    replaceVariant: (approved = true) => revision(variant, 2, replacements, approved),
  };
}

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('Drill distribution through the Student service on PostgreSQL', () => {
  afterAll(async () => {
    vi.unstubAllEnvs();
    await closeDatabaseConnection();
  });

  it('pins assignments, replaces revisions, and applies an explicit hold atomically', async () => {
    const target = new URL(process.env.TEST_DATABASE_URL!);
    expect(['localhost', '127.0.0.1']).toContain(target.hostname);
    expect(target.pathname).toMatch(/^\/numora_test(?:_[a-z0-9_]+)?$/);
    vi.stubEnv('DATABASE_URL', target.href);
    const { db, client } = getDatabase();
    const f = await seedPilot(client);
    const identity = { me: async (studentId: string) => ({ id: studentId, role: 'STUDENT' }) };
    const service = new DrillAssessmentService(identity as unknown as IdentityService);
    vi.stubEnv('NUMORA_DRILL_AB_LEVEL_SETS', JSON.stringify({ [f.level]: f.set }));
    const unavailable = { status: 503, response: { code: 'DRILL_PACKAGE_UNAVAILABLE' } };
    const assignmentFor = (student: string) => client`select * from assessment_arm_assignments
      where set_id = ${f.set} and student_id = ${student}`;
    const deliveryFor = async (attemptId: string) => {
      const [delivery] =
        await client`select * from assessment_attempt_arm_deliveries where attempt_id = ${attemptId}`;
      return delivery;
    };
    const availability = (id: string) =>
      db.transaction(async (tx) => {
        const [pack] = await tx
          .select()
          .from(assessmentPackages)
          .where(eq(assessmentPackages.id, id));
        return packageAvailability(tx, pack!);
      });

    expect((await availability(f.a.packageId)).state).toBe('AVAILABLE');
    expect((await availability(f.b.packageId)).state).toBe('AVAILABLE');
    const constraint = 'test_drill_start_' + f.newcomer.replaceAll('-', '');
    await client.unsafe(`alter table assessment_attempts add constraint ${constraint}
      check (student_id <> '${f.newcomer}'::uuid) not valid`);
    try {
      await expect(service.start(f.newcomer, f.level)).rejects.toMatchObject({
        cause: { constraint_name: constraint },
      });
    } finally {
      await client.unsafe(`alter table assessment_attempts drop constraint ${constraint}`);
    }
    expect(await assignmentFor(f.newcomer)).toEqual([]);
    expect(
      await client`select id from assessment_attempts where student_id = ${f.newcomer}`,
    ).toEqual([]);

    const [first, same] = await Promise.all([
      service.start(f.newcomer, f.level),
      service.start(f.newcomer, f.level.toUpperCase()),
    ]);
    expect(same.id).toBe(first.id);
    expect(first.questions).toHaveLength(10);
    const assignments = await assignmentFor(f.newcomer);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]!.first_valid_evidence).toBe(true);
    expect(await deliveryFor(first.id)).toMatchObject({
      assignment_id: assignments[0]!.id,
      delivery_mode: 'ASSIGNED',
      delivered_revision_id:
        assignments[0]!.assigned_arm_id === f.original ? f.a.revisionId : f.b.revisionId,
    });
    await client`insert into assessment_arm_assignments (set_id, student_id, assigned_arm_id)
      values (${f.set}, ${f.studentA}, ${f.original}), (${f.set}, ${f.studentB}, ${f.variant})`;
    const b = await service.start(f.studentB, f.level);
    expect(await deliveryFor(b.id)).toMatchObject({ delivered_revision_id: f.b.revisionId });
    await service.saveAnswer(f.studentB, b.id, b.questions[0]!.questionInstanceId, {
      optionId: 'A',
    });
    const paused = await service.updateClock(f.studentB, b.id, b.clock!.sessionId!, 'pause');
    expect(paused.sessionId).toBeNull();

    const hold = () =>
      client.begin(async (tx) => {
        await tx`set local lock_timeout = '500ms'`;
        await tx`insert into assessment_arm_distribution_events (revision_id, state, reason, actor_user_id)
        values (${f.b.revisionId}, 'HOLD', 'TEST ONLY', ${f.admin})`;
      });
    await client.begin(async (tx) => {
      await tx`select id from assessment_arms where id = ${f.variant} for share`;
      await expect(hold()).rejects.toMatchObject({ code: '55P03' });
    });
    await hold();
    await expect(service.start(f.legacy, f.level)).rejects.toMatchObject(unavailable);
    expect(await assignmentFor(f.legacy)).toEqual([]);
    expect((await availability(f.b.packageId)).state).toBe('BLOCKED');
    const resumed = await service.start(f.studentB, f.level);
    expect(resumed.id).toBe(b.id);
    expect(resumed.questions.map((question) => question.questionInstanceId)).toEqual(
      b.questions.map((question) => question.questionInstanceId),
    );
    expect(resumed.questions[0]!.answer).toEqual({ optionId: 'A' });
    expect(resumed.clock!.elapsedMs).toBeGreaterThanOrEqual(paused.elapsedMs);
    await expect(service.attempt(f.studentA, b.id)).rejects.toMatchObject({ status: 404 });
    expect(await deliveryFor((await service.start(f.studentA, f.level)).id)).toMatchObject({
      delivered_revision_id: f.a.revisionId,
      delivery_mode: 'ASSIGNED',
    });

    const initialResult = await service.submit(f.studentB, b.id);
    await client`insert into assessment_arm_distribution_events (revision_id, state, reason, actor_user_id)
      values (${f.a.revisionId}, 'HOLD', 'TEST ONLY', ${f.admin})`;
    await expect(service.start(f.studentB, f.level)).rejects.toMatchObject(unavailable);
    await client`insert into assessment_arm_distribution_events (revision_id, state, reason, actor_user_id)
      values (${f.a.revisionId}, 'PROVISIONAL', 'TEST ONLY', ${f.admin})`;
    const fallback = await service.start(f.studentB, f.level);
    const [assignmentB] = await assignmentFor(f.studentB);
    expect(assignmentB!.assigned_arm_id).toBe(f.variant);
    expect(await deliveryFor(fallback.id)).toMatchObject({
      assignment_id: assignmentB!.id,
      delivered_revision_id: f.a.revisionId,
      delivery_mode: 'ORIGINAL_FALLBACK',
      fallback_reason: 'VARIANT_DISTRIBUTION_STOPPED',
    });
    await expect(f.replaceVariant(false)).rejects.toThrow();
    const v2 = await f.replaceVariant();
    expect((await service.start(f.studentB, f.level)).id).toBe(fallback.id);
    await service.submit(f.studentB, fallback.id);
    const retry = await service.start(f.studentB, f.level);
    expect(await deliveryFor(retry.id)).toMatchObject({
      assignment_id: assignmentB!.id,
      delivered_revision_id: v2.revisionId,
      delivery_mode: 'ASSIGNED',
    });
    expect(await deliveryFor(b.id)).toMatchObject({ delivered_revision_id: f.b.revisionId });
    expect(await service.submit(f.studentB, b.id)).toMatchObject({
      score: initialResult.score,
      reward: initialResult.reward,
    });

    const oldPackage = randomUUID();
    await client`insert into assessment_packages (id, family_code, package_version, name, assessment_type, level_id)
      values (${oldPackage}, ${oldPackage}, 1, 'TEST legacy', 'DRILL', ${f.level})`;
    await client`insert into assessment_attempts (student_id, package_id, assessment_type, level_id_at_start, status)
      values (${f.legacy}, ${oldPackage}, 'DRILL', ${f.level}, 'CANCELLED')`;
    await service.start(f.legacy, f.level);
    expect((await assignmentFor(f.legacy))[0]).toMatchObject({
      first_valid_evidence: false,
      exposure_facts: { hasPriorContextAttempt: true },
    });
    await client`update assessment_arm_sets set status = 'CLOSED' where id = ${f.set}`;
    expect((await service.start(f.studentB, f.level)).id).toBe(retry.id);
    await service.submit(f.studentB, retry.id);
    await expect(service.start(f.studentB, f.level)).rejects.toMatchObject(unavailable);
  }, 30_000);
});
