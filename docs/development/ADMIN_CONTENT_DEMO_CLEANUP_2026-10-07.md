# Pembersihan demo Admin Content — 7 Oktober 2026

**ENGINEERING DECISION — instruksi pemilik:** hapus data demo dari database Development agar tim dapat mengisi konten demonstrasi sendiri. Ini adalah pembersihan fixture pada satu environment, bukan perubahan aturan produk, migrasi schema, atau fitur penghapusan histori pada portal produksi.

**ENGINEERING EVIDENCE:** diterapkan pada sandbox Development `pkamenfnwmoeisccnrnk`; verifikasi selesai 7 Oktober 2026, sekitar 00:16 WIB. Nama project historis tidak menjadi dasar pemilihan target: runner mencocokkan project ref, Supabase URL, host/user PostgreSQL, mode Development dan TLS.

## Data yang dihapus

| Area               | Data fixture yang dihapus                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Materi             | 5 bab, 5 subbab, 5 kompetensi, 17 level                                                                                                                                        |
| Bank soal          | 321 keluarga, 481 varian, 781 versi soal                                                                                                                                       |
| Assessment         | 73 paket demo/QA dan 852 item paket                                                                                                                                            |
| Riwayat pengujian  | 332 attempt assessment, 4.832 snapshot item, 4.787 jawaban; 12 attempt dan 2 paket Drill legacy beserta item terkait                                                           |
| Progress           | 1.472 baris progress pada level demo                                                                                                                                           |
| Import dan preview | 3 impor, 21 identitas/versi impor, 2 sesi preview dan item/jawaban terkait                                                                                                     |
| Upload demo        | 3 sesi upload yang berhasil menyimpan paket fixture dan 3 receipt media terkait                                                                                                |
| Tryout/IRT         | 2 batch Tryout, 1 batch IRT, 35 hasil item fixture                                                                                                                             |
| PvP                | 1 match pada paket demo, peserta/pertanyaan/jawaban/invite/best record serta proyeksi terkait                                                                                  |
| Turunan fixture    | 1 posting XP demo, 336 analytics events dan 336 outbox terkait, delivery/exposure, 1 laporan soal, proyeksi leaderboard terkait dan 112 notifikasi yang merujuk target fixture |

Penentuan fixture memakai origin `DEMO`/`DEMO_QA_NOT_CURRICULUM_APPROVED`, provenance smoke Excel/R2 yang spesifik, kode taxonomy seed yang diketahui dan flag paket `is_demo`. Seluruh attempt yang dihapus memakai paket bertanda demo, termasuk attempt uji yang dibuat lewat akun Development; akun tersebut tetap dipertahankan.

Satu pengecualian legacy adalah draf `QA-TRIAL-DEMO` (`QA DEMO Tryout Okt2`): flag `is_demo` masih false. Paket ini hanya ikut dibersihkan setelah pemeriksaan identitas QA yang tepat, status DRAFT, tidak adanya attempt, dan seluruh itemnya merujuk versi yang terbukti fixture. Nama umum atau soal yang kebetulan mirip bukan dasar penghapusan.

## Data yang dipertahankan

- 127 profil pengguna, termasuk akun QA dan ketiga sub-role Admin; 8 sekolah, 23 kelas dan 104 membership.
- 3 draf tanpa penanda fixture: `1`, `Paket TryOut Februari`, `TryOUt Terbari`. Ketiganya tidak merujuk taxonomy atau soal yang dihapus.
- 6 sesi upload lain yang tidak terbukti bagian dari fixture milik implementasi ini, termasuk preview dan validasi gagal.
- Policy produk PRD v0.6, rubric dasar, riwayat migrasi, audit sebelumnya dan seluruh baris di luar manifest pembersihan.
- Supabase Auth, Storage dan objek R2 tidak dimutasi. Penghapusan receipt database tidak menghapus berkas fisik R2; berkas lama perlu pembersihan storage tersendiri jika diminta.

## Backup dan pengamanan

Backup lokal terbatas berada di `D:/numora-sandbox-backups/2026-10-07-content-demo-cleanup/before.dump`, mencakup `public`, `drizzle` dan `irt_compute`; bukan backup Supabase Auth/Storage. Ukuran archive 1.047.415 byte, SHA-256 `93c6f70b91f03bb729320eab64bdc298f1e062b274f3a547afe2a534e486f953`. Backup dan bukti detail tidak masuk Git.

Backup berhasil direstore ke PostgreSQL 17 terisolasi pada loopback port 55449. Manifest UUID yang sama diuji untuk penghapusan dan rollback. Runner menolak perubahan target sejak backup, menormalisasi fingerprint timestamp ke UTC, mengunci tabel selama transaksi, dan memeriksa jumlah/baris yang dihapus serta fingerprint seluruh baris yang dipertahankan.

Penghapusan fixture membutuhkan pengecualian operator terhadap trigger histori yang immutable. Hanya trigger pengguna pada tabel dalam manifest yang dinonaktifkan di dalam transaksi pembersihan; foreign key tetap aktif. Semua definisi dan status trigger dipulihkan serta diverifikasi sebelum commit. Tidak ada trigger, constraint, grant, RLS atau aturan produk yang dilemahkan secara permanen. Jalur ini tidak boleh dipakai sebagai operasi aplikasi atau pembersihan data peserta produksi.

Audit `development_demo_content_cleanup` mencatat tindakan operator database, checksum backup dan jumlah penghapusan. Tidak menyamar sebagai principal Admin yang login. Artefak lokal `applied.json`, `verification.json`, `rehearsal.json` dan `rollback-rehearsal.json` menyimpan bukti; runner sementara ada di `.tmp/content-demo-*.cjs`, bukan perintah cleanup umum.

## Verifikasi akhir

- Jumlah bab, subbab, keluarga/versi soal, paket bertanda demo dan attempt assessment: **0**.
- Reader aplikasi `ContentService.curriculum()` dan kedua mode bank soal (`ALL`, `COMPACT_DEMO`): **0 item**, `nextOffset: null`.
- `pnpm db:check`: **PASS**, 110 tabel/kolom aplikasi dan RLS tetap tersedia.
- API Development `/api/v1/health/database`: **HTTP 200**.
- Fingerprint semua baris di luar manifest tidak berubah selama transaksi; trigger kembali ke definisi/status semula; satu audit pembersihan baru tersimpan.

Tidak ada perubahan kode aplikasi, kontrak atau migration pada pembersihan ini. CI/browser fixture dan screenshot sebelumnya tetap bukti implementasi UI dengan data sintetis, bukan keadaan database setelah pembersihan. Seed dan fixture tes tetap tersedia untuk pengujian terisolasi; `pnpm dev` tidak memanggil seed. Hindari menjalankan perintah seed lama pada sandbox yang sudah bersih bila tim hendak mengisi data sendiri.
