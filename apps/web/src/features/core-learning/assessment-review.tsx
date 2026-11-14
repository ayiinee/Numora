'use client';
import { ContentRichText } from '@/components/content-rich-text';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Dialog, Icon } from '@tka/ui';
import { AssessmentHeader } from './assessment-presentation';
import { QuestionChoices } from './question-choices';
import { answerOf, choiceValue, questionTypeLabels } from './assessment-answers';
import { learningApi, LearningApiError } from './api';
import type { ReviewedQuestionDto, DrillResultDto, TryoutResultDto } from './generated-types';
import { DataState, LearningFrame, Status, StudentGate, MathText } from './ui';
import { useLearningView } from './learning-interactions';
import { QUESTION_REPORT_CATEGORIES, ReportForm } from './support';

const labels = {
  correct: 'Benar',
  partial: 'Sebagian benar',
  incorrect: 'Salah',
  unanswered: 'Tidak dijawab',
} as const;

const tryoutReviewStates = {
  correct: { label: labels.correct, mark: '✓' },
  partial: { label: labels.partial, mark: '½' },
  incorrect: { label: labels.incorrect, mark: '×' },
  unanswered: { label: 'Kosong', mark: '○' },
  unavailable: { label: 'Penilaian tidak tersedia', mark: '–' },
} as const;

