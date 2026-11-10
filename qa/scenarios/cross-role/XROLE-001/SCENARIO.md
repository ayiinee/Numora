# XROLE-001 - Pretest admin sampai siswa

Pemilik utama: lintas role, cakupan admin konten dan siswa. Expected result: impor tetap Draft; tepat 20 soal valid; rubrik PRETEST_PGK_PARTIAL_V1 otomatis; penyiapan hanya versi Draft, atomik, berotorisasi dan memakai expectedRevision. Status valid konsisten sebelum/sesudah terbit. Siswa dapat mulai, simpan, lanjutkan, Skip tanpa menghabiskan kesempatan, dan menyelesaikan satu kali per bab. PG biner; majemuk/kategori berdasarkan keputusan benar; kosong nol; threshold 8/19 pada equivalent-correct tanpa pembulatan; tanpa XP. Konten, pin, hasil dan progres historis tetap.

Tes canonical dirujuk melalui scenario.json. Suite bersama juga berisi regresi Tryout; hasilnya tidak berarti seluruh Tryout diaudit. Standard memerlukan PostgreSQL 16/Redis 7 localhost milik run dan browser. Browser existing memakai API mock, bukan Google OAuth atau bukti integrated browser. Tidak memakai Development cloud, konten nyata atau tes rollback cloud. Manual UAT, keterbacaan konten akademik dan semua kombinasi gangguan jaringan belum dapat disahkan lewat tes otomatis.

Temuan aplikasi dilaporkan tanpa mengubah kode produk. Fixture sintetis bukan persetujuan akademik. Profile yang terblokir tidak dianggap lulus.
