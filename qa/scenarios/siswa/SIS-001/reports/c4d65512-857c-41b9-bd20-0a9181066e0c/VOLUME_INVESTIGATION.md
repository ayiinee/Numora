# SIS-001 — penyebab backlog volume

Investigasi lanjutan pada 27 Oktober 2026 WIB. Run sumber: `c4d65512-857c-41b9-bd20-0a9181066e0c`; sesi siswa `7cbff6b0-2467-4216-8792-67cc990eb369`.

## Kesimpulan

**Bottleneck terverifikasi berada pada pemilihan event PostgreSQL yang dilakukan berulang untuk setiap event.** Query worker saat ini memakai sequential scan dan sort sebelum mengambil satu baris. Pada snapshot ini, query baca ekuivalennya memindai 111.011 baris, menyeleksi 100.600 pending dan memerlukan sekitar 30 ms. Indeks tersedia, tetapi query saat ini tidak memanfaatkan urutannya untuk menghentikan pencarian lebih awal.

**Desain eksperimen memperbesar dampaknya:** alat QA melanjutkan penambahan 100.000 event setelah tahap 10.000 kehabisan waktu pada database/tipologi antrean yang sama. Sisa event lama tetap didahulukan. Seluruh event tahap 100.000 belum mendapat giliran ketika batas berikutnya tercapai. Jadi run ini belum mengukur drain mandiri 100.000 event dari baseline bersih.

Ada biaya tambahan dari satu transaksi per event dan penghitungan antrean penuh setiap 10 event. Besarnya pengaruh transaksi/commit belum diukur karena investigasi ini tidak menjalankan operasi tulis.

## Bukti data yang tersimpan

| Gelombang sintetis | Dibuat | Terkirim | Pending |
| --- | ---: | ---: | ---: |
| Tahap 1.000 | 1.000 | 1.000 | 0 |
| Tambahan 10.000 | 10.000 | 9.400 | 600 |
| Tambahan 100.000 | 100.000 | 0 | 100.000 |
| Total | **111.000** | **10.400** | **100.600** |

Gelombang direkonstruksi dari kelompok waktu occurred_at dengan jeda antar-burst lebih dari satu detik; tiga jumlahnya cocok dengan konfigurasi generator. Periode: 11:00:23 WIB (1.000), 11:00:27 WIB (10.000), dan 11:02:28 WIB (100.000). Pemrosesan terakhir sekitar 11:04:33 WIB masih menyelesaikan event gelombang kedua.

Semua 100.600 pending sudah retry-ready; failed_at tidak terisi pada event sintetis mana pun. Rekonsiliasi menemukan:

- processed tanpa analytics: **0**;
- pending yang ternyata sudah memiliki analytics: **0**;
- perbedaan isi/identitas pada event yang sudah delivered: **0**;
- 11 event baseline non-eksperimen juga sudah diproses.

Ini membuktikan event yang diperiksa masih tercatat dan pasangan delivered konsisten. Ini bukan bukti bahwa seluruh pending sudah berhasil dikirim.

## Bottleneck query dan indeks

Sumber worker: `apps/worker/src/outbox.ts:19`, terutama loop pada baris24, transaksi27 dan urutan query35–37. Kode build yang dipakai run juga diperiksa dan mempunyai pola yang sama.

```sql
WHERE processed_at IS NULL
  AND (failed_at IS NULL
       OR failed_at <= clock_timestamp() - interval '5 minutes')
ORDER BY occurred_at, id
LIMIT 1
FOR UPDATE SKIP LOCKED
```

Indeks existing (`packages/database/src/schema/operations.ts:17`) adalah `(processed_at, occurred_at)`, disertai primary key id. Plan exact worker diperiksa dengan **EXPLAIN tanpa ANALYZE**, sehingga SELECT FOR UPDATE tidak dieksekusi:

```text
Limit 1 → LockRows → Sort(occurred_at, id) → Seq Scan
```

Query baca tanpa row-lock dijalankan tiga kali dalam transaksi READ ONLY. Waktu execution: **29,725 / 30,375 / 30,444 ms**, dengan 2.463 shared-hit block per eksekusi. Median 30,375 ms. Ini waktu query baca, bukan durasi transaksi worker.

Sebagai pembanding diagnostik, penambahan kolom urutan yang konstan untuk semua pending menghasilkan:

```sql
-- PROPOSED, diagnostik baca saja; aplikasi belum diubah
ORDER BY processed_at, occurred_at, id
```

Plan exact dengan locking yang sama berubah menjadi:

```text
Limit 1 → LockRows → Incremental Sort → Index Scan analytics_outbox_pending_idx
```

Eksekusi varian **tanpa locking**: **0,341 / 0,224 / 0,383 ms**, median 0,341 ms, sekitar 89 kali lebih cepat untuk pembacaan ini. Hanya sekitar 173 baris indeks yang dibaca; urutan 1.000 kandidat pertama cocok dengan query awal pada snapshot yang sama. Karena processed_at dibatasi IS NULL, tambahan leading order key tersebut konstan pada kandidat. Namun perilaku concurrent worker, SKIP LOCKED, retry dan durabilitas tetap perlu regresi sebelum kandidat diterapkan.

**Tidak ada klaim throughput worker naik 89 kali.** Query locking/INSERT/UPDATE/COMMIT tidak dijalankan dalam pembandingan tersebut. Alternatif indeks partial `(occurred_at, id) WHERE processed_at IS NULL` juga dapat ditinjau developer, tetapi tidak dibuat atau divalidasi pada investigasi ini.

## Sort, transaksi dan pengamatan antrean

