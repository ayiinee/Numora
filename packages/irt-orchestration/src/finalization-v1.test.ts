import { describe, expect, it } from 'vitest';
import { classifyFinalizationRespondent } from './finalization-v1.js';

describe('finalization classifier', () => {
  it('accepts valid scored IRT result', () => expect(classifyFinalizationRespondent({ status: 'SCORED', score: 72.5, theta: .4, standardError: .2 })).toMatchObject({ mode: 'IRT', score: 72.5 }));
  it('keeps unscorable null', () => expect(classifyFinalizationRespondent({ status: 'UNSCORABLE' })).toMatchObject({ mode: 'UNSCORABLE', score: null }));
  it('keeps insufficient and not comparable', () => {
    expect(classifyFinalizationRespondent({ status: 'INSUFFICIENT' }).mode).toBe('INSUFFICIENT');
    expect(classifyFinalizationRespondent({ status: 'NOT_COMPARABLE' }).mode).toBe('NOT_COMPARABLE');
  });
  it('rejects malformed scored result', () => expect(() => classifyFinalizationRespondent({ status: 'SCORED', score: null, theta: 0, standardError: .2 })).toThrow('SCORED_RESULT_INVALID'));
  it('does not fabricate fallback', () => expect(() => classifyFinalizationRespondent({ status: 'FALLBACK' })).toThrow('STATUS_INVALID'));
});
