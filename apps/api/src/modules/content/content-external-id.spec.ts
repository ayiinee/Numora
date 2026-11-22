import { describe, expect, it } from 'vitest';
import { contentExternalId } from './content-external-id';

describe('contentExternalId', () => {
  it('keeps imported identity as source of truth', () => {
    expect(contentExternalId('Q-imported', 'Q-source', 'question-id', [])).toBe('Q-imported');
  });

  it('uses generator media identity when import identity is absent', () => {
    expect(
      contentExternalId(undefined, 'Q-source', 'question-id', [{ externalId: 'GEN-image' }]),
    ).toBe('GEN-image');
  });

  it('falls back to source identity when media identities disagree', () => {
    expect(
      contentExternalId(undefined, 'Q-source', 'question-id', [
        { externalId: 'GEN-a' },
        { externalId: 'GEN-b' },
      ]),
    ).toBe('Q-source');
  });
});
