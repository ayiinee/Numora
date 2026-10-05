import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, max } from 'drizzle-orm';
import {
  assessmentPackages,
  chapters,
  competencies,
  getDatabase,
  learningVideos,
  levels,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
  subchapters,
  videoSubchapterMappings,
} from '@tka/database';
import { adminMutation, type AdminTransaction } from '../audit/admin-mutation';
import { isYouTubeVideoUrl } from './youtube-url';
import type {
  AdminCurriculumDto,
  AdminVersionDto,
  AdminVersionsDto,
  AdminVideosDto,
  ContentPageDto,
  ContentState,
  CreateChapterDto,
  CreateCompetencyDto,
  CreateLevelDto,
  CreateQuestionDto,
  CreateSubchapterDto,
  CreateVariantDto,
  CreateVideoDto,
  QuestionContentDto,
  UpdateChapterDto,
  UpdateCompetencyDto,
  UpdateLevelDto,
  UpdateSubchapterDto,
  UpdateVideoDto,
} from './content.dto';
import type {
  AdminTryoutDraftsDto,
  CreateTryoutDraftDto,
  UpdateTryoutDraftDto,
} from './content.dto';

function required<T>(row: T | undefined): T {
  if (!row) throw new NotFoundException('Konten tidak ditemukan.');
  return row;
}
function initialSlug(name: string, code: string): string {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return normalize(name) || normalize(code);
}
function nonempty(input: object) {
  if (Object.values(input).every((value) => value === undefined))
    throw new BadRequestException('Perubahan kosong.');
}
function text(value: unknown): string {
  return value !== null &&
    typeof value === 'object' &&
    'text' in value &&
    typeof value.text === 'string'
    ? value.text
    : '';
}
function optionsFrom(value: unknown): { id: string; text: string }[] {
  return Array.isArray(value)
    ? value.flatMap((option: unknown) => {
        if (
          option === null ||
          typeof option !== 'object' ||
          !('id' in option) ||
          typeof option.id !== 'string' ||
          !('content' in option)
        )
          return [];
        return [{ id: option.id, text: text(option.content) }];
      })
    : [];
}
function versionValues(input: QuestionContentDto) {
  if (new Set(input.options.map((option) => option.id)).size !== 4)
    throw new BadRequestException('Opsi A–D harus unik.');
  return {
    questionType: 'SINGLE_CHOICE' as const,
    stem: { text: input.stem.trim() },
    optionsOrStatements: input.options.map((option) => ({
      id: option.id,
      content: { text: option.text.trim() },
    })),
    answerKey: { optionId: input.answerOptionId },
    explanation: { text: input.explanation.trim() },
    difficulty: input.difficulty.trim(),
  };
}

@Injectable()
export class ContentService {
  async curriculum(): Promise<AdminCurriculumDto> {
    const { db } = getDatabase();
    const [chapterRows, subRows, competencyRows, levelRows] = await Promise.all([
      db.select().from(chapters).orderBy(asc(chapters.displayOrder)),
      db.select().from(subchapters).orderBy(asc(subchapters.displayOrder)),
      db.select().from(competencies).orderBy(asc(competencies.code)),
      db.select().from(levels).orderBy(asc(levels.levelNumber)),
    ]);
    return {
      items: [
        ...chapterRows.map((r) => ({
          materialCategory: r.materialCategory,
          id: r.id,
          kind: 'CHAPTER' as const,
          parentId: null,
          code: r.code,
          slug: r.slug,
          name: r.name,
          displayOrder: r.displayOrder,
          status: r.status,
        })),
        ...subRows.map((r) => ({
          id: r.id,
          kind: 'SUBCHAPTER' as const,
          parentId: r.chapterId,
          code: r.code,
          slug: r.slug,
          name: r.name,
          displayOrder: r.displayOrder,
          status: r.status,
        })),
        ...competencyRows.map((r) => ({
          id: r.id,
          kind: 'COMPETENCY' as const,
          parentId: r.subchapterId,
          code: r.code,
          name: r.description,
          displayOrder: 0,
          status: r.status,
        })),
        ...levelRows.map((r) => ({
          id: r.id,
          kind: 'LEVEL' as const,
          parentId: r.subchapterId,
          code: String(r.levelNumber),
          name: r.description ?? `Level ${r.levelNumber}`,
          displayOrder: r.levelNumber,
          status: r.status,
        })),
      ],
    };
  }

