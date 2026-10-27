# SIS-001 — kesiapan acceptance, 28 Oktober 2026 WIB

**ENGINEERING EVIDENCE.** Tabel ini memisahkan kesiapan lokal, input eksternal,
dan persetujuan produk. Lulus fixture tidak menjadi persetujuan staging/produksi.

| Kebutuhan                               | Kondisi yang diverifikasi                                                                                                                                       | Status                      | Tindak lanjut / penyedia                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL 16 dan Redis 7 lokal         | Doctor menguji konektivitas dan isolasi; layanan tes tersedia                                                                                                   | READY                       | QA menjaga database/prefix/proses per run                                                                                      |
| Node/pnpm, Chromium, k6, dump/restore   | Doctor full berhasil memakai Node terisolasi dan browser tersendiri                                                                                             | READY                       | QA; tidak mengganti runtime global                                                                                             |
| Workbook akademik asli                  | Dua file yang dirujuk tes tersedia pada lokasi Downloads; aktifkan NUMORA_REAL_XLSX_DIR pada regresi parser dan catat digest input                              | AVAILABLE_FOR_PARSER_RETEST | QA memeriksa preservasi isi/metadata/gambar; ini bukan approval Curriculum                                                     |
| Bank, taxonomy dan blueprint akademik   | Fixture READY sintetis tersedia; belum ada bukti pengesahan akademik untuk acceptance skenario ini                                                              | BLOCKED                     | Curriculum/PO menyediakan sumber dan persetujuan berversi sesuai kebutuhan fitur                                               |
| Google login aplikasi nyata             | Auth terhubung saat ini memakai fixture email sintetis; koneksi Google Drive tidak membuktikan OAuth Numora                                                     | NOT_RUN                     | Operator QA dan pemilik konfigurasi OAuth menyediakan akun tes serta callback lingkungan yang terverifikasi                    |
| Staging web/API                         | qa/config.json: enabled=false, baseUrl dan deploymentSha kosong                                                                                                 | BLOCKED                     | Pemilik deployment menyediakan URL, SHA web/API, akun, callback OAuth dan isolasi data                                         |
| Akun siswa A/B, guru/admin pada staging | Hanya akun sintetis lokal yang terkonfirmasi; akun staging belum terkonfirmasi                                                                                  | BLOCKED                     | Pemilik lingkungan/akun menyiapkan akses uji per role tanpa membagikan password/token di laporan                               |
| Integrasi migrasi Admin/runtime         | PR #92 masih open; fixture rehearsal dipin pada a52b9dbb, sama dengan head yang diperiksa. Journal aktif tetap 0000–0040; kandidat gabungan bukan migrasi aktif | OPEN_INTEGRATION            | Developer integrasi menetapkan urutan merge/journal sebelum menerapkan melalui migrator resmi; QA menjalankan rehearsal/replay |
| Keyboard/usability manusia              | Checklist disediakan dalam MANUAL_CHECKLIST.md; belum ada hasil manusia pada build retest                                                                       | NOT_RUN                     | Penguji siswa melakukan desktop/mobile dan mengirim hasil aktual                                                               |
| SLO produksi                            | Belum ditetapkan; k6 menghasilkan baseline lokal                                                                                                                | NOT_DEFINED                 | Pemilik produk/engineering menetapkan target sebelum keputusan kapasitas produksi                                              |

Tidak ada migrasi/seed/tes beban yang dijalankan terhadap cloud Development
untuk menggantikan staging. Review PIC workflow yang telah disetujui tidak
dibuka ulang; kebutuhan bukti deployment/migrasi nyata tetap terpisah.

## Handoff integrasi migrasi

Gunakan `packages/database/src/runtime-admin-candidate.ts` dan arsip provenance
PR #92/#102 untuk rehearsal disposable. Kandidat mempertahankan SQL Admin
0039–0047 lalu runtime 0048/0049 dan guard desimal terakhir. Konfirmasi daftar
hash, urutan journal dan release commit sebelum merge. Jangan mengedit SQL yang
sudah dipakai bersama, menjalankan perubahan dashboard, atau mengklaim persetujuan
developer lain. Enam kasus rehearsal harus diuji ulang pada revisi yang akan dipakai.

## Pemeriksaan ketika staging tersedia

1. Verifikasi URL/TLS, SHA web/API, jenis lingkungan dan data/akun uji.
2. Verifikasi callback Google, login/logout/relogin serta pemetaan role nyata.
3. Jalankan smoke fungsional siswa A/B dan penolakan akses role lain.
4. Cocokkan hasil/XP tersimpan melalui API berotorisasi dan bukti versi yang sama.
5. Simpan laporan staging terpisah. Beban/fault/restore tetap lokal kecuali target
   khusus dan izinnya dinyatakan secara eksplisit.
