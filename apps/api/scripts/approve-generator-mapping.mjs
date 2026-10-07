// Main-owned operator workflow. Approval requires an explicit reviewed manifest.
// Default dry-run; this never registers/writes a compute configuration.
import { readFile } from 'node:fs/promises';
import { getDatabase, closeDatabaseConnection } from '@tka/database';
import { requireGeneratorMain } from '@tka/irt-orchestration';
const file = process.argv[2];
if (!file)
  throw new Error('Usage: node approve-generator-mapping.mjs reviewed-manifest.json [--apply]');
const manifest = JSON.parse(await readFile(file, 'utf8'));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (
  manifest.serviceContract !== 'generator-service-v1' ||
  !uuid.test(manifest.actorId) ||
  typeof manifest.reviewReference !== 'string' ||
  !manifest.reviewReference.trim() ||
  !Array.isArray(manifest.items) ||
  !manifest.items.length ||
  manifest.items.length > 100
)
  throw new Error('Invalid reviewed manifest');
const { client } = getDatabase();
try {
  await requireGeneratorMain(client);
  const results = await client.begin(async (tx) => {
    const [actor] =
      await tx`SELECT id FROM users WHERE id=${manifest.actorId} AND role='ADMIN' AND status='ACTIVE' AND admin_role IN ('SUPER_ADMIN','CONTENT_DATA_MODERATION') FOR SHARE`;
    if (!actor) throw new Error('Active Content Admin reviewer required');
    const output = [];
    for (const item of manifest.items) {
      if (
        !uuid.test(item.configId) ||
        !uuid.test(item.originalQuestionVersionId) ||
        !uuid.test(item.contextId) ||
        !uuid.test(item.rubricVersionId) ||
        !/^[a-f0-9]{64}$/.test(item.digest)
      )
        throw new Error('Invalid mapping pin');
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${item.configId},4))`;
      const [g] =
        await tx`SELECT g.id,c.ecosystem FROM irt_compute.generator_configs g JOIN measurement_contexts c ON c.id=g.context_id
        JOIN question_versions q ON q.id=${item.originalQuestionVersionId} JOIN question_variants v ON v.id=q.variant_id
        JOIN scoring_rubric_versions r ON r.id=q.scoring_rubric_version_id
        WHERE g.id=${item.configId} AND g.status='SEALED' AND g.digest=${item.digest} AND g.digest=irt_compute.payload_digest(g.parameters)
        AND g.context_id=${item.contextId} AND g.parameters->>'contextId'=${item.contextId}
        AND g.parameters->>'serviceContract'='generator-service-v1' AND g.parameters->>'parentQuestionVersionId'=q.id::text
        AND g.parameters->>'familyId'=v.question_id::text AND v.kind='ORIGINAL' AND r.id=${item.rubricVersionId} AND r.status='SEALED'
        AND g.parameters->>'rubricVersionId'=r.id::text AND r.question_type=q.question_type::text FOR SHARE OF q,r`;
      if (!g) throw new Error('Mapping/config/source/rubric/context pin mismatch');
      let [a] =
        await tx`SELECT id FROM configuration_approvals WHERE generator_config_id=${g.id} AND revoked_at IS NULL AND approved_digest=${item.digest} AND scope->>'contextId'=${item.contextId}`;
      if (!a && process.argv.includes('--apply')) {
        [a] =
          await tx`INSERT INTO configuration_approvals(generator_config_id,approved_digest,scope,approved_by_user_id,approved_at)
          VALUES(${g.id},${item.digest},${JSON.stringify({ ecosystem: g.ecosystem, contextId: item.contextId, reviewReference: manifest.reviewReference })}::text::jsonb,${actor.id},clock_timestamp()) RETURNING id`;
        await tx`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(${actor.id},'GENERATOR_MAPPING_APPROVED','configuration_approval',${a.id})`;
      }
      output.push({
        configId: g.id,
        approvalId: a?.id ?? null,
        applied: process.argv.includes('--apply'),
      });
    }
    return output;
  });
  console.log(JSON.stringify({ serviceContract: 'generator-service-v1', items: results }, null, 2));
} finally {
  await closeDatabaseConnection();
}
