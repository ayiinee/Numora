import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  assessmentPackages,
  auditLogs,
  chapters,
  competencies,
  contentImportIdentities,
  contentImportVersions,
  contentMediaUploads,
  getDatabase,
  levels,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
  scoringRubricVersions,
  subchapters,
  type ImportQuestion,
} from '@tka/database';
import { adminMutation, type AdminTransaction } from '../audit/admin-mutation';
import { structuralErrors } from './content-import.validation';
import type { ContentVersionDetailDto, ReviewContentDto } from './content-lifecycle.dto';

@Injectable()
export class ContentLifecycleService {
  private async load(tx: AdminTransaction, id: string) {
    const [row] = await tx
      .select({
        version: questionVersions,
        question: questions,
        chapter: chapters,
        subchapter: subchapters,
        competency: competencies,
        level: levels,
        imported: contentImportVersions,
        identity: contentImportIdentities,
      })
      .from(questionVersions)
      .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
      .innerJoin(questions, eq(questions.id, questionVariants.questionId))
      .innerJoin(competencies, eq(competencies.id, questions.primaryCompetencyId))
      .innerJoin(subchapters, eq(subchapters.id, competencies.subchapterId))
      .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
      .leftJoin(levels, eq(levels.id, questionVersions.levelId))
      .leftJoin(
        contentImportVersions,
        eq(contentImportVersions.questionVersionId, questionVersions.id),
      )
      .leftJoin(
        contentImportIdentities,
        eq(contentImportIdentities.id, contentImportVersions.identityId),
      )
      .where(eq(questionVersions.id, id));
    if (!row) throw new NotFoundException({ code: 'CONTENT_VERSION_NOT_FOUND' });
    return row;
  }
  private async detail(tx: AdminTransaction, id: string): Promise<ContentVersionDetailDto> {
    const r = await this.load(tx, id),
      v = r.version;
    const data = v.optionsOrStatements as {
      options?: ImportQuestion['options'];
      categories?: NonNullable<ImportQuestion['metadata']['categories']>;
    };
    const payload: ImportQuestion = {
      externalId: r.identity?.externalId ?? v.id,
      type: v.questionType,
      chapterCode: r.chapter.code,
      subchapterCode: r.subchapter.code,
      competencyCode: r.competency.code,
      difficulty: v.difficulty as Exclude<ImportQuestion['difficulty'], undefined>,
      stem: v.stem as ImportQuestion['stem'],
      options: Array.isArray(v.optionsOrStatements)
        ? (v.optionsOrStatements as ImportQuestion['options'])
        : (data.options ?? []),
      answer: v.answerKey as ImportQuestion['answer'],
      explanation: v.explanation as ImportQuestion['explanation'],
      metadata: {
        ...((r.imported?.provenance as Record<string, unknown>) ?? {}),
        sourceLevelNumber: r.question.curriculumLevelNumber ?? r.level?.levelNumber ?? 0,
        ...(data.categories?.length ? { categories: data.categories } : {}),
        assetManifest: (v.media ?? []) as NonNullable<ImportQuestion['metadata']['assetManifest']>,
      },
    };
    const blockers = structuralErrors(payload);
    if (!v.difficulty) blockers.push('DIFFICULTY_REQUIRED');
    if (
      [r.chapter.status, r.subchapter.status, r.competency.status, r.question.status].some(
        (s) => s !== 'READY',
      )
    )
      blockers.push('TAXONOMY_NOT_READY');
    if (r.imported && (!r.level || r.level.status !== 'READY')) blockers.push('LEVEL_NOT_READY');
    for (const a of payload.metadata.assetManifest ?? []) {
      const [receipt] = await tx
        .select({ id: contentMediaUploads.id })
        .from(contentMediaUploads)
        .where(
          and(
            eq(contentMediaUploads.status, 'VERIFIED'),
            eq(contentMediaUploads.externalId, payload.externalId),
            eq(contentMediaUploads.assetId, a.assetId),
            eq(contentMediaUploads.bucket, a.bucket),
            eq(contentMediaUploads.objectKey, a.objectKey ?? ''),
            eq(contentMediaUploads.sha256, a.sha256),
            eq(contentMediaUploads.contentType, a.contentType),
            eq(contentMediaUploads.byteLength, a.byteLength),
          ),
        )
        .limit(1);
      if (!receipt) blockers.push('MEDIA_RECEIPT_INVALID');
    }
    if (v.contentStatus === 'ARCHIVED') blockers.push('VERSION_ARCHIVED');
    const publication = [...new Set(blockers)];
    if (v.contentStatus !== 'READY' || !v.reviewedByUserId || !v.reviewedAt)
      publication.push('REVIEW_REQUIRED');
    if (v.questionType !== 'SINGLE_CHOICE') {
      const [rubric] = v.scoringRubricVersionId
        ? await tx
            .select()
            .from(scoringRubricVersions)
            .where(eq(scoringRubricVersions.id, v.scoringRubricVersionId))
        : [];
      if (
        !rubric ||
        rubric.status !== 'SEALED' ||
        !rubric.approvedAt ||
        !rubric.approvedByUserId ||
        rubric.questionType !== v.questionType
      )
        publication.push('APPROVED_PGK_RUBRIC_REQUIRED');
    }
    const history = await tx
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityType, 'question_version'),
          eq(auditLogs.entityId, id),
          eq(auditLogs.action, 'content_review_decision'),
        ),
      )
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(100);
    const reviews = history.map((r) => {
      const m = r.metadata as Record<string, unknown> | null;
      return {
        id: r.id,
        actorId: r.actorUserId,
        at: r.createdAt.toISOString(),
        status: typeof m?.status === 'string' ? m.status : '',
        reason: typeof m?.reason === 'string' ? m.reason : '',
      };
    });
    return {
      id,
      reviews,
      questionId: r.question.id,
      versionNumber: v.versionNumber,
      status: v.contentStatus,
      revisedFromId: v.revisedFromQuestionVersionId,
      sourceNamespace: r.identity?.sourceNamespace ?? null,
      reviewedByUserId: v.reviewedByUserId,
      reviewedAt: v.reviewedAt?.toISOString() ?? null,
      payload,
      readiness: {
        canReviewReady: blockers.length === 0,
        contentBlockers: [...new Set(blockers)],
        publicationBlockers: [...new Set(publication)],
      },
    };
  }
  get(id: string) {
    return getDatabase().db.transaction((tx) => this.detail(tx, id));
  }
  review(actor: string, id: string, body: ReviewContentDto) {
    return adminMutation(actor, 'content_reviewed', 'question_version', async (tx) => {
      const [v] = await tx
        .select()
        .from(questionVersions)
        .where(eq(questionVersions.id, id))
        .for('update');
      if (!v) throw new NotFoundException({ code: 'CONTENT_VERSION_NOT_FOUND' });
      if (v.contentStatus !== body.expectedStatus)
        throw new ConflictException({ code: 'CONTENT_REVIEW_CONFLICT' });
      if (v.contentStatus === 'ARCHIVED' && body.status === 'ARCHIVED') return { id };
      if (v.contentStatus === 'ARCHIVED')
        throw new ConflictException({ code: 'CONTENT_VERSION_ARCHIVED' });
      const detail = await this.detail(tx, id);
      if (body.status === 'READY' && !detail.readiness.canReviewReady)
        throw new BadRequestException({
          code: 'CONTENT_NOT_READY',
          blockers: detail.readiness.contentBlockers,
        });
      if (body.status !== 'READY') {
        const active = await tx
          .select({ id: assessmentPackages.id })
          .from(packageItems)
          .innerJoin(assessmentPackages, eq(assessmentPackages.id, packageItems.packageId))
          .where(
            and(
              eq(packageItems.questionVersionId, id),
              inArray(assessmentPackages.status, ['PUBLISHED']),
            ),
          )
          .for('share', { of: assessmentPackages });
        if (active.length)
          throw new ConflictException({
            code: 'CONTENT_REFERENCED_BY_ACTIVE_PACKAGE',
            packageIds: active.map((p) => p.id),
          });
      }
      await tx
        .update(questionVersions)
        .set({ contentStatus: body.status, reviewedByUserId: actor, reviewedAt: new Date() })
        .where(eq(questionVersions.id, id));
      // Review reasons contain editorial context, never learner answers or credentials.
      await tx
        .insert(auditLogs)
        .values({
          actorUserId: actor,
          action: 'content_review_decision',
          entityType: 'question_version',
          entityId: id,
          metadata: {
            previousStatus: v.contentStatus,
            status: body.status,
            reason: body.reason.trim(),
          },
        });
      return { id };
    });
  }
}
