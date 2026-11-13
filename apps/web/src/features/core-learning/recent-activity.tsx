import { formatStudentNumber } from './student-format';
import Link from 'next/link';
import { Icon, ProgressBar } from '@tka/ui';
import type { DashboardDrillDto } from './generated-types';
import type { AssessmentRecord } from './types';
import './recent-activity.css';

const owl = '/illustrations/student-heroes/drill-owl.webp';
const tryout = '/illustrations/student-heroes/tryout-exam.webp';
const dateFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: 'numeric',
  month: 'short',
});

export function RecentActivity({
  item,
  activeDrill,
}: {
  item: AssessmentRecord;
  activeDrill?: DashboardDrillDto | null | undefined;
}) {
  const isDrill = item.activity === 'drill';
  const waiting = item.resultState === 'waitingIrt';
  const score = item.resultState === 'ready' ? item.score : null;
  const stars = item.starsState === 'ready' ? item.stars : null;
  const resultHref =
    !waiting && item.activity !== 'pretest'
      ? `/student/${item.activity}/${encodeURIComponent(item.attemptId)}/result`
      : undefined;
  const sameLevel = isDrill && activeDrill && item.levelId && activeDrill.levelId === item.levelId;
  const continueHref = sameLevel
    ? `/student/drill/${encodeURIComponent(activeDrill.attemptId)}`
    : isDrill && item.chapterId && item.subchapterId
      ? `/student/learn/${encodeURIComponent(item.chapterId)}/${encodeURIComponent(item.subchapterId)}`
      : undefined;
  const actionHref = continueHref ?? resultHref;

  return (
    <div className="recent-activity">
      <article className="recent-activity__card">
        <div className="recent-activity__art">
          <img src={item.activity === 'tryout' ? tryout : owl} width={144} height={144} alt="" />
        </div>
        <div className="recent-activity__body">
          <p className="recent-activity__badge">
            <Icon name={continueHref ? 'rocket' : 'clock'} width={17} height={17} />
            {continueHref
              ? 'Yuk, lanjutkan latihanmu!'
              : waiting
                ? 'Menunggu hasil'
                : item.activity === 'tryout'
                  ? 'Hasil Tryout'
                  : item.activity === 'pretest'
                    ? 'Pretest Bab'
                    : 'Hasil Drill'}
          </p>
          <h3>
            {continueHref && resultHref ? <Link href={resultHref}>{item.title}</Link> : item.title}
          </h3>
          {(score != null || stars != null || (item.xpState === 'ready' && item.xp != null)) && (
            <div className="recent-activity__metrics">
              {score != null && (
                <div className="recent-activity__score">
                  <ProgressBar value={score} max={100} size="sm" label="Nilai aktivitas" />
                  <strong>{formatStudentNumber(score)}%</strong>
                </div>
              )}
              {stars != null && (
                <span className="recent-activity__stars">
                  <Icon name="star" width={18} height={18} /> {stars}/3 bintang
                </span>
              )}
              {item.xpState === 'ready' && item.xp != null && (
                <span>{formatStudentNumber(item.xp)} XP</span>
              )}
            </div>
          )}
          {(item.xpState === 'legacy' ||
            item.starsState === 'legacy' ||
            item.xpState === 'pending' ||
            item.starsState === 'pending' ||
            item.isDemo) && (
            <div className="recent-activity__notes">
              {item.xpState === 'legacy' && <span>XP tidak tercatat pada hasil versi lama</span>}
              {item.starsState === 'legacy' && (
                <span>Bintang tidak tercatat pada hasil versi lama</span>
              )}
              {item.xpState === 'pending' && <span>XP belum tersedia</span>}
              {item.starsState === 'pending' && <span>Bintang belum tersedia</span>}
              {item.isDemo && <span>Demo</span>}
            </div>
          )}
        </div>
        <time className="recent-activity__date" dateTime={item.submittedAt}>
          {dateFormat.format(new Date(item.submittedAt))}
        </time>
        {actionHref && (
          <Link className="recent-activity__action" href={actionHref}>
            {continueHref ? 'Lanjutkan' : 'Lihat hasil'}
            <Icon name="arrow" width={17} height={17} />
          </Link>
        )}
      </article>
    </div>
  );
}
