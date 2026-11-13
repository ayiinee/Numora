'use client';
import { formatStudentNumber } from './student-format';

import { StudentMascot } from '@/components/student-mascot';

import Link from 'next/link';
import { Card, Icon, ProgressBar } from '@tka/ui';
import { AssessmentHeader } from './assessment-presentation';
import { RewardSummary } from './reward-summary';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useRef } from 'react';
import { learningApi } from './api';
import type { DrillAttempt, DrillResult } from './types';
import { AssessmentSession } from './assessment-session';
import { DataState, LearningFrame, Panel, PrimaryButton, Status, StudentGate } from './ui';
import { RecommendedVideos } from './support';
import { useDrillClock } from './use-drill-clock';

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
  const pauseClock = useDrillClock(token, attemptId, query.data?.clock);
  const resume = useMutation({
    mutationFn: (levelId: string) => learningApi.start(token, levelId),
    onSuccess: (attempt) => {
      queryClient.setQueryData(['attempt', attempt.id], attempt);
      if (attempt.id !== attemptId) router.replace(`/student/drill/${attempt.id}`);
    },
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
  if (query.data.clock?.sessionId === null) {
    const { clock, levelId, levelTitle } = query.data;
    return (
      <section className="drill-paused" aria-labelledby="drill-paused-title">
        <Panel className="drill-paused__card">
          <StudentMascot pose="practice" />
          <div className="drill-paused__heading">
            <h1 id="drill-paused-title">Latihan dijeda</h1>
            <p>{levelTitle}</p>
          </div>
          <p className="drill-paused__description">
            Jawabanmu tersimpan. Waktu latihan akan berjalan lagi saat kamu melanjutkan.
          </p>
          <div
            className="drill-paused__duration"
            role="group"
            aria-labelledby="drill-paused-duration"
          >
            <span id="drill-paused-duration">
              <Icon name="clock" width={18} height={18} /> Waktu tersimpan
            </span>
            <strong>{formatDrillElapsed(Math.floor(clock.elapsedMs / 1000))}</strong>
          </div>
          <div className="drill-paused__actions">
            <PrimaryButton
              fullWidth
              disabled={resume.isPending}
              onClick={() => resume.mutate(levelId)}
            >
              {resume.isPending ? 'Membuka latihan…' : 'Lanjutkan latihan'}
            </PrimaryButton>
            {resume.error && <p role="alert">{resume.error.message}</p>}
            <Link href="/student/learn">Kembali ke latihan</Link>
          </div>
        </Panel>
      </section>
    );
  }
  return (
    <DrillForm
      key={query.data.id}
      attempt={query.data}
      token={token}
      onExitConfirmed={pauseClock}
      onComplete={() => {
        void queryClient.invalidateQueries({ queryKey: ['student-progress'] });
        void queryClient.invalidateQueries({ queryKey: ['student-dashboard'] });
        void queryClient.invalidateQueries({ queryKey: ['student-materials'] });
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
  onExitConfirmed,
}: {
  attempt: DrillAttempt;
  token: string;
  onComplete: () => void;
  onExitConfirmed?: (() => void) | undefined;
}) {
  return (
    <AssessmentSession
      redesign
      title={attempt.levelTitle}
      questions={attempt.questions}
      headerExtra={
        <DrillTimer
          startedAt={attempt.startedAt}
          serverTime={attempt.serverTime}
          clock={attempt.clock}
        />
      }
      onExitConfirmed={onExitConfirmed}
      submitLabel="Kirim Drill"
      confirmMessage={(emptyCount) =>
        emptyCount === 0
          ? 'Semua soal sudah dijawab. Kirim Drill sekarang?'
          : `${emptyCount} soal belum dijawab. Kirim Drill sekarang?`
      }
      loadMedia={async (questionId, phase, assetIds) =>
        (await learningApi.media(token, attempt.id, questionId, phase, assetIds)).media
      }
      onSaveTyped={(questionId, optionId) =>
        learningApi.saveAnswer(token, attempt.id, questionId, optionId)
      }
      onSubmit={() => learningApi.submit(token, attempt.id)}
      onSubmitted={onComplete}
    />
  );
}

function formatDrillElapsed(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function DrillTimer({
  startedAt,
  serverTime,
  clock,
}: {
  startedAt: string;
  serverTime?: string | undefined;
  clock?: DrillAttempt['clock'];
}) {
  const [elapsed, setElapsed] = useState<number | null>(null);
  useEffect(() => {
    if (clock) {
      const received = performance.now();
      const tick = () =>
        setElapsed(
          Math.floor(
            (clock.elapsedMs + Math.min(clock.remainingMs, performance.now() - received)) / 1000,
          ),
        );
      tick();
      if (!clock.sessionId) return;
      const timer = window.setInterval(tick, 250);
      return () => window.clearInterval(timer);
    }
    if (!serverTime) {
      setElapsed(null);
      return;
    }
    const start = Date.parse(startedAt);
    const receivedTime = Date.parse(serverTime);
    if (!Number.isFinite(start) || !Number.isFinite(receivedTime)) {
      setElapsed(null);
      return;
    }
    const received = performance.now();
    const tick = () =>
      setElapsed(
        Math.max(0, Math.floor((receivedTime - start + performance.now() - received) / 1000)),
      );
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, serverTime, clock]);
  if (elapsed === null) return <span>Waktu: --:--</span>;
  return (
    <span aria-label={clock?.sessionId === null ? 'Waktu tersimpan' : 'Waktu berjalan'}>
      <Icon name="clock" width={14} height={14} /> {formatDrillElapsed(elapsed)}
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
  const query = useQuery({
    queryKey: ['result', attemptId],
    queryFn: () => learningApi.result(token, attemptId),
  });
  if (query.isPending || query.isError)
    return (
      <DataState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    );
  const result = query.data;
  return (
    <div className="practice-session drill-result">
      <AssessmentHeader
        progressLabel="Latihan selesai"
        title="Hasil Latihan Level"
        status="Hasil tersimpan"
        progress={100}
      />

      <div className="drill-result__layout">
        <div className="drill-result__summary">
          <ResultSummary result={result} />
          <RewardSummary
            kind="drill"
            xp={result.xp ?? result.reward?.totalXp ?? null}
            reward={result.reward}
          />
        </div>
        <div className="drill-result__review">
          <Card className="explanation-entry">
            <h2>
              {result.explanationState === 'available'
                ? 'Pembahasan soal'
                : 'Pembahasan tidak tersedia'}
            </h2>
            {result.explanationState === 'available' ? (
              <>
                <p>Lihat jawabanmu, kunci, dan pembahasan setiap soal.</p>
                <Link className="button-link" href={`/student/drill/${attemptId}/explanation`}>
                  Lihat pembahasan
                </Link>
              </>
            ) : (
              <p>
                Pembahasan tidak tersedia untuk latihan ini. Nilai dan riwayat hasil tetap
                tersimpan.
              </p>
            )}
          </Card>
          {!result.mastered && <RecommendedVideos token={token} attemptId={attemptId} />}
        </div>
      </div>
      <div className="drill-result__actions">
        <StartDrill token={token} levelId={result.levelId} retry />
        {result.unlockedLevelId && <ContinueDrill token={token} levelId={result.unlockedLevelId} />}
      </div>
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
  const queryClient = useQueryClient();
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
      queryClient.setQueryData(['attempt', attempt.id], attempt);
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
      <StudentMascot pose={result.mastered ? 'mastered' : 'practice'} />
      <p className="result-mastery">{result.mastered ? 'Tuntas' : 'Belum tuntas'}</p>
      <div className="result-score">
        {formatStudentNumber(result.score)}
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
        <p className="result-stars-pending">Bintang tidak tercatat pada hasil versi lama.</p>
      )}
      <div className="result-threshold">
        <span>Skor minimal tuntas: 80</span>
        <strong>Capaian: {formatStudentNumber(result.score)}%</strong>
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
