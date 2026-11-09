# Generator service v2 — handoff tahap 3–5

**ENGINEERING DECISION**, implementasi lokal 8–9 November 2026. Dokumen ini disalin identik ke repo utama dan AI. Fitur baru **nonaktif secara default**; bukan persetujuan akademik atau instruksi deployment.

## Acuan dan kepemilikan

| Bagian                     | Acuan                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Mapping canonical          | PR utama #125, `docs/audits/2026-11-08-original-mapping/` di kedua repo                 |
| Arm, revisi dan assignment | PR utama #126, `docs/data/ASSESSMENT_ARMS_V2.md`, migrasi 0051                          |
| Stok/media                 | Migrasi utama 0052; seluruh DDL, fungsi, RLS, grants, dan jurnal hanya milik repo utama |
| Kontrak                    | Utama `packages/contracts/generator-service-v2/`; AI `contracts/generator-service-v2/`  |
| v1                         | Tetap didukung, jalur `/api/v1`; bentuk notification/output compute v3 tetap            |

Main memiliki approval, inventaris, reservasi, request/dispatch, adopsi artifact, receipt storage dan VARIANT DRAFT. AI hanya membaca input yang diekspos dan menulis artifact compute. Admin Content/Data/Moderation atau Super Admin diperlukan pada endpoint utama. Token antarlayanan dan koneksi masing-masing role disalurkan privat.

## Batas kelayakan produksi

**Pembaruan lokal 9 November 2026:** delapan pembahasan telah dipulihkan; satu tambahan pembahasan canonical dan sembilan penautan gambar disiapkan serta disimulasikan tanpa menulis database bersama. Dua perbedaan redaksi terbukti ekuivalen. Lihat [laporan pemulihan sumber](audits/2026-11-09-original-source-repair/README.md). Daftar berikut merekam kondisi audit awal 8 November; status canonical/approval produksi tidak otomatis berubah.

Audit memetakan **1.150 Drill + 30 Tryout = 1.180 ORIGINAL** melalui namespace impor dan external ID, bukan melalui susunan paket Tryout existing yang sudah berisi varian. Identitas/hash/versi cocok; ini tidak berarti semua original siap produksi.

- Delapan sumber lokal belum menyediakan pembahasan independen untuk perbandingan lengkap.
- Sembilan tautan gambar original Drill belum termaterialisasi.
- Delapan belas rubrik PG Tryout masih DRAFT; 30 original Tryout masih DRAFT.
- Context, config dan scoped approval produksi belum terdaftar.
- Owner acceptance, validasi teknis CONTENT_VALID, dan approval Curriculum merupakan bukti berbeda. Tidak ada approval Curriculum yang dibuat oleh implementasi ini.

Daftar per ID dan alasan lengkap ada di laporan audit. Tidak perlu impor ulang original yang sudah benar. Fixture READY/SEALED/approval pada pengujian hanya **TEST ONLY** di database disposable dan tidak boleh diekspor menjadi approval development.

## Kontrak dan alur

Aktifkan eksplisit `NUMORA_GENERATOR_ENABLED=true` dan `NUMORA_GENERATOR_V2_ENABLED=true` pada main/worker dan AI **hanya di lingkungan yang sudah siap**. Main memilih URL execute dari `generation_wave_items.constraints.serviceContract`, bukan katalog versi terbaru:

- `GET /api/v2/generators`: mode `NUMERIC` atau `CONCEPTUAL_STOCK`, source version/hash, profile renderer dan manifest stok bila relevan.
- `POST /api/v2/compute/execute`: notification tetap `{contractVersion:3, requestId, inputDigest, dispatchGeneration}`. Hanya ID dan digest, tanpa data peserta.
- Header `Authorization: Bearer <private service token>`; API AI tidak menerima sumber/config bebas dari pemanggil.
- `RUNNING` mengembalikan 202; terminal mengembalikan 200. Respons terminal FAILED/EXPIRED adalah hasil eksekusi yang tercatat, bukan izin mengundi ulang pada dispatch yang sama.
- Main memakai endpoint admin existing untuk prepare, preview, retry, save individual, export/validate/import paket. Save selalu **VARIANT DRAFT**, tidak publish atau mengalihkan routing siswa.

Contoh tersanitasi di `examples/`: notification, response, kandidat numerik, stok dan gambar. Hash contoh bukan bukti approval atau receipt yang dapat dipakai di database lain. Data URL preview hanya respons terotorisasi yang sementara; tidak disimpan sebagai lokasi media canonical.

## Registrasi dan stok

1. Jalankan kembali audit mapping dalam transaksi read-only. Selesaikan blocker sumber, rubrik dan approval melalui PIC yang sah.
2. Main mendaftarkan inventaris: manifest `{serviceContract:"generator-service-v2", items:[{familyId,parentQuestionVersionId,version,definition:{items:[{variantId,stockIndex,stockVersion,contentHash}]}}]}`. Gunakan manifest yang berasal dari stok VERIFIED lokal dengan canonical ID yang diaudit. Index berurutan mulai 1; stok saat ini 1–4 item per keluarga.
3. `node scripts/register-generator-stock.mjs <manifest.json>` adalah dry-run/read-only. `--apply` pada rangkaian pekerjaan ini hanya menerima loopback DB. Reapply identik mengembalikan ID sama; perubahan isi pada family/version yang sama ditolak. Script tidak membuat approval, rubrik atau konten.
4. Daftarkan config AI memakai `python -B -m numora_service.register <registration.json> --dry-run`; setelah ditinjau, `--apply --seal`. Schema `registration.schema.json` menentukan bentuk persis. NUMERIC memerlukan `configVersion`; stok memerlukan `stockSetId`, tanpa seed/config numerik palsu. Pin source/family/rubric/context/mediaProfile harus tepat. Seal hanya snapshot teknis, bukan approval main.
5. Persetujuan scoped main harus berasal dari proses approval yang sah dan memuat digest/context/ecosystem yang sama. Tanpa approval, katalog main tidak menawarkan mapping tersebut.

