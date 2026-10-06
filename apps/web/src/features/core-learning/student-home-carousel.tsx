'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@tka/ui';
import type { CurrentTryoutDto, DashboardDrillDto } from './generated-types';
import { HomeTryoutHero, HomeTryoutSkeleton } from './dashboard-presentation';
import { DataState } from './ui';

const holdMs = 5_350;
const anticipationMs = 110;
const snapMs = 410;
const settleMs = 130;
const motionMs = anticipationMs + snapMs + settleMs;
const sequence = [
  { key: 'before', kind: 'tryout', clone: true },
  { key: 'drill', kind: 'drill', clone: false },
  { key: 'tryout', kind: 'tryout', clone: false },
  { key: 'after', kind: 'drill', clone: true },
  { key: 'tail', kind: 'tryout', clone: true },
] as const;

function DrillHero({ activeDrill }: { activeDrill: DashboardDrillDto | null }) {
  return (
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
    </div>
  );
}

function TryoutHero({
  tryout,
  tryoutPending,
  tryoutError,
  retryTryout,
}: {
  tryout?: CurrentTryoutDto | undefined;
  tryoutPending: boolean;
  tryoutError: Error | null;
  retryTryout: () => void;
}) {
  if (tryoutPending) return <HomeTryoutSkeleton />;
  if (tryoutError)
    return (
      <div className="sh-hero sh-hero--tryout student-home-hero">
        <span className="sh-hero__eyebrow">TRYOUT</span>
        <div className="sh-hero__copy">
          <h2>Tryout belum dapat dimuat</h2>
          <DataState pending={false} error={tryoutError} retry={retryTryout} />
        </div>
      </div>
    );
  return tryout ? <HomeTryoutHero data={tryout} /> : null;
}

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
  const carouselRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const goSlideRef = useRef<(index: number) => void>(() => {});

  useLayoutEffect(() => {
    const carousel = carouselRef.current;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!carousel || !viewport || !track) return;

    const cards = Array.from(track.children) as HTMLElement[];
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reducedMotion = media?.matches ?? false;
    let position = 1;
    let stride = 0;
    let hovered = false;
    let focused = false;
    let dragging = false;
    let horizontal = false;
    let startX = 0;
    let startY = 0;
    let dragDelta = 0;
    let animating = false;
    let autoTimer: number | undefined;
    let fallbackTimer: number | undefined;
    let animation: Animation | null = null;

    const transformAt = (offset: number) => `translate3d(${offset}px, 0, 0)`;
    const activeAt = (index: number) => (((index - 1) % 2) + 2) % 2;

    function paint(offset = -position * stride, cardOffset = offset) {
      track!.style.transform = transformAt(offset);
      for (const [index, card] of cards.entries()) {
        const relative = stride
          ? Math.max(-1, Math.min(1, (index * stride + cardOffset) / stride))
          : 0;
        const distance = Math.abs(relative);
        card.style.setProperty('--card-scale', String(reducedMotion ? 1 : 1 - 0.02 * distance));
        card.style.setProperty('--card-opacity', String(reducedMotion ? 1 : 1 - 0.06 * distance));
        card.style.setProperty('--card-y', `${reducedMotion ? 0 : 6 * distance}px`);
        card.style.setProperty('--card-angle', `${reducedMotion ? 0 : 3 * distance}deg`);
        card.style.setProperty('--parallax-x', `${reducedMotion ? 0 : relative * 16}px`);
      }
    }

    function clearAuto() {
      window.clearTimeout(autoTimer);
      autoTimer = undefined;
    }

    function scheduleAuto() {
      clearAuto();
      if (reducedMotion || hovered || focused || dragging || animating || document.hidden) return;
      autoTimer = window.setTimeout(() => moveTo(position + 1), holdMs);
    }

    function finishTransition() {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = undefined;
      if (animation) {
        animation.onfinish = null;
        animation.cancel();
        animation = null;
      }
      track!.style.transition = '';
      animating = false;
      if (position === 0) position = 2;
      if (position === 3) position = 1;
      track!.dataset.phase = 'hold';
      paint();
      setActive(activeAt(position));
      scheduleAuto();
    }

    function moveTo(target: number, fromOffset?: number) {
      if (animating || stride === 0) return;
      clearAuto();
      const previous = position;
      const start = fromOffset ?? -position * stride;
      position = target;
      setActive(activeAt(target));
      const end = -target * stride;
      if (reducedMotion || Math.abs(end - start) < 0.5) {
        finishTransition();
        return;
      }

      animating = true;
      const rebound = target === previous;
      const direction = Math.sign(target - previous) || Math.sign(start - end) || 1;
      const duration = rebound ? 180 : motionMs;
      track!.dataset.phase = rebound ? 'rebound' : 'snap';
      paint(start, end);

      if (typeof track!.animate === 'function') {
        const anticipation = rebound ? 0 : anticipationMs / motionMs;
        const overshoot = rebound ? end : end - direction * 4;
        animation = track!.animate(
          [
            { transform: transformAt(start), offset: 0, easing: 'cubic-bezier(.4, 0, .8, .3)' },
            {
              transform: transformAt(start + direction * 6),
              offset: anticipation,
              easing: 'cubic-bezier(.2, .9, .25, 1)',
            },
            {
              transform: transformAt(overshoot),
              offset: rebound ? 1 : (anticipationMs + snapMs) / motionMs,
              easing: 'cubic-bezier(.22, 1, .36, 1)',
            },
            { transform: transformAt(end), offset: 1 },
          ],
          { duration, fill: 'forwards' },
        );
        animation.onfinish = finishTransition;
      } else {
        track!.style.transition = `transform ${duration}ms cubic-bezier(.22, 1, .36, 1)`;
        window.requestAnimationFrame?.(() => paint(end, end));
      }
      fallbackTimer = window.setTimeout(finishTransition, duration + 40);
    }

    function measure() {
      const card = cards[1];
      if (!card) return;
      if (animating) finishTransition();
      const width = card.offsetWidth || parseFloat(getComputedStyle(card).width) || 300;
      const gap = parseFloat(getComputedStyle(track!).gap) || 0;
      stride = width + gap;
      paint();
    }

    function release(commit = true) {
      if (!dragging) return;
      dragging = false;
      viewport!.classList.remove('is-dragging');
      const offset = -position * stride + dragDelta;
      const threshold = Math.min(48, stride * 0.15);
      const direction =
        commit && horizontal && Math.abs(dragDelta) > threshold ? (dragDelta < 0 ? 1 : -1) : 0;
      horizontal = false;
      dragDelta = 0;
      moveTo(position + direction, offset);
    }

    function onPointerDown(event: PointerEvent) {
      if (animating || event.button > 0 || (event.target as Element).closest('a, button')) return;
      dragging = true;
      horizontal = false;
      dragDelta = 0;
      startX = event.clientX;
      startY = event.clientY;
      clearAuto();
      viewport!.setPointerCapture?.(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (!dragging) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!horizontal) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
          release(false);
          return;
        }
        if (Math.abs(dx) < 6) return;
        horizontal = true;
        viewport!.classList.add('is-dragging');
      }
      dragDelta = Math.max(-stride * 0.95, Math.min(stride * 0.95, dx));
      track!.dataset.phase = 'drag';
      paint(-position * stride + dragDelta);
    }

    function onPointerUp() {
      release();
    }

    function onPointerCancel() {
      release(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      moveTo(position + (event.key === 'ArrowRight' ? 1 : -1));
    }

    function onEnter() {
      hovered = true;
      clearAuto();
    }

    function onLeave() {
      hovered = false;
      scheduleAuto();
    }

    function onFocusIn() {
      focused = true;
      clearAuto();
    }

    function onFocusOut() {
      queueMicrotask(() => {
        focused = carousel!.contains(document.activeElement);
        scheduleAuto();
      });
    }

    function onMotionChange() {
      reducedMotion = media?.matches ?? false;
      if (reducedMotion && animating) finishTransition();
      paint();
      scheduleAuto();
    }

    function goSlide(index: number) {
      if (activeAt(position) === index) return;
      moveTo(position + 1);
    }

    goSlideRef.current = goSlide;
    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', onPointerCancel);
    viewport.addEventListener('lostpointercapture', onPointerCancel);
    carousel.addEventListener('keydown', onKeyDown);
    carousel.addEventListener('mouseenter', onEnter);
    carousel.addEventListener('mouseleave', onLeave);
    carousel.addEventListener('focusin', onFocusIn);
    carousel.addEventListener('focusout', onFocusOut);
    document.addEventListener('visibilitychange', scheduleAuto);
    media?.addEventListener('change', onMotionChange);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    measure();
    scheduleAuto();

    return () => {
      clearAuto();
      window.clearTimeout(fallbackTimer);
      if (animation) {
        animation.onfinish = null;
        animation.cancel();
      }
      observer?.disconnect();
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      viewport.removeEventListener('pointerup', onPointerUp);
      viewport.removeEventListener('pointercancel', onPointerCancel);
      viewport.removeEventListener('lostpointercapture', onPointerCancel);
      carousel.removeEventListener('keydown', onKeyDown);
      carousel.removeEventListener('mouseenter', onEnter);
      carousel.removeEventListener('mouseleave', onLeave);
      carousel.removeEventListener('focusin', onFocusIn);
      carousel.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('visibilitychange', scheduleAuto);
      media?.removeEventListener('change', onMotionChange);
      goSlideRef.current = () => {};
    };
  }, []);

  return (
    <section
      ref={carouselRef}
      className="sh-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="Pilihan belajar utama"
    >
      <div ref={viewportRef} className="sh-carousel__viewport" aria-live="off">
        <div ref={trackRef} className="sh-carousel__track">
          {sequence.map(({ key, kind, clone }) => {
            const index = kind === 'drill' ? 0 : 1;
            return (
              <div
                key={key}
                className={`sh-carousel__slide${clone ? ' sh-carousel__slide--clone' : ` sh-carousel__slide--${kind}`}${!clone && active === index ? ' is-active' : ''}`}
                data-carousel-card=""
                data-clone={clone ? 'true' : undefined}
                aria-hidden={clone || active !== index}
                inert={clone || active !== index}
              >
                {kind === 'drill' ? (
                  <DrillHero activeDrill={activeDrill} />
                ) : (
                  <TryoutHero
                    tryout={tryout}
                    tryoutPending={tryoutPending}
                    tryoutError={tryoutError}
                    retryTryout={retryTryout}
                  />
                )}
              </div>
            );
          })}
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
              onClick={() => goSlideRef.current(index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
