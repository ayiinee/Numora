import Image from 'next/image';
import Link from 'next/link';
import { Brand, Icon, type IconName } from '@tka/ui';
import { ClosingScene } from './closing-scene';
import { ExplanationIllustration } from './explanation-illustration';
import { HeroIllustration } from './hero-illustration';
import { AccountDialog, CategoryRail, LandingHeader } from './landing-interactions';
import { PracticeIllustration } from './practice-illustration';
import { LevelsIllustration, ProgressIllustration } from './progress-level-illustrations';
import styles from './landing.module.css';

const illustrations = '/illustrations/student-home';
const benefits = [
  {
    id: 'cara-belajar',
    title: 'Latihan singkat dan bertahap',
    text: 'Kerjakan sepuluh soal per level. Kalau sudah menguasai level ini, kamu bisa lanjut ke tantangan berikutnya.',
    artwork: <PracticeIllustration />,
  },
  {
    id: 'pembahasan',
    title: 'Belajar dari pembahasan',
    text: 'Setelah latihan, lihat kembali jawabanmu dan pelajari langkah penyelesaiannya. Pakai pembahasan untuk memahami soal sebelum mencoba lagi.',
    artwork: <ExplanationIllustration />,
  },
  {
    id: 'progres',
    title: 'Pantau progres dan bintang',
    text: 'Lihat level yang sudah terbuka, bintang yang kamu raih, dan riwayat latihanmu. Pilih materi yang perlu kamu ulang dari hasil itu.',
    artwork: <ProgressIllustration />,
  },
  {
    id: 'materi',
    title: 'Pilih materi dan level',
    text: 'Jelajahi bab dan subbab matematika, lalu lanjutkan dari level yang tersedia. Kamu bisa belajar mandiri atau bergabung dengan kelas dari guru.',
    artwork: <LevelsIllustration />,
  },
] as const;

const footerGroups = [
  ['Tentang Numora', ['Beranda', '#beranda'], ['Persiapan TKA', '#persiapan-tka']],
  [
    'Belajar',
    ['Cara belajar', '#cara-belajar'],
    ['Pembahasan', '#pembahasan'],
    ['Materi dan level', '#materi'],
  ],
  ['Sekolah', ['Untuk sekolah', '#untuk-sekolah'], ['Masuk sebagai guru', '/']],
  ['Akun', ['Mulai belajar', '/'], ['Belajar lewat browser', '#akses-web']],
  ['Admin', ['Masuk Admin', '/admin/login']],
] as const;

function LearningArt({
  icon,
  decoration,
  tone,
}: {
  icon: IconName;
  decoration: IconName;
  tone: string;
}) {
  return (
    <div className={styles.learningArt} data-tone={tone} aria-hidden="true">
      <div className={styles.artOrbit} />
      <div className={styles.artPaper}>
        <Icon name={icon} />
        <span />
        <span />
      </div>
      <div className={styles.artTile}>
        <Icon name={decoration} />
      </div>
      <Icon name="spark" className={styles.artSpark} />
    </div>
  );
}

export function LandingPage() {
  return (
    <div className={styles.page} id="beranda">
      <a className="skip-link" href="#konten-utama">
        Lewati ke konten
      </a>
      <LandingHeader />

      <main id="konten-utama" tabIndex={-1}>
        <div className={styles.firstFold}>
          <section className={styles.hero} aria-labelledby="landing-title">
            <HeroIllustration />
            <div className={styles.heroCopy}>
              <h1 id="landing-title">Latihan TKA Matematika untuk siswa SMP/MTs</h1>
              <div id="aksi-hero" className={styles.heroActions}>
                <Link className={styles.primary} href="/">
                  Mulai belajar
                </Link>
                <AccountDialog />
              </div>
            </div>
          </section>
          <CategoryRail />
        </div>

        <div className={styles.benefits}>
          {benefits.map(({ id, title, text, artwork }) => (
            <section key={id} id={id} className={styles.benefit} aria-labelledby={`${id}-title`}>
              <div className={styles.sectionCopy}>
                <h2 id={`${id}-title`}>{title}</h2>
                <p>{text}</p>
              </div>
              {artwork}
            </section>
          ))}
        </div>

        <section className={styles.browserBand} id="akses-web" aria-labelledby="browser-title">
          <h2 id="browser-title">Belajar lewat browser</h2>
          <p>Buka Numora di ponsel atau laptop dan lanjutkan latihan dari akunmu.</p>
          <div className={styles.browserActions}>
            <Link className={styles.primary} href="/">
              Mulai belajar
            </Link>
            <a className={styles.secondary} href="#cara-belajar">
              Lihat cara belajar
            </a>
          </div>
          <div className={styles.browserArt} aria-hidden="true">
            <div className={styles.deviceBar}>
              <span />
              <span />
              <span />
            </div>
            <div className={styles.deviceContent}>
              <Image
                src={`${illustrations}/drill-owl.svg`}
                alt=""
                width={420}
                height={320}
                unoptimized
                loading="lazy"
              />
              <div className={styles.deviceSheet}>
                <Icon name="calculator" />
                <span>3x + 6 = 18</span>
                <span>Berapa nilai x?</span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.schoolBand} id="untuk-sekolah" aria-labelledby="school-title">
          <LearningArt icon="school" decoration="users" tone="school" />
          <h2 id="school-title">Belajar bersama sekolah</h2>
          <p>
            Siswa bisa bergabung dengan kelas lewat undangan. Guru terverifikasi dapat membuat kelas
            dan memantau perkembangan siswanya.
          </p>
          <Link className={styles.primary} href="/">
            Masuk sebagai guru
          </Link>
        </section>

        <section
          className={`${styles.benefit} ${styles.assessment}`}
          id="persiapan-tka"
          aria-labelledby="assessment-title"
        >
          <div className={styles.sectionCopy}>
            <h2 id="assessment-title">Persiapan TKA Matematika</h2>
            <p>
              Biasakan diri mengerjakan soal matematika SMP/MTs, pahami pembahasannya, dan ulangi
              materi yang masih terasa sulit.
            </p>
            <a className={styles.textLink} href="#cara-belajar">
              Lihat latihan <Icon name="arrow" width={18} height={18} />
            </a>
          </div>
          <LearningArt icon="target" decoration="graduation" tone="peach" />
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <h2 id="closing-title">Siap latihan bersama Numora?</h2>
          <Link className={styles.primary} id="aksi-penutup" href="/">
            Mulai belajar
          </Link>
          <ClosingScene />
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <nav className={styles.footerGroups} aria-label="Navigasi footer">
            {footerGroups.map(([name, ...links]) => (
              <div key={name}>
                <h2>{name}</h2>
                <ul>
                  {links.map(([label, href]) => (
                    <li key={href}>
                      <Link href={href}>{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className={styles.footerBottom}>
            <Brand compact />
            <a href="#beranda">Kembali ke atas</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
