'use client';

import { Button, Card, Icon, ProgressBar } from '@tka/ui';
import Link from 'next/link';
import type { Level, SubchapterDetail } from './types';

/** The path is decorative. Access, scores and start targets come from the server. */
export function LevelPath({
  data,
  pending,
  pendingLevelId,
  onStart,
}: {
  data: SubchapterDetail;
  pending: boolean;
  pendingLevelId?: string | undefined;
  onStart: (id: string) => void;
}) {
  const levels = [...data.levels].sort((a, b) => a.order - b.order);
  const completed = levels.filter((level) => level.status === 'completed').length;
  const current =
    levels.find((level) => level.status === 'inProgress') ??
    levels.find((level) => level.status === 'open');
  const actionLabel = (level: Level) =>
    level.status === 'inProgress'
      ? 'Lanjutkan latihan'
      : level.status === 'completed'
        ? 'Latihan lagi'
        : 'Mulai latihan';
  const startButton = (level: Level) => (
    <Button fullWidth disabled={pending} onClick={() => onStart(level.id)}>
      {pending && pendingLevelId === level.id ? 'Membuka latihan…' : actionLabel(level)}
      <Icon name="arrow" width={18} height={18} />
    </Button>
  );
  return (
    <div className="learning-adventure">
      <Card className="adventure-summary">
        <span className="eyebrow">Pusat latihan TKA · Subbab</span>
        <h2>{data.subchapter.title}</h2>
        <div className="adventure-summary__labels">
          <span>
            {completed} / {levels.length} level selesai
          </span>
        </div>
        <ProgressBar
          value={completed}
          max={levels.length}
          variant="success"
          label="Level subbab selesai"
        />
      </Card>
      <div className="adventure-layout">
        <ol className="level-path" aria-label="Pilih level latihan">
          {[...levels].reverse().map((level, position) => (
            <li
              key={level.id}
              className={`level-path__step level-path__step--${level.status}${level.id === current?.id ? ' level-path__step--current' : ''}`}
            >
              <div className="level-path__node" aria-hidden="true">
                <Icon
                  name={
                    level.status === 'locked'
                      ? 'lock'
                      : level.status === 'completed'
                        ? 'check'
                        : 'play'
                  }
                  width={32}
                  height={32}
                />
                <span>LEVEL {levels.indexOf(level) + 1}</span>
              </div>
              <div className="level-path__caption">
                <h3>{level.title}</h3>
                <p>
                  {level.status === 'locked'
                    ? 'Terkunci'
                    : level.status === 'completed'
                      ? 'Selesai'
                      : level.status === 'inProgress'
                        ? 'Sedang dikerjakan'
                        : 'Terbuka'}
                </p>
                {level.status === 'locked' ? (
                  <small>Nilai minimal 80 pada level sebelumnya.</small>
                ) : (
                  <>
                    <dl className="path-scores">
                      <div>
                        <dt>Terakhir</dt>
                        <dd>{level.latestScore ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Terbaik</dt>
                        <dd>{level.bestScore ?? '—'}</dd>
                      </div>
                    </dl>
                    {level.latestStars != null && (
                      <p aria-label="Bintang attempt terbaru">
                        Bintang terakhir: {level.latestStars} / 3
                      </p>
                    )}
                    <Link href={`/student/assessment?levelId=${encodeURIComponent(level.id)}`}>
                      Riwayat level
                    </Link>
                    {level.id !== current?.id && (
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() => onStart(level.id)}
                      >
                        {pending && pendingLevelId === level.id
                          ? 'Membuka latihan…'
                          : actionLabel(level)}
                      </Button>
                    )}
                  </>
                )}
              </div>
              {level.id === current?.id && (
                <Card fullWidth className="adventure-focus">
                  <span className="adventure-focus__badge">Kamu di sini!</span>
                  <div className="adventure-summary__labels">
                    <span className="eyebrow">Fokus hari ini</span>
                    <strong>Target: ≥80</strong>
                  </div>
                  <h3>{level.title}</h3>
                  <p>10 soal · Waktu berjalan tanpa batas</p>
                  {startButton(level)}
                </Card>
              )}
              {position < levels.length - 1 && (
                <svg
                  className="level-path__connector"
                  aria-hidden="true"
                  viewBox="0 0 360 280"
                  preserveAspectRatio="none"
                >
                  <path
                    d={`M${[180, 64, 296][position % 3]} 0 C${[180, 64, 296][position % 3]} 140 ${[180, 64, 296][(position + 1) % 3]} 140 ${[180, 64, 296][(position + 1) % 3]} 280`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeDasharray="9 10"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </li>
          ))}
        </ol>
        {current && (
          <aside className="adventure-context">
            <Card>
              <span className="eyebrow">Lanjutkan petualangan</span>
              <h3>{current.title}</h3>
              <p>
                Jawaban tersimpan dapat dilanjutkan. Ketuntasan dan akses level mengikuti hasil
                server.
              </p>
              {startButton(current)}
            </Card>
          </aside>
        )}
      </div>
      <Card className="adventure-policy">
        <Icon name="info" />
        <p>
          <strong>Standar ketuntasan:</strong> nilai minimal 80 membuka level berikutnya. Mengulang
          latihan tetap menyimpan riwayat dan nilai terbaik.
        </p>
      </Card>
      {current && (
        <div className="adventure-mobile-action">
          <div>
            <small>Lanjutkan petualangan</small>
            <strong>{current.title}</strong>
          </div>
          <Button disabled={pending} onClick={() => onStart(current.id)}>
            {pending ? 'Membuka…' : 'Mulai Drill'}
            <Icon name="play" width={16} height={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
