import type { Sql } from 'postgres';
import type { ComputeNotificationV3 } from '@tka/database';
import { adoptTryoutArtifact, requireIrtEnabled } from './orchestration.js';

export async function pendingComputeNotifications(
  client: Sql,
  limit = 100,
): Promise<ComputeNotificationV3[]> {
  requireIrtEnabled();
  const rows = await client<{ id: string; input_digest: string; generation: number }[]>`
    SELECT r.id,r.input_digest,d.generation FROM analysis_requests r
    JOIN LATERAL (SELECT id,generation FROM analysis_request_dispatches WHERE request_id=r.id ORDER BY generation DESC LIMIT 1) d ON true
    JOIN analytics_outbox o ON o.entity_id=r.id AND o.event_name='analysis.requested'
    JOIN outbox_deliveries delivery ON delivery.outbox_id=o.id AND delivery.consumer='irt_compute'
    WHERE r.status='PENDING' AND r.request_type='CALIBRATE_TRYOUT'
    AND (delivery.retry_at IS NULL OR delivery.retry_at<=clock_timestamp())
    AND (delivery.delivered_at IS NULL OR delivery.delivered_at<=clock_timestamp()-interval '60 seconds')
    AND NOT EXISTS(SELECT 1 FROM irt_compute.compute_executions WHERE dispatch_id=d.id)
    ORDER BY r.created_at,r.id LIMIT ${limit}`;
  return rows.map((r) => ({
    contractVersion: 3,
    requestId: r.id,
    inputDigest: r.input_digest,
    dispatchGeneration: r.generation,
  }));
}

export async function recordNotificationDelivery(
  client: Sql,
  notification: ComputeNotificationV3,
  failed = false,
) {
  await client`UPDATE outbox_deliveries d SET attempts=attempts+1,
    delivered_at=CASE WHEN ${failed} THEN delivered_at ELSE clock_timestamp() END,
    retry_at=CASE WHEN ${failed} THEN clock_timestamp()+interval '5 minutes' ELSE NULL END,
    failure_code=CASE WHEN ${failed} THEN 'IRT_NOTIFICATION_DELIVERY_FAILED' ELSE NULL END
    FROM analytics_outbox o WHERE d.outbox_id=o.id AND d.consumer='irt_compute' AND o.entity_id=${notification.requestId} AND o.event_name='analysis.requested'
    AND (SELECT max(generation) FROM analysis_request_dispatches WHERE request_id=${notification.requestId})=${notification.dispatchGeneration}`;
}

export async function reconcileTryoutArtifacts(client: Sql, limit = 100) {
  requireIrtEnabled();
  const rows = await client<{ id: string }[]>`SELECT r.id FROM analysis_requests r
    JOIN LATERAL (SELECT status FROM irt_compute.compute_executions WHERE request_id=r.id ORDER BY attempt_number DESC LIMIT 1) e ON true
    WHERE r.request_type='CALIBRATE_TRYOUT' AND r.status='RUNNING' AND e.status='SUCCEEDED'
    AND EXISTS(SELECT 1 FROM analysis_request_dispatches WHERE request_id=r.id)
    ORDER BY r.created_at,r.id LIMIT ${limit}`;
  let adopted = 0,
    failed = 0;
  for (const row of rows) {
    try {
      if ((await adoptTryoutArtifact(client, row.id)).adopted) adopted++;
    } catch {
      failed++;
    }
  }
  return { adopted, failed };
}
