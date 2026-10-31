import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const proposalPath = 'docs/data/proposals/drill-indicators.v0.6.json';
const masterPath = 'packages/database/seeds/curriculum-master.json';
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
};
export const semanticDigest = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
const requireRule = (condition, message) => {
  if (!condition) throw new Error(message);
};
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const scope = (row) => `${row.chapterCode}:${row.subchapterCode}`;
const projection = (proposal) => ({
  source: proposal.source,
  competencies: proposal.competencies,
  levels: proposal.levels,
  reviewItems: proposal.reviewItems,
});

/** Offline review artifact validation only: no database, environment or network access. */
export function validateCurriculumIndicators(proposal, master) {
  requireRule(
    proposal?.schemaVersion === 1 &&
      proposal.status === 'DRAFT' &&
      proposal.approvalStatus === 'PENDING_CURRICULUM_REVIEW' &&
      proposal.usage === 'REVIEW_ONLY_NOT_SEED_INPUT',
    'Keep the recovered mapping DRAFT, pending Curriculum review and review-only',
  );
  requireRule(
    proposal.canonicalMaster?.path === masterPath &&
      proposal.canonicalMaster.semanticSha256 === semanticDigest(master),
    'Canonical master changed; reconcile this proposal against its current identities first',
  );
  requireRule(
    proposal.source?.documentId === master.source.documentId &&
      proposal.source.url === master.source.url &&
      nonempty(proposal.source.revisionId) &&
      proposal.source.primaryTabId === 't.0',
    'Keep the original source document, revision and primary tab provenance',
  );
  requireRule(
    proposal.recoveredFrom?.pullRequest === 'https://github.com/ayiinee/Numora/pull/66' &&
      proposal.recoveredFrom.commit === '996714cf96be37ea91f84ce2b9097197f982874a' &&
      proposal.recoveredFrom.path === 'docs/data/curriculum-master.v0.6.json',
    'Keep the immutable PR #66 recovery reference',
  );
  requireRule(
    Array.isArray(proposal.competencies) && proposal.competencies.length === 23,
    'Expected the 23 recovered indicators',
  );
  requireRule(
    Array.isArray(proposal.levels) && proposal.levels.length === 50,
    'Expected the 50 recovered subchapter levels',
  );
  const subchapters = new Set(master.subchapters.map((row) => `${row.chapterCode}:${row.code}`));
  const codes = new Set();
  for (const row of proposal.competencies) {
    requireRule(
      subchapters.has(scope(row)) &&
        Number.isInteger(row.sourceIndicatorNumber) &&
        row.sourceIndicatorNumber >= 1 &&
        row.sourceIndicatorNumber <= 23 &&
        row.code === `IND-${String(row.sourceIndicatorNumber).padStart(3, '0')}` &&
        !codes.has(row.code) &&
        nonempty(row.description) &&
        nonempty(row.sourceDescription) &&
        Number.isInteger(row.sourceTableRow) &&
        row.sourceTableRow > 0 &&
        typeof row.reviewRequired === 'boolean',
      'Invalid or duplicate indicator identity, canonical scope or source attribution',
    );
    codes.add(row.code);
  }
  const levels = new Set();
  for (const row of proposal.levels) {
    const key = `${scope(row)}:${row.levelNumber}`;
    requireRule(
      subchapters.has(scope(row)) &&
        Number.isInteger(row.levelNumber) &&
        row.levelNumber >= 1 &&
        row.levelNumber <= 5 &&
        !levels.has(key) &&
        row.description === null &&
        row.difficultyCriteria === null,
      'Invalid or duplicate level scope; do not infer academic difficulty criteria',
    );
    levels.add(key);
  }
  requireRule(levels.size === subchapters.size * 5, 'Every canonical subchapter needs levels 1–5');
  requireRule(
    Array.isArray(proposal.reviewItems) && proposal.reviewItems.length === 5,
    'Keep all five original source review notes',
  );
  const pending = proposal.reconciliation?.issues;
  requireRule(
    Array.isArray(pending) &&
      pending.length === proposal.reviewItems.length &&
      pending.every(
        (item, index) =>
          item.id === `CURR-REVIEW-${String(index + 1).padStart(3, '0')}` &&
          item.topic === proposal.reviewItems[index].topic &&
          item.state === (index === 4 ? 'CANONICAL_NAME_APPLIED' : 'OPEN'),
      ),
    'Keep academic source issues OPEN; the resolved alias only follows the canonical display name',
  );
  const disputed = proposal.competencies.find((row) => row.code === 'IND-022');
  requireRule(
    disputed?.subchapterCode === 'SC-DATA' && disputed.reviewRequired === true,
    'IND-022 must retain its tentative Data placement and review flag',
  );
  requireRule(
    proposal.reconciliation.chapterDisplayNames?.length === master.chapters.length &&
      master.chapters.every((chapter) =>
        proposal.reconciliation.chapterDisplayNames.some(
          (row) =>
            row.code === chapter.code &&
            row.canonicalName === chapter.name &&
            nonempty(row.sourceName),
        ),
      ),
    'Use current canonical chapter names while preserving source aliases',
  );
  requireRule(
    proposal.recoveredFrom.projectionSha256 === semanticDigest(projection(proposal)),
    'Recovered source rows changed; review provenance instead of silently editing the extraction',
  );
  return {
    valid: true,
    status: 'DRAFT',
    readyForSeed: false,
    indicators: proposal.competencies.length,
    subchapterLevels: proposal.levels.length,
    openReviewItems: pending.filter((item) => item.state === 'OPEN').map((item) => item.id),
  };
}

export async function loadCurriculumIndicators() {
  return {
    proposal: JSON.parse(await readFile(resolve(root, proposalPath), 'utf8')),
    master: JSON.parse(await readFile(resolve(root, masterPath), 'utf8')),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 2)
    throw new Error('Offline validation only; no apply/seed arguments');
  const { proposal, master } = await loadCurriculumIndicators();
  console.log(JSON.stringify(validateCurriculumIndicators(proposal, master), null, 2));
}
