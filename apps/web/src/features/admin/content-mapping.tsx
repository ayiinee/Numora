'use client';
import type { AdminCurriculumDto, MaterialIdsDto, IntakeQuestionDto } from './generated-types';

const fields = [
  ['chapterId', 'CHAPTER', 'Bab'],
  ['subchapterId', 'SUBCHAPTER', 'Subbab'],
  ['competencyId', 'COMPETENCY', 'Indikator'],
  ['levelId', 'LEVEL', 'Level'],
] as const;
const origins = { EXCEL: 'Dari Excel', AUTO: 'Diisi otomatis', USER: 'Dipilih pengguna' };

export function MaterialChoices({
  value,
  curriculum,
  change,
  disabled,
  question,
  fieldsShown,
}: {
  value: MaterialIdsDto;
  curriculum: AdminCurriculumDto;
  change: (value: MaterialIdsDto) => void;
  disabled: boolean;
  question?: IntakeQuestionDto;
  fieldsShown?: (keyof MaterialIdsDto)[];
}) {
  return (
    <div className="upload-fields">
      {fields
        .filter(([field]) => !fieldsShown || fieldsShown.includes(field))
        .map(([field, kind, label]) => {
          const parent = kind === 'SUBCHAPTER' ? value.chapterId : value.subchapterId;
          const choices = curriculum.items.filter(
            (i) =>
              i.kind === kind &&
              i.status !== 'ARCHIVED' &&
              (kind === 'CHAPTER' || i.parentId === parent),
          );
          const origin = question?.metadata.materialOrigins?.[field];
          const source =
            question?.metadata.sourceMaterial?.[
              field === 'chapterId'
                ? 'chapter'
                : field === 'subchapterId'
                  ? 'subchapter'
                  : field === 'competencyId'
                    ? 'competency'
                    : 'level'
            ];
          return (
            <label key={field}>
              {label}
              <select
                aria-label={label}
                value={value[field] ?? ''}
                disabled={disabled || (kind !== 'CHAPTER' && !parent)}
                onChange={(e) => change({ ...value, [field]: e.target.value || null })}
              >
                <option value="">Pilih {label.toLowerCase()}</option>
                {value[field] && !choices.some((i) => i.id === value[field]) && (
                  <option value={value[field]!}>Pilihan perlu diperiksa</option>
                )}
                {choices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} {i.status === 'READY' ? '' : `(${i.status})`}
                  </option>
                ))}
              </select>
              {question && (
                <small>
                  {origin ? origins[origin as keyof typeof origins] : 'Belum dipetakan'}
                  {source ? ` · Sumber: ${source}` : ''}
                </small>
              )}
              {!choices.length && (kind === 'CHAPTER' || parent) && (
                <small>Master belum tersedia pada cakupan ini.</small>
              )}
            </label>
          );
        })}
    </div>
  );
}
