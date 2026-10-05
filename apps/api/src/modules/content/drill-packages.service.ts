import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  assessmentPackages,
  chapters,
  competencies,
  getDatabase,
  levels,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
  scoringPolicyVersions,
  subchapters,
} from '@tka/database';
import { adminMutation, type AdminTransaction } from '../audit/admin-mutation';
import {
  decodeSingleChoiceVersion,
  DRILL_POLICY_CODE,
  DRILL_POLICY_VERSION,
} from '../learning/drill.policy';
import type { ContentPageDto } from './content.dto';
import type {
  AdminDrillPackageDto,
  AdminDrillPackagesDto,
  CreateDrillPackageDto,
  UpdateDrillPackageDto,
} from './drill-packages.dto';

const problem = (code: string, detail: string) => ({ code, detail });
function playable(version: typeof questionVersions.$inferSelect) {
  try {
    const content = decodeSingleChoiceVersion(version);
    return (
      !!content.stem.trim() &&
      !!content.explanation.trim() &&
      content.options.every((option) => !!option.text.trim())
    );
  } catch {
    return false;
  }
}
function found<T>(row: T | undefined): T {
  if (!row)
    throw new NotFoundException(problem('DRILL_PACKAGE_NOT_FOUND', 'Paket Drill tidak ditemukan.'));
  return row;
}

