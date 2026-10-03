# Panduan Struktur Folder Numora

Panduan utama untuk menentukan **di mana kode fitur dikerjakan** dalam monorepo Numora. Berlaku untuk Frontend, Backend, Database, QA, dan pekerjaan lintas tim. Dokumen ini menjelaskan penempatan kode; aturan produk tetap mengikuti PRD v0.5 dan [PRODUCT_CONTEXT](../product/PRODUCT_CONTEXT.md). Batas tanggung jawab modul mengikuti [MODULE_BOUNDARIES](../architecture/MODULE_BOUNDARIES.md), sedangkan pembagian orang dan reviewer mengikuti [OWNERSHIP](OWNERSHIP.md).

## 1. Status dan cara membaca

- **Sudah ada**: path ada dalam baseline Git saat panduan ini ditulis.
- **Dibuat saat dibutuhkan**: contoh struktur untuk fitur berikutnya; jangan membuat folder atau service kosong hanya agar pohon folder terlihat lengkap.
- Contoh nama fitur dan subfolder di bawah adalah **panduan penempatan engineering**, bukan keputusan produk baru atau tanda bahwa fiturnya sudah selesai. Jika sebuah modul perlu struktur berbeda, sepakati dengan reviewer yang terdampak dan perbarui panduan ini.
- Path dalam dokumen ini relatif terhadap akar repo. Jalankan perintah Git dan `pnpm` dari akar repo kecuali dokumen lain menyebut sebaliknya.

## 2. Peta repo saat ini

```text
Numora/
├── apps/
│   ├── web/                    Next.js: halaman, alur UI, akses API
│   │   └── src/
│   │       ├── app/                route, layout, dan global CSS (sudah ada)
│   │       ├── features/           modul UI per kemampuan (README sudah ada)
│   │       └── lib/api.ts          klien HTTP dasar (sudah ada)
│   ├── api/                    NestJS: REST, otorisasi, aturan domain, PvP gateway
│   │   └── src/
│   │       ├── health/             contoh modul berjalan (sudah ada)
│   │       └── modules/            modul bisnis per domain (README sudah ada)
│   └── worker/                 BullMQ: job dan jadwal; saat ini baru proses dasar
│       └── src/main.ts
├── packages/
│   ├── database/               Drizzle: schema, migrasi, seed, akses DB
│   │   └── src/schema/           identity.ts, classes.ts, operations.ts (sudah ada)
│   ├── contracts/              OpenAPI, skema soal, event, dan WebSocket
│   ├── ui/                     komponen UI bersama lintas fitur/role
│   ├── config/                 tempat konfigurasi bersama (masih kerangka)
│   └── testing/                tempat bantuan tes bersama (masih kerangka)
├── docs/                       konteks produk, desain, arsitektur, dan panduan kerja
├── .env.example                 contoh koneksi layanan cloud development
├── scripts/                     skrip repo, misalnya validasi kontrak
├── .github/                     CI, template PR, dan rencana CODEOWNERS
└── package.json                 perintah workspace
```

Pohon ini sengaja ringkas. Lihat [ARCHITECTURE](../architecture/ARCHITECTURE.md) dan [ADR-001](../adr/ADR-001-monorepo.md) untuk alasan pemisahan `apps/` dan `packages/`. File migrasi dalam `packages/database/drizzle/` harus dihasilkan dan di-commit bersama perubahan schema; jangan menganggap migrasi lokal yang belum di-commit sebagai baseline tim.

## 3. Cari tempat kerja berdasarkan tugas

