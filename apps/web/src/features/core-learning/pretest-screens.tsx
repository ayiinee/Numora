'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card } from '@tka/ui';
import { learningApi } from './api';
import { useStudentToken } from './student-session';
import { DataState, LearningFrame, Status } from './ui';
import { PretestCard, type PretestChapterState } from './pretest';
import { AssessmentSession } from './assessment-session';
import type { PretestAttemptDto, PretestResultDto } from './generated-types';

function useInvalidatePretest(chapterId: string) {
  const client = useQueryClient();
  return async () => {
    await Promise.all(
      [
        'pretest-chapter',
        'student-materials',
        'student-dashboard',
        'subchapter',
        'student-progress',
        'assessment-history',
      ].map((key) =>
        client.invalidateQueries({
          queryKey: key === 'pretest-chapter' ? [key, chapterId] : [key],
        }),
      ),
    );
  };
}

export function ChapterPretest({
  chapterId,
  chapterTitle,
}: {
  chapterId: string;
  chapterTitle: string;
}) {
  const token = useStudentToken();
  const router = useRouter();
  const invalidate = useInvalidatePretest(chapterId);
  const state = useQuery({
    queryKey: ['pretest-chapter', chapterId],
    queryFn: () => learningApi.pretestChapter(token, chapterId),
  });
  const start = useMutation({
    mutationFn: () => learningApi.startPretest(token, chapterId),
    onSuccess: async (attempt) => {
      await invalidate();
      router.push(`/student/pretest/${attempt.id}`);
    },
  });
  const skip = useMutation({
    mutationFn: () => learningApi.skipPretest(token, chapterId),
    onSuccess: invalidate,
  });
  if (!state.data)
    return (
      <DataState pending={state.isPending} error={state.error} retry={() => void state.refetch()} />
    );
  const current = state.data;
  return (
    <div className="pretest-entry">
      {current.isDemo && <Badge variant="warning">DEMO · Bukan asesmen kemampuan TKA resmi</Badge>}
      {current.skipped && current.state === 'inProgress' && (
        <p>Pretest dilewati untuk sekarang. Jawaban tersimpan tetap dapat dilanjutkan.</p>
      )}
      <PretestCard
        chapterTitle={chapterTitle}
        state={current.state as PretestChapterState}
        onStart={
          current.canStart
            ? async () => {
                await start.mutateAsync();
              }
            : undefined
        }
        onSkip={
          current.canSkip
            ? async () => {
                await skip.mutateAsync();
              }
            : undefined
        }
        onResume={
          current.attemptId ? () => router.push(`/student/pretest/${current.attemptId}`) : undefined
        }
        onViewResult={
          current.attemptId
            ? () => router.push(`/student/pretest/${current.attemptId}/result`)
            : undefined
        }
      />
    </div>
  );
}

export function PretestAttemptScreen() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const token = useStudentToken();
  const query = useQuery({
    queryKey: ['pretest-attempt', attemptId],
    queryFn: () => learningApi.pretestAttempt(token, attemptId),
    refetchOnWindowFocus: false,
  });
  const [reload, setReload] = useState(0);
  return (
    <LearningFrame title="Pretest Bab" focus className="learning-practice-shell">
      {!query.data ? (
        <DataState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : query.data.status === 'completed' ? (
        <Status title="Pretest sudah selesai">
          <Link className="button-link" href={`/student/pretest/${attemptId}/result`}>
            Lihat hasil Pretest
          </Link>
        </Status>
      ) : (
        <PretestForm
          key={`${attemptId}-${reload}`}
          token={token}
          attempt={query.data}
          onReload={() =>
            void query.refetch().then((result) => {
              if (result.data && !result.isError) setReload((value) => value + 1);
            })
          }
        />
      )}
      {query.data && query.isError && (
        <DataState pending={false} error={query.error} retry={() => void query.refetch()} />
      )}
    </LearningFrame>
  );
}

