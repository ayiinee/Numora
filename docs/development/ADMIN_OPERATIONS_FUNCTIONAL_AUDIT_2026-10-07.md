# Audit fungsional Admin Operasional

**ENGINEERING UPDATE — 7 October 2026:** pemeriksaan frontend sampai API untuk dua modul Operations: **Sekolah & credential** dan **Pengguna & kelas**. Ini perbaikan implementasi terhadap batas PRD v0.6 yang sudah disepakati, bukan perubahan permission atau aturan produk. Ringkasan dan Analytics tetap tidak tersedia pada portal Operations.

## Temuan dan perbaikan

| Area                    | Masalah                                                                                                                       | Perbaikan                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detail sekolah          | Form menggunakan data daftar sebelum detail terbaru tersedia; kegagalan detail tidak memiliki retry tersendiri.               | Form/mutasi menunggu detail server. Loading/error/retry terpisah; tidak menawarkan mutasi dari detail yang gagal dimuat.                                                                                                         |
| Pilihan sekolah         | Mengklik kembali sekolah yang sama mengosongkan credential tanpa memicu request baru.                                         | Pilihan yang sama tidak mereset credential. Perpindahan sekolah tetap membersihkan token plaintext.                                                                                                                              |
| Form sekolah            | Refresh setelah penerbitan token berpotensi mengisi ulang form dan menghilangkan edit yang belum disimpan.                    | Isi form diinisialisasi dari detail saat sekolah berganti; refresh credential mempertahankan edit. Nama kosong ditolak dengan pesan; simpan mencakup nama dan alamat. Petunjuk kode mengikuti normalisasi kapital server.        |
| Credential              | Terbit ulang belum memeriksa status sekolah; pemeriksaan eligibility di luar transaksi membuka race terhadap penonaktifan.    | Issue/reissue dan verifikasi Teacher mengunci baris sekolah aktif di dalam transaksi. Sekolah nonaktif menolak penerbitan/verifikasi; pencabutan credential tetap tersedia. UI menonaktifkan terbit ulang pada sekolah nonaktif. |
| Status token            | Label expiry dihitung memakai jam browser.                                                                                    | Status AVAILABLE/USED/REVOKED/EXPIRED mengikuti DTO server. Waktu credential tetap ditampilkan dalam WIB.                                                                                                                        |
| Validasi API            | `name: null` dan `status: null` pada PATCH sekolah melewati `IsOptional`, kemudian dapat gagal sebagai error server.          | Validasi mengizinkan omission tetapi menolak null/tipe/nilai yang tidak sah dengan Problem Details 400. `address: null` tetap sah untuk mengosongkan alamat.                                                                     |
| Pencarian sekolah       | `%` dan `_` dalam pencarian diperlakukan sebagai wildcard SQL.                                                                | Trim dan escape wildcard agar pencarian nama/kode bersifat literal, konsisten dengan reader operasional lain.                                                                                                                    |
| Navigasi pengguna/kelas | Link kelas memuat tab pengguna terlebih dahulu; filter role tanpa schoolId diabaikan; tab tidak bertahan pada reload/history. | Baca konteks URL sebelum memuat panel, terapkan schoolId/role/userId sejak request awal, simpan tab di query `view`, dan pulihkan pada Back/Forward.                                                                             |
| Data sensitif           | Penolakan akses detail sekolah/membership/roster tidak selalu menutup workspace yang sudah memuat identitas atau credential.  | 401/403 menutup data dan aksi yang telah dimuat. Key workspace juga mencakup status akun dan capability agar pencabutan lalu pemulihan akses tidak mengembalikan cache lama. Error sementara tetap memiliki retry lokal.         |
| Kelas tanpa Guru aktif  | Nama Guru tercatat dalam daftar tidak menjelaskan apakah Guru masih aktif/terverifikasi.                                      | Daftar membedakan Guru tercatat dan Guru aktif, serta mempertahankan kelas tanpa Guru aktif.                                                                                                                                     |

## Cakupan pemeriksaan

| Halaman/alur     | Perilaku yang diperiksa                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sekolah          | Daftar, pencarian literal, pagination, create, konflik/error dengan input tetap tersimpan, detail/retry, edit nama/alamat, aktif/nonaktif.                               |
| Credential Guru  | Issue, plaintext satu kali, reissue, revoke, status server, penerbitan/expiry/pemakai, pagination, perpindahan sekolah, serta eligibility saat penonaktifan bersamaan.   |
| Pengguna         | Filter nama/role/status/affiliation/sekolah, pagination, detail/email, verifikasi Teacher dan membership Student/Teacher, retry serta deep link dari sekolah/credential. |
| Kelas            | Filter nama/sekolah/Guru/arsip, detail, Guru tercatat versus aktif, roster aktif/mantan/semua, pencarian dan pagination roster.                                          |
| Portal dan akses | Tiga assignment, unassigned/disabled, HTTP langsung, pencabutan akses dengan token lama, pemisahan Content limited view, keyboard dan viewport 320/768/1440 px.          |

