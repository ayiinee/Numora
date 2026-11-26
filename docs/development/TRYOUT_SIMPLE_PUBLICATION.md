# Tryout: publikasi teknis dan pool paket

**ENGINEERING DECISION — keputusan pemilik, 26 November 2026.** Khusus Tryout,
kelengkapan teknis menggantikan approval Kurikulum, bukti editorial, review manusia,
blueprint akademik, `CONTENT_VALID`, relasi generator dan catatan
`content_import_versions` sebagai syarat publikasi/distribusi. Aturan modul lain
tetap berlaku. Kelengkapan bukan bukti validitas anchor atau linking IRT.

## Alur

1. Upload/susun paket DRAFT, periksa preview dan masalah per nomor soal.
2. Perbaiki struktur, kunci, pembahasan, media atau scoring yang belum lengkap.
3. Terbitkan paket. Server memeriksa ulang, memasang rubrik yang sudah didukung dan
   membekukan versi. Revisi berikutnya menghasilkan versi baru.
4. Buat gelombang/batch dengan 1–5 paket unik. Parent dan asal generator bebas.
5. Pilih sekolah berdasarkan ID, atau target Mandiri. Setiap target mempunyai
   subset paket tersendiri. Publikasi batch terpisah dari publikasi paket.
6. Saat siswa mulai, pool target dikunci, paket dengan assignment paling sedikit
   dipilih; kandidat seri dipilih acak. Assignment, attempt, claim dan event berada
   dalam satu transaksi. Pengulangan request menggunakan attempt yang sama.

Sekolah ditentukan dari keanggotaan kelas aktif. Sekolah tanpa siswa boleh
ditargetkan; siswa yang kemudian bergabung langsung mengikuti aturan akses yang
sama. Siswa dengan kelas aktif tidak dapat memakai target khusus Mandiri.

Durasi attempt baru 4.500 detik, dibatasi waktu tutup batch. Resume menggunakan
paket/deadline yang dipin. Attempt ditinggalkan tetap dihitung dalam alokasi;
transaksi gagal tidak dihitung. Dari pool kosong, 200 start pada lima paket
menghasilkan 40 assignment per paket.

## Kontrak

**ENGINEERING DECISION — instruksi UI pemilik, 26 November 2026.** Detail paket
Tryout menempatkan publikasi dan ekspor PDF pada bar atas bersama Kembali ke
daftar. Batch Tryout, komposisi/pengaturan, akses siswa, syarat penerbitan dan
generator berada dalam menu titik tiga. Identitas dan kelengkapan memakai
ringkasan padat yang menyesuaikan layar. Aturan API dan otorisasi tetap berlaku.

- `packageIds`: 1–5 UUID unik.
- `schools`: `{ schoolId, packageIds }[]`; subset tidak boleh kosong.
- `mandiriPackageIds`: subset; array kosong menutup target Mandiri.
- `waveId` atau `newWaveTitle` memilih/membuat satu gelombang.
- `startsAt`/`closesAt` dikirim sebagai timestamp berzona; UI memakai WIB.
- `issues`: kode, nomor soal, field dan pesan perbaikan dari validator teknis.

Payload lama diterjemahkan ke pool selama rollout. Field lama dan baru yang
bertentangan ditolak. Konfigurasi pool tidak dapat diubah setelah batch terbit.
Batch boleh dimulai di masa lalu selama belum ditutup; konfirmasi UI menyebut
ketersediaan langsung. Penghentian/perpanjangan menggunakan endpoint existing.

## Penyimpanan dan rilis

Migrasi `0083_tryout_simple_publication_pools.sql` menambah daftar paket gelombang
dan pool per batch/target. Delegasi single/pair lama dikonversi tanpa mengganti
ID batch, assignment, claim, hasil atau XP. Kolom lama disimpan untuk kompatibilitas.
Riwayat yang mempunyai lebih dari lima paket tidak dipotong.

Jalankan migrasi melalui workflow repository, kemudian build/restart API, worker
dan web dari commit rilis yang sama. Pastikan commit proses aktif, bukan hanya
checkout Git. Jangan mengaktifkan konfigurasi pool lebih dari dua paket saat API
lama masih melayani request. SQL bypass sekolah lama bukan jalur operasional.

Sebelum rilis: jalankan pemeriksaan kontrak, lint/typecheck/build, tes migrasi dan
integrasi lokal, lalu E2E upload → perbaikan → publikasi → batch → gabung kelas →
start → submit → hasil. CI hijau dan review tetap diperlukan. Pengujian lokal
tidak membuktikan versi API yang sedang berjalan di VPS.

IRT tetap memakai analisis dan fallback existing, dengan hasil paling lambat
72 jam setelah tutup batch. Jangan membuat theta/linking atau approval palsu.
Konten, hasil, XP dan deadline attempt historis tidak dihitung ulang.
