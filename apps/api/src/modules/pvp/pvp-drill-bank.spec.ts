import { describe, expect, it } from 'vitest';
import {
  decodePvpSingleChoice,
  groupDrillCandidates,
  sampleDrillFamilies,
  type DrillCandidate,
} from './pvp-drill-bank';

function candidate(n: number, family = `family-${n}`): DrillCandidate {
  return {
    questionId: family,
    version: {
      id: `version-${n}`,
      variantId: `variant-${n}`,
      versionNumber: 1,
      questionType: 'SINGLE_CHOICE',
      stem: { text: `${n}: 1 + 1?` },
      optionsOrStatements: [
        { id: 'A', content: { text: '2' } },
        { id: 'B', content: { text: '3' } },
      ],
      answerKey: { optionId: 'A' },
      explanation: { text: '1 + 1 = 2' },
      media: null,
      difficulty: 'EASY',
      parentOriginalQuestionVersionId: null,
      revisedFromQuestionVersionId: null,
      levelId: null,
      scoringRubricVersionId: null,
      contentFingerprint: null,
      validationState: 'DRAFT',
      validationDecisionId: null,
      contentStatus: 'READY',
      reviewedByUserId: 'reviewer',
      reviewedAt: new Date(),
      createdAt: new Date(),
    },
  };
}

describe('PvP random Drill sampling', () => {
  it('reads imported wrapped options consistently for eligibility, display and scoring', () => {
    const imported = candidate(1);
    imported.version.optionsOrStatements = {
      options: imported.version.optionsOrStatements,
      categories: [],
    };
    expect(groupDrillCandidates([imported])).toEqual([[imported]]);
    expect(decodePvpSingleChoice(imported.version)).toMatchObject({
      correctOptionId: 'A',
      options: [
        { id: 'A', text: '2' },
        { id: 'B', text: '3' },
      ],
    });
    const malformed = { ...imported.version, optionsOrStatements: { options: 'invalid' } };
    expect(() => decodePvpSingleChoice(malformed)).toThrow();
    expect(() =>
      decodePvpSingleChoice({ ...imported.version, answerKey: { optionId: 'Z' } }),
    ).toThrow();
  });
  it.each([0, 9])('rejects %i distinct families without repeating or padding', (count) => {
    const families = groupDrillCandidates(Array.from({ length: count }, (_, i) => candidate(i)));
    expect(() => sampleDrillFamilies(families)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'PVP_CONTENT_UNAVAILABLE' }),
      }),
    );
  });

  it('counts families, not versions or variants', () => {
    const families = groupDrillCandidates(
      Array.from({ length: 30 }, (_, i) => candidate(i, 'one-family')),
    );
    expect(families).toHaveLength(1);
    expect(() => sampleDrillFamilies(families)).toThrow();
  });

  it('excludes malformed keys, PGK and unsupported media while accepting empty media', () => {
    const badKey = candidate(1);
    badKey.version.answerKey = { optionId: 'Z' };
    const pgk = candidate(2);
    pgk.version.questionType = 'MULTIPLE_CHOICE_MULTIPLE_ANSWER';
    const image = candidate(3);
    image.version.media = [{ url: '/image.png' }];
    const invalidMedia = candidate(4);
    invalidMedia.version.media = { url: '/image.png' };
    const missingExplanation = candidate(5);
    missingExplanation.version.explanation = { text: '' };
    const good = candidate(6);
    good.version.media = [];
    expect(
      groupDrillCandidates([badKey, pgk, image, invalidMedia, missingExplanation, good]),
    ).toEqual([[good]]);
  });

  it.each([10, 24])('samples ten unique families from %i with controlled randomness', (count) => {
    const families = Array.from({ length: count }, (_, i) => [candidate(i)]);
    const stay = (max: number) => max - 1;
    const rotate = () => 0;
    const first = sampleDrillFamilies(families, stay);
    const second = sampleDrillFamilies(families, rotate);
    expect(first.map((c) => c.questionId)).toEqual(
      Array.from({ length: 10 }, (_, i) => `family-${i}`),
    );
    expect(second.map((c) => c.version.id)).not.toEqual(first.map((c) => c.version.id));
    expect(second).toHaveLength(10);
    expect(new Set(second.map((c) => c.questionId)).size).toBe(10);
    expect(families[0]![0]!.questionId).toBe('family-0');
  });

  it('chooses one variant randomly within each family', () => {
    const families = Array.from({ length: 10 }, (_, i) => [
      candidate(i),
      candidate(i + 100, `family-${i}`),
    ]);
    expect(sampleDrillFamilies(families, (max) => max - 1).map((c) => c.version.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `version-${i + 100}`),
    );
  });
});