function PretestForm({
  token,
  attempt,
  onReload,
}: {
  token: string;
  attempt: PretestAttemptDto;
  onReload: () => void;
}) {
  const router = useRouter();
  const invalidate = useInvalidatePretest(attempt.chapterId);
  const revisions = useRef(
    Object.fromEntries(
      attempt.questions.map((question) => [question.questionInstanceId, question.revision]),
    ),
  );
  const skip = useMutation({
    mutationFn: () => learningApi.skipPretest(token, attempt.chapterId),
    onSuccess: async () => {
      await invalidate();
      router.push(`/student/learn/${attempt.chapterId}`);
    },
  });
  return (
    <AssessmentSession
      redesign
      sessionKind="pretest"
      title={attempt.chapterTitle}
      questions={attempt.questions}
      headerExtra={<span>Tanpa batas waktu</span>}
      onReload={onReload}
      notice={
        <Card>
          {attempt.isDemo && (
            <Badge variant="warning">DEMO · Pemetaan bab sintetis untuk pengujian</Badge>
          )}
          <p>
            20 soal · Opsional · Tanpa XP. Jawaban tersimpan dapat dilanjutkan sebelum Pretest
            selesai.
          </p>
          <Button
            variant="secondary"
            disabled={skip.isPending || skip.isSuccess}
            onClick={() => {
              if (
                window.confirm(
                  'Skip untuk sekarang? Jawaban yang sudah tersimpan tetap dapat dilanjutkan. Perubahan yang belum tersimpan dapat hilang.',
                )
              )
                skip.mutate();
            }}
          >
            Skip untuk sekarang
          </Button>
          {skip.isError && <p role="alert">{skip.error.message}</p>}
        </Card>
      }
      submitLabel="Kirim Pretest"
      confirmMessage={(empty) =>
        `${empty} soal belum dijawab. Pretest yang selesai tidak dapat diulang. Kirim sekarang?`
      }
      onSaveTyped={async (questionId, answer) => {
        const saved = await learningApi.savePretestAnswer(
          token,
          attempt.id,
          questionId,
          answer,
          revisions.current[questionId] ?? 0,
        );
        revisions.current[questionId] = saved.revision;
        return saved;
      }}
      onSubmit={() => learningApi.submitPretest(token, attempt.id)}
      onSubmitted={() => {
        void invalidate();
        router.push(`/student/pretest/${attempt.id}/result`);
      }}
    />
  );
}

export function PretestResultScreen() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const token = useStudentToken();
  const query = useQuery({
    queryKey: ['pretest-result', attemptId],
    queryFn: () => learningApi.pretestResult(token, attemptId),
  });
  return (
    <LearningFrame title="Hasil Pretest">
      {!query.data ? (
        <DataState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : (
        <PretestResult result={query.data} />
      )}
    </LearningFrame>
  );
}
export function PretestResult({ result }: { result: PretestResultDto }) {
  return (
    <Card fullWidth className="pretest-result">
      {result.isDemo && <Badge variant="warning">DEMO · Bukan asesmen kemampuan TKA resmi</Badge>}
      <h1>Hasil Pretest {result.chapterTitle}</h1>
      <p>
        Pretest selesai. Bab ini tidak dapat di-pretest ulang. Tidak ada XP atau kontribusi
        leaderboard.
      </p>
      <dl>
        <dt>Nilai</dt>
        <dd>{result.score ?? '—'}</dd>
        <dt>Jawaban benar</dt>
        <dd>
          {result.correctCount ?? '—'} / {result.questionCount}
        </dd>
        <dt>Level awal</dt>
        <dd>{result.initialLevel ?? 'Belum tersedia'}</dd>
      </dl>
      {result.mappingStatus === 'unavailable' && (
        <p role="status">
          Hasil tersimpan. Pemetaan level bab belum lengkap; level yang sudah terbuka tetap
          dipertahankan.
        </p>
      )}
      {result.unlockedLevels.length > 0 && (
        <>
          <h2>Level tersedia</h2>
          <ul>
            {result.unlockedLevels.map((level) => (
              <li key={level.id}>{level.title}</li>
            ))}
          </ul>
        </>
      )}
      <p>
        Unlock Pretest tidak menandai level Drill sebagai selesai dan tidak mengurangi progres
        sebelumnya.
      </p>
      <Link className="button-link" href={`/student/learn/${result.chapterId}`}>
        Lanjut Drill
      </Link>
    </Card>
  );
}
