# SIS-001 — implementasi optimasi worker dan respons submit

Implementasi berada pada branch QA aktif di D:/Dev/Numora. Run baru `5a091494-b077-4a09-95aa-8f06ac18ea21`, parent retest C `581a3c97-fe69-40d3-af72-576b22033593`; sesi `05b7d54a-a708-400b-a8ac-0085f1f39f8c`. Hasil A/B/C, checkout kandidat lama dan konfigurasi eksperimen dipertahankan. Tidak ada commit, push, merge, deploy atau migrasi baru.

## Perubahan yang diterapkan

Worker memakai satu statement CTE atomik untuk memilih maksimal sepuluh event, memasukkan analytics dengan deduplikasi event_id dan mengakui outbox. SKIP LOCKED, urutan deterministik, cooldown dan limit publik tetap berlaku. Jika kelompok gagal, seluruh statement rollback dan fallback per event mengisolasi kegagalan dengan penghitung yang dibatasi limit. Penambahan limit bukan pengganti transaksi kelompok.

Hasil Drill memakai satu projection untuk metadata, reward, hitungan, soal dan jawaban. Kepemilikan difilter pada query; urutan soal, tipe data, DTO, reward historis/legacy, expiry legacy dan rekomendasi skor rendah tetap dipertahankan. Delivery tetap sesudah commit; error delivery tidak ditelan dan tidak membatalkan grading yang sudah committed. Transaksi grading/XP dan pool koneksi tidak diubah.

Prasyarat penyelarasan ORDER BY dan perbaikan alat QA sebelumnya ikut diterapkan. Dokumentasi workflow menjelaskan pengukuran statement bulk dan korelasi attempt/respons. Tidak ada schema/kontrak endpoint/konfigurasi beban baru.

## Verifikasi regresi

- Worker: **25/25 PASS**, tanpa skip. Meliputi rollback INSERT/acknowledgment, fallback poison event, redelivery, urutan/lock, dua consumer, limit dan integritas payload.
- Learning/API yang relevan: **42/42 PASS**, tanpa skip. Tes nyata memeriksa seluruh field hasil, dua query projection+delivery pada skor 80, duplicate submit dan error delivery setelah grading committed.
- Sweep API serial: **237 PASS, 0 FAIL, 1 NOT_RUN**. Tes workbook akademik eksternal memerlukan NUMORA_REAL_XLSX_DIR dan dua file asli yang tidak tersedia; sweep keseluruhan tetap BLOCKED/incomplete, bukan PASS penuh. Kasus ini berada di luar manifest SIS-001.
- Workflow: **39/39 PASS**. Kualitas kode, typecheck, kontrak dan freshness terlihat pada hasil full di bawah.

Kegagalan awal disimpan: satu mock query masih memakai susunan tiga-query lama; fixture diperbarui tanpa mengubah assertion XP/larangan penulisan ulang. Pada sweep paralel berikutnya, fixture TryOut yang mengubah paket global saling mengganggu pada database sama; sweep diulang serial pada database baru dan lulus seluruh kasus yang tersedia. Kedua hasil awal tetap disertakan, tanpa mengubah kode TryOut atau melonggarkan assertion.

## Profil worker pada database baru

| Ukuran antrean | Event diukur | Statement atomik | Rata-rata ms/event |
| --- | ---: | ---: | ---: |
| 1000 | 200 | 20 | 1.089 |
| 10000 | 200 | 20 | 6.845 |
| 100000 | 200 | 20 | 0.406 |

Setiap kasus merekonsiliasi 200 event tanpa mismatch. Sebelumnya, 200 event memakai 200 transaksi terpisah, satu untuk setiap event; implementasi baru memakai 20 statement CTE / transaksi implisit (90% lebih sedikit transaksi pada sampel ini). Pengamat BEGIN eksplisit tidak menghitung transaksi implisit ini. Label scope lama di raw worker profile masih menyebut 200 transaksi; hitungan aktual ditentukan oleh trace 20 CTE dan sudah dikoreksi di ringkasan serta skrip untuk pemakaian berikutnya. Variasi startup/cache dan satu sampel per ukuran membatasi klaim peningkatan kapasitas; hasil 10k yang lebih lambat tetap ditampilkan.

## Profil respons submit langsung

