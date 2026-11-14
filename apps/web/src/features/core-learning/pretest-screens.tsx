'use client';

import { StudentMascot } from '@/components/student-mascot';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Card, Icon } from '@tka/ui';
import { learningApi } from './api';
import { useStudentToken } from './student-session';
import { DataState, LearningFrame, Status } from './ui';
import { PretestCard, type PretestChapterState } from './pretest';
import { AssessmentSession } from './assessment-session';
import { StudentSectionHeader } from './student-section-header';
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
  return (
    <AssessmentSession
      redesign
      sessionKind="pretest"
      title={attempt.chapterTitle}
      questions={attempt.questions}
      headerExtra={<span>Tanpa batas waktu</span>}
      onReload={onReload}
      loadMedia={async (questionId, phase) =>
        (await learningApi.itemMedia(token, questionId, phase)).media
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
    <LearningFrame
      title="Hasil Pretest"
      className="pretest-result-shell"
      mobileHeader={<StudentSectionHeader title="Hasil Pretest" />}
    >
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
  const placementReady = result.mappingStatus === 'applied' && result.initialLevel !== null;
  return (
    <Card fullWidth className="pretest-result">
      <header className="pretest-result__hero">
        <div className="pretest-result__art">
          <StudentMascot pose={placementReady ? 'placement' : 'submitted'} />
        </div>
        <div>
          <Badge variant="success">
            <Icon name="check" width={14} height={14} />
            Pretest selesai
          </Badge>
          {result.isDemo && <Badge variant="secondary">DEMO</Badge>}
          <h2>Hasil Pretest {result.chapterTitle}</h2>
          <p>Kenali titik awalmu. Lanjutkan belajar selangkah demi selangkah.</p>
        </div>
      </header>

      <section className="pretest-result__placement" aria-label="Penempatan awal">
        <span className="pretest-result__eyebrow">Level awalmu</span>
        <strong>{placementReady ? `Level ${result.initialLevel}` : 'Hasil tersimpan'}</strong>
        <p>
          {placementReady
            ? `Pilih subbab untuk berlatih. Tanda Mulai di sini menunjukkan level saran pretest saat kamu belum melampauinya.${
                (result.initialLevel ?? 0) > 1
                  ? ' Level sebelumnya tetap tersedia untuk latihan dasar.'
                  : ''
              }`
            : 'Pemetaan level bab belum tersedia. Level yang sudah terbuka tetap dipertahankan.'}
        </p>
        <Link className="button-link" href={`/student/learn/${result.chapterId}`}>
          Lanjut Drill <Icon name="chevron" width={18} height={18} />
        </Link>
      </section>

      <dl className="pretest-result__stats">
        <div>
          <dt>Nilai pretest</dt>
          <dd>
            {result.score === null
              ? 'Belum tersedia'
              : result.score.toLocaleString('id-ID', { maximumFractionDigits: 6 })}
          </dd>
        </div>
        <div>
          <dt>Soal benar seluruhnya</dt>
          <dd>
            {result.correctCount ?? '—'} <span>/ {result.questionCount} soal</span>
          </dd>
        </div>
      </dl>

      <p className="pretest-result__scoring-note">
        Jumlah soal benar seluruhnya berbeda dari nilai. Jika paketmu memakai penilaian sebagian,
        jawaban yang sebagian benar juga menyumbang nilai dan penempatan awal. Hasil mengikuti
        aturan penilaian saat pretest dikerjakan.
      </p>
      {result.unlockedLevels.length > 0 && (
        <details className="pretest-result__levels">
          <summary>
            <span>
              <strong>Level tersedia</strong>
              <span>{result.unlockedLevels.length} level untuk dijelajahi</span>
            </span>
            <Icon name="chevron" width={18} height={18} />
          </summary>
          <ul>
            {result.unlockedLevels.map((level) => (
              <li key={level.id}>
                <Icon name="check" width={16} height={16} />
                <span>{level.title}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <aside className="pretest-result__note" aria-label="Tentang hasil pretest">
        <Icon name="info" width={18} height={18} />
        <div>
          <p>
            Progres Drill sebelumnya tetap aman. Level yang terbuka belum dihitung sebagai latihan
            selesai.
          </p>
          <p>
            Pretest bab ini tidak dapat diulang dan tidak memberikan XP atau kontribusi leaderboard.
          </p>
        </div>
      </aside>
    </Card>
  );
}
