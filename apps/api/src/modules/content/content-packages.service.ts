import { presentFixtureText } from '@tka/database';
import { TRYOUT_PARTIAL_POLICY } from '@tka/assessment-engine';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  allowSyntheticContent,
  assessmentPackages,
  auditLogs,
  assessmentBlueprintVersions,
  scoringPolicyVersions,
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
  tryoutBatchCloseAt,
  type ImportQuestion,
} from '@tka/database';
import { adminMutation, type AdminTransaction } from '../audit/admin-mutation';
import { decodeAssessmentContent, databaseTime } from '@tka/assessment-engine';
import { decodeSingleChoiceVersion } from '../learning/drill.policy';
import { ContentImportService } from './content-import.service';
import {
  assertDraftRevision,
  assertPackageUsage,
  packageContext,
  packageCounts,
  placementErrors,
} from './content-package.rules';
import { structuralErrors, digest } from './content-import.validation';
import { R2MediaStorage } from './r2-media.storage';
import type {
  ClassifyQuestionDto,
  ApproveContentPackageDto,
  PublishContentPackageDto,
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
  constructor(
    @Inject(ContentImportService) private readonly importer: ContentImportService,
    @Inject(R2MediaStorage) private readonly storage: R2MediaStorage,
  ) {}
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
    if (body.isDemo && !allowSyntheticContent())
      throw new BadRequestException({ code: 'SYNTHETIC_CONTENT_FORBIDDEN' });
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
            p.isDemo !== (body.isDemo ?? false),
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
          isDemo: body.isDemo ?? false,
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
    return getDatabase().db.transaction((tx) => this.detailWithin(tx, id));
  }
  async detailWithin(tx: AdminTransaction, id: string): Promise<ContentPackageDetailDto> {
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
      .leftJoin(competencies, eq(competencies.id, questions.primaryCompetencyId))
      .leftJoin(levels, eq(levels.id, questionVersions.levelId))
      .leftJoin(
        subchapters,
        eq(
          subchapters.id,
          sql`coalesce(${questions.subchapterId},${levels.subchapterId},${competencies.subchapterId})`,
        ),
      )
      .leftJoin(
        chapters,
        eq(chapters.id, sql`coalesce(${questions.chapterId},${subchapters.chapterId})`),
      )
      .leftJoin(contentImportIdentities, eq(contentImportIdentities.questionId, questions.id))
      .leftJoin(
        contentImportVersions,
        eq(contentImportVersions.questionVersionId, questionVersions.id),
      )
      .where(eq(packageItems.packageId, id))
      .orderBy(asc(packageItems.displayOrder))
      .for('share', { of: [questions, questionVersions] });
    // Lock optional indicators separately: PostgreSQL cannot lock a nullable outer join.
    const chapterIds = rows.flatMap((r) => (r.chapter ? [r.chapter.id] : []));
    if (chapterIds.length) {
      const locked = await tx
        .select()
        .from(chapters)
        .where(inArray(chapters.id, chapterIds))
        .for('share');
      for (const r of rows) r.chapter = locked.find((c) => c.id === r.chapter?.id) ?? null;
    }
    const subchapterIds = rows.flatMap((r) => (r.subchapter ? [r.subchapter.id] : []));
    if (subchapterIds.length) {
      const locked = await tx
        .select()
        .from(subchapters)
        .where(inArray(subchapters.id, subchapterIds))
        .for('share');
      for (const r of rows) r.subchapter = locked.find((s) => s.id === r.subchapter?.id) ?? null;
    }
    const indicatorIds = rows.flatMap((r) => (r.competency ? [r.competency.id] : []));
    if (indicatorIds.length) {
      const locked = await tx
        .select()
        .from(competencies)
        .where(inArray(competencies.id, indicatorIds))
        .for('share');
      for (const r of rows) r.competency = locked.find((c) => c.id === r.competency?.id) ?? null;
    }
    // Lock every question's academic level, including mixed Tryout and Pretest scopes.
    const questionLevels = await tx
      .select()
      .from(levels)
      .where(
        inArray(
          levels.id,
          rows.flatMap((r) => (r.version.levelId ? [r.version.levelId] : [])),
        ),
      )
      .for('share');
    const items = rows.map((r) => {
      const meta = (r.provenance && typeof r.provenance === 'object' ? r.provenance : {}) as Record<
        string,
        unknown
      >;
      const content = r.version.optionsOrStatements as
        | {
            options?: ImportQuestion['options'];
            categories?: ImportQuestion['metadata']['categories'];
          }
        | ImportQuestion['options'];
      const q = {
        externalId: r.identity?.externalId ?? r.question.sourceRef ?? r.question.id,
        type: r.version.questionType,
        chapterCode: r.chapter?.code ?? null,
        subchapterCode: r.subchapter?.code ?? null,
        competencyCode: r.competency?.code ?? null,
        difficulty: r.version.difficulty,
        stem: r.version.stem,
        options: Array.isArray(content) ? content : content?.options,
        answer: r.version.answerKey,
        explanation: r.version.explanation,
        metadata: {
          ...meta,
          ...(r.question.sourceQuestionId ? { sourceQuestionId: r.question.sourceQuestionId } : {}),
          sourceLevelNumber: r.question.curriculumLevelNumber,
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
        question: structuralErrors(q, false, p.assessmentType === 'TRYOUT').length
          ? null
          : (q as unknown as ExcelQuestionDto),
      };
    });
    const structurallyValid = items.every((i) => i.question !== null);
    const checked =
      items.length && structurallyValid && p.source
        ? (
            await this.importer.validateWithin(tx, {
              sourceNamespace: p.source.sourceNamespace,
              ...(p.status === 'DRAFT'
                ? { target: { packageId: id, expectedRevision: p.contentRevision } }
                : {}),
              questions: items.map((i) => i.question!),
            })
          ).report
        : null;
    const checks = checked?.package?.checks.filter((c) => c.code !== 'PUBLICATION') ?? [
      {
        code: 'STRUCTURE',
        passed: structurallyValid && (checked?.canImportDraft ?? true),
        detail: 'Teks, kunci, pembahasan dan metadata wajib.',
      },
      {
        code: 'MEDIA',
        passed: checked
          ? checked.items.every((i) => i.canPreview)
          : rows.every((r) => !Array.isArray(r.version.media) || r.version.media.length === 0),
        detail: 'Receipt R2 perlu diverifikasi pada konten bergambar.',
      },
      {
        code: 'PACKAGE_CONTEXT',
        passed:
          !!p.source &&
          items.every((i) => !!i.question && placementErrors(i.question, p).length === 0) &&
          rows.every((r) => r.identity?.sourceNamespace === p.source?.sourceNamespace),
        detail: 'Lengkapi sumber, klasifikasi dan konteks paket.',
      },
      {
        code: 'COUNT',
        passed: items.length === packageCounts[p.assessmentType],
        detail: `${items.length}/${packageCounts[p.assessmentType]} soal.`,
      },
    ];
    const usageValid = items.every((i) => i.usageType === p.assessmentType);
    const [level] = p.levelId
      ? await tx.select().from(levels).where(eq(levels.id, p.levelId)).for('share')
      : [];
    checks.push({
      code: 'METADATA',
      passed:
        items.length > 0 &&
        rows.every(
          (r) =>
            (p.assessmentType === 'TRYOUT' || !!r.version.difficulty) &&
            r.version.contentStatus !== 'ARCHIVED' &&
            r.question.status !== 'ARCHIVED' &&
            ((!r.question.primaryCompetencyId && p.assessmentType === 'TRYOUT') ||
              (p.assessmentType === 'TRYOUT'
                ? r.competency?.status !== 'ARCHIVED'
                : r.competency?.status === 'READY')) &&
            ((!r.subchapter && p.assessmentType === 'TRYOUT') ||
              (p.assessmentType === 'TRYOUT'
                ? r.subchapter?.status !== 'ARCHIVED'
                : r.subchapter?.status === 'READY')) &&
            ((!r.chapter && p.assessmentType === 'TRYOUT') ||
              (p.assessmentType === 'TRYOUT'
                ? r.chapter?.status !== 'ARCHIVED'
                : r.chapter?.status === 'READY')) &&
            ((!r.version.levelId &&
              r.question.curriculumLevelNumber == null &&
              p.assessmentType === 'TRYOUT') ||
              questionLevels.some(
                (l) =>
                  l.id === r.version.levelId &&
                  l.subchapterId === r.subchapter?.id &&
                  l.levelNumber === r.question.curriculumLevelNumber &&
                  (p.assessmentType === 'TRYOUT' ? l.status !== 'ARCHIVED' : l.status === 'READY'),
              )),
        ) &&
        (!p.levelId || level?.status === 'READY'),
      detail:
        p.assessmentType === 'TRYOUT'
          ? 'Bab, subbab, indikator, level, dan kesulitan boleh kosong. Pemetaan yang tersedia dipertahankan.'
          : 'Kesulitan wajib; materi yang dipakai harus READY.',
    });
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
    const [stored] = await tx
      .select()
      .from(assessmentPackages)
      .where(eq(assessmentPackages.id, id));
    const [blueprint] = stored?.blueprintVersionId
      ? await tx
          .select()
          .from(assessmentBlueprintVersions)
          .where(eq(assessmentBlueprintVersions.id, stored.blueprintVersionId))
          .for('share')
      : [];
    const approved =
      blueprint?.status === 'SEALED' &&
      (stored?.curriculumApproval?.compositionDigest ??
        stored?.curriculumApproval?.manifestDigest) === this.manifest(p, items);
    checks.push({
      code: 'BLUEPRINT',
      passed: approved,
      detail: approved
        ? 'Persetujuan Curriculum sesuai dengan susunan paket ini.'
        : 'Catat persetujuan Curriculum setelah semua soal ditinjau.',
    });
    const compatible = rows.every((r) => {
      try {
        if (p.assessmentType === 'DRILL') decodeSingleChoiceVersion(r.version);
        else if (p.assessmentType === 'TRYOUT') {
          const content = decodeAssessmentContent(r.version);
          if (content.type !== 'SINGLE_CHOICE' && !r.version.scoringRubricVersionId) return false;
        } else if (decodeAssessmentContent(r.version).type !== 'SINGLE_CHOICE') return false;
        if (Array.isArray(r.version.media) && r.version.media.length) this.storage.settings(true);
        return true;
      } catch {
        return false;
      }
    });
    checks.push({
      code: 'RUNTIME',
      passed: rows.length > 0 && compatible,
      detail: compatible
        ? 'Soal dapat dimainkan; Tryout PGK memakai rubrik parsial dan gambar memakai akses R2 terotorisasi.'
        : 'Periksa konten, kunci dan gambar. Draft PGK lama tanpa rubrik perlu diimpor ulang untuk membuat versi scoring baru.',
    });
    const canPublish = p.status === 'DRAFT' && checks.every((c) => c.passed);
    const distribution: ContentPackageDetailDto['distribution'] = [];
    for (const dimension of [
      'chapter',
      'subchapter',
      'competency',
      'difficulty',
      'format',
    ] as const) {
      if (dimension === 'competency' && p.assessmentType === 'TRYOUT') continue;
      const totals = new Map<string, number>();
      for (const r of rows) {
        const value =
          dimension === 'format'
            ? r.version.questionType
            : dimension === 'difficulty'
              ? (r.version.difficulty ?? 'Belum ditentukan')
              : (r[dimension]?.code ?? '');
        totals.set(value, (totals.get(value) ?? 0) + 1);
      }
      for (const [value, count] of totals) distribution.push({ dimension, value, count });
    }
    return {
      ...p,
      items: items.map((item) => ({
        ...item,
        question: item.question
          ? {
              ...item.question,
              stem: {
                ...item.question.stem,
                text: presentFixtureText(
                  item.questionVersionId,
                  'stem',
                  item.question.stem.text ?? '',
                ),
              },
              explanation: {
                ...item.question.explanation,
                text: presentFixtureText(
                  item.questionVersionId,
                  'explanation',
                  item.question.explanation.text ?? '',
                ),
              },
            }
          : null,
      })),
      distribution,
      readiness: {
        packageId: id,
        contentRevision: p.contentRevision,
        canSaveDraft: p.status === 'DRAFT' && (checked?.canImportDraft ?? false),
        canPublish,
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
  }
  private manifest(
    p: ContentPackageDetailDto | Awaited<ReturnType<typeof packageContext>>,
    items: ContentPackageDetailDto['items'],
  ) {
    return digest({
      packageId: p.id,
      revision: p.contentRevision,
      assessmentType: p.assessmentType,
      items: items.map((i) => ({
        questionVersionId: i.questionVersionId,
        displayOrder: i.displayOrder,
        question: i.question,
      })),
    });
  }
  approve(actor: string, id: string, body: ApproveContentPackageDto) {
    this.importer.enabled();
    return adminMutation(
      actor,
      'content_package_curriculum_approved',
      'assessment_package',
      (tx) => this.approveWithin(tx, id, body),
      { reference: body.reference.trim(), confirmed: body.confirmed },
    );
  }
  private async approveWithin(tx: AdminTransaction, id: string, body: ApproveContentPackageDto) {
    const p = await packageContext(tx, id, true);
    assertDraftRevision(p, body.expectedRevision);
    const detail = await this.detailWithin(tx, id);
    const invalid = detail.readiness.checks.filter(
      (c) => !c.passed && !['BLUEPRINT', 'RUNTIME'].includes(c.code),
    );
    if (invalid.length)
      throw new ConflictException({
        code: 'PACKAGE_REVIEW_REQUIRED',
        detail: 'Lengkapi soal dan tinjau seluruh versi sebelum mencatat persetujuan.',
      });
    const manifestDigest = this.manifest(p, detail.items);
    const definition = {
      assessmentType: p.assessmentType,
      chapterId: p.chapterId,
      levelId: p.levelId,
      distribution: detail.distribution,
      questionVersionIds: detail.items.map((i) => i.questionVersionId),
      reference: body.reference.trim(),
      isDemo: p.isDemo,
    };
    const code = `ADMIN-PACKAGE-${id}`;
    const [previous] = await tx
      .select()
      .from(assessmentBlueprintVersions)
      .where(eq(assessmentBlueprintVersions.code, code))
      .orderBy(desc(assessmentBlueprintVersions.version))
      .limit(1);
    const blueprintDigest = digest(definition);
    const [blueprint] =
      previous?.digest === blueprintDigest
        ? [previous]
        : await tx
            .insert(assessmentBlueprintVersions)
            .values({
              code,
              version: (previous?.version ?? 0) + 1,
              definition,
              digest: blueprintDigest,
              status: 'SEALED',
            })
            .returning({ id: assessmentBlueprintVersions.id });
    await tx
      .update(assessmentPackages)
      .set({
        blueprintVersionId: blueprint!.id,
        curriculumApproval: {
          reference: body.reference.trim(),
          approvedAt: new Date().toISOString(),
          manifestDigest,
        },
      })
      .where(eq(assessmentPackages.id, id));
    return { id };
  }
  publish(actor: string, id: string, body: PublishContentPackageDto) {
    this.importer.enabled();
    return adminMutation(actor, 'content_package_published', 'assessment_package', async (tx) => {
      const p = await packageContext(tx, id, true);
      if (p.isDemo && !allowSyntheticContent())
        throw new BadRequestException({ code: 'SYNTHETIC_CONTENT_FORBIDDEN' });
      if (p.status === 'PUBLISHED') return { id };
      assertDraftRevision(p, body.expectedRevision);
      if (p.assessmentType === 'DRILL')
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`drill-publish:${p.levelId}`}))`,
        );
      await tx
        .select({ id: questionVersions.id })
        .from(questionVersions)
        .innerJoin(packageItems, eq(packageItems.questionVersionId, questionVersions.id))
        .where(eq(packageItems.packageId, id))
        .orderBy(asc(questionVersions.id))
        .for('update', { of: questionVersions });
      await tx
        .select({ id: questions.id })
        .from(questions)
        .innerJoin(questionVariants, eq(questionVariants.questionId, questions.id))
        .innerJoin(questionVersions, eq(questionVersions.variantId, questionVariants.id))
        .innerJoin(packageItems, eq(packageItems.questionVersionId, questionVersions.id))
        .where(eq(packageItems.packageId, id))
        .orderBy(asc(questions.id))
        .for('update', { of: questions });
      if (body.confirmed === true) {
        const current = await this.detailWithin(tx, id);
        if (
          current.readiness.checks.some(
            (c) => !c.passed && !['REVIEW', 'BLUEPRINT'].includes(c.code),
          )
        )
          throw new ConflictException({
            code: 'PACKAGE_NOT_READY',
            detail: 'Perbaiki semua masalah paket sebelum Publish.',
            blockers: current.readiness.blockers,
          });
        await tx
          .update(questionVersions)
          .set({ reviewedByUserId: actor, reviewedAt: new Date() })
          .where(
            inArray(
              questionVersions.id,
              current.items.filter((i) => !i.reviewedAt).map((i) => i.questionVersionId),
            ),
          );
        await this.approveWithin(tx, id, {
          expectedRevision: body.expectedRevision,
          confirmed: true,
          reference: `Konfirmasi Publish Admin — ${p.name}`,
        });
        await tx.insert(auditLogs).values({
          actorUserId: actor,
          action: 'content_package_review_and_approval_confirmed',
          entityType: 'assessment_package',
          entityId: id,
          metadata: {
            contentRevision: p.contentRevision,
            questionVersionIds: current.items.map((i) => i.questionVersionId),
          },
        });
      }
      const detail = await this.detailWithin(tx, id);
      if (!detail.readiness.canPublish)
        throw new ConflictException({
          code: 'PACKAGE_NOT_READY',
          detail: 'Paket belum lengkap, ditinjau, atau disetujui; periksa checklist.',
          blockers: detail.readiness.blockers,
        });
      const policyCode =
        p.assessmentType === 'DRILL'
          ? 'DRILL_PRD_V06'
          : p.assessmentType === 'TRYOUT'
            ? detail.items.some((i) => i.question?.type !== 'SINGLE_CHOICE')
              ? TRYOUT_PARTIAL_POLICY
              : 'TRYOUT_PRD_V06'
            : 'PRETEST_PRD_V06';
      if (p.assessmentType === 'PRETEST')
        await tx
          .insert(scoringPolicyVersions)
          .values({
            policyCode,
            version: 1,
            status: 'PUBLISHED',
            configuration: {
              prdVersion: '0.6',
              questionType: 'SINGLE_CHOICE',
              questionCount: 20,
              initialLevel: { level2MinimumCorrect: 8, level3MinimumCorrect: 19 },
              xp: 0,
            },
          })
          .onConflictDoNothing();
      const [policy] = await tx
        .select()
        .from(scoringPolicyVersions)
        .where(
          and(
            eq(scoringPolicyVersions.policyCode, policyCode),
            eq(scoringPolicyVersions.version, 1),
            eq(scoringPolicyVersions.status, 'PUBLISHED'),
          ),
        )
        .for('share');
      if (!policy)
        throw new ConflictException({
          code: 'SCORING_POLICY_NOT_READY',
          detail: 'Kebijakan scoring PRD belum tersedia.',
        });
      const now = await databaseTime(tx);
      let releaseAt = now;
      let closeAt: Date | null = null;
      if (p.assessmentType === 'TRYOUT') {
        const requested = body.releaseAt ? new Date(body.releaseAt) : now;
        if (!Number.isFinite(requested.getTime()))
          throw new BadRequestException({
            code: 'TRYOUT_SCHEDULE_INVALID',
            detail: 'Tanggal rilis tidak valid.',
          });
        releaseAt = requested > now ? requested : now;
        closeAt = tryoutBatchCloseAt(releaseAt);
      }
      if (p.assessmentType === 'DRILL') {
        const [conflict] = p.isDemo
          ? []
          : await tx
              .select({ id: assessmentPackages.id })
              .from(assessmentPackages)
              .where(
                and(
                  eq(assessmentPackages.levelId, p.levelId!),
                  eq(assessmentPackages.assessmentType, 'DRILL'),
                  eq(assessmentPackages.purpose, 'REGULAR'),
                  eq(assessmentPackages.status, 'PUBLISHED'),
                  eq(assessmentPackages.isDemo, false),
                ),
              );
        if (conflict)
          throw new ConflictException({
            code: 'DRILL_LEVEL_ALREADY_PUBLISHED',
            detail: 'Arsipkan paket aktif sebelum menerbitkan revisi level.',
          });
      }
      await tx
        .update(questionVersions)
        .set({ contentStatus: 'READY' })
        .where(
          inArray(
            questionVersions.id,
            detail.items.map((i) => i.questionVersionId),
          ),
        );
      await tx
        .update(questions)
        .set({ status: 'READY' })
        .where(
          inArray(
            questions.id,
            detail.items.map((i) => i.questionId),
          ),
        );
      await tx
        .update(assessmentPackages)
        .set({
          status: 'PUBLISHED',
          ...(p.assessmentType === 'TRYOUT'
            ? {
                frozenAt: now,
                curriculumApproval: sql`jsonb_set(jsonb_set(${assessmentPackages.curriculumApproval}, '{compositionDigest}', ${assessmentPackages.curriculumApproval}->'manifestDigest'), '{manifestDigest}', to_jsonb(irt_compute.payload_digest(jsonb_build_object('packageId', ${id}::uuid, 'blueprintVersionId', ${assessmentPackages.blueprintVersionId}, 'scoringPolicyVersionId', ${policy.id}::uuid, 'items', (select jsonb_agg(to_jsonb(i) order by i.display_order,i.id) from public.package_items i where i.package_id=${id}::uuid)))))`,
              }
            : {}),
          releaseAt,
          closeAt,
          scoringPolicyVersionId: policy.id,
          ...(p.assessmentType === 'TRYOUT' ? { durationSeconds: 600 } : {}),
        })
        .where(eq(assessmentPackages.id, id));
      return { id };
    });
  }
  archive(actor: string, id: string, revision: number) {
    this.importer.enabled();
    return adminMutation(actor, 'content_package_archived', 'assessment_package', async (tx) => {
      const p = await packageContext(tx, id, true);
      if (p.status === 'ARCHIVED') return { id };
      if (p.contentRevision !== revision || !['PUBLISHED', 'CLOSED'].includes(p.status))
        throw new ConflictException({
          code: 'PACKAGE_ARCHIVE_CONFLICT',
          detail: 'Muat ulang paket terbit sebelum mengarsipkannya.',
        });
      await tx
        .update(assessmentPackages)
        .set({ status: 'ARCHIVED' })
        .where(eq(assessmentPackages.id, id));
      return { id };
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
          .leftJoin(competencies, eq(competencies.id, questions.primaryCompetencyId))
          .leftJoin(levels, eq(levels.id, questionVersions.levelId))
          .leftJoin(
            subchapters,
            eq(
              subchapters.id,
              sql`coalesce(${questions.subchapterId},${levels.subchapterId},${competencies.subchapterId})`,
            ),
          )
          .leftJoin(
            chapters,
            eq(chapters.id, sql`coalesce(${questions.chapterId},${subchapters.chapterId})`),
          )
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
          .innerJoin(questionVersions, eq(questionVersions.variantId, questionVariants.id))
          .innerJoin(questions, eq(questions.id, questionVariants.questionId))
          .leftJoin(competencies, eq(competencies.id, questions.primaryCompetencyId))
          .leftJoin(levels, eq(levels.id, questionVersions.levelId))
          .leftJoin(
            subchapters,
            eq(
              subchapters.id,
              sql`coalesce(${questions.subchapterId},${levels.subchapterId},${competencies.subchapterId})`,
            ),
          )
          .leftJoin(
            chapters,
            eq(chapters.id, sql`coalesce(${questions.chapterId},${subchapters.chapterId})`),
          )
          .innerJoin(contentImportIdentities, eq(contentImportIdentities.questionId, questions.id))
          .where(eq(questionVersions.id, row.version.id));
        if (!scope || !p.source) throw new ConflictException({ code: 'REVIEW_CONTEXT_INVALID' });
        const options = row.version.optionsOrStatements as {
          options: ImportQuestion['options'];
          categories?: ImportQuestion['metadata']['categories'];
        };
        const input = {
          externalId: scope.identity.externalId,
          type: row.version.questionType,
          chapterCode: scope.chapter?.code ?? null,
          subchapterCode: scope.subchapter?.code ?? null,
          competencyCode: scope.competency?.code ?? null,
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
