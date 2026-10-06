import { ConflictException, Injectable } from '@nestjs/common';
import { getDatabase, scoringPolicyVersions } from '@tka/database';
import {
  readApprovedPolicy,
  isCanonicalPolicy,
  CANONICAL_POLICY_APPROVAL,
} from '@tka/assessment-engine';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AdminTransaction } from '../audit/admin-mutation';
import type { AdminAssessmentPoliciesDto } from './assessment-policies.dto';
@Injectable()
export class AssessmentPoliciesService {
  async list(): Promise<AdminAssessmentPoliciesDto> {
    const rows = await getDatabase()
      .db.select()
      .from(scoringPolicyVersions)
      .where(
        and(
          eq(scoringPolicyVersions.status, 'PUBLISHED'),
          inArray(scoringPolicyVersions.policyCode, [
            'DRILL_PRD_V06',
            'TRYOUT_PRD_V06',
            'NUMORA_DRILL_V06',
            'NUMORA_TRYOUT_V06',
          ]),
        ),
      )
      .orderBy(desc(scoringPolicyVersions.effectiveAt), desc(scoringPolicyVersions.version));
    return {
      items: rows.flatMap((row) => {
        const type = row.policyCode.includes('DRILL') ? 'DRILL' : 'TRYOUT';
        try {
          readApprovedPolicy(row, type);
        } catch {
          return [];
        }
        return [
          {
            id: row.id,
            code: row.policyCode,
            version: row.version,
            assessmentType: type,
            approvedByUserId: row.approvedByUserId,
            approvedAt: row.approvedAt?.toISOString() ?? null,
            approvalReference: isCanonicalPolicy(row, type)
              ? CANONICAL_POLICY_APPROVAL
              : row.approvalReference!,
          },
        ];
      }),
    };
  }
  async require(tx: AdminTransaction, id: string, type: 'DRILL' | 'TRYOUT') {
    const [row] = await tx
      .select()
      .from(scoringPolicyVersions)
      .where(eq(scoringPolicyVersions.id, id))
      .for('share');
    if (!row)
      throw new ConflictException({
        code: 'ASSESSMENT_POLICY_APPROVAL_REQUIRED',
        detail: 'Policy yang disahkan belum tersedia.',
      });
    try {
      return readApprovedPolicy(row, type);
    } catch (error) {
      throw new ConflictException({
        code:
          error && typeof error === 'object' && 'code' in error
            ? error.code
            : 'ASSESSMENT_POLICY_UNSUPPORTED',
        detail: error instanceof Error ? error.message : 'Policy tidak didukung.',
      });
    }
  }
}
