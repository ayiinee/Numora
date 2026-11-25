'use client';
import { ContentRichText } from '@/components/content-rich-text';
import type { ReactNode, Ref } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Dialog, Icon } from '@tka/ui';
import { AssessmentHeader } from './assessment-presentation';
import {
  answerOf,
  assessmentAssetIds,
  assessmentOptions,
  optionLabel,
  questionTypeLabels,
} from './assessment-answers';
import { learningApi, LearningApiError } from './api';
import type { ReviewedQuestionDto, DrillResultDto, TryoutResultDto } from './generated-types';
import { DataState, LearningFrame, Status, StudentGate, MathText } from './ui';
import { useLearningView } from './learning-interactions';
import { QUESTION_REPORT_CATEGORIES, ReportForm } from './support';

const reviewStates = {
  correct: { label: 'Benar', mark: '✓', tone: 'success' },
  partial: { label: 'Sebagian benar', mark: '½', tone: 'warning' },
  incorrect: { label: 'Salah', mark: '×', tone: 'danger' },
  unanswered: { label: 'Tidak dijawab', mark: '○', tone: 'default' },
  unavailable: { label: 'Penilaian tidak tersedia', mark: '–', tone: 'default' },
} as const;

function stateLabel(state: keyof typeof reviewStates, tryout: boolean) {
  return tryout && state === 'unanswered' ? 'Kosong' : reviewStates[state].label;
}

function optionIds(answer: ReviewedQuestionDto['answer'] | ReviewedQuestionDto['answerKey']) {
  if (!answer) return [];
  if ('optionIds' in answer) return answer.optionIds;
  return 'optionId' in answer ? [answer.optionId] : [];
}

