# Admin dan akses asesmen — 9 November 2026

**ENGINEERING DECISION — rencana disetujui pemilik:** implementasi berada pada `feat/admin-assessment-rework`, berbasis `origin/main`. Tidak mengubah cloud, melakukan push/merge, atau menulis ulang histori. Rilis Tryout fleksibel sesuai keputusan 7 Oktober tetap berlaku. Analytics tersedia bagi ketiga subrole sesuai capability; tujuan awal tetap Super → Analytics, Operations → Sekolah, Content → Bank konten. Keputusan ini menggantikan pembatasan UI Analytics hanya untuk Super pada 30 Oktober.

## Matriks kebutuhan dan penerimaan

| Sumber                                       | Halaman/tugas                       | Izin dan API                                                 | Acceptance criteria                                                                                                                         |
| -------------------------------------------- | ----------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD RULE §3.2–3.3                            | Navigasi dan Analytics              | Assignment aktif; `GET /admin/analytics` scoped server       | Operations tidak memperoleh tindakan IRT; Content tidak memperoleh data individu; null/disabled ditolak.                                    |
| PRD RULE §7.1                                | Paket Pretest → bab siswa           | Content/Super; pipeline `/admin/content/packages`            | 20 soal, snapshot/policy/blueprint dan digest sah; non-demo tersedia bagi siswa; skip/resume/sekali selesai dan 0 XP dipertahankan.         |
| PRD RULE §18; ENGINEERING DECISION 6 Oktober | Bank/Tambah konten                  | Content/Super; import, preview, review dan approval existing | Preview tidak dinilai; provenance nyata; DRAFT/READY/publikasi dibedakan.                                                                   |
| ENGINEERING DECISION 7 Oktober               | Paket Tryout                        | Content/Super; Publish dengan releaseAt opsional             | Sekarang/terjadwal; tujuh hari kurang satu menit, 600 detik, deadline capped; pergantian paket aktif dijelaskan.                            |
| PRD RULE §11–13                              | Hasil Tryout & IRT                  | Content/Super; batch-health/request/adoption existing        | Akses paket dan hasil terpisah; XP saat submit; kunci/nilai/pembahasan menunggu finalisasi immutable.                                       |
| PRD RULE §19                                 | Sekolah, credential, pengguna/kelas | Operations/Super; Content limited reader                     | Tidak ada ban/unban, pengubahan hasil atau formula; loading/error/empty/denied dan riwayat dipertahankan.                                   |
| ENGINEERING DECISION — kompatibilitas        | Paket Pretest lama                  | Reader legacy; intake canonical eksplisit                    | Draf belum direview/dipakai boleh dilanjutkan dengan impor nyata; paket reviewed/used/published tetap immutable dan dilanjutkan versi baru. |

## Batas implementasi

- Satu workspace paket dengan Pretest/Drill/Tryout; tautan lama menjaga konteks. Generator adalah sumber intake, bukan publikasi.
- Ketersediaan paket berasal dari predikat server yang juga dipakai siswa; bukan sakelar visibilitas baru. Status jadwal tidak membuktikan paket terpilih sebagai paket aktif.
- Semua snapshot/approval/policy dibekukan dalam transaksi publikasi; tidak ada backfill snapshot atau provenance fiktif.
- **OPEN:** kontrak respondent, mapping/fallback dan penerimaan ilmiah Data/AI; tak ada force release atau formula pengganti. Draft AI/IRT v2 hanya menjadi arah pemisahan status/versi, tanpa A/B/multi-arm.
- Tes koneksi memakai PostgreSQL localhost terisolasi dan approval berlabel TEST ONLY. Fixture tidak menyatakan approval akademik atau penerimaan cloud.

## Kontrak dan kompatibilitas

`ContentPackageDto` menambah proyeksi opsional untuk kompatibilitas klien: `blueprintVersionId`, `scoringPolicyVersionId`, `frozenAt`, `releaseAt`, `closeAt`, `origin`, `legacyPreparation`, dan `availability: { state, blockers, checkedAt }`. Semua dihitung/dibaca server, bukan input pengubah visibilitas. Status akses ialah DRAFT/BLOCKED/SCHEDULED/AVAILABLE/CLOSED/ARCHIVED, terpisah dari status penyimpanan paket dan finalisasi hasil peserta. Syarat individu (akun aktif, level terbuka, pernah selesai) tetap diperiksa saat mulai.

