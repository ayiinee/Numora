'use client';
import { TryoutBatchList } from './tryout-batches';
import type { StudentTryoutBatchesDto } from './generated-types';

import { Button, Card, EmptyState, Icon, Tabs } from '@tka/ui';
import { StudentMascot } from '@/components/student-mascot';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/onboarding/auth';
import { learningApi, LearningApiError } from './api';
import type { TryoutAttempt } from './types';
import { AssessmentSession } from './assessment-session';
import { AssessmentHeader } from './assessment-presentation';
import { useAssessmentHistory } from './assessment-queries';
import {
  refreshTryoutStatus,
  useCurrentTryout,
  useTryoutBatches,
  waitingForTryoutResult,
} from './tryout-queries';
import { tryoutResumeKey, writeTryoutResume } from './tryout-resume';
import { ActivityRow } from './cards';
import { useLearningView } from './learning-interactions';
import { PastTryoutPackages } from './tryout-packages';
import { StudentSectionHeader } from './student-section-header';
import { DataState, LearningFrame, Status, StudentGate } from './ui';
import {
  TryoutDetail,
  TryoutPackageCard,
  TryoutReleasedResult,
  TryoutWaiting,
} from './tryout-presentation';

export function TryoutScreen() {
  return <StudentGate>{(token) => <TryoutEntry token={token} />}</StudentGate>;
}

function TryoutEntry({ token, initialTab = 'current' }: { token: string; initialTab?: string }) {
  const query = useTryoutBatches(token);
  if (!query.data)
    return (
      <LearningFrame
        title="Tryout TKA"
        className="tryout-shell tryout-shell--catalog"
        mobileHeader={<StudentSectionHeader title="Tryout TKA" />}
      >
        <DataState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
      </LearningFrame>
    );
  return (
    <CurrentTryout
      key={String(query.data.routingActive)}
      token={token}
      initialTab={initialTab}
      batches={query.data.routingActive ? query.data.items : undefined}
      batchError={query.error}
      checkBatches={() => void query.refetch()}
    />
  );
}
export function LegacyTryoutHistoryScreen() {
  return <StudentGate>{(token) => <TryoutEntry token={token} initialTab="history" />}</StudentGate>;
}