  createChapter(actor: string, body: CreateChapterDto) {
    return adminMutation(actor, 'chapter_created', 'chapter', async (tx) =>
      required(
        (
          await tx
            .insert(chapters)
            .values({ ...body, slug: body.slug ?? initialSlug(body.name, body.code) })
            .returning({ id: chapters.id })
        )[0],
      ),
    );
  }
  updateChapter(actor: string, id: string, body: UpdateChapterDto) {
    nonempty(body);
    return adminMutation(actor, 'chapter_updated', 'chapter', async (tx) =>
      required(
        (
          await tx
            .update(chapters)
            .set(body)
            .where(eq(chapters.id, id))
            .returning({ id: chapters.id })
        )[0],
      ),
    );
  }
  createSubchapter(actor: string, body: CreateSubchapterDto) {
    return adminMutation(actor, 'subchapter_created', 'subchapter', async (tx) =>
      required(
        (
          await tx
            .insert(subchapters)
            .values({ ...body, slug: body.slug ?? initialSlug(body.name, body.code) })
            .returning({ id: subchapters.id })
        )[0],
      ),
    );
  }
  updateSubchapter(actor: string, id: string, body: UpdateSubchapterDto) {
    nonempty(body);
    return adminMutation(actor, 'subchapter_updated', 'subchapter', async (tx) =>
      required(
        (
          await tx
            .update(subchapters)
            .set(body)
            .where(eq(subchapters.id, id))
            .returning({ id: subchapters.id })
        )[0],
      ),
    );
  }
  createCompetency(actor: string, body: CreateCompetencyDto) {
    return adminMutation(actor, 'competency_created', 'competency', async (tx) =>
      required((await tx.insert(competencies).values(body).returning({ id: competencies.id }))[0]),
    );
  }
  updateCompetency(actor: string, id: string, body: UpdateCompetencyDto) {
    nonempty(body);
    return adminMutation(actor, 'competency_updated', 'competency', async (tx) =>
      required(
        (
          await tx
            .update(competencies)
            .set(body)
            .where(eq(competencies.id, id))
            .returning({ id: competencies.id })
        )[0],
      ),
    );
  }
  createLevel(actor: string, body: CreateLevelDto) {
    return adminMutation(actor, 'level_created', 'level', async (tx) =>
      required((await tx.insert(levels).values(body).returning({ id: levels.id }))[0]),
    );
  }
  updateLevel(actor: string, id: string, body: UpdateLevelDto) {
    nonempty(body);
    return adminMutation(actor, 'level_updated', 'level', async (tx) =>
      required(
        (
          await tx.update(levels).set(body).where(eq(levels.id, id)).returning({ id: levels.id })
        )[0],
      ),
    );
  }

