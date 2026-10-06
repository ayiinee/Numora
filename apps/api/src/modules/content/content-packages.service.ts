import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  assessmentPackages,
  chapters,
  competencies,
  contentImportIdentities,
  contentImportVersions,
  getDatabase,
  levels,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
  subchapters,
  type ImportQuestion,
} from '@tka/database';
import { adminMutation } from '../audit/admin-mutation';
import { decodeSingleChoiceVersion } from '../learning/drill.policy';
import { ContentImportService } from './content-import.service';
import {
  assertDraftRevision,
  assertPackageUsage,
  packageContext,
  packageCounts,
} from './content-package.rules';
import { structuralErrors } from './content-import.validation';
import type {
  ClassifyQuestionDto,
  ContentPackageDetailDto,
  ContentPackageQueryDto,
  ContentPackagesDto,
  CreateContentPackageDto,
  ReviewImportedQuestionDto,
  UpdateContentPackageDto,
} from './content-packages.dto';
import type { ExcelQuestionDto } from './excel-import.dto';

@Injectable()
export class ContentPackagesService {
  constructor(@Inject(ContentImportService) private readonly importer: ContentImportService) {}
  async list(query: ContentPackageQueryDto): Promise<ContentPackagesDto> {
    this.importer.enabled();
    return getDatabase().db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: assessmentPackages.id })
        .from(assessmentPackages)
        .where(
          and(
            inArray(assessmentPackages.assessmentType, ['DRILL', 'PRETEST', 'TRYOUT']),
            eq(assessmentPackages.purpose, 'REGULAR'),
            query.usageType ? eq(assessmentPackages.assessmentType, query.usageType) : undefined,
            query.status ? sql`${assessmentPackages.status}::text = ${query.status}` : undefined,
            query.chapterId
              ? sql`(${assessmentPackages.chapterId} = ${query.chapterId} or ${assessmentPackages.levelId} in (select l.id from levels l join subchapters s on s.id=l.subchapter_id where s.chapter_id=${query.chapterId}))`
              : undefined,
            query.source
              ? sql`position(lower(${query.source}) in lower(coalesce(${assessmentPackages.importSource}->>'sourceName',''))) > 0`
              : undefined,
          ),
        )
        .orderBy(desc(assessmentPackages.packageVersion), asc(assessmentPackages.familyCode))
        .limit(query.limit ?? 100)
        .offset(query.offset ?? 0);
      const items = [];
      for (const row of rows) items.push(await packageContext(tx, row.id));
      return { items };
    });
  }
  create(actor: string, body: CreateContentPackageDto) {
    this.importer.enabled();
    return adminMutation(actor, 'content_package_created', 'assessment_package', async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${body.familyCode}))`);
      let chapterId: string | null = null;
      if (body.assessmentType === 'DRILL') {
        if (!body.levelId) throw new BadRequestException({ code: 'DRILL_LEVEL_REQUIRED' });
        const [scope] = await tx
          .select({
            chapterId: chapters.id,
            statuses: sql<string>`concat(${chapters.status}, ',', ${subchapters.status}, ',', ${levels.status})`,
          })
          .from(levels)
          .innerJoin(subchapters, eq(subchapters.id, levels.subchapterId))
          .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
          .where(eq(levels.id, body.levelId))
          .for('share');
        if (
          !scope ||
          scope.statuses.includes('ARCHIVED') ||
          (body.chapterId && body.chapterId !== scope.chapterId)
        )
          throw new BadRequestException({ code: 'PACKAGE_SCOPE_INVALID' });
        chapterId = scope.chapterId;
      } else if (body.assessmentType === 'PRETEST') {
        if (!body.chapterId || body.levelId)
          throw new BadRequestException({ code: 'PRETEST_CHAPTER_REQUIRED' });
        const [chapter] = await tx
          .select()
          .from(chapters)
          .where(eq(chapters.id, body.chapterId))
          .for('share');
        if (!chapter || chapter.status === 'ARCHIVED')
          throw new BadRequestException({ code: 'PACKAGE_SCOPE_INVALID' });
        chapterId = chapter.id;
      } else if (body.chapterId || body.levelId)
        throw new BadRequestException({
          code: 'TRYOUT_SCOPE_GLOBAL',
          detail: 'Tryout memiliki cakupan lintas bab, bukan level tunggal.',
        });
      const siblings = await tx
        .select()
        .from(assessmentPackages)
        .where(eq(assessmentPackages.familyCode, body.familyCode));
      if (siblings.some((p) => p.packageVersion === body.packageVersion))
        throw new ConflictException({
          code: 'PACKAGE_VERSION_EXISTS',
          detail: 'Kode dan versi paket sudah ada; pilih paket itu atau gunakan versi baru.',
        });
      if (
        siblings.some(
          (p) =>
            p.assessmentType !== body.assessmentType ||
            p.levelId !== (body.levelId ?? null) ||
            (p.chapterId !== chapterId &&
              !(p.assessmentType === 'DRILL' && p.chapterId === null)) ||
            p.isDemo !== body.isDemo,
        )
      )
        throw new ConflictException({ code: 'PACKAGE_FAMILY_SCOPE_IMMUTABLE' });
      const [row] = await tx
        .insert(assessmentPackages)
        .values({
          familyCode: body.familyCode,
          packageVersion: body.packageVersion,
          name: body.name.trim(),
          assessmentType: body.assessmentType,
          chapterId,
          levelId: body.levelId ?? null,
          variantIndex: body.assessmentType === 'DRILL' ? 1 : null,
          isDemo: body.isDemo,
          importSource: {
            sourceNamespace: body.source.sourceNamespace,
            sourceName: body.source.sourceName.trim(),
            sourceReference: body.source.sourceReference.trim(),
          },
        })
        .returning({ id: assessmentPackages.id });
      return row!;
    });
  }
  async detail(id: string): Promise<ContentPackageDetailDto> {
    this.importer.enabled();
    return getDatabase().db.transaction(async (tx) => {
      const p = await packageContext(tx, id);
      const rows = await tx
        .select({
          item: packageItems,
          version: questionVersions,
          question: questions,
          competency: competencies,
          subchapter: subchapters,
          chapter: chapters,
          identity: contentImportIdentities,
          provenance: contentImportVersions.provenance,
        })
        .from(packageItems)
        .innerJoin(questionVersions, eq(questionVersions.id, packageItems.questionVersionId))
        .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
        .innerJoin(questions, eq(questions.id, questionVariants.questionId))
        .innerJoin(competencies, eq(competencies.id, questions.primaryCompetencyId))
        .innerJoin(subchapters, eq(subchapters.id, competencies.subchapterId))
        .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
        .leftJoin(contentImportIdentities, eq(contentImportIdentities.questionId, questions.id))
        .leftJoin(
          contentImportVersions,
          eq(contentImportVersions.questionVersionId, questionVersions.id),
        )
        .where(eq(packageItems.packageId, id))
        .orderBy(asc(packageItems.displayOrder));
      const items = rows.map((r) => {
        const meta = (
          r.provenance && typeof r.provenance === 'object' ? r.provenance : {}
        ) as Record<string, unknown>;
        const content = r.version.optionsOrStatements as
          | {
              options?: ImportQuestion['options'];
              categories?: ImportQuestion['metadata']['categories'];
            }
          | ImportQuestion['options'];
        const q = {
          externalId: r.identity?.externalId ?? r.question.sourceRef ?? r.question.id,
          type: r.version.questionType,
          chapterCode: r.chapter.code,
          subchapterCode: r.subchapter.code,
          competencyCode: r.competency.code,
          difficulty: r.version.difficulty,
          stem: r.version.stem,
          options: Array.isArray(content) ? content : content?.options,
          answer: r.version.answerKey,
          explanation: r.version.explanation,
          metadata: {
            ...meta,
            ...(r.question.sourceQuestionId
              ? { sourceQuestionId: r.question.sourceQuestionId }
              : {}),
            sourceLevelNumber: r.question.curriculumLevelNumber ?? 0,
            sourceOrder: r.item.displayOrder,
            sourceSheet: typeof meta.sourceSheet === 'string' ? meta.sourceSheet : 'ADMIN',
            sourceRowNumber: typeof meta.sourceRowNumber === 'number' ? meta.sourceRowNumber : 0,
            assetManifest: r.version.media ?? [],
            ...(Array.isArray(content) || !content?.categories?.length
              ? {}
              : { categories: content.categories }),
          },
        };
        return {
          questionVersionId: r.version.id,
          questionId: r.question.id,
          displayOrder: r.item.displayOrder,
          usageType: r.question.usageType,
          contentStatus: r.version.contentStatus,
          reviewedAt: r.version.reviewedAt?.toISOString() ?? null,
          reviewedByUserId: r.version.reviewedByUserId,
          question: structuralErrors(q).length ? null : (q as unknown as ExcelQuestionDto),
        };
      });
      const structurallyValid = items.every((i) => i.question !== null);
      const checked =
        items.length && structurallyValid && p.source
          ? (
              await this.importer.validateWithin(tx, {
                sourceNamespace: p.source.sourceNamespace,
                target: { packageId: id, expectedRevision: p.contentRevision },
                questions: items.map((i) => i.question!),
              })
            ).report
          : null;
      const checks = checked?.package?.checks.filter((c) => c.code !== 'PUBLICATION') ?? [
        {
          code: 'STRUCTURE',
          passed: structurallyValid,
          detail: 'Teks, kunci, pembahasan dan metadata wajib.',
        },
        {
          code: 'MEDIA',
          passed: rows.every(
            (r) => !Array.isArray(r.version.media) || r.version.media.length === 0,
          ),
          detail: 'Receipt R2 perlu diverifikasi pada konten bergambar.',
        },
        {
          code: 'PACKAGE_CONTEXT',
          passed: false,
          detail: 'Lengkapi sumber, klasifikasi dan konteks paket.',
        },
        {
          code: 'COUNT',
          passed: items.length === packageCounts[p.assessmentType],
          detail: `${items.length}/${packageCounts[p.assessmentType]} soal.`,
        },
      ];
      const usageValid = items.every((i) => i.usageType === p.assessmentType);
      checks.push({
        code: 'USAGE',
        passed: usageValid,
        detail: 'Semua keluarga soal memiliki tujuan yang sama dengan paket.',
      });
      checks.push({
        code: 'REVIEW',
        passed: items.length > 0 && items.every((i) => i.reviewedAt && i.reviewedByUserId),
        detail: 'Admin mencatat tinjauan materi, kunci dan pembahasan pada setiap versi.',
      });
      checks.push({
        code: 'BLUEPRINT',
        passed: false,
        detail:
          'Distribusi aktual tersedia; validasi blueprint menunggu kontrak Curriculum yang disetujui.',
      });
      const compatible = rows.every((r) => {
        try {
          decodeSingleChoiceVersion(r.version);
          return !Array.isArray(r.version.media) || r.version.media.length === 0;
        } catch {
          return false;
        }
      });
      checks.push({
        code: 'RUNTIME',
        passed: p.assessmentType === 'DRILL' && rows.length > 0 && compatible,
        detail:
          p.assessmentType === 'PRETEST'
            ? 'Runtime Pretest belum tersedia.'
            : 'Runtime saat ini PG A–D; format impor/rich media belum dapat diterbitkan.',
      });
      checks.push({
        code: 'PUBLICATION',
        passed: false,
        detail:
          'Checklist tidak membuka proteksi publikasi importer atau kebijakan scoring/release.',
      });
      const distribution: ContentPackageDetailDto['distribution'] = [];
      for (const dimension of [
        'chapter',
        'subchapter',
        'competency',
        'difficulty',
        'format',
      ] as const) {
        const totals = new Map<string, number>();
        for (const r of rows) {
          const value =
            dimension === 'format'
              ? r.version.questionType
              : dimension === 'difficulty'
                ? (r.version.difficulty ?? 'Belum ditentukan')
                : r[dimension].code;
          totals.set(value, (totals.get(value) ?? 0) + 1);
        }
        for (const [value, count] of totals) distribution.push({ dimension, value, count });
      }
      return {
        ...p,
        items,
        distribution,
        readiness: {
          packageId: id,
          contentRevision: p.contentRevision,
          canSaveDraft: checked?.canImportDraft ?? false,
          canPublish: false,
          expectedCount: packageCounts[p.assessmentType],
          actualCount: items.length,
          checks,
          blockers: [
            ...new Set([
              ...(checked?.package?.blockers ?? []),
              ...checks.filter((c) => !c.passed).map((c) => c.code),
              ...(checked?.items.flatMap((i) => i.blockers) ?? []),
            ]),
          ],
          removedVersionIds: [],
        },
      };
    });
  }
  update(actor: string, id: string, body: UpdateContentPackageDto) {
    this.importer.enabled();
    return adminMutation(actor, 'content_package_updated', 'assessment_package', async (tx) => {
      const p = await packageContext(tx, id, true);
      assertDraftRevision(p, body.expectedRevision);
      await assertPackageUsage(tx, body.questionVersionIds, p.assessmentType);
      if (body.questionVersionIds.length) {
        const ids = await tx
          .select({
            id: questionVersions.id,
            chapter: chapters.code,
            subchapter: subchapters.code,
            level: questions.curriculumLevelNumber,
          })
          .from(questionVersions)
          .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
          .innerJoin(questions, eq(questions.id, questionVariants.questionId))
          .innerJoin(competencies, eq(competencies.id, questions.primaryCompetencyId))
          .innerJoin(subchapters, eq(subchapters.id, competencies.subchapterId))
          .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
          .where(inArray(questionVersions.id, body.questionVersionIds));
        if (
          ids.some((q) =>
            p.assessmentType === 'DRILL'
              ? q.chapter !== p.chapterCode ||
                q.subchapter !== p.subchapterCode ||
                q.level !== p.levelNumber
              : p.assessmentType === 'PRETEST' && q.chapter !== p.chapterCode,
          )
        )
          throw new BadRequestException({ code: 'PACKAGE_SCOPE_MISMATCH' });
      }
      await tx.delete(packageItems).where(eq(packageItems.packageId, id));
      if (body.questionVersionIds.length)
        await tx.insert(packageItems).values(
          body.questionVersionIds.map((questionVersionId, index) => ({
            packageId: id,
            questionVersionId,
            displayOrder: index + 1,
            maxPoints: '1',
          })),
        );
      await tx
        .update(assessmentPackages)
        .set({ name: body.name.trim(), contentRevision: p.contentRevision + 1 })
        .where(eq(assessmentPackages.id, id));
      return { id };
    });
  }
  classify(actor: string, id: string, body: ClassifyQuestionDto) {
    return adminMutation(actor, 'question_usage_classified', 'question', async (tx) => {
      const [q] = await tx.select().from(questions).where(eq(questions.id, id)).for('update');
      if (!q) throw new NotFoundException({ code: 'QUESTION_NOT_FOUND' });
      if (q.usageType && q.usageType !== body.usageType)
        throw new ConflictException({ code: 'QUESTION_USAGE_IMMUTABLE' });
      const usages = await tx
        .select({ type: assessmentPackages.assessmentType })
        .from(questionVariants)
        .innerJoin(questionVersions, eq(questionVersions.variantId, questionVariants.id))
        .innerJoin(packageItems, eq(packageItems.questionVersionId, questionVersions.id))
        .innerJoin(assessmentPackages, eq(assessmentPackages.id, packageItems.packageId))
        .where(eq(questionVariants.questionId, id));
      if (usages.some((p) => p.type !== body.usageType))
        throw new ConflictException({
          code: 'LEGACY_USAGE_CONFLICT',
          detail:
            'Soal lama berada pada paket dengan tujuan berbeda; buat salinan, jangan mengubah histori.',
        });
      await tx.update(questions).set({ usageType: body.usageType }).where(eq(questions.id, id));
      return { id };
    });
  }
  async review(actor: string, id: string, body: ReviewImportedQuestionDto) {
    this.importer.enabled();
    return adminMutation(
      actor,
      'imported_question_reviewed',
      'question_version',
      async (tx) => {
        const [row] = await tx
          .select({
            version: questionVersions,
            provenance: contentImportVersions.provenance,
            source: contentImportVersions.importId,
          })
          .from(questionVersions)
          .innerJoin(
            contentImportVersions,
            eq(contentImportVersions.questionVersionId, questionVersions.id),
          )
          .where(eq(questionVersions.id, id));
        if (!row) throw new NotFoundException({ code: 'IMPORTED_VERSION_NOT_FOUND' });
        const meta = row.provenance as Record<string, unknown>;
        const p = await packageContext(tx, body.packageId, true);
        await tx
          .select({ id: questionVersions.id })
          .from(questionVersions)
          .where(eq(questionVersions.id, id))
          .for('update');
        const detail = await tx
          .select()
          .from(packageItems)
          .where(and(eq(packageItems.packageId, p.id), eq(packageItems.questionVersionId, id)));
        if (!detail.length || p.status !== 'DRAFT')
          throw new ConflictException({ code: 'REVIEW_PACKAGE_NOT_DRAFT' });
        // Reuse the importer checks against a reconstructed stored question, not browser reviewer claims.
        const [scope] = await tx
          .select({
            family: questions,
            chapter: chapters,
            subchapter: subchapters,
            competency: competencies,
            identity: contentImportIdentities,
          })
          .from(questionVariants)
          .innerJoin(questions, eq(questions.id, questionVariants.questionId))
          .innerJoin(competencies, eq(competencies.id, questions.primaryCompetencyId))
          .innerJoin(subchapters, eq(subchapters.id, competencies.subchapterId))
          .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
          .innerJoin(contentImportIdentities, eq(contentImportIdentities.questionId, questions.id))
          .where(eq(questionVariants.id, row.version.variantId));
        if (!scope || !p.source) throw new ConflictException({ code: 'REVIEW_CONTEXT_INVALID' });
        const options = row.version.optionsOrStatements as {
          options: ImportQuestion['options'];
          categories?: ImportQuestion['metadata']['categories'];
        };
        const input = {
          externalId: scope.identity.externalId,
          type: row.version.questionType,
          chapterCode: scope.chapter.code,
          subchapterCode: scope.subchapter.code,
          competencyCode: scope.competency.code,
          stem: row.version.stem,
          options: options.options,
          answer: row.version.answerKey,
          explanation: row.version.explanation,
          difficulty: row.version.difficulty,
          metadata: {
            ...meta,
            sourceLevelNumber: scope.family.curriculumLevelNumber,
            sourceOrder: detail[0]!.displayOrder,
            assetManifest: row.version.media ?? [],
            ...(options.categories?.length ? { categories: options.categories } : {}),
          },
        };
        const { report } = await this.importer.validateWithin(tx, {
          sourceNamespace: p.source.sourceNamespace,
          target: { packageId: p.id, expectedRevision: p.contentRevision },
          questions: [input],
        });
        if (!report.canImportDraft || !report.items[0]?.canPreview)
          throw new ConflictException({ code: 'REVIEW_VALIDATION_FAILED', report });
        await tx
          .update(questionVersions)
          .set({ reviewedByUserId: actor, reviewedAt: new Date() })
          .where(eq(questionVersions.id, id));
        return { id };
      },
      { notes: body.notes.trim(), confirmed: body.confirmed },
    );
  }
}
