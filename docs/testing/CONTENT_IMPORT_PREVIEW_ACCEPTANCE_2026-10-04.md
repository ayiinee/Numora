# Bukti fondasi importer/preview - 4 Oktober 2026

**ENGINEERING IMPLEMENTATION:** [PR #65](https://github.com/ayiinee/Numora/pull/65) menyediakan importer DRAFT dan preview PG/MCMA/Category tanpa scoring. **Acceptance sandbox penuh belum selesai**: credential R2 yang dibatasi ke bucket masih diperlukan. Dokumen ini mempertahankan perbedaan implementasi, pengujian dan rollout.

## Engineering

| Pemeriksaan                         | Bukti                                                                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suite lokal PostgreSQL/Redis        | Database 23, orchestration 2, API 134, worker 15, web 159: 333 tes lulus tanpa skip pada suite lengkap awal                                                                                           |
| Tambahan regresi setelah suite awal | R2 8/8; importer/preview PostgreSQL 15/15, termasuk perubahan tipe/indikator/level dengan scope master valid yang tetap `NEEDS_REVIEW`                                                                |
| Script/contract checks              | 48/48; delapan JSON Schema dikompilasi dan freshness generated types lulus                                                                                                                            |
| Lint/typecheck/build                | Lulus; build workspace dijalankan serial untuk batas memori lokal                                                                                                                                     |
| Rantai browser nyata                | 5/5 pada SHA `27aa7f4d89458142b1028acfac2acc82233bfbaf`; PostgreSQL, Redis 7, API dan Chromium nyata; provider Auth dan transport S3 berlabel TEST ONLY                                               |
| Sepuluh sampel dan enam aset        | Impor lewat UI, PG/MCMA/Category, save ack, refresh/resume tiap item, submit/review null, enam gambar termuat termasuk pembahasan; akses Student ditolak                                              |
| Regresi browser Admin existing      | 14/14 setelah fixture diberi assignment capability konten eksplisit; viewport 320-1440 px                                                                                                             |
| CI head PR                          | [Checks PR #65](https://github.com/ayiinee/Numora/pull/65/checks) menjadi gate final; workflow menjalankan suite PostgreSQL/Redis, connected IRT, connected browser, E2E, build dan freshness OpenAPI |

Artefak release-chain disimpan pada `.tmp/job06-evidence/connected.json` dan artifact CI `job06-connected-<SHA>`. Koleksi berikutnya harus berasal dari checkout bersih dan membawa SHA-nya sendiri. Bukti JOB-06 sebelumnya tidak dihapus dan tidak dianggap otomatis sebagai acceptance SHA baru.

## Sandbox yang sudah dilakukan

- Target `pkamenfnwmoeisccnrnk`; backup public/drizzle/irt_compute disimpan privat di luar Git. SHA-256 dump: `1034f0772f4d7cb0cd28e707ad859b8170c99a0793448d563f9979fbe910ae1f`. Auth, storage object, ownership/ACL dan konfigurasi proyek bukan cakupan dump ini.
- Restore PostgreSQL 17 terisolasi, migrasi maju dan replay lulus. Fingerprint 100 tabel lama tetap sama, setelah mengabaikan kolom baru `users.admin_role`; prior history migrasi tidak ditulis ulang.
- Migrasi Cloud 0023 diterapkan dari SHA `27aa7f4d89458142b1028acfac2acc82233bfbaf`. Hash SQL: `a9a88e12d4af137e88bfca3a13e6406e311ab593e4fcf4fd14ed095d6aa00419`. Seratus tabel lama tetap utuh sebelum provisioning.
- LOGIN main baru `numora_content_preview_20261004` bukan owner, SUPERUSER, CREATEDB, CREATEROLE atau BYPASSRLS. Keenam tabel baru memakai RLS; main dapat membaca, compute dan Data API tidak.
- Pengguna memilih DEMO-QA Admin `0ed807a0-3524-4deb-9aea-452f4a9ba400`. Assignment `CONTENT_DATA_MODERATION` dilakukan lewat CLI dan diaudit. Admin personal tidak diubah; tidak ada backfill massal.
- Sesi QA Supabase nyata dipakai untuk HTTP dan browser; tidak mengirim email atau membuat ulang akun. Identity/capability, anonymous 401, pembacaan kurikulum dan feature-disabled 503 lulus. UI desktop/mobile menunjukkan fitur nonaktif tanpa write impor.
- `CONTENT_IMPORT_PREVIEW_ENABLED=false` dan upload flag tetap false pada API smoke. Master usulan, impor Cloud, sesi preview Cloud dan upload aset baru belum dibuat.

## Blocker dan langkah tersisa

R2 target dapat diakses dan CORS existing mengizinkan GET dari `http://localhost:3000`. Credential existing dapat membaca konfigurasi/list bucket pada tingkat akun; credential sementara yang dicoba ditolak layanan dengan `InvalidArgument` pada security token. Ini bukan bukti scoped credential berhasil.

Untuk menyelesaikan smoke, operator menyediakan **Object Read & Write khusus `numora-bucket`**, disimpan di file env lokal yang diabaikan Git (bukan chat/PR). API mendukung `R2_SESSION_TOKEN` optional bila memakai temporary credentials. [Cloudflare authentication](https://developers.cloudflare.com/r2/api/tokens/) mendokumentasikan permission/scoping; [temporary credentials](https://developers.cloudflare.com/r2/api/s3/temporary-credentials/) menjelaskan session token.

Setelah credential siap, ikuti [runbook](../development/CONTENT_IMPORT_PREVIEW_RUNBOOK.md): verifikasi storage/CORS origin UI; smoke satu gambar; provision master PROPOSED DRAFT tanpa konflik; upload enam aset pada salinan sampel; aktifkan API sandbox; jalankan sepuluh sampel melalui UI/API; kumpulkan receipt/import/session dan SHA tanpa secrets, signed URL, PII atau kunci di bukti publik; nonaktifkan flag setelah smoke.

Rubrik/scoring PGK, publication/lifecycle, master Curriculum final, XP/IRT, trial Google dan QA independen tetap terpisah. **PRD RULE** berasal dari v0.6; sample master bukan approval akademik. Konflik XP TryOut x10 versus AC-15 x100 tetap OPEN kepada Product Owner.
