# Pemeriksaan fungsional Admin Content — 7 Oktober 2026

**ENGINEERING EVIDENCE:** pemeriksaan pada working tree `feat/admin-content-ux`, baseline commit `735d9ee`. Working tree juga memuat perubahan UI/catalog dan pembersihan lingkungan dari pekerjaan sebelumnya; laporan ini menjelaskan tambahan pemeriksaan fungsional, bukan seluruh diff terhadap commit tersebut. PRD v0.6 tetap menjadi acuan. Tidak ada perubahan formula, role, schema, atau policy akademik pada perbaikan ini.

## Perbaikan

| Area                 | Masalah yang ditemukan                                                                                                              | Perbaikan                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Materi               | Form level menerima hingga 1.000 meskipun API/PRD hanya menerima 1–5.                                                               | Batas input menjadi 5; constraint API tetap otoritatif.                                                                                                        |
| Draf Tryout          | Pilihan soal mengikuti halaman daftar paket dan berhenti pada 20 versi, sehingga paket 30 soal tidak dapat disusun melalui pemilih. | Query dan pagination pemilih soal dipisahkan dari daftar paket. Pilihan dipertahankan lintas halaman; pin lama/arsip dapat dikeluarkan melalui daftar pilihan. |
| Pretest editorial    | Batal/sukses edit menyisakan mode edit; pembuatan paket berikutnya dapat mengirim PUT ke endpoint create.                           | Reset mode edit dan revisi, gunakan POST untuk create/revision dan PUT untuk edit draf; reset form hanya setelah berhasil.                                     |
| Referensi Pretest    | Retry daftar tidak memuat ulang blueprint/bab yang sebelumnya gagal.                                                                | Retry memuat ulang referensi, error referensi terpisah, pin blueprint existing tetap terlihat ketika pilihan belum tersedia.                                   |
| Impor JSON           | Namespace dari envelope diabaikan dan diganti default form.                                                                         | Gunakan namespace envelope yang valid; validasi 1–128 karakter. Pembacaan file memiliki penjagaan hasil asynchronous dan state busy.                           |
| Upload media         | Penolakan akses upload hanya dilaporkan uploader, tanpa mengunci halaman impor.                                                     | Bersihkan reservasi/file/receipt saat 401/403 dan teruskan penolakan ke halaman impor untuk menutup payload dan aksi.                                          |
| Detail versi/laporan | Perpindahan target yang gagal dapat meninggalkan detail target sebelumnya.                                                          | Reset detail ketika request baru dimulai dan key komponen mencakup ID target.                                                                                  |
| Pencabutan akses     | Preview/report/review/IRT/import dapat tetap memperlihatkan payload yang dimuat sebelum API mengembalikan 401/403.                  | Hapus atau sembunyikan payload dan aksi pada penolakan akses; profile Admin harus ACTIVE. Queue IRT mempertahankan kegagalan terpisah untuk error biasa.       |
| Laporan/audit        | Form filter kosong lagi setelah query selesai meskipun filter server masih aktif.                                                   | Isi form mengikuti filter yang diterapkan; tanggal ditampilkan pada waktu lokal dan dikirim sebagai ISO UTC.                                                   |
| Verifikasi & riwayat | Versi yang tercantum tidak memiliki jalur langsung ke review.                                                                       | Tambahkan tautan detail/review versi dengan ID durable.                                                                                                        |
| Workbench            | Error request sebelumnya dapat tertinggal saat tab/filter berikutnya berhasil.                                                      | Bersihkan error saat query berikutnya dimulai.                                                                                                                 |

## Cakupan pemeriksaan

| Halaman/tab          | Kemampuan yang diperiksa                                                                             | Batas yang tetap berlaku                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Materi               | Create/rename/status/category, relasi taxonomy, pagination, validasi level                           | Kebenaran taxonomy dan isi berasal dari Curriculum.                          |
| Soal                 | Authoring PG legacy, revisi/variant, review/archive, pagination, tautan rich content                 | Import PGK tidak memakai editor legacy; payload/review melalui detail versi. |
| Verifikasi & riwayat | Metadata reviewer/waktu/status, riwayat audit, detail versi                                          | Review engineering bukan bukti pengesahan akademik.                          |
| Video                | Create/edit/pemetaan/status, URL aman, preservasi target laporan                                     | Pemilihan video yang benar memerlukan pemeriksaan konten tim.                |
| Draf Tryout          | Create/edit pin, pemilih 30 soal lintas halaman, kebijakan published, penolakan publikasi invalid    | Publikasi memerlukan readiness dan policy/rubric yang disahkan.              |
| Paket Drill          | Create/edit/retry/archive/publish, pin di luar halaman, policy                                       | Paket harus memenuhi readiness server; tidak mengganti hasil historis.       |
| Laporan/detail       | Filter server, target historis, resolution, alasan dan audit                                         | Tidak mengungkap jawaban atau identitas siswa individual.                    |
| IRT/history/request  | Prepare/detail/retry, konfigurasi pinned, execution/adoption/publication blockers, SLA               | Output dan scientific acceptance milik Data/AI; SUCCEEDED bukan release.     |
| Audit                | Filter actor/action/entity/periode, pagination dan cakupan domain                                    | Content tidak mendapatkan audit domain operasional.                          |
| Impor/media/preview  | Namespace, validasi/DRAFT, receipt upload, jawaban preview, submit/review, renewal media dan failure | Fixture Storage tidak membuktikan konektivitas R2/CORS aktual.               |
| Pretest              | Authoring/edit/revision, retry referensi, review dan readiness                                       | Publish produksi tetap diblokir blueprint approved/consumer Student.         |
| Struktur terbatas    | Sekolah/kelas/counts, read-only, pembatasan field                                                    | Tidak ada roster individu, credential, atau aksi pengelolaan kelas.          |
| Portal               | Subrole, direct route, loading/error/empty/denied, logout, responsive                                | Browser memakai provider/API fixture; bukan acceptance Cloud Auth.           |

