import { decodeAssessmentContent } from '@tka/assessment-engine';
import { presentFixtureText } from '@tka/database';
import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  auditLogs,
  getDatabase,
  contentImportVersions,
  contentImportIdentities,
  questionVersions,
  contentPreviewSessions,
  contentPreviewItems,
  contentPreviewAnswers,
  type ContentAsset,
  type ContentOption,
  type ContentCategory,
  type ContentAnswer,
  type PreviewSnapshot,
} from '@tka/database';
import type { AdminTransaction } from '../audit/admin-mutation';
import { ContentImportService, operationKey, operationLock } from './content-import.service';
import { canonical, digest, normalizeAnswer } from './content-import.validation';
import { R2MediaStorage } from './r2-media.storage';
import type {
  CreatePreviewDto,
  MediaLinkRequestDto,
  PreviewAckDto,
  PreviewMediaDto,
  PreviewSessionDto,
  SavePreviewAnswerDto,
} from './content-preview.dto';

@Injectable()
export class ContentPreviewService {
  constructor(
    @Inject(ContentImportService) private readonly importer: ContentImportService,
    @Inject(R2MediaStorage) private readonly storage: R2MediaStorage,
  ) {}
  private async session(tx: AdminTransaction, actor: string, id: string) {
    const [row] = await tx
      .select()
      .from(contentPreviewSessions)
      .where(and(eq(contentPreviewSessions.id, id), eq(contentPreviewSessions.actorUserId, actor)))
      .for('update');
    if (!row) throw new NotFoundException({ code: 'PREVIEW_NOT_FOUND' });
    return row;
  }
  async create(
    actor: string,
    key: string | undefined,
    body: CreatePreviewDto,
  ): Promise<PreviewSessionDto> {
    this.importer.enabled();
    const op = operationKey(key),
      fingerprint = digest(body);
    const id = await getDatabase().db.transaction(async (tx) => {
      await operationLock(tx, `preview-create:${actor}:${op}`);
      const [previous] = await tx
        .select()
        .from(contentPreviewSessions)
        .where(
          and(
            eq(contentPreviewSessions.actorUserId, actor),
            eq(contentPreviewSessions.idempotencyKey, op),
          ),
        );
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' });
        return previous.id;
      }
      const rows = await tx
        .select({ version: questionVersions, externalId: contentImportIdentities.externalId })
        .from(questionVersions)
        .innerJoin(
          contentImportVersions,
          eq(contentImportVersions.questionVersionId, questionVersions.id),
        )
        .innerJoin(
          contentImportIdentities,
          eq(contentImportIdentities.id, contentImportVersions.identityId),
        )
        .where(inArray(questionVersions.id, body.questionVersionIds))
        .for('share', { of: questionVersions });
      if (rows.length !== body.questionVersionIds.length)
        throw new NotFoundException({ code: 'PREVIEW_VERSION_NOT_FOUND' });
      const snapshots = body.questionVersionIds.map((id) => {
        const { version: v, externalId } = rows.find((r) => r.version.id === id)!;
        if (v.contentStatus === 'ARCHIVED')
          throw new ConflictException({ code: 'PREVIEW_VERSION_ARCHIVED' });
        const content = v.optionsOrStatements as {
          options: ContentOption[];
          categories: ContentCategory[];
        };
        const assets = (v.media ?? []) as ContentAsset[];
        if (assets.some((a) => !a.objectKey))
          throw new ConflictException({ code: 'MEDIA_NOT_READY' });
        return {
          externalId,
          type: v.questionType,
          stem: v.stem,
          options: content.options,
          categories: content.categories,
          answerKey: v.answerKey,
          explanation: v.explanation,
          assets,
        } as PreviewSnapshot;
      });
      const [session] = await tx
        .insert(contentPreviewSessions)
        .values({ actorUserId: actor, idempotencyKey: op, fingerprint })
        .returning();
      for (const [i, snapshot] of snapshots.entries()) {
        const [item] = await tx
          .insert(contentPreviewItems)
          .values({
            sessionId: session!.id,
            questionVersionId: body.questionVersionIds[i]!,
            position: i + 1,
            snapshot,
          })
          .returning();
        await tx.insert(contentPreviewAnswers).values({ itemId: item!.id, answer: null });
      }
      await tx.insert(auditLogs).values({
        actorUserId: actor,
        action: 'CONTENT_PREVIEW_CREATED',
        entityType: 'content_preview_session',
        entityId: session!.id,
        metadata: { count: snapshots.length },
      });
      return session!.id;
    });
    return this.get(actor, id, false);
  }
  async get(actor: string, id: string, review: boolean): Promise<PreviewSessionDto> {
    this.importer.enabled();
    const view = await getDatabase().db.transaction(async (tx) => {
      const session = await this.session(tx, actor, id);
      if (review && session.state !== 'SUBMITTED')
        throw new ConflictException({ code: 'PREVIEW_NOT_SUBMITTED' });
      const items = await tx
        .select({ item: contentPreviewItems, answer: contentPreviewAnswers })
        .from(contentPreviewItems)
        .innerJoin(contentPreviewAnswers, eq(contentPreviewAnswers.itemId, contentPreviewItems.id))
        .where(eq(contentPreviewItems.sessionId, id))
        .orderBy(asc(contentPreviewItems.position));
      return { session, items };
    });
    const media: PreviewMediaDto[] = [];
    for (const { item } of view.items)
      media.push(
        ...(await this.links(
          item!.id,
          item.snapshot.assets.filter((a) => review || a.placement !== 'EXPLANATION'),
        )),
      );
    return {
      id,
      state: view.session.state as 'IN_PROGRESS' | 'SUBMITTED',
      scoringStatus: 'NOT_SCORED',
      score: null,
      media,
      items: view.items.map(({ item, answer }) => {
        decodeAssessmentContent({
          questionType: item.snapshot.type,
          stem: item.snapshot.stem,
          optionsOrStatements: {
            options: item.snapshot.options,
            categories: item.snapshot.categories,
          },
          answerKey: item.snapshot.answerKey,
          explanation: item.snapshot.explanation,
        });
        return {
          instanceId: item!.id,
          questionVersionId: item.questionVersionId,
          externalId: item.snapshot.externalId,
          type: item.snapshot.type,
          stem: {
            text: presentFixtureText(item.questionVersionId, 'stem', item.snapshot.stem.text),
          },
          options: item.snapshot.options.map((o) => ({
            id: o.id,
            content: { text: o.content.text },
          })),
          categories: item.snapshot.categories,
          answer: answer.answer,
          revision: answer.revision,
          serverSavedAt: answer.savedAt.toISOString(),
          score: null,
          ...(review
            ? {
                answerKey: item.snapshot.answerKey,
                explanation: {
                  text: presentFixtureText(
                    item.questionVersionId,
                    'explanation',
                    item.snapshot.explanation.text,
                  ),
                },
              }
            : {}),
        };
      }),
    };
  }
  async save(
    actor: string,
    id: string,
    instanceId: string,
    body: SavePreviewAnswerDto,
  ): Promise<PreviewAckDto> {
    this.importer.enabled();
    return getDatabase().db.transaction(async (tx) => {
      const session = await this.session(tx, actor, id);
      if (session.state !== 'IN_PROGRESS')
        throw new ConflictException({ code: 'PREVIEW_SUBMITTED' });
      const [row] = await tx
        .select({ item: contentPreviewItems, answer: contentPreviewAnswers })
        .from(contentPreviewItems)
        .innerJoin(contentPreviewAnswers, eq(contentPreviewAnswers.itemId, contentPreviewItems.id))
        .where(and(eq(contentPreviewItems.sessionId, id), eq(contentPreviewItems.id, instanceId)));
      if (!row) throw new NotFoundException({ code: 'PREVIEW_ITEM_NOT_FOUND' });
      const answer = normalizeAnswer(
        row.item.snapshot.type,
        body.answer,
        row.item.snapshot.options.map((o) => o.id),
        row.item.snapshot.categories.map((c) => c.id),
      );
      if (
        body.expectedRevision !== row.answer.revision &&
        canonical(answer) !== canonical(row.answer.answer)
      )
        throw new ConflictException({
          code: 'ANSWER_REVISION_CONFLICT',
          detail: 'Reload the latest saved answer before retrying.',
        });
      let saved = row.answer;
      if (canonical(answer) !== canonical(saved.answer)) {
        const [updated] = await tx
          .update(contentPreviewAnswers)
          .set({ answer, revision: saved!.revision + 1, savedAt: sql`clock_timestamp()` })
          .where(eq(contentPreviewAnswers.itemId, instanceId))
          .returning();
        saved = updated!;
      }
      return {
        instanceId,
        answer: saved!.answer as ContentAnswer,
        revision: saved!.revision,
        serverSavedAt: saved!.savedAt.toISOString(),
      };
    });
  }
  async submit(actor: string, id: string, key: string | undefined): Promise<PreviewSessionDto> {
    this.importer.enabled();
    const op = operationKey(key);
    await getDatabase().db.transaction(async (tx) => {
      const session = await this.session(tx, actor, id);
      if (session.state === 'SUBMITTED') return;
      await tx
        .update(contentPreviewSessions)
        .set({ state: 'SUBMITTED', submitKey: op, submittedAt: sql`clock_timestamp()` })
        .where(eq(contentPreviewSessions.id, id));
      await tx.insert(auditLogs).values({
        actorUserId: actor,
        action: 'CONTENT_PREVIEW_SUBMITTED',
        entityType: 'content_preview_session',
        entityId: id,
      });
    });
    return this.get(actor, id, true);
  }
  private async links(instanceId: string, assets: ContentAsset[]): Promise<PreviewMediaDto[]> {
    return Promise.all(
      assets.map(async (a) => ({
        instanceId,
        assetId: a.assetId,
        altText: a.altText,
        ...(await this.storage.readLink(a.bucket, a.objectKey!)),
      })),
    );
  }
  async media(actor: string, id: string, body: MediaLinkRequestDto) {
    this.importer.enabled();
    const assets = await getDatabase().db.transaction(async (tx) => {
      const session = await this.session(tx, actor, id);
      if (body.phase === 'REVIEW' && session.state !== 'SUBMITTED')
        throw new ConflictException({ code: 'PREVIEW_NOT_SUBMITTED' });
      const [item] = await tx
        .select()
        .from(contentPreviewItems)
        .where(
          and(eq(contentPreviewItems.sessionId, id), eq(contentPreviewItems.id, body.instanceId)),
        );
      if (!item) throw new NotFoundException({ code: 'PREVIEW_ITEM_NOT_FOUND' });
      const assets = item.snapshot.assets.filter(
        (a) =>
          body.assetIds.includes(a.assetId) &&
          (body.phase === 'REVIEW' || a.placement !== 'EXPLANATION'),
      );
      if (assets.length !== body.assetIds.length)
        throw new BadRequestException({ code: 'MEDIA_SCOPE_INVALID' });
      return assets;
    });
    return { media: await this.links(body.instanceId, assets) };
  }
}