export function QuestionReviewDetail({
  question,
  renderContent = (text) => <MathText value={text} />,
  tryout = false,
}: {
  question: ReviewedQuestionDto;
  renderContent?: (text: string) => ReactNode;
  tryout?: boolean;
}) {
  const answer = answerOf(question);
  const key =
    question.answerKey ??
    (question.correctOptionId ? { optionId: question.correctOptionId } : null);
  const optionText = (id: string) =>
    question.richOptions?.find((option) => option.id === id)?.content.text ??
    question.options.find((option) => option.id === id)?.text ??
    '';
  const categoryText = (id: string | undefined) =>
    question.categories?.find((category) => category.id === id)?.text ??
    id ??
    (tryout ? 'Kosong' : 'Tidak dijawab');
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
          {tryout
            ? tryoutReviewStates[question.reviewStatus ?? 'unavailable'].label
            : question.reviewStatus
              ? labels[question.reviewStatus]
              : 'Penilaian tidak tersedia'}
        </Badge>
        {question.awardedPoints != null && question.maximumPoints != null && (
          <span>
            Poin: {question.awardedPoints.toLocaleString('id-ID', { maximumFractionDigits: 20 })} /{' '}
            {question.maximumPoints.toLocaleString('id-ID', { maximumFractionDigits: 20 })}
          </span>
        )}
      </div>
      {question.type === 'CATEGORY' ? (
        <div className="category-review-list">
          {question.options.map((statement) => {
            const status = question.statementReview?.find(
              (item) => item.statementId === statement.id,
            )?.status;
            return (
              <section className="practice-statement" key={statement.id}>
                <h3>{renderContent(optionText(statement.id))}</h3>
                <p>
                  <strong>Jawabanmu: </strong>
                  {renderContent(
                    categoryText(
                      answer && 'categoryByStatementId' in answer
                        ? answer.categoryByStatementId[statement.id]
                        : undefined,
                    ),
                  )}
                </p>
                <p>
                  <strong>Kunci: </strong>
                  {renderContent(
                    categoryText(
                      key && 'categoryByStatementId' in key
                        ? key.categoryByStatementId[statement.id]
                        : undefined,
                    ),
                  )}
                </p>
                {status && <p>{tryout ? tryoutReviewStates[status].label : labels[status]}</p>}
              </section>
            );
          })}
        </div>
      ) : tryout ? (
        <ul className="tryout-review-options" aria-label="Pilihan jawaban">
          {question.options.map((option) => {
            const review = question.optionReview?.find((item) => item.optionId === option.id);
            const selected = review?.selected ?? selectedIds.includes(option.id);
            const isKey = review?.isKey ?? expectedIds.includes(option.id);
            return (
              <li key={option.id}>
                <span className="practice-option__letter">{option.id}</span>
                <div>
                  {renderContent(optionText(option.id))}
                  {(selected || isKey) && (
                    <div className="tryout-review-option-labels">
                      {selected && <Badge variant="primary">Jawabanmu</Badge>}
                      {isKey && <Badge variant="success">Kunci</Badge>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
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
  const question = questions[index];
  if (!question)
    return (
      <Status title="Pembahasan belum tersedia">
        <Link className="button-link" href={resultHref}>
          Kembali ke hasil
        </Link>
      </Status>
    );
  const tryout = kind === 'tryout';
  function goTo(position: number) {
    setIndex(position);
    setMapOpen(false);
    if (tryout) requestAnimationFrame(() => heading.current?.focus());
  }
  const reviewMap = tryout && (
    <div className="tryout-question-map">
      <nav className="tryout-question-map__grid" aria-label="Navigasi pembahasan">
        {questions.map((item, position) => {
          const state = item.reviewStatus ?? 'unavailable';
          const { label, mark } = tryoutReviewStates[state];
          return (
            <button
              type="button"
              key={item.questionInstanceId}
              data-review={state}
              aria-current={index === position ? 'step' : undefined}
              aria-label={`Pembahasan soal ${position + 1}, ${label.toLowerCase()}`}
              onClick={() => goTo(position)}
            >
              <span>{position + 1}</span>
              <span aria-hidden="true">{mark}</span>
            </button>
          );
        })}
      </nav>
      <ul className="tryout-question-map__legend" aria-label="Legenda pembahasan">
        {Object.values(tryoutReviewStates).map(({ label, mark }) => (
          <li key={label}>
            <span aria-hidden="true">{mark} </span>
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
  const previous = (
    <Button
      variant="secondary"
      disabled={index === 0}
      onClick={() => goTo(index - 1)}
      aria-label="Sebelumnya"
    >
      {tryout && <Icon name="back" width={16} height={16} />}
      <span className="review-direction-label">Sebelumnya</span>
    </Button>
  );
  const next = (
    <Button
      disabled={index === questions.length - 1}
      onClick={() => goTo(index + 1)}
      aria-label="Berikutnya"
    >
      <span className="review-direction-label">Berikutnya</span>
      {tryout && <Icon name="arrow" width={16} height={16} />}
    </Button>
  );
  return (
    <div className={`practice-session explanation-session${tryout ? ' tryout-explanation' : ''}`}>
      {tryout ? (
        <header className="tryout-review-header">
          <Link className="practice-exit" href={resultHref} aria-label="Kembali ke hasil">
            <Icon name="back" />
          </Link>
          <h1>{title}</h1>
        </header>
      ) : (
        <>
          <AssessmentHeader
            title={title}
            exitHref={resultHref}
            status="Pembahasan — hanya baca"
            progressLabel={`Soal ${index + 1} dari ${questions.length}`}
            progress={(100 * (index + 1)) / questions.length}
          />
          <p className="practice-save-notice">
            Pembahasan mengikuti versi soal pada attempt ini. Jawaban dan hasil tersimpan tidak
            dapat diubah.
          </p>
        </>
      )}
      {tryout && (
        <nav className="tryout-review-controls" aria-label="Pindah soal pembahasan">
          {previous}
          <span>
            Soal {index + 1} dari {questions.length}
          </span>
          {next}
          <Button variant="secondary" aria-haspopup="dialog" onClick={() => setMapOpen(true)}>
            Semua Soal
          </Button>
        </nav>
      )}
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
            tryout={tryout}
            heading={heading}
          />
        </div>
        <aside className="practice-toolbar">
          <h2>{tryout ? 'Peta soal' : 'Navigasi pembahasan'}</h2>
          {tryout ? (
            reviewMap
          ) : (
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
          )}
          <div className="practice-actions">
            {previous}
            {next}
          </div>
          {!tryout && (
            <Link className="button-link button-link--secondary" href={resultHref}>
              Kembali ke hasil
            </Link>
          )}
        </aside>
      </div>
      {tryout && (
        <Dialog
          className="tryout-map-dialog"
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          title="Semua Soal"
        >
          {mapOpen && reviewMap}
        </Dialog>
      )}
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
  heading: React.Ref<HTMLHeadingElement>;
}) {
  const ids = [
    ...new Set(
      [
        question.richStem?.text ?? question.stem,
        question.richExplanation?.text ?? question.explanation,
        ...question.options.map((option) => option.text),
        ...(question.richOptions?.map((option) => option.content.text) ?? []),
        ...(question.categories?.map((category) => category.text) ?? []),
      ].flatMap((text) => [...text.matchAll(/\[\[asset:([A-Za-z0-9_-]+)\]\]/g)].map((m) => m[1]!)),
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
      renderBareMath
    />
  );
  return (
    <Card className="practice-question">
      <div className="practice-question__tags">
        <span className={tryout ? 'tryout-review-desktop-position' : undefined}>
          Soal {index + 1} dari {total}
        </span>
        <span>{questionTypeLabels[question.type ?? 'SINGLE_CHOICE']}</span>
      </div>
      <h2 ref={heading} tabIndex={-1} className="practice-stem">
        {renderContent(question.richStem?.text ?? question.stem)}
      </h2>
      {!tryout && (
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
      )}
      {report?.(question, index)}
      <QuestionReviewDetail question={question} renderContent={renderContent} tryout={tryout} />
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
      />
    );
  if (!query.data || !available)
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