@Injectable()
export class DrillPackagesService {
  async list(page: ContentPageDto): Promise<AdminDrillPackagesDto> {
    const { db } = getDatabase();
    const rows = await db
      .select()
      .from(assessmentPackages)
      .where(eq(assessmentPackages.assessmentType, 'DRILL'))
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
      items: rows.map((r) =>
        this.present(
          r,
          items.filter((i) => i.packageId === r.id).map((i) => i.questionVersionId),
        ),
      ),
    };
  }
  async detail(id: string): Promise<AdminDrillPackageDto> {
    const { db } = getDatabase();
    const row = found(
      (
        await db
          .select()
          .from(assessmentPackages)
          .where(and(eq(assessmentPackages.id, id), eq(assessmentPackages.assessmentType, 'DRILL')))
      )[0],
    );
    const items = await db
      .select()
      .from(packageItems)
      .where(eq(packageItems.packageId, id))
      .orderBy(asc(packageItems.displayOrder));
    return this.present(
      row,
      items.map((i) => i.questionVersionId),
    );
  }
  private present(
    row: typeof assessmentPackages.$inferSelect,
    ids: string[],
  ): AdminDrillPackageDto {
    return {
      id: row.id,
      familyCode: row.familyCode,
      packageVersion: row.packageVersion,
      name: row.name,
      levelId: row.levelId!,
      variantIndex: row.variantIndex,
      scoringPolicyVersionId: row.scoringPolicyVersionId,
      status: row.status,
      releaseAt: row.releaseAt?.toISOString() ?? null,
      questionVersionIds: ids,
    };
  }
  private async lock(tx: AdminTransaction, id: string) {
    return found(
      (
        await tx
          .select()
          .from(assessmentPackages)
          .where(and(eq(assessmentPackages.id, id), eq(assessmentPackages.assessmentType, 'DRILL')))
          .for('update')
      )[0],
    );
  }
  private async validate(
    tx: AdminTransaction,
    levelId: string,
    policyId: string,
    ids: string[],
    publishing: boolean,
  ) {
    const [scope] = await tx
      .select({ level: levels, subchapter: subchapters, chapter: chapters })
      .from(levels)
      .innerJoin(subchapters, eq(subchapters.id, levels.subchapterId))
      .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
      .where(eq(levels.id, levelId))
      .for('share');
    if (!scope) throw new BadRequestException('Level tidak tersedia.');
    const [policy] = await tx
      .select()
      .from(scoringPolicyVersions)
      .where(eq(scoringPolicyVersions.id, policyId))
      .for('share');
    if (!policy) throw new BadRequestException('Versi kebijakan penilaian tidak tersedia.');
    const configuration = policy.configuration;
    if (
      publishing &&
      (policy.status !== 'PUBLISHED' ||
        configuration === null ||
        typeof configuration !== 'object' ||
        policy.policyCode !== DRILL_POLICY_CODE ||
        policy.version !== DRILL_POLICY_VERSION ||
        !('questionType' in configuration) ||
        configuration.questionType !== 'SINGLE_CHOICE' ||
        [scope.level.status, scope.subchapter.status, scope.chapter.status].some(
          (s) => s !== 'READY',
        ))
    )
      throw new ConflictException(
        problem(
          'DRILL_PACKAGE_NOT_READY',
          'Materi dan kebijakan penilaian harus siap sebelum publikasi.',
        ),
      );
    if (publishing && ids.length !== 10)
      throw new ConflictException(
        problem('DRILL_PACKAGE_INCOMPLETE', 'Paket Drill harus berisi 10 soal.'),
      );
    if (!ids.length) return;
    const rows = await tx
      .select({ version: questionVersions, question: questions, competency: competencies })
      .from(questionVersions)
      .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
      .innerJoin(questions, eq(questions.id, questionVariants.questionId))
      .innerJoin(competencies, eq(competencies.id, questions.primaryCompetencyId))
      .where(inArray(questionVersions.id, ids))
      .for('share');
    if (
      rows.length !== ids.length ||
      new Set(ids).size !== ids.length ||
      rows.some(
        (r) =>
          r.competency.subchapterId !== scope.level.subchapterId ||
          (r.question.curriculumLevelNumber !== null &&
            r.question.curriculumLevelNumber !== scope.level.levelNumber) ||
          r.version.questionType !== 'SINGLE_CHOICE',
      )
    )
      throw new BadRequestException(
        'Soal harus unik, bertipe PG satu jawaban, dan sesuai subbab serta nomor level kurikulum.',
      );
    if (
      publishing &&
      rows.some(
        (r) =>
          r.version.contentStatus !== 'READY' ||
          !r.version.reviewedAt ||
          !r.version.reviewedByUserId ||
          r.question.status !== 'READY' ||
          r.competency.status !== 'READY',
      )
    )
      throw new ConflictException(
        problem(
          'DRILL_CONTENT_NOT_READY',
          'Semua versi soal dan kompetensi harus READY dan ditinjau.',
        ),
      );
    if (publishing && rows.some((r) => !playable(r.version)))
      throw new ConflictException(
        problem('DRILL_CONTENT_INVALID', 'Teks, opsi, kunci, atau pembahasan soal tidak valid.'),
      );
  }
  private async items(tx: AdminTransaction, id: string, ids: string[]) {
    if (ids.length)
      await tx.insert(packageItems).values(
        ids.map((questionVersionId, index) => ({
          packageId: id,
          questionVersionId,
          displayOrder: index + 1,
          maxPoints: '1',
        })),
      );
  }
  create(actor: string, body: CreateDrillPackageDto) {
    return adminMutation(actor, 'drill_package_created', 'assessment_package', async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${body.familyCode}))`);
      const siblings = await tx
        .select()
        .from(assessmentPackages)
        .where(eq(assessmentPackages.familyCode, body.familyCode));
      if (
        siblings.some(
          (p) =>
            p.assessmentType !== 'DRILL' ||
            p.levelId !== body.levelId ||
            p.variantIndex !== body.variantIndex,
        )
      )
        throw new ConflictException('Keluarga paket harus mempertahankan tipe, level, dan varian.');
      await this.validate(
        tx,
        body.levelId,
        body.scoringPolicyVersionId,
        body.questionVersionIds,
        false,
      );
      const { questionVersionIds, ...metadata } = body;
      const row = found(
        (
          await tx
            .insert(assessmentPackages)
            .values({ ...metadata, assessmentType: 'DRILL' })
            .returning({ id: assessmentPackages.id })
        )[0],
      );
      await this.items(tx, row.id, questionVersionIds);
      return row;
    });
  }
  update(actor: string, id: string, body: UpdateDrillPackageDto) {
    return adminMutation(actor, 'drill_package_updated', 'assessment_package', async (tx) => {
      const row = await this.lock(tx, id);
      if (row.status !== 'DRAFT')
        throw new ConflictException('Paket terbit tidak dapat diedit; buat versi baru.');
      await this.validate(
        tx,
        row.levelId!,
        body.scoringPolicyVersionId,
        body.questionVersionIds,
        false,
      );
      await tx
        .update(assessmentPackages)
        .set({ name: body.name, scoringPolicyVersionId: body.scoringPolicyVersionId })
        .where(eq(assessmentPackages.id, id));
      await tx.delete(packageItems).where(eq(packageItems.packageId, id));
      await this.items(tx, id, body.questionVersionIds);
      return { id };
    });
  }
  publish(actor: string, id: string) {
    return adminMutation(actor, 'drill_package_published', 'assessment_package', async (tx) => {
      const row = await this.lock(tx, id);
      if (row.status === 'PUBLISHED') return { id };
      if (row.status !== 'DRAFT') throw new ConflictException('Hanya draf yang dapat diterbitkan.');
      if (row.variantIndex === null || row.scoringPolicyVersionId === null)
        throw new ConflictException(
          problem(
            'DRILL_PACKAGE_NOT_READY',
            'Varian dan kebijakan penilaian harus tersedia sebelum publikasi.',
          ),
        );
      if (row.variantIndex !== 1)
        throw new ConflictException(
          problem('DRILL_MVP_SINGLE_VARIANT', 'MVP memakai satu varian pada setiap level.'),
        );
      // Serialize publications per level, including requests for different families.
      await tx
        .select({ id: levels.id })
        .from(levels)
        .where(eq(levels.id, row.levelId!))
        .for('no key update');
      const [published] = await tx
        .select({ id: assessmentPackages.id })
        .from(assessmentPackages)
        .where(
          and(
            eq(assessmentPackages.levelId, row.levelId!),
            eq(assessmentPackages.assessmentType, 'DRILL'),
            eq(assessmentPackages.purpose, 'REGULAR'),
            eq(assessmentPackages.status, 'PUBLISHED'),
            eq(assessmentPackages.isDemo, false),
          ),
        )
        .limit(1);
      if (!row.isDemo && published)
        throw new ConflictException(
          problem(
            'DRILL_LEVEL_ALREADY_PUBLISHED',
            'Archive paket aktif sebelum menerbitkan revisi level.',
          ),
        );
      const items = await tx
        .select()
        .from(packageItems)
        .where(eq(packageItems.packageId, id))
        .orderBy(asc(packageItems.displayOrder));
      await this.validate(
        tx,
        row.levelId!,
        row.scoringPolicyVersionId!,
        items.map((i) => i.questionVersionId),
        true,
      );
      await tx
        .update(assessmentPackages)
        .set({ status: 'PUBLISHED', releaseAt: new Date() })
        .where(eq(assessmentPackages.id, id));
      return { id };
    });
  }
  archive(actor: string, id: string) {
    return adminMutation(actor, 'drill_package_archived', 'assessment_package', async (tx) => {
      await this.lock(tx, id);
      await tx
        .update(assessmentPackages)
        .set({ status: 'ARCHIVED' })
        .where(eq(assessmentPackages.id, id));
      return { id };
    });
  }
}
