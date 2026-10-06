'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button, Card } from '@tka/ui';
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
    <section aria-label="Paket Tryout lampau">
      <h2>Paket lampau</h2>
      <p>
        Paket lampau tetap terlihat dan tidak dapat dimulai. Paket yang sudah dikerjakan hanya
        menyediakan status hasil serta pembahasan setelah rilis.
      </p>
      {!packages.length && (
        <Status title="Belum ada paket lampau">
          Paket yang telah ditutup akan muncul di sini.
        </Status>
      )}
      <div className="activity-list">
        {packages.map((pack) => (
          <Card key={pack.id} fullWidth>
            <Badge variant={pack.state === 'resultReady' ? 'success' : 'secondary'}>
              {pack.attemptId
                ? pack.state === 'resultReady'
                  ? 'Hasil dirilis'
                  : 'Menunggu hasil'
                : 'Terkunci · Belum dikerjakan'}
            </Badge>
            {pack.isDemo && <Badge variant="warning">DEMO</Badge>}
            <h3>{pack.title}</h3>
            <p>
              {pack.questionCount} soal ·{' '}
              {pack.durationSeconds == null
                ? 'Durasi belum tersedia'
                : `${Math.ceil(pack.durationSeconds / 60)} menit`}
            </p>
            <p>Ditutup {wib(pack.closeAt)}</p>
            {pack.attemptId && pack.state !== 'resultReady' && (
              <p>
                Hasil dan pembahasan maksimal 72 jam setelah penutupan: {wib(pack.resultDueAt)}.
              </p>
            )}
            <Link className="button-link" href={`/student/tryout/packages/${pack.id}`}>
              Lihat detail paket
            </Link>
            {pack.attemptId && (
              <Link className="button-link" href={`/student/tryout/${pack.attemptId}/result`}>
                {pack.state === 'resultReady' ? 'Lihat hasil dan pembahasan' : 'Lihat status hasil'}
              </Link>
            )}
          </Card>
        ))}
      </div>
      {query.hasNextPage && (
        <Button
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
          {query.data.isDemo && (
            <Badge variant="warning">DEMO · Bukan asesmen kemampuan TKA resmi</Badge>
          )}
          {query.data.periodState === 'past' && (
            <Status title="Paket lampau">
              Paket ditutup {wib(query.data.closeAt)}. Pengerjaan paket lampau terkunci.
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
