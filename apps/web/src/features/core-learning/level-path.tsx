'use client';
import { formatStudentNumber } from './student-format';

import { Button, Dialog, Icon } from '@tka/ui';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Level, SubchapterDetail } from './types';
import './level-path.css';

// Trail centers in owl-trail.webp, measured from the bottom toward the top.
const stations = [
  [69, 89],
  [31, 71],
  [58, 54],
  [26, 36],
  [70, 14],
] as const;

const levelStatus = {
  locked: 'Terkunci',
  open: 'Terbuka',
  inProgress: 'Sedang dikerjakan',
  completed: 'Selesai',
} as const;

const levelAction = {
  open: 'Mulai latihan',
  inProgress: 'Lanjutkan latihan',
  completed: 'Latihan lagi',
} as const;

function revealMarker(marker: HTMLElement, dock: HTMLDivElement | null) {
  const rect = marker.getBoundingClientRect();
  const visibleBottom = dock?.getBoundingClientRect().top || window.innerHeight;
  if (rect.bottom > visibleBottom - 32 || rect.top < 32) {
    marker.scrollIntoView?.({ block: 'center', behavior: 'instant' });
  }
}

function LevelStars({ stars, size = 15 }: { stars: number; size?: number }) {
  return (
    <span className="level-path__stars" aria-hidden="true">
      {[1, 2, 3].map((star) => (
        <Icon key={star} name="star" width={size} height={size} data-earned={star <= stars} />
      ))}
    </span>
  );
}

export function LevelPath({
  data,
  chapterLabel,
  placementLevelId,
  pending,
  requestedLevelId,
  startError,
  onStart,
}: {
  data: SubchapterDetail;
  chapterLabel: string;
  placementLevelId?: string | undefined;
  pending: boolean;
  requestedLevelId: string | undefined;
  startError: string | undefined;
  onStart: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const initialMarker = useRef<HTMLLIElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const positioned = useRef<string>(undefined);
  const interacted = useRef(false);
  const levels = [...data.levels].sort((a, b) => a.order - b.order);
  const completed = levels.filter((level) => level.status === 'completed');
  const placementLevel = levels.find((level) => level.id === placementLevelId);
  const nextOpen =
    placementLevel &&
    levels.find((level) => level.order > placementLevel.order && level.status === 'open');
  const higherProgress =
    placementLevel &&
    levels.some((level) => level.order > placementLevel.order && level.status !== 'locked');
  const recommended =
    placementLevel?.status === 'open' && !higherProgress ? placementLevel : undefined;
  const recommendedLevelId = recommended?.id;
  const current =
    levels.find((level) => level.status === 'inProgress') ??
    recommended ??
    nextOpen ??
    levels.find((level) => level.status === 'open');
  const initialLevel = current ?? completed.at(-1) ?? levels[0];
  const selected =
    levels.find((level) => level.id === selectedId && level.status !== 'locked') ?? initialLevel;
  const sectionCount = Math.ceil(levels.length / stations.length);

  useEffect(() => {
    if (interacted.current || positioned.current === initialLevel?.id) return;
    const frame = window.requestAnimationFrame(() => {
      const marker = initialMarker.current;
      if (!marker) return;
      if (interacted.current) return;
      positioned.current = initialLevel?.id;
      revealMarker(marker, dock.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialLevel?.id]);

  if (!selected) return null;

  const openDetail = (level: Level, trigger: HTMLButtonElement) => {
    interacted.current = true;
    setSelectedId(level.id);
    trigger.focus({ preventScroll: true });
    setDialogOpen(true);
  };

  const isRecommended = selected.id === recommendedLevelId;
  const statusLabel = levelStatus[selected.status];
  const selectedLevel = `Level ${selected.order}`;
  const latestStars = selected.latestStars;
  const detail = (
    <div className="level-path__details">
      <div className="level-path__context">
        <p>{data.subchapter.title}</p>
        <p>{chapterLabel}</p>
        {selected.title !== selectedLevel && <p>{selected.title}</p>}
      </div>
      {selected.status === 'locked' ? (
        <p>Nilai minimal 80 pada level sebelumnya.</p>
      ) : (
        <>
          {isRecommended && (
            <p className="level-path__recommendation">
              <Icon name="target" width={16} height={16} /> Disarankan dari hasil pretest
            </p>
          )}
          <p className="level-path__meta">10 soal</p>
          <div
            className="level-path__rating"
            role="img"
            aria-label={
              latestStars == null
                ? 'Bintang belum tercatat'
                : `Bintang terakhir: ${latestStars} / 3`
            }
          >
            <LevelStars stars={latestStars ?? 0} size={38} />
          </div>
          <dl className="level-path__scores">
            <div>
              <dt>Nilai terakhir</dt>
              <dd>
                {selected.latestScore == null ? '—' : formatStudentNumber(selected.latestScore)}
              </dd>
            </div>
            <div className="level-path__best">
              <dt>
                <Icon name="star" width={14} height={14} /> Nilai terbaik
              </dt>
              <dd>{selected.bestScore == null ? '—' : formatStudentNumber(selected.bestScore)}</dd>
            </div>
          </dl>
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
              : isRecommended
                ? `Mulai ${selectedLevel}`
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
        style={{ aspectRatio: `941 / ${1672 * sectionCount}` }}
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
          const recommended = level.id === recommendedLevelId;
          const isSelected = level.id === selected.id;
          const levelName = `Level ${level.order}`;
          const stars = level.status === 'locked' ? null : level.latestStars;
          const description = [
            levelName,
            level.title === levelName ? null : level.title,
            levelStatus[level.status],
            recommended ? 'Mulai di sini, disarankan dari hasil pretest' : null,
            stars == null ? null : `${stars} dari 3 bintang terakhir`,
          ]
            .filter(Boolean)
            .join(', ');
          const medal = (
            <span className="level-path__medal" aria-hidden="true">
              <span>{level.order}</span>
              {level.status === 'locked' && (
                <Icon className="level-path__lock" name="lock" width={14} height={14} />
              )}
              {level.status === 'completed' && stars == null && (
                <Icon className="level-path__lock" name="check" width={14} height={14} />
              )}
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
              {recommended ? (
                <span className="level-path__here level-path__here--placement" aria-hidden="true">
                  <Icon name="target" width={14} height={14} /> Mulai di sini
                </span>
              ) : (
                active && (
                  <span className="level-path__here" aria-hidden="true">
                    Kamu di sini
                  </span>
                )
              )}
              {stars != null && (
                <span className="level-path__map-stars">
                  <LevelStars stars={stars} />
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
                      interacted.current = true;
                      revealMarker(node, dock.current);
                    }
                  }}
                  onClick={(event) => openDetail(level, event.currentTarget)}
                >
                  {medal}
                </button>
              )}
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
          title={selectedLevel}
          pending={pending}
          onClose={() => setDialogOpen(false)}
        >
          {detail}
        </Dialog>
      )}
    </>
  );
}