  async versions(page: ContentPageDto): Promise<AdminVersionsDto> {
    const rows = await getDatabase()
      .db.select({ version: questionVersions, variant: questionVariants, question: questions })
      .from(questionVersions)
      .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
      .innerJoin(questions, eq(questions.id, questionVariants.questionId))
      .orderBy(desc(questionVersions.createdAt), desc(questionVersions.id))
      .limit(page.limit)
      .offset(page.offset);
    return {
      items: rows.map(({ version: v, variant, question: q }): AdminVersionDto => ({
        id: v.id,
        questionId: q.id,
        primaryCompetencyId: q.primaryCompetencyId,
        curriculumLevelNumber: q.curriculumLevelNumber,
        variantId: variant.id,
        variantCode: variant.variantCode,
        versionNumber: v.versionNumber,
        questionType: v.questionType,
        stem: text(v.stem),
        variantKind: variant.kind,
        originalVariantId: variant.originalVariantId,
        options: optionsFrom(v.optionsOrStatements),
        answerOptionId:
          v.answerKey !== null &&
          typeof v.answerKey === 'object' &&
          'optionId' in v.answerKey &&
          typeof v.answerKey.optionId === 'string'
            ? v.answerKey.optionId
            : null,
        explanation: text(v.explanation),
        difficulty: v.difficulty,
        contentStatus: v.contentStatus,
        questionStatus: q.status,
        reviewedByUserId: v.reviewedByUserId,
        reviewedAt: v.reviewedAt?.toISOString() ?? null,
      })),
    };
  }
  createQuestion(actor: string, body: CreateQuestionDto) {
    const values = versionValues(body);
    return adminMutation(actor, 'question_created', 'question_version', async (tx) => {
      const question = required(
        (
          await tx
            .insert(questions)
            .values({
              primaryCompetencyId: body.primaryCompetencyId,
              sourceRef: body.sourceRef,
              curriculumLevelNumber: body.curriculumLevelNumber,
            })
            .returning({ id: questions.id })
        )[0],
      );
      const variant = required(
        (
          await tx
            .insert(questionVariants)
            .values({
              questionId: question.id,
              variantCode: body.variantCode,
              kind: 'ORIGINAL',
              origin: 'ADMIN',
            })
            .returning({ id: questionVariants.id })
        )[0],
      );
      return required(
        (
          await tx
            .insert(questionVersions)
            .values({ ...values, variantId: variant.id, versionNumber: 1 })
            .returning({ id: questionVersions.id })
        )[0],
      );
    });
  }
  createVariant(actor: string, questionId: string, body: CreateVariantDto) {
    const values = versionValues(body);
    return adminMutation(actor, 'question_variant_created', 'question_version', async (tx) => {
      const original = required(
        (
          await tx
            .select()
            .from(questionVariants)
            .where(
              and(
                eq(questionVariants.id, body.originalVariantId),
                eq(questionVariants.questionId, questionId),
              ),
            )
            .limit(1)
        )[0],
      );
      if (original.kind !== 'ORIGINAL')
        throw new BadRequestException(
          'Varian harus merujuk soal ORIGINAL dalam keluarga yang sama.',
        );
      const variant = required(
        (
          await tx
            .insert(questionVariants)
            .values({
              questionId,
              originalVariantId: original.id,
              variantCode: body.variantCode,
              kind: 'VARIANT',
              origin: 'ADMIN',
            })
            .returning({ id: questionVariants.id })
        )[0],
      );
      return required(
        (
          await tx
            .insert(questionVersions)
            .values({ ...values, variantId: variant.id, versionNumber: 1 })
            .returning({ id: questionVersions.id })
        )[0],
      );
    });
  }
  revise(actor: string, sourceId: string, body: QuestionContentDto) {
    const values = versionValues(body);
    return adminMutation(actor, 'question_version_created', 'question_version', async (tx) => {
      const source = required(
        (
          await tx.select().from(questionVersions).where(eq(questionVersions.id, sourceId)).limit(1)
        )[0],
      );
      // Serialize allocation per variant. Concurrent revisions cannot reuse a version number.
      await tx
        .select({ id: questionVariants.id })
        .from(questionVariants)
        .where(eq(questionVariants.id, source.variantId))
        .for('update');
      const [last] = await tx
        .select({ number: max(questionVersions.versionNumber) })
        .from(questionVersions)
        .where(eq(questionVersions.variantId, source.variantId));
      return required(
        (
          await tx
            .insert(questionVersions)
            .values({
              ...values,
              variantId: source.variantId,
              versionNumber: (last?.number ?? 0) + 1,
            })
            .returning({ id: questionVersions.id })
        )[0],
      );
    });
  }
  questionStatus(actor: string, id: string, status: ContentState) {
    return adminMutation(actor, 'question_status_changed', 'question', async (tx) =>
      required(
        (
          await tx
            .update(questions)
            .set({ status })
            .where(eq(questions.id, id))
            .returning({ id: questions.id })
        )[0],
      ),
    );
  }
  versionStatus(actor: string, id: string, status: ContentState) {
    return adminMutation(
      actor,
      'question_version_status_changed',
      'question_version',
      async (tx) => {
        const version = required(
          (
            await tx
              .select()
              .from(questionVersions)
              .where(eq(questionVersions.id, id))
              .for('update')
          )[0],
        );
        if (version.contentStatus === status) return { id };
        if (status === 'DRAFT' || version.contentStatus === 'ARCHIVED')
          throw new ConflictException(
            'Buat revisi baru; versi yang telah digunakan tidak dapat dikembalikan menjadi draf.',
          );
        if (status === 'READY') {
          await this.validateReady(tx, version.variantId);
          if (version.questionType !== 'SINGLE_CHOICE')
            throw new ConflictException('Publikasi PGK menunggu OPEN-04.');
          const options = optionsFrom(version.optionsOrStatements);
          if (
            !Array.isArray(version.optionsOrStatements) ||
            version.optionsOrStatements.length !== 4 ||
            options.length !== 4 ||
            new Set(options.map((o) => o.id)).size !== 4 ||
            !['A', 'B', 'C', 'D'].every((id) =>
              options.some((o) => o.id === id && o.text.trim()),
            ) ||
            !text(version.stem).trim() ||
            !text(version.explanation).trim() ||
            !version.answerKey ||
            typeof version.answerKey !== 'object' ||
            !('optionId' in version.answerKey) ||
            !options.some((o) => o.id === (version.answerKey as { optionId: unknown }).optionId)
          ) {
            throw new BadRequestException('Versi PG tidak lengkap; perbaiki melalui revisi baru.');
          }
        }
        return required(
          (
            await tx
              .update(questionVersions)
              .set({
                contentStatus: status,
                ...(status === 'READY' ? { reviewedByUserId: actor, reviewedAt: new Date() } : {}),
              })
              .where(eq(questionVersions.id, id))
              .returning({ id: questionVersions.id })
          )[0],
        );
      },
    );
  }
  private async validateReady(tx: AdminTransaction, variantId: string) {
    const [row] = await tx
      .select({
        question: questions.status,
        competency: competencies.status,
        subchapter: subchapters.status,
        chapter: chapters.status,
      })
      .from(questionVariants)
      .innerJoin(questions, eq(questions.id, questionVariants.questionId))
      .innerJoin(competencies, eq(competencies.id, questions.primaryCompetencyId))
      .innerJoin(subchapters, eq(subchapters.id, competencies.subchapterId))
      .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
      .where(eq(questionVariants.id, variantId));
    if (!row || Object.values(row).some((status) => status !== 'READY'))
      throw new ConflictException(
        'Keluarga soal dan seluruh materi induk harus READY sebelum publikasi versi.',
      );
  }

