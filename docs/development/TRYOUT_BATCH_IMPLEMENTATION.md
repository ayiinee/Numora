# Batch Tryout dan delegasi — 10 November 2026

**ENGINEERING DECISION — persetujuan pemilik:** pelaksanaan Tryout dipisahkan dari bank paket. Batch memiliki jadwal bebas, beberapa paket, akses Mandiri opsional dan satu delegasi paket per sekolah. Delegasi adalah alokasi Admin, bukan randomisasi eksperimen. Banyak penerima dapat memakai paket yang sama tanpa membuat arm baru.

Implementasi menyediakan `/admin/tryout-batches` beserta halaman tambah/detail dan modal konfigurasi. API Admin memakai capability Content. Paket harus lulus validasi distribusi dan policy existing. Pemeriksaan revisi, transaksi, advisory lock dan exclusion constraint mencegah publikasi jadwal bertabrakan. Interval jadwal setengah terbuka: batch berikutnya boleh mulai tepat saat batch sebelumnya tutup. Konfigurasi, roster dan delegasi terkunci setelah mulai; pembatalan hanya sebelum mulai.

Siswa memakai API berbasis batch. Server memilih paket dari keanggotaan aktif dan delegasi, lalu menyimpan assignment dan attempt dalam transaksi yang sama. Siswa multisekolah memilih sekolah, bukan paket. Resume memakai assignment awal. Penerbitan batch Admin pertama mengaktifkan routing baru secara permanen, termasuk setelah batch itu dibatalkan; start berbasis paket lama kemudian ditolak, sementara resume dan riwayat lama dipertahankan. Jadwal paket lama tidak dimigrasikan otomatis.

**OPEN — finalisasi hasil multi-paket:** integrasi finalizer Data/AI belum tersedia. Status hasil menampilkan `MULTI_PACKAGE_FINALIZATION_NOT_READY`, dengan tenggat 72 jam setelah tutup. Hasil dan media pembahasan tidak dibuka melalui jalur finalisasi satu paket lama. Delegasi tidak menghasilkan assignment eksperimen acak atau klaim kesetaraan nilai. Pengujian paket variant arm V2 dengan pipeline ilmiah penuh masih merupakan penerimaan terpisah; bukti integrasi tahap ini memakai paket impor non-demo.

## Verifikasi lokal

- Tiga tes API/unit terpilih lulus: satu integrasi multi-paket dan dua tes batas/validasi. Sebanyak 24 kasus lain tidak dijalankan oleh filter.
- Sebanyak 40 tes unit navigasi dan empat tes browser fixture lulus. Browser mencakup pembuatan batch, delegasi, pilihan sekolah, regresi resume lama, keyboard/axe dan viewport 320/390/768/1440.
- Integrasi menggunakan database throwaway lokal dengan migrasi terbaru dan persetujuan berlabel TEST ONLY.
- Build API, database, assessment-engine dan Web; typecheck worker/orchestration; lint berkas terkait; regenerasi OpenAPI/tipe; serta pemeriksaan whitespace lulus.

Ini bukan penerimaan browser terhubung penuh atau persetujuan akademik.

## Aktivasi

Lingkungan memerlukan migrasi `0055_tryout_batch_delegations.sql`, lalu build/restart API dan worker yang sesuai. Migrasi hanya diuji pada database lokal terisolasi; database cloud dan layanan API pengembangan yang memakai database tersebut tidak diubah. Tidak ada push/deploy. Review manusia dan penerimaan hasil multi-paket tetap diperlukan sebelum rilis penuh.


## Fallback paket utama - keputusan pemilik, 11 November 2026

**ENGINEERING DECISION - instruksi pemilik:** sekolah aktif tanpa delegasi eksplisit memakai paket utama batch. Delegasi sekolah menggantikan pilihan default tersebut. Akses Mandiri tetap diatur terpisah; sekolah nonaktif tidak memperoleh fallback. Paket tambahan boleh belum memiliki penerima. Assignment dan attempt existing tetap dipin; multisekolah memilih sekolah sah. Ini menggantikan aturan sebelumnya yang menolak sekolah tanpa delegasi.
