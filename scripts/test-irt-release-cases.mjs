// Synthetic disposable integration only; invoked after a real sealed compute artifact.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from '../packages/database/node_modules/postgres/src/index.js';
import { adoptTryoutArtifactV1 } from '../packages/irt-orchestration/dist/adoption-v1.js';
import {
  prepareTryoutReleaseV1,
  publishTryoutReleaseV1,
} from '../packages/irt-orchestration/dist/tryout-release-v1.js';
import { RESEARCH_RELEASE_POLICY_V1 } from '../packages/irt-orchestration/dist/release-decisions-v1.js';
import {
  publishedTryoutAttemptResults,
  releasedTryoutPackageIds,
} from '../packages/database/dist/tryout-visibility.js';
import { getDatabase } from '../packages/database/dist/client.js';
const requestId = process.argv[2];
for (const name of ['IRT_VERIFY_URL', 'IRT_FIXTURE_URL']) {
  const u = new URL(process.env[name]);
  assert.equal(u.hostname, '127.0.0.1');
  assert.match(u.pathname, /^\/irt_research_test_[a-zA-Z0-9_]+$/);
}
Object.assign(process.env, {
  NUMORA_IRT_RESEARCH_ENABLED: 'true',
  NUMORA_IRT_RELEASE_ENABLED: 'true',
  NUMORA_IRT_PUBLICATION_ENABLED: 'true',
});
const readerUrl = new URL(process.env.IRT_VERIFY_URL);
readerUrl.searchParams.set('sslmode', 'disable');
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: readerUrl.toString(),
  ALLOW_SYNTHETIC_CONTENT: 'false',
});
const db = postgres(process.env.IRT_VERIFY_URL, { max: 4, onnotice: () => {} });
const fixture = postgres(process.env.IRT_FIXTURE_URL, { max: 1, onnotice: () => {} });
const integrity = async () => {
  const result = {};
  for (const table of ['assessment_attempts', 'attempt_answers', 'xp_ledger']) {
    const [r] =
      await fixture`SELECT irt_compute.payload_digest(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)) AS digest FROM ${fixture(table)} t`;
    result[table] = r.digest;
  }
  return result;
};
try {
  const [r] = await fixture`SELECT * FROM irt_calibration_requests_v1 WHERE id=${requestId}`;
  assert.ok(r);
  const batchId = r.body.context.batchId;
  const [actor] =
    await fixture`SELECT actor_user_id FROM irt_calibration_dispatches_v1 WHERE request_id=${requestId} LIMIT 1`;
  const body = fixture.json(RESEARCH_RELEASE_POLICY_V1);
  const [p] =
    await fixture`INSERT INTO irt_compute.technical_policy_versions(code,version,kind,definition,digest,status)
    VALUES(${randomUUID()},1,'IRT_FALLBACK',${body}::jsonb,irt_compute.payload_digest(${body}::jsonb),'SEALED') RETURNING id,digest`;
  const [a] =
    await fixture`INSERT INTO configuration_approvals(technical_policy_version_id,approved_digest,scope,approved_by_user_id,approved_at)
    VALUES(${p.id},${p.digest},${fixture.json({ purpose: 'RESEARCH_ONLY', ecosystem: 'TRYOUT', contextId: r.context_id })}::jsonb,${actor.actor_user_id},now()) RETURNING id`;
  const release = fixture.json({ approvalId: a.id, purpose: 'RESEARCH_ONLY' });
  await fixture`UPDATE tryout_batches SET status='CLOSED',starts_at=now()-interval '5 days',closes_at=now()-interval '4 days',cutoff_at=now()-interval '4 days',result_due_at=now()-interval '1 day',
    release_policy=${release}::jsonb,release_policy_digest=irt_compute.payload_digest(${release}::jsonb) WHERE id=${batchId}`;
  const before = await integrity();
  const attempts = r.body.respondents.map((x) => x.attemptId),
    packages = r.body.packages.map((x) => x.packageId);
  assert.equal((await publishedTryoutAttemptResults(attempts)).size, 0);
  assert.equal((await releasedTryoutPackageIds(packages)).size, 0);
  const adopted = await adoptTryoutArtifactV1(db, requestId);
  if (process.env.IRT_RELEASE_EXPECT_FAILURE === 'true') {
    assert.equal(adopted.adopted, false);
    const [receipts] =
      await db`SELECT count(*)::int AS count FROM irt_artifact_adoption_receipts_v1 WHERE request_id=${requestId}`;
    assert.equal(receipts.count, 0);
  } else {
    assert.equal(adopted.adopted, true);
    const replays = await Promise.all([
      adoptTryoutArtifactV1(db, requestId),
      adoptTryoutArtifactV1(db, requestId),
    ]);
    assert.ok(replays.every((x) => x.replay && x.receiptId === adopted.receiptId));
  }
  if (process.env.IRT_RELEASE_BLOCK === 'COVERAGE') {
    await assert.rejects(
      prepareTryoutReleaseV1(db, batchId, requestId, a.id),
      /IRT_RELEASE_COVERAGE_BELOW_POLICY/,
    );
    assert.equal((await publishedTryoutAttemptResults(attempts)).size, 0);
    assert.deepEqual(await integrity(), before);
    console.log(
      JSON.stringify({
        purpose: 'RESEARCH_ONLY',
        blocked: 'COVERAGE',
        canonicalPublication: false,
        readerLocked: true,
        exactHistoryPreserved: true,
      }),
    );
  } else {
    const ready = await prepareTryoutReleaseV1(db, batchId, requestId, a.id);
    assert.equal(ready.status, 'READY');
    assert.equal((await prepareTryoutReleaseV1(db, batchId, requestId, a.id)).replay, true);
    const [locked] = await db`SELECT status FROM tryout_batches WHERE id=${batchId}`;
    assert.equal(locked.status, 'CLOSED');
    await assert.rejects(
      db`UPDATE tryout_attempt_results SET score=-1 WHERE finalization_id=${ready.finalizationId}`,
    );
    if (['CANCEL', 'REVOKE'].includes(process.env.IRT_RELEASE_BLOCK ?? '')) {
      if (process.env.IRT_RELEASE_BLOCK === 'CANCEL')
        await fixture`INSERT INTO irt_calibration_cancellations_v1(request_id,actor_user_id) VALUES(${requestId},${actor.actor_user_id})`;
      else await fixture`UPDATE configuration_approvals SET revoked_at=now() WHERE id=${a.id}`;
      await assert.rejects(publishTryoutReleaseV1(db, ready.finalizationId));
      assert.equal((await publishedTryoutAttemptResults(attempts)).size, 0);
      assert.equal((await releasedTryoutPackageIds(packages)).size, 0);
      assert.deepEqual(await integrity(), before);
      console.log(
        JSON.stringify({
          purpose: 'RESEARCH_ONLY',
          blocked: process.env.IRT_RELEASE_BLOCK,
          canonicalPublication: false,
          readerLocked: true,
          exactHistoryPreserved: true,
        }),
      );
      process.exitCode = 0;
    } else {
      const published = await Promise.all([
        publishTryoutReleaseV1(db, ready.finalizationId),
        publishTryoutReleaseV1(db, ready.finalizationId),
      ]);
      assert.ok(published.every((x) => x.status === 'PUBLISHED'));
      assert.equal(published.filter((x) => !x.replay).length, 1);
      await assert.rejects(
        db`DELETE FROM tryout_attempt_results WHERE finalization_id=${ready.finalizationId}`,
      );
      assert.equal(
        (await prepareTryoutReleaseV1(db, batchId, requestId, a.id)).status,
        'PUBLISHED',
      );
      const results =
        await db`SELECT result_mode,count(*)::int AS count FROM tryout_attempt_results WHERE finalization_id=${ready.finalizationId} GROUP BY result_mode`;
      assert.equal(
        results.reduce((n, x) => n + x.count, 0),
        r.body.respondents.length,
      );
      assert.equal((await publishedTryoutAttemptResults(attempts)).size, attempts.length);
      if (process.env.IRT_RELEASE_BLOCK === 'ZERO') {
        assert.ok(results.every((x) => x.result_mode === 'UNSCORABLE'));
        assert.ok(
          [...(await publishedTryoutAttemptResults(attempts)).values()].every(
            (x) => x.score === null,
          ),
        );
      }
      assert.equal((await releasedTryoutPackageIds(packages)).size, packages.length);
      assert.deepEqual(await integrity(), before);
      const [events] =
        await db`SELECT count(*)::int AS count FROM analytics_outbox WHERE entity_id=${batchId} AND event_name='tryout.batch_published'`;
      assert.equal(events.count, 1);
      console.log(
        JSON.stringify({
          purpose: 'RESEARCH_ONLY',
          canonicalPublication: true,
          attemptCount: r.body.respondents.length,
          modes: results,
          technicalFailure: process.env.IRT_RELEASE_EXPECT_FAILURE === 'true',
          adoptionReplay: adopted.adopted,
          publicationReplay: true,
          readerGate: true,
          exactHistoryPreserved: true,
        }),
      );
    }
  }
} finally {
  await db.end();
  await fixture.end();
  await getDatabase().client.end();
}
