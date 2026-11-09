// Contract boundary only. Does not run calibration, prove scientific gates, or publish grades.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(
  process.env.NUMORA_REPO_PATH
    ? path.join(process.env.NUMORA_REPO_PATH, 'package.json')
    : new URL('../../../package.json', import.meta.url),
);
const Ajv2020 = require('ajv/dist/2020.js').default;
const addFormats = require('ajv-formats').default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
for (const name of ['common', 'input', 'result']) {
  ajv.addSchema(JSON.parse(readFileSync(new URL(`${name}.schema.json`, import.meta.url), 'utf8')));
}
const schemas = Object.fromEntries(
  ['input', 'result'].map((name) => [name, ajv.getSchema(`urn:numora:irt-calibration-v1:${name}`)]),
);
const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const pk = (p) => `${p.packageId}:${p.packageVersion}`;
const setEqual = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const unique = (rows, key) => {
  const result = new Map();
  for (const row of rows) {
    const id = typeof key === 'function' ? key(row) : row[key];
    assert(!result.has(id), 'IRT_DUPLICATE_ID');
    result.set(id, row);
  }
  return result;
};
const cents = (v) => {
  const [a, b = ''] = v.split('.');
  return BigInt(a) * 100n + BigInt(b.padEnd(2, '0'));
};
const abs = (v) => (v < 0n ? -v : v);
const exactCoverage = (rows, expected, key) => {
  const found = unique(rows, key);
  assert(setEqual(new Set(found.keys()), new Set(expected.keys())), 'IRT_COVERAGE_INVALID');
  return found;
};
function shape(name, value) {
  assert(schemas[name](value), 'IRT_SCHEMA_INVALID');
}
function quality(row) {
  const passed = row.measurementState === 'CALIBRATED';
  assert(
    !passed ||
      (row.quality.gate === 'PASSED' &&
        row.quality.checks.length > 0 &&
        row.quality.checks.every((c) => c.status === 'PASS')),
    'IRT_RESULT_STATE_INVALID',
  );
  assert(
    passed ? row.reasonCodes.length === 0 : row.reasonCodes.length > 0,
    'IRT_RESULT_STATE_INVALID',
  );
  unique(row.quality.checks, 'code');
}