- Snapshot statistik clone sebelum pembandingan full-sort mencatat **580 temporary files, sekitar 9,80 GB temp_bytes**, serta deadlock0. Ini counter kumulatif database, bukan atribusi timing per statement.
- Konfigurasi teramati: work_mem4MB, shared_buffers128MB, fsync/synchronous_commit aktif, track_io_timing nonaktif. Konfigurasi tidak diubah.
- Diagnostik SELECT penuh yang memaksa semua kandidat terurut menunjukkan **external merge di disk**, sekitar225ms dan 1.987 temp-written blocks. Query ini berbeda dari worker (tanpa LIMIT/locking dan memakai parallel plan); nilainya hanya mendukung adanya biaya/spill pengurutan, bukan timing exact worker saat run.
- Snapshot QA (`qa/runtime/pipeline.mjs:77`, `:99–101`) menghitung seluruh antrean setiap batch10; plan baca memindai111.000 event sintetis dan memerlukan **32,34ms**. EXISTS diagnostik hanya sekitar1,07ms, tetapi hanya menjawab apakah backlog masih ada; hitungan/jumlah/usia tetap harus dicatat terpisah.
- `drainOutboxBatch(limit)` tetap membuka **satu transaksi per event**. Menaikkan angka limit saja tidak menjadikannya satu bulk transaction dan dapat memperlambat pemeriksaan batas waktu pada harness.
- Setelah batas waktu tercapai, loop volume menutup koneksi dan berhenti. Pending setelah run tidak berarti consumer aktif yang macet. Tidak ada owned process tersisa pada pemeriksaan akhir. Saat inspeksi tidak ada koneksi lain pada clone, ungranted lock0 dan deadlock counter0; ini tidak mengukur seluruh histori lock wait selama run.

## Usulan perbaikan dan retest

**PROPOSED — belum diterapkan.** Review PIC penggunaan workflow tetap selesai sesuai persetujuan pengguna; daftar berikut adalah pekerjaan teknis, bukan persetujuan ulang untuk memulai QA.

1. **Kandidat worker untuk developer:** selaraskan ORDER BY dengan indeks existing sebagaimana pembanding diagnostik, atau evaluasi indeks partial yang cocok. Pertahankan kondisi retry, tie-breaker id, SKIP LOCKED, transaksi dan idempotensi event_id. Hindari perubahan bulk/concurrency bersamaan sebelum dampak perbaikan query terukur.
2. **Kandidat alat QA:** beri stage ID pada fixture; hentikan eskalasi ketika tahap sebelumnya BLOCKED atau gunakan clone terpisah per ukuran. Bedakan eksperimen kumulatif dan eksperimen baseline per tahap. Kurangi frekuensi full COUNT untuk kontrol loop, sambil tetap mencatat backlog/usia pada interval tetap dan rekonsiliasi akhir. Jangan mengubah batas120detik tanpa keputusan eksplisit.
3. **Retest terarah:** jalankan kandidat worker dengan harness tetap terlebih dahulu. Ukur pemilihan event, waktu batch/commit, throughput, temp spill dan backlog untuk1k/10k/100k; simpan identitas/isi semua event. Lanjutkan uji duplicate delivery, rollback, failed_at/cooldown, dan minimal dua consumer untuk membuktikan tidak ada duplikasi/kehilangan dan urutan kandidat tetap benar ketika locked.
4. Setelah pengaruh query diketahui, uji kandidat observabilitas/isolasi tahap QA sebagai perubahan terpisah. Gunakan runtime, perangkat dan data yang sama serta hindari benchmark lain secara bersamaan.
5. Untuk mengosongkan100.000 event dalam120detik dari antrean bersih diperlukan rata-rata sekitar833event/detik. Ini perhitungan kebutuhan eksperimen, **bukan SLO produk atau jaminan hasil setelah query diperbaiki**. Jika drain masih belum selesai, pertahankan BLOCKED dan laporkan throughput/remaining backlog aktual.

## Batas read-only dan hasil awal

Seluruh pengambilan data memakai transaksi PostgreSQL **READ ONLY** yang diperiksa aktif. Tidak dibuat indeks, tidak menjalankan worker/INSERT/UPDATE/DELETE, tidak mengubah aplikasi, database schema, konfigurasi atau batas eksperimen. Timeout20detik/lock2detik hanya membatasi sesi diagnostik.

Hash logis sebelum dan sesudah seluruh investigasi identik:

- analytics_outbox: 111.011 baris, `b32b4833167f9650a771ada014843d63`;
- analytics_events: 10.411 baris, `2d61aea3b06f434155b1df30798dcbf5`.

File result.json run full sama dengan salinan yang diekspor sebelum investigasi. Volume tetap **BLOCKED**, hasil keseluruhan full tetap **FAIL** karena dependency, dan manual tetap NOT_RUN. Belum ada perbaikan aplikasi atau retest worker kandidat yang dinyatakan lulus. Cache/statistik internal PostgreSQL dapat berubah akibat aktivitas baca; verifikasi immutability di sini mencakup isi logis kedua tabel tersebut.

## Referensi dan artefak

Semua angka berasal dari clone volume milik run ini. Bukti mentah plan tersimpan lokal/ignored: `qa/.local/artifacts/<run-id>/volume-investigation.json`, `volume-comparisons.json` dan `volume-investigation-final-verification.json`. Ringkasan tersanitasi tersedia pada `volume-investigation-summary.json` di folder laporan.

Interpretasi plan/indeks mengikuti [EXPLAIN PostgreSQL16](https://www.postgresql.org/docs/16/using-explain.html), [indeks dan ORDER BY](https://www.postgresql.org/docs/16/indexes-ordering.html), serta [counter statistik kumulatif](https://www.postgresql.org/docs/16/monitoring-stats.html). Pengukuran query diagnostik dan usulan perbaikan dibedakan dari hasil worker produksi.
