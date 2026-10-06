import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  auditLogs,
  chapters,
  subchapters,
  competencies,
  levels,
  questions,
  questionVariants,
  questionVersions,
  contentMediaUploads,
  contentImports,
  contentImportIdentities,
  contentImportVersions,
  assessmentPackages,
  packageItems,
  getDatabase,
  type ImportQuestion,
} from '@tka/database';
import type { AdminTransaction } from '../audit/admin-mutation';
import type { ImportBodyDto, ImportItemDto, ImportReportDto } from './content-preview.dto';
import { digest, snapshot, structuralErrors } from './content-import.validation';
import {
  packageContext,
  placementErrors,
  assertDraftRevision,
  packageCounts,
} from './content-package.rules';
import type { ContentPackageDto } from './content-packages.dto';

const validationDetails: Record<string, string> = {
  INVALID_SCHEMA: 'Struktur, format teks, pilihan, kunci atau metadata tidak sesuai kontrak soal.',
  CONTENT_EMPTY: 'Teks soal, pilihan dan pembahasan wajib diisi.',
  DUPLICATE_EXTERNAL_ID: 'Identitas soal berulang dalam satu file.',
  DUPLICATE_OPTION: 'ID pilihan/pernyataan harus unik.',
  DUPLICATE_CATEGORY: 'ID kategori harus unik.',
  CATEGORIES_REQUIRED: 'Soal Kategori memerlukan sedikitnya dua kategori.',
  UNEXPECTED_CATEGORIES: 'Kategori hanya berlaku untuk format Kategori.',
  INVALID_KEY: 'Kunci harus mengacu pada ID pilihan/kategori yang tersedia.',
  INCOMPLETE_KEY: 'Setiap pernyataan memerlukan kunci kategori.',
  MASTER_SCOPE_NOT_FOUND:
    'Hubungan bab, subbab, indikator dan level tidak ada atau diarsipkan pada master.',
  UNSUPPORTED_LEVEL_CODE: 'Gunakan sourceLevelNumber dari master, bukan levelCode bebas.',
  DRILL_SCOPE_MISMATCH: 'Bab, subbab dan level soal harus sama dengan paket Drill.',
  PRETEST_CHAPTER_MISMATCH: 'Bab soal harus sama dengan paket Pretest.',
  QUESTION_UNCLASSIFIED:
    'Klasifikasikan tujuan keluarga soal lama sebelum menggunakannya dalam paket.',
  QUESTION_USAGE_MISMATCH:
    'Tujuan keluarga soal berbeda dari paket; buat salinan beridentitas baru.',
  PACKAGE_TARGET_REQUIRED:
    'Soal terklasifikasi harus diimpor melalui paket dengan tujuan yang sesuai.',
  SOURCE_QUESTION_INVALID: 'ID soal asal harus berupa UUID keluarga soal yang ada.',
  SOURCE_QUESTION_IMMUTABLE: 'Identitas asal salinan tidak dapat diganti melalui revisi.',
  NEEDS_REVIEW:
    'Perubahan format, indikator atau level memerlukan identitas baru agar histori tetap utuh.',
  MEDIA_RECEIPT_INVALID: 'Referensi gambar tidak cocok dengan receipt R2 terverifikasi.',
  MEDIA_NOT_READY: 'Gambar terbaca tetapi belum diunggah dan diverifikasi pada R2.',
  DUPLICATE_ASSET: 'ID gambar harus unik dalam soal.',
  INVALID_ASSET_MARKER: 'Penanda gambar tidak cocok dengan posisi soal/pilihan/pembahasan.',
  INVALID_ASSET_REFERENCE: 'Referensi gambar tidak cocok dengan manifest dan posisi teks.',
  INVALID_ASSET_MANIFEST: 'Manifest gambar harus cocok dengan ID soal dan penanda pada teks.',
  PACKAGE_IMMUTABLE: 'Paket terbit/arsip tidak dapat ditimpa; buat versi paket baru.',
  PACKAGE_REVISION_CONFLICT: 'Paket diubah admin lain; muat ulang dan validasi preview kembali.',
  PACKAGE_SOURCE_MISMATCH: 'Namespace impor harus sama dengan sumber paket.',
  QUESTION_ORDER_REQUIRED: 'Setiap soal memerlukan nomor positif dalam batas integer PostgreSQL.',
  QUESTION_ORDER_DUPLICATE: 'Nomor soal harus unik lintas seluruh sheet.',
};

