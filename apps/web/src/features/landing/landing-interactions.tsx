'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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

export function CategoryRail() {
  const rail = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const list = rail.current;
    if (!list) return;
    const update = () =>
      setEdges({
        start: list.scrollLeft <= 1,
        end: list.scrollLeft + list.clientWidth >= list.scrollWidth - 1,
      });
    const observer = new ResizeObserver(update);
    observer.observe(list);
    list.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      list.removeEventListener('scroll', update);
    };
  }, []);

  const scroll = (direction: number) => {
    const list = rail.current;
    if (!list) return;
    list.scrollBy({
      left: direction * list.clientWidth * 0.65,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  };

  return (
    <nav className={styles.categoryBar} aria-label="Jelajahi Numora">
      <div className={styles.categoryInner}>
        <Button
          variant="ghost"
          aria-label="Geser kategori ke kiri"
          disabled={edges.start}
          onClick={() => scroll(-1)}
        >
          <Icon name="back" width={18} height={18} />
        </Button>
        <ul ref={rail} className={styles.categories}>
          {categories.map(([label, icon, href]) => (
            <li key={href}>
              <a href={href}>
                <Icon name={icon} width={20} height={20} />
                {label}
              </a>
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          aria-label="Geser kategori ke kanan"
          disabled={edges.end}
          onClick={() => scroll(1)}
        >
          <Icon name="chevron" width={18} height={18} />
        </Button>
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
