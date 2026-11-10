import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateInput } from '../packages/contracts/irt-calibration-v1/validate.mjs';

const root = new URL('../packages/testing/fixtures/irt-delivery-v1/', import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
test('canonical handoff fixture bytes and research boundaries remain frozen', () => {
  const manifest = read('small/manifest.json');
  assert.equal(manifest.inputDigests, 'UNBOUND_UNTIL_POSTGRES_FREEZE');
  assert.equal(manifest.productionApproved, false);
  for (const [name, pin] of Object.entries(manifest.files))
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('small/' + name, root)))
        .digest('hex'),
      pin,
    );
  assert.deepEqual(
    read('recipe.json').cases.map((c) => c.perArm),
    [
      [1000, 1000],
      [1000, 1000, 100],
    ],
  );
});
for (const [name, arms] of [
  ['two-arm', 2],
  ['three-arm-partial', 3],
])
  test(`${name}: all formats, common anchors and complete coverage`, () => {
    const value = read('small/' + name + '.input.json');
    validateInput(value);
    assert.equal(value.respondents.length, arms * 2);
    assert.equal(value.responses.length, arms * 60);
    assert.deepEqual(
      new Set(value.items.map((i) => i.questionType)),
      new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE_MULTIPLE_ANSWER', 'CATEGORY']),
    );
    assert.ok(
      value.packages.every((p) =>
        value.anchorQuestionVersionIds.every((q) => p.questionVersionIds.includes(q)),
      ),
    );
    assert.equal(value.comparisons.length, 0);
    assert.equal(value.policies.comparison, null);
  });
