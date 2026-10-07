import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { getDatabase, type ImportQuestion } from '@tka/database';
import {
  acceptedCandidate,
  generationDetail,
  IrtOrchestrationError,
  prepareGenerationWithin,
  requireGeneratorEnabled,
  requireGeneratorMain,
  retryGeneration,
  saveGenerationDraftWithin,
} from '@tka/irt-orchestration';
import type { TransactionSql } from 'postgres';
import { GeneratorService, validateGeneratorCandidate } from './generator.service';
import { digest, structuralErrors } from './content-import.validation';
import { packageCounts, placementErrors } from './content-package.rules';
import type { ContentPackageDto } from './content-packages.dto';
import type {
  CreateGeneratorPackageDto,
  GeneratorPackageDto,
  GeneratorPackageFileDto,
  GeneratorJsonPreviewDto,
} from './generator-packages.dto';
import type { ImportReportDto } from './content-preview.dto';
type Source = {
  id: string;
  family_id: string;
  usage_type: CreateGeneratorPackageDto['assessmentType'];
  chapter_id: string;
  level_id: string;
  chapter_name: string;
  subchapter_name: string;
  level_number: number;
};
type Row = {
  id: string;
  assessment_type: CreateGeneratorPackageDto['assessmentType'];
  title: string;
  expected_count: number;
  chapter_id: string | null;
  level_id: string | null;
  request_ids: string[];
  canonical_package_id: string | null;
  created_at: Date | string;
  operation_fingerprint: string;
};
@Injectable()
export class GeneratorPackagesService {
  constructor(@Inject(GeneratorService) private readonly generator: GeneratorService) {}
  private async execute<T>(fn: () => Promise<T>): Promise<T> {
    try {
      requireGeneratorEnabled();
      await requireGeneratorMain(getDatabase().client);
      return await fn();
    } catch (e) {
      if (e instanceof IrtOrchestrationError)
        throw new HttpException({ code: e.code, detail: e.code }, e.status);
      throw e;
    }
  }
  private async sources() {
    const catalog = await this.generator.catalog();
    const ids = catalog.items.map((m) => m.id);
    if (!ids.length) return [] as Source[];
    return getDatabase().client<
      Source[]
    >`SELECT a.id,v.question_id AS family_id,q.usage_type,l.id AS level_id,ch.id AS chapter_id,ch.name AS chapter_name,s.name AS subchapter_name,l.level_number
    FROM configuration_approvals a JOIN irt_compute.generator_configs g ON g.id=a.generator_config_id JOIN question_versions ver ON ver.id::text=g.parameters->>'parentQuestionVersionId'
    JOIN question_variants v ON v.id=ver.variant_id JOIN questions q ON q.id=v.question_id JOIN measurement_contexts ctx ON ctx.id=g.context_id
    LEFT JOIN levels l ON l.id=ver.level_id LEFT JOIN subchapters s ON s.id=l.subchapter_id LEFT JOIN chapters ch ON ch.id=coalesce(q.chapter_id,s.chapter_id)
    WHERE a.id=ANY(${ids}::uuid[]) AND q.usage_type IS NOT NULL
    AND (q.usage_type='TRYOUT' OR (ch.id IS NOT NULL AND ch.status<>'ARCHIVED' AND (q.usage_type='PRETEST' OR (l.id IS NOT NULL AND l.status<>'ARCHIVED' AND s.status<>'ARCHIVED')))) ORDER BY g.parameters->>'questionExternalId',v.question_id,a.id`;
  }
  catalog() {
    return this.execute(async () => {
      const sources = await this.sources();
      const options = [];
      for (const assessmentType of ['TRYOUT', 'DRILL', 'PRETEST'] as const) {
        const rows = sources.filter((r) => r.usage_type === assessmentType);
        const scopes =
          assessmentType === 'TRYOUT'
            ? [null]
            : [
                ...new Set(
                  rows.map((r) => (assessmentType === 'DRILL' ? r.level_id : r.chapter_id)),
                ),
              ];
        for (const scopeId of scopes) {
          const selected = rows.filter(
            (r) => !scopeId || (assessmentType === 'DRILL' ? r.level_id : r.chapter_id) === scopeId,
          );
          const first = selected[0];
          const availableCount = new Set(selected.map((r) => r.family_id)).size;
          options.push({
            assessmentType,
            scopeId,
            scopeLabel:
              assessmentType === 'TRYOUT'
                ? 'Lintas materi'
                : assessmentType === 'DRILL'
                  ? `${first?.chapter_name} / ${first?.subchapter_name} / Level ${first?.level_number}`
                  : (first?.chapter_name ?? ''),
            availableCount,
            requiredCount: packageCounts[assessmentType],
            canGenerate: availableCount >= packageCounts[assessmentType],
          });
        }
      }
      return { options };
    });
  }
  prepare(actor: string, key: string, body: CreateGeneratorPackageDto) {
    return this.execute(async () => {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(key) || !body.title.trim())
        throw new HttpException({ code: 'GENERATOR_INPUT_INVALID' }, 400);
      const fingerprint = digest(body),
        client = getDatabase().client;
      const existing = await client<
        Row[]
      >`SELECT * FROM generator_packages WHERE actor_user_id=${actor} AND operation_key=${key}`;
      if (existing[0]) {
        if (existing[0].operation_fingerprint !== fingerprint)
          throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' });
        return this.detail(existing[0].id);
      }
      const sources = await this.sources();
      const count = packageCounts[body.assessmentType];
      if (
        (body.assessmentType === 'TRYOUT' && body.scopeId) ||
        (body.assessmentType !== 'TRYOUT' && !body.scopeId)
      )
        throw new ConflictException({ code: 'GENERATOR_PACKAGE_SCOPE_REQUIRED' });
      const eligible = sources.filter(
        (r) =>
          r.usage_type === body.assessmentType &&
          (!body.scopeId ||
            (body.assessmentType === 'DRILL' ? r.level_id : r.chapter_id) === body.scopeId),
      );
      const distinct = [...new Map(eligible.map((r) => [r.family_id, r])).values()].slice(0, count);
      if (distinct.length !== count)
        throw new ConflictException({
          code: 'GENERATOR_SOURCES_INSUFFICIENT',
          detail: `Diperlukan ${count} original mapped dari keluarga berbeda; tersedia ${distinct.length}.`,
        });
      const id = await client.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${actor + ':' + key},6))`;
        const [previous] = await tx<
          Row[]
        >`SELECT * FROM generator_packages WHERE actor_user_id=${actor} AND operation_key=${key}`;
        if (previous) {
          if (previous.operation_fingerprint !== fingerprint)
            throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' });
          return previous.id;
        }
        const groupId = randomUUID(),
          requests = [];
        for (let i = 0; i < distinct.length; i++)
          requests.push(
            await prepareGenerationWithin(tx, actor, `${groupId}-${i}`, distinct[i]!.id),
          );
        await tx`INSERT INTO generator_packages(id,actor_user_id,operation_key,operation_fingerprint,assessment_type,title,expected_count,chapter_id,level_id,mapping_ids,request_ids)
    VALUES(${groupId},${actor},${key},${fingerprint},${body.assessmentType},${body.title.trim()},${count},${body.assessmentType === 'TRYOUT' ? null : distinct[0]!.chapter_id},${body.assessmentType === 'DRILL' ? distinct[0]!.level_id : null},${JSON.stringify(distinct.map((r) => r.id))}::text::jsonb,${JSON.stringify(requests)}::text::jsonb)`;
        await tx`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(${actor},'GENERATOR_PACKAGE_PREPARED','generator_package',${groupId})`;
        return groupId;
      });
      return this.detail(id);
    });
  }
  private async row(
    tx: TransactionSql | ReturnType<typeof getDatabase>['client'],
    id: string,
    lock = false,
  ) {
    const rows = lock
      ? await tx<Row[]>`SELECT * FROM generator_packages WHERE id=${id} FOR UPDATE`
      : await tx<Row[]>`SELECT * FROM generator_packages WHERE id=${id}`;
    if (!rows[0]) throw new NotFoundException({ code: 'GENERATOR_PACKAGE_NOT_FOUND' });
    return rows[0];
  }
  detail(id: string): Promise<GeneratorPackageDto> {
    return this.execute(async () => {
      const client = getDatabase().client,
        row = await this.row(client, id),
        requests = [];
      for (const r of row.request_ids) requests.push(await generationDetail(client, r));
      const completedCount = requests.filter((r) => r.executionStatus === 'SUCCEEDED').length,
        failedCount = requests.filter(
          (r) =>
            ['FAILED', 'EXPIRED'].includes(r.executionStatus ?? '') ||
            r.leaseExpired ||
            (!r.executionStatus && !!r.failureCode),
        ).length;
      return {
        id: row.id,
        assessmentType: row.assessment_type,
        title: row.title,
        expectedCount: row.expected_count,
        completedCount,
        failedCount,
        status: row.canonical_package_id
          ? 'IMPORTED'
          : failedCount
            ? 'FAILED'
            : completedCount === row.expected_count
              ? 'READY'
              : 'GENERATING',
        packageId: row.canonical_package_id,
        createdAt: new Date(row.created_at).toISOString(),
        requests,
      };
    });
  }
  list() {
    return this.execute(async () => {
      const rows = await getDatabase().client<
        { id: string }[]
      >`SELECT id FROM generator_packages ORDER BY created_at DESC,id DESC LIMIT 50`;
      const items = [];
      for (const r of rows) items.push(await this.detail(r.id));
      return { items };
    });
  }
  async retry(actor: string, key: string, id: string) {
    return this.execute(async () => {
      if (!/^[A-Za-z0-9_-]{1,90}$/.test(key))
        throw new HttpException({ code: 'GENERATOR_INPUT_INVALID' }, 400);
      const group = await this.detail(id);
      for (const r of group.requests)
        if (
          ['FAILED', 'EXPIRED'].includes(r.executionStatus ?? '') ||
          r.leaseExpired ||
          (!r.executionStatus && !!r.failureCode)
        )
          await retryGeneration(getDatabase().client, actor, `${key}-${r.id}`, r.id);
      return this.detail(id);
    });
  }
  private async fileWithin(tx: TransactionSql, id: string): Promise<GeneratorPackageFileDto> {
    const row = await this.row(tx, id);
    const items = [];
    for (const requestId of row.request_ids) {
      const candidate = await acceptedCandidate(tx, requestId, validateGeneratorCandidate, false);
      const [scope] = await tx<
        {
          chapter_code: string | null;
          subchapter_code: string | null;
          competency_code: string | null;
          level_number: number | null;
          usage_type: string | null;
          family_id: string;
        }[]
      >`SELECT ch.code AS chapter_code,s.code AS subchapter_code,comp.code AS competency_code,l.level_number,q.usage_type,q.id AS family_id
    FROM question_versions ver JOIN question_variants v ON v.id=ver.variant_id JOIN questions q ON q.id=v.question_id LEFT JOIN competencies comp ON comp.id=q.primary_competency_id
    LEFT JOIN levels l ON l.id=ver.level_id LEFT JOIN subchapters s ON s.id=coalesce(q.subchapter_id,l.subchapter_id,comp.subchapter_id) LEFT JOIN chapters ch ON ch.id=coalesce(q.chapter_id,s.chapter_id) WHERE ver.id=${candidate.originalId}`;
      if (scope?.usage_type !== row.assessment_type)
        throw new ConflictException({ code: 'QUESTION_USAGE_MISMATCH' });
      const p = candidate.payload;
      items.push({
        requestId,
        candidateId: candidate.id,
        content: p,
        question: {
          externalId: 'GEN_' + candidate.id.replaceAll('-', ''),
          type: p.questionType,
          chapterCode: scope.chapter_code,
          subchapterCode: scope.subchapter_code,
          competencyCode: scope.competency_code,
          difficulty: p.difficulty,
          stem: p.stem,
          options: p.optionsOrStatements.options,
          answer: p.answerKey,
          explanation: p.explanation,
          metadata: {
            sourceLevelNumber: scope.level_number,
            sourceSheet: 'Generator',
            sourceRowNumber: items.length + 1,
            sourceOrder: items.length + 1,
            assetManifest: [],
            ...(p.optionsOrStatements.categories.length
              ? { categories: p.optionsOrStatements.categories }
              : {}),
          },
        },
      });
    }
    return {
      contractVersion: 'numora-generator-package-v1',
      generatorPackageId: id,
      assessmentType: row.assessment_type,
      title: row.title,
      expectedCount: row.expected_count,
      items,
    };
  }
  export(id: string) {
    return this.execute(() => getDatabase().client.begin((tx) => this.fileWithin(tx, id)));
  }
  private async validateWithin(
    tx: TransactionSql,
    id: string,
    file: object,
  ): Promise<GeneratorJsonPreviewDto> {
    const canonical = await this.fileWithin(tx, id),
      row = await this.row(tx, id);
    if (digest(file) !== digest(canonical))
      throw new ConflictException({
        code: 'GENERATOR_JSON_CHANGED',
        detail: 'JSON tidak cocok dengan hasil generator yang dipin. Unduh ulang file asli.',
      });
    const [scope] = await tx<
      { chapter_code: string | null; subchapter_code: string | null; level_number: number | null }[]
    >`SELECT ch.code AS chapter_code,s.code AS subchapter_code,l.level_number FROM generator_packages g LEFT JOIN chapters ch ON ch.id=g.chapter_id LEFT JOIN levels l ON l.id=g.level_id LEFT JOIN subchapters s ON s.id=l.subchapter_id WHERE g.id=${id}`;
    const target = {
      assessmentType: row.assessment_type,
      chapterCode: scope?.chapter_code,
      subchapterCode: scope?.subchapter_code,
      levelNumber: scope?.level_number,
    } as ContentPackageDto;
    const items = canonical.items.map((item) => {
      const blockers = [
        ...structuralErrors(item.question, false, row.assessment_type === 'TRYOUT'),
        ...placementErrors(item.question as ImportQuestion, target),
      ];
      return {
        externalId: item.question.externalId,
        canImportDraft: !blockers.length,
        canPreview: !blockers.length,
        blockers,
        outcome: (!blockers.length ? 'VALIDATED' : 'INVALID') as 'VALIDATED' | 'INVALID',
        questionVersionId: null,
      };
    });
    const report: ImportReportDto = {
      id: null,
      sourceNamespace: 'GENERATOR_' + id.replaceAll('-', ''),
      canImportDraft:
        canonical.items.length === packageCounts[row.assessment_type] &&
        items.every((i) => i.canImportDraft),
      items,
    };
    return { file: canonical, report };
  }
  validate(id: string, file: object) {
    return this.execute(() =>
      getDatabase().client.begin((tx) => this.validateWithin(tx, id, file)),
    );
  }
  import(actor: string, id: string, file: object) {
    return this.execute(() =>
      getDatabase().client.begin(async (tx) => {
        const row = await this.row(tx, id, true);
        const preview = await this.validateWithin(tx, id, file);
        if (!preview.report.canImportDraft)
          throw new ConflictException({ code: 'GENERATOR_IMPORT_VALIDATION_REQUIRED' });
        if (row.canonical_package_id) return { id: row.canonical_package_id };
        const versionIds = [];
        for (const requestId of row.request_ids)
          versionIds.push(
            (await saveGenerationDraftWithin(tx, actor, requestId, validateGeneratorCandidate)).id,
          );
        const [canonical] = await tx<
          { id: string }[]
        >`INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,chapter_id,level_id,variant_index,status,content_revision)
   VALUES(${'GENERATOR_' + id.replaceAll('-', '')},1,${row.title},${row.assessment_type},${row.chapter_id},${row.level_id},${row.assessment_type === 'DRILL' ? 1 : null},'DRAFT',1) RETURNING id`;
        for (let i = 0; i < versionIds.length; i++)
          await tx`INSERT INTO package_items(package_id,question_version_id,display_order,max_points,rubric_version_id,maximum_score_category) SELECT ${canonical!.id},v.id,${i + 1},1,v.scoring_rubric_version_id,r.maximum_score_category FROM question_versions v JOIN scoring_rubric_versions r ON r.id=v.scoring_rubric_version_id WHERE v.id=${versionIds[i]!}`;
        await tx`UPDATE generator_packages SET canonical_package_id=${canonical!.id} WHERE id=${id}`;
        await tx`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(${actor},'GENERATOR_PACKAGE_IMPORTED','assessment_package',${canonical!.id})`;
        return { id: canonical!.id };
      }),
    );
  }
}
