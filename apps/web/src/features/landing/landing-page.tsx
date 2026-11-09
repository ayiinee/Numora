import Image from 'next/image';
import Link from 'next/link';
import { Brand, Icon } from '@tka/ui';
import styles from './landing.module.css';

export function LandingPage() {
  return (
    <div className={styles.page}>
      <a className="skip-link" href="#konten-utama">
        Lewati ke konten
      </a>
      <header className={`${styles.container} ${styles.header}`}>
        <Brand />
        <nav aria-label="Navigasi landing page">
          <a href="#cara-belajar">Cara belajar</a>
          <a href="#untuk-sekolah">Untuk sekolah</a>
          <Link className={styles.headerLogin} href="/">
            Masuk
          </Link>
        </nav>
      </header>

      <main id="konten-utama" className={styles.container} tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.intro}>
            <p className={styles.kicker}>Persiapan TKA Matematika SMP/MTs</p>
            <h1 id="landing-title">
              Siap hadapi TKA, <span>satu soal demi satu.</span>
            </h1>
            <p className={styles.summary}>
              Latih matematika sesuai topik dan levelmu. Pelajari pembahasannya, lalu lihat
              perkembanganmu dari waktu ke waktu.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/">
                Mulai belajar <Icon name="arrow" width={18} height={18} />
              </Link>
              <a className={styles.secondary} href="#cara-belajar">
                Lihat cara belajar
              </a>
            </div>
            <p className={styles.note}>Belajar mandiri atau bergabung dengan kelas dari gurumu.</p>
          </div>

          <figure className={styles.board}>
            <div className={styles.boardHeader}>
              <span>Papan belajar</span>
              <span>01 / Aljabar</span>
            </div>
            <Image
              className={styles.owl}
              src="/illustrations/student-home/drill-owl.svg"
              alt=""
              width={420}
              height={320}
              unoptimized
              preload
            />
            <div className={styles.example}>
              <span>Contoh latihan</span>
              <strong>3x + 6 = 18</strong>
              <p>Berapa nilai x?</p>
            </div>
            <figcaption>Mulai dengan satu soal.</figcaption>
          </figure>
        </section>

        <section id="cara-belajar" className={styles.guide} aria-labelledby="guide-title">
          <p className={styles.kicker}>Cara belajar</p>
          <h2 id="guide-title">Pilih materi. Latihan. Tinjau hasil.</h2>
          <ol className={styles.steps}>
            <li>
              <Icon name="book" width={22} height={22} />
              <h3>Pilih topik</h3>
              <p>Mulai dari materi yang ingin kamu kuasai.</p>
            </li>
            <li>
              <Icon name="target" width={22} height={22} />
              <h3>Latihan bertahap</h3>
              <p>Kerjakan soal pada levelmu dan pelajari pembahasannya.</p>
            </li>
            <li>
              <Icon name="chart" width={22} height={22} />
              <h3>Lihat perkembangan</h3>
              <p>Gunakan hasil latihan untuk menentukan materi yang perlu diulang.</p>
            </li>
          </ol>
        </section>

        <section id="untuk-sekolah" className={styles.school} aria-labelledby="school-title">
          <div>
            <p className={styles.kicker}>Untuk sekolah</p>
            <h2 id="school-title">Dampingi siswa di kelas.</h2>
            <p>Guru terverifikasi dapat membuat kelas dan memantau perkembangan siswanya.</p>
          </div>
          <Link className={styles.primary} href="/">
            Masuk sebagai guru <Icon name="arrow" width={18} height={18} />
          </Link>
        </section>
      </main>

      <footer className={`${styles.container} ${styles.footer}`}>
        <Brand compact />
        <Link href="/admin/login">Masuk Admin</Link>
      </footer>
    </div>
  );
}
