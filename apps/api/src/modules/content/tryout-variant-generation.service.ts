import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { getDatabase } from '@tka/database';
import type { TransactionSql } from 'postgres';
import {
  generationDetail,
  prepareGenerationWithin,
  saveGenerationDraftWithin,
} from '@tka/irt-orchestration';
import { GeneratorService, validateGeneratorCandidate } from './generator.service';
import type {
  CreateTryoutVariantDto,
  TryoutVariantFocalDto,
  TryoutVariantGeneratorMappingDto,
  TryoutVariantOptionsDto,
  TryoutVariantProcessDto,
} from './tryout-variant-generation.dto';

type PackageRow = {
  id: string;
  name: string;
  package_version: number;
  content_revision: number;
  status: string;
  assessment_type: string;
  purpose: string;
  is_demo: boolean;
  display_order: number;
  question_version_id: string;
  external_id: string;
  question_kind: string;
  usage_type: string | null;
  content_status: string;
  validation_state: string;
};
type Mapping = TryoutVariantGeneratorMappingDto & {
  originalQuestionVersionId: string;
  configId: string;
  approvalDigest: string;
};
type MappingRow = {
  id: string;
  config_id: string;
  label: string | null;
  service_contract: string;
  mode: string;
  original_hash: string;
  original_version: number;
  config_version: number;
  approval_digest: string;
  original_question_version_id: string;
};
type ProcessRow = {
  id: string;
  source_package_id: string;
  source_package_version: number;
  anchor_question_version_ids: string[];
  focal_question_version_ids: string[];
  mapping_ids: string[];
  config_ids: string[];
  approval_digests: string[];
  request_ids: string[];
  status: TryoutVariantProcessDto['status'];
  generated_package_id: string | null;
  created_at: Date | string;
  operation_fingerprint: string;
  source_content_revision: number;
};

const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

@Injectable()
export class TryoutVariantGenerationService {
  constructor(@Inject(GeneratorService) private readonly generator: GeneratorService) {}

  private async packageRows(packageId: string, tx = getDatabase().client) {
    return tx<
      PackageRow[]
    >`SELECT p.id,p.name,p.package_version,p.content_revision,p.status::text,p.assessment_type::text,p.purpose::text,p.is_demo,
      i.display_order,ver.id AS question_version_id,
      coalesce(ci.external_id,
        CASE WHEN jsonb_typeof(ver.media)='array' THEN ver.media->0->>'externalId'
             WHEN jsonb_typeof(ver.media)='object' THEN ver.media->'assets'->0->>'externalId' END,
        q.source_ref,ver.id::text) AS external_id,
      v.kind AS question_kind,q.usage_type::text,
      ver.content_status::text,ver.validation_state::text
      FROM assessment_packages p
      JOIN package_items i ON i.package_id=p.id
      JOIN question_versions ver ON ver.id=i.question_version_id
      JOIN question_variants v ON v.id=ver.variant_id
      JOIN questions q ON q.id=v.question_id
      LEFT JOIN content_import_versions civ ON civ.question_version_id=ver.id
      LEFT JOIN content_import_identities ci ON ci.id=civ.identity_id
      WHERE p.id=${packageId} AND p.purpose='REGULAR'
      ORDER BY i.display_order,i.id`;
  }

  private async mappings() {
    const catalog = await this.generator.catalog();
    const ids = catalog.items.map((item) => item.id);
    if (!ids.length) return [] as Mapping[];
    const rows = await getDatabase().client<
      MappingRow[]
    >`SELECT a.id,g.id AS config_id,a.approved_digest,
      g.config_version,g.parameters->>'questionExternalId' AS label,
      g.parameters->>'serviceContract' AS service_contract,g.parameters->>'mode' AS mode,
      g.parameters->>'originalHash' AS original_hash,(g.parameters->>'originalVersion')::int AS original_version,
      g.parameters->>'parentQuestionVersionId' AS original_question_version_id
      FROM configuration_approvals a JOIN irt_compute.generator_configs g ON g.id=a.generator_config_id
      WHERE a.id=ANY(${ids}::uuid[]) AND a.revoked_at IS NULL AND g.status='SEALED' AND a.approved_digest=g.digest`;
    const details = new Map(rows.map((row) => [row.id, row]));
    return catalog.items.flatMap((item) => {
      const row = details.get(item.id);
      if (!row || row.original_question_version_id !== item.originalQuestionVersionId) return [];
      return [
        {
          id: row.id,
          label: row.label || item.label,
          serviceContract: row.service_contract,
          mode: row.mode,
          originalHash: row.original_hash,
          originalVersion: row.original_version,
          configVersion: row.config_version,
          originalQuestionVersionId: item.originalQuestionVersionId,
          configId: row.config_id,
          approvalDigest: row.approval_digest,
        },
      ];
    });
  }