| Tugas | Lokasi utama | Catatan |
|---|---|---|
| Halaman atau route Student, Teacher, Admin | `apps/web/src/app/` | Route menyusun halaman, memanggil modul fitur, dan menangani layout. Struktur URL final mengikuti kebutuhan produk. |
| UI dan state khusus fitur | `apps/web/src/features/<fitur>/` | Kelompokkan berdasarkan kemampuan, bukan berdasarkan nama anggota tim. |
| Klien HTTP lintas fitur | `apps/web/src/lib/api.ts` atau utilitas bersama yang tumbuh darinya | Gunakan API NestJS untuk data produk. Supabase browser hanya untuk kebutuhan auth yang diizinkan. |
| Komponen presentasi yang benar-benar dipakai lintas fitur | `packages/ui/src/` | Contoh yang sudah ada: `Button`. Ikuti [panduan desain](../design/README.md). |
| Endpoint, otorisasi, dan aturan backend | `apps/api/src/modules/<domain>/` | Controller menangani batas HTTP; service/domain menangani aturan. Lihat [MODULE_BOUNDARIES](../architecture/MODULE_BOUNDARIES.md). |
| WebSocket PvP | `apps/api/src/modules/pvp/` **dibuat saat fitur dikerjakan** | Gateway dan aturan match tetap di backend; lihat [REALTIME_PVP](../architecture/REALTIME_PVP.md). |
| Job terjadwal, antrean, outbox | `apps/worker/src/` | Tambahkan folder job per kemampuan saat ada job nyata; jangan memindahkan kebenaran bisnis tahan lama ke Redis. |
| Tabel, relasi, dan constraint DB | `packages/database/src/schema/` | Buat migrasi Drizzle di `packages/database/drizzle/`; ubah seed di `packages/database/src/seed.ts` jika perlu. |
| Kontrak REST | `packages/contracts/openapi/openapi.json` | Dihasilkan dari NestJS setelah controller/DTO berubah; jangan edit hasil generate sebagai sumber utama. |
| Kontrak soal, event, WebSocket | `packages/contracts/questions/`, `events/`, `websocket/` | Perbarui skema dan penjelasan di `docs/data/` atau `docs/api/` bersama perubahan kontrak. |
| Tes unit/integrasi satu modul | Dekat modul yang diuji, seperti `apps/api/src/health/health.controller.spec.ts` | Sesuaikan dengan tool dan [TEST_STRATEGY](../testing/TEST_STRATEGY.md). |
| Alur E2E lintas peran | Lokasi runner E2E **belum ditetapkan** | QA dan pemilik fitur menyepakati penempatan saat runner Playwright ditambahkan. Jangan menganggap `packages/testing` sudah menjadi suite E2E. |
| Konfigurasi environment dan CI | `.env.example`, `.github/`, `package.json` | Koordinasikan perubahan lintas tim; jangan commit rahasia. |

## 4. Struktur fitur Frontend

`apps/web/src/app/` berisi route dan komposisi layar. `apps/web/src/features/` berisi bagian UI, state, validasi, dan akses API yang khusus suatu kemampuan. `packages/ui/` berisi primitif presentasi yang sudah terbukti perlu dipakai ulang. Jangan menaruh aturan skor, unlock level, kepemilikan kelas, atau hasil PvP yang otoritatif di React.

Contoh **dibuat saat fitur dikerjakan**, bukan folder yang sudah tersedia:

```text
apps/web/src/
├── app/
│   ├── student/...              halaman Student
│   ├── teacher/...              halaman Teacher
│   └── admin/...                halaman Admin
├── features/
│   ├── onboarding/              login, status akun, verifikasi/join kelas
│   ├── core-learning/           katalog, Drill, hasil, dan progres Student
│   ├── pvp/                     lobby, room, match, reconnect UI
│   ├── leaderboard/             tampilan peringkat sesuai scope
│   ├── monitoring/              daftar kelas dan progres untuk Teacher
│   └── admin/                   sekolah/token dan administrasi konten
└── lib/
    └── api.ts                   transport HTTP dasar yang sudah ada
```

Nama di atas adalah pengelompokan awal yang selaras dengan [rencana CODEOWNERS](OWNERSHIP.md). Tim boleh memecah fitur besar ke subfitur seperti `core-learning/drill/` ketika kode nyata membutuhkannya. Nama folder tidak memberi izin akses: pembatasan Teacher, Student, dan Admin tetap diperiksa API. Komponen lintas fitur pindah ke `packages/ui` hanya ketika benar-benar digunakan bersama; komponen khusus Drill tetap dekat fitur Drill.

## 5. Struktur modul Backend

Backend adalah modular monolith. Gunakan satu folder per domain di `apps/api/src/modules/`, misalnya `identity`, `schools`, `classes`, `content`, `assessments`, `scoring`, `progress`, `pvp`, dan `monitoring`. Daftar tanggung jawab lengkap ada di [MODULE_BOUNDARIES](../architecture/MODULE_BOUNDARIES.md). Modul `admin` mengatur use case Admin; aturan penerbitan token tetap dimiliki `schools`, dan aturan konten tetap dimiliki `content`.

Contoh bentuk **satu modul saat diimplementasikan**:

```text
apps/api/src/modules/assessments/
├── assessments.module.ts
├── assessments.controller.ts     batas HTTP dan DTO
├── assessments.service.ts        alur aplikasi/domain
├── dto/                          input/output HTTP bila diperlukan
├── repositories/                 akses persistence bila diperlukan
└── *.spec.ts                     tes aturan dan endpoint terkait
```