function CurrentTryout({
  token,
  initialTab = 'current',
  batches,
  batchError,
  checkBatches,
}: {
  token: string;
  initialTab?: string;
  batches?: StudentTryoutBatchesDto['items'] | undefined;
  batchError: Error | null;
  checkBatches: () => void;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const [details, setDetails] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState<string | null>(null);
  const [tab, setTab] = useState(initialTab);
  const starting = useRef(false);
  const detailTitle = useRef<HTMLDivElement>(null);
  const detailsButton = useRef<HTMLButtonElement>(null);
  useLearningView(token, 'tryout_opened');
  const query = useCurrentTryout(token, !batches);
  const history = useAssessmentHistory(token, tab === 'history', undefined, 'tryout');
  const start = useMutation({
    mutationFn: (packageId: string) => learningApi.startTryout(token, packageId),
    onSuccess: (attempt) => {
      refreshTryoutStatus(client);
      router.push(`/student/tryout/${attempt.id}`);
    },
    onError: () => {
      starting.current = false;
      void query.refetch();
    },
  });
  useLearningView(
    token,
    'tryout_detail_viewed',
    { packageId: query.data?.id },
    details && !!query.data?.id,
  );
  const current = query.data;
  const available =
    current && current.state !== 'unavailable' && !!current.id && !!current.releaseAt;
  const historyRecords =
    history.data?.pages
      .flatMap((page) => page.records)
      .filter((record) => record.activity === 'tryout') ?? [];
  return (
    <LearningFrame
      title={details ? 'Detail Tryout' : 'Tryout TKA'}
      className={`tryout-shell ${details && available ? 'tryout-shell--detail' : 'tryout-shell--catalog'}`}
      focus={details && !!available}
      mobileHeader={!details ? <StudentSectionHeader title="Tryout TKA" /> : undefined}
    >
      <div ref={detailTitle} tabIndex={-1}>
        {details && available ? (
          <TryoutDetail
            key={current.id}
            current={current}
            accepted={rulesAccepted === current.id}
            onAccepted={(value) => setRulesAccepted(value ? (current.id ?? null) : null)}
            onBack={() => {
              setDetails(false);
              setRulesAccepted(null);
              requestAnimationFrame(() => detailsButton.current?.focus());
            }}
            pending={start.isPending || start.isSuccess}
            error={start.isError ? start.error.message : undefined}
            onStart={() => {
              if (
                rulesAccepted !== current.id ||
                !current.eligible ||
                !current.id ||
                starting.current
              )
                return;
              starting.current = true;
              start.mutate(current.id);
            }}
          />
        ) : (
          <>
            <div className="tryout-catalog-content">
              <Tabs
                value={tab}
                onChange={setTab}
                label="Daftar Tryout"
                items={[
                  {
                    value: 'current',
                    label: 'Jadwal',
                    content: batchError ? (
                      <DataState pending={false} error={batchError} retry={checkBatches} />
                    ) : batches ? (
                      <TryoutBatchList token={token} batches={batches} />
                    ) : query.isPending || query.isError ? (
                      <DataState
                        pending={query.isPending}
                        error={query.error}
                        retry={() => void query.refetch()}
                      />
                    ) : available &&
                      (current.state === 'resultReady' || current.state === 'waitingIrt') ? (
                      <Status title="Tryout sudah dikerjakan">
                        {current.attemptId && (
                          <Link
                            className="button-link"
                            href={`/student/tryout/${current.attemptId}/result`}
                          >
                            {current.state === 'resultReady' ? 'Lihat hasil' : 'Lihat status hasil'}
                          </Link>
                        )}
                        <Button variant="secondary" onClick={() => setTab('history')}>
                          Buka Riwayat
                        </Button>
                      </Status>
                    ) : available ? (
                      <TryoutPackageCard
                        detailsButtonRef={detailsButton}
                        current={current}
                        onDetails={() => {
                          setDetails(true);
                          requestAnimationFrame(() => detailTitle.current?.focus());
                          window.scrollTo(0, 0);
                        }}
                      />
                    ) : (
                      <Status
                        title="Paket belum tersedia"
                        illustration={<StudentMascot pose="calendar" />}
                      >
                        <p>
                          Paket Tryout yang dapat dikerjakan belum diterbitkan. Paket tersedia akan
                          muncul di sini.
                        </p>
                        <a className="button-link" href="/student/learn">
                          Latihan dulu
                          <Icon name="arrow" width={18} height={18} />
                        </a>
                      </Status>
                    ),
                  },
                  {
                    value: 'past',
                    label: 'Terlewat',
                    content: batches ? (
                      <TryoutBatchList token={token} batches={batches} history />
                    ) : (
                      <PastTryoutPackages enabled={tab === 'past'} />
                    ),
                  },
                  {
                    value: 'history',
                    label: 'Riwayat',
                    content: (
                      <section aria-label="Riwayat Tryout">
                        <h2>Riwayat Tryout</h2>
                        <p className="tryout-history-note">
                          Cek status hasil dan pembahasan Tryout yang sudah kamu kirim.
                        </p>
                        {historyRecords.some((item) => item.resultState !== 'ready') && (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              checkBatches();
                              void history.refetch();
                            }}
                          >
                            Periksa status hasil
                          </Button>
                        )}
                        {history.isPending || (history.isError && !history.data) ? (
                          <DataState
                            pending={history.isPending}
                            error={history.error}
                            retry={() => void history.refetch()}
                          />
                        ) : historyRecords.length ? (
                          <div className="activity-list">
                            {historyRecords.map((item) => (
                              <ActivityRow
                                key={item.attemptId}
                                item={item}
                                tryoutStatusAction
                                tryoutStatus={
                                  batches?.find((batch) => batch.attemptId === item.attemptId)
                                    ?.resultState ?? item.tryoutResultState
                                }
                              />
                            ))}
                          </div>
                        ) : (
                          <Card fullWidth>
                            <EmptyState
                              icon={<StudentMascot pose="history" />}
                              title="Belum ada riwayat Tryout"
                              description={
                                history.hasNextPage
                                  ? 'Muat halaman berikutnya untuk mencari riwayat Tryout.'
                                  : 'Riwayat Tryout akan muncul setelah jawaban dikirim.'
                              }
                            />
                          </Card>
                        )}
                        {history.hasNextPage && (
                          <Button
                            variant="secondary"
                            disabled={history.isFetchingNextPage}
                            onClick={() => void history.fetchNextPage()}
                          >
                            {history.isFetchingNextPage ? 'Memuat…' : 'Muat riwayat lainnya'}
                          </Button>
                        )}
                        {history.isFetchNextPageError && (
                          <p className="form-error" role="alert">
                            Riwayat berikutnya belum dapat dimuat. Coba muat kembali.
                          </p>
                        )}
                      </section>
                    ),
                  },
                ]}
              />
            </div>
          </>
        )}
      </div>
    </LearningFrame>
  );
}

