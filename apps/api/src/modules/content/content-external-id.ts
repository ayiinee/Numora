import type { ContentAsset } from '@tka/database';

/**
 * Resolve display/validation identity for imported and generator-created versions.
 * Generator media keeps a unique GEN-* identity because storage idempotency is
 * variant-scoped; generator versions do not have a content-import identity row.
 */
export function contentExternalId(
  importedExternalId: string | null | undefined,
  sourceRef: string | null | undefined,
  questionId: string,
  media: readonly Pick<ContentAsset, 'externalId'>[] | null | undefined,
) {
  if (importedExternalId) return importedExternalId;
  const mediaIds = [
    ...new Set(
      (media ?? [])
        .map((asset) => asset.externalId)
        .filter((externalId): externalId is string => typeof externalId === 'string'),
    ),
  ];
  if (mediaIds.length === 1) return mediaIds[0]!;
  return sourceRef ?? questionId;
}
