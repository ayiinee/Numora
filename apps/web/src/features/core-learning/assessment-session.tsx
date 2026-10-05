'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Card, Icon, ProgressBar } from '@tka/ui';
import { useRef, useState, type ReactNode } from 'react';
import type { DrillQuestion } from './types';
import { Panel, PrimaryButton, Status } from './ui';
import { useUnsavedWarning } from './use-unsaved-warning';
import { useAssessmentDeadline } from './use-assessment-deadline';
import { AssessmentHeader, SubmitConfirmation } from './assessment-presentation';
import { QuestionChoices } from './question-choices';

import type { SavedAnswerDto, PreviewMediaDto } from './generated-types';
import { ContentRichText } from '@/components/content-rich-text';
type ContentAnswer = SavedAnswerDto['answer'];
type Selection = string | string[] | Record<string, string> | null;
type SavedAnswer = Pick<SavedAnswerDto, 'questionInstanceId' | 'selectedOptionId'> & {
  answer?: ContentAnswer;
};
function selection(answer: ContentAnswer): Selection {
  if (!answer) return null;
  if ('optionId' in answer) return answer.optionId;
  if ('optionIds' in answer) return answer.optionIds.length ? answer.optionIds : null;
  return Object.keys(answer.categoryByStatementId).length ? answer.categoryByStatementId : null;
}
function contentAnswer(value: Selection): ContentAnswer {
  if (typeof value === 'string') return { optionId: value };
  if (Array.isArray(value)) return value.length ? { optionIds: [...value].sort() } : null;
  return value && Object.keys(value).length
    ? {
        categoryByStatementId: Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        ),
      }
    : null;
}
function equalSelection(a: Selection, b: Selection) {
  return JSON.stringify(contentAnswer(a)) === JSON.stringify(contentAnswer(b));
}