Pretest memakai pemilihan paket dan policy bersama dengan consumer siswa. Publikasi membekukan item, blueprint, policy, dan manifest dalam transaksi yang sama; `compositionDigest` mempertahankan kaitan dengan persetujuan susunan, sementara `manifestDigest` mengikuti digest snapshot database. Intake impor yang direview dapat didistribusikan tanpa menciptakan PASS ilmiah. Gerbang HOLD/RETIRED dan provenance impor tetap diperiksa. Tidak ada perubahan schema atau migrasi data historis.

`POST /api/v1/admin/content/packages/:id/intake` menerima `{ expectedRevision, source: { sourceNamespace, sourceName, sourceReference } }` melalui ContentAdminGuard. Draf lama tanpa review/snapshot/attempt mendapat sumber nyata dan kenaikan revisi; impor aktual berikutnya baru menciptakan provenance. Paket historis menghasilkan versi berikutnya yang kosong tanpa menyalin persetujuan atau pin. Replay sumber sama mengembalikan ID sama; konflik sumber/revisi/versi ditolak 409. Endpoint lama tetap membaca histori; publikasi lama memberi `PRETEST_CANONICAL_INTAKE_REQUIRED`.

Pemilihan Drill menggunakan fungsi yang sama dengan start siswa, termasuk pengecualian Chapter 3 yang sudah disahkan sebelumnya. Tryout memakai pemilihan server yang sama, validasi policy, waktu database dan jadwal batch. Paket yang tersisih versi aktif menampilkan alasan tersendiri. `AVAILABLE` tidak menyatakan nilai/pembahasan sudah terbit.

Tautan `/admin/content/pretest?packageId=…` mempertahankan paket/filter/offset; tab paket lama pada Bank konten diarahkan ke hub asesmen. Generator tetap dapat dibuka dari Tambah konten dan tidak menjadi jalan pintas publikasi.

## Verifikasi

