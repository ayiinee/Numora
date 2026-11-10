// Isolated integration assertions against the restricted Main role, never a shared database.
import assert from 'node:assert/strict';
import postgres from '../packages/database/node_modules/postgres/src/index.js';
import { adoptTryoutArtifactV1 } from '../packages/irt-orchestration/dist/adoption-v1.js';
import { finalizeTryoutArtifactV1 } from '../packages/irt-orchestration/dist/finalization-v1.js';
for (const key of ['IRT_VERIFY_URL', 'IRT_FIXTURE_URL']) {
  const u = new URL(process.env[key]);
  assert.equal(u.hostname, '127.0.0.1');
  assert.match(u.pathname, /^\/irt_research_test_[a-zA-Z0-9_]+$/);
}
process.env.NUMORA_IRT_RESEARCH_ENABLED = 'true';
const db = postgres(process.env.IRT_VERIFY_URL, { max: 4, onnotice: () => {} });
const fixture = postgres(process.env.IRT_FIXTURE_URL, { max: 1, onnotice: () => {} });
const requestId = process.argv[2];
try {
  const before =
    await fixture`SELECT a.id,to_jsonb(a) AS value FROM assessment_attempts a ORDER BY id`;
  const xp = await fixture`SELECT to_jsonb(x) AS value FROM xp_ledger x ORDER BY id`;
  const [r] = await db`SELECT * FROM irt_calibration_requests_v1 WHERE id=${requestId}`;
  if (process.env.IRT_ADOPTION_BLOCK === 'REVOKE') {
    await fixture`UPDATE configuration_approvals SET revoked_at=clock_timestamp() WHERE id=${r.resources.model.ref.approvalId}`;
    await assert.rejects(adoptTryoutArtifactV1(db, requestId), /IRT_V1_AUTHORIZATION_STALE/);
    assert.equal(
      (await db`SELECT * FROM irt_artifact_adoption_receipts_v1 WHERE request_id=${requestId}`)
        .length,
      0,
    );
    console.log(JSON.stringify({ blocked: 'REVOKE', noReceipt: true }));
  } else {
    const [sealed] =
      await db`SELECT a.id,j.execution_id,a.digest FROM irt_compute.calibration_artifacts_v1 a JOIN irt_compute.calibration_jobs_v1 j ON j.id=a.job_id WHERE j.request_id=${requestId}`;
    await assert.rejects(
      db.begin(
        (
          tx,
        ) => tx`INSERT INTO irt_artifact_adoption_receipts_v1(request_id,execution_id,artifact_id,artifact_digest,status)
  VALUES(${requestId},${sealed.execution_id},${sealed.id},${sealed.digest},'RECEIVED')`,
      ),
      /Partial adoption cannot commit/,
    );
    const adopted = await adoptTryoutArtifactV1(db, requestId);
    assert.equal(adopted.adopted, true);
    const replay = await Promise.all([
      adoptTryoutArtifactV1(db, requestId),
      adoptTryoutArtifactV1(db, requestId),
    ]);
    assert.ok(replay.every((x) => x.replay && x.receiptId === adopted.receiptId));
    const [receipt] =
      await db`SELECT * FROM irt_artifact_adoption_receipts_v1 WHERE id=${adopted.receiptId}`;
    const rows =
      await db`SELECT * FROM irt_artifact_adoption_attempts_v1 WHERE receipt_id=${receipt.id}`;
    assert.equal(rows.length, r.body.respondents.length);
    for (const row of rows) {
      const pin = r.body.respondents.find((p) => p.attemptId === row.attempt_id);
      assert.equal(row.assigned_arm_id, pin.assignedArmId);
      assert.equal(row.delivered_arm_id, pin.deliveredArmId);
    }
    const reject = async (callback) =>
      assert.rejects(
        db.begin(async (tx) => {
          await callback(tx);
        }),
        /immutable|Receipt|receipt|evidence/,
      );
    await reject(
      (tx) =>
        tx`UPDATE irt_artifact_adoption_receipts_v1 SET status='FAILED',failure_code='CONFLICT' WHERE id=${receipt.id}`,
    );
    await reject(
      (tx) =>
        tx`UPDATE irt_artifact_adoption_receipts_v1 SET artifact_digest=repeat('f',64) WHERE id=${receipt.id}`,
    );
    await reject(
      (tx) =>
        tx`UPDATE irt_artifact_adoption_attempts_v1 SET result_status='UNSCORABLE' WHERE receipt_id=${receipt.id}`,
    );
    await reject(
      (tx) =>
        tx`UPDATE irt_artifact_adoption_packages_v1 SET manifest_digest='tampered' WHERE receipt_id=${receipt.id}`,
    );
    await reject(
      (
        tx,
      ) => tx`INSERT INTO irt_artifact_adoption_receipts_v1(request_id,status) VALUES(${requestId},'FAILED')
  ON CONFLICT(request_id) DO UPDATE SET status='FAILED'`,
    );
    await assert.rejects(
      fixture`DELETE FROM irt_artifact_adoption_attempts_v1 WHERE receipt_id=${receipt.id}`,
      /immutable/,
    );
    await assert.rejects(
      fixture`DELETE FROM irt_artifact_adoption_receipts_v1 WHERE id=${receipt.id}`,
      /immutable/,
    );
    const run = await finalizeTryoutArtifactV1(db, receipt.id);
    assert.equal(run.status, 'READY');
    await fixture`UPDATE configuration_approvals SET revoked_at=clock_timestamp() WHERE id=${r.resources.model.ref.approvalId}`;
    await assert.rejects(adoptTryoutArtifactV1(db, requestId), /IRT_V1_AUTHORIZATION_STALE/);
    const [after] =
      await db`SELECT * FROM irt_artifact_adoption_receipts_v1 WHERE id=${receipt.id}`;
    assert.deepEqual(after, receipt);
    assert.deepEqual(
      await fixture`SELECT a.id,to_jsonb(a) AS value FROM assessment_attempts a ORDER BY id`,
      before,
    );
    assert.deepEqual(await fixture`SELECT to_jsonb(x) AS value FROM xp_ledger x ORDER BY id`, xp);
    console.log(
      JSON.stringify({
        canonicalArtifactAccepted: true,
        attemptCount: rows.length,
        parallelReplay: true,
        receiptAndChildrenImmutable: true,
        failedUpsertPreservesReceipt: true,
        staleApprovalPreservesReceipt: true,
        partialCommitRejected: true,
        staging: true,
        historyAndXpUnchanged: true,
      }),
    );
  }
} finally {
  await db.end();
  await fixture.end();
}
