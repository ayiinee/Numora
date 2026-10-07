import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  assessmentPackages,
  auditLogs,
  contentUploadSessions,
  contentImports,
  getDatabase,
  levels,
  chapters,
  subchapters,
  users,
  type ImportQuestion,
  type IntakeQuestion,
} from '@tka/database';
import { ContentImportService, operationKey, operationLock } from './content-import.service';
import { ContentService } from './content.service';
import { ContentPackagesService } from './content-packages.service';
import { R2MediaStorage } from './r2-media.storage';
import { parseExcel } from './excel-import.service';
import { digest, intakeShapeValid } from './content-import.validation';
import type { ExcelIntakeDto } from './content-intake.dto';
import { resolveIntake, finalQuestions } from './content-intake.mapping';
import type { ImportReportDto } from './content-preview.dto';
import type {
  SaveUploadDraftDto,
  UpdateUploadPreviewDto,
  UploadDetailDto,
  UploadListDto,
  UploadQueryDto,
  UploadSummaryDto,
} from './content-uploads.dto';
import type { AdminTransaction } from '../audit/admin-mutation';

const sessionNamespace = (id: string) => `UPLOAD_${id.replaceAll('-', '')}`;
@Injectable()
export class ContentUploadsService {
  constructor(
    @Inject(ContentImportService) private readonly importer: ContentImportService,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(ContentPackagesService) private readonly packages: ContentPackagesService,
    @Inject(R2MediaStorage) private readonly storage: R2MediaStorage,
  ) {}
  async receive(
    actor: string,
    key: string | undefined,
    file: { originalname: string; buffer: Buffer },
  ) {
    this.importer.enabled();
    const op = operationKey(key),
      sha = createHash('sha256').update(file.buffer).digest('hex');
    const name = file.originalname.replace(/[\u0000-\u001f]/g, '').slice(0, 160);
    const { row, existing } = await getDatabase().db.transaction(async (tx) => {
      await operationLock(tx, `content-upload:${actor}:${op}`);
      const [previous] = await tx
        .select()
        .from(contentUploadSessions)
        .where(
          and(
            eq(contentUploadSessions.actorUserId, actor),
            eq(contentUploadSessions.idempotencyKey, op),
          ),
        );
      if (previous) {
        if (previous.fileSha256 !== sha || previous.fileName !== name)
          throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' });
        return { row: previous, existing: true };
      }
      const [created] = await tx
        .insert(contentUploadSessions)
        .values({
          actorUserId: actor,
          idempotencyKey: op,
          fileName: name,
          fileSha256: sha,
          byteLength: file.buffer.length,
        })
        .returning();
      return { row: created!, existing: false };
    });
    if (existing && row.state !== 'RECEIVED') return this.get(row.id);
    try {
      if (!/\.xlsx$/i.test(name) || !file.buffer.length || file.buffer.length > 10 * 1024 * 1024)
        throw new BadRequestException({ detail: 'Gunakan file Excel .xlsx, maksimal 10 MiB.' });
      const parsed = await parseExcel(
        file.buffer,
        sessionNamespace(row.id),
        this.storage.settings().bucket,
        { id: row.id, curriculum: await this.content.curriculum() },
      );
      for (const q of parsed.envelope.questions)
        Object.assign(q.metadata, { sourceFileName: name, sourceFileSha256: sha });
      const resolved = resolveIntake(
        parsed.envelope.questions,
        await this.content.curriculum(),
        null,
      );
      parsed.envelope.questions = resolved.questions as ExcelIntakeDto['envelope']['questions'];
      parsed.mappingIssues = resolved.issues;
      const objectKey = await this.storage.storeWorkbook(row.id, file.buffer);
      await getDatabase()
        .db.update(contentUploadSessions)
        .set({
          objectKey,
          state: 'PREVIEW',
          preview: {
            intakeVersion: 1,
            destination: null,
            validationCounts: {
              content: resolved.issues.filter((i) => i.category === 'CONTENT').length,
              mapping: resolved.issues.filter((i) => i.category !== 'CONTENT').length,
            },
            questions: parsed.envelope.questions,
            selectedIds: parsed.envelope.questions.map((q) => q.externalId),
            issues: parsed.issues,
          },
          updatedAt: new Date(),
        })
        .where(
          and(eq(contentUploadSessions.id, row.id), eq(contentUploadSessions.state, 'RECEIVED')),
        );
      const result = await this.get(row.id, false);
      if (result.excel) result.excel.media = parsed.media;
      return result;
    } catch (error) {
      const problem = error instanceof HttpException ? error.getResponse() : null;
      const message =
        problem &&
        typeof problem === 'object' &&
        'detail' in problem &&
        typeof problem.detail === 'string'
          ? problem.detail
          : 'File tidak dapat diproses. Coba upload kembali.';
      await getDatabase()
        .db.update(contentUploadSessions)
        .set({ state: 'INVALID', error: message, updatedAt: new Date() })
        .where(
          and(eq(contentUploadSessions.id, row.id), eq(contentUploadSessions.state, 'RECEIVED')),
        );
      return this.get(row.id, false);
    }
  }
  async rejected(actor: string, key: string | undefined, name: string, size: number) {
    const op = operationKey(key);
    const [row] = await getDatabase()
      .db.insert(contentUploadSessions)
      .values({
        actorUserId: actor,
        idempotencyKey: op,
        fileName: String(name || 'File Excel').slice(0, 160),
        byteLength: Number.isSafeInteger(size) && size >= 0 && size <= 2147483647 ? size : 0,
        fileSha256: '',
        state: 'INVALID',
        error: 'Batas file Excel adalah 10 MiB.',
      })
      .onConflictDoNothing()
      .returning();
    if (row) return this.get(row.id, false);
    const [previous] = await getDatabase()
      .db.select()
      .from(contentUploadSessions)
      .where(
        and(
          eq(contentUploadSessions.actorUserId, actor),
          eq(contentUploadSessions.idempotencyKey, op),
        ),
      );
    return this.get(previous!.id, false);
  }
  private async locked(tx: AdminTransaction, id: string, revision: number) {
    const [row] = await tx
      .select()
      .from(contentUploadSessions)
      .where(eq(contentUploadSessions.id, id))
      .for('update');
    if (!row) throw new NotFoundException({ code: 'UPLOAD_NOT_FOUND' });
    if (row.revision !== revision)
      throw new ConflictException({
        code: 'UPLOAD_REVISION_CONFLICT',
        detail: 'Unggahan sudah berubah. Muat ulang riwayat.',
      });
    if (row.packageId) {
      const [p] = await tx
        .select()
        .from(assessmentPackages)
        .where(eq(assessmentPackages.id, row.packageId))
        .for('update');
      if (!p || p.status !== 'DRAFT')
        throw new ConflictException({
          code: 'PACKAGE_IMMUTABLE',
          detail: 'Paket terbit tidak dapat diubah. Upload Excel sebagai paket baru.',
        });
      const report = row.report as ImportReportDto | null;
      if (report?.package && report.package.contentRevision !== p.contentRevision)
        throw new ConflictException({
          code: 'PACKAGE_REVISION_CONFLICT',
          detail: 'Paket berubah melalui halaman lain. Muat ulang paket.',
        });
    }
    return row;
  }
  async validate(id: string, body: UpdateUploadPreviewDto) {
    this.importer.enabled();
    await getDatabase().db.transaction(async (tx) => {
      const row = await this.locked(tx, id, body.expectedRevision);
      if (!row.preview)
        throw new ConflictException({
          code: 'UPLOAD_PARSE_INVALID',
          detail: 'Perbaiki masalah pada Excel lalu upload ulang.',
        });
      this.importer.size({ sourceNamespace: sessionNamespace(id), questions: body.questions });
      const restored = await this.restore(row, false);
      const original = new Map(restored.preview!.questions.map((q) => [q.externalId, q]));
      const input = body.questions as IntakeQuestion[];
      if (
        input.length !== original.size ||
        new Set(input.map((q) => q.externalId)).size !== original.size ||
        input.some((q) => !original.has(q.externalId)) ||
        body.selectedIds.some((q) => !original.has(q))
      )
        throw new BadRequestException({
          code: 'UPLOAD_IDENTITIES_INVALID',
          detail: 'Identitas soal tidak sesuai file unggahan.',
        });
      for (const q of input) {
        const before = original.get(q.externalId)!;
        if (
          !intakeShapeValid(q) ||
          (q.metadata?.materialIds &&
            (typeof q.metadata.materialIds !== 'object' ||
              Array.isArray(q.metadata.materialIds) ||
              Object.entries(q.metadata.materialIds).some(
                ([k, v]) =>
                  !['chapterId', 'subchapterId', 'competencyId', 'levelId'].includes(k) ||
                  (v !== null &&
                    (typeof v !== 'string' ||
                      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v))),
              )))
        )
          throw new BadRequestException({
            code: 'UPLOAD_SCHEMA_INVALID',
            detail: 'Format soal atau metadata tidak sesuai.',
          });
        if (!q.metadata || !Array.isArray(q.metadata.assetManifest))
          throw new BadRequestException({ code: 'UPLOAD_MEDIA_INVALID' });
        const identity = (
          asset: NonNullable<ImportQuestion['metadata']['assetManifest']>[number],
        ) => ({
          externalId: asset.externalId,
          assetId: asset.assetId,
          sha256: asset.sha256,
          byteLength: asset.byteLength,
          contentType: asset.contentType,
          placement: asset.placement,
          itemId: asset.itemId,
          assetOrder: asset.assetOrder,
          textMarker: asset.textMarker,
        });
        if (
          digest(q.metadata.assetManifest.map(identity)) !==
          digest(before.metadata.assetManifest!.map(identity))
        )
          throw new BadRequestException({
            code: 'UPLOAD_MEDIA_INVALID',
            detail: 'Identitas dan posisi gambar tidak boleh diganti di preview.',
          });
        q.metadata = {
          ...q.metadata,
          sourceSheet: before.metadata.sourceSheet,
          sourceRowNumber: before.metadata.sourceRowNumber,
          sourceMaterial: before.metadata.sourceMaterial,
          originalExternalId: before.metadata.originalExternalId,
          sourceFileName: row.fileName,
          sourceFileSha256: row.fileSha256,
        };
        delete q.metadata.sourceQuestionId;
      }
      const destination =
        body.destination === undefined ? (restored.preview!.destination ?? null) : body.destination;
      if (
        row.packageId &&
        destination &&
        restored.preview!.destination &&
        digest({ ...destination, title: '' }) !==
          digest({ ...restored.preview!.destination, title: '' })
      )
        throw new ConflictException({ code: 'UPLOAD_SCOPE_IMMUTABLE' });
      const { questions: mapped, issues } = resolveIntake(
        input,
        await this.content.curriculum(),
        destination,
        restored.preview!.questions,
      );
      const selected = mapped.filter((q) => body.selectedIds.includes(q.externalId));
      const persistent = restored.preview!.issues.filter((i) =>
        [
          'FORMULA_UNSUPPORTED',
          'CELL_ERROR',
          'IMAGE_UNMAPPED',
          'IMAGE_INVALID',
          'DUPLICATE_HEADER',
          'HEADER_REQUIRED',
          'QUESTIONS_REQUIRED',
        ].includes(i.code),
      );
      const blocking = issues.filter((i) => body.selectedIds.includes(i.externalId ?? ''));
      let report: ImportReportDto;
      if (selected.length && !blocking.length && !persistent.length) {
        report = (
          await this.importer.validateWithin(
            tx,
            {
              sourceNamespace: sessionNamespace(id),
              questions: finalQuestions(selected),
              ...(row.packageId
                ? {
                    target: {
                      packageId: row.packageId,
                      expectedRevision: (row.report as ImportReportDto).package!.contentRevision,
                    },
                  }
                : {}),
            },
            false,
            destination?.assessmentType,
          )
        ).report;
      } else
        report = {
          id: null,
          sourceNamespace: sessionNamespace(id),
          canImportDraft: false,
          items: selected.map((q) => ({
            externalId: q.externalId,
            canImportDraft: false,
            canPreview: false,
            outcome: 'INVALID',
            questionVersionId: null,
            blockers: blocking.filter((i) => i.externalId === q.externalId).map((i) => i.code),
            issues: blocking
              .filter((i) => i.externalId === q.externalId)
              .map((i) => ({
                code: i.code,
                detail: `${i.field}: ${i.detail}`,
                sheet: i.sheet,
                row: i.row,
              })),
          })),
        };
      if (row.packageId && !report.package && (row.report as ImportReportDto | null)?.package)
        report.package = {
          ...(row.report as ImportReportDto).package!,
          canSaveDraft: false,
          canPublish: false,
        };
      await tx
        .update(contentUploadSessions)
        .set({
          preview: {
            intakeVersion: 1,
            destination,
            validationCounts: {
              content: blocking.filter((i) => i.category === 'CONTENT').length,
              mapping: blocking.filter((i) => i.category !== 'CONTENT').length,
            },
            questions: mapped,
            selectedIds: body.selectedIds,
            issues: persistent,
          },
          report,
          state: report.canImportDraft ? 'VALIDATED' : 'PREVIEW',
          revision: row.revision + 1,
          updatedAt: new Date(),
        })
        .where(eq(contentUploadSessions.id, id));
    });
    return this.get(id, false);
  }
  async save(actor: string, id: string, key: string | undefined, body: SaveUploadDraftDto) {
    this.importer.enabled();
    const op = operationKey(key);
    const fingerprint = digest({ id, body });
    await getDatabase().db.transaction(async (tx) => {
      await operationLock(tx, `content-import:${actor}:${op}`);
      const [previous] = await tx
        .select()
        .from(contentImports)
        .where(and(eq(contentImports.actorUserId, actor), eq(contentImports.idempotencyKey, op)));
      if (previous) {
        if (
          (previous.report as { uploadSaveFingerprint?: string }).uploadSaveFingerprint !==
          fingerprint
        )
          throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' });
        return;
      }
      const row = await this.locked(tx, id, body.expectedRevision);
      if (row.state !== 'VALIDATED' || !row.preview)
        throw new ConflictException({
          code: 'UPLOAD_VALIDATION_REQUIRED',
          detail: 'Validasi isi sebelum menyimpan draft.',
        });
      const destination = row.preview.destination ?? null;
      if (
        destination &&
        (destination.assessmentType !== body.assessmentType ||
          destination.title.trim() !== body.title.trim())
      )
        throw new ConflictException({
          code: 'UPLOAD_DESTINATION_CHANGED',
          detail: 'Simpan dan validasi tujuan terbaru sebelum membuat draft.',
        });
      const mapped = resolveIntake(
        row.preview.questions,
        await this.content.curriculum(),
        destination,
        row.preview.questions,
      );
      if (mapped.issues.some((i) => row.preview!.selectedIds.includes(i.externalId ?? '')))
        throw new ConflictException({
          code: 'UPLOAD_MAPPING_REQUIRED',
          detail: 'Pemetaan materi berubah atau belum lengkap.',
          issues: mapped.issues,
        });
      const selected = finalQuestions(
        mapped.questions.filter((q) => row.preview!.selectedIds.includes(q.externalId)),
      );
      const { report } = await this.importer.validateWithin(
        tx,
        {
          sourceNamespace: sessionNamespace(id),
          questions: selected,
          ...(row.packageId
            ? {
                target: {
                  packageId: row.packageId,
                  expectedRevision: (row.report as ImportReportDto).package!.contentRevision,
                },
              }
            : {}),
        },
        false,
        row.preview?.destination?.assessmentType,
      );
      if (!report.canImportDraft || report.items.some((q) => !q.canPreview))
        throw new ConflictException({
          code: 'UPLOAD_MEDIA_REQUIRED',
          detail: 'Validasi semua soal dan verifikasi gambar sebelum menyimpan.',
        });
      let chapterId: string | null = null,
        levelId: string | null = null;
      if (body.assessmentType === 'PRETEST' || body.assessmentType === 'DRILL') {
        const first = selected[0]!;
        if (
          selected.some(
            (q) =>
              q.chapterCode !== first.chapterCode ||
              (body.assessmentType === 'DRILL' &&
                (q.subchapterCode !== first.subchapterCode ||
                  q.metadata.sourceLevelNumber !== first.metadata.sourceLevelNumber)),
          )
        )
          throw new BadRequestException({
            code: 'UPLOAD_SCOPE_MISMATCH',
            detail:
              body.assessmentType === 'DRILL'
                ? 'Drill harus dari satu subbab dan level.'
                : 'Pretest harus dari satu bab.',
          });
        const [scope] = await tx
          .select({ chapterId: chapters.id, levelId: levels.id })
          .from(levels)
          .innerJoin(subchapters, eq(levels.subchapterId, subchapters.id))
          .innerJoin(chapters, eq(subchapters.chapterId, chapters.id))
          .where(
            and(
              eq(chapters.code, first.chapterCode!),
              eq(subchapters.code, first.subchapterCode!),
              eq(levels.levelNumber, first.metadata.sourceLevelNumber!),
            ),
          )
          .for('share');
        if (!scope) throw new BadRequestException({ code: 'UPLOAD_SCOPE_MISMATCH' });
        chapterId = scope.chapterId;
        if (body.assessmentType === 'DRILL') levelId = scope.levelId;
      }
      const packageId = row.packageId ?? randomUUID();
      if (row.packageId) {
        const p = await this.packages.detailWithin(tx, packageId);
        if (
          p.assessmentType !== body.assessmentType ||
          p.chapterId !== chapterId ||
          p.levelId !== levelId
        )
          throw new ConflictException({
            code: 'UPLOAD_SCOPE_IMMUTABLE',
            detail:
              'Jenis dan cakupan draft sudah tersimpan. Buat unggahan baru untuk menggantinya.',
          });
        await tx
          .update(assessmentPackages)
          .set({ name: body.title.trim() })
          .where(eq(assessmentPackages.id, packageId));
      } else
        await tx.insert(assessmentPackages).values({
          id: packageId,
          familyCode: `UPLOAD-${id}`,
          packageVersion: 1,
          name: body.title.trim(),
          assessmentType: body.assessmentType,
          chapterId,
          levelId,
          variantIndex: body.assessmentType === 'DRILL' ? 1 : null,
          importSource: {
            sourceNamespace: sessionNamespace(id),
            sourceName: row.fileName,
            sourceReference: `Upload ${id}`,
          },
        });
      const saved = await this.importer.importWithin(
        tx,
        actor,
        key,
        {
          sourceNamespace: sessionNamespace(id),
          questions: selected.map((q, n) => ({
            ...q,
            metadata: { ...q.metadata, sourceOrder: n + 1 },
          })),
          target: {
            packageId,
            expectedRevision: row.packageId
              ? (row.report as ImportReportDto).package!.contentRevision
              : 0,
            fileName: row.fileName,
          },
        },
        fingerprint,
      );
      await tx
        .update(contentUploadSessions)
        .set({
          state: 'SAVED',
          packageId,
          importId: saved.id,
          report: saved,
          revision: row.revision + 1,
          updatedAt: new Date(),
        })
        .where(eq(contentUploadSessions.id, id));
      await tx.insert(auditLogs).values({
        actorUserId: actor,
        action: 'content_upload_draft_saved',
        entityType: 'content_upload',
        entityId: id,
        metadata: { packageId, fileName: row.fileName, fileSha256: row.fileSha256 },
      });
    });
    return this.get(id, false);
  }
  async list(query: UploadQueryDto): Promise<UploadListDto> {
    this.importer.enabled();
    const status = sql<string>`coalesce(${assessmentPackages.status}::text,${contentUploadSessions.state})`;
    const filter = and(
      query.search
        ? sql`position(lower(${query.search}) in lower(${contentUploadSessions.fileName} || ' ' || coalesce(${assessmentPackages.name},${contentUploadSessions.preview}->'destination'->>'title','')))>0`
        : undefined,
      query.assessmentType
        ? sql`coalesce(${assessmentPackages.assessmentType}::text,${contentUploadSessions.preview}->'destination'->>'assessmentType')=${query.assessmentType}`
        : undefined,
      query.status ? sql`${status}=${query.status}` : undefined,
    );
    const rows = await getDatabase()
      .db.select({
        upload: contentUploadSessions,
        actorName: users.displayName,
        title: assessmentPackages.name,
        type: assessmentPackages.assessmentType,
        status,
      })
      .from(contentUploadSessions)
      .innerJoin(users, eq(users.id, contentUploadSessions.actorUserId))
      .leftJoin(assessmentPackages, eq(assessmentPackages.id, contentUploadSessions.packageId))
      .where(filter)
      .orderBy(desc(contentUploadSessions.createdAt))
      .limit(query.limit)
      .offset(query.offset);
    const [total] = await getDatabase()
      .db.select({ count: sql<number>`count(*)::int` })
      .from(contentUploadSessions)
      .leftJoin(assessmentPackages, eq(assessmentPackages.id, contentUploadSessions.packageId))
      .where(filter);
    return {
      items: rows.map((r) => this.summary(r.upload, r.actorName, r.title, r.type, r.status)),
      total: total?.count ?? 0,
    };
  }
  private summary(
    row: typeof contentUploadSessions.$inferSelect,
    actorName: string,
    title: string | null,
    type: string | null,
    status: string,
  ): UploadSummaryDto {
    return {
      id: row.id,
      fileName: row.fileName,
      createdAt: row.createdAt.toISOString(),
      actorName,
      revision: row.revision,
      state: row.state,
      status,
      questionCount:
        row.preview?.selectedIds.length ??
        (row.report as ImportReportDto | null)?.items.length ??
        0,
      title: title ?? row.preview?.destination?.title ?? null,
      assessmentType: type ?? row.preview?.destination?.assessmentType ?? null,
      packageId: row.packageId,
      error: row.error,
      validationResult:
        row.error ??
        (row.preview?.validationCounts &&
        (row.preview.validationCounts.content || row.preview.validationCounts.mapping)
          ? `Konten: ${row.preview.validationCounts.content} masalah; pemetaan: ${row.preview.validationCounts.mapping} belum selesai`
          : row.preview?.issues.length
            ? `${row.preview.issues.length} masalah parsing`
            : row.report
              ? (row.report as ImportReportDto).canImportDraft
                ? 'Isi valid'
                : 'Pemetaan/validasi belum lengkap'
              : 'Belum divalidasi'),
    };
  }
  private async restore(row: typeof contentUploadSessions.$inferSelect, media: boolean) {
    let preview = row.preview;
    let extracted: ExcelIntakeDto['media'] = [];
    if (row.objectKey && (media || !preview?.intakeVersion)) {
      const parsed = await parseExcel(
        await this.storage.readWorkbook(row.id, row.fileSha256),
        sessionNamespace(row.id),
        this.storage.settings(true).bucket,
        { id: row.id, curriculum: { items: [] } },
      );
      extracted = parsed.media;
      if (!preview?.intakeVersion) {
        const existing = new Map(preview?.questions.map((q) => [q.externalId, q]) ?? []);
        const added = parsed.envelope.questions.filter((q) => !existing.has(q.externalId));
        const questions = [
          ...(preview?.questions ?? []).map((q) => ({
            ...q,
            metadata: {
              ...q.metadata,
              sourceMaterial:
                parsed.envelope.questions.find((p) => p.externalId === q.externalId)?.metadata
                  .sourceMaterial ?? q.metadata.sourceMaterial,
            },
          })),
          ...added,
        ];
        preview = {
          intakeVersion: 1,
          destination: preview?.destination ?? null,
          questions,
          selectedIds: [...(preview?.selectedIds ?? []), ...added.map((q) => q.externalId)],
          issues: parsed.issues,
        };
      }
    }
    return { preview, media: extracted };
  }
  async get(id: string, media = true): Promise<UploadDetailDto> {
    this.importer.enabled();
    const [result] = await getDatabase()
      .db.select({ row: contentUploadSessions, actorName: users.displayName })
      .from(contentUploadSessions)
      .innerJoin(users, eq(users.id, contentUploadSessions.actorUserId))
      .where(eq(contentUploadSessions.id, id));
    if (!result) throw new NotFoundException({ code: 'UPLOAD_NOT_FOUND' });
    const { row, actorName } = result;
    const p = row.packageId ? await this.packages.detail(row.packageId) : null;
    const restored = await this.restore(row, media);
    const preview =
      restored.preview ??
      (p
        ? {
            questions: p.items.flatMap((i) => (i.question ? [i.question] : [])),
            selectedIds: p.items.flatMap((i) => (i.question ? [i.question.externalId] : [])),
            issues: [],
          }
        : null);
    const destination =
      restored.preview?.destination ??
      (p
        ? {
            assessmentType: p.assessmentType,
            title: p.name,
            chapterId: p.chapterId,
            subchapterId:
              (await this.content.curriculum()).items.find(
                (i) =>
                  i.kind === 'SUBCHAPTER' &&
                  i.code === p.subchapterCode &&
                  i.parentId === p.chapterId,
              )?.id ?? null,
            levelId: p.levelId,
          }
        : null);
    const resolved = preview
      ? resolveIntake(
          preview.questions,
          await this.content.curriculum(),
          destination,
          preview.questions,
        )
      : null;
    const excel: ExcelIntakeDto | null = resolved
      ? {
          envelope: {
            intakeVersion: 1,
            sourceNamespace: p?.source?.sourceNamespace ?? sessionNamespace(id),
            questions: resolved.questions as ExcelIntakeDto['envelope']['questions'],
          },
          media: restored.media,
          issues: preview!.issues,
          mappingIssues: resolved.issues,
          report: row.report as ImportReportDto | null,
        }
      : null;
    if (media && excel && !row.preview)
      for (const q of excel.envelope.questions)
        for (const a of q.metadata.assetManifest)
          if (a.objectKey)
            excel.media.push({
              externalId: q.externalId,
              assetId: a.assetId,
              base64: '',
              url: (await this.storage.readLink(a.bucket, a.objectKey)).url,
            });
    return {
      ...this.summary(
        row,
        actorName,
        p?.name ?? null,
        p?.assessmentType ?? null,
        p?.status ??
          (preview ? (row.state === 'INVALID' && !row.error ? 'PREVIEW' : row.state) : row.state),
      ),
      canEditPreview: !!restored.preview && (!p || p.status === 'DRAFT'),
      excel,
      questionCount: preview?.selectedIds.length ?? 0,
      selectedIds: preview?.selectedIds ?? [],
      destination,
      package: p,
    };
  }
}
