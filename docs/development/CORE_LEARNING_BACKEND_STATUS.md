# Status backend Core Learning

Catatan baseline 1 Oktober 2026 dengan pembaruan integrasi 3 Oktober 2026. Setiap bagian mempertahankan scope dan tanggal buktinya; bukti lokal/CI belum merupakan bukti kesiapan staging. Sumber aturan produk: [Product Context](../product/PRODUCT_CONTEXT.md), [Open Decisions](../product/OPEN_DECISIONS.md), dan [PRD Mapping](../product/PRD_MAPPING.md).

**PROPOSED — integrasi 2 Oktober 2026:** PR #25/#22/#23/#24 digabung pada branch integrasi untuk satu PR menuju main. Paket Admin, laporan Student dan snapshot IRT memakai engine canonical yang sama; jurnal gabungan menambahkan 0009 untuk metadata IRT. Review, bukti pengujian dan jalur upgrade ada pada [laporan integrasi](CORE_CONTENT_IRT_INTEGRATION_2026-10-02.md). Status merge aktual tetap mengikuti GitHub.

**ENGINEERING DECISION — perluasan integrasi 2 Oktober 2026:** atas instruksi pemilik, #26/#27/#28 ditambahkan ke PR #29. Token guru baru delapan karakter memakai HMAC berversi dengan pepper server; token lama tetap berlaku sampai kedaluwarsa. Kode kelas baru enam karakter tetap dapat dipakai beberapa siswa; hanya token guru yang single-use. UI responsif mempertahankan engine canonical, isolasi cache per identitas, histori/IRT, laporan/video, dan akses PvP/peringkat sesuai availability API. Detail dan gate validasi ada pada [rekonsiliasi onboarding dan UI](ONBOARDING_UI_INTEGRATION_2026-10-02.md). Ini belum menyatakan merge ke main atau kesiapan staging.

## Integrasi tim - 3 Oktober 2026