export function validateInput(input) {
  shape('input', input);
  const drill = input.ecosystem === 'DRILL',
    c = input.context,
    w = input.window;
  assert(
    drill
      ? c.scope === 'LEVEL' &&
          c.chapterId !== null &&
          c.indicatorId !== null &&
          c.levelId !== null &&
          c.batchId === null &&
          c.scaleId === `L:${c.chapterId}:${c.indicatorId}:${c.levelId}`
      : c.scope === 'TRYOUT_BATCH' &&
          c.batchId !== null &&
          c.levelId === null &&
          c.chapterId === null &&
          c.indicatorId === null &&
          c.scaleId === `T:${c.batchId}`,
    'IRT_CONTEXT_MISMATCH',
  );
  const start = Date.parse(w.startsAt),
    close = Date.parse(w.collectionCutoffAt),
    grade = Date.parse(w.gradingCutoffAt);
  assert(
    start <= close &&
      close <= grade &&
      (drill
        ? w.resultDueAt === null
        : w.resultDueAt !== null &&
          Date.parse(w.resultDueAt) >= close &&
          Date.parse(w.resultDueAt) <= close + 72 * 3600000),
    'IRT_WINDOW_INVALID',
  );
  const items = unique(input.items, 'questionVersionId'),
    packages = unique(input.packages, pk);
  const arms = unique(input.packages, 'armId'),
    people = unique(input.respondents, 'respondentId');
  unique(input.respondents, 'attemptId');
  unique(input.responses, 'attemptItemId');
  unique(input.comparisons, 'comparisonId');
  assert(input.anchorQuestionVersionIds.length === (drill ? 3 : 5), 'IRT_ANCHOR_INVALID');
  assert(
    input.packages.filter((p) => p.armKind === 'ORIGINAL').length === 1 &&
      input.packages.some((p) => p.armKind === 'VARIANT'),
    'IRT_PACKAGE_INVALID',
  );
  const used = new Set();
  for (const item of items.values()) {
    const original = items.get(item.originalQuestionVersionId);
    assert(
      original &&
        original.originalQuestionVersionId === original.questionVersionId &&
        original.familyId === item.familyId &&
        original.questionType === item.questionType,
      'IRT_LINEAGE_INVALID',
    );
    assert(
      cents(item.maxPoints) > 0n &&
        (item.questionType === 'SINGLE_CHOICE'
          ? item.modelFamily === '2PL' && item.maximumScoreCategory === 1
          : item.modelFamily === 'GPCM'),
      'IRT_SCORE_INVALID',
    );
  }
  for (const p of packages.values()) {
    assert(
      p.questionVersionIds.length === (drill ? 10 : 30) &&
        input.anchorQuestionVersionIds.every((id) => p.questionVersionIds.includes(id)),
      'IRT_PACKAGE_INVALID',
    );
    const families = new Set();
    for (const id of p.questionVersionIds) {
      const it = items.get(id);
      assert(it, 'IRT_INVALID_REFERENCE');
      assert(!families.has(it.familyId), 'IRT_PACKAGE_INVALID');
      families.add(it.familyId);
      used.add(id);
      if (p.armKind === 'ORIGINAL')
        assert(it.originalQuestionVersionId === id, 'IRT_LINEAGE_INVALID');
    }
  }
  assert(setEqual(used, new Set(items.keys())), 'IRT_COVERAGE_INVALID');
  if (drill || input.policies.scoreMapping === null) {
    assert(
      input.referencePackage === null &&
        input.referenceQuestionVersionIds.length === 0 &&
        (!drill || input.policies.scoreMapping === null),
      'IRT_POLICY_MISMATCH',
    );
  } else {
    const p = input.referencePackage && packages.get(pk(input.referencePackage));
    assert(
      p?.armKind === 'ORIGINAL' &&
        input.referenceQuestionVersionIds.length > 0 &&
        input.referenceQuestionVersionIds.every(
          (id) =>
            p.questionVersionIds.includes(id) && items.get(id).contentState === 'CONTENT_VALID',
        ),
      'IRT_POLICY_MISMATCH',
    );
  }
  assert(
    input.comparisons.length === 0 || input.policies.comparison !== null,
    'IRT_POLICY_MISMATCH',
  );
  unique(input.comparisons, (x) => `${x.originalQuestionVersionId}:${x.variantQuestionVersionId}`);
  for (const pair of input.comparisons) {
    const a = items.get(pair.originalQuestionVersionId),
      b = items.get(pair.variantQuestionVersionId);
    assert(
      a &&
        b &&
        a.questionVersionId !== b.questionVersionId &&
        b.originalQuestionVersionId === a.questionVersionId &&
        a.familyId === b.familyId &&
        !input.anchorQuestionVersionIds.includes(a.questionVersionId) &&
        !input.anchorQuestionVersionIds.includes(b.questionVersionId),
      'IRT_LINEAGE_INVALID',
    );
  }
  const expectedRows = new Set();
  for (const r of people.values()) {
    const p = packages.get(pk(r));
    assert(p && arms.has(r.assignedArmId), 'IRT_IDENTITY_MISMATCH');
    assert(r.deliveredArmId === p.armId && r.batchId === c.batchId, 'IRT_IDENTITY_MISMATCH');
    const fallback = r.deliveryMode === 'ORIGINAL_FALLBACK';
    assert(
      fallback
        ? drill &&
            p.armKind === 'ORIGINAL' &&
            arms.get(r.assignedArmId).armKind === 'VARIANT' &&
            r.assignedArmId !== r.deliveredArmId
        : r.assignedArmId === r.deliveredArmId,
      'IRT_ASSIGNMENT_INVALID',
    );
    assert(
      Date.parse(r.submittedAt) >= start &&
        Date.parse(r.submittedAt) <= close &&
        Date.parse(r.gradedAt) >= Date.parse(r.submittedAt) &&
        Date.parse(r.gradedAt) <= grade,
      'IRT_WINDOW_INVALID',
    );
    for (const id of p.questionVersionIds) expectedRows.add(`${r.attemptId}:${id}`);
  }
  const rows = unique(input.responses, (r) => `${r.attemptId}:${r.questionVersionId}`);
  assert(setEqual(new Set(rows.keys()), expectedRows), 'IRT_COVERAGE_INVALID');
  for (const row of rows.values()) {
    const r = people.get(row.respondentId),
      it = items.get(row.questionVersionId);
    assert(
      r && r.attemptId === row.attemptId && it && it.rubricVersionId === row.rubricVersionId,
      'IRT_IDENTITY_MISMATCH',
    );
    const scored = ['RESPONDED', 'OMITTED'].includes(row.responseState);
    assert(
      scored
        ? row.scoreCategory !== null &&
            row.scoreCategory <= it.maximumScoreCategory &&
            row.awardedPoints !== null &&
            cents(row.awardedPoints) <= cents(it.maxPoints) &&
            abs(
              cents(row.awardedPoints) * BigInt(it.maximumScoreCategory) -
                BigInt(row.scoreCategory) * cents(it.maxPoints),
            ) *
              2n <=
              BigInt(it.maximumScoreCategory)
        : row.scoreCategory === null && row.awardedPoints === null,
      'IRT_SCORE_INVALID',
    );
    assert(
      row.responseState !== 'OMITTED' ||
        (row.scoreCategory === 0 && cents(row.awardedPoints) === 0n),
      'IRT_SCORE_INVALID',
    );
    assert(
      row.exposureState === 'KNOWN_PRIOR'
        ? row.priorExposureSources.length > 0
        : row.priorExposureSources.length === 0,
      'IRT_ELIGIBILITY_INVALID',
    );
    const reason = (name) => row.eligibilityReasons.includes(name);
    assert(
      r.firstValidAttempt || (!row.includedInCalibration && reason('RETRY')),
      'IRT_ELIGIBILITY_INVALID',
    );
    assert(
      r.deliveryMode !== 'ORIGINAL_FALLBACK' ||
        (!row.includedInCalibration && reason('ARM_CROSSOVER')),
      'IRT_ELIGIBILITY_INVALID',
    );
    assert(
      scored ||
        (!row.includedInCalibration &&
          reason(row.responseState === 'INVALID' ? 'TECHNICAL_INVALID' : 'NOT_PRESENTED')),
      'IRT_ELIGIBILITY_INVALID',
    );
    assert(
      it.contentState !== 'INVALID' || (!row.includedInCalibration && reason('CONTENT_INVALID')),
      'IRT_ELIGIBILITY_INVALID',
    );
    assert(
      row.exposureState !== 'UNKNOWN' || reason('UNKNOWN_EXPOSURE'),
      'IRT_ELIGIBILITY_INVALID',
    );
    if (row.includedInCalibration) {
      assert(reason('FIRST_VALID_ATTEMPT'), 'IRT_ELIGIBILITY_INVALID');
      assert(
        ![
          'RETRY',
          'ARM_CROSSOVER',
          'TECHNICAL_INVALID',
          'NOT_PRESENTED',
          'CONTENT_INVALID',
          'PRIOR_EXPOSURE',
        ].some(reason),
        'IRT_ELIGIBILITY_INVALID',
      );
      if (row.exposureState === 'KNOWN_PRIOR')
        assert(
          drill &&
            !row.priorExposureSources.includes('DRILL') &&
            reason('BETA_PRIOR_EXPOSURE_ALLOWED'),
          'IRT_ELIGIBILITY_INVALID',
        );
    }
    if (reason('BETA_PRIOR_EXPOSURE_ALLOWED'))
      assert(drill && row.exposureState === 'KNOWN_PRIOR', 'IRT_ELIGIBILITY_INVALID');
  }
  return input;
}

