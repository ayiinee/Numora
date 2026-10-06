**ENGINEERING UPDATE - 4 Oktober 2026:** semua endpoint upload memakai ContentAdminGuard: ACTIVE Admin dengan subrole SUPER_ADMIN/CONTENT_DATA_MODERATION. AdminGuard generik pada uraian historis di bawah sudah diganti. Signed GET preview TTL 900 detik tidak bergantung pada upload flag dan dibatasi fase/asset ID sesi. [Importer/preview](CONTENT_IMPORT_PREVIEW.md) memverifikasi receipt; upload tidak menjadi approval akademik atau publikasi.

# Upload media soal melalui backend

**ENGINEERING IMPLEMENTATION — 3 Oktober 2026.** Reyhan meminta endpoint dan JSON sampel dalam satu PR serta mengonfirmasi bucket **`numora-bucket`**. Prefix final **`question-media/`** adalah pilihan engineering. Ini bukan perubahan rubrik, paket atau aturan akademik PRD.

Kode tersedia di NestJS; deployment, migrasi Cloud dan upload R2 belum dilakukan. Server menolak upload dengan `503 R2_NOT_CONFIGURED` sampai environment diisi dan flag diaktifkan. [Handoff bank soal](../data/QUESTION_BANK_BACKEND_HANDOFF.md) membedakan kemampuan ini dari importer/preview rich JSON yang masih diusulkan.

## Cara kerja

1. Admin aktif meminta reservasi ke NestJS, mengirim identitas soal/aset, versi konten, MIME, ukuran dan SHA-256. Backend menentukan bucket/key; klien tidak boleh mengirim object key sendiri.
2. Backend menyimpan reservasi dan audit dalam satu transaksi, lalu mengirim signed PUT URL untuk `question-media/_pending/{actorUserId}/{uploadId}.{ext}`.
3. Klien PUT file asli langsung ke R2. Token Admin hanya dikirim ke NestJS, tidak ke R2.
4. Admin meminta completion. Backend membaca file sementara, memverifikasi ukuran, tipe, signature format dan SHA-256 byte aktual. Backend kemudian PUT byte terverifikasi ke key final. Reservasi berubah ke `VERIFIED` bersama audit dalam transaksi.
5. Baru setelah receipt `VERIFIED`, alat upload mengisi `objectKey` dan `assetKeys` di JSON. Sisa blocker impor/review tetap ada; `importReady` tetap false.

Key final:

```text
question-media/{externalId}/v{contentVersion}/{assetId}-{sha256}.{png|jpg|webp}
```

Signed PUT dapat digunakan ulang sampai kedaluwarsa. Karena itu klien hanya mendapat akses PUT ke key sementara. Byte final berasal dari buffer yang sudah diverifikasi, sehingga replay PUT tidak mengganti gambar final. Revisi gambar menghasilkan hash/key baru; jangan menghapus key lama yang masih direferensikan versi soal/attempt. Worker cleanup key final belum ada.

Signature PNG/JPEG/WebP diperiksa, tetapi ini bukan decode gambar penuh atau antivirus. SVG/HTML tidak diterima. Batas **5 MiB**, TTL default **900 detik** (konfigurasi 60–3600) dan timeout operasi storage 15 detik adalah batas engineering. R2 tidak mendukung checksum SHA-256 FULL_OBJECT melalui S3; ETag bukan pengganti pemeriksaan byte. Rujukan: [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/).

## Kontrak API

`Authorization: Bearer <session JWT>` wajib pada kedua endpoint. `AdminGuard` memastikan user domain berstatus ACTIVE dan role ADMIN; user sekolah biasa/Teacher/Student tidak boleh upload. Reservasi milik Admin lain disembunyikan sebagai 404. Semua error mengikuti Problem Details repo.

### POST `/api/v1/admin/content/media/uploads`

Header `Idempotency-Key` wajib, 1–128 karakter alfanumerik, `_` atau `-`. Key sama pada Admin sama mengembalikan reservasi yang sama; payload berbeda menghasilkan 409. Reservasi expired menghasilkan 410; gunakan key baru. `contentVersion` default 1.

