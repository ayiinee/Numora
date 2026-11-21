import { Injectable } from '@nestjs/common';
import { getDatabase } from '@tka/database';
import type { ContentPageDto } from '../content/content.dto';
import type { IrtBatchHealthListDto, IrtOperationalOptionsDto } from './irt-operations.dto';
@Injectable()
export class IrtOperationsService {
  async options(): Promise<IrtOperationalOptionsDto> {
    const rows = await getDatabase().client<
      {
        approval_id: string;
        approved_digest: string;
        code: string;
        version: number;
        kind: string;
        context_id: string | null;
        approved_at: Date;
      }[]
    >`
      SELECT a.id AS approval_id,a.approved_digest,t.code,t.version,t.kind,a.scope->>'contextId' AS context_id,a.approved_at
      FROM configuration_approvals a JOIN irt_compute.technical_policy_versions t ON t.id=a.technical_policy_version_id
      WHERE a.revoked_at IS NULL AND t.status='SEALED' AND a.approved_digest=t.digest AND a.scope->>'ecosystem'='TRYOUT'
      AND t.kind IN ('IRT_MODEL','QUALITY_GATE') ORDER BY t.kind,t.code,t.version DESC,a.id`;
    return {
      enabled: process.env.IRT_V3_ENABLED === 'true',
      configurations: rows.map((r) => ({
        approvalId: r.approval_id,
        digest: r.approved_digest,
        code: r.code,
        version: r.version,
        kind: r.kind,
        contextId: r.context_id,
        approvedAt: new Date(r.approved_at).toISOString(),
      })),
    };
  }
  async health(page: ContentPageDto): Promise<IrtBatchHealthListDto> {
    const client = getDatabase().client;
    const rows = await client<
      {
        id: string;
        package_id: string;
        name: string;
        status: string;
        context_id: string | null;
        closes_at: Date;
        result_due_at: Date;
        overdue: boolean;
        active_count: number;
        graded_count: number;
        frozen: boolean;
        closed: boolean;
        configurations_ready: boolean;
        policy: boolean;
        rubric_missing: boolean;
        adopted: boolean;
        mode: string | null;
        version: number | null;
        published_at: Date | null;
        request_status: string | null;
        execution_status: string | null;
        execution_failure_code: string | null;
        delivery_blocker: string | null;
        respondent_count: number;
        scored_count: number;
        insufficient_count: number;
        not_comparable_count: number;
        unscorable_count: number;
        execution_age_seconds: number | null;
      }[]
    >`
      SELECT b.id,b.package_id,p.name,b.status,c.id AS context_id,b.closes_at,b.result_due_at,
      b.result_due_at<clock_timestamp() AND f.id IS NULL AS overdue,p.frozen_at IS NOT NULL AND p.manifest_digest IS NOT NULL AS frozen,
      b.status='CLOSED' AND b.cutoff_at<=clock_timestamp() AS closed,
      (SELECT count(DISTINCT t.kind)=2 FROM configuration_approvals a JOIN irt_compute.technical_policy_versions t ON t.id=a.technical_policy_version_id WHERE a.revoked_at IS NULL AND t.status='SEALED' AND a.approved_digest=t.digest AND a.scope->>'ecosystem'='TRYOUT' AND (a.scope->>'contextId' IS NULL OR a.scope->>'contextId'=c.id::text) AND t.kind IN ('IRT_MODEL','QUALITY_GATE')) AS configurations_ready,
      b.release_policy IS NOT NULL AND b.release_policy_digest IS NOT NULL AS policy,
      (SELECT count(*)::int FROM assessment_attempts a WHERE a.package_id=b.package_id AND a.purpose='REGULAR' AND a.status IN ('IN_PROGRESS','SUBMITTED')) AS active_count,
      (SELECT count(*)::int FROM assessment_attempts a WHERE a.package_id=b.package_id AND a.purpose='REGULAR' AND a.status='GRADED') AS graded_count,
      EXISTS(SELECT 1 FROM package_items i LEFT JOIN scoring_rubric_versions r ON r.id=i.rubric_version_id WHERE i.package_id=b.package_id AND (r.id IS NULL OR r.status<>'SEALED')) AS rubric_missing,
      EXISTS(SELECT 1 FROM analysis_requests r WHERE r.context_id=c.id AND r.request_type='CALIBRATE_TRYOUT' AND r.status='COMPLETED' AND r.accepted_execution_id IS NOT NULL) AS adopted,
      f.mode,f.version,f.published_at,
      req.status AS request_status,exec.status AS execution_status,exec.failure_code AS execution_failure_code,
      dp.blocker AS delivery_blocker,
      coalesce(result_counts.respondent_count,0)::int AS respondent_count,
      coalesce(result_counts.scored_count,0)::int AS scored_count,
      coalesce(result_counts.insufficient_count,0)::int AS insufficient_count,
      coalesce(result_counts.not_comparable_count,0)::int AS not_comparable_count,
      coalesce(result_counts.unscorable_count,0)::int AS unscorable_count,
      CASE WHEN exec.started_at IS NULL THEN NULL ELSE extract(epoch FROM clock_timestamp()-exec.started_at)::double precision END AS execution_age_seconds
      FROM tryout_batches b JOIN assessment_packages p ON p.id=b.package_id
      LEFT JOIN LATERAL (SELECT id FROM measurement_contexts WHERE tryout_batch_id=b.id ORDER BY revision DESC,id LIMIT 1) c ON true
      LEFT JOIN tryout_result_finalizations f ON f.batch_id=b.id AND f.published_at<=clock_timestamp()
      LEFT JOIN LATERAL (SELECT r.id,r.status,r.accepted_execution_id FROM analysis_requests r WHERE r.context_id=c.id AND r.request_type='CALIBRATE_TRYOUT' ORDER BY r.created_at DESC,r.id DESC LIMIT 1) req ON true
      LEFT JOIN LATERAL (SELECT e.status,e.failure_code,e.started_at FROM irt_compute.compute_executions e WHERE e.id=req.accepted_execution_id OR e.request_id=req.id ORDER BY e.attempt_number DESC LIMIT 1) exec ON true
      LEFT JOIN irt_delivery_progress_v1 dp ON dp.batch_id=b.id
      LEFT JOIN LATERAL (SELECT count(*)::int AS respondent_count,
        count(*) FILTER (WHERE result_mode='IRT')::int AS scored_count,
        count(*) FILTER (WHERE result_mode='INSUFFICIENT')::int AS insufficient_count,
        count(*) FILTER (WHERE result_mode='NOT_COMPARABLE')::int AS not_comparable_count,
        count(*) FILTER (WHERE result_mode='UNSCORABLE')::int AS unscorable_count
        FROM tryout_attempt_results ar JOIN tryout_result_finalizations fr ON fr.id=ar.finalization_id
        WHERE fr.batch_id=b.id) result_counts ON true
      ORDER BY b.closes_at DESC,b.id DESC LIMIT ${page.limit} OFFSET ${page.offset}`;
    return {
      items: rows.map((r) => {
        const prepareBlockers: string[] = [];
        if (process.env.IRT_V3_ENABLED !== 'true') prepareBlockers.push('IRT_V3_DISABLED');
        if (!r.context_id) prepareBlockers.push('MEASUREMENT_CONTEXT_MISSING');
        if (!r.closed) prepareBlockers.push('BATCH_NOT_CLOSED');
        if (!r.configurations_ready) prepareBlockers.push('CONFIGURATION_APPROVALS_MISSING');
        if (!r.graded_count) prepareBlockers.push('IRT_DATASET_EMPTY');
        if (r.active_count) prepareBlockers.push('ATTEMPTS_NOT_FINALIZED');
        if (!r.frozen) prepareBlockers.push('SCIENTIFIC_PACKAGE_NOT_FROZEN');
        if (!r.policy) prepareBlockers.push('RELEASE_POLICY_NOT_APPROVED');
        if (r.rubric_missing) prepareBlockers.push('SEALED_RUBRIC_MISSING');
        const publicationBlockers = r.published_at
          ? []
          : [
              ...(!r.policy ? ['RELEASE_POLICY_NOT_APPROVED'] : []),
              ...(!r.adopted ? ['SCIENTIFIC_ARTIFACT_NOT_ADOPTED'] : []),
              'RESPONDENT_CONTRACT_NOT_APPROVED',
            ];
        return {
          id: r.id,
          packageId: r.package_id,
          title: r.name,
          status: r.status,
          contextId: r.context_id,
          closesAt: new Date(r.closes_at).toISOString(),
          dueAt: new Date(r.result_due_at).toISOString(),
          overdue: r.overdue,
          activeAttemptCount: r.active_count,
          finalizedAttemptCount: r.graded_count,
          publicationMode: r.mode,
          publicationVersion: r.version,
          publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
          prepareBlockers,
          publicationBlockers,
          requestStatus: r.request_status,
          executionStatus: r.execution_status,
          executionFailureCode: r.execution_failure_code,
          deliveryBlocker: r.delivery_blocker,
          respondentCount: r.respondent_count,
          scoredCount: r.scored_count,
          insufficientCount: r.insufficient_count,
          notComparableCount: r.not_comparable_count,
          unscorableCount: r.unscorable_count,
          executionAgeSeconds: r.execution_age_seconds,
        };
      }),
      flags: {
        intakeEnabled: process.env.IRT_V3_ENABLED === 'true',
        deliveryEnabled: process.env.NUMORA_IRT_DELIVERY_ENABLED === 'true',
        releaseEnabled: process.env.NUMORA_IRT_RELEASE_ENABLED === 'true',
        publicationEnabled: process.env.NUMORA_IRT_PUBLICATION_ENABLED === 'true',
        reconcilerEnabled: process.env.NUMORA_IRT_DELIVERY_RECONCILER_ENABLED === 'true',
      },
    };
  }
}
