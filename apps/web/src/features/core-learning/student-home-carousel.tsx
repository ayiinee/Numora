'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@tka/ui';
import type { CurrentTryoutDto, DashboardDrillDto } from './generated-types';
import { HomeTryoutHero, HomeTryoutSkeleton } from './dashboard-presentation';
import { DataState } from './ui';

const intervalMs = 6_000;

export function StudentHomeCarousel({
  activeDrill,
  tryout,
  tryoutPending,
  tryoutError,
  retryTryout,
}: {
  activeDrill: DashboardDrillDto | null;
  tryout?: CurrentTryoutDto | undefined;
  tryoutPending: boolean;
  tryoutError: Error | null;
  retryTryout: () => void;
}) {
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [timerRevision, setTimerRevision] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setReducedMotion(media?.matches ?? false);
    const syncVisibility = () => setHidden(document.hidden);
    syncMotion();
    syncVisibility();
    media?.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      media?.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, []);

  const autoplayPaused = hovered || focused || hidden || reducedMotion;
  useEffect(() => {
    if (autoplayPaused) return;
    const timer = window.setTimeout(() => setActive((current) => (current + 1) % 2), intervalMs);
    return () => window.clearTimeout(timer);
  }, [active, autoplayPaused, timerRevision]);

  const select = (slide: number) => {
    setActive((slide + 2) % 2);
    setTimerRevision((revision) => revision + 1);
  };

  return (
    <section
      ref={carouselRef}
      className="sh-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="Pilihan belajar utama"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!carouselRef.current?.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onTouchStart={(event) => {
        touchStart.current = { x: event.touches[0]!.clientX, y: event.touches[0]!.clientY };
      }}
      onTouchEnd={(event) => {
        if (!touchStart.current) return;
        const dx = event.changedTouches[0]!.clientX - touchStart.current.x;
        const dy = event.changedTouches[0]!.clientY - touchStart.current.y;
        touchStart.current = null;
        if (Math.abs(dx) >= 44 && Math.abs(dx) > Math.abs(dy)) select(active + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="sh-carousel__viewport" aria-live="off">
        <div
          className={`sh-carousel__slide sh-carousel__slide--drill${active === 0 ? ' is-active' : ''}`}
          aria-hidden={active !== 0}
          inert={active !== 0}
        >
          <div className="sh-hero sh-hero--drill student-home-hero">
            <span className="sh-hero__eyebrow">DRILL</span>
            <div className="sh-hero__copy">
              <h2>
                Latihan
                <br /> matematika!
              </h2>
              <p>
                {activeDrill
                  ? `Lanjutkan ${activeDrill.title} dari soal terakhir.`
                  : 'Pilih materi, mulai latihan.'}
              </p>
              <Link
                className="sh-hero__action"
                href={activeDrill ? `/student/drill/${activeDrill.attemptId}` : '/student/learn'}
              >
                {activeDrill ? 'Lanjutkan latihan' : 'Pilih materi'}
                <Icon name="chevron" width={18} height={18} />
              </Link>
            </div>
            <img
              className="sh-hero__illustration sh-hero__illustration--drill"
              src="/illustrations/student-home/reference-drill-owl.png"
              width="384"
              height="350"
              alt=""
              draggable="false"
            />
          </div>
        </div>
        <div
          className={`sh-carousel__slide sh-carousel__slide--tryout${active === 1 ? ' is-active' : ''}`}
          aria-hidden={active !== 1}
          inert={active !== 1}
        >
          {tryoutPending ? (
            <HomeTryoutSkeleton />
          ) : tryoutError ? (
            <div className="sh-hero sh-hero--tryout student-home-hero">
              <span className="sh-hero__eyebrow">TRYOUT</span>
              <div className="sh-hero__copy">
                <h2>Tryout belum dapat dimuat</h2>
                <DataState pending={false} error={tryoutError} retry={retryTryout} />
              </div>
            </div>
          ) : tryout ? (
            <HomeTryoutHero data={tryout} />
          ) : null}
        </div>
      </div>
      <div className="sh-carousel__controls">
        <div className="sh-carousel__indicators" aria-label="Pilih slide">
          {['Drill', 'Tryout'].map((label, index) => (
            <button
              key={label}
              type="button"
              className={active === index ? 'is-active' : ''}
              aria-label={`Tampilkan slide ${label}`}
              aria-current={active === index ? 'true' : undefined}
              onClick={() => select(index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
