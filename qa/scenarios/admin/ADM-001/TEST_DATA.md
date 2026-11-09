# Data Excel sintetis ADM-001

Isi sepuluh baris pada sheet `PG` di template V5 dari lingkungan yang diuji. Isi `Bab`, `Subbab`, `Indikator` dan `Level` dari area Drill uji yang sama. Pilih tingkat kesulitan `Mudah`. Kolom soal, pilihan, dan pembahasan menerima teks biasa.

| Baris data | Soal                 | opt_A | opt_B | Kunci | Pembahasan             |
| ---------- | -------------------- | ----- | ----- | ----- | ---------------------- |
| 1          | QA ONLY — 1 + 1 = ?  | 2     | 3     | A     | QA ONLY — 1 + 1 = 2.   |
| 2          | QA ONLY — 2 + 1 = ?  | 3     | 4     | A     | QA ONLY — 2 + 1 = 3.   |
| 3          | QA ONLY — 3 + 1 = ?  | 4     | 5     | A     | QA ONLY — 3 + 1 = 4.   |
| 4          | QA ONLY — 4 + 1 = ?  | 5     | 6     | A     | QA ONLY — 4 + 1 = 5.   |
| 5          | QA ONLY — 5 + 1 = ?  | 6     | 7     | A     | QA ONLY — 5 + 1 = 6.   |
| 6          | QA ONLY — 6 + 1 = ?  | 7     | 8     | A     | QA ONLY — 6 + 1 = 7.   |
| 7          | QA ONLY — 7 + 1 = ?  | 8     | 9     | A     | QA ONLY — 7 + 1 = 8.   |
| 8          | QA ONLY — 8 + 1 = ?  | 9     | 10    | A     | QA ONLY — 8 + 1 = 9.   |
| 9          | QA ONLY — 9 + 1 = ?  | 10    | 11    | A     | QA ONLY — 9 + 1 = 10.  |
| 10         | QA ONLY — 10 + 1 = ? | 11    | 12    | A     | QA ONLY — 10 + 1 = 11. |

Pada baris data pertama, tanam dua PNG sederhana dan berbeda sebagai penanda visual di `img_stem` dan `img_explanation`. Gunakan gambar buatan penguji tanpa data pribadi. Isi `alt_stem` dengan `Penanda QA untuk soal` dan `alt_explanation` dengan `Penanda QA untuk pembahasan`. Untuk versi negatif hapus satu alt text. Simpan kedua file sebagai `.xlsx`. Media hanya untuk menguji posisi dan akses.

Suite integrasi lokal membuat workbook V5 dan gambar sintetisnya sendiri. Resep manual memakai template dari staging agar pilihan materi mengikuti master yang benar ketika lingkungan tersedia.
