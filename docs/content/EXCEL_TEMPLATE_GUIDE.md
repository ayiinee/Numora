# Panduan Admin: impor soal Excel

**ENGINEERING DECISION — workflow disetujui, 5 Oktober 2026.**

1. Buka /admin/content/imports dengan akun Admin konten. Unduh **NUMORA_EXCEL_V3.xlsx** agar Kurikulum sesuai master terbaru.
2. Isi satu soal per baris pada PG, MCMA atau Kategori. Isi external_id stabil, kode chapter/subchapter/competency dan source_level sesuai hubungan master. Pertahankan namespace yang sama saat impor ulang.
3. Isi teks soal, pilihan/pernyataan, kunci dan pembahasan. PG memakai kunci A; MCMA misalnya A,C; Kategori memakai label kategori serta kunci C1/C2 per pernyataan. Teks wajib walaupun ada gambar.
4. Masukkan PNG/JPEG/WebP pada img__. Bisa **Place in Cell** atau floating; untuk floating, sudut kiri atas harus dalam sel tujuan. Isi alt__ sebagai deskripsi gambar. Jangan menaruh gambar di kolom teks atau memakai IMAGE().
5. Pilih **File soal Excel**. Periksa teks, gambar, kunci dan pembahasan di **Preview Excel sebelum simpan**. Jika ada error, perbaiki alamat sel yang ditampilkan dan unggah ulang. Belum ada soal yang disimpan.
6. Klik **Impor sebagai DRAFT**. Sistem mengunggah/verifikasi semua gambar, memvalidasi referensi dan menyimpan batch melalui transaksi database. Jika upload gagal, soal belum disimpan; coba lagi. Gambar yang terverifikasi dipakai kembali.
7. **Ekspor JSON** mengunduh hasil konversi. Setelah simpan, referensi gambar berisi bucket/objectKey permanen. Ekspor sebelum upload diberi label media belum diunggah. JSON tidak membawa binary gambar atau URL sementara.
8. **Preview soal siap** mencoba soal tersimpan. DRAFT tetap memerlukan review/publikasi akademik.

Batas: XLSX 10 MiB dan 100 soal; gambar 5 MiB per gambar, 20 MiB total. .xls, gambar eksternal/formula dan macro tidak didukung. Kode yang belum ada pada master harus diselesaikan sebelum impor; parser tidak membuat master otomatis.

Deployment soal bergambar memerlukan konfigurasi R2 dan CORS. Jika parsing berhasil tetapi upload belum tersedia, administrator sistem perlu menyelesaikan konfigurasi tersebut. Lihat [kontrak V3](EXCEL_IMPORT_TEMPLATE_SPEC.md).
