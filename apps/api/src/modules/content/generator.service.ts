import { Injectable, HttpException, Inject, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { getDatabase } from '@tka/database';
import { decodeAssessmentContent } from '@tka/assessment-engine';
import {
  acceptedCandidate,
  generatorCatalog,
  generationDetail,
  listGenerations,
  prepareGeneration,
  retryGeneration,
  saveGenerationDraft,
  IrtOrchestrationError,
  requireGeneratorEnabled,
  generatorHttp,
  type CandidatePayload,
  type DraftMaterialization,
  contentFingerprint,
  type GeneratorJson,
} from '@tka/irt-orchestration';
import { generatorCandidateSchema } from './generator-candidate.schema';
import { generatorCandidateV2Schema } from './generator-candidate-v2.schema';
import { MediaUploadsService } from './media-uploads.service';
const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);
const schema = ajv.compile(generatorCandidateSchema);
const schemaV2 = ajv.compile(generatorCandidateV2Schema);
export function validateGeneratorCandidate(value: unknown): CandidatePayload {
  const hasMedia =
    Array.isArray((value as CandidatePayload)?.media) &&
    (value as CandidatePayload).media.length > 0;
  if (!(hasMedia ? schemaV2(value) : schema(value)))
    throw new HttpException({ code: 'GENERATOR_CONTENT_INVALID' }, 409);
  const p = value as unknown as CandidatePayload;
  try {
    decodeAssessmentContent(p);
  } catch {
    throw new HttpException({ code: 'GENERATOR_CONTENT_INVALID' }, 409);
  }
  const texts = [
    p.stem.text,
    p.explanation.text,
    ...p.optionsOrStatements.options.map((o) => o.content.text),
  ];
  if (!hasMedia && texts.some((t) => t.includes('[[asset:')))
    throw new HttpException({ code: 'GENERATOR_MEDIA_UNSUPPORTED' }, 409);
  if (hasMedia) {
    const ids = p.media.map((m) => m.assetId);
    if (new Set(ids).size !== ids.length)
      throw new HttpException({ code: 'GENERATOR_MEDIA_INVALID' }, 409);
    for (const [field, placement] of [
      [p.stem, 'STEM'],
      [p.explanation, 'EXPLANATION'],
    ] as const) {
      const markers = [...field.text.matchAll(/\[\[asset:([^\]]+)\]\]/g)].map((m) => m[1]).sort();
      const expected = p.media
        .filter((m) => m.placement === placement)
        .map((m) => m.assetId)
        .sort();
      if (
        JSON.stringify(markers) !== JSON.stringify(expected) ||
        JSON.stringify([...((field as { assetKeys?: string[] }).assetKeys ?? [])].sort()) !==
          JSON.stringify(expected)
      )
        throw new HttpException({ code: 'GENERATOR_MEDIA_INVALID' }, 409);
    }
  }
  return p;
}
@Injectable()
export class GeneratorService {
  constructor(
    @Optional() @Inject(MediaUploadsService) private readonly uploads?: MediaUploadsService,
  ) {}
  private async execute<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (e) {
      if (e instanceof IrtOrchestrationError)
        throw new HttpException({ code: e.code, detail: e.code }, e.status);
      if (['23514', '23505', '22P02'].includes((e as { code?: string }).code ?? ''))
        throw new HttpException({ code: 'GENERATOR_STATE_CONFLICT' }, 409);
      throw e;
    }
  }
  catalog() {
    return this.execute(async () => {
      requireGeneratorEnabled();
      await generatorHttp('/health/ready');
      const v2 = process.env.NUMORA_GENERATOR_V2_ENABLED === 'true';
      const catalog = (await generatorHttp(v2 ? '/api/v2/generators' : '/api/v1/generators')) as {
        serviceContract?: string;
        items?: {
          questionExternalId: string;
          mode: string;
          originalHash: string;
          originalVersion: number;
        }[];
      };
      if (
        catalog.serviceContract !== (v2 ? 'generator-service-v2' : 'generator-service-v1') ||
        !Array.isArray(catalog.items)
      )
        throw new HttpException({ code: 'GENERATOR_CATALOG_INVALID' }, 503);
      return generatorCatalog(getDatabase().client, catalog.items);
    });
  }
  prepare(actor: string, key: string, mappingId: string) {
    return this.execute(() => prepareGeneration(getDatabase().client, actor, key, mappingId));
  }
  retry(actor: string, key: string, id: string) {
    return this.execute(() => retryGeneration(getDatabase().client, actor, key, id));
  }
  detail(id: string) {
    return this.execute(() => generationDetail(getDatabase().client, id));
  }
  list(limit: number, offset: number) {
    return this.execute(() => listGenerations(getDatabase().client, limit, offset));
  }
  preview(id: string) {
    return this.execute(async () => {
      requireGeneratorEnabled();
      const c = await getDatabase().client.begin((tx) =>
        acceptedCandidate(tx, id, validateGeneratorCandidate, false),
      );
      const media = await this.previewMedia(c);
      return {
        id: c.id,
        scoringStatus: 'NOT_SCORED' as const,
        score: null,
        type: c.payload.questionType,
        stem: c.payload.stem,
        options: c.payload.optionsOrStatements.options,
        categories: c.payload.optionsOrStatements.categories,
        answerKey: c.payload.answerKey,
        explanation: c.payload.explanation,
        media,
      };
    });
  }
  private async previewMedia(c: Awaited<ReturnType<typeof acceptedCandidate>>) {
    if (!c.payload.media.length) return [];
    const rows = await getDatabase().client<
      { sha256: string; png_bytes: Buffer }[]
    >`select sha256,png_bytes from irt_compute.generator_media_artifacts where execution_id=${c.executionId}`;
    return c.payload.media.map((m) => ({
      ...m,
      url:
        'data:image/png;base64,' +
        rows.find((r) => r.sha256 === m.sha256)!.png_bytes.toString('base64'),
    }));
  }
  async materialize(actor: string, id: string): Promise<DraftMaterialization | undefined> {
    const client = getDatabase().client;
    const c = await client.begin((tx) =>
      acceptedCandidate(tx, id, validateGeneratorCandidate, false),
    );
    if (!c.payload.media.length) return undefined;
    const [stored] = await client<
      { canonical_payload: DraftMaterialization['payload']; receipt_ids: string[] }[]
    >`select canonical_payload,receipt_ids from generator_candidate_materializations where candidate_id=${c.id}`;
    if (stored)
      return {
        candidateId: c.id,
        sourceFingerprint: c.payload.contentFingerprint,
        payload: stored.canonical_payload,
        receiptIds: stored.receipt_ids,
      };
    const rows = await client<
      { sha256: string; png_bytes: Buffer }[]
    >`select sha256,png_bytes from irt_compute.generator_media_artifacts where execution_id=${c.executionId}`;
    const media: DraftMaterialization['payload']['media'] = [];
    const receiptIds: string[] = [];
    for (const m of c.payload.media) {
      const bytes = rows.find((r) => r.sha256 === m.sha256)?.png_bytes;
      if (!bytes || createHash('sha256').update(bytes).digest('hex') !== m.sha256)
        throw new HttpException({ code: 'GENERATOR_MEDIA_ARTIFACT_INVALID' }, 409);
      const externalId = 'GEN-' + c.payload.contentFingerprint;
      if (!this.uploads)
        throw new HttpException({ code: 'GENERATOR_MEDIA_STORAGE_UNAVAILABLE' }, 503);
      const receipt = await this.uploads.storeGeneratorImage(
        actor,
        externalId,
        m.assetId,
        m.sha256,
        bytes,
      );
      receiptIds.push(receipt.uploadId);
      media.push({
        externalId,
        assetId: m.assetId,
        textMarker: `[[asset:${m.assetId}]]`,
        placement: m.placement,
        itemId: null,
        assetOrder: media.length + 1,
        altText: m.altText,
        objectKey: receipt.objectKey,
        bucket: receipt.bucket,
        sha256: m.sha256,
        byteLength: m.byteLength,
        contentType: m.contentType,
      });
    }
    const payload = { ...c.payload, media };
    // Shared JS canonical fingerprint, not PostgreSQL's jsonb digest.
    payload.contentFingerprint = contentFingerprint(
      payload as unknown as Record<string, GeneratorJson>,
    );
    return {
      candidateId: c.id,
      sourceFingerprint: c.payload.contentFingerprint,
      payload,
      receiptIds,
    };
  }
  save(actor: string, id: string) {
    return this.execute(async () => {
      const materialization = await this.materialize(actor, id);
      return saveGenerationDraft(
        getDatabase().client,
        actor,
        id,
        validateGeneratorCandidate,
        materialization,
      );
    });
  }
}
