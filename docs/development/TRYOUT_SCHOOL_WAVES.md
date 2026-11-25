# Gelombang dan akses Tryout - 25 November 2026

**ENGINEERING DECISION - persetujuan pemilik:** batch baru memakai gelombang Admin dengan pasangan versi original/varian tetap. Target adalah sekolah terpilih atau Mandiri, tanpa fallback sekolah lain. Identitas sekolah berasal dari keanggotaan kelas aktif; sekolah nonaktif tidak menjadi Mandiri. Satu kesempatan per akun/sekolah/gelombang atau satu Mandiri; lintas sekolah boleh, lintas sekolah-Mandiri tidak. Kesempatan terpakai saat attempt dibuat, termasuk bila kemudian dihentikan. Gelombang baru tidak menghapus exposure.

Sekolah memakai roster 50/50 saat publikasi; Mandiri dialokasikan seimbang saat start dengan assignment persisten. Batch lama tanpa gelombang mempertahankan aturan 11 November. Riwayat, sesi dan XP lama tidak berubah. Original/varian, roster dan hak pengerjaan tidak direset melalui edit penerima. Paparan keluarga soal sebelumnya tidak menjadi evidence independen baru; tidak mengubah parameter ilmiah atau menggabungkan kalibrasi lintas batch.

**OPEN:** parameter ilmiah, linking dan pemetaan tetap mengikuti dependency Data/AI existing. Pengujian lokal tidak membuktikan aktivasi cloud.

Konfigurasi dan penerima batch bergelombang dikunci saat publikasi untuk menjaga roster. Jadwal tutup masih dapat diperpanjang melalui aksi existing; stop dan batal tetap tersedia sesuai lifecycle.

## Aktivasi dan verifikasi

Migrasi `0081_tryout_school_waves.sql` harus diterapkan sebelum API/worker baru. Pasangan gelombang immutable; batch lama tidak diberi gelombang otomatis. Pemilihan exposure berdasarkan delivery pertama hanya berlaku untuk batch bergelombang; semantik snapshot legacy dipertahankan.

Verifikasi lokal: suite batas batch dan skenario HTTP/PostgreSQL terpilih menguji targeting, roster, multisekolah, race start lintas batch, dua arah perpindahan sekolah/Mandiri, balance Mandiri, exposure pertama/ulang dan periode baru. Suite browser Admin mencakup viewport 320/390/768/1440, keyboard dan axe. Tes lain yang tidak dipilih bukan acceptance. Tidak ada migrasi cloud atau deployment.

Hasil akhir 26 November 2026: 10 tes backend terpilih lulus (30 kasus lain tidak dipilih), 6 tes browser produksi terpilih lulus, dan 4 tes adapter IRT lulus. Lint repo, typecheck database/API/Web/orchestration, build database/assessment-engine/orchestration/API/worker/Web, validasi 17 kontrak dan pengecekan generated types lulus. Build Web awal dihentikan pengingat kerentanan Next.js existing; pengulangan build berhasil. Pembaruan dependency keamanan terpisah tetap diperlukan. Ini bukan penerimaan pipeline ilmiah penuh atau rilis produksi.
