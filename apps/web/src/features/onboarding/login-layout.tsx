import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Brand, Icon } from '@tka/ui';
import styles from './login-layout.module.css';

export function LoginLayout({
  children,
  audience = 'learner',
}: {
  children: ReactNode;
  audience?: 'learner' | 'admin';
}) {
  const admin = audience === 'admin';

  return (
    <div className={styles.screen}>
      <aside className={styles.brandPanel} aria-label="Tentang Numora">
        <div className={styles.brandHeader}>
          <Link href="/" className={styles.brandLink} aria-label="Kembali ke halaman utama NUMORA">
            <Brand />
          </Link>
          <div className={styles.panelBadge}>
            <span className={styles.badgeIcon} aria-hidden="true">
              {admin ? (
                <Icon name="lock" width={24} height={24} />
              ) : (
                <span className={styles.capIcon} />
              )}
            </span>
            <span className={styles.badgeCopy}>
              <strong>{admin ? 'Ruang Admin' : 'TKA Matematika'}</strong>
              <span>{admin ? 'Akses khusus pengelola' : 'SMP/MTs'}</span>
            </span>
          </div>
        </div>
        <div className={styles.brandContent}>
          <p className={styles.statement}>
            {admin ? 'Ruang kerja untuk tim Numora.' : 'Ruang belajar untuk Siswa dan Guru.'}
          </p>
          <p className={styles.brandDescription}>
            {admin
              ? 'Kelola materi belajar dan kegiatan sekolah sesuai aksesmu.'
              : 'Siswa berlatih dan melihat progres. Guru mengelola kelas dan memantau perkembangan.'}
          </p>
          <Image
            className={styles.illustration}
            src="/illustrations/landing/numora-hero-approved.png"
            alt=""
            width={420}
            height={420}
            sizes="(min-width: 960px) 420px, 0px"
            loading="eager"
          />
        </div>
      </aside>

      <main className={styles.formPanel}>
        <header className={styles.formHeader}>
          <Link
            href="/"
            className={styles.mobileBrand}
            aria-label="Kembali ke halaman utama NUMORA"
          >
            <Brand />
          </Link>
          <Link href="/" className={styles.backLink}>
            <Icon name="back" width={18} height={18} /> Kembali ke beranda
          </Link>
        </header>
        <div className={styles.formContent}>{children}</div>
        <p className={styles.footer}>Belajar matematika, satu langkah setiap hari.</p>
      </main>
    </div>
  );
}
