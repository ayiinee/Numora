'use client';
import { ContentRichText } from '@/components/content-rich-text';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Icon } from '@tka/ui';
import { AssessmentHeader } from './assessment-presentation';
import { QuestionChoices } from './question-choices';
import { answerOf, choiceValue, questionTypeLabels } from './assessment-answers';
import { learningApi, LearningApiError } from './api';
import type { ReviewedQuestionDto, DrillResultDto, TryoutResultDto } from './generated-types';
import { DataState, LearningFrame, MathText, Status, StudentGate } from './ui';
import { useLearningView } from './learning-interactions';
import { QUESTION_REPORT_CATEGORIES, ReportForm } from './support';

const labels = {
  correct: 'Benar',
  partial: 'Sebagian benar',
  incorrect: 'Salah',
  unanswered: 'Tidak dijawab',
} as const;

export function QuestionReviewDetail({
  question,
  renderContent = (text) => <MathText value={text} />,
}: {
  question: ReviewedQuestionDto;
  renderContent?: (text: string) => ReactNode;
}) {
  const answer = answerOf(question);
  const key =
    question.answerKey ??
    (question.correctOptionId ? { optionId: question.correctOptionId } : null);
  const optionText = (id: string) =>
    question.options?.find((option) => option.id === id)?.text ?? '';
  const categoryText = (id: string | undefined) =>
    question.categories?.find((category) => category.id === id)?.text ?? id ?? 'Tidak dijawab';
  const selectedIds =
    answer && 'optionIds' in answer
      ? answer.optionIds
      : answer && 'optionId' in answer
        ? [answer.optionId]
        : [];
  const expectedIds =
    key && 'optionIds' in key ? key.optionIds : key && 'optionId' in key ? [key.optionId] : [];
  return (
    <div className="question-review-details">
      <div className="question-review-status">
        <Badge
          variant={
            question.reviewStatus === 'correct'
              ? 'success'
              : question.reviewStatus === 'incorrect'
                ? 'danger'
                : question.reviewStatus === 'partial'
                  ? 'warning'
                  : 'default'
          }
        >
          <Icon
            name={
              question.reviewStatus === 'correct'
                ? 'check'
                : question.reviewStatus === 'incorrect'
                  ? 'close'
                  : question.reviewStatus === 'partial'
                    ? 'info'
                    : 'clock'
            }
            width={16}
            height={16}
          />
          {question.reviewStatus ? labels[question.reviewStatus] : 'Penilaian tidak tersedia'}
        </Badge>
        {question.awardedPoints != null && question.maximumPoints != null && (
          <span>
            Poin: {question.awardedPoints.toLocaleString('id-ID')} /{' '}
            {question.maximumPoints.toLocaleString('id-ID')}
          </span>
        )}
      </div>
      {question.type === 'CATEGORY' ? (
        <div className="category-review-list">
          {question.options.map((statement) => (
            <section className="practice-statement" key={statement.id}>
              <h3>{renderContent(statement.text)}</h3>
              <p>
                <strong>Jawabanmu: </strong>
                {categoryText(
                  answer && 'categoryByStatementId' in answer
                    ? answer.categoryByStatementId[statement.id]
                    : undefined,
                )}
              </p>
              <p>
                <strong>Kunci: </strong>
                {categoryText(
                  key && 'categoryByStatementId' in key
                    ? key.categoryByStatementId[statement.id]
                    : undefined,
                )}
              </p>
              {question.statementReview?.find((item) => item.statementId === statement.id)
                ?.status && (
                <p>
                  {
                    labels[
                      question.statementReview.find((item) => item.statementId === statement.id)!
                        .status
                    ]
                  }
                </p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <>
          <section className="drill-review__answer">
            <strong>Jawabanmu: </strong>
            {selectedIds.length
              ? selectedIds.map((id) => (
                  <span className="review-option-text" key={id}>
                    {id}. {renderContent(optionText(id))}
                  </span>
                ))
              : 'Tidak dijawab'}
          </section>
          <section className="drill-review__answer drill-review__answer--correct">
            <strong>Jawaban benar: </strong>
            {expectedIds.map((id) => (
              <span className="review-option-text" key={id}>
                {id}. {renderContent(optionText(id))}
              </span>
            ))}
          </section>
          {question.type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' && (
            <ul className="review-choice-list">
              {(question.optionReview ?? []).map((option) => (
                <li key={option.optionId}>
                  <strong>{option.optionId}.</strong>{' '}
                  {option.selected ? 'Dipilih' : 'Tidak dipilih'} ·{' '}
                  {option.isKey ? 'Termasuk kunci' : 'Bukan kunci'}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <section className="drill-review__explanation">
        <h3>
          <Icon name="info" width={18} height={18} /> Pembahasan Numora
        </h3>
        {renderContent(question.richExplanation?.text ?? question.explanation)}
      </section>
    </div>
  );
}

/** Read-only assessment layout; navigation never calls save/submit. */
export function AssessmentExplanation({
  questions,
  title,
  resultHref,
  report,
  token,
  attemptId,
}: {
  token?: string | undefined;
  attemptId?: string | undefined;
  questions: ReviewedQuestionDto[];
  title: string;
  resultHref: string;
  report?: ((question: ReviewedQuestionDto, index: number) => ReactNode) | undefined;
}) {
  const [index, setIndex] = useState(0);
  const question = questions[index];
  if (!question)
    return (
      <Status title="Pembahasan belum tersedia">
        <Link className="button-link" href={resultHref}>
          Kembali ke hasil
        </Link>
      </Status>
    );
  return (
    <div className="practice-session explanation-session">
      <AssessmentHeader
        title={title}
        exitHref={resultHref}
        status="Pembahasan — hanya baca"
        progressLabel={`Soal ${index + 1} dari ${questions.length}`}
        progress={(100 * (index + 1)) / questions.length}
      />
      <p className="practice-save-notice">
        Pembahasan mengikuti versi soal pada attempt ini. Jawaban dan hasil tersimpan tidak dapat
        diubah.
      </p>
      <div className="practice-layout">
        <div className="practice-main">
          <ExplanationQuestion
            key={question.questionInstanceId}
            question={question}
            index={index}
            total={questions.length}
            token={token}
            attemptId={attemptId}
            report={report}
          />
        </div>
        <aside className="practice-toolbar">
          <h2>Navigasi pembahasan</h2>
          <nav className="practice-numbers" aria-label="Navigasi pembahasan">
            {questions.map((item, position) => (
              <button
                key={item.questionInstanceId}
                aria-current={position === index ? 'step' : undefined}
                aria-label={`Pembahasan soal ${position + 1}, ${item.reviewStatus ? labels[item.reviewStatus] : 'penilaian tidak tersedia'}`}
                onClick={() => setIndex(position)}
              >
                {position + 1}
              </button>
            ))}
          </nav>
          <div className="practice-actions">
            <Button variant="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              Sebelumnya
            </Button>
            <Button disabled={index === questions.length - 1} onClick={() => setIndex(index + 1)}>
              Berikutnya
            </Button>
          </div>
          <Link className="button-link button-link--secondary" href={resultHref}>
            Kembali ke hasil
          </Link>
        </aside>
      </div>
    </div>
  );
}

function ExplanationQuestion({
  question,
  index,
  total,
  token,
  attemptId,
  report,
}: {
  question: ReviewedQuestionDto;
  index: number;
  total: number;
  token?: string | undefined;
  attemptId?: string | undefined;
  report?: ((question: ReviewedQuestionDto, index: number) => ReactNode) | undefined;
}) {
  const ids = [
    ...new Set(
      [question.stem, question.explanation, ...question.options.map((o) => o.text)].flatMap(
        (text) => [...text.matchAll(/\[\[asset:([A-Za-z0-9_-]+)\]\]/g)].map((m) => m[1]!),
      ),
    ),
  ];
  const media = useQuery({
    queryKey: ['assessment-review-media', attemptId, question.questionInstanceId, ids],
    enabled: !!token && !!attemptId && ids.length > 0,
    queryFn: () =>
      learningApi.media(token!, attemptId!, question.questionInstanceId, 'REVIEW', ids),
    retry: false,
  });
  const renderContent = (text: string) => (
    <ContentRichText
      text={text}
      media={media.data?.media ?? []}
      retry={() => void media.refetch()}
    />
  );
  return (
    <Card className="practice-question">
      <div className="practice-question__tags">
        <span>
          Soal {index + 1} dari {total}
        </span>
        <span>{questionTypeLabels[question.type ?? 'SINGLE_CHOICE']}</span>
      </div>
      <h2 className="practice-stem">{renderContent(question.richStem?.text ?? question.stem)}</h2>
      <QuestionChoices
        kind={question.type ?? 'SINGLE_CHOICE'}
        name={`review-${question.questionInstanceId}`}
        options={question.options ?? []}
        renderContent={renderContent}
        statements={question.options ?? []}
        categories={question.categories ?? []}
        value={choiceValue(answerOf(question))}
        onChange={() => {}}
        disabled
      />
      {report?.(question, index)}
      <QuestionReviewDetail question={question} renderContent={renderContent} />
    </Card>
  );
}
export function ExplanationScreen({ kind }: { kind: 'drill' | 'tryout' }) {
  const { attemptId } = useParams<{ attemptId: string }>();
  return (
    <LearningFrame
      title={kind === 'drill' ? 'Pembahasan Drill' : 'Pembahasan TryOut'}
      focus
      className="learning-practice-shell"
    >
      <StudentGate>
        {(token) => <ExplanationData kind={kind} token={token} attemptId={attemptId} />}
      </StudentGate>
    </LearningFrame>
  );
}
function ExplanationData({
  kind,
  token,
  attemptId,
}: {
  kind: 'drill' | 'tryout';
  token: string;
  attemptId: string;
}) {
  const query = useQuery<DrillResultDto | TryoutResultDto>({
    queryKey: [kind === 'drill' ? 'result' : 'tryout-result', attemptId],
    queryFn: () =>
      kind === 'drill'
        ? learningApi.result(token, attemptId)
        : learningApi.tryoutResult(token, attemptId),
  });
  const resultHref = `/student/${kind}/${attemptId}/result`;
  const available =
    query.data &&
    ('explanationState' in query.data ? query.data.explanationState === 'available' : true);
  useLearningView(
    token,
    'explanation_viewed',
    { attemptId },
    !!available && !query.isFetching && !query.isError,
  );
  if (
    query.isError &&
    query.error instanceof LearningApiError &&
    query.error.code === 'TRYOUT_RESULT_PENDING'
  )
    return (
      <Status title="Pembahasan belum dirilis">
        Nilai dan pembahasan tersedia bersama setelah rilis hasil.
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Periksa kembali
        </Button>
        <Link className="button-link button-link--secondary" href={resultHref}>
          Lihat status hasil
        </Link>
      </Status>
    );
  if (query.isPending || query.isFetching || query.isError)
    return (
      <DataState
        pending={query.isPending || query.isFetching}
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  if (!available)
    return (
      <Status title="Pembahasan tidak tersedia">
        Akses mengikuti kebijakan historis attempt ini. Nilai tetap tersimpan.
        <Link className="button-link button-link--secondary" href={resultHref}>
          Kembali ke hasil
        </Link>
      </Status>
    );
  const questions = 'questions' in query.data ? query.data.questions : query.data.explanation;
  return (
    <AssessmentExplanation
      token={token}
      attemptId={attemptId}
      questions={questions}
      title={kind === 'drill' ? 'Pembahasan Drill' : 'Pembahasan TryOut'}
      resultHref={resultHref}
      report={
        kind === 'drill'
          ? (question, index) => (
              <ReportForm
                modal
                key={question.questionInstanceId}
                label={`Laporkan soal ${index + 1}`}
                categories={QUESTION_REPORT_CATEGORIES}
                submit={(category, details, clientRequestId) =>
                  learningApi.reportQuestion(token, {
                    clientRequestId,
                    attemptItemId: question.questionInstanceId,
                    category,
                    details,
                  })
                }
              />
            )
          : undefined
      }
    />
  );
}