Ini contoh penempatan, bukan kewajiban membuat semua subfolder. Pilih nama sesuai konvensi NestJS yang telah ada. Letakkan validasi input dan otorisasi pada batas API/WebSocket; perubahan skor, progres, XP, serta idempotensi diputuskan dan disimpan oleh backend. Modul lain mengakses antarmuka layanan modul pemilik, bukan tabel atau repository internalnya secara sembarang. Lihat [API_GUIDELINES](../api/API_GUIDELINES.md), [AUTHORIZATION](../api/AUTHORIZATION.md), dan [IDEMPOTENCY](../api/IDEMPOTENCY.md).

## 6. Pekerjaan lintas lapisan: contoh nyata

| Alur | Frontend | API/domain | Database/kontrak/tes |
|---|---|---|---|
| Student mengerjakan Drill | `features/core-learning/` dan route Student | `content`, `assessments`, `scoring`, `progress` | Schema versi soal/attempt/progres; OpenAPI; tes 7/10 dan 8/10, submit ganda, otorisasi. |
| Guru membuat kelas dan melihat progres | `features/onboarding/` untuk verifikasi, `features/monitoring/` untuk daftar/detail | `schools`, `classes`, `monitoring` | Schema token/kelas; OpenAPI; tes token sekali pakai dan akses hanya kelas milik Guru. |
| Admin mengelola sekolah/token | `features/admin/` dan route Admin | `admin` mengorkestrasi `schools` | Schema dan audit; OpenAPI; tes hak akses dan pencabutan token. |
| Student bermain PvP | `features/pvp/` dan route Student | `pvp` untuk gateway, waktu, jawaban, skor; modul terkait untuk konten/XP | Kontrak `websocket/`; penyimpanan hasil tahan lama; tes reconnect, scoring, dan forfeit. |

Contoh ini menunjukkan **pemilik lokasi kode**, bukan daftar fitur yang sudah selesai atau perubahan scope uji coba pertama. Scope prototipe saat ini ada di [SPRINT_2_GOAL](SPRINT_2_GOAL.md); kebijakan produk yang masih terbuka ada di [OPEN_DECISIONS](../product/OPEN_DECISIONS.md).

## 7. Sebelum menambah folder atau mengirim PR

1. Temukan modul/komponen yang sudah ada; perluas jika tanggung jawabnya sama.
2. Tentukan pemilik aturan bisnis menurut [MODULE_BOUNDARIES](../architecture/MODULE_BOUNDARIES.md), lalu pilih path dari tabel di atas.
3. Jika melintasi FE, BE, Database, kontrak, atau QA, koordinasikan perubahan dan reviewer menurut [OWNERSHIP](OWNERSHIP.md).
4. Untuk perubahan API, perbarui NestJS controller/DTO dan hasil OpenAPI; untuk schema DB, sertakan migrasi; untuk UI, tangani state relevan dan rujuk panduan desain. Ikuti [GIT_WORKFLOW](GIT_WORKFLOW.md).
5. Tambahkan tes yang memeriksa aturan penting. Jangan membuat folder/test kosong atau menduplikasi tipe API hanya demi mengikuti contoh pohon.
6. Jika penempatan baru menjadi pola tim, perbarui dokumen ini dan tautan terkait dalam PR yang sama.

Panduan ini tidak menutup keputusan PRD yang masih **OPEN**. Gunakan fixture demo yang jelas atau struktur yang mudah diperluas ketika perilaku final belum disepakati.

## Core Learning source update — 2 Oktober 2026

Lokasi kode tetap mengikuti tabel di atas. [Drill v1.2 / TryOut v1.1](../product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md) mengubah requirement, bukan struktur folder: TryOut gratis semua siswa, 35 soal/tiga format, countdown/auto-submit/IRT release; Drill XP/stars/retensi/session policy TBC. Tempatkan perubahan eligibility di backend, kontrak PGK di shared/generated contract, finalisasi di service asesmen/worker, dan visual/state di `features/core-learning`. Admin CRUD yang ada merupakan pekerjaan operasional terpisah dari scope PRD fitur siswa.

## Shared assessment finalization - JOB-09, 3 October 2026

**ENGINEERING DECISION:** `packages/assessment-engine/` is a server-only workspace used by NestJS and the worker for the same transactional TryOut finalizer and PG content decoder. HTTP identity/ownership errors remain in API services; scheduling stays in the worker. Do not import this package into the browser: it accesses PostgreSQL and private answer keys. API and worker builds depend on this workspace. Build database, then assessment-engine before running either app directly.
