# Learning read payload optimization

**ENGINEERING DECISION — 14 November 2026:** lanjutkan pengurangan payload DB
pada pembacaan hasil Pretest, katalog/progres dan materi siswa. Perubahan ini
mempertahankan kontrak, otorisasi, skor, bintang, unlock dan pin historis.

## Implementasi

- Hasil Pretest menjalankan `COUNT(*)` pada `attempt_items` setelah pemeriksaan
  pemilik dan status GRADED/SUBMITTED. Tidak perlu membaca seluruh versi soal,
  pilihan, kunci, pembahasan dan jawaban untuk menghitung jumlah item. Foreign
  key versi yang wajib dan unique answer/item menjaga kesetaraan dengan jumlah
  row join sebelumnya. Grading, decoding dan delivery saat pengerjaan tetap
  menggunakan konten lengkap.
- Total level/progres dihitung dengan satu agregasi. Join progress selalu
  dibatasi student; hanya level, subbab dan bab READY yang dihitung. Unique
  `(student_id, level_id)` mencegah perkalian row. Query latest score tetap
  membaca Drill GRADED terbaru, termasuk histori pada level yang kini tersembunyi.
- Halaman subbab memilih kolom yang dipakai DTO dan membatasi progress/attempt
  aktif ke level READY pada subbab tersebut. Tanpa level READY, dua pembacaan
  tambahan dilewati. Prioritas status locked/completed/inProgress/open tetap.
- Katalog dan materi memilih kolom yang diperlukan. Proyeksi progress materi
  menyertakan key non-null agar mapper left join tetap membedakan row progress
  yang ada dengan kolom nullable dari ketiadaan row.

Tidak ada migrasi, perubahan environment runtime, schema atau kontrak API.
Tidak ada perubahan interval polling, transaksi write atau cache pada PR ini.
Dasar branch adalah `main` `7288b4b3`; PR upload #175/#176 terpisah.

## Pengukuran lokal

Fixture memakai database localhost dan login runtime non-owner/RLS yang dibuat
per run. Database/bootstrap fixture, 209 level terlihat, 200 progress dari
subbab lain, konten DRAFT/ARCHIVED, student lain dan histori skor dipisahkan
dari layanan cloud. Fixture identitas menggantikan provider Auth.

Proxy menghitung respons PostgreSQL ke API setelah koneksi dihangatkan.
Hanya alat ukur memakai satu koneksi agar startup koneksi tambahan dari lima
query materi paralel tidak tercampur dengan payload. Pool runtime tidak diubah.
Pengukuran ini bukan ukuran respons HTTP atau benchmark latency produksi.

| Read service  | Sebelum (`7288b4b3`) |     Sesudah | Penurunan fixture |
| ------------- | -------------------: | ----------: | ----------------: |
| Hasil Pretest |          20.546 byte |  1.631 byte |            92,06% |
| Total progres |          19.720 byte |    235 byte |            98,81% |
| Subbab        |          47.954 byte |  1.645 byte |            96,57% |
| Materi        |          78.382 byte | 37.753 byte |            51,83% |

Seluruh lima pemeriksaan perilaku baru juga lulus pada baseline. Batas payload
regresi sengaja gagal pada baseline, kemudian lulus sesudah optimasi. Metadata
fixture/timestamp dapat menyebabkan variasi kecil antar-run.

Regresi mencakup agregat kosong, hierarki tersembunyi pada tiap tingkat,
isolasi student, status level, nilai desimal/bintang, nullable progress dengan
skor nol, skor historis, tujuan Lanjutkan, akses ditolak, hasil Pretest pending,
GRADED/SUBMITTED dan hasil pinned sesudah paket ditutup.

## Pengukuran Supabase cloud

[measure-learning-read-payload.mjs](../../scripts/measure-learning-read-payload.mjs)
membandingkan dua grup SQL yang berubah pada snapshot data yang sama dalam
`REPEATABLE READ READ ONLY`. Mode read-only diperiksa; statement dibatasi
10 detik dan lock 1 detik. Sampel/estimasi transfer tiap grup dibatasi 512 KiB.
Skrip hanya menampilkan status dan angka agregat tanpa ID, identitas, isi soal,
jawaban atau DSN. Pengaturan TLS DSN dipertahankan.

| Konfigurasi                  | Grup SQL            | Sampel                                   |     Sebelum → sesudah | Query |
| ---------------------------- | ------------------- | ---------------------------------------- | --------------------: | ----- |
| Development/Staging (`.env`) | Jumlah item Pretest | 20 item, satu attempt terminal           | 33.944 → 125 byte TLS | 1 → 1 |
| Production (`.env.prod`)     | Jumlah item Pretest | 20 item, satu attempt terminal           | 33.553 → 125 byte TLS | 1 → 1 |
| Development/Staging (`.env`) | Total progres       | Satu student aktif, 115 level, 0 selesai |  5.613 → 163 byte TLS | 2 → 1 |
| Production (`.env.prod`)     | Total progres       | Satu student aktif, 115 level, 1 selesai |  5.682 → 163 byte TLS | 2 → 1 |

Jumlah item dan kedua agregat sama sebelum/sesudah di setiap sampel. Grup
jumlah item turun sekitar 99,63%; grup progres sekitar 97,1%. Nilai ini tidak
mewakili seluruh request endpoint atau persentase Usage/billing Supabase.
Query ownership, latest score dan Auth tidak termasuk grup cloud yang diukur.
Subbab/materi pada tabel sebelumnya diukur di localhost.

Byte cloud dihitung pada koneksi terenkripsi, termasuk overhead TLS, setelah
koneksi dan persiapan sampel. Durasi satu run dapat dipengaruhi cache/jaringan;
tidak dipakai sebagai SLO. Tidak ada fixture, import, migrasi atau mutasi data
bisnis yang dijalankan pada cloud. Data riil tidak disimpan ke repo atau log.

## Verifikasi dan reproduksi

Lima belas tes dalam empat file integrasi lulus, termasuk enam regresi DB baru.
ESLint/format file terkait serta typecheck dan build API lulus. Pengukuran awal
dilakukan 13 November, dengan verifikasi akhir PR dilanjutkan 14 November 2026.

Untuk lokal gunakan `NODE_ENV=test`, `TEST_DATABASE_URL` localhost khusus dan
kosongkan `DATABASE_URL`/`DATABASE_MIGRATION_URL`. Suite baru membuat dan
menghapus database/role sendiri; suite lifecycle existing memakai database
test yang sudah dimigrasikan.

```powershell
pnpm --filter @tka/api exec vitest run src/modules/learning/learning-read-payload.integration.spec.ts src/modules/learning/learning.flow.integration.spec.ts src/modules/learning/pretest-tryout.integration.spec.ts src/modules/learning/student-dashboard.integration.spec.ts
pnpm --filter @tka/api typecheck
pnpm --filter @tka/api build
```

Untuk cloud, pilih file secara eksplisit dan pastikan `DATABASE_URL` shell
tidak menimpa file tersebut. Skrip tidak memuat `.env` otomatis dan tidak memakai
koneksi migrator. Tabel/sampel yang kosong dilaporkan tanpa membuat data uji.

```powershell
node --env-file=.env scripts/measure-learning-read-payload.mjs
node --env-file=.env.prod scripts/measure-learning-read-payload.mjs
```

Setelah review/merge dan restart/deploy API, bandingkan Usage pada jendela
trafik sebanding. Pembacaan SQL di atas memvalidasi usulan sebelum rollout;
kuota yang sudah terpakai tetap tercatat pada billing cycle berjalan.
