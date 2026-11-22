# Varian Drill melalui Generator Admin

**ENGINEERING DECISION — implementasi handoff.** Jalur **Varian Drill** memakai komposisi beta yang disetujui pada [konteks AI/IRT v2](../AI_IRT_V2_CONTEXT.md). Main menyimpan manifest dan konten canonical. AI menjalankan komputasi melalui [generator-service-v2](../GENERATOR_SERVICE_V2_HANDOFF.md).

## Prasyarat dan alur

1. Operator menyiapkan context `DRILL/LEVEL` dan kedua arm melalui fondasi [Assessment Arms](../data/ASSESSMENT_ARMS_V2.md). Paket sumber harus merupakan revisi current arm original. Blueprint SEALED yang disetujui Curriculum menetapkan tiga versi anchor dan roster family. Paket manual tanpa pin ini tampil dengan blocker.
2. Admin Content/Data/Moderation atau Super Admin membuka **Varian Drill** di `/admin/content/generator`, memilih sumber, lalu menetapkan peran tiap versi. Catalog menampilkan blocker paket dan soal. Tujuh focal masing-masing memerlukan tepat satu mapping config v2 SEALED dengan approval scope dan digest yang cocok.
3. Main menyimpan satu group dan satu wave berisi tujuh request. Manifest mengikuti urutan paket original. Request mengikat hash konten, family, parent, rubrik, policy, approval, dan profil runtime. Numerik memakai seed yang dibuat Main. Stok memakai reservasi immutable. Retry transport mempertahankan input dan reservasi.
4. AI memeriksa manifest dan roster melalui proyeksi compute terbatas. Executor membandingkan dua hasil dari input terpin, termasuk bytes gambar jika ada. Main memeriksa execution, digest, provenance, dan candidate sebelum menampilkan preview. Perintah pembatalan tersedia sebelum impor dan mempertahankan artifact yang sudah tersimpan.
5. Admin meninjau sepuluh soal di **Preview & impor**. Main memverifikasi receipt media, lalu mengimpor tujuh focal dan mereferensikan tiga versi anchor identik dalam satu transaksi DRAFT. Impor paralel dengan payload identik mengembalikan paket yang sama. Koreksi komposisi memerlukan generation baru.
6. Buka detail paket untuk mencatat review per versi dan persetujuan Curriculum, lalu lakukan Publish eksplisit. Approval mengikat paket, context, revisi context, review digest dan generation manifest. Publikasi membuat revisi immutable pada arm varian. Aktivasi distribusi memerlukan keputusan terpisah melalui alur arm yang sudah ada.

## Konfigurasi lokal

- Terapkan migrasi Main sampai `0080_drill_variant_generation` dengan migrator canonical.
- Gunakan revisi Main dan AI yang menyertakan schema `drill-variant-manifest.schema.json` yang sama.
- Pada API, worker dan AI set `NODE_ENV=development` atau `test`, `NUMORA_GENERATOR_ENABLED=true`, `NUMORA_GENERATOR_V2_ENABLED=true`, dan `NUMORA_DRILL_VARIANT_GENERATION_ENABLED=true`. Flag Drill default `false`.
- Pada AI, set `NUMORA_DRILL_VARIANT_RUNTIME_PROFILE` dan `NUMORA_DRILL_VARIANT_IMAGE_DIGEST` dari build yang direview. Registry renderer tetap memverifikasi profile yang dipin untuk konten bergambar.
- Gunakan koneksi compute dan Main dengan role terpisah serta storage media yang mendukung receipt. `NODE_ENV=production` dan `NUMORA_IRT_MODE=PRODUCTION` menahan pembuatan dan dispatch khusus Drill.

## Pengujian dan rollback

Harness `scripts/test-generator-local.py` menjalankan migrasi, fixture TEST ONLY, Python service, Main dan storage HTTP di localhost. Gunakan environment Python yang cocok dengan renderer yang dipin AI. Atur `NUMORA_AI_SERVICE_PATH` dan `PYTHONPATH` ke checkout AI yang ditinjau, `GENERATOR_V2_TEST=true`, `GENERATOR_DRILL_VARIANT_TEST=true` serta `GENERATOR_V2_IDS=pg-16-1-3,pg-16-1-4,pg-16-1-5,pg-16-2-1,pg-16-2-2,pg-16-2-3,pg-16-2-4,pg-16-2-5,pg-16-3-1,pg-16-4-2`.

