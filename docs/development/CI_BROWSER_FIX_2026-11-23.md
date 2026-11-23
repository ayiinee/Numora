# CI browser regression — 23 November 2026

**ENGINEERING DECISION — perbaikan atas permintaan pemilik:** selaraskan fixture
browser dengan kontrak API dan alur Admin existing; tidak mengubah aturan produk.

Run gagal: https://github.com/ayiinee/Numora/actions/runs/45061612958.
Validate, tests, connected dan build-contract berhasil. Enam kasus browser gagal;
quality menolak hasil tersebut sebagaimana mestinya.

- Fixture menganggap `ACTIVE` sebagai status tersimpan. Backend mendefinisikannya
  sebagai semua status selain `ARCHIVED`; akibatnya daftar Tryout fixture kosong.
- Dua kasus lifecycle mencari dialog `Pengaturan paket`, sementara komposisi dan
  pengaturan kini berada pada dialog `Komposisi paket`.
- Pemeriksaan ketersediaan masih mencari label lama di daftar, bukan pesan
  pemulihan pada dialog Akses siswa.
- Kasus legacy mencari field sumber pada detail. Alur existing meminta versi
  perbaikan melalui sumber impor; tes kini memeriksa sumber kosong, petunjuk
  pemulihan dan larangan review soal invalid.

Regresi tambahan memeriksa draft/published dalam daftar aktif serta pemisahan
arsip. Timeout, retry, partisi browser dan quality gate tidak diubah.

Verifikasi lokal: ESLint dan TypeScript berhasil; 15 tes direktori Admin berhasil;
kedua lifecycle mobile/desktop berhasil pada production server dengan fixture.
Kompilasi, TypeScript dan prerender build selesai, tetapi proses build lokal
keluar nonzero pada pemeriksaan upgrade keamanan Next.js. Hasil build CI tetap
harus diperiksa pada run commit perbaikan; hasil lokal bukan pengganti CI.