  async videos(page: ContentPageDto): Promise<AdminVideosDto> {
    const rows = await getDatabase()
      .db.select({ video: learningVideos, mapping: videoSubchapterMappings })
      .from(videoSubchapterMappings)
      .innerJoin(learningVideos, eq(learningVideos.id, videoSubchapterMappings.videoId))
      .orderBy(asc(videoSubchapterMappings.recommendationOrder), asc(videoSubchapterMappings.id))
      .limit(page.limit)
      .offset(page.offset);
    return {
      items: rows.map(({ video: v, mapping: m }) => ({
        id: v.id,
        mappingId: m.id,
        subchapterId: m.subchapterId,
        title: v.title,
        url: v.url,
        source: v.source,
        recommendationOrder: m.recommendationOrder,
        status: m.status,
      })),
    };
  }
  createVideo(actor: string, body: CreateVideoDto) {
    if (!isYouTubeVideoUrl(body.url))
      throw new BadRequestException('Gunakan URL video YouTube HTTPS yang valid.');
    return adminMutation(actor, 'video_created', 'video_mapping', async (tx) => {
      const v = required(
        (
          await tx
            .insert(learningVideos)
            .values({
              title: body.title,
              url: body.url,
              source: body.source,
              curationStatus: body.status,
            })
            .returning({ id: learningVideos.id })
        )[0],
      );
      return required(
        (
          await tx
            .insert(videoSubchapterMappings)
            .values({
              videoId: v.id,
              subchapterId: body.subchapterId,
              recommendationOrder: body.recommendationOrder,
              status: body.status,
            })
            .returning({ id: videoSubchapterMappings.id })
        )[0],
      );
    });
  }
  updateVideo(actor: string, mappingId: string, body: UpdateVideoDto) {
    nonempty(body);
    return adminMutation(actor, 'video_updated', 'video_mapping', async (tx) => {
      const m = required(
        (
          await tx
            .select()
            .from(videoSubchapterMappings)
            .where(eq(videoSubchapterMappings.id, mappingId))
            .for('update')
        )[0],
      );
      // Preserve the target of historical video reports: changing the subchapter needs a new mapping.
      if (body.subchapterId !== undefined && body.subchapterId !== m.subchapterId)
        throw new ConflictException('Buat pemetaan video baru untuk subbab berbeda.');
      if (body.url !== undefined || body.status === 'READY') {
        const video = required(
          (
            await tx
              .select()
              .from(learningVideos)
              .where(eq(learningVideos.id, m.videoId))
              .for('update')
          )[0],
        );
        if (!isYouTubeVideoUrl(body.url ?? video.url))
          throw new BadRequestException(
            'Gunakan URL video YouTube HTTPS yang valid sebelum rekomendasi diaktifkan.',
          );
      }
      if (
        body.title !== undefined ||
        body.url !== undefined ||
        body.source !== undefined ||
        body.status !== undefined
      )
        await tx
          .update(learningVideos)
          .set({
            title: body.title,
            url: body.url,
            source: body.source,
            curationStatus: body.status,
            updatedAt: new Date(),
          })
          .where(eq(learningVideos.id, m.videoId));
      if (body.status !== undefined || body.recommendationOrder !== undefined)
        await tx
          .update(videoSubchapterMappings)
          .set({ status: body.status, recommendationOrder: body.recommendationOrder })
          .where(eq(videoSubchapterMappings.id, mappingId));
      return { id: mappingId };
    });
  }

