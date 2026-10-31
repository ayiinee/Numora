# Analytics Admin — UI-04

**ENGINEERING IMPLEMENTATION — 30 Oktober 2026.** Branch `feat/admin-analytics-dashboard`, berdasarkan UI-03 `45bf3d8`. Status: **IMPLEMENTED — review pending**. Instruksi pemilik: rombak Analytics menjadi dashboard ringkas, mudah dipindai dan menjadi menu/halaman pertama. Fondasi visual Akun Admin tetap dipakai.

## Keputusan dan batas cakupan

- Analytics menjadi menu pertama serta tujuan `/admin` untuk Super Admin aktif dengan capability `ANALYTICS_CONTENT` atau `ANALYTICS_OPERATIONS`. Super tanpa capability tersebut tetap memakai fallback sekolah. Operations tetap ke sekolah; Content/Data/Moderation tetap ke konten. Assignment kosong tidak memperoleh akses. Ini keputusan presentasi, bukan perubahan otorisasi NestJS.
- Ringkasan tetap dihapus. Tujuan awal Super Admin pada keputusan 27 Oktober digantikan oleh instruksi ini; tidak dibuat halaman Ringkasan kedua.
- GET `/api/v1/admin/analytics` dan DTO generated tetap menjadi kontrak. Tidak ada endpoint, dependency, migrasi atau perubahan XP, hasil historis, scoring, konfigurasi akademik dan gate IRT.
- Analytics menyediakan agregat, bukan isi soal atau gambar soal. Pemilik mengonfirmasi belum memiliki contoh baru. Tidak dibuat detail soal, tren, filter tanggal, statistik penguasaan, retensi atau data pengganti yang tidak tersedia dari sumber.

## Audit baseline dan referensi

Baseline UI-03: metrik tampil sebagai kartu berulang tanpa hirarki keputusan yang cukup kuat; identitas siswa, keanggotaan, versi soal dan penerbitan mudah disalahartikan. Baseline dan hasil direkam memakai fixture sintetis 22 metrik yang sama pada lima lebar layar. [Galeri sebelum/sesudah](screenshots/admin-analytics/README.md).

Referensi yang diperiksa:

