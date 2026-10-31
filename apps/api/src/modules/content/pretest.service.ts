import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  assessmentBlueprintVersions,
  assessmentPackages,
  chapters,
  getDatabase,
  packageItems,
  questionVersions,
} from '@tka/database';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { adminMutation, type AdminTransaction } from '../audit/admin-mutation';
import { AssessmentReadinessService } from './assessment-readiness.service';
import { editorialPackageDigest } from './editorial-package-digest';
import type {
  PretestDraftDto,
  PretestEditDto,
  PretestDto,
  PretestBlueprintsDto,
} from './pretest.dto';
@Injectable()
export class PretestService {
  constructor(
    @Inject(AssessmentReadinessService) private readonly readiness: AssessmentReadinessService,
  ) {}
  async blueprints(): Promise<PretestBlueprintsDto> {
    const rows = await getDatabase()
      .db.select()
      .from(assessmentBlueprintVersions)
      .where(
        and(
          eq(assessmentBlueprintVersions.status, 'SEALED'),
          isNotNull(assessmentBlueprintVersions.approvedAt),
        ),
      )
      .orderBy(desc(assessmentBlueprintVersions.version));
    return {
      items: rows
        .filter((r) => this.supportedBlueprint(r))
        .map((r) => ({
          id: r.id,
          code: r.code,
          version: r.version,
          approvalReference: r.approvalReference!,
          approvedAt: r.approvedAt!.toISOString(),
        })),
    };
  }
  private supportedBlueprint(r: typeof assessmentBlueprintVersions.$inferSelect) {
    const d = r.definition as {
      assessmentType?: unknown;
      chapterId?: unknown;
      questionCount?: unknown;
    };
    return (
      r.status === 'SEALED' &&
      !!r.approvedAt &&
      !!r.approvedByUserId &&
      !!r.approvalReference?.trim() &&
      d.assessmentType === 'PRETEST' &&
      d.questionCount === 20
    );
  }
  async list(limit = 20, offset = 0) {
    const rows = await getDatabase()
      .db.select({ id: assessmentPackages.id })
      .from(assessmentPackages)
      .where(eq(assessmentPackages.assessmentType, 'PRETEST'))
      .orderBy(desc(assessmentPackages.packageVersion), asc(assessmentPackages.id))
      .limit(limit)
      .offset(offset);
    return { items: await Promise.all(rows.map((r) => this.get(r.id))) };
  }
  async get(id: string) {
    return getDatabase().db.transaction((tx) => this.detail(tx, id));
  }
  private async detail(tx: AdminTransaction, id: string): Promise<PretestDto> {
    const [p] = await tx
      .select()
      .from(assessmentPackages)
      .where(and(eq(assessmentPackages.id, id), eq(assessmentPackages.assessmentType, 'PRETEST')));
    if (!p) throw new NotFoundException({ code: 'PRETEST_NOT_FOUND' });
    const items = await tx
      .select()
      .from(packageItems)
      .where(eq(packageItems.packageId, id))
      .orderBy(asc(packageItems.displayOrder));
    const ids = items.map((i) => i.questionVersionId),
      reviewBlockers: string[] = [];
    try {
      await this.readiness.items(tx, ids, 20, null, { chapterId: p.chapterId! });
    } catch (e) {
      reviewBlockers.push(
        e instanceof ConflictException
          ? ((e.getResponse() as { code?: string }).code ?? 'PRETEST_CONTENT_NOT_READY')
          : 'PRETEST_CONTENT_NOT_READY',
      );
    }
    const [blueprint] = p.blueprintVersionId
      ? await tx
          .select()
          .from(assessmentBlueprintVersions)
          .where(eq(assessmentBlueprintVersions.id, p.blueprintVersionId))
      : [];
    const definition = blueprint?.definition as { chapterId?: string } | undefined;
    const publicationBlockers = [...reviewBlockers, 'PRETEST_STUDENT_CONSUMER_REQUIRED'];
    if (!p.manifestDigest) publicationBlockers.push('PRETEST_REVIEW_REQUIRED');
    if (!blueprint || !this.supportedBlueprint(blueprint) || definition?.chapterId !== p.chapterId)
      publicationBlockers.push('APPROVED_PRETEST_BLUEPRINT_REQUIRED');
    if (p.status === 'ARCHIVED') publicationBlockers.push('PRETEST_ARCHIVED');
    return {
      id: p.id,
      familyCode: p.familyCode,
      packageVersion: p.packageVersion,
      name: p.name,
      chapterId: p.chapterId!,
      blueprintVersionId: p.blueprintVersionId,
      state: p.status === 'ARCHIVED' ? 'ARCHIVED' : p.manifestDigest ? 'REVIEWED' : 'DRAFT',
      manifestDigest: p.manifestDigest,
      questionVersionIds: ids,
      reviewBlockers,
      publicationBlockers,
    };
  }
  private async writeItems(tx: AdminTransaction, id: string, ids: string[]) {
    if (!ids.length) return;
    const rows = await tx
      .select({ id: questionVersions.id })
      .from(questionVersions)
      .where(inArray(questionVersions.id, ids));
    if (rows.length !== ids.length)
      throw new ConflictException({ code: 'PRETEST_CONTENT_MISSING' });
    await tx.insert(packageItems).values(
      ids.map((v, i) => ({
        packageId: id,
        questionVersionId: v,
        displayOrder: i + 1,
        maxPoints: '1',
      })),
    );
  }
  private async blueprint(tx: AdminTransaction, id: string | null | undefined, chapterId: string) {
    if (!id) return;
    const [b] = await tx
      .select()
      .from(assessmentBlueprintVersions)
      .where(eq(assessmentBlueprintVersions.id, id))
      .for('share');
    if (
      !b ||
      !this.supportedBlueprint(b) ||
      (b.definition as { chapterId?: string }).chapterId !== chapterId
    )
      throw new ConflictException({ code: 'APPROVED_PRETEST_BLUEPRINT_REQUIRED' });
  }
  create(actor: string, body: PretestDraftDto) {
    return adminMutation(actor, 'pretest_draft_created', 'assessment_package', async (tx) => {
      const [chapter] = await tx
        .select()
        .from(chapters)
        .where(eq(chapters.id, body.chapterId))
        .for('share');
      if (!chapter) throw new NotFoundException({ code: 'CHAPTER_NOT_FOUND' });
      await this.blueprint(tx, body.blueprintVersionId, body.chapterId);
      const [p] = await tx
        .insert(assessmentPackages)
        .values({
          familyCode: body.familyCode,
          packageVersion: body.packageVersion,
          name: body.name,
          chapterId: body.chapterId,
          blueprintVersionId: body.blueprintVersionId ?? null,
          assessmentType: 'PRETEST',
        })
        .returning();
      await this.writeItems(tx, p!.id, body.questionVersionIds);
      return { id: p!.id };
    });
  }
  update(actor: string, id: string, body: PretestEditDto) {
    return adminMutation(actor, 'pretest_draft_updated', 'assessment_package', async (tx) => {
      const [p] = await tx
        .select()
        .from(assessmentPackages)
        .where(and(eq(assessmentPackages.id, id), eq(assessmentPackages.assessmentType, 'PRETEST')))
        .for('update');
      if (!p) throw new NotFoundException({ code: 'PRETEST_NOT_FOUND' });
      if (p.status !== 'DRAFT' || p.manifestDigest)
        throw new ConflictException({ code: 'PRETEST_VERSION_IMMUTABLE' });
      await this.blueprint(tx, body.blueprintVersionId, p.chapterId!);
      await tx
        .update(assessmentPackages)
        .set({ name: body.name, blueprintVersionId: body.blueprintVersionId ?? null })
        .where(eq(assessmentPackages.id, id));
      await tx.delete(packageItems).where(eq(packageItems.packageId, id));
      await this.writeItems(tx, id, body.questionVersionIds);
      return { id };
    });
  }
  revise(actor: string, id: string, body: PretestEditDto) {
    return adminMutation(
      actor,
      'pretest_version_created',
      'assessment_package',
      async (tx) => {
        const [source] = await tx
          .select()
          .from(assessmentPackages)
          .where(
            and(eq(assessmentPackages.id, id), eq(assessmentPackages.assessmentType, 'PRETEST')),
          )
          .for('share');
        if (!source || !source.manifestDigest)
          throw new ConflictException({ code: 'PRETEST_REVIEWED_SOURCE_REQUIRED' });
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext('admin:pretest-version'),hashtext(${source.familyCode}))`,
        );
        await this.blueprint(tx, body.blueprintVersionId, source.chapterId!);
        const [existing] = await tx
          .select()
          .from(assessmentPackages)
          .where(
            and(
              eq(assessmentPackages.familyCode, source.familyCode),
              eq(assessmentPackages.packageVersion, source.packageVersion + 1),
            ),
          );
        if (existing) {
          const previous = await tx
            .select()
            .from(packageItems)
            .where(eq(packageItems.packageId, existing.id))
            .orderBy(asc(packageItems.displayOrder));
          if (
            existing.name !== body.name ||
            existing.blueprintVersionId !== (body.blueprintVersionId ?? null) ||
            JSON.stringify(previous.map((i) => i.questionVersionId)) !==
              JSON.stringify(body.questionVersionIds)
          )
            throw new ConflictException({ code: 'PRETEST_REVISION_CONFLICT' });
          return { id: existing.id };
        }
        const [p] = await tx
          .insert(assessmentPackages)
          .values({
            assessmentType: 'PRETEST',
            familyCode: source.familyCode,
            packageVersion: source.packageVersion + 1,
            name: body.name,
            chapterId: source.chapterId,
            blueprintVersionId: body.blueprintVersionId ?? null,
          })
          .returning();
        await this.writeItems(tx, p!.id, body.questionVersionIds);
        return { id: p!.id };
      },
      { sourcePackageId: id },
    );
  }
  review(actor: string, id: string, reason: string) {
    return adminMutation(
      actor,
      'pretest_reviewed',
      'assessment_package',
      async (tx) => {
        const [p] = await tx
          .select()
          .from(assessmentPackages)
          .where(
            and(eq(assessmentPackages.id, id), eq(assessmentPackages.assessmentType, 'PRETEST')),
          )
          .for('update');
        if (!p) throw new NotFoundException({ code: 'PRETEST_NOT_FOUND' });
        if (p.status !== 'DRAFT')
          throw new ConflictException({ code: 'PRETEST_VERSION_IMMUTABLE' });
        if (p.manifestDigest) return { id };
        const detail = await this.detail(tx, id);
        if (detail.reviewBlockers.length)
          throw new ConflictException({
            code: 'PRETEST_NOT_READY',
            blockers: detail.reviewBlockers,
          });
        await tx
          .update(assessmentPackages)
          .set({ manifestDigest: await editorialPackageDigest(tx, id) })
          .where(eq(assessmentPackages.id, id));
        return { id };
      },
      { reason },
    );
  }
  archive(actor: string, id: string) {
    return adminMutation(actor, 'pretest_archived', 'assessment_package', async (tx) => {
      const [p] = await tx
        .select()
        .from(assessmentPackages)
        .where(and(eq(assessmentPackages.id, id), eq(assessmentPackages.assessmentType, 'PRETEST')))
        .for('update');
      if (!p) throw new NotFoundException({ code: 'PRETEST_NOT_FOUND' });
      await tx
        .update(assessmentPackages)
        .set({ status: 'ARCHIVED' })
        .where(eq(assessmentPackages.id, id));
      return { id };
    });
  }
  async publish(id: string): Promise<never> {
    const detail = await this.get(id);
    throw new ConflictException({
      code: 'PRETEST_PUBLICATION_BLOCKED',
      detail: 'Consumer Student belum tersedia; blueprint final harus disahkan sebelum aktivasi.',
      blockers: detail.publicationBlockers,
    });
  }
}