  async packages(page: ContentPageDto): Promise<AdminTryoutDraftsDto> {
    const { db } = getDatabase();
    const rows = await db
      .select()
      .from(assessmentPackages)
      .where(eq(assessmentPackages.assessmentType, 'TRYOUT'))
      .orderBy(asc(assessmentPackages.familyCode), desc(assessmentPackages.packageVersion))
      .limit(page.limit)
      .offset(page.offset);
    const items = rows.length
      ? await db
          .select()
          .from(packageItems)
          .where(
            inArray(
              packageItems.packageId,
              rows.map((r) => r.id),
            ),
          )
          .orderBy(asc(packageItems.displayOrder))
      : [];
    return {
      items: rows.map((r) => ({
        id: r.id,
        familyCode: r.familyCode,
        packageVersion: r.packageVersion,
        name: r.name,
        status: r.status,
        questionVersionIds: items
          .filter((item) => item.packageId === r.id)
          .map((item) => item.questionVersionId),
      })),
    };
  }
  createPackage(actor: string, body: CreateTryoutDraftDto) {
    return adminMutation(actor, 'tryout_draft_created', 'assessment_package', async (tx) => {
      const p = required(
        (
          await tx
            .insert(assessmentPackages)
            .values({
              familyCode: body.familyCode,
              packageVersion: body.packageVersion,
              name: body.name,
              assessmentType: 'TRYOUT',
            })
            .returning({ id: assessmentPackages.id })
        )[0],
      );
      await this.draftItems(tx, p.id, body.questionVersionIds);
      return p;
    });
  }
  updatePackage(actor: string, id: string, body: UpdateTryoutDraftDto) {
    return adminMutation(actor, 'tryout_draft_updated', 'assessment_package', async (tx) => {
      const p = required(
        (
          await tx
            .select()
            .from(assessmentPackages)
            .where(
              and(eq(assessmentPackages.id, id), eq(assessmentPackages.assessmentType, 'TRYOUT')),
            )
            .for('update')
        )[0],
      );
      if (p.status !== 'DRAFT')
        throw new ConflictException(
          'Paket yang telah dipublikasikan bersifat tetap; buat versi paket baru.',
        );
      await tx
        .update(assessmentPackages)
        .set({ name: body.name })
        .where(eq(assessmentPackages.id, id));
      await tx.delete(packageItems).where(eq(packageItems.packageId, id));
      await this.draftItems(tx, id, body.questionVersionIds);
      return { id };
    });
  }
  private async draftItems(tx: AdminTransaction, packageId: string, versionIds: string[]) {
    if (!versionIds.length) return;
    const rows = await tx
      .select({
        id: questionVersions.id,
        status: questionVersions.contentStatus,
        questionStatus: questions.status,
      })
      .from(questionVersions)
      .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
      .innerJoin(questions, eq(questions.id, questionVariants.questionId))
      .where(inArray(questionVersions.id, versionIds));
    if (
      rows.length !== versionIds.length ||
      rows.some((r) => r.status !== 'READY' || r.questionStatus !== 'READY')
    )
      throw new BadRequestException('Draf hanya dapat memuat versi dan keluarga soal READY.');
    // Draft metadata only: provisional equal item weights, never official scoring configuration.
    await tx.insert(packageItems).values(
      versionIds.map((id, index) => ({
        packageId,
        questionVersionId: id,
        displayOrder: index + 1,
        maxPoints: '1',
      })),
    );
  }
  publishPackage(): never {
    throw new ConflictException({
      code: 'TRYOUT_POLICY_OPEN',
      detail:
        'Publikasi Tryout menunggu konfigurasi resmi OPEN-05 serta kebijakan scoring/release yang disetujui. Draf tetap tersimpan.',
    });
  }
}
