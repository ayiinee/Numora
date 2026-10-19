import type {
  ContentAnswer,
  ContentCategory,
  ContentKind,
  ContentOption,
  RichContent,
} from '@tka/database';
import { AssessmentFinalizationError } from './errors.js';

type Row = {
  questionType: string;
  stem: unknown;
  optionsOrStatements: unknown;
  answerKey: unknown;
  explanation: unknown;
};
export type RuntimeQuestion = {
  type: ContentKind;
  stem: RichContent;
  options: ContentOption[];
  categories: ContentCategory[];
  answerKey: Exclude<ContentAnswer, null>;
  explanation: RichContent;
};
const object = (x: unknown): Record<string, unknown> | null =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
function rich(x: unknown): RichContent {
  const v = object(x);
  if (
    !v ||
    typeof v.text !== 'string' ||
    !v.text.trim() ||
    (v.assetKeys !== undefined &&
      (!Array.isArray(v.assetKeys) || v.assetKeys.some((k) => typeof k !== 'string')))
  )
    throw new AssessmentFinalizationError(
      'ASSESSMENT_CONTENT_INVALID',
      'Rich content tidak valid.',
    );
  return { text: v.text, ...(v.assetKeys ? { assetKeys: v.assetKeys as string[] } : {}) };
}
export function decodeRuntimeQuestion(row: Row): RuntimeQuestion {
  const data = object(row.optionsOrStatements);
  const raw = Array.isArray(row.optionsOrStatements) ? row.optionsOrStatements : data?.options;
  if (!Array.isArray(raw) || raw.length < 2)
    throw new AssessmentFinalizationError(
      'ASSESSMENT_CONTENT_INVALID',
      'Opsi/statements tidak valid.',
    );
  const options = raw.map((x) => {
    const v = object(x);
    if (!v || typeof v.id !== 'string' || !v.id)
      throw new AssessmentFinalizationError('ASSESSMENT_CONTENT_INVALID', 'ID opsi tidak valid.');
    return { id: v.id, content: rich(v.content) };
  });
  if (new Set(options.map((x) => x.id)).size !== options.length)
    throw new AssessmentFinalizationError('ASSESSMENT_CONTENT_INVALID', 'Opsi duplikat.');
  const type = row.questionType as ContentKind;
  const categories =
    type === 'CATEGORY' && Array.isArray(data?.categories)
      ? data.categories.map((x) => {
          const v = object(x);
          if (
            !v ||
            typeof v.id !== 'string' ||
            !v.id ||
            typeof v.label !== 'string' ||
            !v.label.trim()
          )
            throw new AssessmentFinalizationError(
              'ASSESSMENT_CONTENT_INVALID',
              'Kategori tidak valid.',
            );
          return { id: v.id, label: v.label };
        })
      : [];
  if (
    !['SINGLE_CHOICE', 'MULTIPLE_CHOICE_MULTIPLE_ANSWER', 'CATEGORY'].includes(type) ||
    (type === 'CATEGORY' &&
      (categories.length < 2 || new Set(categories.map((c) => c.id)).size !== categories.length))
  )
    throw new AssessmentFinalizationError('ASSESSMENT_CONTENT_INVALID', 'Tipe soal tidak valid.');
  const result = {
    type,
    stem: rich(row.stem),
    options,
    categories,
    answerKey: row.answerKey as Exclude<ContentAnswer, null>,
    explanation: rich(row.explanation),
  };
  const answer = validateRuntimeAnswer(result, row.answerKey);
  if (
    answer === null ||
    (type === 'CATEGORY' &&
      Object.keys((answer as { categoryByStatementId: object }).categoryByStatementId).length !==
        options.length)
  )
    throw new AssessmentFinalizationError(
      'ASSESSMENT_CONTENT_INVALID',
      'Kunci soal tidak lengkap.',
    );
  result.answerKey = answer;
  return result;
}
export function validateRuntimeAnswer(
  question: Pick<RuntimeQuestion, 'type' | 'options' | 'categories'>,
  value: unknown,
): ContentAnswer {
  if (value === null) return null;
  const v = object(value),
    fail = () => {
      throw new AssessmentFinalizationError('ANSWER_INVALID', 'Jawaban tidak sesuai kontrak soal.');
    };
  if (!v) return fail();
  if (question.type === 'SINGLE_CHOICE') {
    if (
      Object.keys(v).some((k) => k !== 'optionId') ||
      (v.optionId !== null &&
        (typeof v.optionId !== 'string' || !question.options.some((o) => o.id === v.optionId)))
    )
      return fail();
    return v.optionId === null ? null : { optionId: v.optionId as string };
  }
  if (question.type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER') {
    if (
      Object.keys(v).some((k) => k !== 'optionIds') ||
      !Array.isArray(v.optionIds) ||
      new Set(v.optionIds).size !== v.optionIds.length ||
      v.optionIds.some((id) => typeof id !== 'string' || !question.options.some((o) => o.id === id))
    )
      return fail();
    return v.optionIds.length ? { optionIds: [...(v.optionIds as string[])].sort() } : null;
  }
  const selections = object(v.categoryByStatementId);
  if (
    Object.keys(v).some((k) => k !== 'categoryByStatementId') ||
    !selections ||
    Object.entries(selections).some(
      ([id, category]) =>
        !question.options.some((o) => o.id === id) ||
        typeof category !== 'string' ||
        !question.categories.some((c) => c.id === category),
    )
  )
    return fail();
  return Object.keys(selections).length
    ? {
        categoryByStatementId: Object.fromEntries(
          Object.entries(selections).sort(([a], [b]) => a.localeCompare(b)),
        ) as Record<string, string>,
      }
    : null;
}
// PGK uses an exhaustive approved lookup, not hard-coded draft partial-credit assumptions.
export function gradeRuntimeResult(
  question: RuntimeQuestion,
  answer: ContentAnswer,
  maximum: number,
  rubric?: {
    questionType: string;
    status: string;
    approvedAt: Date | null;
    approvedByUserId: string | null;
    maximumScoreCategory: number;
    definition: unknown;
  },
) {
  if (question.type === 'SINGLE_CHOICE') {
    const category =
      answer &&
      'optionId' in answer &&
      'optionId' in question.answerKey &&
      answer.optionId === question.answerKey.optionId
        ? 1
        : 0;
    return {
      points: category * maximum,
      category,
      equivalent: category,
      fullyCorrect: category === 1,
    };
  }
  const definition = object(rubric?.definition);
  if (
    !rubric ||
    !['SEALED', 'RETIRED'].includes(rubric.status) ||
    !rubric.approvedAt ||
    !rubric.approvedByUserId ||
    rubric.questionType !== question.type ||
    definition?.contractVersion !== 'NUMORA_PGK_LOOKUP_V1' ||
    !Array.isArray(definition.entries)
  )
    throw new AssessmentFinalizationError(
      'APPROVED_PGK_RUBRIC_REQUIRED',
      'Rubric PGK versioned yang disahkan dan didukung diperlukan.',
    );
  let correct = 0,
    wrong = 0;
  if (question.type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER') {
    const key = (question.answerKey as { optionIds: string[] }).optionIds;
    for (const id of answer && 'optionIds' in answer ? answer.optionIds : [])
      if (key.includes(id)) correct++;
      else wrong++;
  } else {
    const key = (question.answerKey as { categoryByStatementId: Record<string, string> })
      .categoryByStatementId;
    for (const [id, category] of Object.entries(
      answer && 'categoryByStatementId' in answer ? answer.categoryByStatementId : {},
    ))
      if (key[id] === category) correct++;
      else wrong++;
  }
  const matches = definition.entries
    .map(object)
    .filter((e) => e?.correct === correct && e.wrong === wrong);
  const category = matches[0]?.category;
  if (
    matches.length !== 1 ||
    typeof category !== 'number' ||
    !Number.isInteger(category) ||
    category < 0 ||
    category > rubric.maximumScoreCategory
  )
    throw new AssessmentFinalizationError(
      'PGK_RUBRIC_COVERAGE_REQUIRED',
      'Rubric belum mencakup pola jawaban ini secara tunggal.',
    );
  return {
    points: (category / rubric.maximumScoreCategory) * maximum,
    category,
    equivalent: category / rubric.maximumScoreCategory,
    fullyCorrect: category === rubric.maximumScoreCategory,
  };
}
export function gradeRuntimeQuestion(...args: Parameters<typeof gradeRuntimeResult>) {
  return gradeRuntimeResult(...args).points;
}
export function activeRuntimeQuestion(question: RuntimeQuestion, answer: ContentAnswer) {
  return {
    type: question.type,
    richStem: question.stem,
    richOptions: question.options,
    categories: question.categories,
    answer,
  };
}
export function validateRubricCoverage(
  question: RuntimeQuestion,
  rubric: Parameters<typeof gradeRuntimeQuestion>[3],
) {
  if (question.type === 'SINGLE_CHOICE') return;
  const definition = object(rubric?.definition);
  if (
    !rubric ||
    !['SEALED', 'RETIRED'].includes(rubric.status) ||
    !rubric.approvedAt ||
    !rubric.approvedByUserId ||
    rubric.questionType !== question.type ||
    !Number.isInteger(rubric.maximumScoreCategory) ||
    rubric.maximumScoreCategory <= 0 ||
    !definition ||
    definition.contractVersion !== 'NUMORA_PGK_LOOKUP_V1' ||
    !Array.isArray(definition.entries)
  )
    throw new AssessmentFinalizationError(
      'APPROVED_PGK_RUBRIC_REQUIRED',
      'Kontrak rubric PGK belum didukung.',
    );
  const key =
    question.type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER'
      ? (question.answerKey as { optionIds: string[] }).optionIds.length
      : question.options.length;
  const wrongMaximum =
    question.type === 'CATEGORY' ? question.options.length : question.options.length - key;
  for (let correct = 0; correct <= key; correct++)
    for (let wrong = 0; wrong <= wrongMaximum; wrong++) {
      if (correct + wrong > question.options.length) continue;
      const matches = definition.entries
        .map(object)
        .filter((e) => e?.correct === correct && e.wrong === wrong);
      const category = matches[0]?.category;
      if (
        matches.length !== 1 ||
        typeof category !== 'number' ||
        !Number.isInteger(category) ||
        category < 0 ||
        category > rubric.maximumScoreCategory ||
        (correct === key && wrong === 0) !== (category === rubric.maximumScoreCategory)
      )
        throw new AssessmentFinalizationError(
          'PGK_RUBRIC_COVERAGE_REQUIRED',
          'Rubric harus lengkap, tunggal, dan menandai jawaban sepenuhnya benar.',
        );
    }
}
