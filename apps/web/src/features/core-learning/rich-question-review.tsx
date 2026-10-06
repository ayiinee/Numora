'use client';
import { useQuery } from '@tanstack/react-query';
import { ContentRichText } from '@/components/content-rich-text';
import { QuestionChoices } from './question-choices';
import { learningApi } from './api';
import type { ReviewedQuestionDto, SavedAnswerDto } from './generated-types';
type Selection = string | string[] | Record<string, string> | null;
function selection(a: SavedAnswerDto['answer']): Selection {
  if (!a) return null;
  return 'optionId' in a ? a.optionId : 'optionIds' in a ? a.optionIds : a.categoryByStatementId;
}
export function RichQuestionReview({
  question,
  token,
  attemptId,
}: {
  question: Omit<ReviewedQuestionDto, 'options'> & { options?: ReviewedQuestionDto['options'] };
  token?: string | undefined;
  attemptId?: string | undefined;
}) {
  const text = [
    question.richStem?.text ?? question.stem,
    ...(question.richOptions?.map((o) => o.content.text) ?? []),
    question.richExplanation?.text ?? question.explanation,
  ];
  const ids = [
    ...new Set(
      text.flatMap((t) => [...t.matchAll(/\[\[asset:([A-Za-z0-9_-]+)\]\]/g)].map((m) => m[1]!)),
    ),
  ];
  const media = useQuery({
    queryKey: ['assessment-review-media', attemptId, question.questionInstanceId, ids],
    enabled: !!token && !!attemptId && ids.length > 0,
    queryFn: () =>
      learningApi.media(token!, attemptId!, question.questionInstanceId, 'REVIEW', ids),
    retry: false,
  });
  const render = (text: string) => (
    <ContentRichText
      text={text}
      media={media.data?.media ?? []}
      retry={() => void media.refetch()}
    />
  );
  const options =
    question.richOptions?.map((o) => ({ id: o.id, text: o.content.text })) ??
    question.options ??
    [];
  const choice = (a: SavedAnswerDto['answer'], suffix: string) => (
    <QuestionChoices
      kind={question.type ?? 'SINGLE_CHOICE'}
      name={`${question.questionInstanceId}-${suffix}`}
      options={options}
      statements={options}
      categories={question.categories?.map((c) => ({ id: c.id, text: c.label })) ?? []}
      value={selection(a)}
      onChange={() => {}}
      disabled
      renderContent={render}
    />
  );
  return (
    <div>
      <h3>{render(text[0]!)}</h3>
      <h4>Jawabanmu</h4>
      {question.answer ? choice(question.answer, 'answer') : <p>Tidak dijawab</p>}
      <h4>Jawaban benar</h4>
      {choice(question.answerKey, 'key')}
      <h4>Pembahasan Numora</h4>
      <p>{render(question.richExplanation?.text ?? question.explanation)}</p>
    </div>
  );
}
