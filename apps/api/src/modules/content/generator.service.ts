import { Injectable, HttpException } from '@nestjs/common';
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
} from '@tka/irt-orchestration';
import { generatorCandidateSchema } from './generator-candidate.schema';
const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);
const schema = ajv.compile(generatorCandidateSchema);
export function validateGeneratorCandidate(value: unknown): CandidatePayload {
  if (!schema(value)) throw new HttpException({ code: 'GENERATOR_CONTENT_INVALID' }, 409);
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
  if (texts.some((t) => t.includes('[[asset:')))
    throw new HttpException({ code: 'GENERATOR_MEDIA_UNSUPPORTED' }, 409);
  return p;
}
@Injectable()
export class GeneratorService {
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
      const catalog = (await generatorHttp('/api/v1/generators')) as {
        serviceContract?: string;
        items?: {
          questionExternalId: string;
          mode: string;
          originalHash: string;
          originalVersion: number;
        }[];
      };
      if (catalog.serviceContract !== 'generator-service-v1' || !Array.isArray(catalog.items))
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
      };
    });
  }
  save(actor: string, id: string) {
    return this.execute(() =>
      saveGenerationDraft(getDatabase().client, actor, id, validateGeneratorCandidate),
    );
  }
}
