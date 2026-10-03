import { AssessmentFinalizationError } from './errors.js';

export type SingleChoiceVersion = {
  stem: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
};

export function decodeSingleChoice(row: {
  questionType: string;
  stem: unknown;
  optionsOrStatements: unknown;
  answerKey: unknown;
  explanation: unknown;
}): SingleChoiceVersion {
  const readText = (value: unknown) =>
    value && typeof value === 'object' && 'text' in value && typeof value.text === 'string'
      ? value.text.trim()
      : '';
  const options = Array.isArray(row.optionsOrStatements)
    ? row.optionsOrStatements.map((option: unknown) => {
        if (!option || typeof option !== 'object' || !('id' in option) ||
            !('content' in option) || typeof option.id !== 'string') return null;
        return { id: option.id, text: readText(option.content) };
      })
    : [];
  const answer = row.answerKey && typeof row.answerKey === 'object' &&
    'optionId' in row.answerKey && typeof row.answerKey.optionId === 'string'
    ? row.answerKey.optionId
    : null;
  const validOptions = options.filter((option): option is { id: string; text: string } =>
    option !== null && option.id.length > 0 && option.text.length > 0);
  if (row.questionType !== 'SINGLE_CHOICE' || !readText(row.stem) ||
      !readText(row.explanation) || !answer || validOptions.length < 2 ||
      validOptions.length !== options.length ||
      new Set(validOptions.map((option) => option.id)).size !== validOptions.length ||
      !validOptions.some((option) => option.id === answer)) {
    throw new AssessmentFinalizationError('ASSESSMENT_CONTENT_INVALID', 'Konten asesmen pilihan ganda belum valid.');
  }
  return {
    stem: readText(row.stem),
    options: validOptions,
    correctOptionId: answer,
    explanation: readText(row.explanation),
  };
}
