# ADM-001 — Excel bergambar sampai tampil pada siswa

Pemilik skenario adalah QA Admin. QA Siswa membantu memeriksa soal dan pembahasan. DevOps memasok domain dan bucket staging. Scope mengikuti [alur unggah V5](../../../../docs/content/UPLOAD_FIRST_WORKFLOW.md) dan [aturan paket](../../../../docs/content/CONTENT_PACKAGE_PIPELINE.md).

Alur dimulai dari unduh template V5, unggah Excel sintetis, pemetaan, simpan draft dan publikasi paket uji yang lolos checklist. Alur selesai setelah akun siswa uji melihat gambar soal saat mengerjakan dan gambar pembahasan setelah submit. Uji juga operasi yang gagal dan diulang, hak akses pada attempt milik siswa lain, serta pembaruan tautan media.

Suite `upload-client` memakai fixture HTTP. Suite `upload-db` memakai PostgreSQL lokal, workbook dengan gambar tertanam, dan transport media fixture. Bukti staging dicatat pada [checklist manual](MANUAL_CHECKLIST.md) setelah lingkungan tersedia.