export function TryoutAttemptScreen() {
  const { attemptId } = useParams<{ attemptId: string }>();
  return (
    <LearningFrame
      title="Mengerjakan TryOut"
      focus
      className="learning-practice-shell tryout-attempt-shell"
    >
      <StudentGate>{(token) => <AttemptData token={token} attemptId={attemptId} />}</StudentGate>
    </LearningFrame>
  );
}

function AttemptData({ token, attemptId }: { token: string; attemptId: string }) {
  const { state } = useAuth();
  const client = useQueryClient();
  const router = useRouter();
  const resumeKey =
    state.status === 'ready' ? tryoutResumeKey(state.profile.id, attemptId) : undefined;
  const query = useQuery({
    queryKey: ['tryout-attempt', attemptId],
    queryFn: () => learningApi.tryoutAttempt(token, attemptId),
    refetchInterval: ({ state }) =>
      state.data?.status === 'submitted' || attemptNoLongerAccessible(state.error) ? false : 15_000,
  });
  const submitted = query.data?.status === 'submitted';
  useEffect(() => {
    if (!submitted) return;
    if (resumeKey) writeTryoutResume(resumeKey);
    refreshTryoutStatus(client);
  }, [client, resumeKey, submitted]);
  if (!query.data || attemptNoLongerAccessible(query.error))
    return (
      <>
        <DataState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
        {attemptNoLongerAccessible(query.error) && (
          <Link className="button-link button-link--secondary" href="/student/tryout">Kembali ke Tryout</Link>
        )}
      </>
    );
  if (query.data.status === 'submitted')
    return (
      <>
        <AssessmentHeader
          title="Tryout terkirim"
          status="Jawaban tersimpan"
          progress={100}
          progressLabel="Tryout terkirim"
          exitHref="/student/tryout"
        />
        <TryoutWaiting
          submitted
          xp={query.data.xp ?? null}
          closeAt={query.data.closeAt}
          resultDueAt={query.data.resultDueAt}
          resultPendingReason={query.data.resultPendingReason}
          waitState={query.data.resultWaitState}
          onCheck={() => {
            refreshTryoutStatus(client);
            router.push(`/student/tryout/${attemptId}/result`);
          }}
        />
      </>
    );
  return (
    <>
      {query.isError && (
        <Status title="Status server belum dapat diperbarui">
          Jawaban lokal tetap ditampilkan. Periksa koneksi dan status pengiriman sebelum keluar.
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Periksa status sesi
          </Button>
        </Status>
      )}
      <TryoutForm
        key={attemptId}
        attempt={query.data}
        token={token}
        resumeKey={resumeKey}
        check={() => void query.refetch()}
      />
    </>
  );
}

function attemptNoLongerAccessible(error: unknown) {
  return error instanceof LearningApiError &&
    (error.code === 'ATTEMPT_NOT_ACTIVE' || [401, 403, 404].includes(error.status));
}

