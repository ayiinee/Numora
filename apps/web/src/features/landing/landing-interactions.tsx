'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Brand, Button, Dialog, Icon, type IconName } from '@tka/ui';
import styles from './landing.module.css';

const categories = [
  ['Latihan bertahap', 'clipboard', '#cara-belajar'],
  ['Pembahasan', 'chat', '#pembahasan'],
  ['Progres dan bintang', 'star', '#progres'],
  ['Materi dan level', 'book', '#materi'],
  ['Akses web', 'globe', '#akses-web'],
  ['Untuk sekolah', 'school', '#untuk-sekolah'],
  ['Persiapan TKA', 'target', '#persiapan-tka'],
] as const satisfies readonly (readonly [string, IconName, string])[];
const categoryPixelsPerMs = 24 / 1000;

export function LandingHeader() {
  const [showAction, setShowAction] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const hero = document.getElementById('aksi-hero');
    const closing = document.getElementById('aksi-penutup');
    if (!hero || !closing) return;

    const update = () => {
      const heroPassed = hero.getBoundingClientRect().bottom <= 70;
      const closingAhead = closing.getBoundingClientRect().top >= window.innerHeight;
      setShowAction(heroPassed && closingAhead);
      if (heroPassed && menu.current) menu.current.open = false;
    };
    const observer = new IntersectionObserver(update, { rootMargin: '-70px 0px 0px 0px' });
    observer.observe(hero);
    observer.observe(closing);
    window.addEventListener('resize', update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <header className={styles.header} data-scrolled={showAction}>
      <div className={styles.headerInner}>
        <a className={styles.headerBrand} href="#beranda" aria-label="Beranda Numora">
          <Brand />
        </a>
        {showAction ? (
          <Link className={`${styles.primary} ${styles.headerAction}`} href="/">
            Mulai belajar
          </Link>
        ) : (
          <details
            ref={menu}
            className={styles.routeMenu}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                event.currentTarget.open = false;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && event.currentTarget.open) {
                event.currentTarget.open = false;
                event.currentTarget.querySelector('summary')?.focus();
              }
            }}
          >
            <summary>
              Jalur belajar <Icon name="chevron" width={16} height={16} />
            </summary>
            <nav aria-label="Jalur belajar">
              <a
                href="#cara-belajar"
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                }}
              >
                Belajar mandiri
              </a>
              <a
                href="#untuk-sekolah"
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                }}
              >
                Belajar dengan kelas
              </a>
            </nav>
          </details>
        )}
      </div>
    </header>
  );
}

function scrollWithinCycle(rail: HTMLDivElement, offset: number, width: number) {
  // Identical lists on both sides let the visible position wrap in either direction.
  if (width) rail.scrollLeft = width + (((offset % width) + width) % width);
}

export function CategoryRail() {
  const viewport = useRef<HTMLDivElement>(null);
  const original = useRef<HTMLUListElement>(null);
  const cycleWidth = useRef(0);
  const hovered = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; offset: number; moved: boolean } | null>(
    null,
  );
  const suppressClick = useRef(false);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const rail = viewport.current;
    const list = original.current;
    if (!rail || !list) return;
    const measure = () => {
      const width = list.getBoundingClientRect().width;
      const previousWidth = cycleWidth.current;
      cycleWidth.current = width;
      if (width && width !== previousWidth)
        rail.scrollLeft = previousWidth ? (rail.scrollLeft / previousWidth) * width : width;
    };
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(motion.matches);
    const resize = new ResizeObserver(measure);
    resize.observe(list);
    measure();
    updateMotion();
    motion.addEventListener('change', updateMotion);
    return () => {
      resize.disconnect();
      motion.removeEventListener('change', updateMotion);
    };
  }, []);

  useEffect(() => {
    const rail = viewport.current;
    if (
      !rail ||
      paused ||
      reducedMotion ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    let frame = 0;
    let previous = 0;
    let remainder = 0;
    const tick = (time: number) => {
      if (previous && !drag.current && !hovered.current && !rail.matches(':focus-within')) {
        remainder += Math.min(time - previous, 50) * categoryPixelsPerMs;
        const pixels = Math.floor(remainder);
        if (pixels) {
          scrollWithinCycle(rail, rail.scrollLeft + pixels, cycleWidth.current);
          remainder -= pixels;
        }
      } else {
        remainder = 0;
      }
      previous = time;
      frame = requestAnimationFrame(tick);
    };
    const visibility = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      previous = 0;
      if (entry?.isIntersecting) frame = requestAnimationFrame(tick);
    });
    visibility.observe(rail);
    return () => {
      visibility.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [paused, reducedMotion]);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || !cycleWidth.current) return;
    event.preventDefault();
    suppressClick.current = false;
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offset: event.currentTarget.scrollLeft,
      moved: false,
    };
    if (event.target instanceof Element) event.target.setPointerCapture(event.pointerId);
  };

  const dragRail = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    if (!gesture.moved && (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(event.clientY - gesture.y)))
      return;
    gesture.moved = true;
    event.currentTarget.dataset.dragging = 'true';
    scrollWithinCycle(event.currentTarget, gesture.offset - dx, cycleWidth.current);
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    suppressClick.current = drag.current.moved;
    drag.current = null;
    delete event.currentTarget.dataset.dragging;
  };

  return (
    <nav className={styles.categoryBar} aria-label="Jelajahi Numora">
      <div className={styles.categoryInner}>
        <div
          ref={viewport}
          className={styles.categoryViewport}
          onPointerEnter={(event) => {
            hovered.current = event.pointerType !== 'touch';
          }}
          onPointerLeave={() => {
            hovered.current = false;
          }}
          onPointerDown={startDrag}
          onPointerMove={dragRail}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={finishDrag}
          onClickCapture={(event) => {
            if (suppressClick.current && event.detail > 0) {
              event.preventDefault();
              suppressClick.current = false;
            }
          }}
        >
          {['before', 'original', 'after'].map((copy) => (
            <ul
              key={copy}
              ref={copy === 'original' ? original : undefined}
              className={styles.categories}
              aria-hidden={copy !== 'original' || undefined}
            >
              {categories.map(([label, icon, href]) => (
                <li key={href}>
                  <a href={href} draggable={false} tabIndex={copy === 'original' ? 0 : -1}>
                    <Icon name={icon} width={20} height={20} />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          ))}
        </div>
        {!reducedMotion && (
          <Button
            variant="ghost"
            aria-label={paused ? 'Lanjutkan gerak kategori' : 'Jeda gerak kategori'}
            className={styles.categoryPause}
            style={{ width: 44 }}
            onClick={() => setPaused((current) => !current)}
          >
            {paused ? (
              <Icon name="play" width={16} height={16} />
            ) : (
              <span className={styles.pauseMark} aria-hidden="true" />
            )}
          </Button>
        )}
      </div>
    </nav>
  );
}

export function AccountDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        className={styles.secondary}
        style={{ width: '100%', borderRadius: 12 }}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Sudah punya akun
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Masuk ke Numora"
        description="Gunakan akun Google untuk melanjutkan sebagai siswa atau guru."
        className={styles.accountDialog ?? ''}
      >
        <Link className={styles.primary} href="/">
          Buka halaman masuk
        </Link>
      </Dialog>
    </>
  );
}
