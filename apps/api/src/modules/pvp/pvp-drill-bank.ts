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
import { alias, type PgSelect, type SelectedFields } from 'drizzle-orm/pg-core';
import { decodeSingleChoice } from '../learning/single-choice.policy';
import { pvpContentMode, type Difficulty, type PvpContentMode } from './pvp.policy';

type Database = ReturnType<typeof getDatabase>['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DrillCandidate = {
  questionId: string;
  version: typeof questionVersions.$inferSelect;
};
type EligibilityCandidate = {
  questionId: string;
  version: Parameters<typeof decodeSingleChoice>[0] & Pick<DrillCandidate['version'], 'media'>;
};
const requiredFamilies = 10;

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

export function groupDrillCandidates<Candidate extends EligibilityCandidate>(
  candidates: Candidate[],
) {
  const families = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const media = candidate.version.media;
    // Some imported text-only versions store an empty JSON object instead of an empty array.
    if (media !== null && (typeof media !== 'object' || Object.keys(media).length > 0)) continue;
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
  if (families.length < requiredFamilies) throw unavailableDrillBank();
  const selected = shuffle(families, nextInt)
    .slice(0, requiredFamilies)
    .map((family) => family[nextInt(family.length)]!);
  return shuffle(selected, nextInt);
}

/** Shared eligibility for read-only availability and transactional room creation. */
export class PvpDrillBank {
  constructor(readonly contentMode: PvpContentMode = pvpContentMode()) {}
  private withEligibility<Selection extends SelectedFields>(
    db: Database | Transaction,
    difficulty: Difficulty,
    query: PgSelect<'question_versions', Selection, 'partial', { question_versions: 'not-null' }>,
    ids?: string[],
  ) {
    const newer = alias(questionVersions, 'newer_ready_drill_version');
    return query
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

  private fullQuery(db: Database | Transaction, difficulty: Difficulty, ids?: string[]) {
    const query = db
      .select({ questionId: questions.id, version: questionVersions })
      .from(questionVersions)
      .$dynamic();
    return this.withEligibility(db, difficulty, query, ids);
  }

  async families(db: Database | Transaction, difficulty: Difficulty) {
    return groupDrillCandidates(await this.fullQuery(db, difficulty));
  }

  async hasEnoughFamilies(db: Database, difficulty: Difficulty) {
    const query = db
      .select({
        questionId: questions.id,
        version: {
          questionType: questionVersions.questionType,
          stem: questionVersions.stem,
          optionsOrStatements: questionVersions.optionsOrStatements,
          answerKey: questionVersions.answerKey,
          explanation: questionVersions.explanation,
          media: questionVersions.media,
        },
      })
      .from(questionVersions)
      .$dynamic();
    const candidates = await this.withEligibility(db, difficulty, query);
    return groupDrillCandidates(candidates).length >= requiredFamilies;
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
    const rows = await this.fullQuery(
      tx,
      difficulty,
      selected.map((c) => c.version.id),
    ).for('share', {
      of: [questionVersions, questionVariants, questions, competencies, subchapters, chapters],
    });
    const valid = groupDrillCandidates(rows).flat();
    if (
      valid.length !== requiredFamilies ||
      new Set(valid.map((c) => c.questionId)).size !== requiredFamilies
    )
      throw unavailableDrillBank();
    const byId = new Map(valid.map((c) => [c.version.id, c]));
    return selected.map((c) => byId.get(c.version.id)!);
  }
}