export function AssessmentSession({
  title,
  questions,
  headerExtra,
  notice,
  submitLabel,
  confirmMessage,
  onSave,
  onSaveContent,
  loadMedia,
  onSubmit,
  onSubmitted,
  deadlineAt,
  serverTime,
  onFinalizationCheck,
  redesign = false,
  sessionKind = 'drill',
}: {
  title: string;
  questions: DrillQuestion[];
  headerExtra?: ReactNode;
  notice?: ReactNode;
  submitLabel: string;
  confirmMessage: (emptyCount: number) => string;
  onSave: (questionId: string, optionId: string | null) => Promise<SavedAnswer>;
  onSaveContent?: (questionId: string, answer: ContentAnswer) => Promise<SavedAnswer>;
  loadMedia?: (questionId: string, phase: 'WORK', assetIds: string[]) => Promise<PreviewMediaDto[]>;
  onSubmit: () => Promise<unknown>;
  onSubmitted: () => void;
  deadlineAt?: string | null | undefined;
  serverTime?: string | undefined;
  onFinalizationCheck?: () => void;
  redesign?: boolean;
  sessionKind?: 'drill' | 'tryout';
}) {
  const [index, setIndex] = useState(0);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Record<string, Selection>>(() =>
    Object.fromEntries(
      questions.map((question) => [
        question.questionInstanceId,
        question.answer === undefined ? question.selectedOptionId : selection(question.answer),
      ]),
    ),
  );
  const [unsaved, setUnsaved] = useState<{ questionId: string; optionId: Selection } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saving = useRef(false);
  const save = useMutation({
    // Fail visibly when already offline instead of silently pausing the save queue.
    // Only a server acknowledgement may clear unsaved state; retry remains explicit.
    networkMode: 'always',
    mutationFn: ({ questionId, optionId }: { questionId: string; optionId: Selection }) =>
      onSaveContent
        ? onSaveContent(questionId, contentAnswer(optionId))
        : typeof optionId === 'string' || optionId === null
          ? onSave(questionId, optionId)
          : Promise.reject(new Error('Kontrak jawaban PGK belum tersedia.')),
  });
  const finalizing = useRef(false);
  const submit = useMutation({
    mutationFn: onSubmit,
    onSuccess: onSubmitted,
    onError: () => onFinalizationCheck?.(),
  });
  function finalize() {
    if (finalizing.current) return;
    finalizing.current = true;
    submit.mutate(undefined, {
      onError: () => {
        finalizing.current = false;
      },
    });
  }
  const deadline = useAssessmentDeadline(deadlineAt, finalize, serverTime);
  const question = questions[index];
  useUnsavedWarning(
    !submit.isSuccess && unsaved !== null,
    sessionKind === 'drill' && !submit.isSuccess,
  );
  const workText = [
    question?.richStem?.text ?? question?.stem ?? '',
    ...(question?.richOptions?.map((o) => o.content.text) ??
      question?.options.map((o) => o.text) ??
      []),
  ];
  const assetIds = [
    ...new Set(
      workText.flatMap((text) =>
        [...text.matchAll(/\[\[asset:([A-Za-z0-9_-]+)\]\]/g)].map((match) => match[1]!),
      ),
    ),
  ];
  const media = useQuery({
    queryKey: ['assessment-work-media', question?.questionInstanceId, assetIds],
    enabled: !!loadMedia && !!question && assetIds.length > 0,
    queryFn: () => loadMedia!(question!.questionInstanceId, 'WORK', assetIds),
    retry: false,
  });
  const renderContent = (text: string) => (
    <ContentRichText text={text} media={media.data ?? []} retry={() => void media.refetch()} />
  );
  const choiceOptions =
    question?.richOptions?.map((o) => ({ id: o.id, text: o.content.text })) ??
    question?.options ??
    [];
  const kind = question?.type ?? 'SINGLE_CHOICE';
  const choices = (disabled: boolean) => (
    <QuestionChoices
      kind={kind}
      name={`answer-${question!.questionInstanceId}`}
      options={choiceOptions}
      statements={choiceOptions}
      categories={question?.categories?.map((c) => ({ id: c.id, text: c.label })) ?? []}
      value={answers[question!.questionInstanceId] ?? null}
      disabled={disabled}
      renderContent={renderContent}
      onChange={(value) => void choose(question!.questionInstanceId, value)}
    />
  );
  useUnsavedWarning(unsaved !== null);

  if (!question)
    return <Status title="Soal belum tersedia">Paket soal belum siap. Coba lagi nanti.</Status>;
  const emptyCount = questions.filter((item) => !answers[item.questionInstanceId]).length;

  async function choose(questionId: string, optionId: Selection) {
    if (
      deadline.expired ||
      finalizing.current ||
      saving.current ||
      (unsaved && unsaved.questionId !== questionId)
    )
      return;
    optionId = selection(contentAnswer(optionId));
    saving.current = true;
    setAnswers((previous) => ({ ...previous, [questionId]: optionId }));
    setUnsaved({ questionId, optionId });
    setSaveError(null);
    try {
      const acknowledged = await save.mutateAsync({ questionId, optionId });
      if (
        acknowledged.questionInstanceId !== questionId ||
        !equalSelection(
          acknowledged.answer === undefined
            ? acknowledged.selectedOptionId
            : selection(acknowledged.answer),
          optionId,
        )
      ) {
        throw new Error('Konfirmasi penyimpanan tidak sesuai. Coba simpan lagi.');
      }
      setUnsaved(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Jawaban belum tersimpan.');
    } finally {
      saving.current = false;
    }
  }

  function confirmSubmit() {
    if (deadline.expired || unsaved || saving.current || finalizing.current) return;
    if (redesign) setConfirmationOpen(true);
    else if (window.confirm(confirmMessage(emptyCount))) finalize();
  }

  if (redesign) {
    const disabled =
      save.isPending ||
      deadline.expired ||
      submit.isPending ||
      submit.isSuccess ||
      (!!unsaved && unsaved.questionId !== question.questionInstanceId);
    const empty = questions.flatMap((item, position) =>
      answers[item.questionInstanceId] ? [] : [position + 1],
    );
    const flagged = questions.flatMap((item, position) =>
      flags[item.questionInstanceId] ? [position + 1] : [],
    );
    return (
      <div className="practice-session">
        <AssessmentHeader
          title={sessionKind === 'tryout' ? 'Sesi Tryout TKA' : 'Sesi Latihan Soal'}
          exitHref={sessionKind === 'tryout' ? '/student/tryout' : '/student/learn'}
          status={
            <span role="status">
              {save.isPending ? 'Menyimpan…' : saveError ? 'Belum tersimpan' : 'Tersimpan'}
            </span>
          }
          timer={
            sessionKind === 'tryout' ? (
              deadline.remaining !== null ? (
                <span role="timer" aria-label="Sisa waktu Tryout">
                  <Icon name="clock" width={14} height={14} />
                  {String(Math.floor(deadline.remaining / 60)).padStart(2, '0')}:
                  {String(deadline.remaining % 60).padStart(2, '0')}
                </span>
              ) : (
                <span>Timer belum tersedia</span>
              )
            ) : (
              headerExtra
            )
          }
          progress={(100 * (index + 1)) / questions.length}
          exitDisabled={submit.isPending}
        />
        {submit.isPending && (
          <p role="status" className="practice-finalization-status">
            Mengirim jawaban…
          </p>
        )}
        {deadline.expired && (
          <p role="status" className="practice-finalization-status">
            Waktu berakhir. Server menggunakan jawaban yang telah diterima.
          </p>
        )}
        <div className="practice-layout">
          <div className="practice-main">
            {notice}
            <div className="practice-breadcrumb">
              <span>{title}</span>
              <a href="#practice-navigator">
                <Icon name="menu" width={16} height={16} />
                Semua Soal
              </a>
            </div>
            <Card className="practice-question">
              <div className="practice-question__tags">
                <span>
                  Soal {index + 1} dari {questions.length}
                </span>
                <span>
                  {kind === 'CATEGORY'
                    ? 'Kategori'
                    : kind === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER'
                      ? 'Pilih semua jawaban'
                      : 'Pilihan ganda'}
                </span>
              </div>
              <h2 className="practice-stem">
                {renderContent(question.richStem?.text ?? question.stem)}
              </h2>
              {choices(disabled)}
              <div className="practice-question__footer">
                <label>
                  <input
                    type="checkbox"
                    checked={!!flags[question.questionInstanceId]}
                    disabled={deadline.expired || submit.isPending || submit.isSuccess}
                    onChange={(event) =>
                      setFlags((previous) => ({
                        ...previous,
                        [question.questionInstanceId]: event.target.checked,
                      }))
                    }
                  />
                  Tandai Ragu-ragu
                </label>
                {answers[question.questionInstanceId] && (
                  <button
                    disabled={disabled}
                    onClick={() => void choose(question.questionInstanceId, null)}
                  >
                    Kosongkan jawaban
                  </button>
                )}
              </div>
            </Card>
            {saveError && !deadline.expired && (
              <Status title="Jawaban belum tersimpan">
                <p role="alert">{saveError}</p>
                <Button
                  variant="secondary"
                  disabled={save.isPending || submit.isPending || submit.isSuccess}
                  onClick={() => unsaved && void choose(unsaved.questionId, unsaved.optionId)}
                >
                  Coba simpan lagi
                </Button>
              </Status>
            )}
            <p className="practice-save-notice">
              Hanya jawaban berstatus Tersimpan yang telah diterima server. Refresh atau keluar
              dapat menghilangkan perubahan yang belum tersimpan.
            </p>
            {submit.isError && (!confirmationOpen || deadline.expired) && (
              <div>
                <p role="alert" className="form-error">
                  {submit.error.message} Coba kirim lagi.
                </p>
                {deadline.expired && (
                  <Button variant="secondary" disabled={submit.isPending} onClick={finalize}>
                    Periksa pengiriman akhir
                  </Button>
                )}
              </div>
            )}
          </div>
          <aside className="practice-toolbar" id="practice-navigator">
            <nav aria-label="Navigasi soal" className="practice-numbers">
              {questions.map((item, position) => (
                <button
                  key={item.questionInstanceId}
                  aria-current={index === position ? 'step' : undefined}
                  aria-label={`Soal ${position + 1}${answers[item.questionInstanceId] ? ', terjawab' : ', kosong'}${flags[item.questionInstanceId] ? ', ragu' : ''}`}
                  className={`${answers[item.questionInstanceId] ? 'is-answered' : ''} ${flags[item.questionInstanceId] ? 'is-flagged' : ''}`}
                  onClick={() => setIndex(position)}
                >
                  {position + 1}
                </button>
              ))}
            </nav>
            <div className="practice-actions">
              <Button
                variant="secondary"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                <Icon name="back" width={16} height={16} />
                Sebelumnya
              </Button>
              {index < questions.length - 1 ? (
                <Button onClick={() => setIndex(index + 1)}>
                  Berikutnya
                  <Icon name="chevron" width={16} height={16} />
                </Button>
              ) : (
                <Button
                  disabled={
                    deadline.expired ||
                    !!unsaved ||
                    save.isPending ||
                    submit.isPending ||
                    submit.isSuccess
                  }
                  onClick={confirmSubmit}
                >
                  {submitLabel}
                </Button>
              )}
            </div>
          </aside>
        </div>
        <SubmitConfirmation
          open={confirmationOpen && !submit.isSuccess && !deadline.expired}
          title={
            sessionKind === 'tryout' ? 'Kumpulkan Tryout Sekarang?' : 'Kumpulkan Latihan Sekarang?'
          }
          onClose={() => setConfirmationOpen(false)}
          onConfirm={() => {
            if (!unsaved && !saving.current) finalize();
          }}
          total={questions.length}
          empty={empty}
          flagged={flagged}
          description={confirmMessage(emptyCount)}
          pending={submit.isPending}
          error={submit.isError ? submit.error.message : undefined}
        />
      </div>
    );
  }

  return (
    <div className="assessment-session space-y-5">
      {notice}
      <p className="text-sm text-slate-700">
        Hanya jawaban berstatus Tersimpan yang telah diterima server. Refresh atau keluar dapat
        menghilangkan perubahan yang belum tersimpan; jawaban tersimpan dimuat saat sesi dibuka
        kembali.
      </p>
      <Panel className="assessment-meta flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="font-semibold">
          {title} · Soal {index + 1} dari {questions.length}
        </span>
        {headerExtra}
        {deadline.remaining !== null && (
          <span role="timer" aria-label="Sisa waktu TryOut">
            {Math.floor(deadline.remaining / 60)}:{String(deadline.remaining % 60).padStart(2, '0')}
          </span>
        )}
        <span role="status" className={saveError ? 'text-red-700' : 'text-slate-700'}>
          {save.isPending ? 'Menyimpan…' : saveError ? 'Belum tersimpan' : 'Tersimpan'}
        </span>
      </Panel>
      <ProgressBar
        value={questions.length - emptyCount}
        max={questions.length}
        label={`${questions.length - emptyCount} dari ${questions.length} soal dijawab`}
        showLabel
      />
      <Panel className="assessment-question">
        <h2 className="text-lg font-bold">
          {renderContent(question.richStem?.text ?? question.stem)}
        </h2>
        {choices(
          save.isPending ||
            deadline.expired ||
            submit.isPending ||
            submit.isSuccess ||
            (!!unsaved && unsaved.questionId !== question.questionInstanceId),
        )}
        {answers[question.questionInstanceId] && (
          <button
            className="mt-3 min-h-11 text-sm font-semibold text-[var(--numora-purple)] underline"
            disabled={
              deadline.expired ||
              submit.isPending ||
              submit.isSuccess ||
              save.isPending ||
              (!!unsaved && unsaved.questionId !== question.questionInstanceId)
            }
            onClick={() => void choose(question.questionInstanceId, null)}
          >
            Kosongkan jawaban
          </button>
        )}
      </Panel>
      {saveError && !deadline.expired && (
        <Status title="Jawaban belum tersimpan">
          <p role="alert">{saveError}</p>
          <button
            className="mt-3 min-h-11 font-semibold text-[var(--numora-purple)] underline"
            onClick={() => unsaved && void choose(unsaved.questionId, unsaved.optionId)}
          >
            Coba simpan lagi
          </button>
        </Status>
      )}
      <nav aria-label="Navigasi soal" className="assessment-question-nav flex flex-wrap gap-2">
        {questions.map((item, position) => (
          <button
            key={item.questionInstanceId}
            aria-current={index === position ? 'step' : undefined}
            aria-label={`Soal ${position + 1}${answers[item.questionInstanceId] ? ', terjawab' : ', kosong'}`}
            className={`min-h-11 min-w-11 rounded-lg border font-semibold ${index === position ? 'border-[var(--numora-purple)] bg-purple-100' : 'border-slate-300 bg-white'}`}
            onClick={() => setIndex(position)}
          >
            {position + 1}
          </button>
        ))}
      </nav>
      <div className="assessment-actions flex flex-wrap justify-between gap-3">
        <button
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 font-semibold disabled:opacity-50"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          Sebelumnya
        </button>
        {index < questions.length - 1 ? (
          <PrimaryButton onClick={() => setIndex(index + 1)}>Berikutnya</PrimaryButton>
        ) : (
          <PrimaryButton
            disabled={
              deadline.expired ||
              !!unsaved ||
              save.isPending ||
              submit.isPending ||
              submit.isSuccess
            }
            onClick={confirmSubmit}
          >
            {submitLabel}
          </PrimaryButton>
        )}
      </div>
      {submit.isPending && (
        <p role="status" className="text-sm">
          Mengirim jawaban…
        </p>
      )}
      {submit.isError && (
        <div>
          <p role="alert" className="text-sm text-red-700">
            {submit.error.message}{' '}
            {deadline.expired
              ? 'Waktu berakhir. Server menggunakan jawaban yang telah diterima.'
              : 'Coba kirim lagi.'}
          </p>
          {deadline.expired && (
            <button
              className="min-h-11 font-semibold underline"
              disabled={submit.isPending}
              onClick={finalize}
            >
              Periksa pengiriman akhir
            </button>
          )}
        </div>
      )}
    </div>
  );
}
