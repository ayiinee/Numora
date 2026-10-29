import { ConflictException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  allowSyntheticContent,
  assessmentBlueprintVersions,
  assessmentPackages,
  auditLogs,
  packageItems,
} from '@tka/database';
import type { AdminTransaction } from '../audit/admin-mutation';
import { editorialPackageDigest } from './editorial-package-digest';

// Editorial manifests are immutable, but do not impersonate a scientific frozen package/quality result.
// Call only after content review, approved policy validation and final item pins, in the publish transaction.
export async function approveEditorialPackage(
  tx: AdminTransaction,
  actor: string,
  row: typeof assessmentPackages.$inferSelect,
  reference?: string,
) {
  const manifestDigest = await editorialPackageDigest(tx, row.id);
  if (row.isDemo) {
    if (!allowSyntheticContent())
      throw new ConflictException({ code: 'SYNTHETIC_CONTENT_FORBIDDEN' });
    return { manifestDigest };
  }
  const [approved] = row.blueprintVersionId
    ? await tx
        .select()
        .from(assessmentBlueprintVersions)
        .where(
          and(
            eq(assessmentBlueprintVersions.id, row.blueprintVersionId),
            eq(assessmentBlueprintVersions.status, 'SEALED'),
          ),
        )
    : [];
  if (
    approved &&
    row.curriculumApproval?.manifestDigest === manifestDigest &&
    row.curriculumApproval.reference.trim() &&
    row.curriculumApproval.approvedAt
  ) {
    return { manifestDigest };
  }
  if (!reference?.trim())
    throw new ConflictException({
      code: 'CURRICULUM_APPROVAL_REQUIRED',
      detail: 'Catat referensi persetujuan Curriculum untuk susunan paket yang ditinjau.',
    });
  const items = await tx.select().from(packageItems).where(eq(packageItems.packageId, row.id));
  const [blueprint] = await tx
    .insert(assessmentBlueprintVersions)
    .values({
      code: `EDITORIAL-${row.id}-${manifestDigest}`,
      version: 1,
      status: 'SEALED',
      digest: manifestDigest,
      definition: {
        assessmentType: row.assessmentType,
        levelId: row.levelId,
        chapterId: row.chapterId,
        questionVersionIds: items
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((i) => i.questionVersionId),
        reference: reference.trim(),
      },
    })
    .onConflictDoNothing()
    .returning();
  const pin =
    blueprint ??
    (
      await tx
        .select()
        .from(assessmentBlueprintVersions)
        .where(
          and(
            eq(assessmentBlueprintVersions.code, `EDITORIAL-${row.id}-${manifestDigest}`),
            eq(assessmentBlueprintVersions.version, 1),
          ),
        )
    )[0];
  if (!pin || pin.status !== 'SEALED' || pin.digest !== manifestDigest)
    throw new ConflictException({ code: 'CURRICULUM_APPROVAL_CONFLICT' });
  const curriculumApproval = {
    source: 'ADMIN_EDITORIAL_REVIEW_V1',
    reference: reference.trim(),
    approvedAt: new Date().toISOString(),
    manifestDigest,
  };
  await tx.insert(auditLogs).values({
    actorUserId: actor,
    action: 'content_package_curriculum_approved',
    entityType: 'assessment_package',
    entityId: row.id,
    metadata: { ...curriculumApproval, blueprintVersionId: pin.id },
  });
  return { manifestDigest, blueprintVersionId: pin.id, curriculumApproval };
}
