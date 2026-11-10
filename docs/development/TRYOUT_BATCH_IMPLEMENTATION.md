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


## Delegasi batch terbit - keputusan pemilik, 11 November 2026

**ENGINEERING DECISION - instruksi pemilik:** penerima sekolah/Mandiri dapat diubah selama batch belum berakhir atau dibatalkan, termasuk saat berjalan. Perubahan hanya memengaruhi start baru. Daftar versi paket, paket utama, isi, jadwal mulai dan attempt existing tetap dipin. Mutasi khusus penerima memakai Content capability, expectedRevision, row lock, transaksi dan audit; batch tutup/batal ditolak.


## Perpanjangan batch berjalan - keputusan pemilik, 11 November 2026

**ENGINEERING DECISION - instruksi pemilik:** Content Admin dapat memperpanjang batch yang sedang OPEN dan belum berakhir/dibatalkan/difinalisasi. Waktu tutup baru wajib lebih akhir; jadwal tidak boleh overlap dengan batch terbit lain. Cutoff dan tenggat hasil (tutup baru +72 jam) berubah atomik memakai expectedRevision, advisory/row lock dan audit. Waktu mulai, versi paket, assignment, deadline attempt existing, hasil dan XP tidak berubah; durasi start baru tetap 10 menit dibatasi tutup baru. Batch yang telah berakhir tidak dapat dibuka kembali.


### Verifikasi perubahan 11 November 2026

Enam tes API terpilih (termasuk integrasi HTTP/PostgreSQL throwaway lokal) dan empat skenario browser fixture lolos setelah retest. Cakupan: fallback sekolah aktif, delegasi start baru dan pin attempt lama, otorisasi, rollback, konflik/replay, audit, paket frozen, perpanjangan tanpa overlap, tenggat hasil serta penolakan batch tutup/batal. Dua puluh lima kasus API lain tidak dijalankan oleh filter. Kontrak/tipe generated diperbarui; lint, typecheck dan build terkait diperiksa. Ini bukan acceptance IRT atau browser dengan seluruh layanan produksi. Penerapan memerlukan migrasi 0066 dan 0067 melalui workflow migrasi normal, lalu restart API. Database aplikasi/cloud tidak dimodifikasi oleh tes ini.
