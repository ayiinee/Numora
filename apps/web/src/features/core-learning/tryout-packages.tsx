'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Icon } from '@tka/ui';
import { learningApi } from './api';
import { useStudentToken } from './student-session';
import { DataState, LearningFrame, Status } from './ui';
import { TryoutDetail } from './tryout-presentation';

function wib(value: string | null | undefined) {
  return value
    ? `${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(value))} WIB`
    : 'Jadwal belum tersedia';
}
export function PastTryoutPackages({ enabled = true }: { enabled?: boolean }) {
  const token = useStudentToken();
  const query = useInfiniteQuery({
    queryKey: ['tryout-packages'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => learningApi.tryoutPackages(token, pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
  const packages =
    query.data?.pages
      .flatMap((page) => page.packages)
      .filter((pack) => pack.periodState === 'past') ?? [];
  if (!query.data)
    return (
      <DataState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    );
  return (
    <section className="tryout-past" aria-label="Paket Tryout terlewat">
      <header>
        <h2>Paket terlewat</h2>
        <p>Paket sudah ditutup. Jika sudah mengerjakan, cek hasil dan pembahasan setelah rilis.</p>
      </header>
      {!packages.length && (
        <Status title="Belum ada paket terlewat">
          Paket yang telah ditutup akan muncul di sini.
        </Status>
      )}
      <div className="activity-list">
        {packages.map((pack) => (
          <Card key={pack.id} fullWidth className="tryout-past-card">
            <div className="tryout-past-card__summary">
              <span className="tryout-past-card__icon">
                <Icon name={pack.attemptId ? 'clipboard' : 'lock'} width={20} height={20} />
              </span>
              <div>
                <Badge size="sm" variant={pack.state === 'resultReady' ? 'success' : 'secondary'}>
                  {pack.attemptId
                    ? pack.state === 'resultReady'
                      ? 'Hasil dirilis'
                      : 'Menunggu hasil'
                    : 'Terkunci · Belum dikerjakan'}
                </Badge>
                <h3>{pack.title}</h3>
                <p>
                  {pack.questionCount ?? '—'} soal ·{' '}
                  {pack.durationSeconds == null
                    ? 'Durasi belum tersedia'
                    : `${Math.ceil(pack.durationSeconds / 60)} menit`}
                </p>
              </div>
            </div>
            {pack.attemptId && pack.state !== 'resultReady' && (
              <p className="tryout-past-card__notice">
                {pack.resultDueAt
                  ? `Hasil dan pembahasan dirilis paling lambat ${wib(pack.resultDueAt)}.`
                  : 'Hasil dan pembahasan dirilis maksimal 72 jam setelah paket ditutup.'}
              </p>
            )}
            <footer className="tryout-past-card__footer">
              <p>
                <Icon name="clock" width={16} height={16} />
                <span>Ditutup {wib(pack.closeAt)}</span>
              </p>
              <div className="tryout-past-card__actions">
                <Link className="section-link" href={`/student/tryout/packages/${pack.id}`}>
                  Lihat detail paket
                  <Icon name="chevron" width={16} height={16} />
                </Link>
                {pack.attemptId && (
                  <Link className="button-link" href={`/student/tryout/${pack.attemptId}/result`}>
                    {pack.state === 'resultReady'
                      ? 'Lihat hasil dan pembahasan'
                      : 'Lihat status hasil'}
                  </Link>
                )}
              </div>
            </footer>
          </Card>
        ))}
      </div>
      {query.hasNextPage && (
        <Button
          className="tryout-past__more"
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? 'Memuat…' : 'Muat paket lainnya'}
        </Button>
      )}
      {query.isError && (
        <p role="alert">
          Paket belum dapat dimuat.{' '}
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Coba lagi
          </Button>
        </p>
      )}
    </section>
  );
}

export function TryoutPackageScreen() {
  const { packageId } = useParams<{ packageId: string }>();
  const token = useStudentToken();
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const query = useQuery({
    queryKey: ['tryout-package', packageId],
    queryFn: () => learningApi.tryoutPackage(token, packageId),
  });
  const start = useMutation({
    mutationFn: () => learningApi.startTryout(token, packageId),
    onSuccess: (attempt) => router.push(`/student/tryout/${attempt.id}`),
  });
  return (
    <LearningFrame title="Detail paket Tryout" className="tryout-shell tryout-shell--detail">
      {!query.data ? (
        <DataState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : (
        <>
          {query.data.periodState === 'past' && (
            <Status title="Paket terlewat">
              Paket ditutup {wib(query.data.closeAt)}. Pengerjaan paket terlewat terkunci.
              {query.data.attemptId && (
                <Link
                  className="button-link"
                  href={`/student/tryout/${query.data.attemptId}/result`}
                >
                  Lihat status hasil
                </Link>
              )}
            </Status>
          )}
          <TryoutDetail
            current={query.data}
            accepted={accepted}
            onAccepted={setAccepted}
            onBack={() => router.push('/student/tryout')}
            pending={start.isPending || start.isSuccess}
            error={start.isError ? start.error.message : undefined}
            onStart={() => {
              if (accepted && query.data?.eligible && !start.isPending && !start.isSuccess)
                start.mutate();
            }}
          />
        </>
      )}
    </LearningFrame>
  );
}
