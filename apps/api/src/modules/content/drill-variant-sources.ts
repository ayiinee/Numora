import { ConflictException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { getDatabase } from '@tka/database';
import { approvedDrillGeneratorMappings, type GeneratorJson } from '@tka/irt-orchestration';
import type { TransactionSql } from 'postgres';
import { digest } from './content-import.validation';

export type DrillRuntimePin = { runtimeProfile: string; imageDigest: string };
type Mapping = {
  approvalId: string;
  configId: string;
  configVersion: number;
  configDigest: string;
  mode: 'NUMERIC' | 'CONCEPTUAL_STOCK';
  sourceFingerprint: string;
  originalHash: string;
  originalVersion: number;
  mediaProfile: GeneratorJson;
};
type SourceItem = {
  displayOrder: number;
  questionVersionId: string;
  familyId: string;
  rubricVersionId: string;
  contentHash: string;
  sourceFingerprint: string;
  competencyCode: string;
  maxPoints: string;
  maximumScoreCategory: number;
};
type SourcePackage = {
  id: string;
  name: string;
  status: string;
  packageVersion: number;
  levelId: string;
  levelLabel: string;
  chapterId: string;
  subchapterId: string;
  contextId: string;
  contextRevision: number;
  policyVersionId: string;
  variantArmId: string;
  originalRevisionId: string;
  blueprintVersionId: string;
};
type Source = SourcePackage & {
  anchorIds: string[];
  items: (SourceItem & { mapping: Mapping | null; blockers: string[] })[];
  blockers: string[];
  sourceDigest: string;
};
export type DrillVariantManifest = {
  contractVersion: 'generator-service-v2';
  ecosystem: 'DRILL';
  dimension: 'LEVEL';
  armKind: 'VARIANT';
  sourcePackageId: string;
  sourcePackageVersion: number;
  sourceDigest: string;
  levelId: string;
  contextId: string;
  contextRevision: number;
  variantArmId: string;
  policyVersionId: string;
  originalRevisionId: string;
  blueprintVersionId: string;
  runtime: DrillRuntimePin;
  items: (SourceItem & {
    role: 'ANCHOR' | 'FOCAL';
    mapping: Mapping | null;
    seed: number | null;
  })[];
  manifestDigest: string;
};

type Reader = TransactionSql | ReturnType<typeof getDatabase>['client'];
export async function drillVariantSources(db: Reader, id?: string): Promise<Source[]> {
  const packages = await db<
    (SourcePackage & {
      isDemo: boolean;
      purpose: string;
      scopeOk: boolean;
      policyOk: boolean;
      approvalOk: boolean;
      anchorIds: string[] | null;
    })[]
  >`
    SELECT p.id,p.name,p.status,p.purpose,p.is_demo AS "isDemo",p.package_version AS "packageVersion",
      l.id AS "levelId",s.id AS "subchapterId",ch.id AS "chapterId",
      concat(ch.name,' / ',s.name,' / Level ',l.level_number) AS "levelLabel",
      ctx.id AS "contextId",ctx.revision AS "contextRevision",
      p.scoring_policy_version_id AS "policyVersionId", v.id AS "variantArmId",
      r.id AS "originalRevisionId",b.id AS "blueprintVersionId",
      r.anchor_question_version_ids AS "anchorIds",
      (ctx.ecosystem='DRILL' AND ctx.dimension='LEVEL' AND ctx.level_id=l.id
       AND aset.status IN ('DRAFT','OPEN') AND a.status='ACTIVE'
       AND l.status<>'ARCHIVED' AND s.status<>'ARCHIVED' AND ch.status<>'ARCHIVED'
       AND (p.chapter_id IS NULL OR p.chapter_id=ch.id)) AS "scopeOk",
      (policy.status='PUBLISHED' AND policy.approved_at IS NOT NULL
       AND policy.approved_by_user_id IS NOT NULL) AS "policyOk",
      (b.status='SEALED' AND b.approved_at IS NOT NULL AND length(trim(b.approval_reference))>0
       AND (b.definition->'anchorQuestionVersionIds') @> to_jsonb(r.anchor_question_version_ids)
       AND to_jsonb(r.anchor_question_version_ids) @> (b.definition->'anchorQuestionVersionIds')
       AND coalesce(length(trim(p.curriculum_approval->>'reference')),0)>0
       AND p.curriculum_approval->>'approvedAt' IS NOT NULL
       AND p.curriculum_approval->>'revokedAt' IS NULL
       AND coalesce(p.curriculum_approval->>'compositionDigest',p.curriculum_approval->>'manifestDigest')=
        irt_compute.payload_digest(jsonb_build_object('packageId',p.id,'items',
          (SELECT jsonb_agg(to_jsonb(pi) ORDER BY pi.display_order,pi.id) FROM package_items pi WHERE pi.package_id=p.id)))) AS "approvalOk"
    FROM assessment_packages p
    JOIN levels l ON l.id=p.level_id JOIN subchapters s ON s.id=l.subchapter_id
    JOIN chapters ch ON ch.id=s.chapter_id
    LEFT JOIN assessment_arms a ON a.id=p.distribution_arm_id AND a.kind='ORIGINAL'
    LEFT JOIN assessment_arm_revisions r ON r.id=a.current_revision_id AND r.package_id=p.id
    LEFT JOIN assessment_arm_sets aset ON aset.id=a.set_id AND r.id IS NOT NULL
    LEFT JOIN assessment_arms v ON v.set_id=aset.id AND v.kind='VARIANT'
    LEFT JOIN measurement_contexts ctx ON ctx.id=aset.context_id
    LEFT JOIN assessment_blueprint_versions b ON b.id=aset.blueprint_version_id
    LEFT JOIN scoring_policy_versions policy ON policy.id=p.scoring_policy_version_id
    WHERE p.assessment_type='DRILL' AND (
      (${id ?? null}::uuid IS NOT NULL AND p.id=${id ?? null}::uuid) OR
      (${id ?? null}::uuid IS NULL AND p.status='PUBLISHED' AND p.purpose='REGULAR' AND NOT p.is_demo
       AND (p.distribution_arm_id IS NULL OR a.id IS NOT NULL)))
    ORDER BY p.name,p.id`;
  if (!packages.length) return [];

  const versions = await db<
    (SourceItem & {
      packageId: string;
      levelId: string;
      kind: string;
      usage: string;
      contentOk: boolean;
      taxonomyOk: boolean;
      rubricOk: boolean;
    })[]
  >`
    SELECT pi.package_id AS "packageId",pi.display_order AS "displayOrder",
      ver.id AS "questionVersionId",q.id AS "familyId",ver.level_id AS "levelId",
      v.kind,q.usage_type AS usage,comp.code AS "competencyCode",
      pi.rubric_version_id AS "rubricVersionId",pi.max_points::text AS "maxPoints",
      pi.maximum_score_category AS "maximumScoreCategory",
      ver.content_fingerprint AS "sourceFingerprint",
      irt_compute.payload_digest(jsonb_build_object('stem',ver.stem,'options',ver.options_or_statements,
        'answer',ver.answer_key,'explanation',ver.explanation,'media',ver.media,
        'difficulty',ver.difficulty,'questionType',ver.question_type)) AS "contentHash",
      (q.status='READY' AND ver.content_status='READY' AND ver.validation_state='CONTENT_VALID'
       AND ver.reviewed_at IS NOT NULL AND ver.reviewed_by_user_id IS NOT NULL
       AND ver.content_fingerprint ~ '^[a-f0-9]{64}$' AND ver.difficulty IS NOT NULL
       AND length(trim(ver.stem->>'text'))>0 AND length(trim(ver.explanation->>'text'))>0) AS "contentOk",
      (comp.status<>'ARCHIVED' AND comp.subchapter_id=l.subchapter_id
       AND (q.subchapter_id IS NULL OR q.subchapter_id=l.subchapter_id)
       AND (q.chapter_id IS NULL OR q.chapter_id=s.chapter_id)
       AND (q.curriculum_level_number IS NULL OR q.curriculum_level_number=l.level_number)) AS "taxonomyOk",
      (rubric.status='SEALED' AND rubric.id=ver.scoring_rubric_version_id
       AND rubric.question_type=ver.question_type::text
       AND pi.maximum_score_category=rubric.maximum_score_category AND pi.max_points>0) AS "rubricOk"
    FROM package_items pi JOIN question_versions ver ON ver.id=pi.question_version_id
    JOIN question_variants v ON v.id=ver.variant_id JOIN questions q ON q.id=v.question_id
    LEFT JOIN scoring_rubric_versions rubric ON rubric.id=pi.rubric_version_id
    LEFT JOIN levels l ON l.id=ver.level_id LEFT JOIN subchapters s ON s.id=l.subchapter_id
    LEFT JOIN competencies comp ON comp.id=q.primary_competency_id
    WHERE pi.package_id=ANY(${packages.map((p) => p.id)}::uuid[])
    ORDER BY pi.package_id,pi.display_order`;
  const contextIds = [
    ...new Set(packages.flatMap((pack) => (pack.contextId ? [pack.contextId] : []))),
  ];
  const mappings = await approvedDrillGeneratorMappings(db, contextIds);
  const configs = contextIds.length
    ? await db<
        {
          context_id: string;
          version_id: string;
          sealed: boolean;
          digest_valid: boolean;
          active: boolean;
          revoked: boolean;
        }[]
      >`
    SELECT g.context_id,g.parameters->>'parentQuestionVersionId' AS version_id,
      g.status='SEALED' AS sealed,g.digest=irt_compute.payload_digest(g.parameters) AS digest_valid,
      bool_or(a.revoked_at IS NULL AND a.approved_digest=g.digest) AS active,
      bool_or(a.revoked_at IS NOT NULL) AS revoked
    FROM irt_compute.generator_configs g
    LEFT JOIN configuration_approvals a ON a.generator_config_id=g.id
      AND a.scope->>'contextId'=g.context_id::text AND a.scope->>'ecosystem'='DRILL'
    WHERE g.context_id=ANY(${contextIds}::uuid[]) AND g.parameters->>'serviceContract'='generator-service-v2'
      AND g.parameters->>'parentQuestionVersionId'=ANY(${versions.map((v) => v.questionVersionId)}::text[])
    GROUP BY g.id`
    : [];
  return packages.map(({ isDemo, purpose, scopeOk, policyOk, approvalOk, anchorIds, ...pack }) => {
    const blockers = [];
    if (pack.status !== 'PUBLISHED') blockers.push('DRILL_SOURCE_NOT_PUBLISHED');
    if (isDemo || purpose !== 'REGULAR') blockers.push('DRILL_SOURCE_NOT_REGULAR');
    if (!scopeOk || !pack.variantArmId) blockers.push('DRILL_SOURCE_CONTEXT_UNAVAILABLE');
    if (!approvalOk) blockers.push('DRILL_SOURCE_CURRICULUM_APPROVAL_REQUIRED');
    if (!policyOk) blockers.push('DRILL_SOURCE_SCORING_POLICY_REQUIRED');
    const source = versions.filter((v) => v.packageId === pack.id);
    if (source.length !== 10) blockers.push('DRILL_SOURCE_COUNT_INVALID');
    if (new Set(source.map((i) => i.familyId)).size !== source.length)
      blockers.push('DRILL_SOURCE_DUPLICATE_FAMILY');
    if (
      anchorIds?.length !== 3 ||
      new Set(anchorIds).size !== 3 ||
      anchorIds.some((anchor) => !source.some((i) => i.questionVersionId === anchor))
    )
      blockers.push('DRILL_SOURCE_ANCHORS_UNAPPROVED');
    const items = source.map(
      ({
        packageId: _packageId,
        levelId,
        kind,
        usage,
        contentOk,
        taxonomyOk,
        rubricOk,
        ...item
      }) => {
        const issues = [];
        if (kind !== 'ORIGINAL') issues.push('DRILL_ITEM_NOT_ORIGINAL');
        if (levelId !== pack.levelId || usage !== 'DRILL') issues.push('DRILL_ITEM_LEVEL_MISMATCH');
        if (!contentOk || !taxonomyOk) issues.push('DRILL_ITEM_CONTENT_OR_TAXONOMY_INCOMPLETE');
        if (!rubricOk) issues.push('DRILL_ITEM_RUBRIC_NOT_SEALED');
        const matches = mappings.filter(
          (m) =>
            m.original_id === item.questionVersionId &&
            m.family_id === item.familyId &&
            m.context_id === pack.contextId &&
            m.rubric_id === item.rubricVersionId,
        );
        const current = matches.length === 1 ? matches[0] : undefined;
        const params = current?.parameters;
        const version = current?.config_version;
        const mapping: Mapping | null =
          current &&
          params &&
          typeof version === 'number' &&
          typeof params.sourceFingerprint === 'string' &&
          typeof params.originalHash === 'string' &&
          typeof params.originalVersion === 'number' &&
          (params.mode === 'NUMERIC' || params.mode === 'CONCEPTUAL_STOCK')
            ? {
                approvalId: current.id,
                configId: current.config_id,
                configVersion: version,
                configDigest: current.approved_digest,
                mode: params.mode,
                sourceFingerprint: params.sourceFingerprint,
                originalHash: params.originalHash,
                originalVersion: params.originalVersion,
                mediaProfile: params.mediaProfile ?? null,
              }
            : null;
        if (!anchorIds?.includes(item.questionVersionId) && !mapping) {
          const registrations = configs.filter(
            (config) =>
              config.version_id === item.questionVersionId && config.context_id === pack.contextId,
          );
          const sealed = registrations.filter((config) => config.sealed);
          const matching = sealed.filter((config) => config.digest_valid);
          if (matches.length > 1) issues.push('DRILL_FOCAL_CONFIG_AMBIGUOUS');
          else if (!registrations.length) issues.push('DRILL_FOCAL_CONFIG_MISSING');
          else if (!sealed.length) issues.push('DRILL_FOCAL_CONFIG_NOT_SEALED');
          else if (!matching.length) issues.push('DRILL_FOCAL_CONFIG_DIGEST_MISMATCH');
          else if (matching.some((config) => config.active))
            issues.push('DRILL_FOCAL_MAPPING_PIN_MISMATCH');
          else if (matching.some((config) => config.revoked))
            issues.push('DRILL_FOCAL_CONFIG_APPROVAL_REVOKED');
          else issues.push('DRILL_FOCAL_SEALED_CONFIG_APPROVAL_REQUIRED');
        }
        return {
          ...item,
          mapping: anchorIds?.includes(item.questionVersionId) ? null : mapping,
          blockers: issues,
        };
      },
    );
    const sourceDigest = digest({
      sourcePackage: pack,
      anchorIds: anchorIds ?? [],
      items: items.map(({ blockers: _issues, ...item }) => item),
    });
    return { ...pack, anchorIds: anchorIds ?? [], items, blockers, sourceDigest };
  });
}

export function assertDrillSource(
  source: Source | undefined,
  sourceDigest: string,
): asserts source is Source {
  if (!source || source.sourceDigest !== sourceDigest)
    throw new ConflictException({
      code: 'DRILL_SOURCE_CHANGED',
      detail: 'Muat ulang preflight paket Drill.',
    });
  const blockers = [...source.blockers, ...source.items.flatMap((item) => item.blockers)];
  if (blockers.length)
    throw new ConflictException({
      code: 'DRILL_SOURCE_BLOCKED',
      detail: [...new Set(blockers)].join(', '),
    });
}

export function createDrillManifest(
  source: Source,
  anchorIds: string[],
  focalIds: string[],
  runtime: DrillRuntimePin,
): DrillVariantManifest {
  const focal = source.items.filter((item) => !source.anchorIds.includes(item.questionVersionId));
  const matches = (supplied: string[], expected: string[]) =>
    supplied.length === expected.length &&
    new Set(supplied).size === expected.length &&
    expected.every((id) => supplied.includes(id));
  if (
    !matches(anchorIds, source.anchorIds) ||
    !matches(
      focalIds,
      focal.map((item) => item.questionVersionId),
    )
  )
    throw new ConflictException({
      code: 'DRILL_VARIANT_ROSTER_MISMATCH',
      detail: 'Pilih 3 anchor yang disetujui dan 7 focal dari paket sumber.',
    });
  const manifest: Omit<DrillVariantManifest, 'manifestDigest'> = {
    contractVersion: 'generator-service-v2',
    ecosystem: 'DRILL',
    dimension: 'LEVEL',
    armKind: 'VARIANT',
    sourcePackageId: source.id,
    sourcePackageVersion: source.packageVersion,
    sourceDigest: source.sourceDigest,
    levelId: source.levelId,
    contextId: source.contextId,
    contextRevision: source.contextRevision,
    policyVersionId: source.policyVersionId,
    originalRevisionId: source.originalRevisionId,
    variantArmId: source.variantArmId,
    blueprintVersionId: source.blueprintVersionId,
    runtime,
    items: source.items.map(({ blockers: _blockers, ...item }) => ({
      ...item,
      role: anchorIds.includes(item.questionVersionId) ? 'ANCHOR' : 'FOCAL',
      seed: item.mapping?.mode === 'NUMERIC' ? randomInt(1, 1000000001) : null,
    })),
  };
  return { ...manifest, manifestDigest: digest(manifest) };
}
