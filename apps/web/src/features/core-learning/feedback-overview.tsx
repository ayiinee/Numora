'use client';

import Link from 'next/link';
import { Avatar, Card, Icon } from '@tka/ui';
import { useFeedbackSummary } from './feedback-queries';

export function FeedbackOverview({ token }: { token: string }) {
  const query = useFeedbackSummary(token);
  return (
    <Card
      id="catatan-guru"
      className="student-home-card home-feedback"
      aria-labelledby="home-feedback-title"
    >
      <div className="home-card-heading">
        <h2 id="home-feedback-title">
          <Icon name="chat" width={18} height={18} />
          Feedback dari Guru
        </h2>
        {query.data?.unreadCount === 0 && Boolean(query.data.latest.length) && (
          <span className="home-feedback__read">
            <Icon name="check" width={12} height={12} />
            Sudah Dibaca
          </span>
        )}
      </div>
      {query.isPending ? (
        <p role="status">Memuat catatan Guru…</p>
      ) : query.isError ? (
        <div>
          <p role="alert">Catatan belum dapat dimuat. Aktivitas belajar tetap tersedia.</p>
          <button className="min-h-11 font-semibold underline" onClick={() => void query.refetch()}>
            Coba muat catatan lagi
          </button>
        </div>
      ) : (
        <>
          {(query.data.unreadCount > 0 || !query.data.latest.length) && (
            <p className="home-feedback__count">{query.data.unreadCount} catatan belum dibaca.</p>
          )}
          {!query.data.latest.length ? (
            <p className="mt-2 text-sm text-slate-700">Belum ada catatan dari Guru.</p>
          ) : (
            <ul className="home-feedback__list">
              {query.data.latest.map((item) => (
                <li key={item.id}>
                  <div className="home-feedback__author">
                    <Avatar name={item.teacherName} size="sm" />
                    <div>
                      <strong>{item.teacherName}</strong>
                      <small>{item.readAt === null ? 'Belum dibaca' : 'Sudah dibaca'}</small>
                    </div>
                    <time dateTime={item.sentAt}>
                      {new Intl.DateTimeFormat('id-ID', {
                        timeZone: 'Asia/Jakarta',
                        dateStyle: 'medium',
                      }).format(new Date(item.sentAt))}
                    </time>
                  </div>
                  <p className="home-feedback__quote">{item.body}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Link href="/student/feedback" className="home-feedback__inbox">
        Lihat semua catatan <Icon name="arrow" width={16} height={16} />
      </Link>
    </Card>
  );
}