function TryoutForm({
  attempt,
  token,
  check,
  resumeKey,
}: {
  attempt: TryoutAttempt;
  token: string;
  check: () => void;
  resumeKey?: string | undefined;
}) {
  const router = useRouter();
  const client = useQueryClient();
  return (
    <>
      <AssessmentSession
        redesign
        sessionKind="tryout"
        resumeKey={resumeKey}
        title={attempt.packageTitle}
        questions={attempt.questions}
        notice={
          attempt.resultPendingReason ? (
            <Card fullWidth>Penilaian belum tersedia. Jawaban tetap disimpan di server.</Card>
          ) : undefined
        }
        deadlineAt={attempt.deadlineAt}
        serverTime={attempt.serverTime}
        onFinalizationCheck={check}
        submitLabel="Kirim"
        confirmMessage={() =>
          'Periksa jawabanmu sebelum mengirim. Setelah dikirim, jawaban tidak bisa diubah.'
        }
        loadMedia={async (questionId, phase, assetIds) =>
          (await learningApi.media(token, attempt.id, questionId, phase, assetIds)).media
        }
        onSaveTyped={(questionId, optionId) =>
          learningApi.saveTryoutAnswer(token, attempt.id, questionId, optionId)
        }
        onSubmit={() => learningApi.submitTryout(token, attempt.id)}
        onSubmitted={() => {
          refreshTryoutStatus(client);
          router.push(`/student/tryout/${attempt.id}/result`);
        }}
      />
    </>
  );
}

export function TryoutResultScreen() {
  const { attemptId } = useParams<{ attemptId: string }>();
  return (
    <LearningFrame
      title="Hasil TryOut"
      focus
      className="learning-practice-shell tryout-result-shell"
    >
      <AssessmentHeader
        title="Hasil Tryout"
        status="Nilai dan pembahasan"
        exitHref="/student/tryout"
      />
      <StudentGate>
        {(token) => <TryoutResultData token={token} attemptId={attemptId} />}
      </StudentGate>
    </LearningFrame>
  );
}

function TryoutResultData({ token, attemptId }: { token: string; attemptId: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['tryout-result', attemptId],
    queryFn: () => learningApi.tryoutResult(token, attemptId),
    refetchInterval: (query) => (waitingForTryoutResult(query.state.error) ? 15_000 : false),
  });
  const waiting = query.isError && waitingForTryoutResult(query.error);
  const attempt = useQuery({
    queryKey: ['tryout-attempt', attemptId],
    queryFn: () => learningApi.tryoutAttempt(token, attemptId),
    enabled: waiting,
    refetchInterval: waiting ? 15_000 : false,
  });
  const resultStatus = query.isSuccess ? 'ready' : attempt.data?.resultWaitState;
  useEffect(() => {
    if (resultStatus === 'ready' || resultStatus === 'overdue') refreshTryoutStatus(client);
  }, [client, resultStatus]);
  if (waiting)
    return (
      <>
        {attempt.isError && (
          <Status title="Status sesi belum dapat dimuat">
            <Button variant="secondary" onClick={() => void attempt.refetch()}>
              Coba lagi
            </Button>
          </Status>
        )}
        {!attempt.isError && attempt.data?.status !== 'submitted' ? (
          <Status
            title={
              attempt.isFetching || attempt.isPending
                ? 'Memeriksa status jawaban'
                : 'Pengiriman belum terkonfirmasi'
            }
          >
            {!attempt.isFetching && !attempt.isPending && (
              <Link className="button-link" href={`/student/tryout/${attemptId}`}>
                Buka sesi Tryout
              </Link>
            )}
          </Status>
        ) : (
          attempt.data?.status === 'submitted' && (
            <TryoutWaiting
              xp={attempt.data?.xp ?? null}
              closeAt={attempt.data?.closeAt}
              resultDueAt={attempt.data?.resultDueAt}
              resultPendingReason={attempt.data?.resultPendingReason}
              waitState={attempt.data.resultWaitState}
              fetching={query.isFetching || attempt.isFetching}
              onCheck={() => {
                refreshTryoutStatus(client);
                void attempt.refetch();
                void query.refetch();
              }}
            />
          )
        )}
      </>
    );
  if (query.isPending || query.isError)
    return (
      <DataState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    );
  return <TryoutReleasedResult result={query.data} />;
}
