// @ts-expect-error Shared server-mode boundary is JavaScript.
import { assertIrtEnabled, assertIrtDatabase, irtPurpose } from '../src/runtime-mode.mjs';
import type { Sql } from 'postgres';
// @ts-expect-error Existing research adapter is shared JavaScript.
import * as research from '../src/calibration-research.mjs';
import { adoptTryoutArtifactV1 } from './adoption-v1.js';
import { prepareTryoutReleaseV1 } from './tryout-release-v1.js';

export async function reconcileTryoutDeliveryV1(sql: Sql) {
  if (process.env.NUMORA_IRT_DELIVERY_RECONCILER_ENABLED !== 'true') return { processed: 0 };
  assertIrtEnabled();
  if (process.env.NUMORA_IRT_DELIVERY_ENABLED !== 'true') throw new Error('IRT_DELIVERY_DISABLED');
  await assertIrtDatabase(sql);
  const rows = await sql<{ batch_id: string; configuration: { releaseApprovalId: string } }[]>`
    SELECT binding.batch_id,binding.configuration FROM irt_delivery_bindings_v1 binding
    JOIN tryout_batches b ON b.id=binding.batch_id WHERE b.cutoff_at<=clock_timestamp() AND b.cancelled_at IS NULL
    AND binding.configuration#>>'{runtime,purpose}'=${irtPurpose()}
    AND NOT EXISTS(SELECT 1 FROM tryout_result_finalizations f WHERE f.batch_id=b.id AND f.published_at IS NOT NULL)
    ORDER BY b.result_due_at,b.id LIMIT 20`;
  let processed = 0;
  for (const row of rows) {
    try {
      const frozen = await research.freezeBoundCalibrationDelivery(sql, row.batch_id, {
        secret: process.env.NUMORA_IRT_PSEUDONYM_SECRET,
        keyVersion: process.env.NUMORA_IRT_PSEUDONYM_KEY_VERSION,
      });
      const [terminal] = await sql`SELECT j.status FROM irt_calibration_inputs_v1 source
        JOIN irt_compute.calibration_jobs_v1 j ON j.request_id=source.id AND j.generation=source.current_generation
        WHERE source.id=${frozen.requestId} AND j.status IN ('SUCCEEDED','FAILED')`;
      if (terminal?.status === 'SUCCEEDED') await adoptTryoutArtifactV1(sql, frozen.requestId);
      const [deadline] =
        await sql`SELECT result_due_at<=clock_timestamp() AS overdue FROM tryout_batches WHERE id=${row.batch_id}`;
      if (terminal || deadline?.overdue)
        await prepareTryoutReleaseV1(
          sql,
          row.batch_id,
          frozen.requestId,
          row.configuration.releaseApprovalId,
        );
      await sql`UPDATE irt_delivery_progress_v1 SET blocker=NULL,updated_at=clock_timestamp() WHERE batch_id=${row.batch_id}`;
      processed++;
    } catch (error) {
      const code =
        error instanceof Error && /^IRT_[A-Z0-9_]+$/.test(error.message)
          ? error.message
          : 'IRT_DELIVERY_RECONCILE_FAILED';
      await sql`INSERT INTO irt_delivery_progress_v1(batch_id,blocker) VALUES(${row.batch_id},${code})
        ON CONFLICT(batch_id) DO UPDATE SET blocker=excluded.blocker,updated_at=clock_timestamp()`;
    }
  }
  if (
    process.env.NUMORA_IRT_COMPUTE_URL &&
    (irtPurpose() === 'PRODUCTION'
      ? process.env.NUMORA_IRT_TOKEN
      : process.env.NUMORA_IRT_RESEARCH_TOKEN)
  )
    await research.deliverPendingCalibrationResearch(sql, {
      url: process.env.NUMORA_IRT_COMPUTE_URL,
      token: (irtPurpose() === 'PRODUCTION'
        ? process.env.NUMORA_IRT_TOKEN
        : process.env.NUMORA_IRT_RESEARCH_TOKEN)!,
    });
  return { processed };
}
