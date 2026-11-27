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
daftar. Komposisi, pengaturan dan
generator berada dalam menu titik tiga. Pintasan Batch Tryout dihapus dari detail
paket. Komposisi langsung menampilkan data tanpa ekspansi atau formulir edit;
edit nama, akses siswa dan informasi versi berada dalam Pengaturan. Identitas dan kelengkapan memakai
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


## Editor soal paket ? 26 November 2026

**ENGINEERING DECISION ? instruksi pemilik:** penyuntingan soal paket memakai halaman khusus `/admin/content/versions/:id/edit`, terpisah dari halaman review/laporan. Tab Isi soal, Metadata dan Media mempertahankan draf lokal yang sama, dengan pratinjau pendamping desktop dan tombol pratinjau di layar kecil. Tautan kembali menuju paket asal. Perubahan belum disimpan diperingatkan ketika meninggalkan lewat tautan atau menutup/memuat ulang halaman.

Penyimpanan memakai pemeriksaan dan API revisi impor existing, beserta pin versi sumber, revisi paket dan kunci idempotensi. Paket DRAFT menerima versi baru melalui target impor. Paket terbit tidak diubah: editor membuat versi soal baru di bank soal untuk dipakai pada revisi paket berikutnya. Soal arsip tetap terkunci. Review laporan tidak mencatat keputusan melalui editor ini.


## Penerima batch - 27 November 2026

**ENGINEERING DECISION - instruksi pemilik:** form batch memisahkan sekolah penerima dan siswa Mandiri dalam panel responsif. Sekolah ditambahkan sebelum pilihan paketnya; setiap penerima menampilkan jumlah paket terpilih. Baris paket memuat nama, versi, checkbox dan target klik penuh. Mandiri menampilkan status akses; sekolah tanpa paket mendapat petunjuk memilih minimal satu paket. Kontrak, alokasi, akses dan penguncian setelah publikasi tetap mengikuti aturan existing.

**ENGINEERING DECISION - penyempurnaan pemilik:** pemilihan sekolah memakai modal checklist dengan pencarian nama/kode dan pilih semua hasil. Pilihan baru berlaku setelah Terapkan; Batal tidak mengubah penerima. Pilihan paket sekolah existing dipertahankan, sekolah baru memakai semua paket batch. Baris paket dan tindakan hapus dipadatkan.

## Generate varian: pemilihan anchor

**ENGINEERING DECISION — instruksi UI pemilik, 27 November 2026.** Halaman
`/admin/assessments/tryout/{packageId}/variant/new` memakai tiga tahap: pilih
anchor, tinjau paket, dan hasil generate. Konfigurasi generator dibaca otomatis
dari mapping approved per soal; detail kesiapan tersedia pada tahap tinjau.

- Isi soal tampil langsung dengan renderer matematika existing. Disclosure
  membuka opsi/pernyataan, kategori dan media privat melalui endpoint existing.
- Pencarian, filter terpilih, hapus per anchor dan kosongkan pilihan bekerja lokal.
  Checklist tidak meminta options ulang atau menyembunyikan daftar saat diklik.
- Server memvalidasi ulang lima anchor dan 25 focal saat tinjau dan submit.
  Approval, revisi sumber, versi soal dan digest tetap dipin. Paket hasil tetap DRAFT.
- Retry payload sama mempertahankan operation key. Polling hanya selama GENERATING,
  tanpa request status bertumpuk. Kegagalan menampilkan alasan dan kode kendala.
- Perbaikan backend menyamakan pembacaan `approved_digest` dengan nama kolom SQL,
  serta memeriksa fingerprint idempotensi setelah transaction lock.

Regresi lokal: `pnpm --filter @tka/api test -- src/modules/content/tryout-variant-generation.spec.ts`
dan `pnpm --filter @tka/web exec playwright test e2e/admin-tryout-variant.spec.ts`.
Tes backend memakai SQL mock; tes browser memakai API fixture localhost. Hasilnya
bukan bukti eksekusi generator AI atau acceptance production. Tidak ada perubahan
kontrak API, skema, migrasi, scoring atau publikasi dari perombakan UI ini.