export function operationKey(key: string | undefined) {
  if (!key || !/^[A-Za-z0-9_-]{1,128}$/.test(key))
    throw new HttpException(
      {
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        detail: 'A 1–128 character Idempotency-Key is required.',
      },
      400,
    );
  return key;
}
export async function operationLock(tx: AdminTransaction, scope: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${scope},0))`);
}
@Injectable()
export class ContentImportService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}
  enabled() {
    if (this.config.get('CONTENT_IMPORT_PREVIEW_ENABLED') !== 'true')
      throw new ServiceUnavailableException({
        code: 'CONTENT_IMPORT_PREVIEW_DISABLED',
        detail: 'Content import and preview are disabled.',
      });
  }

  private async inspect(tx: AdminTransaction, body: ImportBodyDto, target?: ContentPackageDto) {
    const records = [];
    const duplicate = new Set<string>();
    for (const input of body.questions) {
      const errors = structuralErrors(input);
      const q = input as ImportQuestion;
      const externalId = typeof q.externalId === 'string' ? q.externalId : '';
      if (duplicate.has(externalId)) errors.push('DUPLICATE_EXTERNAL_ID');
      duplicate.add(externalId);
      if (errors.length) {
        records.push({
          q,
          errors,
          ready: false,
          level: null,
          identity: null,
          latest: null,
          hash: '',
        });
        continue;
      }
      const [level] = await tx
        .select({ id: levels.id, competencyId: competencies.id })
        .from(chapters)
        .innerJoin(subchapters, eq(subchapters.chapterId, chapters.id))
        .innerJoin(competencies, eq(competencies.subchapterId, subchapters.id))
        .innerJoin(levels, eq(levels.subchapterId, subchapters.id))
        .where(
          and(
            eq(chapters.code, q.chapterCode),
            eq(subchapters.code, q.subchapterCode),
            eq(competencies.code, q.competencyCode),
            eq(levels.levelNumber, q.metadata.sourceLevelNumber),
            sql`${chapters.status}<>'ARCHIVED' and ${subchapters.status}<>'ARCHIVED' and ${competencies.status}<>'ARCHIVED' and ${levels.status}<>'ARCHIVED'`,
          ),
        )
        .for('share');
      if (!level) errors.push('MASTER_SCOPE_NOT_FOUND');
      if (q.levelCode != null) errors.push('UNSUPPORTED_LEVEL_CODE');
      if (target) errors.push(...placementErrors(q, target));
      if (q.metadata.sourceQuestionId !== undefined) {
        if (
          typeof q.metadata.sourceQuestionId !== 'string' ||
          !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(q.metadata.sourceQuestionId)
        )
          errors.push('SOURCE_QUESTION_INVALID');
        else if (
          !(
            await tx
              .select({ id: questions.id })
              .from(questions)
              .where(eq(questions.id, q.metadata.sourceQuestionId))
          )[0]
        )
          errors.push('SOURCE_QUESTION_INVALID');
      }
      let ready = true;
      for (const asset of q.metadata.assetManifest ?? []) {
        if (!asset.objectKey) {
          ready = false;
          continue;
        }
        const [receipt] = await tx
          .select({ id: contentMediaUploads.id })
          .from(contentMediaUploads)
          .where(
            and(
              eq(contentMediaUploads.status, 'VERIFIED'),
              eq(contentMediaUploads.externalId, q.externalId),
              eq(contentMediaUploads.assetId, asset.assetId),
              eq(contentMediaUploads.bucket, asset.bucket),
              eq(contentMediaUploads.objectKey, asset.objectKey),
              eq(contentMediaUploads.sha256, asset.sha256),
              eq(contentMediaUploads.contentType, asset.contentType),
              eq(contentMediaUploads.byteLength, asset.byteLength),
            ),
          )
          .limit(1);
        if (!receipt) errors.push('MEDIA_RECEIPT_INVALID');
      }
      const [identity] = await tx
        .select()
        .from(contentImportIdentities)
        .where(
          and(
            eq(contentImportIdentities.sourceNamespace, body.sourceNamespace),
            eq(contentImportIdentities.externalId, q.externalId),
          ),
        );
      const [latest] = identity
        ? await tx
            .select({ version: questionVersions, hash: contentImportVersions.contentHash })
            .from(contentImportVersions)
            .innerJoin(
              questionVersions,
              eq(questionVersions.id, contentImportVersions.questionVersionId),
            )
            .where(eq(contentImportVersions.identityId, identity.id))
            .orderBy(desc(questionVersions.versionNumber))
            .limit(1)
        : [];
      if (identity) {
        const [family] = await tx
          .select()
          .from(questions)
          .where(eq(questions.id, identity.questionId))
          .for('share');
        if (target && family?.usageType === null) errors.push('QUESTION_UNCLASSIFIED');
        else if (target && family?.usageType !== target.assessmentType)
          errors.push('QUESTION_USAGE_MISMATCH');
        else if (!target && family?.usageType) errors.push('PACKAGE_TARGET_REQUIRED');
        if (
          q.metadata.sourceQuestionId &&
          (q.metadata.sourceQuestionId === identity.questionId ||
            q.metadata.sourceQuestionId !== family?.sourceQuestionId)
        )
          errors.push('SOURCE_QUESTION_IMMUTABLE');
        if (
          family?.primaryCompetencyId !== level?.competencyId ||
          family?.curriculumLevelNumber !== q.metadata.sourceLevelNumber ||
          latest?.version.questionType !== q.type
        )
          errors.push('NEEDS_REVIEW');
      }
      const hash = digest({
        snapshot: snapshot(q),
        chapterCode: q.chapterCode,
        subchapterCode: q.subchapterCode,
        competencyCode: q.competencyCode,
        sourceLevelNumber: q.metadata.sourceLevelNumber,
        difficulty: q.difficulty ?? null,
      });
      records.push({
        q,
        errors,
        ready,
        level: level ?? null,
        identity: identity ?? null,
        latest: latest ?? null,
        hash,
      });
    }
    return records;
  }
  private report(
    body: ImportBodyDto,
    records: Awaited<ReturnType<ContentImportService['inspect']>>,
  ): ImportReportDto {
    return {
      id: null,
      sourceNamespace: body.sourceNamespace,
      canImportDraft: records.every((r) => !r.errors.length),
      items: records.map((r) => ({
        externalId: typeof r.q.externalId === 'string' ? r.q.externalId : '',
        canImportDraft: !r.errors.length,
        canPreview: !r.errors.length && r.ready,
        blockers: [...new Set([...r.errors, ...(!r.ready ? ['MEDIA_NOT_READY'] : [])])],
        issues: [...new Set([...r.errors, ...(!r.ready ? ['MEDIA_NOT_READY'] : [])])].map(
          (code) => ({
            code,
            detail: validationDetails[code] ?? code,
            sheet: typeof r.q.metadata?.sourceSheet === 'string' ? r.q.metadata.sourceSheet : null,
            row:
              typeof r.q.metadata?.sourceRowNumber === 'number'
                ? r.q.metadata.sourceRowNumber
                : null,
          }),
        ),
        outcome: r.errors.length ? 'INVALID' : 'VALIDATED',
        questionVersionId: null,
      })),
    };
  }
  async validateWithin(tx: AdminTransaction, body: ImportBodyDto, lock = false) {
    const target = body.target ? await packageContext(tx, body.target.packageId, lock) : undefined;
    const records = await this.inspect(tx, body, target);
    const report = this.report(body, records);
    if (target) {
      const blockers: string[] = [];
      if (target.status !== 'DRAFT') blockers.push('PACKAGE_IMMUTABLE');
      if (target.contentRevision !== body.target!.expectedRevision)
        blockers.push('PACKAGE_REVISION_CONFLICT');
      if (!target.source || target.source.sourceNamespace !== body.sourceNamespace)
        blockers.push('PACKAGE_SOURCE_MISMATCH');
      const orders = records.map((r) => r.q.metadata?.sourceOrder);
      if (
        orders.some(
          (n) => !Number.isSafeInteger(n) || (n as number) < 1 || (n as number) > 2147483647,
        )
      )
        blockers.push('QUESTION_ORDER_REQUIRED');
      if (new Set(orders).size !== orders.length) blockers.push('QUESTION_ORDER_DUPLICATE');
      const old = await tx
        .select({ id: packageItems.questionVersionId, questionId: questionVariants.questionId })
        .from(packageItems)
        .innerJoin(questionVersions, eq(questionVersions.id, packageItems.questionVersionId))
        .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
        .where(eq(packageItems.packageId, target.id));
      for (const [i, r] of records.entries()) {
        const previous = old.find((item) => item.questionId === r.identity?.questionId);
        report.items[i]!.change = r.errors.length
          ? 'INVALID'
          : previous
            ? previous.id === r.latest?.version.id && r.latest.hash === r.hash
              ? 'KEEP'
              : 'REVISE'
            : r.identity
              ? 'REUSE'
              : 'ADD';
      }
      report.canImportDraft = report.canImportDraft && !blockers.length;
      report.package = {
        packageId: target.id,
        contentRevision: target.contentRevision,
        canSaveDraft: report.canImportDraft && records.every((r) => r.ready),
        canPublish: false,
        expectedCount: packageCounts[target.assessmentType],
        actualCount: records.length,
        blockers,
        removedVersionIds: old
          .filter((item) => !records.some((r) => r.identity?.questionId === item.questionId))
          .map((item) => item.id),
        checks: [
          {
            code: 'STRUCTURE',
            passed: records.every((r) => !r.errors.length),
            detail: 'Struktur, kunci, master kurikulum dan tujuan soal.',
          },
          {
            code: 'MEDIA',
            passed: records.every((r) => r.ready && !r.errors.includes('MEDIA_RECEIPT_INVALID')),
            detail: 'Setiap gambar memiliki receipt R2 terverifikasi.',
          },
          {
            code: 'PACKAGE_CONTEXT',
            passed: !blockers.length,
            detail:
              blockers.map((code) => validationDetails[code] ?? code).join(' ') ||
              'Identitas, namespace dan revisi paket sesuai.',
          },
          {
            code: 'COUNT',
            passed: records.length === packageCounts[target.assessmentType],
            detail: `${records.length}/${packageCounts[target.assessmentType]} soal. DRAFT boleh belum lengkap.`,
          },
          {
            code: 'PUBLICATION',
            passed: false,
            detail:
              'Impor tetap DRAFT. Review dan checklist publikasi diperiksa setelah tersimpan.',
          },
        ],
      };
    }
    return { records, report, target };
  }
  async validate(body: ImportBodyDto): Promise<ImportReportDto> {
    this.enabled();
    this.size(body);
    return getDatabase().db.transaction(async (tx) => (await this.validateWithin(tx, body)).report);
  }
  private size(body: ImportBodyDto) {
    if (Buffer.byteLength(JSON.stringify(body)) > 2 * 1024 * 1024)
      throw new HttpException(
        { code: 'IMPORT_TOO_LARGE', detail: 'Import body exceeds 2 MiB.' },
        413,
      );
  }
  async import(
    actor: string,
    key: string | undefined,
    body: ImportBodyDto,
  ): Promise<ImportReportDto> {
    this.enabled();
    this.size(body);
    const op = operationKey(key);
    const fingerprint = digest(body);
    return getDatabase().db.transaction(async (tx) => {
      await operationLock(tx, `content-import:${actor}:${op}`);
      const [existing] = await tx
        .select()
        .from(contentImports)
        .where(and(eq(contentImports.actorUserId, actor), eq(contentImports.idempotencyKey, op)));
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' });
        return existing.report as ImportReportDto;
      }
      // Lock the package before identities; all package writers take this row lock.
      const target = body.target
        ? await packageContext(tx, body.target.packageId, true)
        : undefined;
      if (target) assertDraftRevision(target, body.target!.expectedRevision);
      for (const id of [
        ...new Set(
          body.questions.map((q) =>
            typeof (q as ImportQuestion).externalId === 'string'
              ? (q as ImportQuestion).externalId
              : '',
          ),
        ),
      ].sort())
        await operationLock(tx, `content-identity:${body.sourceNamespace}:${id}`);
      const { records, report } = await this.validateWithin(tx, body);
      if (target && records.some((r) => !r.ready))
        throw new HttpException(
          { code: 'MEDIA_NOT_READY', detail: 'Verifikasi seluruh gambar sebelum menyimpan paket.' },
          422,
        );
      if (!report.canImportDraft)
        throw new HttpException(
          { code: 'IMPORT_VALIDATION_FAILED', detail: 'Import rejected atomically.', report },
          422,
        );
      const id = randomUUID();
      report.id = id;
      await tx.insert(contentImports).values({
        id,
        actorUserId: actor,
        idempotencyKey: op,
        fingerprint,
        sourceNamespace: body.sourceNamespace,
        report: {},
      });
      const items: ImportItemDto[] = [];
      for (const [i, r] of records.entries()) {
        if (r.latest?.hash === r.hash) {
          items.push({
            ...report.items[i]!,
            outcome: 'SKIPPED_UNCHANGED',
            questionVersionId: r.latest.version.id,
          });
          continue;
        }
        let identity = r.identity;
        let variantId = r.latest?.version.variantId;
        if (!identity) {
          const [family] = await tx
            .insert(questions)
            .values({
              primaryCompetencyId: r.level!.competencyId,
              curriculumLevelNumber: r.q.metadata.sourceLevelNumber,
              sourceRef: r.q.externalId,
              usageType: target?.assessmentType ?? null,
              sourceQuestionId: r.q.metadata.sourceQuestionId ?? null,
              status: 'DRAFT',
            })
            .returning();
          const [variant] = await tx
            .insert(questionVariants)
            .values({
              questionId: family!.id,
              variantCode: 'ORIGINAL',
              kind: 'ORIGINAL',
              origin: 'JSON_IMPORT_V2',
            })
            .returning();
          variantId = variant!.id;
          const [createdIdentity] = await tx
            .insert(contentImportIdentities)
            .values({
              sourceNamespace: body.sourceNamespace,
              externalId: r.q.externalId,
              questionId: family!.id,
            })
            .returning();
          identity = createdIdentity!;
        }
        const data = snapshot(r.q);
        const [version] = await tx
          .insert(questionVersions)
          .values({
            variantId: variantId!,
            versionNumber: (r.latest?.version.versionNumber ?? 0) + 1,
            questionType: r.q.type,
            stem: data.stem,
            optionsOrStatements: { options: data.options, categories: data.categories },
            answerKey: data.answerKey,
            explanation: data.explanation,
            media: data.assets,
            difficulty: r.q.difficulty ?? null,
            levelId: r.level!.id,
            contentStatus: 'DRAFT',
            validationState: 'DRAFT',
            revisedFromQuestionVersionId: r.latest?.version!.id,
          })
          .returning();
        await tx.insert(contentImportVersions).values({
          questionVersionId: version!.id,
          identityId: identity!.id,
          importId: id,
          contentHash: r.hash,
          provenance: {
            ...r.q.metadata,
            ...(target
              ? {
                  packageId: target.id,
                  usageType: target.assessmentType,
                  packageSource: target.source,
                  fileName: body.target?.fileName ?? null,
                }
              : {}),
          },
        });
        items.push({
          ...report.items[i]!,
          outcome: r.latest ? 'CREATED_REVISION' : 'CREATED',
          questionVersionId: version!.id,
        });
      }
      report.items = items;
      if (target) {
        const ordered = items
          .map((item, index) => ({ item, order: records[index]!.q.metadata.sourceOrder! }))
          .sort((a, b) => a.order - b.order);
        await tx.delete(packageItems).where(eq(packageItems.packageId, target.id));
        await tx
          .insert(packageItems)
          .values(
            ordered.map(({ item }, index) => ({
              packageId: target.id,
              questionVersionId: item.questionVersionId!,
              displayOrder: index + 1,
              maxPoints: '1',
            })),
          );
        await tx
          .update(assessmentPackages)
          .set({ contentRevision: target.contentRevision + 1 })
          .where(eq(assessmentPackages.id, target.id));
        report.package!.contentRevision = target.contentRevision + 1;
      }
      // The row is invisible until this transaction commits with its complete report.
      await tx.update(contentImports).set({ report }).where(eq(contentImports.id, id));
      await tx.insert(auditLogs).values({
        actorUserId: actor,
        action: 'CONTENT_IMPORTED',
        entityType: 'content_import',
        entityId: id,
        metadata: {
          count: items.length,
          packageId: target?.id ?? null,
          usageType: target?.assessmentType ?? null,
          fileName: body.target?.fileName ?? null,
        },
      });
      return report;
    });
  }
  async get(actor: string, id: string): Promise<ImportReportDto> {
    this.enabled();
    const [row] = await getDatabase()
      .db.select()
      .from(contentImports)
      .where(and(eq(contentImports.id, id), eq(contentImports.actorUserId, actor)));
    if (!row) throw new NotFoundException({ code: 'IMPORT_NOT_FOUND' });
    return row.report as ImportReportDto;
  }
}