```json
{
  "externalId": "CURR-IND16-L01-Q03",
  "assetId": "bahas-1",
  "contentVersion": 1,
  "contentType": "image/png",
  "byteLength": 1499,
  "sha256": "3a8420d839c65e905eb9a118cbaa82f72b261849309cea809d1c25cc85d685a4"
}
```

Respons 201 mencakup `uploadId`, `status: PENDING`, identitas media, bucket, key final yang direncanakan, checksum/ukuran, `verifiedAt: null`, `uploadUrl`, `method: PUT`, `headers` (Content-Type dan Content-Length), dan `expiresAt`. **Key pada respons PENDING belum merupakan bukti upload.** File harus dikirim dengan header yang ditandatangani. Jangan menyimpan URL di database/JSON/log/PR.

Replay sesudah VERIFIED mengembalikan receipt tanpa URL PUT: `uploadUrl`, `method`, `headers` bernilai null. `expiresAt` pada receipt replay adalah expiry reservasi awal, bukan expiry key final.

### POST `/api/v1/admin/content/media/uploads/{uploadId}/complete`

Body tidak diperlukan. Respons 200 berupa receipt `VERIFIED`: `uploadId`, `externalId`, `assetId`, `bucket`, `objectKey`, `contentType`, `byteLength`, `sha256`, `verifiedAt`. Tidak berisi signed URL atau rahasia. Completion ulang idempotent. File belum ada: 409; byte/type/size mismatch: 422; expiry: 410; masalah storage: 503. Completion yang gagal tidak menandai reservasi VERIFIED; jika publish sukses tetapi transaksi gagal, retry ID yang sama mengulangi publish byte yang identik.

OpenAPI di `packages/contracts/openapi/openapi.json` adalah kontrak mesin untuk DTO/endpoint ini. API ini menyiapkan media; belum menulis media ke `question_versions` dan tidak mengaktifkan importer/renderer/scoring.

## Konfigurasi server dan bucket

Backend mengisi environment rahasia lokal/deployment, misalnya `.env` yang sudah diabaikan Git:

```dotenv
R2_MEDIA_UPLOADS_ENABLED=true
R2_ACCOUNT_ID=<Cloudflare Account ID 32 karakter hex>
R2_ACCESS_KEY_ID=<access key server>
R2_SECRET_ACCESS_KEY=<secret key server>
R2_BUCKET=numora-bucket
R2_MEDIA_PREFIX=question-media
R2_UPLOAD_TTL_SECONDS=900
```

Gunakan API token R2 dengan izin **Object Read & Write**, dibatasi bucket `numora-bucket`. Backend perlu GetObject dan PutObject; token admin Cloudflare/account-wide tidak diperlukan. Jangan memakai prefix `NEXT_PUBLIC_` untuk credentials. `.env.example` berisi nama/config saja dan flag false. `R2_PUBLIC_BASE_URL` tidak diperlukan untuk jalur private ini.

Tim backend memastikan bucket private, akses publik dimatikan. Untuk browser PUT, konfigurasi CORS dari [contoh](../operations/r2-cors.example.json); ganti origin staging/production dengan origin frontend yang benar. Contoh hanya mengizinkan `http://localhost:3000`, bukan semua origin. Alat CLI Node tidak membutuhkan CORS.

Tambahkan lifecycle rule khusus prefix **`question-media/_pending/`** untuk menghapus objek sementara, misalnya setelah 1 hari (**PROPOSED operasional**). Jangan memakai rule itu ke seluruh `question-media/`. PR ini tidak membuat bucket/token, tidak mengubah CORS/lifecycle di Cloud, dan tidak menghapus objek R2.

Tidak ada signed GET endpoint dalam PR ini. Untuk preview/penyajian soal, backend berikutnya harus memeriksa hak akses soal lalu menandatangani GET key VERIFIED dan menyertakan URL sementara dalam respons. Pembahasan/kunci tidak boleh bocor lewat endpoint media. Gambar private belum bisa ditampilkan hanya dengan mengubah objectKey menjadi URL publik.

## Migrasi database