- [Dribbble admin UI](https://dribbble.com/tags/admin-ui), metadata [Education SaaS](https://dribbble.com/shots/27817401-Dashboard-Education-SaaS), [EdTech dashboard](https://dribbble.com/shots/27274732-EdTech-Learning-Management-Dashboard), [Bliss Creek](https://dribbble.com/shots/25721366-Bliss-Creek-Admin-Panel-Data-Dashboard-Design), dan [E-commerce Admin](https://dribbble.com/shots/25151626-E-Commerce-Admin-Dashboard-Design-Concept). Browser Dribbble meminta human verification; verifikasi tersebut tidak dilanjutkan. Metadata tidak diperlakukan sebagai audit visual screenshot.
- [Michelin dashboard principles](https://designsystem.michelin.com/data-visualization/design-guidelines/principles-of-a-dashboard), dibaca melalui browser: tujuan dan hirarki informasi, detail sesuai kebutuhan serta konteks metrik.
- [Nielsen Norman Group: dashboards and preattentive attributes](https://www.nngroup.com/articles/dashboards-preattentive/): posisi, panjang dan warna membantu pemindaian. Implementasi tetap menyediakan label/nilai agar informasi tidak bergantung pada warna.
- [Dashboard Design Patterns](https://dashboarddesignpatterns.github.io/processguidelines.html): panduan proses sebagai referensi pendukung, bukan spesifikasi produk.
- Context7 memeriksa React terpasang `19.3.0`; corpus versi tersedia tetapi hasil khusus versi berfokus pada compiler. Pola fetch cleanup kemudian diverifikasi pada [dokumentasi resmi React](https://react.dev/reference/react/useEffect#fetching-data-with-effects), bukan diasumsikan dari contoh compiler.

Pencarian `ui-ux-pro-max` dipakai untuk hirarki dashboard, aksesibilitas dan pilihan grafik. Rekomendasi generik font/palet tidak menggantikan Plus Jakarta Sans, kanvas abu terang, panel putih dan aksen ungu Numora yang sudah disetujui. Tidak memakai skill design-taste yang mengecualikan dashboard Admin.

## Struktur dashboard dan makna data

Empat KPI: akun siswa aktif, kelas aktif, versi READY, dan rilis melewati batas 72 jam. Berikutnya perbandingan pengerjaan serta tindak lanjut; keanggotaan siswa dan cakupan Drill; lalu rincian operasional dan glosarium tertutup. Seluruh 22 metrik tetap tersedia satu kali.

Pemetaan berikut diverifikasi terhadap `apps/api/src/modules/admin/analytics.service.ts`; label tidak memperluas makna query backend.

| Bagian        | Key sumber                                                           | Interpretasi                                                                                                                                    |
| ------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| KPI           | `students`                                                           | Akun siswa berstatus aktif; bukan DAU/MAU.                                                                                                      |
| KPI           | `classes`                                                            | Kelas belum diarsipkan.                                                                                                                         |
| KPI           | `readyVersions`                                                      | Versi berstatus READY, bukan soal unik atau paket terbit.                                                                                       |
| KPI           | `overdueReleases`                                                    | Batch tanpa hasil terbit setelah `result_due_at`; frontend tidak menghitung ulang SLA.                                                          |
| Pengerjaan    | `drillStarted`, `drillCompleted`, `tryoutStarted`, `tryoutCompleted` | Jumlah attempt reguler kumulatif; selesai adalah GRADED, termasuk dalam dimulai. Bukan siswa unik atau penguasaan materi.                       |
| Tindak lanjut | `openReports`                                                        | Laporan soal dan video OPEN/IN_REVIEW.                                                                                                          |
| Tindak lanjut | `closedUnpublishedBatches`                                           | Batch telah tutup tanpa finalisasi terbit; dapat berkaitan dengan metrik overdue, tidak dijumlahkan sebagai masalah terpisah.                   |
| Tindak lanjut | `failedIrtRequests`                                                  | Request CALIBRATE_TRYOUT berstatus FAILED, dapat mencakup riwayat. Tinjau detail; bukan instruksi retry massal.                                 |
| Keanggotaan   | `mandiriStudents`, `schoolStudents`                                  | Akun siswa aktif tanpa/dengan keanggotaan aktif menurut query sumber. Akun unik pada masing-masing kelompok; tidak dihitung dari jumlah relasi. |
| Cakupan       | `levelsWithPublishedDrill`, `totalLevels`                            | Level dengan paket Drill PUBLISHED non-demo dibanding seluruh level tercatat. Bukan kualitas/kesulitan akademik.                                |
| Rincian       | `schools`, `memberships`                                             | Seluruh sekolah; relasi keanggotaan aktif pada kelas belum diarsipkan. Satu siswa dapat punya beberapa relasi.                                  |
| Rincian       | `verifiedTeachers`, `verifiedSchools`, `unusedCredentials`           | Guru aktif terverifikasi, sekolah yang memiliki Guru tersebut, serta token belum dipakai/dicabut/kedaluwarsa.                                   |
| Rincian       | `versions`, `publishedBatches`                                       | Seluruh versi soal; batch dengan finalisasi dipublikasikan.                                                                                     |

Batang pengerjaan berbagi skala dari nol. Selesai bukan segmen tambahan yang dijumlahkan dengan dimulai. Perbandingan keanggotaan memakai panjang batang dan angka aktual, tanpa mengklaim persentase. Cakupan Drill adalah satu-satunya persentase turunan: hanya ditampilkan ketika pembilang/penyebut valid, penyebut positif dan pembilang tidak lebih besar. `0/0` bukan `0%`; nilai tidak konsisten tidak di-clamp menjadi `100%`.

## State, akses dan struktur kode

- Nol ditampilkan sebagai `0`; null, alasan sumber tidak tersedia, negatif/nonfinite atau metrik hilang tidak diubah menjadi nol. Bagian dibentuk dari key yang dikirim; metrik tambahan tetap tampil dengan label sumber.
- Timestamp mengikuti `generatedAt` dan ditampilkan dalam WIB. Saat refresh, snapshot dan timestamp lama tetap terlihat sampai respons baru diterima. Kegagalan sementara menampilkan error, retry dan label data sebelumnya; kegagalan awal tidak membuat KPI palsu.
- Respons 401/403 membuang seluruh widget dan tautan data. Pergantian identitas/token/capability membatasi snapshot; cleanup mengabaikan respons lama agar data tidak hidup kembali setelah pencabutan akses.
- Tombol refresh terkunci saat pending; hook juga menahan refresh ganda secara sinkron. Seluruh request Analytics hanya GET. Membuka tautan ke konten/IRT tidak memicu mutasi.
- `analytics.tsx`: otorisasi presentasi, navigasi dan state halaman; `analytics-query.ts`: lifecycle snapshot; `analytics-model.ts`: label/format/validasi tampilan; `analytics-dashboard.tsx`: presentasi semantik. `admin-analytics.css` memakai namespace Analytics dan token management existing. DTO tetap generated, tanpa tipe respons paralel.
- Grafik CSS memiliki angka/label di definition list dan batang dekoratif `aria-hidden`. Glosarium memakai native details/summary; tautan aksi minimal 44 px. Kolom menyesuaikan 1440/1024/768/390/320 px.

## Loop audit dan bukti

1. Baseline: 1 skenario visual, lima viewport, fixture 22 metrik.
2. Putaran pertama: 11/12 skenario Analytics lulus. Satu assertion jumlah GET mengasumsikan hanya satu fetch awal; React StrictMode development melakukan mount effect tambahan. Assertion diperbaiki menghitung delta refresh, tanpa mematikan StrictMode atau mengubah otorisasi produk.
3. Audit screenshot: rincian CONTENT/RELEASE yang tersisa digabung secara presentasi agar tidak menyisakan panel terpencil pada baris baru. Semua key dan semantik dipertahankan; definition list dan keterbacaan label diperiksa kembali.
4. Putaran kedua: **24/24 browser lulus** — 12 Analytics, 4 regresi IRT/Analytics existing, 8 portal empat assignment pada desktop/ponsel. Seluruh 22 key tampil tepat satu kali. Axe WCAG 2 A/AA dan 2.1 AA pada workspace 320 px: **0 pelanggaran otomatis**. Pemeriksaan otomatis tidak menggantikan penilaian manual aksesibilitas.
5. Regresi sidebar: **6/6 lulus** — roda mouse, keyboard, viewport pendek, zoom 125%, menu mobile dan pengembalian fokus.
6. Audit tambahan mereproduksi overflow KPI pada nilai maksimum integer SQL (`2.147.483.647`) di ponsel. Nilai tetap ditampilkan utuh dengan wrapping di dalam kartu. Putaran ketiga: **2/2 lulus**, meliputi audit visual lima viewport/Axe dan geometri angka besar pada 390/320/1024 px.
7. Unit web: **58 file / 416 tes lulus**, termasuk respons terlambat setelah identitas/token berganti dan setelah capability dicabut. Root lint, lint tambahan tes geometri, web typegen/TypeScript dan `next build --webpack` lulus.
8. Build produksi lokal: **31/31 skenario browser lulus** — 13 Analytics, 4 IRT/Analytics existing, 6 sidebar dan 8 portal. Audit visual lima viewport, Axe serta state/akses juga dijalankan terhadap build produksi ini. Source dan hasil build memakai kontrak fixture yang sama.

Perintah regresi tersimpan: `pnpm --dir apps/web exec vitest run --maxWorkers=1`, `pnpm lint`, serta `pnpm --dir apps/web exec playwright test admin-analytics-ux.spec.ts admin-irt-analytics.spec.ts admin-sidebar.spec.ts admin.spec.ts --grep 'Analytics|analytics|Unified Admin portal|Admin sidebar|Admin mobile menu'`. Pengujian ini menggunakan override config lokal untuk dist/cache terisolasi; `NUMORA_E2E_PRODUCTION=true` memilih hasil build. Override hanya mengatur cache/output/environment fixture dan tidak mengubah implementasi aplikasi. Node 24.22.1 / pnpm 12.6.0; build low-memory memakai satu worker. Layanan development pengguna pada port 3000/3001 tidak dihentikan.

Bukti browser memakai Supabase/API fixture di localhost:3300/3301; tidak masuk layanan nyata. Build/cache ditempatkan terpisah dari layanan development pengguna. Tidak menjalankan migrasi atau mengubah cloud. Review manusia, CI branch, akurasi agregasi pada database nyata, QA independen dan penerimaan ilmiah IRT tetap bukti terpisah; implementasi lokal tidak mengklaim release readiness.
