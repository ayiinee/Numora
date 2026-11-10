import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateV1ArtifactShape } from './adoption-v1.js';
const example = (name: string) => JSON.parse(readFileSync(`packages/contracts/irt-calibration-v1/examples/${name}.json`, 'utf8'));
const input = example('tryout-input');
const output = example('tryout-result');
const execution = { executionId: output.executionId, dispatchGeneration: output.dispatchGeneration };
describe('v1 adoption real contract boundary', () => {
  it('accepts nested outcome and derives coverage', () => expect(validateV1ArtifactShape(output, input, execution).attempts.size).toBe(input.respondents.length));
  it('rejects duplicate output attempts', () => {
    const bad = structuredClone(output); bad.outcome.respondents.push(bad.outcome.respondents[0]);
    expect(() => validateV1ArtifactShape(bad, input, execution)).toThrow('IRT_DUPLICATE_ID');
  });
  it('rejects changed identity, stale execution, missing outcome and invented fields', () => {
    expect(() => validateV1ArtifactShape({...output, inputDigest: 'b'.repeat(64)}, input, execution)).toThrow('IRT_INPUT_MISMATCH');
    expect(() => validateV1ArtifactShape(output, input, {...execution, dispatchGeneration: 2})).toThrow('IRT_STALE_EXECUTION');
    expect(() => validateV1ArtifactShape({...output, outcome: null}, input, execution)).toThrow();
    expect(() => validateV1ArtifactShape({...output, respondents: []}, input, execution)).toThrow('IRT_SCHEMA_INVALID');
  });
  it('retains scientific insufficient and not comparable results', () => {
    for (const name of ['tryout-insufficient','tryout-not-comparable']) expect(validateV1ArtifactShape(example(name), input, execution).attempts.size).toBe(input.respondents.length);
  });
});
