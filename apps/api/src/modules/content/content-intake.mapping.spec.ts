import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { IntakeQuestion, UploadDestination } from '@tka/database';
import type { AdminTaxonDto } from './content.dto';
import { resolveIntake, finalQuestions } from './content-intake.mapping';
import { structuralErrors } from './content-import.validation';

const item = (
  kind: AdminTaxonDto['kind'],
  code: string,
  parentId: string | null,
): AdminTaxonDto => ({
  id: randomUUID(),
  kind,
  code,
  parentId,
  name: code,
  displayOrder: 1,
  status: 'READY',
});
const chapter = item('CHAPTER', 'TEST-CH', null),
  sub = item('SUBCHAPTER', 'TEST-SUB', chapter.id),
  cp = item('COMPETENCY', 'TEST-CP', sub.id),
  level = item('LEVEL', '2', sub.id);
const curriculum = { items: [chapter, sub, cp, level] };
const target: UploadDestination = {
  assessmentType: 'DRILL',
  title: 'TEST ONLY',
  chapterId: chapter.id,
  subchapterId: sub.id,
  levelId: level.id,
};
const question = (
  source: NonNullable<IntakeQuestion['metadata']['sourceMaterial']> = {
    chapter: '',
    subchapter: '',
    competency: '',
    level: '',
    naming: 'CODE',
  },
): IntakeQuestion => ({
  externalId: 'TEST-Q',
  type: 'SINGLE_CHOICE',
  chapterCode: null,
  subchapterCode: null,
  competencyCode: null,
  difficulty: 'EASY',
  stem: { text: 'TEST ONLY' },
  options: [
    { id: 'A', content: { text: 'A' } },
    { id: 'B', content: { text: 'B' } },
  ],
  answer: { optionId: 'A' },
  explanation: { text: 'TEST ONLY' },
  metadata: {
    sourceLevelNumber: null,
    sourceSheet: 'PG',
    sourceRowNumber: 2,
    assetManifest: [],
    sourceMaterial: source,
  },
});

