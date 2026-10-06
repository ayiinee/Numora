'use client';

import { Button, Card, EmptyState, Icon, Tabs } from '@tka/ui';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { learningApi, LearningApiError } from './api';
import type { TryoutAttempt } from './types';
import { AssessmentSession } from './assessment-session';
import { AssessmentHeader } from './assessment-presentation';
import { useAssessmentHistory } from './assessment-queries';
import { ActivityRow } from './cards';
import { useLearningView } from './learning-interactions';
import { PastTryoutPackages } from './tryout-packages';
import { DataState, LearningFrame, Status, StudentGate } from './ui';
import {
  TryoutDetail,
  TryoutHero,
  TryoutPackageCard,
  TryoutReleasedResult,
  TryoutWaiting,
} from './tryout-presentation';

export function TryoutScreen() {
  return <StudentGate>{(token) => <CurrentTryout token={token} />}</StudentGate>;
}

function CurrentTryout({ token }: { token: string }) {
  const router = useRouter();
  const [details, setDetails] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState<string | null>(null);
  const [tab, setTab] = useState('current');
  const starting = useRef(false);
  const detailTitle = useRef<HTMLDivElement>(null);
  const detailsButton = useRef<HTMLButtonElement>(null);
  useLearningView(token, 'tryout_opened');
  const query = useQuery({
    queryKey: ['current-tryout'],
    queryFn: () => learningApi.currentTryout(token),
  });
  const history = useAssessmentHistory(token, tab === 'history');
  const start = useMutation({
    mutationFn: (packageId: string) => learningApi.startTryout(token, packageId),
    onSuccess: (attempt) => router.push(`/student/tryout/${attempt.id}`),
    onError: () => {
      starting.current = false;
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
            <TryoutHero onHistory={() => setTab('history')} />
            <div className="tryout-catalog-content">
              <Tabs
                value={tab}
                onChange={setTab}
                label="Daftar Tryout"
                items={[
                  {
                    value: 'current',
                    label: 'Berlangsung',
                    content:
                      query.isPending || query.isError ? (
                        <DataState
                          pending={query.isPending}
                          error={query.error}
                          retry={() => void query.refetch()}
                        />
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
                        <Status title="Paket belum tersedia">
                          <p>
                            Paket Tryout yang dapat dikerjakan belum diterbitkan. Paket tersedia
                            akan muncul di sini.
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
                    label: 'Paket Lampau',
                    content: <PastTryoutPackages enabled={tab === 'past'} />,
                  },
                  {
                    value: 'history',
                    label: 'Tryout Saya',
                    content: (
                      <section aria-label="Riwayat Tryout">
                        <h2>Riwayat Tryout</h2>
                        <p className="tryout-history-note">
                          Paket yang sudah dikerjakan tidak dapat diulang. Riwayat mengikuti
                          aktivitas yang sudah dimuat.
                        </p>
                        {history.isPending || (history.isError && !history.data) ? (
                          <DataState
                            pending={history.isPending}
                            error={history.error}
                            retry={() => void history.refetch()}
                          />
                        ) : historyRecords.length ? (
                          <div className="activity-list">
                            {historyRecords.map((item) => (
                              <ActivityRow key={item.attemptId} item={item} />
                            ))}
                          </div>
                        ) : (
                          <Card fullWidth>
                            <EmptyState
                              icon={<Icon name="clock" />}
                              title="Belum ada riwayat Tryout"
                              description={
                                history.hasNextPage
                                  ? 'Belum ada Tryout pada aktivitas yang dimuat. Muat aktivitas lainnya untuk melanjutkan pemeriksaan.'
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
              <Card fullWidth className="tryout-catalog-info">
                <Icon name="info" />
                <div>
                  <h2>Satu kesempatan, hasil setelah rilis</h2>
                  <p>
                    Paket dan waktu pengerjaan mengikuti server. Nilai serta pembahasan menunggu
                    rilis IRT.
                  </p>
                </div>
              </Card>
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
  const query = useQuery({
    queryKey: ['tryout-attempt', attemptId],
    queryFn: () => learningApi.tryoutAttempt(token, attemptId),
    refetchInterval: (query) => (query.state.data?.status === 'submitted' ? false : 15_000),
  });
  if (!query.data)
    return (
      <DataState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
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
          isDemo={query.data.isDemo}
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
        check={() => void query.refetch()}
      />
    </>
  );
}

function TryoutForm({
  attempt,
  token,
  check,
}: {
  attempt: TryoutAttempt;
  token: string;
  check: () => void;
}) {
  const router = useRouter();
  const client = useQueryClient();
  return (
    <>
      <AssessmentSession
        redesign
        sessionKind="tryout"
        title={attempt.packageTitle}
        questions={attempt.questions}
        notice={
          attempt.isDemo ? (
            <Card fullWidth>
              <p>
                DEMO · Konten uji, bukan asesmen kemampuan TKA resmi.
                {attempt.questions.some((question) => question.type !== 'SINGLE_CHOICE') &&
                  ' Jawaban PGK disimpan tanpa nilai atau XP sampai rubrik disetujui.'}
              </p>
            </Card>
          ) : undefined
        }
        deadlineAt={attempt.deadlineAt}
        serverTime={attempt.serverTime}
        onFinalizationCheck={check}
        submitLabel="Kirim TryOut"
        confirmMessage={(emptyCount) =>
          `${emptyCount} soal belum dijawab. Kirim jawaban TryOut? Hasil baru tersedia setelah IRT.`
        }
        onSaveTyped={(questionId, optionId) =>
          learningApi.saveTryoutAnswer(token, attempt.id, questionId, optionId)
        }
        onSubmit={() => learningApi.submitTryout(token, attempt.id)}
        onSubmitted={() => {
          for (const key of ['current-tryout', 'student-dashboard', 'assessment-history'])
            void client.invalidateQueries({ queryKey: [key] });
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
        status="Status hasil dari server"
        progress={100}
        progressLabel="Pengerjaan selesai"
        exitHref="/student/tryout"
      />
      <StudentGate>
        {(token) => <TryoutResultData token={token} attemptId={attemptId} />}
      </StudentGate>
    </LearningFrame>
  );
}

function TryoutResultData({ token, attemptId }: { token: string; attemptId: string }) {
  const query = useQuery({
    queryKey: ['tryout-result', attemptId],
    queryFn: () => learningApi.tryoutResult(token, attemptId),
    refetchInterval: (query) =>
      query.state.error instanceof LearningApiError &&
      query.state.error.code === 'TRYOUT_RESULT_PENDING'
        ? 15_000
        : false,
  });
  const waiting =
    query.isError &&
    query.error instanceof LearningApiError &&
    query.error.code === 'TRYOUT_RESULT_PENDING';
  const attempt = useQuery({
    queryKey: ['tryout-attempt', attemptId],
    queryFn: () => learningApi.tryoutAttempt(token, attemptId),
    enabled: waiting,
  });
  if (
    query.isError &&
    query.error instanceof LearningApiError &&
    query.error.code === 'TRYOUT_RESULT_PENDING'
  )
    return (
      <>
        {attempt.isError && (
          <Status title="XP belum dapat dimuat">
            <Button variant="secondary" onClick={() => void attempt.refetch()}>
              Coba muat XP lagi
            </Button>
          </Status>
        )}
        <TryoutWaiting
          xp={attempt.data?.xp ?? null}
          closeAt={attempt.data?.closeAt}
          resultDueAt={attempt.data?.resultDueAt}
          isDemo={attempt.data?.isDemo}
          fetching={query.isFetching}
          onCheck={() => void query.refetch()}
        />
      </>
    );
  if (query.isPending || query.isError)
    return (
      <DataState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    );
  return <TryoutReleasedResult result={query.data} />;
}
