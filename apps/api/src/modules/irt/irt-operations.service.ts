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
      f.mode,f.version,f.published_at
      FROM tryout_batches b JOIN assessment_packages p ON p.id=b.package_id
      LEFT JOIN LATERAL (SELECT id FROM measurement_contexts WHERE tryout_batch_id=b.id ORDER BY revision DESC,id LIMIT 1) c ON true
      LEFT JOIN tryout_result_finalizations f ON f.batch_id=b.id AND f.published_at<=clock_timestamp()
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
        };
      }),
    };
  }
}