  private async optionsFor(
    packageId: string,
    anchors: string[] = [],
  ): Promise<TryoutVariantOptionsDto> {
    if (anchors.some((id) => !uuid(id)))
      throw new ConflictException({ code: 'TRYOUT_VARIANT_ANCHOR_INVALID' });
    const rows = await this.packageRows(packageId);
    if (!rows.length) throw new NotFoundException({ code: 'CONTENT_PACKAGE_NOT_FOUND' });
    const first = rows[0]!;
    const blockers = new Set<string>();
    if (first.assessment_type !== 'TRYOUT') blockers.add('PACKAGE_USAGE_MISMATCH');
    if (first.purpose !== 'REGULAR') blockers.add('PACKAGE_PURPOSE_INVALID');
    if (first.status !== 'PUBLISHED') blockers.add('SOURCE_PACKAGE_NOT_PUBLISHED');
    if (first.is_demo) blockers.add('SOURCE_PACKAGE_DEMO');
    if (rows.length !== 30) blockers.add('SOURCE_PACKAGE_COUNT_INVALID');
    if (new Set(rows.map((row) => row.question_version_id)).size !== rows.length)
      blockers.add('SOURCE_PACKAGE_DUPLICATE_QUESTION');
    if (rows.some((row) => row.question_kind !== 'ORIGINAL'))
      blockers.add('SOURCE_PACKAGE_NOT_ORIGINAL');
    if (rows.some((row) => row.usage_type !== 'TRYOUT'))
      blockers.add('SOURCE_PACKAGE_USAGE_MISMATCH');
    if (rows.some((row) => row.content_status === 'ARCHIVED'))
      blockers.add('SOURCE_PACKAGE_CONTENT_INVALID');
    if (anchors.length !== 5) blockers.add('ANCHOR_COUNT_INVALID');
    if (anchors.some((id) => !rows.some((row) => row.question_version_id === id)))
      blockers.add('ANCHOR_NOT_IN_SOURCE_PACKAGE');
    if (new Set(anchors).size !== anchors.length) blockers.add('ANCHOR_DUPLICATE');

    const mappings = await this.mappings();
    const byVersion = new Map<string, Mapping[]>();
    for (const mapping of mappings)
      byVersion.set(mapping.originalQuestionVersionId, [
        ...(byVersion.get(mapping.originalQuestionVersionId) ?? []),
        mapping,
      ]);
    const questions = rows.map((row) => ({
      id: row.question_version_id,
      displayOrder: row.display_order,
      label: row.external_id || `Soal ${row.display_order}`,
      externalId: row.external_id,
    }));
    const focalQuestions: TryoutVariantFocalDto[] = rows
      .filter((row) => !anchors.includes(row.question_version_id))
      .map((row) => {
        const matches = byVersion.get(row.question_version_id) ?? [];
        const itemBlockers: string[] = [];
        if (!matches.length) itemBlockers.push('GENERATOR_MAPPING_MISSING');
        if (matches.length > 1) itemBlockers.push('GENERATOR_MAPPING_AMBIGUOUS');
        if (
          matches.some(
            (m) => !['generator-service-v1', 'generator-service-v2'].includes(m.serviceContract),
          )
        )
          itemBlockers.push('GENERATOR_SERVICE_CONTRACT_DISABLED');
        if (itemBlockers.length) itemBlockers.forEach((code) => blockers.add(code));
        const mapping = matches.length === 1 && !itemBlockers.length ? matches[0]! : null;
        return {
          ...questions.find((question) => question.id === row.question_version_id)!,
          mapping,
          blockers: itemBlockers,
        };
      });
    const generatorBlockers = focalQuestions.flatMap((item) => item.blockers);
    const sourceBlockers = [...blockers].filter(
      (code) => code === 'ANCHOR_COUNT_INVALID' || !generatorBlockers.includes(code),
    );
    const unresolved = focalQuestions.filter((item) => item.blockers.length > 0).length;
    const generatorAvailable =
      sourceBlockers.every((code) => code === 'ANCHOR_COUNT_INVALID') && unresolved <= 5;
    return {
      packageId: first.id,
      packageName: first.name,
      packageVersion: first.package_version,
      contentRevision: first.content_revision,
      status: first.status,
      questions,
      focalQuestions,
      blockers: [...blockers],
      generatorBlockers: [...new Set(generatorBlockers)],
      generatorAvailable,
      canGenerate: anchors.length === 5 && blockers.size === 0 && focalQuestions.length === 25,
    };
  }

  options(packageId: string, anchorQuestionVersionIds: string[] = []) {
    return this.optionsFor(packageId, anchorQuestionVersionIds);
  }

