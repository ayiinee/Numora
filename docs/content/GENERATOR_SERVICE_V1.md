# Generator service v1 — integrasi pusat

**ENGINEERING DECISION — implementasi handoff 7 Oktober 2026:** alur `/admin/content/generator` memilih ORIGINAL yang sudah mapped dan disetujui, menyiapkan satu kandidat melalui compute v3, menampilkan preview tanpa assessment, lalu mengimpor VARIANT DRAFT hanya setelah klik Simpan draft. Ini tidak memberi status READY, persetujuan akademik, distribusi paket, atau hasil IRT.

Sumber service: commit `3a0f21eb8b59f45f836efc74b2ef985c31bdb188` dan handoff sesudahnya `99e8e7f` di repo `numora-ai-service`. Salinan kontrak/fingerprint berada di `packages/contracts/generator-service-v1`. Cakupan teks PG, MCMA, KATEGORI termasuk kategori custom dan LaTeX; media aktif di luar v1.

## Batas kepemilikan dan transaksi

Main membaca compute dengan login anggota `numora_main_runtime` yang bukan owner/superuser. Compute menggunakan login anggota `numora_irt_runtime`; tidak mendapat write canonical. Mapping memakai config SEALED yang diregistrasi CLI service dan `public.configuration_approvals` milik main. Catalog mencocokkan availability service, source fingerprint, original version, config digest, rubric, context dan approval yang belum revoked. UI tidak meminta hash/UUID.

Prepare mengunci idempotency actor/key, memin original/config/rubric/context/wave dan seed server (1–1.000.000.000), target satu, max regeneration nol. Request, item, outbox, dispatch dan audit ditulis atomik sebelum HTTP 202. Retry membuat dispatch baru hanya sesudah FAILED/EXPIRED, mempertahankan input dan seed.

Worker tetap memakai Redis untuk CALIBRATE_TRYOUT. GENERATE_VARIANTS memakai HTTP Bearer server dengan timeout 45 detik. Notifikasi hanya `contractVersion`, `requestId`, `inputDigest`, `dispatchGeneration`. Setelah kegagalan HTTP ambigu, worker membaca execution durable sebelum menjadwalkan pengiriman ulang. Lease/fencing dan status compute tetap milik service.

Preview membaca current SUCCEEDED execution dan artifact SEALED sequence 1 CONTENT_VALID, tepat satu declared candidate, validasi schema/renderer, digest, provenance, lineage, rubric serta compact fingerprint. Preview tidak menerima execution atau membuat attempt/XP/exposure/evidence. Save mengulang validasi dan approval dalam transaksi, menerima execution, mengunci request/keluarga, menduplikasi berdasarkan fingerprint per keluarga, membuat VARIANT beserta DRAFT dan candidate_imports. Payload kandidat dipertahankan persis; digest PostgreSQL `jsonb::text` berbeda dari compact fingerprint. Save ulang mengembalikan UUID yang sama. Revisi canonical berikutnya tetap membuat versi baru dengan parent/rubric pins.

Migrasi forward `0037_generator_service_v1.sql` memperluas dispatch guard untuk GENERATE_VARIANTS dan subrole Content Admin dengan mempertahankan sequence/retry/fencing. Tidak mengubah 0018 atau menonaktifkan trigger. Index candidate_imports version menjadi nonunique agar dua kandidat identik dapat menunjuk versi canonical yang sama; unique candidate tetap berlaku.

## Activation staging

Default `NUMORA_GENERATOR_ENABLED=false`. Jangan mengaktifkan sebelum:

- Migrasi 0037 diterapkan melalui workflow migrasi pusat dan runtime role grants diverifikasi.
- Service checkout handoff dijalankan dengan compute login terbatas, principal aktif, database yang sama, serta token khusus server minimal 32 karakter.
- Curriculum menyerahkan original, rubric/context dan mapping yang disetujui. Registrasi config dilakukan CLI service. Main approval memakai `apps/api/scripts/approve-generator-mapping.mjs reviewed-manifest.json` (dry-run); `--apply` hanya setelah manifest direview.
- Manifest memuat `serviceContract: generator-service-v1`, `actorId`, `reviewReference`, dan `items` dengan `configId`, `originalQuestionVersionId`, `contextId`, `rubricVersionId`, `digest`. Pin wajib cocok dengan DB; tidak gunakan fixture tes untuk approval akademik.
- API/worker diberi `NUMORA_GENERATOR_URL` HTTPS dan `NUMORA_GENERATOR_TOKEN` server-only; service diberi token yang sama. `/health/ready` dan `/api/v1/generators` berhasil dengan Bearer.
- QA memverifikasi Super Admin/Content Data Moderation, larangan Operations/null/Student/Teacher, preview dan Save DRAFT. Setelah prasyarat lengkap, flag API/worker dan service baru diaktifkan secara terkoordinasi.

**OPEN — dependency akademik:** mapping/rubric/context produksi dan ekuivalensi akademik tetap tanggung jawab Curriculum/Data. CONTENT_VALID tidak menyelesaikan dependency tersebut. Tidak ada activation atau perubahan database shared dalam implementasi lokal ini.

## Demo interaktif lokal

Untuk mencoba langsung tanpa activation shared, gunakan build yang sudah tersedia:

```powershell
$env:GENERATOR_DEMO='true'
& D:/Dev/numora-ai-service/.venv/Scripts/python.exe -B scripts/test-generator-local.py
```