describe('Intake mapping keeps source data and strict final imports', () => {
  it('matches normalized names within parents, accepts draft masters, and rejects ambiguous names', () => {
    const named = question({
      chapter: '  test-ch ',
      subchapter: 'test-sub',
      competency: 'test-cp',
      level: '2',
      naming: 'NAME',
    });
    const draft = { items: curriculum.items.map((i) => ({ ...i, status: 'DRAFT' as const })) };
    expect(
      resolveIntake([named], draft, {
        ...target,
        assessmentType: 'TRYOUT',
        chapterId: null,
        subchapterId: null,
        levelId: null,
      }).issues,
    ).toEqual([]);
    const decomposed = structuredClone(named);
    decomposed.metadata.sourceMaterial!.chapter = '  Cafe\u0301 ';
    expect(
      resolveIntake(
        [decomposed],
        {
          items: curriculum.items.map((i) =>
            i.id === chapter.id ? { ...i, name: 'Caf\u00e9' } : i,
          ),
        },
        null,
      ).issues,
    ).toEqual([]);
    const duplicate = { ...item('COMPETENCY', 'TEST-OTHER', sub.id), name: cp.name };
    expect(
      resolveIntake([named], { items: [...curriculum.items, duplicate] }, null).issues.some(
        (i) => i.code === 'MATERIAL_AMBIGUOUS',
      ),
    ).toBe(true);
    const wrongParent = { ...duplicate, id: randomUUID(), parentId: randomUUID() };
    expect(
      resolveIntake([named], { items: [...curriculum.items, wrongParent] }, null).issues,
    ).toEqual([]);
  });
  it('recomputes automatic fields after destination changes without flattening Tryout', () => {
    const first = resolveIntake([question()], curriculum, target);
    const other = item('LEVEL', '3', sub.id);
    const changed = resolveIntake(
      first.questions,
      { items: [...curriculum.items, other] },
      { ...target, levelId: other.id },
      first.questions,
    );
    expect(changed.questions[0]!.metadata.sourceLevelNumber).toBe(3);
    expect(changed.questions[0]!.metadata.sourceMaterial!.level).toBe('');
    const mixed = resolveIntake(
      changed.questions,
      { items: [...curriculum.items, other] },
      { ...target, assessmentType: 'TRYOUT', chapterId: null, subchapterId: null, levelId: null },
      changed.questions,
    );
    expect(mixed.questions[0]!.metadata.sourceLevelNumber).toBeNull();
    expect(mixed.questions[0]!.chapterCode).toBeNull();
  });
  it('permits academic nulls for preview but not final import', () => {
    expect(structuralErrors(question(), true)).toEqual([]);
    expect(structuralErrors(question())).toContain('INVALID_SCHEMA');
  });
  it('fills only blank Drill scope and its single indicator', () => {
    const mapped = resolveIntake([question()], curriculum, target);
    expect(mapped.issues).toEqual([]);
    expect(finalQuestions(mapped.questions)[0]).toMatchObject({
      chapterCode: chapter.code,
      subchapterCode: sub.code,
      competencyCode: cp.code,
      metadata: { sourceLevelNumber: 2 },
    });
    expect(mapped.questions[0]!.metadata.sourceMaterial!.level).toBe('');
    expect(mapped.questions[0]!.metadata.materialOrigins?.levelId).toBe('AUTO');
  });
  it('preserves supplied values and identifies missing sources without substituting target', () => {
    const q = question({
      chapter: 'UNKNOWN',
      subchapter: sub.code,
      competency: cp.code,
      level: '3',
      naming: 'CODE',
    });
    const mapped = resolveIntake([q], curriculum, target);
    expect(mapped.questions[0]!.chapterCode).toBeNull();
    expect(mapped.questions[0]!.metadata.sourceMaterial).toEqual(q.metadata.sourceMaterial);
    expect(
      mapped.issues.some((i) => i.field === 'chapterId' && i.code === 'MASTER_SOURCE_NOT_FOUND'),
    ).toBe(true);
  });
  it('retains exact source mapping and level conflicts', () => {
    const other = item('LEVEL', '3', sub.id);
    const q = question({
      chapter: chapter.code,
      subchapter: sub.code,
      competency: cp.code,
      level: '3',
      naming: 'CODE',
    });
    const mapped = resolveIntake([q], { items: [...curriculum.items, other] }, target);
    expect(mapped.questions[0]!.metadata.sourceLevelNumber).toBe(3);
    expect(mapped.questions[0]!.metadata.materialOrigins?.levelId).toBe('EXCEL');
    expect(
      mapped.issues.some((i) => i.code === 'DESTINATION_CONFLICT' && i.field === 'levelId'),
    ).toBe(true);
  });
  it('does not guess ambiguous indicators or Pretest/Tryout levels', () => {
    const second = item('COMPETENCY', 'TEST-CP2', sub.id);
    expect(
      resolveIntake([question()], { items: [...curriculum.items, second] }, target).issues.some(
        (i) => i.code === 'INDICATOR_AMBIGUOUS',
      ),
    ).toBe(true);
    for (const assessmentType of ['PRETEST', 'TRYOUT'] as const) {
      const mapped = resolveIntake([question()], curriculum, {
        ...target,
        assessmentType,
        chapterId: assessmentType === 'PRETEST' ? chapter.id : null,
        subchapterId: null,
        levelId: null,
      });
      expect(mapped.questions[0]!.metadata.sourceLevelNumber).toBeNull();
      expect(mapped.questions[0]!.subchapterCode).toBeNull();
    }
  });
  it('supports explicit corrections and preserves source provenance', () => {
    const first = resolveIntake(
      [question({ chapter: 'UNKNOWN', subchapter: '', competency: '', level: '', naming: 'CODE' })],
      curriculum,
      target,
    );
    const edited = structuredClone(first.questions[0]!);
    edited.metadata.materialIds!.chapterId = chapter.id;
    const next = resolveIntake([edited], curriculum, target, first.questions);
    expect(next.issues).toEqual([]);
    expect(next.questions[0]!.metadata.materialOrigins?.chapterId).toBe('USER');
    expect(next.questions[0]!.metadata.sourceMaterial!.chapter).toBe('UNKNOWN');
  });
  it('rejects archived and wrong-parent choices after validation', () => {
    const first = resolveIntake([question()], curriculum, target);
    const edited = structuredClone(first.questions[0]!);
    const other = item('SUBCHAPTER', 'TEST-OTHER', randomUUID());
    edited.metadata.materialIds!.subchapterId = other.id;
    expect(
      resolveIntake(
        [edited],
        { items: [...curriculum.items, other] },
        target,
        first.questions,
      ).issues.some((i) => i.code === 'MATERIAL_PARENT_MISMATCH'),
    ).toBe(true);
    expect(
      resolveIntake(
        first.questions,
        { items: curriculum.items.map((i) => (i.id === cp.id ? { ...i, status: 'ARCHIVED' } : i)) },
        target,
        first.questions,
      ).issues.some((i) => i.field === 'competencyId'),
    ).toBe(true);
  });
});

