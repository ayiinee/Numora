// Main-owned stock registration. No content, rubric or approval mutations.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const postgres = require('postgres');
const { requireGeneratorMain } = require('@tka/irt-orchestration');

export async function registerGeneratorStockInventory(client, manifest, apply = false) {
  if (
    manifest?.serviceContract !== 'generator-service-v2' ||
    !Array.isArray(manifest.items) ||
    !manifest.items.length ||
    manifest.items.length > 86
  )
    throw new Error('INVALID_STOCK_MANIFEST');
  await requireGeneratorMain(client);
  return client.begin(apply ? '' : 'read only', async (tx) => {
    const result = [],
      seen = new Set();
    for (const item of manifest.items) {
      const { familyId, parentQuestionVersionId, version, definition } = item;
      if (
        !Number.isSafeInteger(version) ||
        version < 1 ||
        !Array.isArray(definition?.items) ||
        definition.items.length < 1 ||
        definition.items.length > 4 ||
        seen.has(`${familyId}:${version}`)
      )
        throw new Error('INVALID_STOCK_INVENTORY');
      seen.add(`${familyId}:${version}`);
      const ids = new Set();
      for (const [index, stock] of definition.items.entries()) {
        if (
          stock.stockIndex !== index + 1 ||
          typeof stock.variantId !== 'string' ||
          !stock.variantId ||
          ids.has(stock.variantId) ||
          !Number.isSafeInteger(stock.stockVersion) ||
          stock.stockVersion < 1 ||
          !/^[a-f0-9]{64}$/.test(stock.contentHash)
        )
          throw new Error('INVALID_STOCK_ITEM');
        ids.add(stock.variantId);
      }
      const [source] =
        await tx`select q.id from question_versions q join question_variants v on v.id=q.variant_id where q.id=${parentQuestionVersionId} and v.question_id=${familyId} and v.kind='ORIGINAL'`;
      if (!source) throw new Error('STOCK_ORIGINAL_MAPPING_MISMATCH');
      if (apply) await tx`select pg_advisory_xact_lock(hashtextextended(${familyId},5))`;
      const [digest] =
        await tx`select irt_compute.payload_digest(${JSON.stringify(definition)}::jsonb) as value`;
      let [row] =
        await tx`select * from generator_stock_sets where family_id=${familyId} and version=${version}`;
      if (
        row &&
        (row.original_question_version_id !== parentQuestionVersionId ||
          row.digest !== digest.value)
      )
        throw new Error('STOCK_REGISTRATION_CONFLICT');
      if (apply && !row)
        [row] =
          await tx`insert into generator_stock_sets(family_id,original_question_version_id,version,digest,definition,item_count) values(${familyId},${parentQuestionVersionId},${version},${digest.value},${JSON.stringify(definition)}::jsonb,${definition.items.length}) returning *`;
      result.push({
        familyId,
        parentQuestionVersionId,
        version,
        digest: digest.value,
        stockSetId: row?.id ?? null,
        status: row ? 'REGISTERED' : 'DRY_RUN',
      });
    }
    return { serviceContract: 'generator-service-v2', applied: apply, items: result };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file)
    throw new Error('Usage: node scripts/register-generator-stock.mjs manifest.json [--apply]');
  const url = new URL(process.env.DATABASE_URL);
  if (apply && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('THIS_STAGE_APPLIES_ONLY_TO_LOCAL_DATABASE');
  const client = postgres(url.toString(), { max: 1 });
  try {
    console.log(
      JSON.stringify(
        await registerGeneratorStockInventory(
          client,
          JSON.parse(await readFile(file, 'utf8')),
          apply,
        ),
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}