## Bukti pengujian

Tes mutasi memakai PostgreSQL lokal terisolasi `numora_test_admin_content_20261007` pada loopback, bukan database Development. Browser memakai API/provider fixture pada port 3300/3301. Build memakai direktori output tersendiri agar server pengguna pada port 3000 tidak terganggu.

| Pemeriksaan                                           | Hasil                                      | Batas bukti                                                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Seluruh unit/component web                            | 259/259 lulus, 40 file                     | Sebelum tambahan kasus penolakan upload terakhir.                                                                                                                        |
| Regresi final Content/import/preview/media            | 37/37 lulus, 3 file                        | Mencakup perubahan upload terakhir serta pemilih Tryout dan namespace.                                                                                                   |
| API content/reports/IRT/operations/analytics/identity | 112 lulus, 2 dilewati, 20 file             | PostgreSQL nyata, HTTP pada test harness. Dua kasus IRT Redis dilewati karena `TEST_REDIS_URL` tidak tersedia. Storage dan scientific producer menggunakan fixture.      |
| Browser Admin                                         | 45/45 lulus                                | Subroles, route/aksi/form/failure/empty/loading/logout, desktop dan viewport 320–1440 px; provider/API fixture.                                                          |
| Regresi pemilih Tryout terakhir                       | 1/1 lulus                                  | 30 pilihan lintas halaman; pengelolaan pin dibuka pada 320 px tanpa overflow horizontal.                                                                                 |
| Script checks                                         | 68/68 lulus                                | Environment/provisioning/contract/upload guards offline.                                                                                                                 |
| Contract validation/types/freshness                   | Lulus                                      | 8 schema dikompilasi; generated types sesuai snapshot; export OpenAPI dari controller build tidak mengubah hash snapshot working tree.                                   |
| Lint seluruh repository                               | Lulus, tanpa warning                       | Tidak menggantikan review independen.                                                                                                                                    |
| Typecheck web dan API                                 | Lulus                                      | Web route types generated melalui Next.js.                                                                                                                               |
| Production build web dan API                          | Lulus                                      | Web webpack output `.next-admin-content-ux`; API Nest build. Bukan deployment.                                                                                           |
| PRD data migration suite tambahan                     | 3 dilewati                                 | Tidak diberi layanan dedicated suite tersebut; tidak dihitung sebagai tes yang lulus. Migrasi canonical sudah diterapkan ke database test lokal untuk suite API di atas. |
| Development read-only                                 | Materi/bank soal 0; demo package/attempt 0 | Diverifikasi ulang tanpa seed atau mutasi Cloud. API port 3001 tidak aktif saat smoke, sehingga HTTP health Development belum terverifikasi pada audit ini.              |

Cluster PostgreSQL test dan server browser fixture dihentikan setelah pengujian; server web pengguna pada port 3000 tetap tersedia. Tidak menjalankan keseluruhan `pnpm ci` sebagai satu command; bukti di atas menyebut check yang dijalankan dan batasnya secara terpisah.

Perintah utama untuk reproduksi:

```powershell
pnpm --filter @tka/web exec vitest run --maxWorkers=1
pnpm --filter @tka/web exec vitest run src/features/admin/content.spec.tsx src/features/admin/content-preview.test.tsx src/features/admin/media-upload.test.tsx --maxWorkers=1
# TEST_DATABASE_URL harus menunjuk database test lokal yang sudah dimigrasi, NODE_ENV=test.
pnpm --filter @tka/api exec vitest run src/modules/content src/modules/reports src/modules/irt src/modules/admin/operations.integration.spec.ts src/modules/admin/analytics.spec.ts src/modules/identity/ --maxWorkers=1
$env:NUMORA_E2E_WEBPACK='true'
pnpm --filter @tka/web exec playwright test e2e/admin.spec.ts e2e/admin-content-lifecycle.spec.ts e2e/admin-irt-analytics.spec.ts e2e/admin-assessment-publisher.spec.ts e2e/admin-operations.spec.ts e2e/admin-accounts.spec.ts
```

## Dependensi eksternal

- **Curriculum:** bank/taxonomy/difficulty, blueprint Pretest dan bukti rubric PGK menyeluruh yang disahkan.
- **Data/AI:** producer respondent results, pipeline dan konfigurasi/mapping/quality gate yang disetujui. Tidak membuat algoritma atau force release pengganti.
- **Cloud/operator dan QA:** acceptance Storage R2/CORS/URL expiry, Auth nyata, compute dan pengujian independen. Keberhasilan fixture atau connected PostgreSQL lokal tidak menutup gate ini.
- **Domain terpisah:** lifecycle Pretest Student tetap di luar scope admin yang dipilih.

Database Development tetap mengikuti [hasil pembersihan demo](ADMIN_CONTENT_DEMO_CLEANUP_2026-10-07.md). Audit ini tidak menambahkan ulang seed/fixture atau menghapus data tambahan. Tidak ada commit/push/deployment pada pemeriksaan ini.
