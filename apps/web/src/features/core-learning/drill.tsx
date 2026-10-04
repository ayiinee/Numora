'use client';

import Link from 'next/link';
import { Card, Icon, ProgressBar } from '@tka/ui';
import { AssessmentHeader } from './assessment-presentation';
import { DrillReview } from './drill-review';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useRef } from 'react';
import { useLearningView } from './learning-interactions';
import { learningApi } from './api';
import type { DrillAttempt, DrillResult } from './types';
import { AssessmentSession } from './assessment-session';
import { DataState, LearningFrame, Panel, PrimaryButton, Status, StudentGate } from './ui';
import { QUESTION_REPORT_CATEGORIES, RecommendedVideos, ReportForm } from './support';

export function DrillScreen() {
  const { attemptId } = useParams<{ attemptId: string }>();
  return (
    <LearningFrame title="Drill" focus className="learning-practice-shell">
      <StudentGate>{(token) => <DrillData token={token} attemptId={attemptId} />}</StudentGate>
    </LearningFrame>
  );
}

function DrillData({ token, attemptId }: { token: string; attemptId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: () => learningApi.attempt(token, attemptId),
  });
  if (query.isPending || query.isError)
    return (
      <DataState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    );
  if (query.data.status === 'completed') {
    return (
      <Status title="Drill sudah selesai">
        <Link
          className="font-semibold text-[var(--numora-purple)] underline"
          href={`/student/drill/${attemptId}/result`}
        >
          Lihat hasil tersimpan
        </Link>
      </Status>
    );
  }
  return (
    <DrillForm
      key={query.data.id}
      attempt={query.data}
      token={token}
      onComplete={() => {
        void queryClient.invalidateQueries({ queryKey: ['student-progress'] });
        void queryClient.invalidateQueries({ queryKey: ['student-dashboard'] });
        void queryClient.invalidateQueries({ queryKey: ['assessment-history'] });
        void queryClient.invalidateQueries({ queryKey: ['subchapter'] });
        router.push(`/student/drill/${attemptId}/result`);
      }}
    />
  );
}

function DrillForm({
  attempt,
  token,
  onComplete,
}: {
  attempt: DrillAttempt;
  token: string;
  onComplete: () => void;
}) {
  return (
    <AssessmentSession
      redesign
      title={attempt.levelTitle}
      questions={attempt.questions}
      headerExtra={<DrillTimer startedAt={attempt.startedAt} />}
      notice={
        attempt.isDemo ? (
          <p className="rounded-xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-950">
            Soal demo untuk uji coba. Hasil bukan ukuran kemampuan TKA resmi.
          </p>
        ) : null
      }
      submitLabel="Kirim Drill"
      confirmMessage={(emptyCount) =>
        emptyCount === 0
          ? 'Semua soal sudah dijawab. Kirim Drill sekarang?'
          : `${emptyCount} soal belum dijawab. Kirim Drill sekarang?`
      }
      onSave={(questionId, optionId) =>
        learningApi.saveAnswer(token, attempt.id, questionId, optionId)
      }
      onSubmit={() => learningApi.submit(token, attempt.id)}
      onSubmitted={onComplete}
    />
  );
}

function DrillTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (now === null) return <span>Waktu: --:--</span>;
  const elapsed = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return (
    <span aria-label="Waktu berjalan">
      <Icon name="clock" width={14} height={14} /> {Math.floor(elapsed / 60)}:
      {String(elapsed % 60).padStart(2, '0')}
    </span>
  );
}

export function ResultScreen() {
  const { attemptId } = useParams<{ attemptId: string }>();
  return (
    <LearningFrame title="Hasil Drill" focus className="learning-practice-shell">
      <StudentGate>{(token) => <ResultData token={token} attemptId={attemptId} />}</StudentGate>
    </LearningFrame>
  );
}

