'use client';

import { useMutation } from '@tanstack/react-query';
import { Button, Card, Icon, ProgressBar } from '@tka/ui';
import { useRef, useState, type ReactNode } from 'react';
import type { DrillQuestion } from './types';
import { Panel, PrimaryButton, Status } from './ui';
import { useUnsavedWarning } from './use-unsaved-warning';
import { useAssessmentDeadline } from './use-assessment-deadline';
import { LearningApiError } from './api';
import { AssessmentHeader, SubmitConfirmation } from './assessment-presentation';
import { QuestionChoices } from './question-choices';
import { AssessmentRichText } from './assessment-rich-text';

import type { SavedAnswerDto } from './generated-types';
import {
  answerOf,
  answerFromChoice,
  choiceValue,
  emptyAnswer,
  incompleteCategory,
  acknowledgedAnswer,
  sameAnswer,
  questionTypeLabels,
  type AssessmentAnswer,
} from './assessment-answers';
type SavedAnswer = SavedAnswerDto;

export function AssessmentSession({
  title,
  questions,
  headerExtra,
  notice,
  submitLabel,
  confirmMessage,
  onSave,
  onSaveTyped,
  onSubmit,
  onSubmitted,
  deadlineAt,
  serverTime,
  onFinalizationCheck,
  onReload,
  redesign = false,
  sessionKind = 'drill',
}: {
  title: string;
  questions: DrillQuestion[];
  headerExtra?: ReactNode;
  notice?: ReactNode;
  submitLabel: string;
  confirmMessage: (emptyCount: number) => string;
  onSave?: (questionId: string, optionId: string | null) => Promise<SavedAnswer>;
  onSaveTyped?: (questionId: string, answer: AssessmentAnswer) => Promise<SavedAnswer>;
  onSubmit: () => Promise<unknown>;
  onSubmitted: () => void;
  deadlineAt?: string | null | undefined;
  serverTime?: string | undefined;
  onFinalizationCheck?: () => void;
  onReload?: () => void;
  redesign?: boolean;
  sessionKind?: 'drill' | 'tryout' | 'pretest';
}) {
  const [index, setIndex] = useState(0);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Record<string, AssessmentAnswer>>(() =>
    Object.fromEntries(
      questions.map((question) => [question.questionInstanceId, answerOf(question)]),
    ),
  );
  const [unsaved, setUnsaved] = useState<{ questionId: string; answer: AssessmentAnswer } | null>(
    null,
  );
  const pendingAnswer = useRef<{ questionId: string; answer: AssessmentAnswer } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveConflict, setSaveConflict] = useState(false);
  const saving = useRef(false);
  const save = useMutation({
    // Fail visibly when already offline instead of silently pausing the save queue.
    // Only a server acknowledgement may clear unsaved state; retry remains explicit.
    networkMode: 'always',
    mutationFn: ({ questionId, answer }: { questionId: string; answer: AssessmentAnswer }) => {
      if (onSaveTyped) return onSaveTyped(questionId, answer);
      if (onSave && (!answer || 'optionId' in answer))
        return onSave(questionId, answer?.optionId ?? null);
      throw new Error('Penyimpanan tipe soal ini belum tersedia.');
    },
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

  if (!question)
    return <Status title="Soal belum tersedia">Paket soal belum siap. Coba lagi nanti.</Status>;
  const emptyCount = questions.filter((item) =>
    emptyAnswer(answers[item.questionInstanceId] ?? null),
  ).length;

  async function choose(questionId: string, answer: AssessmentAnswer) {
    if (
      saveConflict ||
      deadline.expired ||
      finalizing.current ||
      (pendingAnswer.current && pendingAnswer.current.questionId !== questionId)
    )
      return;
    const pending = { questionId, answer };
    pendingAnswer.current = pending;
    setAnswers((previous) => ({ ...previous, [questionId]: answer }));
    setUnsaved(pending);
    setSaveError(null);
    if (saving.current) return;
    saving.current = true;
    try {
      while (pendingAnswer.current && !finalizing.current) {
        const next: { questionId: string; answer: AssessmentAnswer } = pendingAnswer.current;
        const acknowledged = await save.mutateAsync(next);
        if (
          acknowledged.questionInstanceId !== next.questionId ||
          !sameAnswer(acknowledgedAnswer(acknowledged), next.answer)
        )
          throw new Error('Konfirmasi penyimpanan tidak sesuai. Coba simpan lagi.');
        if (pendingAnswer.current === next) {
          pendingAnswer.current = null;
          setUnsaved(null);
        }
      }
    } catch (error) {
      if (error instanceof LearningApiError && error.code === 'ANSWER_REVISION_CONFLICT')
        setSaveConflict(true);
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
      saveConflict ||
      deadline.expired ||
      submit.isPending ||
      submit.isSuccess ||
      (!!unsaved && unsaved.questionId !== question.questionInstanceId);
    const empty = questions.flatMap((item, position) =>
      !emptyAnswer(answers[item.questionInstanceId] ?? null) ? [] : [position + 1],
    );
    const incomplete = questions.flatMap((item, position) =>
      incompleteCategory(item, answers[item.questionInstanceId] ?? null) ? [position + 1] : [],
    );
    const flagged = questions.flatMap((item, position) =>
      flags[item.questionInstanceId] ? [position + 1] : [],
    );
    return (
      <div className="practice-session">
        <AssessmentHeader
          title={
            sessionKind === 'pretest'
              ? 'Sesi Pretest Bab'
              : sessionKind === 'tryout'
                ? 'Sesi Tryout'
                : 'Sesi Latihan Soal'
          }
          exitHref={sessionKind === 'tryout' ? '/student/tryout' : '/student/learn'}
          status={
            <span role="status">
              {saveError
                ? 'Belum tersimpan'
                : save.isPending || unsaved
                  ? 'Menyimpan…'
                  : 'Tersimpan'}
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
                <span>{questionTypeLabels[question.type ?? 'SINGLE_CHOICE']}</span>
              </div>
              <h2 className="practice-stem">
                <AssessmentRichText
                  value={question.stem}
                  instanceId={question.questionInstanceId}
                />
              </h2>
              <QuestionChoices
                renderContent={(value) => (
                  <AssessmentRichText value={value} instanceId={question.questionInstanceId} />
                )}
                kind={question.type ?? 'SINGLE_CHOICE'}
                name={`answer-${question.questionInstanceId}`}
                options={question.options}
                value={choiceValue(answers[question.questionInstanceId] ?? null)}
                statements={question.options}
                categories={question.categories ?? []}
                disabled={disabled}
                onChange={(value) =>
                  void choose(question.questionInstanceId, answerFromChoice(question.type, value))
                }
              />
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
                {!emptyAnswer(answers[question.questionInstanceId] ?? null) && (
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
                  onClick={() => {
                    if (saveConflict) {
                      if (
                        window.confirm(
                          'Muat jawaban terbaru dari server? Perubahan lokal yang belum tersimpan akan diganti.',
                        )
                      )
                        onReload?.();
                    } else if (unsaved) void choose(unsaved.questionId, unsaved.answer);
                  }}
                >
                  {saveConflict ? 'Muat ulang sesi' : 'Coba simpan lagi'}
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
                  aria-label={`Soal ${position + 1}${incompleteCategory(item, answers[item.questionInstanceId] ?? null) ? ', belum lengkap' : !emptyAnswer(answers[item.questionInstanceId] ?? null) ? ', terjawab' : ', kosong'}${flags[item.questionInstanceId] ? ', ragu' : ''}`}
                  className={`${incompleteCategory(item, answers[item.questionInstanceId] ?? null) ? 'is-incomplete' : !emptyAnswer(answers[item.questionInstanceId] ?? null) ? 'is-answered' : ''} ${flags[item.questionInstanceId] ? 'is-flagged' : ''}`}
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
            sessionKind === 'pretest'
              ? 'Kumpulkan Pretest Sekarang?'
              : sessionKind === 'tryout'
                ? 'Kumpulkan Tryout Sekarang?'
                : 'Kumpulkan Latihan Sekarang?'
          }
          onClose={() => setConfirmationOpen(false)}
          onConfirm={() => {
            if (!pendingAnswer.current && !saving.current) finalize();
          }}
          total={questions.length}
          empty={empty}
          incomplete={incomplete}
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
          {saveError ? 'Belum tersimpan' : save.isPending || unsaved ? 'Menyimpan…' : 'Tersimpan'}
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
          <AssessmentRichText value={question.stem} instanceId={question.questionInstanceId} />
        </h2>
        <QuestionChoices
          renderContent={(value) => (
            <AssessmentRichText value={value} instanceId={question.questionInstanceId} />
          )}
          kind={question.type ?? 'SINGLE_CHOICE'}
          name={`answer-${question.questionInstanceId}`}
          options={question.options}
          statements={question.options}
          categories={question.categories ?? []}
          value={choiceValue(answers[question.questionInstanceId] ?? null)}
          disabled={
            deadline.expired ||
            submit.isPending ||
            submit.isSuccess ||
            (!!unsaved && unsaved.questionId !== question.questionInstanceId)
          }
          onChange={(value) =>
            void choose(question.questionInstanceId, answerFromChoice(question.type, value))
          }
        />
        {!emptyAnswer(answers[question.questionInstanceId] ?? null) && (
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
            onClick={() => unsaved && void choose(unsaved.questionId, unsaved.answer)}
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
            aria-label={`Soal ${position + 1}${incompleteCategory(item, answers[item.questionInstanceId] ?? null) ? ', belum lengkap' : !emptyAnswer(answers[item.questionInstanceId] ?? null) ? ', terjawab' : ', kosong'}`}
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
