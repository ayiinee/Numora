import { hasPretestRubric } from './pretest-rubric';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
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
import { canonicalExternalId, structuralErrors } from './content-import.validation';
import type {
  ContentVersionDetailDto,
  ContentVersionMediaLinksDto,
  ReviewContentDto,
} from './content-lifecycle.dto';
import { R2MediaStorage } from './r2-media.storage';

@Injectable()
export class ContentLifecycleService {
  constructor(@Optional() private readonly storage?: R2MediaStorage) {}
  async readiness(tx: AdminTransaction, id: string) {
    return (await this.detail(tx, id)).readiness;
  }
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
      .leftJoin(competencies, eq(competencies.id, questions.primaryCompetencyId))
      .leftJoin(
        subchapters,
        eq(subchapters.id, sql`coalesce(${questions.subchapterId},${competencies.subchapterId})`),
      )
      .leftJoin(
        chapters,
        eq(chapters.id, sql`coalesce(${questions.chapterId},${subchapters.chapterId})`),
      )
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
    const assets = (v.media ?? []) as NonNullable<ImportQuestion['metadata']['assetManifest']>;
    const payload: ImportQuestion = {
      externalId: canonicalExternalId(r.identity?.externalId, assets, r.question.sourceRef, v.id),
      type: v.questionType,
      chapterCode: r.chapter?.code ?? null,
      subchapterCode: r.subchapter?.code ?? null,
      competencyCode: r.competency?.code ?? null,
      difficulty: v.difficulty as Exclude<ImportQuestion['difficulty'], undefined>,
      stem: v.stem as ImportQuestion['stem'],
      options: Array.isArray(v.optionsOrStatements)
        ? (v.optionsOrStatements as ImportQuestion['options'])
        : (data.options ?? []),
      answer: v.answerKey as ImportQuestion['answer'],
      explanation: v.explanation as ImportQuestion['explanation'],
      metadata: {
        ...((r.imported?.provenance as Record<string, unknown>) ?? {}),
        sourceLevelNumber:
          r.question.curriculumLevelNumber ??
          r.level?.levelNumber ??
          (['TRYOUT', 'PRETEST'].includes(r.question.usageType ?? '') ? null : 0),
        ...(data.categories?.length ? { categories: data.categories } : {}),
        assetManifest: assets,
      },
    };
    const tryout = r.question.usageType === 'TRYOUT';
    const pretest = r.question.usageType === 'PRETEST';
    const blockers = structuralErrors(payload, false, tryout, pretest);
    if (!tryout && !v.difficulty) blockers.push('DIFFICULTY_REQUIRED');
    if (
      [r.chapter?.status, r.subchapter?.status, r.competency?.status].some((s) =>
        tryout ? s === 'ARCHIVED' : s !== 'READY',
      )
    )
      blockers.push('TAXONOMY_NOT_READY');
    if (r.question.status === 'ARCHIVED') blockers.push('QUESTION_ARCHIVED');
    if (
      r.imported &&
      ((!tryout && !pretest && !r.level) ||
        (r.level && (tryout ? r.level.status === 'ARCHIVED' : r.level.status !== 'READY')))
    )
      blockers.push('LEVEL_NOT_READY');
    for (const a of payload.metadata.assetManifest ?? []) {
      const [receipt] = await tx
        .select({ id: contentMediaUploads.id })
        .from(contentMediaUploads)
        .where(
          and(
            eq(contentMediaUploads.status, 'VERIFIED'),
            eq(contentMediaUploads.externalId, a.externalId),
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
    if (r.question.status !== 'READY') publication.push('QUESTION_NOT_READY');
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
        (pretest && !(await hasPretestRubric(tx, payload, v.scoringRubricVersionId))) ||
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
      usageType: r.question.usageType,
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
  async media(id: string): Promise<ContentVersionMediaLinksDto> {
    const row = await getDatabase().db.transaction(async (tx) => {
      const r = await this.load(tx, id);
      return { assets: (r.version.media ?? []) as NonNullable<ImportQuestion['metadata']['assetManifest']> };
    });
    return {
      items: await Promise.all(
        row.assets.map(async (asset) => {
          const [receipt] = await getDatabase().db
            .select({ id: contentMediaUploads.id })
            .from(contentMediaUploads)
            .where(
              and(
                eq(contentMediaUploads.status, 'VERIFIED'),
                eq(contentMediaUploads.externalId, asset.externalId),
                eq(contentMediaUploads.assetId, asset.assetId),
                eq(contentMediaUploads.bucket, asset.bucket),
                eq(contentMediaUploads.objectKey, asset.objectKey ?? ''),
                eq(contentMediaUploads.sha256, asset.sha256),
                eq(contentMediaUploads.contentType, asset.contentType),
                eq(contentMediaUploads.byteLength, asset.byteLength),
              ),
            )
            .limit(1);
          if (!receipt || !asset.objectKey) {
            return {
              assetId: asset.assetId,
              altText: asset.altText,
              placement: asset.placement,
              url: null,
              expiresAt: null,
              status: asset.objectKey ? ('INVALID' as const) : ('MISSING' as const),
              reason: asset.objectKey
                ? 'Receipt upload tidak cocok dengan referensi asset.'
                : 'Asset belum memiliki upload terverifikasi.',
            };
          }
          try {
            if (!this.storage) throw new Error('Media storage unavailable');
            const link = await this.storage.readLink(asset.bucket, asset.objectKey);
            return { ...asset, ...link, status: 'READY' as const, reason: null };
          } catch {
            return {
              assetId: asset.assetId,
              altText: asset.altText,
              placement: asset.placement,
              url: null,
              expiresAt: null,
              status: 'INVALID' as const,
              reason: 'Media belum dapat dibaca dari penyimpanan.',
            };
          }
        }),
      ),
    };
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
      // A complete reviewed version can promote its draft family. Publication still requires package approval.
      if (body.status === 'READY')
        await tx
          .update(questions)
          .set({ status: 'READY' })
          .where(and(eq(questions.id, detail.questionId), eq(questions.status, 'DRAFT')));
      // Review reasons contain editorial context, never learner answers or credentials.
      await tx.insert(auditLogs).values({
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