**ENGINEERING UPDATE — sidebar dropdown, 9 November 2026:** tahap pertama mengikuti [keputusan navigasi terbaru](../design/ADMIN_NAVIGATION_UX_2026-11-02.md#sidebar-dropdown--keputusan-pemilik-9-november-2026): empat kelompok, submenu dua tingkat, preferensi sesi per akun/assignment, sinkronisasi URL dan tab existing. Pemeriksaan setelah perubahan ini menghasilkan **27 file / 233 tes unit** dan **39 tes browser** lulus, termasuk regresi Analytics/Pretest/publisher; lint, typecheck Web dan build produksi Web lulus. Bukti browser memakai fixture TEST ONLY, bukan koneksi cloud atau persetujuan akademik. Hasil di bawah mencatat tahap asesmen sebelumnya.

- Backend HTTP/integrasi: **28 tes** publisher/content-preview dan **15 tes** Pretest, Tryout, partial reward serta Analytics lulus. Paket Pretest non-demo dibuktikan melalui publikasi, manifest snapshot, visibilitas bab, start/resume, simpan/muat ulang jawaban, submit idempoten, larangan selesai kedua kali dan tanpa XP. Tes juga mencakup sumber intake lama, konflik revisi, pelestarian paket reviewed dan pergantian paket aktif.
- Unit Admin Web: suite lengkap **25 file / 196 tes** lulus; setelah penyempurnaan terakhir workspace/import/UI, pemeriksaan ulang empat file terkait menghasilkan **54 tes lulus**. Percobaan ulang suite lengkap bersamaan dengan browser dihentikan karena worker tidak memberikan hasil; tidak dihitung sebagai kelulusan tambahan.
- Browser Chromium pada **build produksi: 36/36 tes lulus**. Mencakup publikasi canonical oleh Super/Content, jadwal WIB, larangan akses URL Operations/assignment kosong tanpa request konten, redirect lama, lima data per halaman, Back/reload/retry/empty, Analytics tiga subrole, keyboard sidebar/drawer, zoom, screenshot dan pemeriksaan axe. Workspace/Analytics diperiksa pada lebar 320, 390, 768 dan 1440 px. Tab jenis asesmen tetap terlihat pada mobile.
- Browser memakai respons API **TEST ONLY**; bukti runtime tersambung berasal dari tes HTTP/database di atas. Keduanya bukan klaim browser terhubung penuh ke lingkungan penerimaan. Percobaan development yang gagal karena locator/teks tes dan error inisialisasi router Next tetap berada dalam riwayat kerja; putaran akhir produksi lulus tanpa mengabaikan error browser.
- Lint, typecheck API/Web, build NestJS/Web webpack, pemeriksaan freshness tipe hasil generate, validasi **12 schema kontrak**, serta `git diff --check` lulus. Tidak ada perubahan persistence yang memerlukan migrasi baru.
- Database tes adalah cluster run-owned PostgreSQL **18.6** pada `127.0.0.1:35439`, database `numora_test_admin_rework`, bukan database cloud. CI PostgreSQL 16 belum dijalankan pada pekerjaan lokal ini. Artefak browser dan data cluster tetap ignored. `.env` dan konfigurasi ignored dipertahankan.

Untuk mengulang browser, build Web dengan `NUMORA_WEB_DIST_DIR=.next-e2e`, URL API `http://localhost:3301/api/v1`, konfigurasi auth publik TEST ONLY, lalu jalankan Playwright dengan `NUMORA_E2E_PRODUCTION=true` untuk `admin-pretest-ux`, `admin-sidebar`, `admin-analytics-ux` dan `admin-assessment-publisher`. Config menyalakan server localhost 3300; fixture mengintersep API tanpa akses cloud. Tes API harus dijalankan dari `apps/api` dengan database tes lokal yang sudah dimigrasi.

**Batas penerimaan:** review kode manusia, penerimaan akademik konten, browser tersambung penuh dan penerimaan lingkungan nyata merupakan bukti terpisah yang belum diberikan. Kontrak respondent, mapping nilai dan fallback Data/AI tetap OPEN; komputasi/adopsi tidak diartikan sebagai hasil peserta sudah terbit. Tidak ada push, merge, deploy atau perubahan cloud.

**Baseline Git:** branch dibuat dari `origin/main` pada `4378739` pukul 15.03 WIB. Referensi remote maju ke `45f8602` saat fetch pukul 17.49 WIB ketika implementasi berlangsung; perubahan upstream tersebut belum diintegrasikan. `main` lokal tetap `4378739`. Hasil verifikasi berlaku untuk baseline branch fitur dan perubahan kerja ini; integrasi upstream memerlukan pemeriksaan ulang bagian yang beririsan.

## Integrasi main ke branch lokal - 10 November 2026

**ENGINEERING DECISION - permintaan pemilik:** origin/main d2a2e39 digabung fast-forward ke feat/admin-assessment-rework; perubahan lokal dipulihkan dan konflik diselesaikan tanpa push atau commit perubahan lokal. Cadangan sebelum integrasi dipertahankan di stash bertajuk backup admin local before main integration 2026-11-10. Konfigurasi ignored tetap.

Perbaikan main mencakup rekonstruksi cakupan soal Pretest original, validasi sourceLevelNumber null dan runtime penilaian parsial yang disetujui. Resolusi mempertahankan UI lokal, navigasi siswa baru, timer Drill main dan distribusi Pretest original main. Helper pemilihan paket bersama menerima validator tambahan dari assessment-engine sehingga status Admin dan siswa memakai validasi policy parsial yang sama, tanpa dependensi balik database ke engine.

Verifikasi: validasi impor 3 tes dan partial scoring 5 tes lulus; 4 tes browser fixture lokal (detail, 20 soal/navigasi, legacy invalid, breadcrumb) lulus. Lint berkas integrasi dan freshness tipe kontrak lulus. Tidak menjalankan migrasi cloud, operator publikasi atau perubahan data historis. Keberhasilan fixture bukan penerimaan akun/paket nyata.

### Perbaikan error daftar Pretest � 10 November 2026

**ENGINEERING DECISION:** referensi ID paket pada pemeriksaan distribusi Pretest dibuat eksplisit agar subquery berkorelasi tidak menghasilkan PostgreSQL 42702 (kolom ID ambigu). Aturan akses tetap sama. Regresi memeriksa SQL yang dihasilkan Drizzle; pembacaan daftar dan detail paket diperiksa tanpa perubahan data.
