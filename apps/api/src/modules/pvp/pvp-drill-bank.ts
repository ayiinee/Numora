import { ServiceUnavailableException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import {
  chapters,
  competencies,
  contentValidationDecisions,
  getDatabase,
  levels,
  questions,
  questionVariants,
  questionVersions,
  subchapters,
} from '@tka/database';
import { and, asc, eq, gt, inArray, isNotNull, isNull, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { decodeSingleChoice } from '../learning/single-choice.policy';
import { pvpContentMode, type Difficulty, type PvpContentMode } from './pvp.policy';

type Database = ReturnType<typeof getDatabase>['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DrillCandidate = {
  questionId: string;
  version: typeof questionVersions.$inferSelect;
};

export const unavailableDrillBank = () =>
  new ServiceUnavailableException({
    code: 'PVP_CONTENT_UNAVAILABLE',
    detail: 'Minimal 10 soal Drill READY yang valid diperlukan untuk kesulitan ini.',
  });

/** Imported PG versions wrap their option array; legacy snapshots store it directly. */
export function decodePvpSingleChoice(row: Parameters<typeof decodeSingleChoice>[0]) {
  const payload = row.optionsOrStatements;
  const options =
    !Array.isArray(payload) && payload && typeof payload === 'object' && 'options' in payload
      ? payload.options
      : payload;
  return decodeSingleChoice({ ...row, optionsOrStatements: options });
}

export function groupDrillCandidates(candidates: DrillCandidate[]) {
  const families = new Map<string, DrillCandidate[]>();
  for (const candidate of candidates) {
    const media = candidate.version.media;
    if (media !== null && (!Array.isArray(media) || media.length !== 0)) continue;
    try {
      decodePvpSingleChoice(candidate.version);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) continue;
      throw error;
    }
    const family = families.get(candidate.questionId) ?? [];
    family.push(candidate);
    families.set(candidate.questionId, family);
  }
  return [...families.values()];
}

/** Uniform Fisher-Yates. Randomness is server-owned; the seam is only for fixture tests. */
function shuffle<T>(values: T[], nextInt: (max: number) => number) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = nextInt(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function sampleDrillFamilies(
  families: DrillCandidate[][],
  nextInt: (max: number) => number = randomInt,
) {
  if (families.length < 10) throw unavailableDrillBank();
  const selected = shuffle(families, nextInt)
    .slice(0, 10)
    .map((family) => family[nextInt(family.length)]!);
  return shuffle(selected, nextInt);
}

/** Shared eligibility for read-only availability and transactional room creation. */
export class PvpDrillBank {
  constructor(readonly contentMode: PvpContentMode = pvpContentMode()) {}
  private query(db: Database | Transaction, difficulty: Difficulty, ids?: string[]) {
    const newer = alias(questionVersions, 'newer_ready_drill_version');
    return db
      .select({ questionId: questions.id, version: questionVersions })
      .from(questionVersions)
      .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
      .innerJoin(questions, eq(questions.id, questionVariants.questionId))
      .innerJoin(competencies, eq(competencies.id, questions.primaryCompetencyId))
      .innerJoin(subchapters, eq(subchapters.id, competencies.subchapterId))
      .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
      .leftJoin(levels, eq(levels.id, questionVersions.levelId))
      .leftJoin(
        contentValidationDecisions,
        eq(contentValidationDecisions.id, questionVersions.validationDecisionId),
      )
      .where(
        and(
          eq(questions.usageType, 'DRILL'),
          eq(questions.status, 'READY'),
          eq(questionVersions.contentStatus, 'READY'),
          eq(competencies.status, 'READY'),
          eq(subchapters.status, 'READY'),
          eq(chapters.status, 'READY'),
          or(isNull(questionVersions.levelId), eq(levels.status, 'READY')),
          eq(questionVersions.questionType, 'SINGLE_CHOICE'),
          this.contentMode === 'temporary-owner-accepted'
            ? eq(questionVersions.difficulty, 'OWNER_ACCEPTED_UNCALIBRATED')
            : sql`upper(btrim(${questionVersions.difficulty})) = ${difficulty.toUpperCase()}`,
          or(
            and(
              isNotNull(questionVersions.reviewedAt),
              isNotNull(questionVersions.reviewedByUserId),
            ),
            and(
              eq(questionVersions.validationState, 'CONTENT_VALID'),
              eq(contentValidationDecisions.state, 'CONTENT_VALID'),
            ),
          ),
          notExists(
            db
              .select({ id: newer.id })
              .from(newer)
              .where(
                and(
                  eq(newer.variantId, questionVersions.variantId),
                  eq(newer.contentStatus, 'READY'),
                  gt(newer.versionNumber, questionVersions.versionNumber),
                ),
              ),
          ),
          ids ? inArray(questionVersions.id, ids) : undefined,
        ),
      )
      .orderBy(asc(questionVersions.id));
  }

  async families(db: Database | Transaction, difficulty: Difficulty) {
    return groupDrillCandidates(await this.query(db, difficulty));
  }

  async lockSelection(tx: Transaction, difficulty: Difficulty, selected: DrillCandidate[]) {
    // Nullable joins cannot be FOR SHARE targets. Lock their rows separately first.
    const levelIds = [
      ...new Set(selected.flatMap((c) => (c.version.levelId ? [c.version.levelId] : []))),
    ];
    const decisionIds = [
      ...new Set(
        selected.flatMap((c) =>
          c.version.validationDecisionId ? [c.version.validationDecisionId] : [],
        ),
      ),
    ];
    if (levelIds.length)
      await tx
        .select({ id: levels.id })
        .from(levels)
        .where(inArray(levels.id, levelIds))
        .orderBy(asc(levels.id))
        .for('share');
    if (decisionIds.length)
      await tx
        .select({ id: contentValidationDecisions.id })
        .from(contentValidationDecisions)
        .where(inArray(contentValidationDecisions.id, decisionIds))
        .orderBy(asc(contentValidationDecisions.id))
        .for('share');
    const rows = await this.query(
      tx,
      difficulty,
      selected.map((c) => c.version.id),
    ).for('share', {
      of: [questionVersions, questionVariants, questions, competencies, subchapters, chapters],
    });
    const valid = groupDrillCandidates(rows).flat();
    if (valid.length !== 10 || new Set(valid.map((c) => c.questionId)).size !== 10)
      throw unavailableDrillBank();
    const byId = new Map(valid.map((c) => [c.version.id, c]));
    return selected.map((c) => byId.get(c.version.id)!);
  }
}
