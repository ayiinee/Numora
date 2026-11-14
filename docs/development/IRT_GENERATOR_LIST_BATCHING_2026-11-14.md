# Batching daftar request IRT dan Generator

**ENGINEERING DECISION — 14 November 2026:** implementasikan audit Q28/Q29
dengan pembacaan per kumpulan ID, tanpa mengubah kontrak list/detail atau
aturan ilmiah. Baseline `main` adalah `7288b4b3`. PR performa #175–#177 dan #179
tetap terpisah; PR ini tidak memerlukan perubahan dari branch tersebut.

## Implementasi dan invariant

- Generator memeriksa feature flag dan role non-owner Main sekali per operasi
  list, termasuk halaman kosong. Public detail tetap memeriksa keduanya setiap
  kali dipanggil. Detail internal tidak lagi mengulang role query per row.
- List memilih ID dengan predicate, urutan `created_at DESC,id DESC`, limit dan
  offset existing, lalu mengambil metadata untuk seluruh ID sekaligus. Hasil
  dipetakan kembali mengikuti urutan halaman. ID tanpa detail tetap menghasilkan
  error 404 existing, bukan diam-diam dihilangkan.
- Generator mempertahankan execution dari dispatch generation terbaru. IRT
  mempertahankan execution dengan attempt number terbesar di seluruh request,
  termasuk execution lama ketika dispatch retry terbaru belum berjalan. Kedua
  semantik tersebut sengaja tidak disamakan.
- IRT memilih kolom header yang digunakan DTO, membaca execution terbaru per
  request dengan lateral join, lalu membatch artifact dan delivery. Artifact
  tetap terurut sequence number untuk execution yang terpilih. Accepted execution,
  configuration pins, snapshot/input digest, dueAt, overdue dan sanitasi kode
  kegagalan tetap disertakan sesuai kontrak.
- Detail satu request dan halaman memakai formatter yang sama. Payload artifact,
  isi snapshot, jawaban, kunci dan PII tidak dibaca untuk list ini. Tidak ada
  cache approval/status ilmiah atau perubahan prepare/retry/adoption/publication.

Tidak ada migrasi, environment baru atau perubahan OpenAPI/DTO. Transaksi
mutasi, outbox dan batas permission namespace tetap memakai implementasi existing.

## Pengukuran lokal

Proxy menghitung pesan Execute/Query serta respons PostgreSQL ke backend pada
satu koneksi yang telah dihangatkan. Fixture memiliki 23 request terkelola per
jenis, timestamp yang sama untuk menguji tie ordering, request unmanaged/tipe
lain, retry dispatch, execution pending/failed/running dengan lease kedaluwarsa,
accepted artifact dengan dua sequence, dan failure detail yang harus disanitasi.
Role non-owner Main/Compute dan seluruh trigger DB aktif. Data ilmiah dan
approval adalah TEST ONLY di database localhost yang dibuat/dihapus per run.

| Daftar    | Ukuran halaman |   Sebelum (`7288b4b3`) |               Sesudah |
| --------- | -------------: | ---------------------: | --------------------: |
| IRT       |              1 |   5 query / 1.887 byte |  5 query / 1.721 byte |
| IRT       |             20 | 81 query / 17.323 byte | 5 query / 14.130 byte |
| Generator |              1 |     4 query / 614 byte |    3 query / 577 byte |
| Generator |             20 |  42 query / 4.536 byte |  3 query / 3.322 byte |

Halaman 20 row turun 93,83% query dan 18,43% byte untuk IRT, serta 92,86%
query dan 26,76% byte untuk Generator. Tujuan utama perubahan
ini adalah menghapus pertumbuhan round trip linear; DTO lengkap tetap dijaga.
Byte dapat bervariasi sedikit karena timestamp/metadata fixture.

Tiga tes perilaku baru lulus pada baseline. Tes batas query sengaja gagal pada
baseline (81 melebihi batas 5), lalu seluruh empat tes lulus setelah optimasi.
Tes memeriksa order/page/offset/detail parity, tipe/unmanaged exclusion, 404,
latest dispatch versus latest execution, lease, accepted execution, urutan
artifact, failure sanitization dan penolakan role owner/Compute serta flag mati.

## Pengecekan cloud

Pengecekan Development/Staging `.env` dan Production `.env.prod` memakai
`REPEATABLE READ READ ONLY`, statement timeout 10 detik dan TLS sesuai DSN.
Keduanya memiliki **nol request CALIBRATE_TRYOUT/GENERATE_VARIANTS terkelola**
dengan dispatch generation 1. Tidak dibuat fixture atau approval pada cloud.
Karena tidak ada sampel, tidak ada klaim penghematan byte live/Usage dari PR ini.

Pengecekan agregat yang dapat diulang di koneksi audit yang dipilih:

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '10s';
SHOW transaction_read_only;
SELECT r.request_type, count(*) AS managed_requests
FROM analysis_requests r
WHERE r.request_type IN ('CALIBRATE_TRYOUT', 'GENERATE_VARIANTS')
  AND EXISTS (
    SELECT 1 FROM analysis_request_dispatches d
    WHERE d.request_id = r.id AND d.generation = 1
  )
GROUP BY r.request_type;
COMMIT;
```

## Reproduksi dan rollout

35 tes package pada enam file lulus tanpa skip. Regresi API terhadap build
package baru menghasilkan 37 tes lulus dan dua tes antrean Redis skipped karena
`TEST_REDIS_URL` tidak disediakan. Jalur antrean tersebut tidak diubah oleh PR;
hasil ini tidak diklaim sebagai acceptance transport Redis/AI. ESLint/Prettier,
typecheck dan build package/API juga diperiksa sebelum PR.

Gunakan `NODE_ENV=test`, database khusus localhost dalam `TEST_DATABASE_URL`,
dan kosongkan `DATABASE_URL` serta `DATABASE_MIGRATION_URL`. Build database
package terlebih dahulu. Suite baru memanggil runner migrasi milik database
package dan membuat database serta login terpisah; tidak menambah dependency ORM
ke orchestration hanya untuk test.

```powershell
pnpm --filter @tka/irt-orchestration test
pnpm --filter @tka/irt-orchestration typecheck
pnpm --filter @tka/irt-orchestration build
```

Sesudah review/merge, build package dan deploy/restart API yang menggunakannya.
Pantau error list/detail dan bandingkan query/Usage pada trafik sebanding saat
fitur digunakan. Benchmark lokal bukan SLO produksi atau estimasi GB billing.
