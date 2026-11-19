import { describe, expect, it } from 'vitest';
import { formatTryoutAnswer } from './tryout-pdf';

describe('formatTryoutAnswer', () => {
  it('formats supported Tryout answer shapes', () => {
    expect(formatTryoutAnswer({ optionId: 'A' })).toBe('A');
    expect(formatTryoutAnswer({ optionIds: ['A', 'C'] })).toBe('A, C');
    expect(formatTryoutAnswer({ categoryByStatementId: { s1: 'TRUE', s2: 'FALSE' } })).toBe(
      's1: TRUE; s2: FALSE',
    );
  });

  it('handles missing answer safely', () => {
    expect(formatTryoutAnswer(null)).toBe('—');
  });
});
