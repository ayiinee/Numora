import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  competencies,
  questions,
  questionVariants,
  questionVersions,
  scoringRubricVersions,
  subchapters,
} from '@tka/database';
import {
  decodeRuntimeQuestion,
  validateRubricCoverage,
  validateTryoutPartialRubric,
  type ApprovedPolicy,
} from '@tka/assessment-engine';
import type { AdminTransaction } from '../audit/admin-mutation';
import { ContentLifecycleService } from './content-lifecycle.service';
@Injectable()
export class AssessmentReadinessService {
  constructor(@Inject(ContentLifecycleService) private readonly content: ContentLifecycleService) {}
  async items(
    tx: AdminTransaction,
    ids: string[],
    count: number,
    policy: ApprovedPolicy | null,
    scope?: { subchapterId?: string; chapterId?: string; levelNumber?: number },
  ) {
    if (ids.length !== count || new Set(ids).size !== count)
      throw new ConflictException({
        code: 'ASSESSMENT_PACKAGE_INCOMPLETE',
        detail: `Paket harus memuat ${count} versi unik.`,
      });
    const rows = await tx
      .select({
        version: questionVersions,
        question: questions,
        competency: competencies,
        subchapter: subchapters,
      })
      .from(questionVersions)
      .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
      .innerJoin(questions, eq(questions.id, questionVariants.questionId))
      .leftJoin(competencies, eq(competencies.id, questions.primaryCompetencyId))
      .leftJoin(
        subchapters,
        eq(subchapters.id, sql`coalesce(${questions.subchapterId},${competencies.subchapterId})`),
      )
      .where(inArray(questionVersions.id, ids))
      .for('share', { of: [questionVersions, questions] });
    if (rows.length !== count) throw new ConflictException({ code: 'ASSESSMENT_CONTENT_MISSING' });
    const pinned = [];
    for (const id of ids) {
      const r = rows.find((row) => row.version.id === id)!;
      if (
        (scope?.chapterId && r.subchapter?.chapterId !== scope.chapterId) ||
        (scope?.subchapterId && r.competency?.subchapterId !== scope.subchapterId) ||
        (scope?.levelNumber && r.question.curriculumLevelNumber !== scope.levelNumber)
      )
        throw new ConflictException({ code: 'ASSESSMENT_CONTENT_SCOPE_INVALID' });
      const readiness = await this.content.readiness(tx, id);
      if (readiness.publicationBlockers.length)
        throw new ConflictException({
          code: 'ASSESSMENT_CONTENT_NOT_READY',
          detail: readiness.publicationBlockers.join(', '),
          questionVersionId: id,
        });
      let decoded: ReturnType<typeof decodeRuntimeQuestion>;
      try {
        decoded = decodeRuntimeQuestion(r.version);
      } catch (error) {
        throw new ConflictException({
          code: 'ASSESSMENT_CONTENT_INVALID',
          detail: error instanceof Error ? error.message : 'Konten tidak valid.',
        });
      }
      let rubric: typeof scoringRubricVersions.$inferSelect | undefined;
      if (r.version.questionType !== 'SINGLE_CHOICE') {
        [rubric] = await tx
          .select()
          .from(scoringRubricVersions)
          .where(
            and(
              eq(scoringRubricVersions.id, r.version.scoringRubricVersionId!),
              eq(scoringRubricVersions.status, 'SEALED'),
            ),
          )
          .for('share');
        try {
          if (policy?.ownerTryoutPartial) validateTryoutPartialRubric(decoded, rubric);
          else validateRubricCoverage(decoded, rubric);
        } catch (error) {
          throw new ConflictException({
            code: 'PGK_RUBRIC_COVERAGE_REQUIRED',
            detail: error instanceof Error ? error.message : 'Rubric tidak didukung.',
          });
        }
        if (policy?.assessmentType === 'DRILL' && policy.lowPartialStars === undefined)
          throw new ConflictException({ code: 'PARTIAL_STAR_POLICY_REQUIRED' });
      }
      const weight = policy ? policy.itemWeights[r.version.questionType] : 1;
      if (weight === undefined)
        throw new ConflictException({ code: 'ASSESSMENT_ITEM_WEIGHT_REQUIRED' });
      pinned.push({
        questionVersionId: id,
        maxPoints: String(weight),
        rubricVersionId: rubric?.id ?? null,
        maximumScoreCategory: rubric?.maximumScoreCategory ?? 1,
      });
    }
    return pinned;
  }
}
