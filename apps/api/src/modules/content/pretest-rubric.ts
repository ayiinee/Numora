import { ConflictException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { scoringRubricVersions } from '@tka/database';
import {
  PRETEST_PARTIAL_POLICY,
  pretestPartialRubricDefinition,
  validatePretestPartialRubric,
} from '@tka/assessment-engine';
import type { AdminTransaction } from '../audit/admin-mutation';
import { digest } from './content-import.validation';

export async function hasPretestRubric(
  tx: AdminTransaction,
  content: { type: string; options: readonly unknown[] },
  id: string | null | undefined,
) {
  if (content.type === 'SINGLE_CHOICE') return true;
  const [rubric] = id
    ? await tx
        .select()
        .from(scoringRubricVersions)
        .where(eq(scoringRubricVersions.id, id))
        .for('share')
    : [];
  try {
    validatePretestPartialRubric(content, rubric);
    return true;
  } catch {
    return false;
  }
}

export async function ensurePretestRubric(
  tx: AdminTransaction,
  actor: string,
  content: { type: string; options: readonly unknown[] },
) {
  if (content.type === 'SINGLE_CHOICE') return undefined;
  const count = content.options.length;
  const code = `${PRETEST_PARTIAL_POLICY}_${content.type}_${count}`;
  const definition = pretestPartialRubricDefinition(content.type, count);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${code}))`);
  const existing = await tx
    .select()
    .from(scoringRubricVersions)
    .where(eq(scoringRubricVersions.code, code))
    .for('share');
  for (const rubric of existing) {
    try {
      validatePretestPartialRubric(content, rubric);
      if (rubric.digest === digest(definition)) return rubric.id;
    } catch {
      /* Preserve incompatible historical rubrics; create a canonical version below. */
    }
  }
  const [rubric] = await tx
    .insert(scoringRubricVersions)
    .values({
      code,
      version: Math.max(0, ...existing.map((r) => r.version)) + 1,
      questionType: content.type as 'CATEGORY' | 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
      maximumScoreCategory: count,
      definition,
      digest: digest(definition),
      status: 'SEALED',
      approvedByUserId: actor,
      approvedAt: new Date(),
    })
    .returning();
  if (!rubric) throw new ConflictException({ code: 'SCORING_RUBRIC_NOT_READY' });
  validatePretestPartialRubric(content, rubric);
  return rubric.id;
}
