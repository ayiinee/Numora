# SIS-001 — triase retest kandidat

## SIS-001-VOL-RETEST-001 — volume 100k belum selesai

- Jenis: performa aplikasi/eksperimen lokal; belum ada SLO produksi. Status: OPEN, volume BLOCKED pada B dan C.
- Versi: branch fix/qa-volume-candidate-retest-20261027, base 598ab47bcba7d79bae9c170b18ee394878397bb5. B hanya patch worker; C worker + alat QA.
- Reproduksi: ikuti setup lokal dan dedicated test guard, lalu jalankan `pnpm qa retest --scenario SIS-001 --profile full --session SESSION_ID` pada checkout kandidat. Pakai sesi lokal yang sesuai; full runner membuat database/prefix milik run dan membangun artefak. Pertahankan konfigurasi 1k/10k/100k, batch 10, drain 120 detik dan full 3600 detik. Retest tanpa perubahan hanya untuk investigasi yang sengaja dipilih dengan `--diagnostic`.
- Expected eksperimen: seluruh event setiap tahap terkirim dan identitas/isi dapat direkonsiliasi dalam batas yang disepakati. Ini kriteria pengukuran lokal, bukan jaminan kapasitas produksi dari PRD.
- Actual: 1k/10k PASS. B 100k terkirim 5.450, pending 94.550; C 100k terkirim 15.030, pending 84.970. Event delivered tidak berbeda isinya; pending tetap tercatat. Failed event sintetis 0; deadlock counter 0.
- Bukti: result/volume-evidence tiap run, volume-analysis.json, RETEST_REPORT.md. Plan pascarun memakai pending index dan incremental sort; temp_bytes 0. Ini tidak membuktikan seluruh biaya pemrosesan sudah kecil atau menjelaskan timing setiap transaksi.
- Dampak: eksperimen volume wajib belum lengkap; jangan menyatakan full lulus atau kapasitas tertentu. Backlog yang diperiksa tidak sama dengan kehilangan event.
- Tindak lanjut developer/QA: profil seleksi event, transaksi/commit, round-trip dan pola timestamp. Evaluasi perubahan berikutnya secara terpisah; jangan menaikkan timeout/limit batch agar hasil tampak hijau. Kandidat existing belum diterapkan pada checkout utama.

## SIS-001-HTTP-RETEST-002 — respons submit tidak diketahui klien saat stress

- Jenis: performa aplikasi/lingkungan belum terisolasi. Status: OPEN, load BLOCKED pada B dan C. Tidak ada atribusi kausal kepada patch worker.
- Reproduksi: versi dan perintah full sama seperti di atas. k6 memakai 10/25/50/100 VU, kemudian stress 250 VU, tiap tahap 60 detik. Request timeout 15 detik dan safety stop http_req_failed <20% setelah 60 detik tetap seperti baseline.
- Expected eksperimen: penyelesaian Drill dapat diakui klien serta dicocokkan dengan hasil/XP/outbox; pengukuran harus lengkap untuk dinilai selesai. Safety stop atau nol completed berarti incomplete.
- Actual B: load mengakui 382 penyelesaian; stress start accepted 0/784. Stress dihentikan karena error HTTP sekitar 75,82%; request timeout terlihat di endpoint start attempt.
- Actual C: load mengakui 844 penyelesaian dan error HTTP 0. Stress mengakui 277 start serta 2.770 jawaban, tetapi submit accepted 0 dan failed 250; 27 iterasi terinterupsi. Stress error HTTP sekitar 7,05%, tanpa completed yang diakui. Jangan mengubah parameter untuk memaksa lulus.
- Durabilitas tambahan: setelah API load dimulai, B memiliki 425 GRADED dan 350 IN_PROGRESS; C memiliki 1.121 GRADED. Semua GRADED yang diperiksa mempunyai satu ledger XP dan satu outbox completion. Completed k6 tidak boleh diganti dengan jumlah GRADED database.
- Bukti: http-acknowledgement-summary.json, loadReconciliation pada volume-analysis.json, metrics load pada result.json. Log mentah timeout tetap lokal/ignored. Identitas attempt per respons belum direkam k6; pemetaan satu per satu request timeout belum tersedia.
- Dampak: pengguna dapat tidak mengetahui bahwa hasil sudah tersimpan. Ini memerlukan investigasi respons lambat/timeout dan verifikasi retry/idempotensi berbasis attempt ID, bukan klaim data hilang atau seluruh submit berhasil dari exit code.
- Tindak lanjut: korelasikan attempt ID, waktu menerima request, commit dan pengiriman respons pada fixture tes; bedakan aplikasi, antrean koneksi dan kondisi perangkat. Pertahankan hasil B/C serta kegagalan awal.

## Pekerjaan yang tetap terbuka

Dependency tetap 31 temuan (critical 2, high 8, moderate 17, low 4), dengan hasil audit FAIL. Review PIC penggunaan workflow tetap selesai sesuai persetujuan pengguna; perbaikan dependency tidak dilakukan dalam retest ini. Manual keyboard tetap NOT_RUN dan memerlukan manusia. Lokal bukan staging/produksi dan auth fixture bukan Google login nyata.

## Verifikasi alat QA

Worker 4/4 PASS; workflow 39/39 PASS, tanpa skip. Verifikasi runtime terhalang hanya membuat 1.000 event: tahap 1k BLOCKED, 10k/100k NOT_RUN, tanpa insert kedua tahap tersebut. PASS pada verifikasi ini menilai kendali harness, bukan kapasitas aplikasi. Validator tambahan sempat salah membandingkan tipe Result driver dengan Array; koreksi dan pemeriksaan ulang READ ONLY disimpan, tanpa mengulang eksperimen.
