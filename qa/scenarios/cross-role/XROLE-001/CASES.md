# Kasus XROLE-001

- TC-001: impor, rubrik otomatis, repair Draft, rollback dan validasi setelah publikasi; referensi content-preview.integration.spec.ts.
- TC-002: mulai serentak, save/reload, Skip lalu lanjut, submit idempotent; referensi pretest-tryout.integration.spec.ts dan assessment-session.test.tsx.
- TC-003: penilaian PG/majemuk/kategori, kosong nol, batas placement dan XP nol; referensi pretest-partial.spec.ts.
- TC-004: akses akun lain/role lain, konflik revisi, progres dan histori immutable; referensi suite API pada manifest.
- TC-005: PretestAttemptScreen harus meminta media WORK untuk marker gambar dan menampilkan gambar dari respons terotorisasi; tes reproduksi component/pretest-media.test.tsx. Gagal pada kode saat audit, jangan melemahkan assertion.

Satu check dapat memuat tes bersama lintas fitur; jumlah tes bukan jumlah kasus Pretest independen. Browser existing memakai mock API. Hasil diagnostik di PostgreSQL 18 tidak menggantikan penerimaan resmi yang mensyaratkan PostgreSQL 16.
