# SIS-001 — retest kandidat worker dan alat QA

Role siswa. Pengujian dilakukan pada checkout terpisah di branch `fix/qa-volume-candidate-retest-20261027`, dari commit `598ab47bcba7d79bae9c170b18ee394878397bb5`. Checkout aktif dan bukti awal tetap utuh. Kandidat hanya diterapkan pada checkout uji; belum dipromosikan, di-push, di-merge atau di-deploy.

## Hasil utama

- Tahap B (patch worker, harness original): **FAIL**, volume **BLOCKED**. Run `e9335d05-792f-4bb3-b8e3-a9594c5b2576`, parent `c4d65512-857c-41b9-bd20-0a9181066e0c`.
- Tahap C (patch worker + alat QA): **FAIL**, volume **BLOCKED**. Run `581a3c97-fe69-40d3-af72-576b22033593`, parent `e9335d05-792f-4bb3-b8e3-a9594c5b2576`.
- Regresi worker **4/4 PASS**, tanpa skip; regresi workflow setelah patch QA **39/39 PASS**, tanpa skip.
- Verifikasi penghentian eskalasi runtime: **PASS**, metode `negative-runtime-check`. Hasil diagnostik negatif, bila digunakan, membuktikan kendali harness; bukan kelulusan kapasitas aplikasi.

**Keputusan berdasarkan bukti:** kandidat belum cukup untuk menutup temuan volume 100k. C memproses 15.030 event gelombang 100k dibanding B 5.450, tetapi masing-masing masih menyisakan 84.970 dan 94.550 event. Selisih ini observasi satu run tiap versi, bukan klaim peningkatan kapasitas yang terisolasi. Keduanya tetap BLOCKED.

## Cakupan full dibanding baseline

| Pemeriksaan | A: original | B: worker | C: worker + QA |
| --- | --- | --- | --- |
| quality | PASS | PASS | PASS |
| rewards | PASS | PASS | PASS |
| components | PASS | PASS | PASS |
| persistence | PASS | PASS | PASS |
| connected | PASS | PASS | PASS |
| accessibility | PASS | PASS | PASS |
| variety | PASS | PASS | PASS |
| recovery | PASS | PASS | PASS |
| velocity | PASS | PASS | PASS |
| volume | BLOCKED | BLOCKED | BLOCKED |
| load | PASS | BLOCKED | BLOCKED |
| dependencies | FAIL | FAIL | FAIL |
| manual-keyboard | NOT_RUN | NOT_RUN | NOT_RUN |

Waktu eksekusi setelah build: B 1450.5 detik, C 954.8 detik. Batas masing-masing tetap 3.600 detik. Waktu pemeriksaan volume: B 202.5 detik, C 197.1 detik; angka ini mencakup insert, drain, observasi dan rekonsiliasi, bukan waktu query saja. Drain per tahap tetap 120 detik, batch 10; volume tetap 1.000 / 10.000 / 100.000.

## Data volume setelah run

| Tahap | Ukuran gelombang | Dibuat | Diproses | Pending |
| --- | ---: | ---: | ---: | ---: |
| B | 1000 | 1000 | 1000 | 0 |
| B | 10000 | 10000 | 10000 | 0 |
| B | 100000 | 100000 | 5450 | 94550 |
| C | 1000 | 1000 | 1000 | 0 |
| C | 10000 | 10000 | 10000 | 0 |
| C | 100000 | 100000 | 15030 | 84970 |

Tahap B memakai fixture lama; kelompok gelombang direkonstruksi dari jeda occurred_at >1 detik dan perlu cocok dengan ukuran konfigurasi. Tahap C memakai stageId/stageSize/runId eksplisit. Eksperimen tetap kumulatif: baris processed tahap sebelumnya tetap tersimpan. Tahap yang NOT_RUN tidak boleh dianggap sebagai bukti volume lulus.

| Tahap | Source sintetis | Delivered | Pending | Isi berbeda | Processed tanpa analytics | Pending dengan analytics |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| B | 111000 | 16450 | 94550 | 0 | 0 | 0 |
| C | 111000 | 26030 | 84970 | 0 | 0 | 0 |

Rekonsiliasi tambahan dilakukan READ ONLY setelah run, mencocokkan event ID, nama/versi, payload, entity, actor, correlation dan occurred_at. Pending yang masih ada tetap memerlukan pengiriman; nol mismatch pada delivered bukan bukti seluruh pending sudah berhasil dikirim.

## Temuan HTTP dan durabilitas tambahan

Tahap B menemukan request timeout saat POST pembuatan attempt. Stress 250 VU dihentikan oleh ambang keselamatan existing (http_req_failed <20%, evaluasi setelah 60 detik), tanpa submit sukses pada fase stress. Ini merupakan temuan baru terhadap baseline yang harus tetap terlihat. Sumber masalah belum diisolasi antara aplikasi dan kondisi lingkungan; nol integrity error pada respons yang diterima tidak menyelesaikan kasus request timeout.

| Tahap | Status load | Completed dilaporkan k6 | GRADED di DB | Ledger bermasalah | Outbox bermasalah |
| --- | --- | ---: | ---: | ---: | ---: |
| B | BLOCKED | 382 | 425 | 0 | 0 |
| C | BLOCKED | 844 | 1121 | 0 | 0 |

