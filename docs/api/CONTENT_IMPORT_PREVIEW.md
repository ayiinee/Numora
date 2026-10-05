# Import JSON v2 dan preview internal Admin

**PRD RULE:** [PRD v0.6 Final](../product/sources/PRD_Numora_v0.6.docx.md) menetapkan konten mengikuti Curriculum, media R2, perubahan tercatat, dan hasil historis tetap utuh. Akses konten diberikan kepada Super Admin dan Content/Data/Moderation.

**ENGINEERING DECISION:** fondasi ini hanya mengimpor DRAFT dan membuat sesi preview terpisah tanpa scoring. Semua nilai numerik preview `null`, dengan `scoringStatus: NOT_SCORED`. Preview tidak menghasilkan attempt produksi, XP, progress, leaderboard, exposure, atau evidence IRT. Kontrak Student tidak berubah.

## Hak akses dan flag

Semua endpoint `/api/v1/admin/content`, termasuk kurikulum, versi, paket Drill dan upload lama, memakai `ContentAdminGuard`. Akun harus ACTIVE, role ADMIN, dan subrole `SUPER_ADMIN` atau `CONTENT_DATA_MODERATION`. `OPERATIONS` dan Admin tanpa assignment ditolak 403. Identity membawa `adminRole` dan capability `CONTENT_MANAGE`; API membaca assignment terbaru pada setiap request. Browser hanya memakai capability untuk navigasi.

`CONTENT_IMPORT_PREVIEW_ENABLED=false` adalah default. Penonaktifan menutup API importer/preview, termasuk pembacaan sesi, sambil mempertahankan histori. Upload memakai flag terpisah `R2_MEDIA_UPLOADS_ENABLED`. Signed GET tidak bergantung pada flag upload.

Anonymous mendapat 401; sesi/laporan impor milik Admin lain disembunyikan sebagai 404. Error memakai `application/problem+json`. Matriks permission Admin lengkap dan DTO Operations terbatas mengikuti [authorization](AUTHORIZATION.md).

## Kontrak importer

[JSON Schema v2](../../packages/contracts/questions/question-import-v2.schema.json) divalidasi oleh AJV sebagai dependency produksi, lalu dilanjutkan validasi semantik. Kontrak v1 dipertahankan. Envelope ialah `{ sourceNamespace, questions }`, maksimal 100 soal dan body 2 MiB. Format mendukung PG, MCMA dan Category, rich text, kategori, manifest media, provenance dan difficulty nullable. Nomor level sumber adalah level kurikulum, bukan difficulty PvP.

| Endpoint                   | Perilaku                               |
| -------------------------- | -------------------------------------- |
| `POST /import-validations` | Laporan tanpa write data bisnis        |
| `POST /imports`            | Impor atomik dengan `Idempotency-Key`  |
| `GET /imports/:id`         | Laporan tersimpan dan UUID versi hasil |

`canImportDraft` dibedakan dari `canPreview`. Key kosong memberi blocker `MEDIA_NOT_READY` dan tetap boleh DRAFT. Key terisi harus cocok dengan receipt VERIFIED pada external ID, asset ID, bucket, key, checksum, MIME dan panjang byte. Marker dan posisi aset harus sesuai manifest. Klaim reviewer atau `importReady` dari JSON bukan approval server.

Identitas unik `(sourceNamespace, externalId)` dilock secara berurutan. Idempotensi dibatasi actor dan operasi: input identik mengembalikan laporan sebelumnya; key sama dengan input berbeda mendapat 409. Seluruh batch dan audit ditulis dalam satu transaksi. Satu item invalid membatalkan seluruh write.

Hash canonical mencakup konten, taxonomy, kunci, difficulty dan manifest terpilih; tidak mencakup signed URL, token atau metadata operasional. Hash terakhir sama menghasilkan `SKIPPED_UNCHANGED`; perubahan menghasilkan versi DRAFT baru. Perubahan tipe, indikator atau nomor level menghasilkan `NEEDS_REVIEW` dan memblokir batch. Reimport media yang sudah lengkap menghasilkan versi baru. Provenance dan versi impor immutable. Keluarga/varian menggunakan ORIGINAL; tidak menerapkan multi-varian Drill.

Opsi/pernyataan/kategori disimpan sebagai `{ options, categories }`. Decoder legacy tetap membaca array. Editor payload dan publikasi legacy menolak versi impor; review menggunakan endpoint lifecycle berikut. Migration 0026 melindungi UPDATE payload/DELETE versi impor sambil mengizinkan status/reviewer/waktu review. Bukti import dan snapshot tetap immutable. Preview/paket/attempt yang memin versi lama tidak berpindah ke revisi baru.

## Review, revision dan readiness

**ENGINEERING DECISION:** `GET /versions/:id` menampilkan payload v2 lengkap, taxonomy/level/difficulty, key/explanation/media, lineage, reviewer dan riwayat keputusan. Content dan Super dapat membuka versi lama/arsip. `POST /versions/:id/review` menerima `status` READY/REVISION/ARCHIVED, `expectedStatus`, dan alasan wajib. Lock versi menolak keputusan stale. READY memerlukan struktur semantik yang sah, taxonomy/keluarga/level READY, difficulty dan receipt media VERIFIED. PGK dapat direview secara editorial tanpa scoring; readiness publikasi menampilkan kebutuhan rubric yang disahkan secara terpisah. READY tidak menyetujui policy akademik atau mempublikasikan paket.