export function QuestionReviewDetail({
  question,
  renderContent = (text) => <MathText value={text} />,
  tryout = false,
}: {
  question: ReviewedQuestionDto;
  renderContent?: (text: string, layout: 'reading' | 'choice') => ReactNode;
  tryout?: boolean;
}) {
  const answer = answerOf(question);
  const key =
    question.answerKey ??
    (question.correctOptionId ? { optionId: question.correctOptionId } : null);
  const options = assessmentOptions(question);
  const isCategory = question.type === 'CATEGORY';
  const state = question.reviewStatus ?? 'unavailable';
  const { mark, tone } = reviewStates[state];
  const selectedIds = optionIds(answer);
  const expectedIds = optionIds(key);
  const choices = options.map((option, index) => {
    const review = question.optionReview?.find((item) => item.optionId === option.id);
    return {
      ...option,
      label: optionLabel(option.id, index),
      selected: review?.selected ?? selectedIds.includes(option.id),
      isKey: review?.isKey ?? expectedIds.includes(option.id),
    };
  });
  const selectedLabels = choices.filter(({ selected }) => selected).map(({ label }) => label);
  const keyLabels = choices.filter(({ isKey }) => isKey).map(({ label }) => label);
  const studentCategory =
    answer && 'categoryByStatementId' in answer ? answer.categoryByStatementId : {};
  const keyCategory = key && 'categoryByStatementId' in key ? key.categoryByStatementId : {};
  const answeredStatements = options.filter(({ id }) => Object.hasOwn(studentCategory, id)).length;
  const categoryText = (id: string | undefined, fallback: string) =>
    id === undefined
      ? fallback
      : (question.categories?.find((category) => category.id === id)?.text ?? id);
  const explanation = question.richExplanation?.text ?? question.explanation;

  return (
    <div className="question-review-details">
      <div className="assessment-review-summary">
        <div className="question-review-status">
          <Badge variant={tone}>
            <span aria-hidden="true">{mark}</span> {stateLabel(state, tryout)}
          </Badge>
          {question.awardedPoints != null && question.maximumPoints != null && (
            <span>
              Poin {question.awardedPoints.toLocaleString('id-ID', { maximumFractionDigits: 20 })} /{' '}
              {question.maximumPoints.toLocaleString('id-ID', { maximumFractionDigits: 20 })}
            </span>
          )}
        </div>
        {isCategory ? (
          <p>
            {answeredStatements} dari {options.length} pernyataan dijawab
          </p>
        ) : (
          <dl className="assessment-review-comparison">
            <div>
              <dt>Jawabanmu</dt>
              <dd>{selectedLabels.join(', ') || 'Tidak dijawab'}</dd>
            </div>
            <div>
              <dt>Kunci</dt>
              <dd>{keyLabels.join(', ') || 'Tidak tersedia'}</dd>
            </div>
          </dl>
        )}
      </div>
      <section className="drill-review__explanation">
        <h3>Pembahasan Numora</h3>
        {explanation.trim() ? (
          renderContent(explanation, 'reading')
        ) : (
          <p>Pembahasan belum tersedia.</p>
        )}
      </section>
      {options.length > 0 && (
        <details className="assessment-review-disclosure">
          <summary>Rincian jawaban</summary>
          {isCategory ? (
            <ol className="category-review-list">
              {options.map((statement) => {
                const status = question.statementReview?.find(
                  (item) => item.statementId === statement.id,
                )?.status;
                return (
                  <li key={statement.id}>
                    <div className="assessment-review-statement">
                      {renderContent(statement.text, 'choice')}
                    </div>
                    <dl className="assessment-review-comparison">
                      <div>
                        <dt>Jawabanmu</dt>
                        <dd>
                          {renderContent(
                            categoryText(
                              studentCategory[statement.id],
                              stateLabel('unanswered', tryout),
                            ),
                            'choice',
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Kunci</dt>
                        <dd>
                          {renderContent(
                            categoryText(keyCategory[statement.id], 'Tidak tersedia'),
                            'choice',
                          )}
                        </dd>
                      </div>
                    </dl>
                    {status && (
                      <p className="assessment-review-row-status" data-review={status}>
                        {stateLabel(status, tryout)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <ul className="tryout-review-options" aria-label="Pilihan jawaban">
              {choices.map((option) => (
                <li key={option.id}>
                  <span className="practice-option__letter">{option.label}</span>
                  <div>
                    {renderContent(option.text, 'choice')}
                    {(option.selected || option.isKey) && (
                      <div className="tryout-review-option-labels">
                        {option.selected && <Badge variant="primary">Jawabanmu</Badge>}
                        {option.isKey && <Badge variant="success">Kunci</Badge>}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
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
  kind = 'drill',
}: {
  token?: string | undefined;
  attemptId?: string | undefined;
  questions: ReviewedQuestionDto[];
  title: string;
  resultHref: string;
  report?: ((question: ReviewedQuestionDto, index: number) => ReactNode) | undefined;
  kind?: 'drill' | 'tryout';
}) {
  const [index, setIndex] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const position = Math.min(index, questions.length - 1);
  const question = questions[position];
  if (!question)
    return (
      <Status title="Pembahasan belum tersedia">
        <Link className="button-link" href={resultHref}>
          Kembali ke hasil
        </Link>
      </Status>
    );
  const tryout = kind === 'tryout';
  function goTo(next: number) {
    setIndex(next);
    setMapOpen(false);
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView?.({ block: 'start' });
    });
  }
  const reviewMap = (
    <div className="tryout-question-map">
      <nav className="tryout-question-map__grid" aria-label="Navigasi pembahasan">
        {questions.map((item, index) => {
          const state = item.reviewStatus ?? 'unavailable';
          return (
            <button
              type="button"
              key={item.questionInstanceId}
              data-review={state}
              aria-current={index === position ? 'step' : undefined}
              aria-label={`Pembahasan soal ${index + 1}, ${stateLabel(state, tryout).toLowerCase()}`}
              onClick={() => goTo(index)}
            >
              <span>{index + 1}</span>
              <span aria-hidden="true">{reviewStates[state].mark}</span>
            </button>
          );
        })}
      </nav>
      <ul className="tryout-question-map__legend" aria-label="Legenda pembahasan">
        {(Object.keys(reviewStates) as (keyof typeof reviewStates)[]).map((state) => (
          <li key={state}>
            <span aria-hidden="true">{reviewStates[state].mark} </span>
            {stateLabel(state, tryout)}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="practice-session explanation-session assessment-workspace">
      <AssessmentHeader title={title} exitHref={resultHref} showProfile={false} />
      <div className="practice-layout">
        <div className="practice-main">
          <ExplanationQuestion
            key={question.questionInstanceId}
            question={question}
            index={position}
            total={questions.length}
            token={token}
            attemptId={attemptId}
            report={report}
            tryout={tryout}
            heading={heading}
          />
        </div>
        <aside className="practice-toolbar">
          <div className="assessment-desktop-map">
            <h2>Peta soal</h2>
            {reviewMap}
          </div>
          <nav className="practice-actions" aria-label="Pindah soal pembahasan">
            <Button
              variant="secondary"
              disabled={position === 0}
              onClick={() => goTo(position - 1)}
              aria-label="Sebelumnya"
            >
              <Icon name="back" width={16} height={16} />
              <span className="assessment-direction-label">Sebelumnya</span>
            </Button>
            <div className="assessment-map-trigger">
              <Button
                fullWidth
                variant="secondary"
                aria-haspopup="dialog"
                onClick={() => setMapOpen(true)}
              >
                <Icon name="menu" width={16} height={16} /> <span>Semua Soal</span>
              </Button>
            </div>
            <Button
              disabled={position === questions.length - 1}
              onClick={() => goTo(position + 1)}
              aria-label="Berikutnya"
            >
              <span className="assessment-direction-label">Berikutnya</span>
              <Icon name="arrow" width={16} height={16} />
            </Button>
          </nav>
        </aside>
      </div>
      <Dialog
        className="tryout-map-dialog"
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        title="Semua Soal"
      >
        {mapOpen && reviewMap}
      </Dialog>
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
  tryout,
  heading,
}: {
  question: ReviewedQuestionDto;
  index: number;
  total: number;
  token?: string | undefined;
  attemptId?: string | undefined;
  report?: ((question: ReviewedQuestionDto, index: number) => ReactNode) | undefined;
  tryout: boolean;
  heading: Ref<HTMLHeadingElement>;
}) {
  const stem = question.richStem?.text ?? question.stem;
  const ids = assessmentAssetIds([
    stem,
    question.richExplanation?.text ?? question.explanation,
    ...assessmentOptions(question).map((option) => option.text),
    ...(question.categories?.map((category) => category.text) ?? []),
  ]);
  const media = useQuery({
    queryKey: ['assessment-review-media', attemptId, question.questionInstanceId, ids],
    enabled: !!token && !!attemptId && ids.length > 0,
    queryFn: () =>
      learningApi.media(token!, attemptId!, question.questionInstanceId, 'REVIEW', ids),
    retry: false,
  });
  const renderContent = (text: string, layout: 'reading' | 'choice') => (
    <ContentRichText
      text={text}
      media={media.data?.media ?? []}
      mediaPending={media.isFetching}
      retry={() => void media.refetch()}
      layout={layout}
    />
  );
  return (
    <Card className="practice-question">
      <div className="assessment-question-heading">
        <h2 className="assessment-question-title" ref={heading} tabIndex={-1}>
          Soal {index + 1} dari {total}
        </h2>
        <span>{questionTypeLabels[question.type ?? 'SINGLE_CHOICE']}</span>
      </div>
      <div className="practice-stem">{renderContent(stem, 'reading')}</div>
      <QuestionReviewDetail question={question} renderContent={renderContent} tryout={tryout} />
      {report && <div className="assessment-review-report">{report(question, index)}</div>}
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
  const keepTryoutReview =
    kind === 'tryout' &&
    available &&
    (!query.isError ||
      (query.error instanceof LearningApiError &&
        (query.error.status === 0 || query.error.status >= 500)));
  if (!keepTryoutReview && (query.isPending || query.isFetching || query.isError))
    return (
      <DataState
        pending={query.isPending || query.isFetching}
        error={query.error}
        retry={() => void query.refetch()}
        recovery={{ href: resultHref, label: 'Kembali ke hasil' }}
      />
    );
  if (!query.data || !available)
    return (
      <Status title="Pembahasan tidak tersedia">
        Akses mengikuti aturan saat latihan ini dikerjakan. Nilai tetap tersimpan.
        <Link className="button-link button-link--secondary" href={resultHref}>
          Kembali ke hasil
        </Link>
      </Status>
    );
  const questions = 'questions' in query.data ? query.data.questions : query.data.explanation;
  return (
    <>
      {keepTryoutReview && query.isError && (
        <div className="tryout-review-notice" role="status">
          Pembahasan belum dapat diperbarui.
          <Button
            variant="secondary"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Coba lagi
          </Button>
        </div>
      )}
      <AssessmentExplanation
        key={attemptId}
        kind={kind}
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
    </>
  );
}
