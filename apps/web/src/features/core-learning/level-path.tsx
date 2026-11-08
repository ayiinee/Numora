'use client';

import { Button, Dialog, Icon } from '@tka/ui';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Level, SubchapterDetail } from './types';
import './level-path.css';

// Trail centers in forest-trail.webp, measured from the bottom toward the top.
const stations = [
  [69, 89],
  [36, 77],
  [56, 57],
  [24, 37],
  [72, 13],
] as const;

const levelStatus = {
  locked: { label: 'Terkunci', icon: 'lock' },
  open: { label: 'Terbuka', icon: 'play' },
  inProgress: { label: 'Sedang dikerjakan', icon: 'play' },
  completed: { label: 'Selesai', icon: 'check' },
} as const;

const levelAction = {
  open: 'Mulai latihan',
  inProgress: 'Lanjutkan latihan',
  completed: 'Latihan lagi',
} as const;

function revealMarker(marker: HTMLElement, dock: HTMLDivElement | null) {
  const rect = marker.getBoundingClientRect();
  const visibleBottom = dock?.getBoundingClientRect().top || window.innerHeight;
  if (rect.bottom > visibleBottom - 28 || rect.top < 32) {
    marker.scrollIntoView?.({ block: 'center', behavior: 'instant' });
  }
}

function LevelStars({ stars }: { stars: number }) {
  return (
    <span className="level-path__stars" aria-hidden="true">
      {[1, 2, 3].map((star) => (
        <Icon key={star} name="star" width={15} height={15} data-earned={star <= stars} />
      ))}
    </span>
  );
}

export function LevelPath({
  data,
  pending,
  requestedLevelId,
  startError,
  onStart,
}: {
  data: SubchapterDetail;
  pending: boolean;
  requestedLevelId: string | undefined;
  startError: string | undefined;
  onStart: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const initialMarker = useRef<HTMLLIElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);
  const levels = [...data.levels].sort((a, b) => a.order - b.order);
  const completed = levels.filter((level) => level.status === 'completed');
  const current =
    levels.find((level) => level.status === 'inProgress') ??
    levels.find((level) => level.status === 'open');
  const initialLevel = current ?? completed.at(-1) ?? levels[0];
  const selected =
    levels.find((level) => level.id === selectedId && level.status !== 'locked') ?? initialLevel;
  const sectionCount = Math.ceil(levels.length / stations.length);

  useEffect(() => {
    if (positioned.current) return;
    const frame = window.requestAnimationFrame(() => {
      const marker = initialMarker.current;
      if (!marker) return;
      positioned.current = true;
      revealMarker(marker, dock.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialLevel?.id]);

  if (!selected) return null;

  const openDetail = (level: Level, trigger: HTMLButtonElement) => {
    positioned.current = true;
    setSelectedId(level.id);
    trigger.focus({ preventScroll: true });
    setDialogOpen(true);
  };

  const statusLabel = levelStatus[selected.status].label;
  const detail = (
    <div className="level-path__details">
      <p className="level-path__status">{statusLabel}</p>
      {selected.status === 'locked' ? (
        <p>Nilai minimal 80 pada level sebelumnya.</p>
      ) : (
        <>
          <p>10 soal · Waktu berjalan tanpa batas</p>
          <dl className="level-path__scores">
            <div>
              <dt>Nilai terakhir</dt>
              <dd>{selected.latestScore ?? '—'}</dd>
            </div>
            <div>
              <dt>Nilai terbaik</dt>
              <dd>{selected.bestScore ?? '—'}</dd>
            </div>
          </dl>
          {selected.latestStars != null && (
            <p className="level-path__rating">
              <LevelStars stars={selected.latestStars} />
              Bintang terakhir: {selected.latestStars} / 3
            </p>
          )}
          <Link
            className="level-path__history"
            href={`/student/assessment?levelId=${encodeURIComponent(selected.id)}`}
          >
            Riwayat level
          </Link>
          {startError && requestedLevelId === selected.id && (
            <p className="form-error" role="alert">
              {startError}
            </p>
          )}
          <Button fullWidth disabled={pending} onClick={() => onStart(selected.id)}>
            {pending && requestedLevelId === selected.id
              ? 'Membuka latihan…'
              : levelAction[selected.status]}
            <Icon name="arrow" width={18} height={18} />
          </Button>
        </>
      )}
    </div>
  );

  return (
    <>
      <ol
        className="level-path"
        aria-label="Peta level latihan"
        role="list"
        style={{ aspectRatio: `2 / ${3 * sectionCount}` }}
      >
        {[...levels].reverse().map((level, position) => {
          const index = levels.length - position - 1;
          const section = Math.floor(index / stations.length);
          const indexInSection = index % stations.length;
          const levelsInSection = Math.min(
            stations.length,
            levels.length - section * stations.length,
          );
          const station = Math.round(
            (indexInSection * (stations.length - 1)) / Math.max(1, levelsInSection - 1),
          );
          const [x, y] = stations[station]!;
          const active = level.id === current?.id;
          const isSelected = level.id === selected.id;
          const { label, icon } = levelStatus[level.status];
          const number = index + 1;
          const description = `Level ${number}, ${level.title}, ${label}`;
          const medal = (
            <span className="level-path__medal" aria-hidden="true">
              <Icon name={icon} width={24} height={24} />
            </span>
          );
          return (
            <li
              key={level.id}
              ref={level.id === initialLevel?.id ? initialMarker : undefined}
              className={`level-path__step level-path__step--${level.status}`}
              style={{
                left: `${x}%`,
                top: `${((sectionCount - section - 1) * 100 + y) / sectionCount}%`,
              }}
            >
              {active && (
                <span className="level-path__here" aria-hidden="true">
                  Kamu di sini
                </span>
              )}
              {!active && level.latestStars != null && level.status !== 'locked' && (
                <span className="level-path__map-stars">
                  <LevelStars stars={level.latestStars} />
                </span>
              )}
              {level.status === 'locked' ? (
                <>
                  {medal}
                  <span className="level-path__sr-only">{description}</span>
                </>
              ) : (
                <button
                  type="button"
                  className="level-path__node"
                  aria-label={description}
                  aria-current={active ? 'step' : undefined}
                  aria-pressed={isSelected}
                  aria-haspopup="dialog"
                  onFocus={(event) => {
                    const node = event.currentTarget;
                    if (node.matches(':focus-visible')) {
                      positioned.current = true;
                      revealMarker(node, dock.current);
                    }
                  }}
                  onClick={(event) => openDetail(level, event.currentTarget)}
                >
                  {medal}
                </button>
              )}
              <span className="level-path__number" aria-hidden="true">
                Level {number}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="adventure-mobile-action" ref={dock}>
        <div>
          <strong>{selected.title}</strong>
          <small>{statusLabel}</small>
        </div>
        <Button
          variant="secondary"
          aria-haspopup="dialog"
          onClick={(event) => openDetail(selected, event.currentTarget)}
        >
          Detail level
        </Button>
      </div>
      {dialogOpen && (
        <Dialog
          open
          className="level-path-dialog"
          title={selected.title}
          pending={pending}
          onClose={() => setDialogOpen(false)}
        >
          {detail}
        </Dialog>
      )}
    </>
  );
}