Archive/REVISION menolak referensi paket PUBLISHED; archive menghentikan preview/pemilihan baru, sementara sesi dan attempt sebelumnya tetap pinned. Payload diperbaiki dengan import satu soal memakai `expectedSourceVersionId` dan `revisionReason`: sumber harus versi import terbaru dalam identitas yang sama. Replay key/payload yang sama mengembalikan versi yang sama; operasi baru dengan sumber stale ditolak. Revisi DRAFT menyimpan lineage, bukan menimpa sumber.

UI `/admin/content/versions/:id` menampilkan JSON rich lengkap dan menghubungkan preview/render/media existing. `/admin/content/imports` menyediakan reserve–PUT–complete media, progress dan retry completion, tanpa menampilkan signed URL atau mengirim bearer API ke R2. Receipt VERIFIED dengan key durable digunakan pada asset manifest.

`GET /api/v1/admin/reports` menerapkan filter kind/status/category/periode dan pagination gabungan di server. `GET /admin/reports/:kind/:id` membuka versi soal yang dipin attempt, tanpa jawaban/identitas siswa, atau snapshot target video. Snapshot video baru disimpan saat laporan dibuat; laporan lama diberi label CURRENT_METADATA. Resolution dapat merujuk revisi yang lineage-nya mencapai versi yang dilaporkan, dan alasan/status/pelaku/waktu tersimpan pada audit. Migration 0027 menjaga konteks laporan immutable. Audit umum mendukung actor/action/entity/periode dan tidak mengembalikan metadata rahasia; detail review mengembalikan proyeksi alasan editorial saja.

## Kontrak preview

| Endpoint                                          | Perilaku                                                        |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `POST /preview-sessions`                          | 1–100 UUID versi unik, mempertahankan urutan; idempotensi wajib |
| `GET /preview-sessions/:id`                       | Konten pengerjaan dan jawaban tersimpan                         |
| `PATCH /preview-sessions/:id/answers/:instanceId` | Simpan/ganti/hapus dengan `expectedRevision`                    |
| `POST /preview-sessions/:id/submit`               | Bekukan jawaban; idempotensi wajib                              |
| `GET /preview-sessions/:id/result`                | Review sesudah submit                                           |
| `POST /preview-sessions/:id/media-links`          | Renewal asset ID milik sesi dan fase yang sah                   |

State `IN_PROGRESS → SUBMITTED`. Item mempunyai UUID instance, posisi, UUID versi sumber, serta snapshot konten/kunci/media immutable. Semua aset, termasuk pembahasan, harus VERIFIED sebelum sesi dibuat.

Jawaban PG `{ optionId }`; MCMA `{ optionIds }`; Category `{ categoryByStatementId }`. Kosong menjadi `null`; Category boleh parsial dan save mengganti seluruh map. Ack berisi revision dan waktu server setelah commit. Stale revision dengan isi berbeda menghasilkan 409; isi identik mengembalikan ack terkini. Save dan submit melock sesi yang sama; sesudah submit jawaban immutable. Submit berulang mengembalikan review yang sama.

Respons pengerjaan tidak membawa kunci, pembahasan atau URL aset pembahasan. Result membawa jawaban, kunci dan pembahasan snapshot tanpa penilaian. Renewal hanya menerima asset ID yang diotorisasi pada fase WORK/REVIEW; tidak menerima object key arbitrer. TTL GET 900 detik.

UI nyata: `/admin/content/imports` dan `/admin/content/preview-sessions/:id`, dengan posisi `?item=` yang dapat dilanjutkan. UI menunggu ack save sebelum submit. Rich text mendukung newline, LaTeX inline/display dan marker gambar. HTML masukan ditampilkan sebagai teks; renderer KaTeX memakai `trust: false`. Semua sesi berlabel **DRAFT — preview internal**. `/admin/preview` mock bukan jalur fitur.

## Persistence dan batas lanjutan

Migrasi `0023_content_import_preview` menambah subrole nullable tanpa backfill, nullable difficulty, tiga tabel impor dan tiga tabel preview. Tabel baru mempunyai RLS dan grant main eksplisit, tanpa akses compute atau Supabase Data API. Audit tidak membawa jawaban/kunci/token.

**OPEN:** taxonomy, kode/urutan/indikator/blueprint/difficulty sampel belum approved Curriculum. Lima level dan sepuluh soal Drill per level tidak menyetujui master sandbox. Lifecycle editorial di atas tersedia; publikasi assessment masih memerlukan policy/rubric akademik yang sah. XP dan IRT tetap terpisah. Rumus XP TryOut section 12 x10 versus AC-15 x100 membutuhkan koreksi Product Owner.

Lihat [runbook sandbox](../development/CONTENT_IMPORT_PREVIEW_RUNBOOK.md), [handoff bank soal](../data/QUESTION_BANK_BACKEND_HANDOFF.md) dan [upload media](CONTENT_MEDIA_UPLOADS.md). Approval Curriculum, engine Data, trial Google dan QA independen bukan hasil otomatis dari PASS engineering.