function ResultData({ token, attemptId }: { token: string; attemptId: string }) {
  const [selected, setSelected] = useState(0);
  const query = useQuery({
    queryKey: ['result', attemptId],
    queryFn: () => learningApi.result(token, attemptId),
  });
  useLearningView(
    token,
    'explanation_viewed',
    { attemptId },
    query.data?.explanationState === 'available',
  );
  if (query.isPending || query.isError)
    return (
      <DataState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    );
  const result = query.data;
  const question = result.questions[selected];
  return (
    <div className="practice-session drill-result">
      <AssessmentHeader
        progressLabel="Latihan selesai"
        title="Hasil Latihan Level"
        status={<span>Hasil tersimpan</span>}
        progress={100}
      />
      {result.isDemo && (
        <p className="demo-notice">Hasil latihan demo, bukan ukuran kemampuan TKA resmi.</p>
      )}
      <div className="drill-result__layout">
        <div className="drill-result__summary">
          <ResultSummary result={result} />
          <Card className="drill-rewards">
            <h2>
              <Icon name="spark" />
              Rincian XP & Poin
            </h2>
            <div className="drill-rewards__stats">
              <div>
                <span>Jawaban benar</span>
                <strong>
                  {result.correctCount} / {result.questionCount} Soal
                </strong>
              </div>
              <div>
                <span>Poin mentah</span>
                <strong>{result.rawPoints}</strong>
              </div>
            </div>
            <p>
              XP belum tersedia. Formula reward menunggu persetujuan; nilai akademik tetap
              tersimpan.
            </p>
          </Card>
        </div>
        <div className="drill-result__review">
          {result.explanationState === 'expired' ? (
            <Status title="Pembahasan tidak tersedia">
              Akses pembahasan tidak tersedia untuk attempt ini sesuai kebijakan tersimpan di
              server. Nilai dan riwayat hasil tetap tersimpan.
            </Status>
          ) : (
            <DrillReview
              result={result}
              selected={selected}
              onSelect={setSelected}
              report={
                question && (
                  <ReportForm
                    modal
                    key={question.questionInstanceId}
                    categories={QUESTION_REPORT_CATEGORIES}
                    label={`Laporkan soal ${selected + 1}`}
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
              }
            />
          )}
          {!result.mastered && <RecommendedVideos token={token} attemptId={attemptId} />}
        </div>
      </div>
      <div className="drill-result__actions">
        <StartDrill token={token} levelId={result.levelId} retry />
        {result.unlockedLevelId && <ContinueDrill token={token} levelId={result.unlockedLevelId} />}
      </div>
      <Link className="drill-result__back" href="/student/learn">
        Kembali ke materi
      </Link>
    </div>
  );
}

function ContinueDrill({ token, levelId }: { token: string; levelId: string }) {
  return <StartDrill token={token} levelId={levelId} />;
}

function StartDrill({
  token,
  levelId,
  retry = false,
}: {
  token: string;
  levelId: string;
  retry?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  async function start() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const attempt = await learningApi.start(token, levelId);
      router.push(`/student/drill/${attempt.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Level berikutnya belum dapat dimulai.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <Panel className="drill-start-action">
      <h2 className="font-bold">{retry ? 'Latih lagi level ini' : 'Lanjutkan level berikutnya'}</h2>
      <p className="my-3 text-sm text-slate-700">
        {retry
          ? 'Attempt baru menyimpan hasil terpisah. Nilai terbaik dan level yang sudah terbuka tetap dipertahankan.'
          : 'Level berikutnya sudah terbuka. Mulai latihan saat paket soal tersedia.'}
      </p>
      <PrimaryButton
        fullWidth
        variant={retry ? 'secondary' : 'primary'}
        disabled={busy}
        onClick={() => void start()}
      >
        {busy ? 'Menyiapkan Drill…' : retry ? 'Ulangi level ini' : 'Mulai level berikutnya'}
      </PrimaryButton>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </Panel>
  );
}

export function ResultSummary({ result }: { result: DrillResult }) {
  return (
    <Panel className="drill-result-summary">
      <p className="result-mastery">{result.mastered ? 'Tuntas' : 'Belum tuntas'}</p>
      <div className="result-score">
        {result.score}
        <small>/ 100</small>
      </div>
      <p className="result-level-title">{result.levelTitle}</p>
      {result.stars !== null && (
        <>
          <div className="result-stars" aria-hidden="true">
            {Array.from({ length: 3 }, (_, index) => (
              <Icon
                key={index}
                name="star"
                fill={index < result.stars! ? 'currentColor' : 'none'}
              />
            ))}
          </div>
          <p className="mt-1">Bintang: {result.stars}</p>
        </>
      )}
      {result.unlockedLevelId && (
        <p className="mt-2 font-semibold text-[var(--numora-purple)]">Level berikutnya terbuka.</p>
      )}
      {result.stars === null && (
        <p className="result-stars-pending">Bintang menunggu kebijakan penilaian.</p>
      )}
      <div className="result-threshold">
        <span>Skor minimal tuntas: 80</span>
        <strong>Capaian: {result.score}%</strong>
      </div>
      <ProgressBar
        value={result.score}
        max={100}
        variant={result.mastered ? 'success' : 'default'}
        label="Nilai latihan"
      />
    </Panel>
  );
}