export function validateResult(output, input, expectedDispatch) {
  validateInput(input);
  shape('result', output);
  assert(
    expectedDispatch &&
      typeof expectedDispatch.executionId === 'string' &&
      Number.isSafeInteger(expectedDispatch.dispatchGeneration) &&
      expectedDispatch.dispatchGeneration >= 1 &&
      output.executionId === expectedDispatch.executionId &&
      output.dispatchGeneration === expectedDispatch.dispatchGeneration,
    'IRT_STALE_EXECUTION',
  );
  for (const k of ['requestId', 'snapshotId', 'inputDigest', 'calibrationId', 'context'])
    assert(same(output[k], input[k]), 'IRT_INPUT_MISMATCH');
  assert(
    Date.parse(output.completedAt) >= Date.parse(input.window.gradingCutoffAt),
    'IRT_WINDOW_INVALID',
  );
  if (output.executionStatus === 'FAILED') {
    assert(output.outcome === null && output.failure !== null, 'IRT_RESULT_STATE_INVALID');
    assert(
      output.failure.retryable ===
        ['TIMEOUT', 'DEPENDENCY_UNAVAILABLE'].includes(output.failure.code),
      'IRT_RESULT_STATE_INVALID',
    );
    return output;
  }
  assert(output.failure === null && output.outcome !== null, 'IRT_RESULT_STATE_INVALID');
  const o = output.outcome,
    items = new Map(input.items.map((i) => [i.questionVersionId, i]));
  const packs = new Map(input.packages.map((p) => [pk(p), p]));
  const results = exactCoverage(o.items, items, 'questionVersionId');
  const packageResults = exactCoverage(o.packages, packs, pk);
  const comparisons = exactCoverage(
    o.comparisons,
    new Map(input.comparisons.map((c) => [c.comparisonId, c])),
    'comparisonId',
  );
  const people = new Map(
    (input.ecosystem === 'TRYOUT' ? input.respondents : []).map((r) => [r.attemptId, r]),
  );
  exactCoverage(o.respondents, people, 'attemptId');
  unique(o.respondents, 'respondentId');
  const counts = new Map(input.items.map((i) => [i.questionVersionId, 0]));
  for (const r of input.responses)
    if (r.includedInCalibration)
      counts.set(r.questionVersionId, counts.get(r.questionVersionId) + 1);
  for (const row of results.values()) {
    const it = items.get(row.questionVersionId);
    quality(row);
    assert(
      row.rubricVersionId === it.rubricVersionId && row.modelFamily === it.modelFamily,
      'IRT_IDENTITY_MISMATCH',
    );
    assert(
      row.eligibleRespondentCount === counts.get(row.questionVersionId),
      'IRT_ELIGIBILITY_INVALID',
    );
    const calibrated = row.measurementState === 'CALIBRATED',
      p = row.parameters;
    assert(
      calibrated
        ? p !== null && it.contentState === 'CONTENT_VALID' && row.eligibleRespondentCount > 0
        : p === null,
      'IRT_PARAMETERS_INVALID',
    );
    if (p !== null)
      assert(
        it.modelFamily === '2PL'
          ? p.difficultyB !== null && p.difficultyStandardError !== null && p.steps.length === 0
          : p.difficultyB === null &&
              p.difficultyStandardError === null &&
              p.steps.length === it.maximumScoreCategory &&
              p.steps.every((s, i) => s.step === i + 1),
        'IRT_PARAMETERS_INVALID',
      );
  }
  const anchorsPassed = input.anchorQuestionVersionIds.every(
    (id) => results.get(id).measurementState === 'CALIBRATED',
  );
  for (const row of packageResults.values()) {
    quality(row);
    if (row.measurementState === 'CALIBRATED')
      assert(
        anchorsPassed &&
          packs
            .get(pk(row))
            .questionVersionIds.some((id) => results.get(id).measurementState === 'CALIBRATED'),
        'IRT_RESULT_STATE_INVALID',
      );
  }
  const states = [...packageResults.values()].map((r) => r.measurementState),
    n = states.filter((s) => s === 'CALIBRATED').length;
  const expected =
    n === states.length
      ? 'CALIBRATED'
      : n > 0
        ? 'PARTIAL'
        : states.includes('ANOMALY')
          ? 'ANOMALY'
          : states.includes('NOT_COMPARABLE')
            ? 'NOT_COMPARABLE'
            : 'INSUFFICIENT';
  assert(o.measurementState === expected, 'IRT_RESULT_STATE_INVALID');
  const responseByItem=new Map(input.responses.map(a=>[`${a.attemptId}:${a.questionVersionId}`,a]));
  for (const row of o.respondents) {
    const r = people.get(row.attemptId);
    assert(
      ['respondentId', 'attemptId', 'packageId', 'packageVersion', 'batchId'].every(
        (k) => row[k] === r[k],
      ),
      'IRT_IDENTITY_MISMATCH',
    );
    if (row.status === 'SCORED') {
      assert(
        input.policies.scoreMapping !== null &&
          same(row.scoreMapping, input.policies.scoreMapping) &&
          same(row.referencePackage, input.referencePackage),
        'IRT_POLICY_MISMATCH',
      );
      assert(
        row.theta !== null &&
          row.standardError !== null &&
          row.score !== null &&
          row.usedQuestionVersionIds.length > 0 &&
          row.reasonCodes.length === 0 &&
          packageResults.get(pk(row)).measurementState === 'CALIBRATED',
        'IRT_RESULT_STATE_INVALID',
      );
      const delivered = packs.get(pk(row)).questionVersionIds;
      assert(
        row.usedQuestionVersionIds.every(
          (id) =>
            delivered.includes(id) &&
            results.get(id).measurementState === 'CALIBRATED' &&
            ['RESPONDED','OMITTED'].includes(responseByItem.get(`${row.attemptId}:${id}`)?.responseState),
        ) &&
          input.referenceQuestionVersionIds.every(
            (id) => results.get(id).measurementState === 'CALIBRATED',
          ),
        'IRT_INVALID_REFERENCE',
      );
    } else {
      assert(
        row.theta === null &&
          row.standardError === null &&
          row.score === null &&
          row.scoreMapping === null &&
          row.referencePackage === null &&
          row.usedQuestionVersionIds.length === 0 &&
          row.reasonCodes.length > 0,
        'IRT_RESULT_STATE_INVALID',
      );
      if (row.status === 'UNSCORABLE')
        assert(
          packs
            .get(pk(row))
            .questionVersionIds.every(
              (id) =>
                items.get(id).contentState === 'INVALID' ||
                ['INVALID','NOT_PRESENTED'].includes(responseByItem.get(`${row.attemptId}:${id}`)?.responseState),
            ),
          'IRT_RESULT_STATE_INVALID',
        );
    }
  }
  for (const pair of input.comparisons) {
    const row = comparisons.get(pair.comparisonId),
      source = items.get(pair.originalQuestionVersionId);
    unique(row.metrics, 'name');
    for (const m of row.metrics)
      assert(m.interval.lower <= m.interval.upper, 'IRT_PARAMETERS_INVALID');
    if (['PASS', 'DRIFT'].includes(row.decision)) {
      assert(
        row.decision === 'PASS'
          ? row.reasonCodes.length === 0
          : row.reasonCodes.includes('MATERIAL_DRIFT'),
        'IRT_RESULT_STATE_INVALID',
      );
      assert(
        input.policies.comparison !== null &&
          anchorsPassed &&
          [pair.originalQuestionVersionId, pair.variantQuestionVersionId].every(
            (id) => results.get(id).measurementState === 'CALIBRATED',
          ),
        'IRT_RESULT_STATE_INVALID',
      );
      assert(
        setEqual(
          new Set(row.metrics.map((m) => m.name)),
          new Set(
            source.modelFamily === '2PL'
              ? ['DELTA_B', 'DELTA_LOG_A', 'NORMALIZED_CURVE_GAP']
              : ['DELTA_LOG_A', 'NORMALIZED_CURVE_GAP'],
          ),
        ),
        'IRT_PARAMETERS_INVALID',
      );
    } else assert(row.reasonCodes.length > 0, 'IRT_RESULT_STATE_INVALID');
  }
  return output;
}
