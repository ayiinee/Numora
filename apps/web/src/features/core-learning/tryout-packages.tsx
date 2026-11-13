'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Icon } from '@tka/ui';
import { learningApi } from './api';
import { useStudentToken } from './student-session';
import { DataState, LearningFrame, Status } from './ui';
import { releaseDate, TryoutDetail } from './tryout-presentation';
import { refreshTryoutStatus } from './tryout-queries';
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
      .filter((pack) => pack.periodState === 'past' && !pack.attemptId) ?? [];
  if (!query.data)
    return (
      <DataState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    );
  return (
    <section className="tryout-past" aria-label="Paket Tryout terlewat">
      <header>
        <h2>Paket terlewat</h2>
        <p>Paket yang sudah ditutup dan belum kamu kerjakan.</p>
      </header>
      {!packages.length && !query.hasNextPage && (
        <Status title="Belum ada paket terlewat">
          Paket yang telah ditutup akan muncul di sini.
        </Status>
      )}
      <div className="activity-list">
        {packages.map((pack) => (
          <Card key={pack.id} fullWidth className="tryout-past-card">
            <div className="tryout-past-card__summary">
              <span className="tryout-past-card__icon">
                <Icon name="lock" width={20} height={20} />
              </span>
              <div>
                <Badge size="sm" variant="secondary">Terkunci · Belum dikerjakan</Badge>
                <h3>{pack.title}</h3>
                <p>
                  {pack.questionCount ?? '—'} soal ·{' '}
                  {pack.durationSeconds == null
                    ? 'Durasi belum tersedia'
                    : `${Math.ceil(pack.durationSeconds / 60)} menit`}
                </p>
              </div>
            </div>
            <footer className="tryout-past-card__footer">
              <p>
                <Icon name="clock" width={16} height={16} />
                <span>Ditutup {releaseDate(pack.closeAt)}</span>
              </p>
              <div className="tryout-past-card__actions">
                <Link className="section-link" href={`/student/tryout/packages/${pack.id}`}>
                  Lihat detail paket
                  <Icon name="chevron" width={16} height={16} />
                </Link>
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
  const client = useQueryClient();
  const starting = useRef(false);
  const [accepted, setAccepted] = useState(false);
  const query = useQuery({
    queryKey: ['tryout-package', packageId],
    queryFn: () => learningApi.tryoutPackage(token, packageId),
  });
  const start = useMutation({
    mutationFn: () => learningApi.startTryout(token, packageId),
    onSuccess: (attempt) => {
      refreshTryoutStatus(client);
      router.push(`/student/tryout/${attempt.id}`);
    },
    onError: () => {
      starting.current = false;
    },
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
            <Status title={query.data.attemptId ? 'Paket sudah dikerjakan' : 'Paket terlewat'}>
              Paket ditutup {releaseDate(query.data.closeAt)}.
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
              if (accepted && query.data?.eligible && !starting.current) {
                starting.current = true;
                start.mutate();
              }
            }}
          />
        </>
      )}
    </LearningFrame>
  );
}