Pemeriksaan tambahan memilih attempt berdasarkan started_at setelah proses API load milik run dimulai, dalam database milik run tersebut. Client timeout dapat meninggalkan hasil commit yang tidak diketahui klien. k6 belum menyimpan daftar attempt ID per respons, sehingga tabel ini bukan pemetaan satu per satu semua request yang timeout dan tidak mengubah BLOCKED menjadi PASS. Status attempt yang belum GRADED tersedia di JSON analisis; jangan menyebutnya kehilangan data tanpa investigasi.

Pada stress C, k6 mencatat 277 start diterima dan 2.770 jawaban diakui. Submit yang selesai diperiksa klien: 0 diterima, 250 gagal; 27 iterasi terinterupsi. Seluruh fase C mencatat 1.121 GRADED, lebih banyak daripada 844 penyelesaian yang diakui k6. Hal ini menunjukkan kasus commit dengan hasil yang belum diketahui klien dan perlu investigasi waktu respons/timeout serta pemetaan attempt ID; bukan alasan untuk mengganti completed k6 menjadi angka database. C load 10–100 VU memiliki error rate 0; stress memiliki sekitar 7,05% error HTTP dan nol completed yang diakui, sehingga tetap BLOCKED.

## Bukti dan batas interpretasi

Empat regresi worker mencakup urutan timestamp/UUID, SKIP LOCKED, redelivery, rollback, cooldown dan dua consumer. Hasil lengkap beserta fingerprint, lingkungan, kualitas kode, browser, pemulihan, velocity dan beban HTTP tersedia dalam folder B/C pada paket laporan. Persentil latency volume existing tetap kumulatif.

Baseline A berasal dari run `c4d65512-857c-41b9-bd20-0a9181066e0c`; B/C memakai commit QA yang sudah diperbarui oleh pengguna. Kode aplikasi sebelum kandidat sama, tetapi working tree Windows baru menggunakan CRLF. Perbedaan line ending diverifikasi sebagai perbedaan encoding teks; baseline hash byte dan fingerprint setiap run tetap dicatat apa adanya. Dependensi dipasang dari lockfile secara offline, tanpa perubahan versi.

Layanan tes awalnya berhenti. PostgreSQL menyelesaikan recovery sebelum pengujian. Server tetap 16.14; alat klien backup 16.15. Isi logis clone volume A cocok dengan hash lama setelah recovery. Shared buffers, work_mem, fsync, ukuran beban dan timeout tidak dituning. Perbedaan cache, kondisi perangkat dan urutan run membatasi perbandingan performa: satu run tiap kandidat merupakan observasi lokal, bukan estimasi kapasitas statistik atau SLO produksi.

EXPLAIN exact locking pada bukti analisis tidak mengeksekusi query penguncian. Timing SELECT ekuivalen hanya diagnostik baca setelah run; tidak dipakai sebagai klaim throughput transaksi. Waktu commit per event belum diinstrumentasi secara terpisah.

Plan diagnostik pascarun B dan C sama-sama `Limit → LockRows → Incremental Sort → Index Scan analytics_outbox_pending_idx`. Median query baca ekuivalen: B 0.232 ms, C 0.202 ms. Counter database volume sebelum diagnostik mencatat temp_bytes=0 dan deadlock=0 pada keduanya. Penggunaan indeks terlihat pada statistik; scan penuh oleh harness B tetap besar (sekitar 71,9 juta seq_tup_read outbox versus sekitar 12,7 juta pada C). Counter kumulatif mencakup seluruh pernyataan clone, sehingga bukan atribusi biaya per statement atau penjelasan tunggal sisa backlog. Langkah berikutnya perlu profil transaksi/commit, round-trip dan pemilihan event di bawah pola timestamp aktual; bukan menaikkan timeout atau limit batch.

Validator verifikasi runtime negatif sempat gagal pada perbedaan tipe Array hasil driver postgres; data dan outcome eksperimen cocok. Wadah hasil dinormalisasi, counts diperiksa ulang READ ONLY, dan validasi lulus tanpa mengulang eksperimen. Koreksi validator dicatat dalam JSON verifikasi; kegagalan tooling ini tidak disamarkan sebagai kegagalan aplikasi atau mengganti outcome eksperimen negatif yang memang BLOCKED.

Dependency pada C: `{"vulnerabilities":{"info":0,"low":4,"moderate":17,"high":8,"critical":2}}`. Manual keyboard: **NOT_RUN**, tetap memerlukan pemeriksaan manusia. Persetujuan penggunaan workflow tetap selesai; hasil kegagalan dan perbaikan dependency dicatat terpisah. Auth fixture tidak membuktikan Google login sungguhan; lokal tidak membuktikan staging/produksi.

## Artefak dan kelanjutan

Ringkasan terstruktur: `SIS_001_CANDIDATE_RETEST.json`. Paket laporan: `reports/SIS-001-candidate-retests-20261027`, berisi result/report/findings/handoff tiap run, bukti volume, ringkasan worker/workflow dan analisis baca. Artefak mentah, kredensial, dumps dan browser state tetap lokal/ignored.

Sesi retest: `7692b45d-adef-4740-acc2-971c65f39b70`. Run C menjadi titik lanjut pada checkout kandidat. Jangan mencampur PASS antarversi atau menimpa hasil A/B. Rekomendasi berikutnya: investigasi terarah waktu transaksi worker dan timeout respons submit, dengan korelasi attempt ID serta bukti yang terukur. Kandidat belum diterapkan pada checkout utama; tidak ada push, merge atau deploy.
