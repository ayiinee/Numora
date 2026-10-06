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
  scoringRubricVersions,
  getDatabase,
  type ImportQuestion,
} from '@tka/database';
import type { AdminTransaction } from '../audit/admin-mutation';
import type { ImportBodyDto, ImportItemDto, ImportReportDto } from './content-preview.dto';
import { digest, snapshot, structuralErrors } from './content-import.validation';

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

  private async inspect(tx: AdminTransaction, body: ImportBodyDto) {
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
      if (q.metadata.scoringRubricVersionId !== undefined) {
        const rubricId = q.metadata.scoringRubricVersionId;
        if (
          typeof rubricId !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            rubricId,
          )
        )
          errors.push('RUBRIC_ID_INVALID');
        else {
          const [rubric] = await tx
            .select()
            .from(scoringRubricVersions)
            .where(eq(scoringRubricVersions.id, rubricId))
            .for('share');
          if (
            !rubric ||
            rubric.status !== 'SEALED' ||
            !rubric.approvedAt ||
            !rubric.approvedByUserId ||
            rubric.questionType !== q.type
          )
            errors.push('APPROVED_PGK_RUBRIC_REQUIRED');
        }
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
          .where(eq(questions.id, identity.questionId));
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
        ...(q.metadata.scoringRubricVersionId
          ? { scoringRubricVersionId: q.metadata.scoringRubricVersionId }
          : {}),
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
        outcome: r.errors.length ? 'INVALID' : 'VALIDATED',
        questionVersionId: null,
      })),
    };
  }
  async validate(body: ImportBodyDto): Promise<ImportReportDto> {
    this.enabled();
    this.size(body);
    return getDatabase().db.transaction(async (tx) =>
      this.report(body, await this.inspect(tx, body)),
    );
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
      const records = await this.inspect(tx, body);
      if (
        body.expectedSourceVersionId &&
        (records.length !== 1 || records[0]?.latest?.version.id !== body.expectedSourceVersionId)
      )
        throw new ConflictException({
          code: 'CONTENT_REVISION_CONFLICT',
          detail: 'Reload the latest imported version before revising.',
        });
      const report = this.report(body, records);
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
            scoringRubricVersionId:
              typeof r.q.metadata.scoringRubricVersionId === 'string'
                ? r.q.metadata.scoringRubricVersionId
                : null,
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
          provenance: r.q.metadata,
        });
        items.push({
          ...report.items[i]!,
          outcome: r.latest ? 'CREATED_REVISION' : 'CREATED',
          questionVersionId: version!.id,
        });
      }
      report.items = items;
      // The row is invisible until this transaction commits with its complete report.
      await tx.update(contentImports).set({ report }).where(eq(contentImports.id, id));
      await tx.insert(auditLogs).values({
        actorUserId: actor,
        action: 'CONTENT_IMPORTED',
        entityType: 'content_import',
        entityId: id,
        metadata: {
          count: items.length,
          ...(body.expectedSourceVersionId
            ? { revisedFromId: body.expectedSourceVersionId, reason: body.revisionReason }
            : {}),
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