**ENGINEERING DECISION - permintaan Aini:** integrasi melalui [#34](https://github.com/ayiinee/Numora/pull/34), [#35](https://github.com/ayiinee/Numora/pull/35), [#36](https://github.com/ayiinee/Numora/pull/36), lalu [#42](https://github.com/ayiinee/Numora/pull/42) → [#43](https://github.com/ayiinee/Numora/pull/43) → [#44](https://github.com/ayiinee/Numora/pull/44). Cakupan: profil/logout Teacher, session/route/join regression; kandidat konten DEMO/DRAFT; feedback/Admin read/support/IRT opt-in; recovery/retry/countdown consumer Student. Base PR bertumpuk diselaraskan ke main. Konflik import tes UI mempertahankan tes profil Teacher dan feedback/leaderboard Student.

**Bukti gabungan lokal:** 59 tes web dan 27 Chromium E2E fixture lulus; workspace typecheck/build dan generated-type checks lulus. Validator meluluskan 40 soal kandidat, tanpa menyatakan approval Curriculum. CI PostgreSQL/Redis, migration/upgrade rehearsal, browser, build dan freshness wajib hijau pada head terbaru sebelum tiap merge; bukti run dicatat pada PR terkait. Migrasi 0010/0011 menambah kolom nullable `irt_batches.output_snapshot` dan `video_reports.attempt_context`; tidak mengubah skor historis atau otomatis merilis hasil.

**Batas integrasi:** JOB-07 akses Student [#41](https://github.com/ayiinee/Numora/pull/41) dan JOB-12 history [#45](https://github.com/ayiinee/Numora/pull/45) tetap PR terpisah. Rekonsiliasi 3 Oktober mempertahankan filter snapshot kelas history Guru dari #43 serta level/presisi cursor #45; #45 telah diubah base ke main sesudah merge #41. Konten belum dipublikasikan, analytics PROPOSED tetap default off, dan keputusan Curriculum/Data/PO tetap OPEN. JOB-06 masih memerlukan satu release SHA, login Google nyata, bukti lintas peran dan persistence di environment trial yang disetujui; fixture CI tidak menggantikannya.

## JOB-06 — bukti connected release chain, 3 Oktober 2026

**ENGINEERING DECISION — instruksi Aini:** pengujian browser terhubung dan defect save offline dikerjakan pada PR baru, setelah #34–36/#42–44 terverifikasi sudah `MERGED` dan otomatis tertutup. Ownership Farel/Salim tidak diganti.

**Engineering PASS:** tiga kasus tanpa skip pada production-build SHA `af850c47e091d33783dd75de4658bc7d24d2af3e`, memakai Next → API Nest → PostgreSQL/Redis terisolasi → Teacher monitoring. Save/resume/re-auth, submit ganda/outbox, skor 80 → retry 70 dengan best 80, Level 2 skor 0, token/join race dan role/ownership denial teruji bersama. Defect offline save yang tertahan `Menyimpan…` diperbaiki menjadi kegagalan terlihat/explicit retry.

**Batas acceptance:** identitas email fixture, paket L2 TEST ONLY DEMO dan layanan lokal bukan Google/staging atau approval Curriculum. Environment/akun Google trial, konten reviewed, scope trial dan acceptance independen Salim masih diperlukan; JOB-06 belum DONE. Bukti, cara rerun pada satu SHA dan gate tersisa: [JOB06 release chain](../testing/JOB06_RELEASE_CHAIN.md). CI baru menjalankan chain lengkap sendiri; CI masing-masing PR lama tidak menjadi acceptance gabungan.

## Fondasi dan Drill

- [x] Runtime Drill memakai `assessment_packages`, `assessment_attempts`, `attempt_items`, dan `attempt_answers`. Service katalog, Drill, riwayat, dan Tryout dipisahkan.
- [x] Migrasi 0004 mempertahankan UUID, versi soal/kebijakan, jawaban, hasil, dan referensi progres legacy. Preflight menolak snapshot yang berbeda; rekonsiliasi menghitung baris legacy dan hasil salinan. Tabel legacy dipertahankan untuk audit migrasi.
- [x] Migrasi 0005 menyimpan `unlockedLevelId` historis pada attempt. Constraint melindungi satu Drill aktif per siswa/level dan kesesuaian package/level.
- [x] Sepuluh soal, start berulang, simpan/ubah/kosongkan jawaban, resume, retry paket berbeda, submit serentak, 80% mastery, bintang, kepemilikan attempt, dan progres Guru memiliki tes PostgreSQL.
- [x] Hasil memakai nilai yang tersimpan; versi soal tetap dipin. Kunci/pembahasan tersembunyi sebelum submit dan akses pembahasan Drill berakhir setelah 90 hari.
- [x] Riwayat siswa memakai cursor dan memisahkan hasil siap dari Tryout yang menunggu IRT. Maksimal tiga video READY direkomendasikan untuk hasil Drill di bawah 80%; daftar kosong tetap valid.
- [x] OpenAPI dan tipe frontend dihasilkan dari DTO backend.
- [ ] E2E browser di staging untuk Admin → Guru → Siswa → Drill → progres Guru, review kode, dan persetujuan Curriculum atas soal demo.

**PRD RULE — Drill v1.2:** count-up tanpa pause/deadline, ambang mastery 80, retry level gagal/completed, dan best score/history terpisah. **Gap:** akses 90 hari adalah perilaku implementasi lama; retensi sekarang DRL-OPEN-07. Struktur konten final tetap bergantung pada **OPEN-01/OPEN-10**.

## Job pendukung dan leaderboard

- [x] Worker memproses analytics outbox dari PostgreSQL dengan row lock, retry setelah kegagalan, dan insert idempotent berdasarkan `eventId`. Redis tidak menyimpan satu-satunya salinan event.
- [x] Proyeksi leaderboard kelas mengambil XP DRILL/TRYOUT dari ledger, diperbarui saat boot dan tiap jam, dan mempertahankan arsip periode. Periode mencakup Kamis 00:00 WIB hingga akhir Rabu; batas berikutnya Kamis 00:00 WIB. PvP memiliki tabel/jalur terpisah.
- [x] Tes worker meliputi pengiriman ulang event, peringkat seri, proyeksi berulang, batas WIB, dan arsip periode.
- [ ] Penulisan XP saat finalisasi, versi kebijakan XP, rekonsiliasi hasil/progres/XP, serta alert job gagal.

**OPEN-11:** formula XP final belum disetujui. Tidak ada XP otomatis yang diterbitkan oleh alur asesmen ini; proyeksi leaderboard baru fondasi dari ledger yang sudah tersedia. Penentuan peringkat seri pada proyeksi adalah **PROPOSED** untuk review produk sebelum rilis leaderboard.

## Tryout dan IRT

- [x] Infrastruktur PG untuk paket terbit: akses seluruh Student aktif, rilis Senin 00:00 WIB, satu attempt/paket, resume, save/clear, deadline dari paket, submit idempotent, dan outbox. Migrasi 0006 mencegah dua paket TRYOUT berstatus PUBLISHED pada waktu rilis yang sama.
- [x] Result dan riwayat menyembunyikan skor/kunci hingga batch SUCCEEDED yang dirilis mencakup seluruh versi soal dengan minimal 30 respons dan status SUFFICIENT.
- [x] Tes PostgreSQL memakai paket dan model berlabel fixture; tes batas waktu rilis memakai `Asia/Jakarta`.
- [ ] Publikasi paket resmi, finalisasi otomatis saat deadline, batch IRT harian, skor/model final, pesan data belum cukup, dan kebijakan keterlambatan/kegagalan batch.

**OPEN-05/OPEN-12/OPEN-18:** konfigurasi paket resmi, model statistik, dan perilaku rilis final menunggu keputusan pemilik produk/Data. Admin tetap menolak publikasi Tryout dengan `TRYOUT_POLICY_OPEN`. Penskoran MCMA/Category belum diaktifkan; rubrik **OPEN-04** perlu dikunci, tetapi kedua format sudah wajib MVP TryOut v1.1. PG-only merupakan gap implementasi, bukan scope final.

**ENGINEERING DECISION — JOB-07 tahap pertama, permintaan Aini 2 Oktober 2026:** Mandiri dan Sekolah mendapat akses TryOut yang sama. Start merekam kelas aktif atau `null`; repeated/concurrent start mengembalikan attempt yang sama tanpa mengubah snapshot setelah siswa bergabung kelas. Dashboard `features.tryout` menyatakan akses fitur dan selalu true untuk Student aktif; current-package `eligible` hanya menyatakan boleh start attempt baru. Paket kosong mengembalikan `{ state: 'unavailable' }`. UI TryOut dan ringkasan dashboard menghapus syarat kelas, menampilkan latihan saat paket kosong dan aksi sesuai state attempt. Schema/constraint existing cukup, tanpa migrasi baru. Kontrak: [Core Learning](../api/CORE_LEARNING_FRONTEND_CONTRACT.md) dan [Student Area](../api/STUDENT_AREA_CONTRACT.md).

Tahap ini belum menyelesaikan JOB-07 penuh: 35 soal/PGK, listing/detail/Past dan eligibility Past masih tersisa. Auto-finalization (JOB-09), pipeline/skala/release IRT (JOB-10/11), serta publikasi resmi tetap mengikuti gate/keputusan owner; Redis worker tidak diperlukan untuk akses ini.

**PROPOSED - knowledge 2 Oktober 2026:** [rancangan varian soal dan IRT](../data/QUESTION_VARIANT_IRT_KNOWLEDGE_2026-10-02.md) merangkum PDF 25 halaman dari pengguna. Sumber memberi arah partial credit/GPCM, snapshot jawaban, quality gate dan fallback batch; membantu fondasi tiga format JOB-07 serta terutama JOB-10. Rubrik numerik, durasi/komposisi/skala, Past eligibility, batch end/cutoff dan approval policy tetap terbuka. Knowledge ini tidak mengubah runtime, kontrak, atau status acceptance; rujukan lama 90 hari dan placement Pretest dibedakan dari latest PRD.

**Bukti lokal JOB-07 tahap pertama:** migrasi existing diterapkan ke cluster PostgreSQL baru di localhost port 55437/database `numora_test_job07`, lalu fixture learning berlabel demo dimuat. `NODE_ENV=test TEST_DATABASE_URL=<database lokal> pnpm --filter @tka/api test src/modules/learning --no-file-parallelism --maxWorkers=1` lulus 12 tes dalam enam file, tanpa skipped, termasuk flow TryOut dan dashboard. Tes membuktikan snapshot Mandiri/Sekolah, concurrent/repeated start dan satu outbox start, snapshot setelah join, paket kosong/future/expired, HTTP 401/403/foreign 404 serta privacy hasil sampai release. Boundary identitas memakai fixture; ini bukan bukti Google OAuth nyata. `pnpm --filter @tka/web test src/features/core-learning/redesign.test.tsx --pool=threads --maxWorkers=1 --testTimeout=15000` lulus 14 tes, termasuk empty/start Mandiri/resume/waiting/result-ready/network retry. `pnpm lint`, `pnpm typecheck`, `pnpm build -- --concurrency=2`, contract validation/types check serta regenerasi ulang OpenAPI dengan hash identik lulus. Review tim dan QA staging masih diperlukan; perubahan Redis sebelumnya dipertahankan sebagai pekerjaan terpisah.

**Browser JOB-07:** satu skenario Chromium `Mandiri Tryout starts and resumes without a class, then waits for released results` lulus (start/resume/waiting/result-ready). Auth/API browser memakai fixture; backend riil dibuktikan terpisah lewat PostgreSQL/HTTP di atas. Verifikasi Windows memakai konfigurasi lokal sementara dengan startup 360 detik, per-test 180 detik dan assertion 60 detik, kemudian dihapus; konfigurasi pengujian tim tetap utuh. Percobaan regresi browser lintas fitur belum lulus karena timeout saat loading/kompilasi TryOut/PvP dan batas global suite; hasil tersebut tidak dihitung lulus dan perlu diulang di CI/staging. Cluster PostgreSQL uji dihentikan setelah verifikasi; worker/Redis cloud tidak dijalankan untuk fase ini.

## Penilaian dan history - JOB-12

**ENGINEERING DECISION - permintaan Aini, 2 Oktober 2026:** implementasi history dikerjakan pada branch `feat/job-12-assessment-history` dari baseline `origin/main` SHA `33410fb`, terpisah dari PR JOB-07 dan commit worker/Redis lokal. Endpoint history existing ditambah filter UUID `levelId` opsional; cursor harus berasal dari pengguna dan result set/filter yang sama. Boundary timestamp memakai presisi PostgreSQL, sehingga selesai pada waktu sama maupun selisih mikrodetik tidak terlewat. Tidak ada endpoint atau migrasi baru.

Record menampilkan ID bab/level snapshot serta label taxonomy saat ini, subbab/level dan status `xpState`/`starsState` pending/notApplicable. Label taxonomy bukan snapshot nama historis. Skor tersimpan tidak dihitung ulang; completed history tetap terbaca setelah archive. UI minimum menggunakan generated types, mempertahankan score 0, konteks level dan pesan reward belum tersedia. Waiting TryOut tidak mendapat link hasil; Pretest tidak mendapat link ke route yang belum ada. Existing level/progress tetap menjadi sumber latest/best; retry lebih rendah tidak mengganti best atau menghapus history.

**Bukti lokal - 2 Oktober 2026:** suite learning berjalan pada PostgreSQL terisolasi localhost dengan fixture DEMO/TEST: 7 file, 17 tes lulus tanpa skipped. Tes UI/API: 19 lulus; Chromium E2E history mobile 390 px: 1 lulus, mencakup score 0, waiting tanpa link, pagination error/retry dan tanpa overflow. Lint, typecheck, build, repository checks, validasi kontrak dan generated-type freshness lulus. Bukti ini tidak menggantikan review atau acceptance login Google nyata.

**Batas:** review/QA staging masih diperlukan. Rumus reward/threshold bintang/retensi, Pretest lifecycle, dan final model/release TryOut tetap OPEN; gate IRT existing tidak diganti. Kontrak dan query semantics: [Core Learning Frontend Contract](../api/CORE_LEARNING_FRONTEND_CONTRACT.md#job-12-history-additions---2-october-2026).

## Pretest

- [x] Schema asesmen umum mendukung PRETEST, pin versi soal/kebijakan, dan constraint maksimal satu attempt SUBMITTED/GRADED per siswa/bab. Riwayat mendukung record Pretest.
- [ ] Endpoint start/lewati/resume/submit, rekonsiliasi eligibility afiliasi/Skip, paket 20 soal tanpa XP, placement DRL-OPEN-04, dan pembaruan unlock yang mempertahankan progres lama.

**OPEN-01–03:** struktur final, distribusi soal, dan placement belum disetujui. Endpoint final tidak dibuat dengan aturan placement yang diasumsikan.

## Bukti dan gerbang rilis

**ENGINEERING UPDATE — permintaan Aini, 2 Oktober 2026:** default `pnpm dev` menjalankan web/API tanpa worker. `pnpm dev:worker` atau `pnpm dev:full` mengaktifkan background processing secara eksplisit. Worker melakukan preflight Redis sebelum consumer BullMQ, berhenti pada quota exhaustion, dan membatasi log gangguan runtime. `.env.test.example`/guard `test:local` memisahkan target pengujian localhost dari development cloud. Rate limiter verifikasi/join tetap membutuhkan Redis sehat; tanpa worker, outbox/proyeksi belum diproses. Provision instance Development terpisah serta bukti Redis cloud/staging tetap dependency operator. Perubahan ini tidak mengaktifkan TryOut/IRT/PvP atau menutup keputusan OPEN. Lihat [panduan setup](GETTING_STARTED.md#development-process-modes--2-october-2026).

Bukti lokal perubahan mode/worker: lint repository serta typecheck/build worker lulus; enam tes worker dan lima root checks lulus. Tiga tes integrasi PostgreSQL dilewati karena `TEST_DATABASE_URL` tidak disediakan. Tes quota/startup/shutdown memakai fixture Redis tanpa request cloud; ini bukan bukti provisioning instance atau konektivitas Redis nyata.

Pengujian dijalankan pada PostgreSQL lokal terisolasi, bukan Supabase shared development/staging. Gunakan `NODE_ENV=test` dan `TEST_DATABASE_URL` untuk mengaktifkan integration suite. Migrasi diterapkan melalui CLI, bukan dashboard.

Perintah verifikasi utama:

```text
pnpm --filter @tka/database db:migrate
pnpm --filter @tka/database db:upgrade-check
pnpm --filter @tka/api test -- --no-file-parallelism --maxWorkers=1
pnpm --filter @tka/database test -- --no-file-parallelism --maxWorkers=1
pnpm --filter @tka/worker test -- --no-file-parallelism --maxWorkers=1
pnpm openapi:generate
pnpm contracts:types
```

QA staging, rollback aplikasi, observability/alert, dan penutupan keputusan OPEN belum selesai. Jangan menandai keseluruhan Core Learning sebagai siap rilis hanya dari tes lokal.

## Integrasi area siswa (1 Oktober 2026)

- [x] Dashboard berbasis API, layout desain prototipe pada seluruh area siswa, gate Student/QueryProvider bersama dan isolasi cache identitas.
- [x] UI PvP dan peringkat terhubung NestJS; route pratinjau dan simulator frontend dihapus, URL lama 404.
- [x] Engine PvP/gateway, pin versi, transaksi/outbox, timer/reconnect, undangan sekelas, Redis job/cache dan recovery cancellation. Akun nyata masih diblokir **OPEN-07**.
- [x] Endpoint leaderboard PvP top20/posisi sendiri dan kelas, best record/proyeksi per kesulitan, rekonsiliasi periode sebelum archive. Kelas masih policyPending **OPEN-11**, tanpa XP formula asumsi.
- [x] Migrasi 0007/0008 dan rehearsal backfill data PvP historis di database uji.

Bukti pengujian dan instruksi menjalankan migrasi: [Student Area Implementation](STUDENT_AREA_IMPLEMENTATION.md). Kontrak: [Student Area Contract](../api/STUDENT_AREA_CONTRACT.md). Status lokal ini belum menyatakan kesiapan staging/produksi.

## Gap terhadap PRD fitur terbaru — 2 Oktober 2026

Sumber: [rekonsiliasi Drill v1.2 / TryOut v1.1](../product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md). Rekonsiliasi konteks awal tidak mengubah kode/migrasi/kontrak. Pembaruan JOB-07 tahap pertama di atas kemudian menutup gap akses; checklist lain tetap mencatat bukti implementasi sebelumnya, bukan acceptance MVP penuh.

- [x] Hapus class-required sebagai policy MVP TryOut; gratis Mandiri dan Sekolah tanpa checkout (JOB-07 tahap pertama; review/QA staging masih diperlukan).
- [ ] Paket 35 soal; PG/PGK MCMA/Category beserta kontrak jawaban dan rubrik terverifikasi.
- [ ] Listing Ongoing/Past, detail/tutorial/rules dan eligibility paket lampau sesuai keputusan Product.
- [ ] Auto-finalization saat countdown 0 tanpa request browser dan race manual/auto-submit idempotent.
- [ ] Pipeline initial IRT-weighted score pada skala TKA yang disetujui, tanpa skor parsial; release ≤3×24 jam setelah akhir batch; skor immutable setelah release.
- [ ] Rekonsiliasi gate ≥30 implementasi dengan policy insufficient response TryOut dan baseline detail soal Admin; tidak diasumsikan universal.
- [ ] XP Drill base/gagal/speed formula, star thresholds, retensi dan session/exit policy ditetapkan sebelum final acceptance; jangan memakai formula/rentang/90 hari lama sebagai PRD terbaru.
- [ ] Drill <15min eligibility, warning refresh/exit, Save failed tidak Saved, YouTube/report contexts, retry fallback, best score monotonic/history seluruh attempt diverifikasi terhadap DRL-AC.
- [ ] Seluruh 49 AC ditinjau FE/BE/Data/Curriculum/QA; keputusan OPEN ditutup oleh owner terkait, bukan otomatis oleh docs.

## Rekonsiliasi JOB-07 akses - 3 Oktober 2026

**ENGINEERING DECISION - instruksi Aini:** PR #41 tetap terpisah dari JOB-12 dan perubahan worker/Redis lokal. Rekonsiliasi terhadap main mempertahankan akses TryOut gratis Mandiri/Sekolah, snapshot kelas historis nullable, serverTime/deadline, detail/konfirmasi aturan dan recovery terbaru. Tes UI/E2E mengikuti acknowledgement aturan sebelum start; existing attempt tidak disalahartikan sebagai penolakan akses karena eligible=false.

PR #46 menyediakan connected chain/perbaikan offline. **ENGINEERING DECISION - instruksi Aini, 3 Oktober 2026:** pemilik mengizinkan admin bypass untuk merge rangkaian ini setelah CI head terbaru lulus. Bypass tidak dihitung sebagai approval reviewer atau QA independen. Bukti gabungan harus diulang pada satu SHA yang memuat #46/#41/#45; bukti JOB-06 sebelumnya tidak diganti. Ini bukan acceptance Google/trial atau penyelesaian seluruh JOB-07.

**Bukti rekonsiliasi lokal:** 12 tes Learning PostgreSQL tanpa skip dan 64 tes web lulus; lint, workspace typecheck dan generated-type freshness lulus. CI terbaru melengkapi build/migration/browser gates sebelum merge.

## Rekonsiliasi JOB-12 history - 3 Oktober 2026

**ENGINEERING DECISION - instruksi Aini:** PR #45 mempertahankan snapshot kelas history Guru dari #43 serta filter level, presisi mikrodetik cursor dan konteks/pending reward JOB-12. Service internal memakai objek `{ cursor?, classId?, levelId? }`; filter class/level berlaku bersama pada baris dan cursor, sehingga argumen class Guru tidak tertukar sebagai level. Endpoint Student tidak membuka query classId; kepemilikan kelas tetap diperiksa service Guru.

Tes PostgreSQL menambahkan pagination dan penolakan cursor beda kelas/level, Mandiri dan record non-visible. OpenAPI/shared types digenerasikan dari DTO akhir; tidak ada endpoint/migrasi baru. CI head terbaru dan satu SHA connected gabungan #46/#41/#45 tetap wajib; admin bypass diizinkan Aini, tanpa mengklaim approval reviewer; Google/trial, konten reviewed, XP/star/IRT/retention final tetap belum acceptance.

**Bukti rekonsiliasi lokal:** 23 tes Learning/Feedback PostgreSQL tanpa skip dan 65 tes web lulus; lint, workspace typecheck dan generated-type freshness lulus. CI terbaru melengkapi build/migration/browser gates sebelum merge.

## Kandidat rekonsiliasi gabungan - 3 Oktober 2026

**ENGINEERING DECISION - instruksi Aini:** #41/#45 direkonsiliasi dan dipush terpisah. Aini mengizinkan admin bypass untuk rangkaian #46 -> #41 -> #45 -> #47, dengan CI terbaru wajib hijau sebelum setiap merge. #46, #41 dan #45 sudah masuk main setelah CI head masing-masing lulus; #47 telah retarget main dan disinkronkan dengan ketiga hasil merge. Kandidat menggabungkan ketiga head untuk empat kasus connected pada satu SHA; workflow push main akan menguji ulang SHA merge final. Rincian, fixture release sintetis dan batas acceptance ada pada [reconciliation release chain](../testing/RECONCILIATION_RELEASE_CHAIN_2026-10-03.md). Bukti/acceptance JOB-06 sebelumnya tetap berlaku sesuai SHA dan batasnya.

**Engineering PASS kandidat gabungan:** empat kasus connected production-build pada SHA `bd3fb4c7ad806612d0cdf0eff52c6aaac511c1b0` lulus tanpa skip: rantai JOB-06 existing ditambah TryOut Mandiri/Sekolah, snapshot kelas immutable setelah join, repeated/concurrent start/submit dan satu event, save/resume, waiting/release gate, Student level history dan Teacher class privacy. [Bukti lokal yang disanitasi](../testing/evidence/RECONCILIATION_LOCAL_2026-10-03.json) memakai PostgreSQL 16/Redis 6 lokal, email fixture dan synthetic release; CI #47 memakai Redis 7 dan mencatat checkout SHA sendiri. Bukti kandidat dipertahankan sesuai SHA-nya. Admin bypass bukan approval reviewer. Hasil push CI main pada SHA merge final akan dicatat di PR #47 beserta artifact; Google/trial, konten reviewed dan QA independen tetap belum selesai.

**Merge evidence - 3 Oktober 2026:** #46 `433008c`, #41 `db47aa7` dan #45 `c9987fc` merged ke main. CI pre-merge #41 [37094368305](https://github.com/ayiinee/Numora/actions/runs/37094368305) dan #45 [37094679920](https://github.com/ayiinee/Numora/actions/runs/37094679920) lulus termasuk PostgreSQL tanpa skip, migration, browser, connected chain, build dan contract freshness. #47 hanya enam file harness/tests/evidence/docs; hasil push main final beserta SHA/artifact dicatat pada [PR #47](https://github.com/ayiinee/Numora/pull/47).

## JOB-09 engineering implementation - 3 October 2026

**ENGINEERING DECISION:** API manual submit and worker recovery share `@tka/assessment-engine`. Expired resume/current recovers lazily; worker/standalone PostgreSQL-only runner recovers without browser or Redis state. Row locking and durable status guard finalization/outbox replay. Saves recheck PostgreSQL wall time after lock acquisition; finalization preserves raw answers/save times, content/scoring pins, class and original timer snapshots. A partial-index migration accelerates overdue scans, with bounded pagination past invalid attempts.

**Verification:** real PostgreSQL 16 localhost: worker recovery/runtime 8 tests and learning modules 18 tests passed without skip. They cover manual/auto races, recovery on a later cycle, invalid attempt isolation, outbox-trigger rollback/retry, Drill exclusion, Mandiri/Sekolah snapshots, authorization and unreleased privacy. Further clean-SHA CI gates are recorded on the feature PR. These results do not replace independent QA or the school Google trial.

**OPEN:** official duration and package close vs deadline (TBC-06), PGK/35-item delivery and final IRT/batch/release policy remain unresolved. JOB-09 mechanics consume persisted deadlineAt; no production policy activated, no Drill timeout, no released-score recalculation. Runbook: [TryOut recovery](TRYOUT_RECOVERY_RUNBOOK.md).

### JOB-09 clean-SHA evidence

**Engineering PASS:** PR #52 head `f0449c3767773def7ef9fcba58c7c941f04bd98e`, [CI 37110430471](https://github.com/ayiinee/Numora/actions/runs/37110430471) passed all gates. Connected artifact records actual PR merge checkout/release SHA `70d018dcf17e4f9db8456e3d378d53c11ac75f2d`: four cases, real API/PostgreSQL 16/Redis 7/Chromium, TEST ONLY content/auth/synthetic IRT release. This is a PR candidate, not deployed-main evidence. Clock-skew and lock-wait late-save tests passed on PostgreSQL. Human review, real Google, Curriculum and independent QA remain separate.

## JOB-20 Aini domain and worker - 3 October 2026

**ENGINEERING DECISION:** reuse durable outbox/dedup consumer; preserve correlation, add PostgreSQL-only status CLI and minute-bounded aggregate metrics, with nullable correlation migration. PostgreSQL tests inject failures to prove rollback/retry/replay; skipped tests do not count as passing.

**PROPOSED / default off:** canonical Drill start, changed PG answers, Drill/TryOut submission and actual unlock write pinned server context in domain transactions. `DOMAIN_ANALYTICS_ENABLED=false` until Data reviews the proposed schema/trigger/dedup mapping. No XP/star, PGK, Pretest or IRT/release policy invented. [Inventory/runbook](JOB20_ANALYTICS_INVENTORY.md) records existing support hooks, missing other-owner hooks and dependencies. Auth/join/monitoring remain Farel's handoff. JOB-20 overall is partial pending owners, Data activation and independent QA; Aini's implemented scope is reviewable separately.
