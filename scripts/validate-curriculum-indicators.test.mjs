import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadCurriculumIndicators,
  semanticDigest,
  validateCurriculumIndicators,
} from './validate-curriculum-indicators.mjs';

const fixture = await loadCurriculumIndicators();
const copy = () => structuredClone(fixture);
const check = ({ proposal, master }) => validateCurriculumIndicators(proposal, master);

test('preserves 23 indicators, 50 levels and four academic review issues without seed approval', () => {
  const result = check(fixture);
  assert.deepEqual(result, {
    valid: true,
    status: 'DRAFT',
    readyForSeed: false,
    indicators: 23,
    subchapterLevels: 50,
    openReviewItems: ['CURR-REVIEW-001', 'CURR-REVIEW-002', 'CURR-REVIEW-003', 'CURR-REVIEW-004'],
  });
});
test('rejects changing the extraction into READY, academic approval or executable seed input', () => {
  for (const change of [
    { status: 'READY' },
    { approvalStatus: 'APPROVED' },
    { usage: 'SEED_INPUT' },
  ]) {
    const data = copy();
    Object.assign(data.proposal, change);
    assert.throws(() => check(data), /review-only/);
  }
});
test('detects canonical master drift before allowing mapping review', () => {
  const data = copy();
  data.master.chapters[0].name += ' changed';
  assert.throws(() => check(data), /Canonical master changed/);
});
test('rejects mismatched chapter/subchapter scope', () => {
  const data = copy();
  data.proposal.competencies[0].chapterCode = 'CH-ALG';
  assert.throws(() => check(data), /canonical scope/);
});
test('rejects duplicate or missing recovered indicators', () => {
  const duplicate = copy();
  duplicate.proposal.competencies[1] = duplicate.proposal.competencies[0];
  assert.throws(() => check(duplicate), /duplicate indicator/);
  const missing = copy();
  missing.proposal.competencies.pop();
  assert.throws(() => check(missing), /23 recovered/);
});
test('rejects missing, duplicate and out-of-range levels', () => {
  const missing = copy();
  missing.proposal.levels.pop();
  assert.throws(() => check(missing), /50 recovered/);
  const duplicate = copy();
  duplicate.proposal.levels[1] = duplicate.proposal.levels[0];
  assert.throws(() => check(duplicate), /duplicate level/);
  const outside = copy();
  outside.proposal.levels[0].levelNumber = 6;
  assert.throws(() => check(outside), /duplicate level/);
});
test('rejects inferred difficulty mappings and silently moved IND-022', () => {
  const difficulty = copy();
  difficulty.proposal.levels[0].difficultyCriteria = { difficulty: 'EASY' };
  assert.throws(() => check(difficulty), /do not infer/);
  const placement = copy();
  placement.proposal.competencies.find((r) => r.code === 'IND-022').subchapterCode = 'SC-PELUANG';
  assert.throws(() => check(placement), /IND-022/);
});
test('does not permit academic issue closure to be inferred from the name-only reconciliation', () => {
  const data = copy();
  data.proposal.reconciliation.issues[3].state = 'RESOLVED';
  assert.throws(() => check(data), /academic source issues OPEN/);
});
test('retains source attribution and detects silent edits to indicator descriptions', () => {
  const source = copy();
  source.proposal.source.revisionId = '';
  assert.throws(() => check(source), /provenance/);
  const row = copy();
  row.proposal.competencies[0].sourceDescription += ' altered';
  assert.throws(() => check(row), /Recovered source rows changed/);
});
test('pins canonical display names while preserving the original source alias', () => {
  const data = copy();
  data.proposal.reconciliation.chapterDisplayNames.find((r) => r.code === 'CH-GP').canonicalName =
    'Geometri & Pengukuran';
  assert.throws(() => check(data), /canonical chapter names/);
});
test('semantic checksums survive JSON formatting and key-order changes', () => {
  assert.equal(
    semanticDigest({ b: 2, a: { d: 4, c: 3 } }),
    semanticDigest({ a: { c: 3, d: 4 }, b: 2 }),
  );
  assert.deepEqual(check(JSON.parse(JSON.stringify(fixture, null, 2))), check(fixture));
});
test('CLI refuses apply arguments before accepting any database or cloud operation', () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./validate-curriculum-indicators.mjs', import.meta.url)), '--apply'],
    { encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Offline validation only/);
});
