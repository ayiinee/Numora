# Checkpoint optimasi DB, transaksi dan cache

**ENGINEERING STATUS — 14 November 2026:** status ini membedakan kode di main,
PR yang siap direview dan bukti runtime. Tidak ada klaim seluruh database sudah
optimal atau seluruh egress sudah turun hanya karena tes/PR selesai.

## Urutan pekerjaan dan status

| Urutan | Area                                                           | Artefak/status saat checkpoint                                                                                |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1      | PvP availability ringan dan payload kandidat                   | #168/#169 sudah di main                                                                                       |
| 2      | Cache eligibility PvP, revision/invalidation dan single-flight | #172 sudah di main; personal/runtime guard tetap di luar cache                                                |
| 3      | Batch action notifikasi/identity per halaman                   | #173 sudah di main                                                                                            |
| 4      | Boundary transaksi upload dan storage di luar transaksi        | [#175](https://github.com/ayiinee/Numora/pull/175), PR terbuka                                                |
| 5      | Proyeksi list/import upload                                    | [#176](https://github.com/ayiinee/Numora/pull/176), PR terbuka                                                |
| 6      | Pretest count, learning progress dan materials reads           | [#177](https://github.com/ayiinee/Numora/pull/177), PR terbuka                                                |
| 7      | Batch metadata Tryout dan scoped monitoring roster             | [#179](https://github.com/ayiinee/Numora/pull/179), PR terbuka                                                |
| 8      | Batch daftar Generator/IRT                                     | [#182](https://github.com/ayiinee/Numora/pull/182), implementasi/pengukuran selesai; CI hijau saat checkpoint |
| 9      | Verifikasi Auth per request HTTP                               | [#183](https://github.com/ayiinee/Numora/pull/183), implementasi/pengukuran selesai                           |
| 10     | Payload snapshot PvP dan presentation worker                   | PR pada branch `perf/runtime-read-payload`, pengukuran/local regressions selesai                              |

Dasar branch rangkaian ini adalah main `7288b4b3`. Setiap PR performa dibuat
langsung dari main agar dapat direview terpisah. Kode PR terbuka belum berarti
sudah masuk main, dibangun di server atau berjalan di cloud. PR fungsional dari
pekerjaan lain, khususnya Tryout, tetap perlu diperiksa ketika integrasi merge
menyentuh file yang sama.

## Bukti rangkaian lanjutan

- Generator/IRT: halaman 20 row turun 42 → 3 dan 81 → 5 query. Tiga tes perilaku
  baru juga lulus pada baseline; budget query gagal seperti yang diharapkan.
  Cloud tidak memiliki request terkelola sebagai sampel, sehingga manfaat live
  belum diatribusikan. Lihat [metode](https://github.com/ayiinee/Numora/blob/perf/irt-list-query-batching/docs/development/IRT_GENERATOR_LIST_BATCHING_2026-11-14.md).
- Auth: provider localhost dengan SDK asli membuktikan guard/controller memakai
  satu verifikasi per token/provider/request. DB status/role/membership tetap
  fresh, request berikutnya memverifikasi lagi. Tidak ada cache token lintas
  request. Lihat [metode](https://github.com/ayiinee/Numora/blob/perf/auth-request-dedup/docs/development/AUTH_REQUEST_DEDUPLICATION_2026-11-14.md) pada PR #183.
- Runtime reads: snapshot PvP localhost turun sekitar 30%; notifikasi paket
  metadata besar sekitar 97%. Grup projection versi cloud turun sekitar 33%,
  metadata paket sekitar 88%. Lihat [metode](RUNTIME_READ_PAYLOAD_2026-11-14.md).

Dokumen Auth berada di branch PR #183; dokumen tiap PR lain tersedia pada branch
masing-masing sampai merge. Semua persentase di atas berlaku pada sampel yang
diukur, bukan persentase Usage atau kuota organisasi.

## Keputusan yang dipertahankan

**ENGINEERING DECISION:** PostgreSQL tetap durable truth; Redis/cache hanya
ephemeral. Tidak menambah cache untuk permission, status attempt, release ilmiah,
timer atau score demi mengurangi query. Content cache yang sudah ada tetap
memakai invalidasi/revisi konten dan validasi create-room otoritatif.

Boundary transaksi dipertahankan untuk mutation + outbox, grading + immutable XP,
single-use token, class membership, version pin dan idempotency. Pemanggilan R2
di luar transaksi ditangani khusus #175; tidak menambah satu transaksi besar
yang membungkus seluruh read/list atau network operation.

Worker notifikasi lima detik merupakan keputusan scope yang sudah disetujui.
Sweep PvP satu detik dan recovery Tryout existing tetap dipertahankan. Tes dan
model idle membedakan query count dari returned bytes. Tidak ada bukti jumlah
instance worker produksi atau atribusi GB per proses yang membenarkan backoff
atau leader baru pada checkpoint ini.

## Langkah setelah integrasi

**PROPOSED — urutan tindak lanjut operasional:**

1. Review/merge PR secara bertahap, jalankan CI pada hasil integrasi dan catat SHA
   akhir. Periksa konflik dengan PR fungsional yang masih terbuka.
2. Build/deploy API serta worker yang berubah. Pengujian development lokal harus
   memakai kode baru; merge Git saja tidak mengubah proses yang sedang berjalan.
   PR #175/#176/#177/#179/#182/#183 dan runtime projection ini tidak menambah
   migration/environment.
3. Catat proyek, waktu WIB/UTC, SHA, konfigurasi, jumlah instance dan skenario
   request. Development lokal yang memakai proyek Supabase bersama menyumbang
   Usage proyek tersebut; pisahkan jendela dari QA/operator/bulk import.
4. Bandingkan Usage/transfer pada trafik sebanding sesudah pembaruan metrik,
   beserta query count, error, backlog dan correctness. Total billing cycle yang
   sudah terpakai tidak berkurang karena optimasi baru.
5. Prioritaskan profiling baru berdasarkan byte/frekuensi aktual. Q26 publication/
   readiness, Q27 curated-video cache, index/EXPLAIN, discovery checkpoint dan
   worker duplication tetap kandidat terukur, bukan kewajiban mengubah semua
   query atau menghapus guard. Kebijakan akademik OPEN tidak ditebak.

Pada pekerjaan PR #182/#183 dan runtime projection ini tidak ada merge,
deployment, perubahan billing, atau mutasi bisnis cloud yang dijalankan otomatis.
Pengukuran cloud menggunakan
transaksi read-only, dan seluruh fixture/regresi memakai localhost.