Mode ini menjalankan service/database disposable, API dan worker generator, menyediakan link login otomatis Super Admin TEST ONLY dan menampilkan banner demo. Tidak menjalankan suite tes atau membuat approval produksi. URL loopback tercetak sebagai `DEMO_READY`. Buka link DEMO_READY untuk masuk; hentikan proses demo dengan Ctrl+C untuk membersihkan cluster. Aplikasi utama dan akun Super Admin produksi tidak diubah.

Untuk akun QA asli yang diminta pemilik, tambahkan `$env:GENERATOR_REAL_QA_EMAIL='numora-qa-adminsuper@example.invalid'`. Launcher hanya membaca identity akun Super Admin aktif dari database aplikasi dan menyalinnya ke database demo lokal. Login memakai Supabase Auth asli/publishable key, bukan token sintetis; password dan role shared tidak diubah. Link mengarah ke login dengan email terisi dan setelah autentikasi menuju generator. Data soal/approval tetap TEST ONLY; ini bukan activation generator produksi.

Tambahkan `$env:GENERATOR_DEMO_WEB_PORT='3000'` untuk memakai origin aplikasi utama dan sesi login yang sama. Hentikan proses web lama yang memakai port 3000 terlebih dahulu. Backend generator tetap terisolasi; setting port ini tidak memindahkan approval atau DRAFT demo ke database shared.

Dalam mode demo di origin utama, client hanya mengarahkan path `admin/content/generator` ke API demo. Identity, upload Excel dan modul lain tetap memakai `NEXT_PUBLIC_MAIN_API_URL` (default `http://localhost:3001/api/v1`). Ini mencegah API demo yang terbatas menggantikan endpoint aplikasi utama.

## Verifikasi otomatis lokal

Build database, assessment-engine, irt-orchestration dan API terlebih dahulu. Dengan venv service dan PostgreSQL embedded lokal tersedia, jalankan:

```powershell
& D:/Dev/numora-ai-service/.venv/Scripts/python.exe -B scripts/test-generator-local.py
```

Harness membuat cluster/database disposable loopback dengan restricted main/compute logins, menerapkan migrasi pusat, menjalankan Python service nyata, auth/API Nest nyata, worker transport, dan browser Admin. Semua data akademik/auth adalah TEST ONLY. Cluster dihentikan dan dihapus setelah pengujian. `NUMORA_AI_SERVICE_PATH` dapat mengganti lokasi repo service; `GENERATOR_SKIP_BROWSER=true` hanya untuk diagnosis backend dan bukan bukti UI selesai.

Kasus meliputi tiga format, auth/subrole, parallel prepare/save, konflik idempotency, replay/digest, expired lease/retry, tampering/rubric/lineage/artifact, duplicate content, rollback acceptance/import, lost response dan timeout 45 detik, revoke approval, serta count assessment/XP/exposure/IRT tidak berubah. Lost response disimulasikan setelah service selesai; crash disimulasikan lewat abandoned lease, bukan penghentian proses di titik instruksi tertentu. Regresi service memakai fixture pusat dengan guard migrasi asli, menggantikan setup guard TEST ONLY lama.

## Package workflow — owner request 7 October 2026

**PRD RULE:** package sizes remain Drill 10, Pretest 20 and Tryout 30. Existing package scope and question-family uniqueness rules remain authoritative.

**ENGINEERING DECISION:** the central API groups one durable generator-service-v1 request per approved source family in an atomic package request. Sources must already have the matching question usage; Drill sources share a level, Pretest sources share a chapter. Generation does not publish questions or create canonical DRAFT content. The results screen exposes progress, retry, read-only previews and a downloadable `numora-generator-package-v1` JSON envelope.

The JSON importer checks the envelope against sealed candidates, current approved mappings and exact content digests, then reuses structural and package-placement validation from question import. Successful import transactionally creates VARIANT DRAFT versions and one DRAFT package, preserving ORIGINAL lineage and rubric pins. Concurrent/repeated imports return the same package. Altered JSON is rejected; subsequent editorial changes require the established versioning workflow.

Routes: `/admin/content/generator`, `/admin/content/generator/results`, `/admin/content/imports/json`. Schema migration: `0038_generator_packages.sql` (same canonical migration stream).

**OPEN:** approved Curriculum sources remain required; insufficient mapped source families disable generation. Local package demonstration uses explicit TEST ONLY synthetic fixtures on isolated PostgreSQL, while the same Super Admin account authenticates through the existing Supabase identity. No synthetic approvals are inserted into the shared database.

### Unified workflow (latest owner request)

**ENGINEERING DECISION:** Generator paket and Hasil generator now share one workspace/menu. The generator keeps its durable package ID and polls progress in place; READY results automatically open `/admin/content/imports?generatorPackage=<id>` at step 2, Preview & tujuan. The import route reuses the shared import stepper and question preview. Steps 3 and 4 validate sealed candidates, save the idempotent VARIANT DRAFT package and show the existing package readiness/publication checks. Downloading JSON remains optional in preview. Generated content/usage retain their original pins; publication still delegates to `ContentPackagesService` with the existing authorization and review requirements. Earlier standalone results URLs redirect to the merged generator workspace.

**ENGINEERING VERIFICATION:** connected desktop/mobile test passed automatic generator → import step 2 → validation step 3 → DRAFT/readiness step 4 → reload restores preview. Eighteen upload/preview/routing regression tests, web typecheck, scoped lint, API compilation and generated OpenAPI types check passed. A subsequent browser repeat after the route-prop cleanup hit Windows memory exhaustion while launching Chromium; the final route adapter passed typecheck and the existing upload regression suite. The localhost service was restored after running checks serially; existing demo data and the real QA identity were preserved.