Main mengalokasikan stok di bawah row lock inventaris: request baru menaikkan ordinal, berputar menurut stockIndex, lalu `cycle` bertambah dan `reused=true` setelah siklus pertama. Idempotency replay dan retry transport mempertahankan reservasi yang sama. Event RESERVED/SUCCEEDED/FAILED/CANCELLED append-only dicatat atomik dari transisi yang sah; kegagalan tidak mengembalikan atau menghapus reservasi. Role runtime tidak dapat menulis langsung ledger palsu.

Config numerik dibaca dari versi lokal yang dipin setelah isi/hash dibandingkan dengan snapshot JSONB. Urutan variabel turunan diambil dari versi lokal tersebut karena JSONB tidak menjamin urutan object. Versi terbaru lokal tidak otomatis mengganti pin request.

## Media dan ketahanan

Renderer memakai hasil numerik yang sudah diterima; tidak melakukan draw kedua. Stok memakai varian terreservasi dan template/gambar yang dipin. AI menyegel bytes PNG, SHA-256, ukuran, dimensi dan provenance secara atomik bersama kandidat/output compute.

Main memeriksa artifact digest, source/config/stock pin, renderer/template, hash bytes PNG dan IHDR, placement/marker, rubric, scope, dispatch aktif dan approval sebelum adopsi. Media dimaterialisasi melalui pipeline reserve/upload/verify/receipt existing. Receipt VERIFIED dipakai ulang. Signed URL tidak dipersistenkan. Hubungan fingerprint kandidat dengan payload canonical dan receipt disimpan immutable. Seluruh upload paket selesai sebelum transaksi DRAFT; upload gagal tidak meninggalkan DRAFT parsial.

- Compute timeout **30 detik**, HTTP worker **45 detik**, heartbeat **15 detik**, lease **60 detik**.
- Gangguan transport: periksa execution durable dahulu; replay dispatch yang sama tidak mengundi ulang. Lease habis harus difencing, lalu retry membuat dispatch baru dengan input/seed/reservasi sama. Mengubah konten/config berarti request baru.
- Approval dicabut, stale dispatch, artifact/media berbeda, atau source pin berubah: tolak sebelum adopsi. Jangan mengatasi kegagalan dengan menaikkan approval atau mematikan trigger.

## Menjalankan AI

Windows tetap memakai profile existing `windows-amd64-cpython-3.11.3-pillow-12.1.0-v1`. Profile Linux eksplisit terpisah:

- `linux-amd64-cpython-3.11.14-pillow-12.1.0-v1`: runtime WSL yang diuji, zlib 1.3.1.
- `linux-amd64-bookworm-cpython-3.11.14-pillow-12.1.0-v1`: container Debian, zlib 1.2.13, base image dipin dengan SHA-256 pada Dockerfile.

`docker build --platform linux/amd64 -f Dockerfile.generator-v2 -t numora-generator-v2:<reviewed-version> .` menjalankan coverage numerik/stok dan replay gambar saat build. Dependency service dipin di `requirements-service.lock`; Pillow wheel dipin versi dan SHA-256 di `requirements-renderer-linux.lock`. Container berjalan sebagai UID non-root 65532. Berikan konfigurasi privat melalui environment saat menjalankan; flags bawaan tetap false. Jangan memasukkan `.env` ke image.

Untuk Windows: `python -B -m numora_service --host 127.0.0.1 --port 8770`, menggunakan environment compute role yang aman. `COMPUTE_DATABASE_URL`, `COMPUTE_SERVICE_PRINCIPAL_ID`, dan token minimal 32 karakter diperlukan. Koneksi non-loopback mewajibkan TLS verify-full. Profile tidak pernah diperbarui otomatis saat runtime berbeda; lakukan review profile baru dan pin ulang request/config melalui proses sah.

## Verifikasi dan rollback

Lihat `docs/audits/2026-11-08-generator-v2-verification.md` untuk hasil dan batas verifikasi. Harness utama `scripts/test-generator-local.py` membuat PostgreSQL loopback dan storage HTTP lokal; tidak menggunakan `.env` sebagai tujuan database bersama. `GENERATOR_V2_TEST=true` mengaktifkan fixture v2, `GENERATOR_V2_IDS` membatasi sampel, `GENERATOR_V2_BROWSER=true` menjalankan UI terhubung. Jalur default memeriksa v1 serta fault/role tests.

Terapkan migrasi forward berurutan setelah review PR bertumpuk; rangkaian ini **tidak menerapkan database bersama**. Rollback operasional: matikan flag v2 di producer/worker/AI, hentikan request baru, biarkan data immutable dan pin histori tetap ada. Jangan drop tabel, menulis ulang sesi/XP, mengubah migrasi lama, atau memindahkan request v2 ke v1. Perbaikan skema berikutnya harus berupa migrasi forward baru.
