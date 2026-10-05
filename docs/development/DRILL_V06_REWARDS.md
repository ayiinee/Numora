# JOB-11 Drill / JOB-05 — kebijakan v0.6

**PRD RULE:** PRD v0.6 §8–10 menetapkan 10 soal, mastery 80%, satu paket per level untuk MVP, retry tanpa batas, kondisi skor/bintang dari attempt terbaru, serta unlock permanen. Bintang: 0 → 0; 10–50 → 1; 51–99 → 2; 100 → 3. XP dasar = benar / total × 100 (benar × 10 untuk 10 soal); bonus = max(0, (900 − durasi detik) / 900 × 50); total dibatasi 150. Formula berlaku juga pada attempt gagal; tidak ada tambahan syarat mastery untuk bonus.

**ENGINEERING DECISION — Aini, 5 Oktober 2026:** bulatkan XP akhir sekali ke integer terdekat; gunakan durasi timestamp PostgreSQL (termasuk pecahan detik). Pembahasan attempt baru tidak memiliki expiry. Konfirmasi setiap keluar sebelum submit menjelaskan jawaban terkonfirmasi dapat dilanjutkan dan timer tetap berjalan; perubahan belum tersimpan dapat hilang.

Kebijakan Drill versi 2 dipin secara terpisah dari versi scoring/konten paket pada saat start. Paket/kunci historis tidak diubah. `drillPolicyVersion: null` merupakan kebijakan legacy (rotasi paket saat start lama, bintang 0 null, pembahasan 90 hari, tanpa posting XP otomatis). Start baru memakai versi 2 dan boleh memakai ulang satu paket yang tersedia; resume tidak mengganti pin. Attempt lama, termasuk yang masih aktif, tidak diberi XP retroaktif atau dihitung ulang.

XP versi 2 disimpan atomik pada ledger existing bersama grading/progres/outbox, dengan provenance kebijakan dan rincian bonus/durasi. XP melekat pada akun; snapshot kelas hanya metadata historis, bukan pembatas kepemilikan XP. Leaderboard account-based/global tetap JOB-17. Keputusan Aini berikutnya menetapkan TryOut ×10; lihat [keputusan dan implementasi TryOut](TRYOUT_XP_V06.md). Pretest/PvP tidak diposting melalui jalur ini.

Hasil/history menampilkan reward tersimpan, bukan menghitung ulang berdasarkan kebijakan runtime. Legacy XP null diberi label hasil versi lama, tidak dianggap nol. Best score tetap monotonic; latestStars ditulis dari attempt terakhir, bukan bestStars. Riwayat level menggunakan filter `levelId` existing dan cache/cursor terpisah per filter.

Rollout: jalankan migrasi maju menggunakan role migrasi; runtime main memakai grant existing. Jangan menjalankan migrasi ke Cloud sebagai efek pengujian lokal. Konten resmi, review Curriculum, independent QA, dan trial Google tetap gate terpisah. Reconciliation hanya melaporkan inkonsistensi dan tidak menciptakan XP untuk attempt legacy.

## Klarifikasi PGK — 5 Oktober 2026

**ENGINEERING DECISION — Aini:** bobot produk PG=2, MCMA=3 dan Kategori=3 adalah final. Parsial diperhitungkan dalam scoring ketuntasan Drill; ambang tetap 80%. XP dasar memakai benar ekuivalen termasuk parsial ×10 untuk 10 soal, ditambah bonus kecepatan existing dan dibatasi 150. Bintang mengikuti rentang nilai akhir Drill, bukan XP atau kategori IRT. Bobot produk tidak mengubah kontribusi satu soal benar penuh menjadi 20/30 XP.

Keputusan pembulatan XP akhir Drill ke integer terdekat tetap tercatat terpisah dari pembulatan XP TryOut ke atas. Rubrik parsial MCMA/Kategori dan aturan presisi nilai akhir untuk pemetaan bintang masih perlu disahkan. Implementasi dan bukti PG sebelumnya tidak membuktikan jalur PGK selesai; perlu pin kebijakan baru bila perilaku grading/reward berubah, tanpa menghitung ulang hasil historis.

## Verifikasi engineering

Suite PostgreSQL menggunakan database lokal terisolasi; fixture baru menguji role LOGIN main non-owner, pin legacy yang tidak dapat diubah, concurrent start/submit, ledger immutable, rollback setelah posting XP dan sebelum completion outbox, retry satu paket, latestStars 0 tanpa relock, ownership dan retensi lama/baru. Unit policy menguji batas 900 detik, pembulatan sekali dan bonus attempt gagal. UI menguji clock browser meleset, reward tersimpan/0, history level, save failure dan konfirmasi keluar sebelum/selepas submit.

Gate: `pnpm lint`, `pnpm typecheck`, `pnpm contracts:validate`, `pnpm contracts:types:check`, `pnpm test:checks`, seluruh `pnpm test` dengan `TEST_DATABASE_URL`/`TEST_REDIS_URL` lokal tanpa skip, serta build. `node apps/api/scripts/reconcile-drill-rewards.mjs` memakai runtime `DATABASE_URL` dan hanya membaca; output berupa jumlah error tanpa PII, bukan backfill.

**Local engineering evidence — 5 October 2026:** database 24, UI 205, API 148, worker 15 dan orchestration 2 tes lulus tanpa skip (394 total); root script checks 68 lulus. Suite yang sempat gagal akibat PostgreSQL terinterupsi/Redis 6 dan mock ledger lama tidak dihitung sebagai PASS; API/worker dijalankan ulang lengkap memakai Redis 7 seperti CI. Lint, typecheck dan contract validation/freshness lulus; checker read-only melaporkan nol reward/progress error. Mesin dengan RAM terbatas menjalankan paket berat berurutan (`--concurrency=1`). Tidak ada migrasi atau perubahan credential Cloud pada verifikasi ini.

Connected acceptance memakai `pnpm test:release-chain` pada commit bersih dan satu SHA: browser → API → PostgreSQL → ledger → result/history/level dan monitoring Guru. Fixture Auth/konten/storage tetap **TEST ONLY**. Bukti ignored `.tmp/job06-evidence/connected.json` mencantumkan SHA dan daftar checks, termasuk `drill-v06-xp-ledger-replay-single-package-latest-stars-exit-confirmation-level-history`; hanya laporan lengkap PASS pada SHA tersebut dihitung sebagai acceptance engineering. CI/review, Curriculum, trial Google dan QA independen bukan digantikan fixture ini.