Matikan flag pada API, worker, dan AI untuk menahan generation baru dan dispatch. Gunakan **Batalkan generation** untuk group yang belum diimpor. Untuk revisi yang operator aktifkan, ikuti [rollback arm Drill](../data/ASSESSMENT_ARMS_V2.md#pilot-routing-drill). Pertahankan request, artifact, paket, delivery pin, attempt dan histori.

**OPEN — Curriculum/Data.** Persetujuan dan mapping bank target, rollout LEVEL, kriteria linking serta ambang statistik tetap mengikuti register keputusan. IRT Drill tetap `RESEARCH_ONLY`. Fixture lokal tidak memberikan approval akademik atau izin aktivasi.

## Perubahan untuk review

| Path | Perubahan dan alasan |
| --- | --- |
| `apps/api/src/modules/content/drill-variant-sources.ts` | Menyusun katalog, memeriksa level, roster, rubrik dan mapping, lalu membentuk manifest dari sumber terverifikasi. |
| `apps/api/src/modules/content/generator-packages.service.ts` | Membuat group/wave idempoten, menggabungkan anchor dan focal pada preview, membatalkan request, serta mengimpor DRAFT secara atomik. |
| `apps/api/src/modules/content/generator-packages.controller.ts` | Menambahkan katalog Drill dan pembatalan melalui Content Admin guard. |
| `apps/api/src/modules/content/generator-packages.dto.ts` | Menambahkan field roster, preflight, manifest, lineage dan status pembatalan. |
| `apps/api/src/modules/content/content-packages.service.ts` | Menggunakan review dan persetujuan Curriculum existing untuk publikasi revisi arm. |
| `apps/api/src/modules/content/drill-packages.service.ts` | Mengarahkan paket generator ke publikasi dengan review agar publisher manual tetap berlaku untuk paket manual. |
| `apps/web/src/features/admin/drill-generator.tsx` | Menyediakan dialog pemilihan paket dan peran serta panel lineage. |
| `apps/web/src/features/admin/generator-packages.tsx` | Menautkan dialog ke riwayat, progress, pembatalan, dan preview berurutan. |
| `apps/web/src/features/admin/generator-import-workflow.tsx` | Menghitung anchor pada preview dan menautkan review/approval paket. |
| `apps/web/src/features/admin/generator-package-api.ts` | Menambahkan pemanggilan API katalog Drill dan pembatalan. |
| `apps/web/src/app/admin-generator.css` | Menjaga roster, ID dan digest terbaca pada viewport sempit. |
| `packages/database/drizzle/0080_drill_variant_generation.sql` | Menambah pin manifest serta import digest, unique index paket hasil, guard immutable, dan view compute read-only. Constraint sumber mempertahankan jejak Tryout historis dari sebelum 0076. |
| `packages/database/drizzle/meta/_journal.json` | Mendaftarkan migrasi forward 0080. |
| `packages/database/src/schema/generator-packages.ts` | Menyelaraskan schema Drizzle dengan pin kolom, constraint dan index. |
| `packages/database/src/schema/assessments.ts` | Mengetikkan scope approval Curriculum paket generator. |
| `packages/irt-orchestration/src/generator.ts` | Menggunakan wave bersama dan memvalidasi provenance, deadline lease, retry, serta batas impor individual. |
| `packages/irt-orchestration/src/generator-transport.ts` | Menahan dispatch khusus Drill saat flag mati atau runtime produksi. |
| `packages/contracts/generator-service-v2/drill-variant-manifest.schema.json` | Menetapkan manifest wave Drill pada kontrak generator v2 existing. |
| `packages/contracts/generator-service-v2/contract.test.mjs` | Memeriksa schema, 3/7 dan envelope notifikasi yang tetap kompatibel. |
| `packages/contracts/package.json` | Menjalankan tes generator v2 dalam suite kontrak monorepo. |
| `packages/contracts/openapi/openapi.json` | Merekam katalog, payload dan status API yang ditambahkan. |
| `scripts/generate-learning-types.mjs` | Mendaftarkan DTO Drill untuk code generation frontend. |
| `apps/web/src/features/admin/generated-types.ts` | Menyediakan tipe DTO hasil OpenAPI untuk frontend Admin. |
| `apps/api/scripts/test-drill-variant-admin.mjs` | Menguji integrasi Main, compute, storage dan approval di disposable PostgreSQL. |
| `apps/api/scripts/test-generator-v2.mjs` | Menyediakan batas concurrency harness untuk retest regresi di mesin lokal. |
| `apps/web/e2e/admin-generator-ux.spec.ts` | Menguji blocker, pemilihan eksplisit 3/7, idempotency key dan dialog layar sempit. |
| `scripts/generator-v2-local-fixture.py` | Membangun original, arm, blueprint dan approval TEST ONLY untuk acceptance. |
| `scripts/test-generator-local.py` | Menjalankan harness Drill dengan AI Service dan storage loopback. |
| `scripts/test-assessment-arms.py` | Memeriksa upgrade riwayat generator Tryout yang mendahului source pin. |
| `.env.example` | Mendokumentasikan feature flag default false. |
| `docs/product/OPEN_DECISIONS.md` | Mencatat dependency akademik dan rollout. |
| `docs/product/PRD_MAPPING.md` | Menautkan implementasi ke keputusan 3/7 dan approval. |

| Path di worktree AI | Perubahan dan alasan |
| --- | --- |
| `numora_service/drill_variant.py` | Memeriksa schema, runtime, digest, roster, scope dan provenance. |
| `numora_service/api.py` | Menyertakan pin runtime Drill pada katalog v2 saat flag aktif. |
| `numora_service/executor.py` | Membandingkan hasil komputasi berulang dan menambahkan bukti replay. |
| `numora_service/v2_repository.py` | Membaca pin sumber Main dan memvalidasinya saat claim serta persist. Mendukung scope package Tryout yang sudah tersedia di Main. |
| `numora_service/v2_register.py` | Menerima scope package Tryout yang sudah tersedia di Main. |
| `service.env.example` | Mendokumentasikan flag dan pin runtime/image AI. |
| `contracts/generator-service-v2/drill-variant-manifest.schema.json` | Mencocokkan schema dengan Main. |
| `tests/service/test_v2.py` | Mendukung pemeriksaan paritas kontrak dari lokasi worktree. |

## Bukti acceptance lokal

Bukti acceptance merekam basis Main `1c4171acab3fdb8acee42cf9b36d0a373164344d`, hasil fast-forward dari `feat/teacher-ui-alignment` pada `324eeec0a66a048755882f4ba6d6997cfa78be1b`. Backup lokal bernama `backup/drill-variant-admin-324eeec0`. Basis AI saat acceptance adalah `1b83126222a88aaabb9ee1229a921a76b4c5feb4` dari cabang v2 acceptance. Pengujian tersebut dijalankan pada perubahan implementasi di kedua worktree sebelum pembuatan PR.

| Verifikasi | Status | Bukti |
| --- | --- | --- |
| `python -B scripts/test-generator-local.py`, mode Drill | PASS | Satu group/wave, tujuh output nyata, tiga anchor identik, replay, stale dispatch, retry, kegagalan storage tanpa impor parsial, receipt terverifikasi, impor paralel, review, approval, publish terpisah dari aktivasi, pembatalan, revokasi dan Content Admin guard. |
| `python -B scripts/test-generator-local.py`, mode Tryout | PASS | 30 original dan 5 kandidat bermedia, satu paket hasil, histori attempt dan XP dibandingkan. |
| `python -B scripts/test-assessment-arms-local.py` | PASS | 12 tes guard, fresh install dan upgrade dengan histori. |
| `node --test packages/contracts/generator-service-v2/contract.test.mjs` | PASS | 7 tes kontrak. |
| `pnpm --filter @tka/contracts test` | PASS | 122 tes IRT dan generator v2, termasuk hasil Drill INSUFFICIENT tanpa estimasi palsu. |
| `python -B -m pytest -q tests/service/test_v2.py` pada AI | PASS | 4 tes dan 1.180 subtes generator v2 dengan CPython 3.11.3 dan Pillow 12.1.0. |
| `python -B -m pytest -q tests/service/test_irt_outcomes.py tests/service/test_irt_producer.py tests/service/test_irt_transport.py` pada AI | PASS | 18 tes dan 2 subtes untuk outcome, guard producer dan paritas kontrak. |
| `pnpm test:checks` | PASS | 96 tes. |
| `pnpm test` | PASS | 14 tugas dengan `VITEST_MAX_WORKERS=1`. Suite Web lulus 555 tes. Integrasi yang perlu koneksi fixture tidak diaktifkan pada command ini dan diuji dengan harness disposable terkait. |
| `NUMORA_E2E_PRODUCTION=true pnpm --filter @tka/web test:e2e admin-generator-ux.spec.ts` | PASS | 18 tes Chromium pada build Next.js lokal dengan fixture HTTP. Mencakup roster Drill di 320 dan 390 px, Generic, Tryout, dan penolakan akses. |
| `pnpm lint`, `git diff --check` | PASS | Pemeriksaan Main, serta whitespace check worktree AI. |
| `pnpm typecheck` | PASS | 14 tugas Turbo. |
| `pnpm build --concurrency=1` | PASS | 10 tugas Turbo dengan batas heap Node 4 GiB. |
| Paket, approval aktual dan storage lingkungan tujuan | BLOCKED | Memerlukan roster, mapping dan approval resmi, serta deploy kedua revisi yang ditinjau. |
| Routing siswa baru dan IRT produksi | BLOCKED | Memerlukan izin aktivasi dan bukti riset dalam keputusan v2. |
| Browser terhubung langsung ke grup Drill dalam disposable DB | NOT_RUN | Uji UI memakai fixture HTTP. Integrasi Main–AI–DB dan Content Admin guard diuji terpisah dengan harness terhubung. |
| Restart proses selama komputasi dan penerimaan R2 cloud | NOT_RUN | Uji lokal mencakup ACK replay, lease kedaluwarsa, stale dispatch, pembatalan dan transport S3 lokal. |
| `python -m pytest -q tests/service -k 'not live'` pada runtime bawaan | FAIL | Run awal memakai CPython 3.14/Pillow 12.2 dan gagal pada renderer, verifikasi image/profile IRT, serta asumsi path repo. Suite generator v2 kemudian lulus pada runtime renderer terpin. Image IRT Linux tetap di luar acceptance lokal ini. |

Run TEST ONLY menyimpan paket original versi 1 `af33d859-f976-413c-8c28-4619b3e85a41`, context LEVEL revisi 1 `0765bdd7-5e6d-4aec-937d-57a6316d3d78`, group `33e6b1f0-3c1f-44e4-b662-878612e02705`, dan paket canonical `23f5c6ce-2328-4ddb-9500-482995c51852`. Manifest SHA-256 `c0abd9211278c5b46628dba791dcc00b4d0f47d0341324e81c2daf49ca1c63b3`. Output JSON harness memuat ID request, reviewer, digests, seed dan receipt.

| Kriteria handoff | Status lokal | Bukti |
| --- | --- | --- |
| 1. Memilih original yang valid | PASS | Katalog lokal mengembalikan paket terbit, context dan sepuluh versi eligible. |
| 2. Melihat dan menetapkan 3 anchor dan 7 focal | PASS | Pemilihan eksplisit melalui dialog, roster yang salah ditolak API. |
| 3. Preflight paket, context, mapping, config, rubric dan approval | PASS | Fixture valid diterima, pin berubah dan approval dicabut ditolak. |
| 4. Satu tindakan Generate Variant | PASS | UI mengirim satu POST dengan idempotency key. |
| 5. Satu generation group | PASS | Dua permintaan paralel mengembalikan satu ID group dan satu wave. |
| 6. Tujuh request dapat dipantau | PASS | Detail menampilkan peran tiap item dan progress request sampai 7/7. |
| 7. Versi tiga anchor identik | PASS | ID pada manifest, preview dan revisi canonical sama. |
| 8. Tujuh focal dari AI dengan provenance | PASS | Python menghasilkan numerik dan stok bergambar dengan pin deterministik. |
| 9. Main memvalidasi candidate dan artifact | PASS | Artifact sah diterima, dispatch lama, input berubah dan approval yang dicabut ditolak. |
| 10. Preview berisi 10 item berurutan | PASS | Export dan validasi memeriksa 7 focal dan 3 anchor sesuai urutan sumber. |
| 11. Impor menghasilkan satu DRAFT | PASS | Retry dan impor paralel mengembalikan paket yang sama. Kegagalan storage tidak meninggalkan impor parsial. |
| 12. Paket original dipertahankan | PASS | Snapshot lengkap original sama sebelum dan sesudah. |
| 13. Lineage tiap item | PASS | Versi, reviewer, review reference, manifest, artifact dan receipt tersedia pada bukti acceptance. |
| 14. Approval Curriculum sebagai prasyarat | PASS | Publish ditolak sebelum review dan approval yang sah. |
| 15. Publish eksplisit | PASS | Impor menyimpan DRAFT. Publish membuat revisi arm, dengan distribusi ditahan sampai aktivasi terpisah. |
| 16. Regresi Generic dan Tryout | PASS | Harness Tryout menguji 30 original dan 5 media. Guard distribusi lama dan tes generator browser menjadi verifikasi tambahan. |
| 17. Pengujian relevan dan blocker | PASS | Cakupan dan batas acceptance dicatat pada tabel verifikasi. |
| 18. Dokumentasi dan evidence handoff | PASS | Panduan ini dan output acceptance bertanda TEST ONLY tersedia di workspace. |
