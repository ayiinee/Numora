import { ConflictException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { scoringRubricVersions } from '@tka/database';
import { TRYOUT_PARTIAL_POLICY, validateTryoutPartialRubric } from '@tka/assessment-engine';
import type { AdminTransaction } from '../audit/admin-mutation';
import { digest } from './content-import.validation';

/** Materialize the existing owner-approved formula; no new academic policy. */
export async function ensureTryoutRubric(
  tx: AdminTransaction,
  actor: string,
  content: { type: string; options: readonly unknown[] },
) {
  if (content.type === 'SINGLE_CHOICE') return null;
  const count = content.options.length;
  const code = `${TRYOUT_PARTIAL_POLICY}_${content.type}_${count}`;
  const definition = {
    policyCode: TRYOUT_PARTIAL_POLICY,
    version: 1,
    questionType: content.type,
    decisionCount: count,
    categories: Array.from({ length: count + 1 }, (_, i) => i),
    fullyCorrectCategory: count,
    points: 'round(correctDecisions / decisionCount * maxPoints, 2)',
    unanswered: 0,
    approvedDecision: 'PROJECT_OWNER_2026_10_07',
  };
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${code}))`);
  await tx
    .insert(scoringRubricVersions)
    .values({
      code,
      version: 1,
      questionType: content.type as 'CATEGORY' | 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
      maximumScoreCategory: count,
      definition,
      digest: digest(definition),
      status: 'SEALED',
      approvedByUserId: actor,
      approvedAt: new Date(),
    })
    .onConflictDoNothing();
  const [rubric] = await tx
    .select()
    .from(scoringRubricVersions)
    .where(and(eq(scoringRubricVersions.code, code), eq(scoringRubricVersions.version, 1)))
    .for('share');
  try {
    validateTryoutPartialRubric(content, rubric);
    return rubric!;
  } catch {
    throw new ConflictException({ code: 'TRYOUT_RUBRIC_NOT_READY' });
  }
}