Drizzle menghasilkan **`0021_content_media_uploads.sql`**, menambah satu tabel reservasi `content_media_uploads` beserta FK user, uniqueness actor/idempotency, indeks, constraint ukuran/hash/status/expiry, dan RLS aktif tanpa policy browser. Operasi melalui NestJS memakai koneksi database server yang sudah digunakan repo. Pastikan role server mempunyai hak yang diperlukan; jangan memberi akses Supabase Data API pada Student untuk tabel ini.

Migrasi belum diterapkan ke Cloud. Rantai rekonsiliasi 4 Oktober 2026 mempertahankan migrasi main 0014?0018 (Variant/IRT dan dispatch), menambahkan slug/level #54 sebagai 0019?0020, lalu media sebagai **0021**. Role `numora_main_runtime` menerima SELECT/INSERT/UPDATE dengan policy RLS server; role compute dan browser tidak mendapat akses media. Setelah review, pemilik database menjalankan alur migrasi standar repo dengan backup/restore dan target koneksi yang diverifikasi. Jangan menerapkan SQL bernomor sama dari branch lama.

## Menjalankan enam gambar sampel

1. Review [master dan 10 JSON](../data/samples/2026-10-03/README.md). Jalankan validasi tanpa Cloud terlebih dahulu dari root repo:

   ```powershell
   corepack pnpm run media:upload:samples --dry-run
   ```

2. Sesudah endpoint dideploy, migrasi diterapkan dan server R2 dikonfigurasi, isi **`.env.media-upload.local`** (diabaikan Git):

   ```dotenv
   API_BASE_URL=https://<host-backend>/api/v1
   ADMIN_AUTH_TOKEN=<session JWT Admin aktif dari login>
   MEDIA_UPLOAD_RUN_ID=sample-v1
   ```

   Untuk API lokal boleh `http://localhost:4000/api/v1`. Token berasal dari login Admin yang sah, bukan service-role key Supabase atau access key R2. Tidak perlu mengirim token ke chat/PR.

3. Jalankan:

   ```powershell
   corepack pnpm run media:upload:samples
   ```

   Alat memeriksa seluruh file/hash dan proposed schema dahulu, kemudian reservasi → PUT → completion untuk setiap gambar. Ia tidak membaca respons error mentah atau mencetak signed URL/token. Pada kegagalan, berhenti; receipt yang telah berhasil disimpan sebagai checkpoint. Coba ulang dengan run ID sama untuk replay idempotent. Bila PENDING expired, ubah run ID. Sesudah interruption antarsalinan file, rerun menyelaraskan aggregate/per-soal dari checkpoint assets.

4. Review diff `assets.draft.json`, JSON aggregate/per-soal dan plan. Hanya key final terverifikasi dan receipt non-rahasia yang boleh ikut commit lanjutan. `validation-report.json` adalah snapshot validasi offline saat PR dibuat, bukan laporan upload terbaru.

Enam file total **9.191 byte**, lima isi unik. Satu gambar boleh muncul di beberapa posisi; sampel mempertahankan satu key per penggunaan agar mudah review. `assetOrder` dan marker `[[asset:...]]` menjaga urutan di stem/opsi/pernyataan/pembahasan.

## Bukti pengujian dan batasnya

Tes HTTP menggunakan guard/validasi asli dengan database/storage terisolasi. Tes storage memakai signer SDK asli dan network mock; memeriksa staging vs final, header signature, hash/type/size dan error sanitization. Tes uploader memastikan token tidak terkirim ke R2, kegagalan PUT tidak completion, receipt mismatch tidak mengisi key, dan replay VERIFIED tidak PUT ulang. Tes integrasi PostgreSQL menguji race reservasi/completion dan audit satu kali, hanya pada database TEST lokal; CI menyediakan database tersebut.

Semua itu belum membuktikan credentials R2 nyata, CORS browser, deployment, upload Cloud atau importer berhasil. Uji Cloud satu file setelah konfigurasi operator sebelum upload batch. Rubrik PGK, mapping kesulitan PvP dan review akademik tidak ditutup oleh endpoint ini.

**Bukti rekonsiliasi:** tes concurrency/audit memakai LOGIN main non-owner dengan NOBYPASSRLS; tes terpisah memastikan role compute ditolak. CI PostgreSQL menjalankan keduanya. Ini tidak menyatakan Cloud/R2 sudah diaktifkan.