| Gelombang | Respons 201 | Klien p95 (s) | Hasil pascacommit p95 (s) | Ledger rusak | Completion rusak |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | 10 | 0.321 | 0.046 | 0 | 0 |
| 250 | 250 | 6.816 | 4.418 | 0 | 0 |

Profil sebelumnya mencatat p95 klien 14,730 detik pada gelombang 250; perbandingan ini observasi lokal dengan pola yang sama, bukan SLO produksi atau estimasi statistik. Retry satu attempt per gelombang tetap menghasilkan satu ledger dan satu completion event. Query autentikasi dan rekomendasi berada di luar budget dua query pembentuk hasil.

## Full SIS-001 setelah optimasi

Hasil keseluruhan: **FAIL**. Eksekusi setelah build: **845.0 detik** dari batas 3.600 detik.

| Pemeriksaan | Retest C | Optimasi |
| --- | --- | --- |
| quality | PASS | PASS |
| rewards | PASS | PASS |
| components | PASS | PASS |
| persistence | PASS | PASS |
| connected | PASS | PASS |
| accessibility | PASS | PASS |
| variety | PASS | PASS |
| recovery | PASS | PASS |
| velocity | PASS | PASS |
| volume | BLOCKED | PASS |
| load | BLOCKED | PASS |
| dependencies | FAIL | FAIL |
| manual-keyboard | NOT_RUN | NOT_RUN |

| Event ditambahkan per tahap | Drain (detik) | Delivered kumulatif | Pending | Mismatch |
| --- | ---: | ---: | ---: | ---: |
| 1000 | 0.516 | 1000 | 0 | 0 |
| 10000 | 3.948 | 11000 | 0 | 0 |
| 100000 | 29.002 | 111000 | 0 | 0 |

Rekonsiliasi volume tambahan READ ONLY: source **111000**, delivered **111000**, pending **0**, mismatch identitas/isi **0**, processed tanpa analytics **0**. Bukti ini terpisah dari respons HTTP dan grading.

| Fase | Submit diterima | HTTP p50 (s) | HTTP p95 (s) | HTTP p99 (s) | Request/detik | Error HTTP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| load (10/25/50/100 VU) | 2853 | 0.166 | 0.695 | 1.308 | 125.36 | 0.00% |
| stress (250 VU) | 807 | 1.106 | 4.047 | 4.929 | 147.54 | 0.00% |

Distribusi HTTP mencakup seluruh request alur k6; angka ini terpisah dari latensi endpoint submit langsung di profil sebelumnya. Rekonsiliasi load/stress: `{"graded":3660,"broken":0,"accepted":3660}`. Seluruh submit yang diterima harus cocok dengan hasil GRADED, tepat satu ledger XP dan satu completion event.

Dependency: `{"vulnerabilities":{"info":0,"low":4,"moderate":17,"high":8,"critical":2}}`. Manual keyboard **NOT_RUN**. Persetujuan penggunaan workflow tetap selesai; dependency dan manual tidak otomatis lulus karena optimasi. Lokal dengan auth fixture sintetis tidak membuktikan Google login, staging atau produksi.

Batas asli dipertahankan: volume 1k/10k/100k, batch 10, drain 120 detik, request timeout 15 detik, VU 10/25/50/100 kemudian 250, tahap 60 detik dan full 60 menit di luar setup/build. Tidak ada hasil lama yang ditimpa atau digabung menjadi kelulusan versi baru. Identitas/fingerprint dan perubahan lokal dicantumkan pada result.json.

## Artefak dan langkah berikutnya

Paket berisi patch source/test/QA, ringkasan regresi (termasuk kegagalan awal dan fixture yang belum tersedia), result/report/findings/handoff run baru, serta ringkasan profil dan rekonsiliasi. Raw log, dump, browser state dan kredensial tetap ignored. Temuan yang masih FAIL/BLOCKED/NOT_RUN tetap terbuka; tidak ada klaim kelulusan penuh hanya dari optimasi atau benchmark.

Langkah lokal yang direkomendasikan: triase dependency yang masih FAIL, prioritaskan dua critical dan delapan high, lalu susun ruang lingkup remediasi dan regresinya. Pemeriksaan keyboard tetap memerlukan QA manusia. Sesi baru menyimpan tindakan berikutnya dan tautan ke retest C; cukup gunakan prompt Lanjut untuk memulai triase tersebut.
