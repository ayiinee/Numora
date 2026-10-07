import type { IntakeQuestion, ImportQuestion, UploadDestination } from '@tka/database';
import type { AdminCurriculumDto, AdminTaxonDto } from './content.dto';
import type { IntakeIssueDto } from './content-intake.dto';
import { structuralErrors, schemaIssues } from './content-import.validation';

export function resolveIntake(
  inputs: IntakeQuestion[],
  curriculum: AdminCurriculumDto,
  destination: UploadDestination | null,
  previous: IntakeQuestion[] = [],
) {
  const issues: IntakeIssueDto[] = [];
  // Include both DRAFT and READY items for flexible matching
  const active = curriculum.items.filter((i) => i.status !== 'ARCHIVED');
  const find = (id: string | null | undefined) => active.find((i) => i.id === id);
  const normalize = (s: string) => s.normalize('NFC').trim().toLocaleLowerCase('id-ID');
  const questions = inputs.map((input) => {
    const q = structuredClone(input);
    const before = previous.find((p) => p.externalId === q.externalId);
    const original = before ?? q;
    const source = original.metadata.sourceMaterial ?? {
      chapter: original.chapterCode ?? '',
      subchapter: original.subchapterCode ?? '',
      competency: original.competencyCode ?? '',
      level:
        original.metadata.sourceLevelNumber == null
          ? ''
          : String(original.metadata.sourceLevelNumber),
      naming: 'CODE' as const,
    };
    q.metadata.sourceMaterial = source;
    const origins = { ...before?.metadata.materialOrigins };
    const refs = { ...before?.metadata.materialReferences };
    const ids = q.metadata.materialIds ?? {
      chapterId: null,
      subchapterId: null,
      competencyId: null,
      levelId: null,
    };
    const add = (
      field: string,
      code: string,
      detail: string,
      category: IntakeIssueDto['category'] = 'MAPPING',
    ) => {
      if (
        destination?.assessmentType === 'TRYOUT' &&
        category === 'MAPPING' &&
        !field.startsWith('destination')
      )
        return;
      issues.push({
        externalId: q.externalId,
        sheet: q.metadata.sourceSheet ?? '',
        row: q.metadata.sourceRowNumber ?? 0,
        cell: '',
        field,
        code,
        detail,
        category,
      });
    };
    const choose = (
      field: keyof typeof ids,
      kind: AdminTaxonDto['kind'],
      raw: string,
      parent?: string,
      target?: string | null,
    ) => {
      const supplied = ids[field];
      const prior = before?.metadata.materialIds?.[field];
      const manual =
        origins[field] === 'USER' ||
        (before && !!q.metadata.materialIds && supplied !== undefined && supplied !== prior);
      let item: AdminTaxonDto | undefined;
      if (manual) {
        origins[field] = 'USER';
        item = find(supplied);
        if (supplied && !item)
          add(field, 'MASTER_UNAVAILABLE', 'Materi pilihan tidak tersedia atau sudah diarsipkan.');
      } else if (raw.trim()) {
        // Try code match first, then fall back to name match for flexibility
        let matches = active.filter(
          (i) => i.kind === kind && (kind === 'CHAPTER' || i.parentId === parent) && i.code === raw,
        );
        // Fallback: try name match if code match failed and naming suggests names were provided
        if (matches.length === 0) {
          matches = active.filter(
            (i) =>
              i.kind === kind &&
              (kind === 'CHAPTER' || i.parentId === parent) &&
              normalize(i.name) === normalize(raw),
          );
        }
        // Additional fallback: partial name match (contains, case-insensitive)
        if (matches.length === 0) {
          const rawLower = normalize(raw);
          matches = active.filter(
            (i) =>
              i.kind === kind &&
              (kind === 'CHAPTER' || i.parentId === parent) &&
              (normalize(i.name).includes(rawLower) || rawLower.includes(normalize(i.name))),
          );
        }
        if (matches.length === 1) item = matches[0];
        else if (matches.length > 1)
          add(field, 'MATERIAL_AMBIGUOUS', 'Nama sumber memiliki beberapa pilihan; pilih materi.');
        else
          add(
            field,
            'MASTER_SOURCE_NOT_FOUND',
            'Materi sumber belum tersedia pada master dalam hubungan induk yang dipilih.',
          );
        origins[field] = 'EXCEL';
      } else {
        item = target ? find(target) : undefined;
        if (!item && kind === 'COMPETENCY' && parent) {
          // For Tryout, skip indicator auto-resolution
          if (destination?.assessmentType !== 'TRYOUT') {
            const candidates = active.filter((i) => i.kind === kind && i.parentId === parent);
            if (candidates.length === 1) item = candidates[0];
            else if (candidates.length > 1)
              add(field, 'INDICATOR_AMBIGUOUS', 'Pilih indikator; tersedia beberapa pilihan.');
          }
        }
        origins[field] = 'AUTO';
      }
      if (item && (item.kind !== kind || (kind !== 'CHAPTER' && item.parentId !== parent))) {
        add(
          field,
          'MATERIAL_PARENT_MISMATCH',
          kind === 'SUBCHAPTER'
            ? 'Subbab tidak berada pada bab yang dipilih.'
            : 'Materi tidak berada pada induk yang dipilih.',
        );
        item = undefined;
      }
      if (!item && !raw.trim() && origins[field] === 'AUTO') delete origins[field];
      // Only genuinely blank optional Tryout fields may remain unmapped.
      if (
        !item &&
        !issues.some((i) => i.externalId === q.externalId && i.field === field) &&
        !(destination?.assessmentType === 'TRYOUT' && (manual || !raw.trim()) && !supplied)
      )
        add(
          field,
          'MAPPING_REQUIRED',
          `Pilih ${kind === 'LEVEL' ? 'level' : kind === 'COMPETENCY' ? 'indikator' : kind === 'SUBCHAPTER' ? 'subbab' : 'bab'}.`,
        );
      if (item)
        refs[field] =
          `${origins[field] === 'AUTO' && target ? 'DESTINATION' : 'MASTER'}:${item.id}`;
      else delete refs[field];
      return item;
    };
    const chapter = choose(
      'chapterId',
      'CHAPTER',
      source.chapter,
      undefined,
      destination?.assessmentType !== 'TRYOUT' ? destination?.chapterId : null,
    );
    const sub = choose(
      'subchapterId',
      'SUBCHAPTER',
      source.subchapter,
      chapter?.id,
      destination?.assessmentType === 'DRILL' ? destination.subchapterId : null,
    );
    const indicator = choose('competencyId', 'COMPETENCY', source.competency, sub?.id);
    const level = choose(
      'levelId',
      'LEVEL',
      source.level,
      sub?.id,
      destination?.assessmentType === 'DRILL' ? destination.levelId : null,
    );
    q.chapterCode = chapter?.code ?? null;
    q.subchapterCode = sub?.code ?? null;
    q.competencyCode = indicator?.code ?? null;
    q.metadata.sourceLevelNumber = level ? Number(level.code) : null;
    q.metadata.chapterName = chapter?.name;
    q.metadata.subchapterName = sub?.name;
    q.metadata.competencyName = indicator?.name;
    q.metadata.materialIds = {
      chapterId: chapter?.id ?? (origins.chapterId === 'USER' ? ids.chapterId : null),
      subchapterId: sub?.id ?? (origins.subchapterId === 'USER' ? ids.subchapterId : null),
      competencyId: indicator?.id ?? (origins.competencyId === 'USER' ? ids.competencyId : null),
      levelId: level?.id ?? (origins.levelId === 'USER' ? ids.levelId : null),
    };
    q.metadata.materialOrigins = origins;
    q.metadata.materialReferences = refs;
    if (destination) {
      const targetChapter = find(destination.chapterId),
        targetSub = find(destination.subchapterId),
        targetLevel = find(destination.levelId);
      if (destination.assessmentType !== 'TRYOUT') {
        if (!targetChapter || targetChapter.kind !== 'CHAPTER')
          add('destination.chapterId', 'DESTINATION_REQUIRED', 'Pilih bab tujuan yang tersedia.');
        else if (chapter && chapter.id !== targetChapter.id)
          add(
            'chapterId',
            'DESTINATION_CONFLICT',
            'Bab sumber/pilihan berbeda dengan bab tujuan; koreksi secara eksplisit.',
          );
      }
      if (destination.assessmentType === 'DRILL') {
        if (
          !targetSub ||
          targetSub.kind !== 'SUBCHAPTER' ||
          targetSub.parentId !== targetChapter?.id
        )
          add(
            'destination.subchapterId',
            'DESTINATION_PARENT_MISMATCH',
            'Pilih subbab pada bab tujuan.',
          );
        if (!targetLevel || targetLevel.kind !== 'LEVEL' || targetLevel.parentId !== targetSub?.id)
          add(
            'destination.levelId',
            'DESTINATION_PARENT_MISMATCH',
            'Pilih level pada subbab tujuan.',
          );
        if (sub && sub.id !== targetSub?.id)
          add(
            'subchapterId',
            'DESTINATION_CONFLICT',
            'Subbab sumber/pilihan berbeda dengan subbab tujuan.',
          );
        if (level && level.id !== targetLevel?.id)
          add(
            'levelId',
            'DESTINATION_CONFLICT',
            'Level penulis/pilihan berbeda dengan level tujuan.',
          );
      }
      if (
        destination.assessmentType === 'TRYOUT' &&
        (destination.chapterId || destination.subchapterId || destination.levelId)
      )
        add(
          'destination',
          'DESTINATION_INVALID',
          'Tryout memakai materi per soal, tanpa scope paket tunggal.',
        );
      if (
        destination.assessmentType === 'PRETEST' &&
        (destination.subchapterId || destination.levelId)
      )
        add(
          'destination',
          'DESTINATION_INVALID',
          'Pretest memakai satu bab, tanpa subbab/level paket tunggal.',
        );
    }
    if (!q.difficulty && destination?.assessmentType !== 'TRYOUT')
      add('difficulty', 'DIFFICULTY_REQUIRED', 'Pilih kesulitan soal.', 'METADATA');
    for (const code of structuralErrors(q, true)) {
      if (code === 'INVALID_SCHEMA')
        for (const e of schemaIssues(q, true))
          add(e.field, code, `${e.field}: ${e.detail}`, 'CONTENT');
      else
        add(
          code.includes('KEY') ? 'answer' : 'content',
          code,
          `Periksa ${code.includes('KEY') ? 'kunci jawaban' : 'konten/gambar'} (${code}).`,
          'CONTENT',
        );
    }
    return q;
  });
  return { questions, issues };
}
export function finalQuestions(questions: IntakeQuestion[]): ImportQuestion[] {
  // Called only after the authoritative resolver has reported no blockers.
  return questions.map((q) => ({
    ...q,
    chapterCode: q.chapterCode,
    subchapterCode: q.subchapterCode,
    competencyCode: q.competencyCode,
    metadata: { ...q.metadata, sourceLevelNumber: q.metadata.sourceLevelNumber },
  }));
}
