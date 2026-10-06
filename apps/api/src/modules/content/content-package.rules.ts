import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import {
  assessmentPackages,
  chapters,
  levels,
  questions,
  questionVariants,
  questionVersions,
  subchapters,
  type ImportQuestion,
  type QuestionUsage,
} from '@tka/database';
import type { AdminTransaction } from '../audit/admin-mutation';
import type { ContentPackageDto } from './content-packages.dto';

export const packageCounts: Record<QuestionUsage, number> = { DRILL: 10, PRETEST: 20, TRYOUT: 30 };
export async function packageContext(
  tx: AdminTransaction,
  id: string,
  lock = false,
): Promise<ContentPackageDto> {
  const query = tx
    .select()
    .from(assessmentPackages)
    .where(and(eq(assessmentPackages.id, id), eq(assessmentPackages.purpose, 'REGULAR')));
  const [p] = await (lock ? query.for('update') : query);
  if (!p || !['DRILL', 'PRETEST', 'TRYOUT'].includes(p.assessmentType))
    throw new NotFoundException({ code: 'CONTENT_PACKAGE_NOT_FOUND' });
  const [scope] = p.levelId
    ? await tx
        .select({ chapter: chapters, subchapter: subchapters, level: levels })
        .from(levels)
        .innerJoin(subchapters, eq(subchapters.id, levels.subchapterId))
        .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
        .where(eq(levels.id, p.levelId))
    : [];
  const [chapter] =
    !scope && p.chapterId
      ? await tx.select().from(chapters).where(eq(chapters.id, p.chapterId))
      : [];
  return {
    id: p.id,
    familyCode: p.familyCode,
    packageVersion: p.packageVersion,
    name: p.name,
    assessmentType: p.assessmentType as QuestionUsage,
    contentRevision: p.contentRevision,
    status: p.status,
    isDemo: p.isDemo,
    source: p.importSource,
    chapterId: scope?.chapter.id ?? chapter?.id ?? null,
    levelId: p.levelId,
    chapterCode: scope?.chapter.code ?? chapter?.code ?? null,
    chapterName: scope?.chapter.name ?? chapter?.name ?? null,
    subchapterCode: scope?.subchapter.code ?? null,
    subchapterName: scope?.subchapter.name ?? null,
    levelNumber: scope?.level.levelNumber ?? null,
  };
}
export function placementErrors(q: ImportQuestion, p: ContentPackageDto): string[] {
  if (
    p.assessmentType === 'DRILL' &&
    (q.chapterCode !== p.chapterCode ||
      q.subchapterCode !== p.subchapterCode ||
      q.metadata.sourceLevelNumber !== p.levelNumber)
  )
    return ['DRILL_SCOPE_MISMATCH'];
  if (p.assessmentType === 'PRETEST' && q.chapterCode !== p.chapterCode)
    return ['PRETEST_CHAPTER_MISMATCH'];
  return [];
}
export function assertDraftRevision(p: ContentPackageDto, revision: number) {
  if (p.status !== 'DRAFT')
    throw new ConflictException({
      code: 'PACKAGE_IMMUTABLE',
      detail: 'Paket terbit/arsip tidak dapat ditimpa. Buat versi baru.',
    });
  if (p.contentRevision !== revision)
    throw new ConflictException({
      code: 'PACKAGE_REVISION_CONFLICT',
      detail: 'Paket diubah admin lain. Muat ulang paket dan validasi preview kembali.',
    });
}
// All manual package entrypoints use this guard, not only the Excel screen.
export async function assertPackageUsage(
  tx: AdminTransaction,
  ids: string[],
  usage: QuestionUsage,
) {
  if (!ids.length) return;
  const rows = await tx
    .select({ id: questionVersions.id, usage: questions.usageType, questionId: questions.id })
    .from(questionVersions)
    .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
    .innerJoin(questions, eq(questions.id, questionVariants.questionId))
    .where(inArray(questionVersions.id, ids))
    .for('share');
  if (rows.length !== ids.length || new Set(ids).size !== ids.length)
    throw new BadRequestException({
      code: 'PACKAGE_ITEM_INVALID',
      detail: 'Versi soal harus ada dan unik.',
    });
  if (new Set(rows.map((r) => r.questionId)).size !== rows.length)
    throw new BadRequestException({
      code: 'QUESTION_FAMILY_DUPLICATE',
      detail: 'Satu paket tidak boleh memuat beberapa versi/varian dari keluarga soal yang sama.',
    });
  if (rows.some((r) => r.usage === null))
    throw new BadRequestException({
      code: 'QUESTION_UNCLASSIFIED',
      detail: 'Klasifikasikan tujuan soal lama sebelum menyusun paket.',
    });
  if (rows.some((r) => r.usage !== usage))
    throw new BadRequestException({
      code: 'QUESTION_USAGE_MISMATCH',
      detail: 'Tujuan soal berbeda dari tujuan paket. Gunakan salinan dengan identitas baru.',
    });
}
