import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { closeDatabaseConnection } from '@tka/database';
import { configureApplication } from '../../bootstrap';
import { IdentityService } from '../identity/identity.service';
import { LearningModule } from './learning.module';

const testUrl = process.env.TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;
integration('Student typed answer HTTP → PostgreSQL and published result reads (TEST ONLY)', () => {
  let app: INestApplication | undefined;
  let db: ReturnType<typeof postgres> | undefined;
  afterAll(async () => {
    await app?.close();
    await closeDatabaseConnection();
    await db?.end();
  });
  it('saves/resumes three shapes, preserves release/ownership and refuses unapproved PGK grading', async () => {
    if (
      !testUrl ||
      process.env.NODE_ENV !== 'test' ||
      !['127.0.0.1', 'localhost'].includes(new URL(testUrl).hostname)
    )
      throw new Error('Isolated local PostgreSQL required.');
    process.env.DATABASE_URL = testUrl;
    const connection = (db = postgres(testUrl, { max: 1, onnotice: () => {} }));
    const row = async (query: string, params: (string | number | null)[] = []) =>
      (await connection.unsafe(query, params))[0]!;
    const suffix = randomUUID();
    const actor = await row(
      "INSERT INTO users(auth_user_id,role,display_name,email) VALUES($1,'STUDENT','TEST ONLY',$2) RETURNING id",
      [randomUUID(), suffix + '@example.test'],
    );
    const reviewer = await row(
      "INSERT INTO users(auth_user_id,role,display_name,email) VALUES($1,'ADMIN','TEST ONLY rubric fixture',$2) RETURNING id",
      [randomUUID(), suffix + '-reviewer@example.test'],
    );
    const fresh = await row(
      "INSERT INTO users(auth_user_id,role,display_name,email) VALUES($1,'STUDENT','TEST ONLY fresh',$2) RETURNING id",
      [randomUUID(), suffix + '-fresh@example.test'],
    );
    const chapter = await row(
      "INSERT INTO chapters(code,slug,name,display_order,status) VALUES($1,$1,'TEST ONLY typed',(SELECT COALESCE(MAX(display_order),0)+1 FROM chapters),'READY') RETURNING id",
      [suffix],
    );
    const sub = await row(
      "INSERT INTO subchapters(chapter_id,code,slug,name,display_order,status) VALUES($1,$2,$2,'TEST ONLY',1,'READY') RETURNING id",
      [chapter.id, suffix],
    );
    const level = await row(
      "INSERT INTO levels(subchapter_id,level_number,status) VALUES($1,1,'READY') RETURNING id",
      [sub.id],
    );
    const competency = await row(
      "INSERT INTO competencies(subchapter_id,code,description) VALUES($1,$2,'TEST ONLY') RETURNING id",
      [sub.id, suffix],
    );
    const policy = await row(
      "SELECT id FROM scoring_policy_versions WHERE policy_code='DRILL_PRD_V06' AND version=1",
    );
    const pack = await row(
      "INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,chapter_id,level_id,is_demo,scoring_policy_version_id,status) VALUES($1,1,'TEST ONLY PGK transport','DRILL',$2,$3,true,$4,'PUBLISHED') RETURNING id",
      [suffix, chapter.id, level.id, policy.id],
    );
    const options = ['A', 'B', 'C', 'D'].map((id) => ({
      id,
      content: { text: 'TEST ONLY ' + id },
    }));
    const versions: string[] = [];
    const packageItemIds: string[] = [];
    for (let index = 0; index < 10; index++) {
      const type =
        index === 1
          ? 'MULTIPLE_CHOICE_MULTIPLE_ANSWER'
          : index === 2
            ? 'CATEGORY'
            : 'SINGLE_CHOICE';
      const family = await row(
        'INSERT INTO questions(primary_competency_id) VALUES($1) RETURNING id',
        [competency.id],
      );
      const variant = await row(
        "INSERT INTO question_variants(question_id,variant_code,kind,origin) VALUES($1,$2,'ORIGINAL','TEST') RETURNING id",
        [family.id, suffix + '-' + index],
      );
      const key =
        type === 'CATEGORY'
          ? { categoryByStatementId: { A: 'Y', B: 'N', C: 'Y', D: 'N' } }
          : type === 'SINGLE_CHOICE'
            ? { optionId: 'A' }
            : { optionIds: ['A', 'B'] };
      const content =
        type === 'SINGLE_CHOICE'
          ? options
          : {
              options,
              categories:
                type === 'CATEGORY'
                  ? [
                      { id: 'Y', label: 'Ya' },
                      { id: 'N', label: 'Tidak' },
                    ]
                  : [],
            };
      const rubric =
        type === 'SINGLE_CHOICE'
          ? null
          : await row(
              "INSERT INTO scoring_rubric_versions(code,version,question_type,maximum_score_category,definition,digest,status,approved_by_user_id,approved_at) VALUES($1,1,$2,3,'{\"testOnly\":true}','TEST ONLY rubric','SEALED',$3,now()) RETURNING id",
              [suffix + '-rubric-' + index, type, reviewer.id],
            );
      const version = await row(
        'INSERT INTO question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,difficulty,scoring_rubric_version_id) VALUES($1,1,$2,\'{"text":"TEST ONLY"}\',$3::jsonb,$4::jsonb,\'{"text":"TEST ONLY explanation"}\',\'EASY\',$5) RETURNING id',
        [variant.id, type, JSON.stringify(content), JSON.stringify(key), rubric?.id ?? null],
      );
      versions.push(version.id);
      const item = await row(
        'INSERT INTO package_items(package_id,question_version_id,display_order,max_points) VALUES($1,$2,$3,1) RETURNING id',
        [pack.id, version.id, index + 1],
      );
      packageItemIds.push(item.id);
    }
    const attempt = await row(
      "INSERT INTO assessment_attempts(student_id,package_id,assessment_type,chapter_id_at_start,level_id_at_start,scoring_policy_version_id) VALUES($1,$2,'DRILL',$3,$4,$5) RETURNING id",
      [actor.id, pack.id, chapter.id, level.id, policy.id],
    );
    const itemIds: string[] = [];
    for (let index = 0; index < 10; index++) {
      const item = await row(
        'INSERT INTO attempt_items(attempt_id,package_id,package_item_id,question_version_id,display_order,max_points) VALUES($1,$2,$3,$4,$5,1) RETURNING id',
        [attempt.id, pack.id, packageItemIds[index]!, versions[index]!, index + 1],
      );
      itemIds.push(item.id);
    }
    const identity = {
      me: async (authorization?: string) => {
        if (!authorization) throw new UnauthorizedException();
        return {
          id: authorization === 'Bearer student' ? actor.id : fresh.id,
          role: authorization === 'Bearer teacher' ? 'TEACHER' : 'STUDENT',
        };
      },
    };
    const module = await Test.createTestingModule({ imports: [LearningModule] })
      .overrideProvider(IdentityService)
      .useValue(identity)
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const call = async (path: string, method = 'GET', input?: unknown, token = 'student') =>
      fetch(base + '/api/v1/' + path, {
        method,
        headers: {
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          'Content-Type': 'application/json',
        },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      });
    const path = 'assessment-attempts/' + attempt.id;
    expect((await call(path, 'GET', undefined, '')).status).toBe(401);
    expect((await call(path, 'GET', undefined, 'teacher')).status).toBe(403);
    expect((await call(path, 'GET', undefined, 'other')).status).toBe(404);
    const active = await (await call(path)).json();
    expect(active.questions.map((q: { type: string }) => q.type).slice(0, 3)).toEqual([
      'SINGLE_CHOICE',
      'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
      'CATEGORY',
    ]);
    expect(JSON.stringify(active)).not.toMatch(
      /answerKey|correctOptionId|explanation|awardedPoints/,
    );
    const answers = [
      { optionId: 'A' },
      { optionIds: ['B', 'A'] },
      { categoryByStatementId: { A: 'Y' } },
    ];
    for (let index = 0; index < 3; index++) {
      const response = await call(path + '/answers/' + itemIds[index], 'PATCH', {
        answer: answers[index],
      });
      expect(response.status).toBe(200);
      expect((await response.json()).answer).toEqual(
        index === 1 ? { optionIds: ['A', 'B'] } : answers[index],
      );
    }
    const resumed = await (await call(path)).json();
    expect(resumed.questions[2].answer).toEqual(answers[2]);
    const invalid = await call(path + '/answers/' + itemIds[1], 'PATCH', {
      answer: { optionIds: ['FOREIGN'] },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get('content-type')).toContain('application/problem+json');
    expect(
      (await call(path + '/answers/' + itemIds[0], 'PATCH', { answer: null, optionId: 'A' }))
        .status,
    ).toBe(400);
    expect((await call(path + '/answers/' + itemIds[0], 'PATCH', {})).status).toBe(400);
    expect((await call(path + '/answers/' + itemIds[0], 'PATCH', { optionId: null })).status).toBe(
      200,
    );
    expect(
      (await call(path + '/answers/' + itemIds[1], 'PATCH', { answer: { optionIds: [] } })).status,
    ).toBe(200);
    expect((await (await call(path)).json()).questions[1].answer).toBeNull();
    for (const index of [1, 2]) {
      expect((await call(path + '/answers/' + itemIds[index], 'PATCH', { answer: null })).status).toBe(200);
      expect((await (await call(path)).json()).questions[index].answer).toBeNull();
    }
    expect((await call(path + '/answers/' + itemIds[2], 'PATCH', { answer: answers[2] })).status).toBe(200);
    const submission = await call(path + '/submit', 'POST');
    expect(submission.status).toBe(503);
    expect((await submission.json()).code).toBe('PGK_SCORING_PENDING');
    expect(
      (await row('SELECT status FROM assessment_attempts WHERE id=$1', [attempt.id])).status,
    ).toBe('IN_PROGRESS');
    expect(
      (await row('SELECT count(*)::int AS n FROM xp_ledger WHERE attempt_id=$1', [attempt.id])).n,
    ).toBe(0);
    const start = await call('assessments/drill/attempts', 'POST', { levelId: level.id }, 'fresh');
    expect(start.status).toBe(503);
    expect((await start.json()).code).toBe('PGK_SCORING_PENDING');

    // Persisted TEST ONLY grading evidence, not an implemented/approved PGK rubric.
    await connection.unsafe(
      "UPDATE attempt_answers SET awarded_points=0.5,graded_at=now(),score_category=1,fully_correct=false,response_state='RESPONDED' WHERE attempt_item_id=$1",
      [itemIds[2]!],
    );
    await connection.unsafe(
      "UPDATE assessment_attempts SET status='GRADED',score_0_100=5,raw_points=0.5,finished_at=now() WHERE id=$1",
      [attempt.id],
    );
    const result = await (await call(path + '/result')).json();
    expect(result.questions[2].reviewStatus).toBe('partial');
    expect(result.questions[2].correctEquivalent).toBeNull();
    expect(result.reward).toBeNull();
    expect((await call(path + '/answers/' + itemIds[2], 'PATCH', { answer: null })).status).toBe(
      409,
    );
  }, 60_000);
  it('reads STANDARD only from a published canonical batch, keeps history consistent and hides unpublished evidence', async () => {
    const connection = db!;
    const row = async (query: string, params: (string | number | null)[] = []) =>
      (await connection.unsafe(query, params))[0]!;
    const key = randomUUID();
    const actor = await row(
      "INSERT INTO users(auth_user_id,role,display_name,email) VALUES($1,'STUDENT','TEST ONLY release',$2) RETURNING id",
      [randomUUID(), key + '@example.test'],
    );
    const version = await row(
      "SELECT id FROM question_versions WHERE question_type='SINGLE_CHOICE' ORDER BY created_at LIMIT 1",
    );
    const policy = await row(
      "SELECT id FROM scoring_policy_versions WHERE policy_code='TRYOUT_PRD_V06' AND version=1",
    );
    const pack = await row(
      "INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,is_demo,scoring_policy_version_id) VALUES($1,1,'TEST ONLY canonical published read','TRYOUT',true,$2) RETURNING id",
      [key, policy.id],
    );
    const item = await row(
      'INSERT INTO package_items(package_id,question_version_id,display_order,max_points) VALUES($1,$2,1,1) RETURNING id',
      [pack.id, version.id],
    );
    const attempt = await row(
      "INSERT INTO assessment_attempts(student_id,package_id,assessment_type,scoring_policy_version_id) VALUES($1,$2,'TRYOUT',$3) RETURNING id",
      [actor.id, pack.id, policy.id],
    );
    const instance = await row(
      'INSERT INTO attempt_items(attempt_id,package_id,package_item_id,question_version_id,display_order,max_points) VALUES($1,$2,$3,$4,1,1) RETURNING id',
      [attempt.id, pack.id, item.id, version.id],
    );
    await row(
      'INSERT INTO attempt_answers(attempt_item_id,answer,awarded_points,graded_at) VALUES($1,\'{"optionId":"A"}\',1,now()) RETURNING id',
      [instance.id],
    );
    await connection.unsafe(
      "UPDATE assessment_attempts SET status='GRADED',finished_at=now(),raw_points=1,score_0_100=100 WHERE id=$1",
      [attempt.id],
    );
    const batch = await row(
      "INSERT INTO tryout_batches(package_id,starts_at,closes_at,cutoff_at,result_due_at,status,release_policy,release_policy_digest) VALUES($1,now()-interval '4 days',now()-interval '3 days',now()-interval '3 days',now(),'CLOSED','{\"testOnly\":true}','TEST ONLY release') RETURNING id",
      [pack.id],
    );
    const finalization = await row(
      'INSERT INTO tryout_result_finalizations(batch_id,version,mode,scoring_policy_version_id,policy_snapshot,digest) VALUES($1,1,\'FALLBACK\',$2,\'{"testOnly":true,"reasonCode":"IRT_DEADLINE_EXCEEDED","privateException":"TEST ONLY private"}\',\'TEST ONLY finalization\') RETURNING id',
      [batch.id, policy.id],
    );
    await row(
      "INSERT INTO tryout_finalization_items(finalization_id,question_version_id,included,max_points,reason) VALUES($1,$2,true,1,'TEST ONLY') RETURNING id",
      [finalization.id, version.id],
    );
    await row(
      'INSERT INTO tryout_attempt_results(finalization_id,attempt_id,score,raw_points,maximum_points,coverage) VALUES($1,$2,75,1,1,\'{"testOnly":true}\') RETURNING id',
      [finalization.id, attempt.id],
    );
    const { TryoutService } = await import('./tryout.service');
    const { TryoutReleaseService } = await import('./tryout-release.service');
    const { AssessmentHistoryService } = await import('./assessment-history.service');
    const identity = {
      me: async () => ({ id: actor.id, role: 'STUDENT' }),
    } as unknown as IdentityService;
    const releases = new TryoutReleaseService();
    const service = new TryoutService(identity, releases);
    await expect(service.result('TEST', attempt.id)).rejects.toMatchObject({
      response: { code: 'TRYOUT_RESULT_PENDING' },
    });
    await connection.unsafe(
      'UPDATE tryout_result_finalizations SET published_at=now() WHERE id=$1',
      [finalization.id],
    );
    const result = await service.result('TEST', attempt.id);
    expect(result).toMatchObject({ score: 75, resultMethod: 'STANDARD', xp: null, xpDetail: null });
    expect(result.resultMethodReason).toContain('batas waktu');
    expect(JSON.stringify(result)).not.toContain('privateException');
    const history = await new AssessmentHistoryService(identity, releases).list('TEST');
    expect(history.records.find((record) => record.attemptId === attempt.id)).toMatchObject({
      score: 75,
      resultState: 'ready',
    });
    expect(
      (await row('SELECT score_0_100 FROM assessment_attempts WHERE id=$1', [attempt.id]))
        .score_0_100,
    ).toBe('100.00');
  });
});