Tidak menambah ban/unban, koreksi hasil akademik, manajemen akun Admin, atau mutasi kepemilikan kelas pada Operations. NestJS tetap otoritatif; browser Supabase hanya digunakan untuk Auth.

## Bukti dan batas pengujian

Tes mutasi/concurrency memakai PostgreSQL lokal terisolasi `numora_test_admin_content_20261007` pada loopback yang sudah dimigrasi. Browser memakai provider/API fixture pada port 3300/3301. Tidak melakukan seed, perubahan akun, atau mutasi database Cloud. Build web memakai output tersendiri dari server development pengguna.

| Pemeriksaan                                     | Hasil                                        | Batas bukti                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/component web, seluruh repository web      | 276 lulus; 1 timeout dari 277 kasus, 40 file | Kasus pemilih 30 soal Content mencapai timeout 5 detik ketika pemeriksaan lain sedang berjalan. Tidak diubah atau dilewati.                                               |
| Regresi final Content/Operations/sekolah/portal | 64/64 lulus, 4 file                          | Uji ulang tanpa pemeriksaan berat bersamaan; termasuk kasus Content yang timeout dan semua tes Operations baru.                                                           |
| API Operations/authorization/Teacher credential | 26/26 lulus, 4 file                          | HTTP test harness dengan guard nyata; persistence/concurrency menggunakan PostgreSQL lokal. Identity provider memakai fixture.                                            |
| Browser Admin Operasional dan regresi subrole   | 24 skenario berbeda lulus                    | Termasuk recheck setelah locator tes diperbaiki. Provider/API fixture, tanpa mutasi Cloud; bukan satu klaim hasil CI.                                                     |
| Script guards                                   | 68/68 lulus                                  | Environment, QA provisioning, kontrak dan upload guards offline.                                                                                                          |
| Contract validation/types/freshness             | Lulus                                        | Delapan schema dikompilasi, generated types sesuai snapshot, export OpenAPI setelah build API menghasilkan hash yang sama. Tidak ada perubahan bentuk DTO atau migration. |
| ESLint repository dan format file berubah       | Lulus                                        | Tanpa warning lint. Tidak menggantikan code review independen.                                                                                                            |
| Typecheck/build API                             | Lulus                                        | `tsc --noEmit` dan Nest build.                                                                                                                                            |
| Runtime development read-only                   | Health 200; admin schools tanpa token 401    | Server pengguna port 3000/3001 tetap tersedia. Bukan bukti login/operasi Cloud terautentikasi.                                                                            |

Production build web juga lulus dengan output `.next-admin-content-ux`: kompilasi webpack, TypeScript dan 35 static pages selesai. Opsi locator tes yang tidak sah diperbaiki, kemudian 14/14 tes sekolah diuji ulang dan lulus. Server development pengguna tetap berjalan.

Fixture browser dan PostgreSQL lokal tidak menggantikan acceptance Development Cloud, Auth nyata, alur verifikasi Guru dengan layanan aktual, atau QA independen. Engineering issue yang ditemukan pada scope ini dapat diperbaiki tanpa keputusan akademik baru. Cluster PostgreSQL test dan server browser fixture dihentikan setelah tes; data Cloud tidak diubah.

## Reproduksi

```powershell
pnpm --filter @tka/web exec vitest run --maxWorkers=1
# TEST_DATABASE_URL menunjuk database test lokal, NODE_ENV=test;
# sslmode=disable hanya diizinkan untuk test loopback.
pnpm --filter @tka/api exec vitest run src/modules/admin/operations.integration.spec.ts src/modules/identity/admin-permissions.spec.ts src/modules/schools/teacher-flow.integration.spec.ts src/modules/schools/teacher-token.spec.ts --maxWorkers=1
$env:NUMORA_E2E_WEBPACK='true'
pnpm --filter @tka/web exec playwright test e2e/admin-operations.spec.ts e2e/admin.spec.ts --grep 'Operations|School lifecycle|Admin list/token errors|Unified Admin portal'
```

Lihat [batas acceptance full stack](ADMIN_FULL_STACK_STATUS.md) dan [desain Operations](../design/ADMIN_OPERATIONS_UX_2026-10-07.md). Pemeriksaan ini belum membuat commit/push atau deployment.
