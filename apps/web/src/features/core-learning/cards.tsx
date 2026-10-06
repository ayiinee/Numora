'use client';

import Link from 'next/link';
import { Badge, Icon, ProgressBar, type IconName } from '@tka/ui';
import type { AssessmentRecord, Chapter, StudentProgress } from './types';

const chapterIcons: IconName[] = ['book', 'target', 'chart', 'spark'];

export function ChapterCard({ chapter, index }: { chapter: Chapter; index: number }) {
  return (
    <Link className={`chapter-card accent-${index % 4}`} href={`/student/learn/${chapter.id}`}>
      <div className="chapter-art">
        <Icon name={chapterIcons[index % chapterIcons.length]!} width={42} height={42} />
        <span aria-hidden="true" className="chapter-symbol">
          {['x²', '÷', 'π', '△'][index % 4]}
        </span>
      </div>
      <div className="chapter-card-copy">
        <span className="eyebrow">Bab {index + 1}</span>
        <h3>{chapter.title}</h3>
        <span className="card-link">
          Jelajahi subbab <Icon name="arrow" width={18} height={18} />
        </span>
      </div>
    </Link>
  );
}

export function ProgressSummary({ progress }: { progress: StudentProgress }) {
  return (
    <section className="progress-summary" aria-label="Progres belajar">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Setiap latihan berarti</span>
          <h2>Progres belajarmu</h2>
        </div>
        <span className="icon-tile accent-2">
          <Icon name="chart" />
        </span>
      </div>
      <div className="progress-figure">
        <strong>{progress.completedLevels}</strong>
        <span>dari {progress.totalLevels} level selesai</span>
      </div>
      {progress.totalLevels > 0 ? (
        <ProgressBar
          value={progress.completedLevels}
          max={progress.totalLevels}
          label="Level selesai"
          showLabel
        />
      ) : (
        <p className="muted">Materi belajar belum diterbitkan.</p>
      )}
      <div className="progress-bottom">
        <span>Nilai Drill terakhir</span>
        <strong>
          {progress.latestScore === null ? 'Belum ada' : `${progress.latestScore} / 100`}
        </strong>
      </div>
    </section>
  );
}

export function ActivityRow({ item }: { item: AssessmentRecord }) {
  const drill = item.activity === 'drill';
  const content = (
    <>
      <span className={`icon-tile ${drill ? 'accent-0' : 'accent-1'}`}>
        <Icon name={drill ? 'target' : 'clipboard'} />
      </span>
      <div className="row-copy">
        <span className="eyebrow">
          {drill ? 'Drill' : item.activity === 'pretest' ? 'Pretest' : 'Tryout'}{' '}
          {item.isDemo && <Badge>Demo</Badge>}
        </span>
        <h3>{item.title}</h3>
        {[item.chapterTitle, item.subchapterTitle, item.levelTitle].some(Boolean) && (
          <p className="muted">
            {[item.chapterTitle, item.subchapterTitle, item.levelTitle].filter(Boolean).join(' · ')}
          </p>
        )}
        <time dateTime={item.submittedAt}>
          {new Intl.DateTimeFormat('id-ID', {
            dateStyle: 'medium',
            timeZone: 'Asia/Jakarta',
          }).format(new Date(item.submittedAt))}
        </time>
        {item.xpState === 'ready' && item.xp != null && <p>{item.xp} XP</p>}
        {item.starsState === 'ready' && item.stars != null && <p>Bintang: {item.stars} / 3</p>}
        {item.xpState === 'legacy' && (
          <p className="muted">XP tidak tercatat pada hasil versi lama</p>
        )}
        {(item.xpState === 'pending' || item.starsState === 'pending') && (
          <p className="muted">
            {item.xpState === 'pending' && item.starsState === 'pending'
              ? 'XP dan bintang belum tersedia'
              : item.xpState === 'pending'
                ? 'XP belum tersedia'
                : 'Bintang belum tersedia'}
          </p>
        )}
      </div>
      <div className="activity-score">
        {item.resultState === 'waitingIrt' ? (
          <Badge variant="warning" style={{ whiteSpace: 'normal' }}>
            Menunggu hasil
          </Badge>
        ) : (
          <>
            <strong>{item.score ?? '—'}</strong>
            <small>Nilai</small>
          </>
        )}
      </div>
      {item.activity !== 'pretest' && item.resultState === 'ready' && (
        <Icon name="chevron" width={18} height={18} />
      )}
    </>
  );
  return item.activity === 'pretest' || item.resultState !== 'ready' ? (
    <div className="activity-row">{content}</div>
  ) : (
    <Link
      className="activity-row"
      href={`/student/${drill ? 'drill' : 'tryout'}/${item.attemptId}/result`}
    >
      {content}
    </Link>
  );
}
