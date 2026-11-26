'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Card, Dialog, Icon, ProgressBar } from '@tka/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DrillQuestion } from './types';
import { Panel, PrimaryButton, Status } from './ui';
import { useUnsavedWarning } from './use-unsaved-warning';
import { useBlockReleaseReload } from '@/components/release-update';
import { useAssessmentDeadline } from './use-assessment-deadline';
import { LearningApiError } from './api';
import {
  AssessmentExitDialog,
  AssessmentHeader,
  SubmitConfirmation,
} from './assessment-presentation';
import { QuestionChoices } from './question-choices';
import { AssessmentQuestionMap, type TryoutQuestionState } from './tryout-question-map';
import { readTryoutResume, writeTryoutResume } from './tryout-resume';

import { ContentRichText } from '@/components/content-rich-text';
import type { SavedAnswerDto, PreviewMediaDto } from './generated-types';
import {
  answerOf,
  assessmentAssetIds,
  assessmentOptions,
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
  loadMedia,
  onSubmit,
  onSubmitted,
  onExitConfirmed,
  deadlineAt,
  serverTime,
  onFinalizationCheck,
  onReload,
  resumeKey,
  redesign = false,
  sessionKind = 'drill',
  exitHref = sessionKind === 'tryout' ? '/student/tryout' : '/student/learn',
  exitLabel,
}: {
  title: string;
  questions: DrillQuestion[];
  headerExtra?: ReactNode;
  notice?: ReactNode;
  submitLabel: string;
  confirmMessage: (emptyCount: number) => string;
  onSave?: (questionId: string, optionId: string | null) => Promise<SavedAnswer>;
  onSaveTyped?: (questionId: string, answer: AssessmentAnswer) => Promise<SavedAnswer>;
  loadMedia?: (questionId: string, phase: 'WORK', assetIds: string[]) => Promise<PreviewMediaDto[]>;
  onSubmit: () => Promise<unknown>;
  onSubmitted: () => void;
  onExitConfirmed?: (() => void) | undefined;
  deadlineAt?: string | null | undefined;
  serverTime?: string | undefined;
  onFinalizationCheck?: () => void;
  onReload?: () => void;
  resumeKey?: string | undefined;
  redesign?: boolean;
  sessionKind?: 'drill' | 'tryout' | 'pretest';
  exitHref?: string;
  exitLabel?: string;
}) {
  const isTryout = sessionKind === 'tryout';
  const focusedLayout = redesign && sessionKind !== 'pretest';
  const [resume] = useState(() =>
    resumeKey
      ? readTryoutResume(
          resumeKey,
          questions.map((item) => item.questionInstanceId),
          !!deadlineAt && Date.parse(deadlineAt) <= Date.parse(serverTime ?? ''),
        )
      : undefined,
  );
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      questions.findIndex((item) => item.questionInstanceId === resume?.questionId),
    ),
  );
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapSubmitOpen, setMapSubmitOpen] = useState(false);
  const sessionRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusedLayout) return;
    const session = sessionRef.current;
    const header = session?.querySelector('.practice-header');
    const feedback = feedbackRef.current;
    if (!session || !header || !feedback || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      session.style.setProperty(
        '--tryout-session-header-height',
        `${header.getBoundingClientRect().height}px`,
      );
      session.style.setProperty(
        '--tryout-session-feedback-height',
        `${feedback.getBoundingClientRect().height}px`,
      );
    });
    observer.observe(header);
    observer.observe(feedback);
    return () => observer.disconnect();
  }, [focusedLayout]);
  const navigator = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navigator.current;
    const active = nav?.querySelector<HTMLButtonElement>('[aria-current="step"]');
    if (nav && active && nav.scrollWidth > nav.clientWidth) {
      nav.scrollTo?.({
        left: active.offsetLeft - nav.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2,
        behavior: 'smooth',
      });
    }
  }, [index]);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [flags, setFlags] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((resume?.flagged ?? []).map((id) => [id, true])),
  );
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
    ...(isTryout && { networkMode: 'always' as const }),
    mutationFn: onSubmit,
    onSuccess: () => {
      if (resumeKey) writeTryoutResume(resumeKey);
      onSubmitted();
    },
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
  useBlockReleaseReload(!submit.isSuccess && (unsaved !== null || submit.isPending));
  const question = questions[index];
  useEffect(() => {
    if (!resumeKey || !question || submit.isSuccess || deadline.expired) return;
    writeTryoutResume(resumeKey, {
      questionId: question.questionInstanceId,
      flagged: Object.keys(flags).filter((id) => flags[id]),
    });
  }, [resumeKey, question, flags, submit.isSuccess, deadline.expired]);
  const exitDialog = useUnsavedWarning(
    !submit.isSuccess && unsaved !== null,
    sessionKind === 'drill' && !submit.isSuccess,
    sessionKind === 'drill' && !submit.isSuccess ? onExitConfirmed : undefined,
    {
      customDialog: true,
      confirmNavigation: isTryout && !deadline.expired && !submit.isPending && !submit.isSuccess,
      ...(isTryout && {
        message: `Waktu tetap berjalan. Kamu bisa melanjutkan jawaban yang sudah tersimpan selama sesi masih aktif.${unsaved ? ' Perubahan terakhir belum tersimpan dan dapat hilang.' : ''}`,
      }),
    },
  );

  const emptyCount = questions.filter((item) =>
    emptyAnswer(answers[item.questionInstanceId] ?? null),
  ).length;

  const options = question ? assessmentOptions(question) : [];
  const stem = question?.richStem?.text ?? question?.stem ?? '';
  const assetIds = assessmentAssetIds([stem, ...options.map((option) => option.text)]);
  const media = useQuery({
    queryKey: ['assessment-work-media', question?.questionInstanceId, assetIds],
    enabled: !!loadMedia && !!question && assetIds.length > 0,
    queryFn: () => loadMedia!(question!.questionInstanceId, 'WORK', assetIds),
    retry: false,
  });
  if (!question)
    return <Status title="Soal belum tersedia">Paket soal belum siap. Coba lagi nanti.</Status>;
  const renderContent = (text: string, layout: 'default' | 'reading' | 'choice' = 'default') => (
    <ContentRichText
      text={text}
      media={media.data ?? []}
      mediaPending={!!loadMedia && media.isFetching}
      retry={() => void media.refetch()}
      layout={layout}
    />
  );
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
      if (
        onReload &&
        error instanceof LearningApiError &&
        error.code === 'ANSWER_REVISION_CONFLICT'
      )
        setSaveConflict(true);
      if (
        isTryout &&
        error instanceof LearningApiError &&
        (error.code === 'TRYOUT_DEADLINE_PASSED' || error.code === 'ATTEMPT_COMPLETED')
      )
        onFinalizationCheck?.();
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

  function goToQuestion(position: number) {
    setIndex(position);
    setMapOpen(false);
    setMapSubmitOpen(false);
    setConfirmationOpen(false);
    if (focusedLayout) {
      requestAnimationFrame(() => {
        const heading = questionHeading.current;
        heading?.focus({ preventScroll: true });
        heading?.scrollIntoView?.({ block: 'start' });
      });
    }
  }

  function retrySave() {
    if (
      saveConflict &&
      window.confirm(
        'Muat jawaban terbaru dari server? Perubahan lokal yang belum tersimpan akan diganti.',
      )
    )
      onReload?.();
    else if (!saveConflict && unsaved) void choose(unsaved.questionId, unsaved.answer);
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
    const questionStates = questions.map((item): TryoutQuestionState => {
      if (item.questionInstanceId === unsaved?.questionId) return saveError ? 'failed' : 'saving';
      const answer = answers[item.questionInstanceId] ?? null;
      if (emptyAnswer(answer)) return 'empty';
      return incompleteCategory(item, answer) ? 'incomplete' : 'saved';
    });
    const savedCount = questionStates.filter((state) => state === 'saved').length;
    const unsavedPosition =
      questions.findIndex((item) => item.questionInstanceId === unsaved?.questionId) + 1;
    const warning =
      deadline.remaining !== null && deadline.remaining > 0 && deadline.remaining <= 60;
    const canSubmit = !deadline.expired && !unsaved && !submit.isPending && !submit.isSuccess;
    const renderMap = (fromDialog: boolean) => (
      <AssessmentQuestionMap
        items={questionStates.map((state, position) => ({
          state,
          flagged: !!flags[questions[position]!.questionInstanceId],
        }))}
        current={index}
        onSelect={goToQuestion}
        {...(isTryout && {
          canSubmit,
          onSubmit: () => {
            setMapSubmitOpen(fromDialog);
            confirmSubmit();
          },
        })}
      />
    );
    return (
      <div
        ref={sessionRef}
        className={'practice-session' + (focusedLayout ? ' assessment-workspace' : '')}
        data-session-kind={sessionKind}
      >
        <AssessmentHeader
          title={
            sessionKind === 'pretest'
              ? 'Sesi Pretest Bab'
              : sessionKind === 'tryout'
                ? 'Sesi Tryout'
                : 'Sesi Latihan Soal'
          }
          exitHref={exitHref}
          {...(exitLabel && { exitLabel })}
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
                <div className="tryout-countdown" data-warning={warning}>
                  <span>Sisa waktu</span>
                  <strong role="timer" aria-label="Sisa waktu Tryout">
                    {String(Math.floor(deadline.remaining / 60)).padStart(2, '0')}:
                    {String(deadline.remaining % 60).padStart(2, '0')}
                  </strong>
                </div>
              ) : (
                <span>Timer belum tersedia</span>
              )
            ) : (
              headerExtra
            )
          }
          progress={(100 * (focusedLayout ? savedCount : index + 1)) / questions.length}
          progressLabel={focusedLayout ? 'Jawaban tersimpan' : 'Posisi soal'}
          progressText={
            focusedLayout
              ? `${savedCount} dari ${questions.length} soal terisi lengkap dan tersimpan`
              : undefined
          }
          exitDisabled={submit.isPending}
          showProfile={!focusedLayout}
        />
        {focusedLayout && (
          <div ref={feedbackRef} className="tryout-session-feedback">
            {isTryout && (
              <div role="status" className={warning ? undefined : 'sr-only'}>
                {warning && <strong>Waktu hampir habis</strong>}
              </div>
            )}
            {unsaved && !deadline.expired && !submit.isSuccess && (
              <div className="tryout-session-feedback__save">
                <div role={saveError ? 'alert' : 'status'}>
                  {saveError ? (
                    <>
                      <strong>Jawaban soal {unsavedPosition} belum tersimpan</strong>
                      <p>{saveError}</p>
                    </>
                  ) : (
                    `Menyimpan jawaban soal ${unsavedPosition}…`
                  )}
                </div>
                {saveError && (
                  <div className="assessment-save-actions">
                    <Button
                      variant="secondary"
                      disabled={save.isPending || submit.isPending || submit.isSuccess}
                      onClick={retrySave}
                    >
                      {saveConflict ? 'Muat ulang sesi' : 'Coba simpan lagi'}
                    </Button>
                    {unsavedPosition > 0 && unsavedPosition !== index + 1 && (
                      <Button variant="secondary" onClick={() => goToQuestion(unsavedPosition - 1)}>
                        Ke soal {unsavedPosition}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
            {!focusedLayout && (
              <div className="practice-breadcrumb">
                <span>{title}</span>
                <a href="#practice-navigator">
                  <Icon name="menu" width={16} height={16} />
                  Semua Soal
                </a>
              </div>
            )}
            <Card className="practice-question">
              {focusedLayout ? (
                <>
                  <div className="assessment-question-heading">
                    <div>
                      {title && <p className="assessment-question-context">{title}</p>}
                      <h2 className="assessment-question-title" ref={questionHeading} tabIndex={-1}>
                        Soal {index + 1} dari {questions.length}
                      </h2>
                    </div>
                    <span>{questionTypeLabels[question.type ?? 'SINGLE_CHOICE']}</span>
                  </div>
                  <div className="practice-stem">{renderContent(stem, 'reading')}</div>
                </>
              ) : (
                <>
                  <div className="practice-question__tags">
                    <span>
                      Soal {index + 1} dari {questions.length}
                    </span>
                    <span>{questionTypeLabels[question.type ?? 'SINGLE_CHOICE']}</span>
                  </div>
                  <h2 className="practice-stem">{renderContent(stem)}</h2>
                </>
              )}
              <QuestionChoices
                kind={question.type ?? 'SINGLE_CHOICE'}
                name={`answer-${question.questionInstanceId}`}
                options={options}
                renderContent={(text) => renderContent(text, focusedLayout ? 'choice' : 'default')}
                assessment={focusedLayout}
                value={choiceValue(answers[question.questionInstanceId] ?? null)}
                statements={options}
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
            {!focusedLayout && saveError && !deadline.expired && (
              <div className="practice-save-recovery">
                <div role="alert">
                  <strong>Jawaban belum tersimpan</strong>
                  <p>{saveError}</p>
                </div>
                <Button
                  variant="secondary"
                  disabled={save.isPending || submit.isPending || submit.isSuccess}
                  onClick={retrySave}
                >
                  {saveConflict ? 'Muat ulang sesi' : 'Coba simpan lagi'}
                </Button>
              </div>
            )}
            {focusedLayout ? (
              <div className="assessment-desktop-map">
                <h2>Peta soal</h2>
                {renderMap(false)}
              </div>
            ) : (
              <nav ref={navigator} aria-label="Navigasi soal" className="practice-numbers">
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
            )}
            <div className="practice-actions">
              <Button
                variant="secondary"
                disabled={index === 0}
                onClick={() => goToQuestion(index - 1)}
              >
                <Icon name="back" width={16} height={16} />
                Sebelumnya
              </Button>
              {focusedLayout && (
                <div className="assessment-map-trigger">
                  <Button
                    fullWidth
                    variant="secondary"
                    aria-haspopup="dialog"
                    onClick={() => setMapOpen(true)}
                  >
                    <Icon name="menu" width={16} height={16} />
                    <span>Semua Soal</span>
                  </Button>
                </div>
              )}
              {index < questions.length - 1 ? (
                <Button onClick={() => goToQuestion(index + 1)}>
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
        {focusedLayout && (
          <Dialog
            className="tryout-map-dialog"
            open={mapOpen && !confirmationOpen && !deadline.expired}
            title="Semua Soal"
            onClose={() => setMapOpen(false)}
          >
            {mapOpen && !confirmationOpen && !deadline.expired && renderMap(true)}
          </Dialog>
        )}
        <SubmitConfirmation
          open={confirmationOpen && !submit.isSuccess && !deadline.expired}
          title={
            sessionKind === 'pretest'
              ? 'Kumpulkan Pretest Sekarang?'
              : sessionKind === 'tryout'
                ? 'Kumpulkan Tryout Sekarang?'
                : 'Kumpulkan Latihan Sekarang?'
          }
          onClose={() => {
            setConfirmationOpen(false);
            setMapOpen(mapSubmitOpen);
            setMapSubmitOpen(false);
          }}
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
          onReviewQuestion={isTryout ? goToQuestion : undefined}
        />
        <AssessmentExitDialog {...exitDialog} />
      </div>
    );
  }

  return (
    <div className="assessment-session space-y-5">
      <AssessmentExitDialog {...exitDialog} />
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
        <h2 className="text-lg font-bold">{renderContent(stem)}</h2>
        <QuestionChoices
          kind={question.type ?? 'SINGLE_CHOICE'}
          name={`answer-${question.questionInstanceId}`}
          options={options}
          renderContent={(text) => renderContent(text)}
          statements={options}
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