  private async row(
    tx: TransactionSql | ReturnType<typeof getDatabase>['client'],
    id: string,
    lock = false,
  ) {
    const rows = lock
      ? await tx<
          ProcessRow[]
        >`SELECT * FROM tryout_variant_generation_processes WHERE id=${id} FOR UPDATE`
      : await tx<ProcessRow[]>`SELECT * FROM tryout_variant_generation_processes WHERE id=${id}`;
    if (!rows[0]) throw new NotFoundException({ code: 'TRYOUT_VARIANT_PROCESS_NOT_FOUND' });
    return rows[0];
  }

  async prepare(actor: string, packageId: string, body: CreateTryoutVariantDto) {
    if (!body.operationKey || !/^[A-Za-z0-9_-]{1,128}$/.test(body.operationKey))
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_INVALID' });
    if (!uuid(packageId) || body.anchorQuestionVersionIds.length !== 5)
      throw new ConflictException({ code: 'TRYOUT_VARIANT_INPUT_INVALID' });
    const options = await this.optionsFor(packageId, body.anchorQuestionVersionIds);
    if (!options.canGenerate)
      throw new ConflictException({
        code: 'TRYOUT_VARIANT_NOT_READY',
        detail: options.blockers.join(','),
      });
    const mappingIds = options.focalQuestions.map((item) => item.mapping!.id);
    const mappingRows = await this.mappings();
    const mappingById = new Map(mappingRows.map((mapping) => [mapping.id, mapping]));
    const configIds = mappingIds.map((id) => mappingById.get(id)?.configId);
    const approvalDigests = mappingIds.map((id) => mappingById.get(id)?.approvalDigest);
    if (configIds.some((id) => !id) || approvalDigests.some((value) => !value))
      throw new ConflictException({ code: 'GENERATOR_MAPPING_NOT_APPROVED' });
    const focalIds = options.focalQuestions.map((item) => item.id);
    const fingerprint = digest({
      packageId,
      sourceRevision: options.contentRevision,
      anchors: body.anchorQuestionVersionIds,
      focalIds,
      mappingIds,
      configIds,
      approvalDigests,
      expectedRevision: body.expectedRevision,
    });
    const client = getDatabase().client;
    const existing = await client<
      ProcessRow[]
    >`SELECT * FROM tryout_variant_generation_processes WHERE actor_user_id=${actor} AND operation_key=${body.operationKey}`;
    if (existing[0]) {
      if (existing[0].operation_fingerprint !== fingerprint)
        throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' });
      return this.detail(existing[0].id);
    }
    const id = await client.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${actor + ':' + body.operationKey},6))`;
      const previous = await tx<
        ProcessRow[]
      >`SELECT * FROM tryout_variant_generation_processes WHERE actor_user_id=${actor} AND operation_key=${body.operationKey}`;
      if (previous[0]) return previous[0].id;
      const source = await this.rowSource(tx, packageId, body.expectedRevision);
      const processId = randomUUID();
      const requestIds: string[] = [];
      for (let i = 0; i < mappingIds.length; i++)
        requestIds.push(
          await prepareGenerationWithin(tx, actor, `${processId}-${i}`, mappingIds[i]!),
        );
      await tx`INSERT INTO tryout_variant_generation_processes
        (id,actor_user_id,operation_key,operation_fingerprint,source_package_id,source_package_version,source_content_revision,anchor_question_version_ids,focal_question_version_ids,mapping_ids,config_ids,approval_digests,request_ids,input_digest)
        VALUES(${processId},${actor},${body.operationKey},${fingerprint},${packageId},${source.package_version},${source.content_revision},${JSON.stringify(body.anchorQuestionVersionIds)}::jsonb,${JSON.stringify(focalIds)}::jsonb,${JSON.stringify(mappingIds)}::jsonb,${JSON.stringify(configIds)}::jsonb,${JSON.stringify(approvalDigests)}::jsonb,${JSON.stringify(requestIds)}::jsonb,${fingerprint})`;
      await tx`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(${actor},'TRYOUT_VARIANT_GENERATION_PREPARED','tryout_variant_generation_process',${processId})`;
      return processId;
    });
    return this.detail(id);
  }

  private async rowSource(tx: TransactionSql, packageId: string, expectedRevision: number) {
    const rows = await tx<
      {
        package_version: number;
        content_revision: number;
        status: string;
        assessment_type: string;
        purpose: string;
      }[]
    >`SELECT package_version,content_revision,status::text,assessment_type::text,purpose::text FROM assessment_packages WHERE id=${packageId} FOR UPDATE`;
    const source = rows[0];
    if (!source) throw new NotFoundException({ code: 'CONTENT_PACKAGE_NOT_FOUND' });
    if (source.content_revision !== expectedRevision)
      throw new ConflictException({ code: 'PACKAGE_REVISION_CONFLICT' });
    if (
      source.status !== 'PUBLISHED' ||
      source.assessment_type !== 'TRYOUT' ||
      source.purpose !== 'REGULAR'
    )
      throw new ConflictException({ code: 'TRYOUT_VARIANT_SOURCE_INVALID' });
    return source;
  }

  async detail(id: string): Promise<TryoutVariantProcessDto> {
    const client = getDatabase().client;
    const row = await this.row(client, id);
    const requests = [];
    for (const requestId of row.request_ids) {
      const detail = await generationDetail(client, requestId);
      requests.push({
        id: requestId,
        label: detail.label ?? requestId,
        executionStatus: detail.executionStatus ?? null,
        failureCode: detail.failureCode ?? null,
      });
    }
    const failed = requests.some(
      (request) =>
        ['FAILED', 'EXPIRED'].includes(request.executionStatus ?? '') || request.failureCode,
    );
    const complete =
      requests.length === 25 &&
      requests.every((request) => request.executionStatus === 'SUCCEEDED');
    const status = row.generated_package_id
      ? 'IMPORTED'
      : failed
        ? 'FAILED'
        : complete
          ? 'READY'
          : 'GENERATING';
    if (status !== row.status)
      await client`UPDATE tryout_variant_generation_processes SET status=${status} WHERE id=${id}`;
    return {
      id: row.id,
      sourcePackageId: row.source_package_id,
      sourcePackageVersion: row.source_package_version,
      anchorQuestionVersionIds: row.anchor_question_version_ids,
      focalQuestionVersionIds: row.focal_question_version_ids,
      status,
      generatedPackageId: row.generated_package_id,
      requests,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  async materialize(actor: string, id: string) {
    const client = getDatabase().client;
    const row = await this.row(client, id);
    if (row.generated_package_id) return { id: row.generated_package_id };
    const details = await Promise.all(
      row.request_ids.map((requestId) => generationDetail(client, requestId)),
    );
    if (!details.every((item) => item.executionStatus === 'SUCCEEDED'))
      throw new ConflictException({ code: 'TRYOUT_VARIANT_GENERATION_NOT_READY' });
    const materializations = new Map<
      string,
      Awaited<ReturnType<GeneratorService['materialize']>>
    >();
    for (const requestId of row.request_ids)
      materializations.set(requestId, await this.generator.materialize(actor, requestId));
    return client.begin(async (tx) => {
      const locked = await this.row(tx, id, true);
      if (locked.generated_package_id) return { id: locked.generated_package_id };
      const sourceRows = await tx<
        { display_order: number; question_version_id: string }[]
      >`SELECT display_order,question_version_id FROM package_items WHERE package_id=${locked.source_package_id} ORDER BY display_order,id`;
      const generatedIds: string[] = [];
      for (let i = 0; i < locked.request_ids.length; i++) {
        const saved = await saveGenerationDraftWithin(
          tx,
          actor,
          locked.request_ids[i]!,
          validateGeneratorCandidate,
          materializations.get(locked.request_ids[i]!),
        );
        generatedIds.push(saved.id);
      }
      const [created] = await tx<{ id: string }[]>`INSERT INTO assessment_packages
        (family_code,package_version,name,import_source,content_revision,assessment_type,purpose,chapter_id,level_id,variant_index,duration_seconds,is_demo,scoring_policy_version_id,status)
        SELECT ${'VARIANT_' + id.replaceAll('-', '')},package_version,name || ${' · Varian'},jsonb_build_object('sourceNamespace','TRYOUT_VARIANT_GENERATOR','sourceName',name,'sourceReference',jsonb_build_object('processId',${id},'sourcePackageId',${locked.source_package_id})::text),1,assessment_type,purpose,chapter_id,level_id,variant_index,duration_seconds,false,scoring_policy_version_id,'DRAFT' FROM assessment_packages WHERE id=${locked.source_package_id} RETURNING id`;
      const anchors = new Set(locked.anchor_question_version_ids);
      let generatedIndex = 0;
      for (const item of sourceRows) {
        const questionVersionId = anchors.has(item.question_version_id)
          ? item.question_version_id
          : generatedIds[generatedIndex++];
        await tx`INSERT INTO package_items(package_id,question_version_id,display_order,max_points,rubric_version_id,maximum_score_category)
          SELECT ${created!.id},v.id,${item.display_order},1,v.scoring_rubric_version_id,r.maximum_score_category
          FROM question_versions v JOIN scoring_rubric_versions r ON r.id=v.scoring_rubric_version_id WHERE v.id=${questionVersionId!}`;
      }
      await tx`UPDATE tryout_variant_generation_processes SET status='IMPORTED',generated_package_id=${created!.id} WHERE id=${id}`;
      await tx`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(${actor},'TRYOUT_VARIANT_GENERATION_MATERIALIZED','assessment_package',${created!.id})`;
      return { id: created!.id };
    });
  }
}