describe('Tryout indicator exemption', () => {
  it.each(['', 'UNKNOWN', cp.code])('ignores Excel indicator %s and keeps provenance', (raw) => {
    const q = question({
      chapter: chapter.code,
      subchapter: sub.code,
      competency: raw,
      level: '2',
      naming: 'CODE',
    });
    const result = resolveIntake([q], curriculum, {
      assessmentType: 'TRYOUT',
      title: 'TEST',
      chapterId: null,
      subchapterId: null,
      levelId: null,
    });
    expect(result.issues).toEqual([]);
    expect(result.questions[0]!.competencyCode).toBe(raw === cp.code ? cp.code : null);
    expect(result.questions[0]!.metadata.sourceMaterial!.competency).toBe(raw);
    const final = finalQuestions(result.questions)[0]!;
    expect(structuralErrors(final, false, true)).toEqual([]);
    if (raw !== cp.code) expect(structuralErrors(final)).toContain('INVALID_SCHEMA');
  });
  it.each(['DRILL', 'PRETEST'] as const)('keeps indicator mandatory for %s', (assessmentType) => {
    const q = question({
      chapter: chapter.code,
      subchapter: sub.code,
      competency: '',
      level: '2',
      naming: 'CODE',
    });
    const result = resolveIntake(
      [q],
      { items: [chapter, sub, level] },
      {
        ...target,
        assessmentType,
        subchapterId: assessmentType === 'DRILL' ? sub.id : null,
        levelId: assessmentType === 'DRILL' ? level.id : null,
      },
    );
    expect(result.issues.some((i) => i.field === 'competencyId')).toBe(true);
  });
});

it('allows unmapped Tryout material and optional chapter/difficulty while retaining provenance', () => {
  const destination: UploadDestination = {
    ...target,
    assessmentType: 'TRYOUT',
    chapterId: null,
    subchapterId: null,
    levelId: null,
  };
  const q = question({
    chapter: chapter.code,
    subchapter: '',
    competency: '',
    level: '',
    naming: 'CODE',
  });
  const result = resolveIntake([q], curriculum, destination);
  expect(result.issues).toEqual([]);
  expect(finalQuestions(result.questions)[0]).toMatchObject({
    subchapterCode: null,
    competencyCode: null,
    metadata: { sourceLevelNumber: null },
  });
  expect(structuralErrors(finalQuestions(result.questions)[0], false, true)).toEqual([]);
  expect(structuralErrors(finalQuestions(result.questions)[0])).toContain('INVALID_SCHEMA');
  for (const field of ['subchapter', 'competency', 'level'] as const) {
    const bad = structuredClone(q);
    bad.metadata.sourceMaterial![field] = 'UNKNOWN';
    const unmapped = resolveIntake([bad], curriculum, destination);
    expect(unmapped.issues).toEqual([]);
    expect(unmapped.questions[0]!.metadata.sourceMaterial![field]).toBe('UNKNOWN');
  }
  q.difficulty = null;
  q.metadata.sourceMaterial!.chapter = '';
  const missing = resolveIntake([q], curriculum, destination);
  expect(missing.issues).toEqual([]);
  expect(finalQuestions(missing.questions)[0]!.chapterCode).toBeNull();
  expect(structuralErrors(finalQuestions(missing.questions)[0], false, true)).toEqual([]);
});
