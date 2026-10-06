'use client';

import Link from 'next/link';
import { Icon } from '@tka/ui';
import { useFeedbackSummary } from './feedback-queries';

export function FeedbackOverview({ token }: { token: string }) {
  const query = useFeedbackSummary(token);
  const latest = query.data?.latest[0];
  return (
    <section
      id="catatan-guru"
      className="sh-section sh-feedback"
      aria-labelledby="sh-feedback-title"
    >
      <div className="sh-section__heading">
        <h2 id="sh-feedback-title">Feedback</h2>
        <Link href="/student/feedback">
          Inbox <Icon name="chevron" width={16} height={16} />
        </Link>
      </div>
      {query.isPending ? (
        <div className="sh-feedback__card" role="status">
          Memuat catatan Guru…
        </div>
      ) : query.isError ? (
        <div className="sh-feedback__card">
          <p role="alert">Catatan belum dapat dimuat. Aktivitas belajar tetap tersedia.</p>
          <button type="button" onClick={() => void query.refetch()}>
            Coba muat catatan lagi
          </button>
        </div>
      ) : latest ? (
        <Link className="sh-feedback__card sh-feedback__card--linked" href="/student/feedback">
          <span className="sh-feedback__icon">
            <img
              src="/illustrations/student-home/reference-feedback.png"
              width="79"
              height="64"
              alt=""
            />
          </span>
          <span className="sh-feedback__body">
            <strong>{latest.teacherName}</strong>
            <span>{latest.body}</span>
            <small>{latest.readAt === null ? 'Belum dibaca' : 'Sudah dibaca'}</small>
          </span>
          <span className="sh-feedback__aside">
            {query.data.unreadCount > 0 && (
              <b aria-label={`${query.data.unreadCount} catatan belum dibaca`}>
                {query.data.unreadCount > 99 ? '99+' : query.data.unreadCount}
              </b>
            )}
            <time dateTime={latest.sentAt}>
              {new Intl.DateTimeFormat('id-ID', {
                timeZone: 'Asia/Jakarta',
                dateStyle: 'medium',
              }).format(new Date(latest.sentAt))}
            </time>
          </span>
          <Icon name="chevron" width={16} height={16} />
        </Link>
      ) : (
        <div className="sh-feedback__card sh-feedback__empty">
          <Icon name="chat" width={25} height={25} />
          <p>Belum ada catatan dari Guru.</p>
        </div>
      )}
    </section>
  );
}
