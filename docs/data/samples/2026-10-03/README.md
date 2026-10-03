# Sepuluh soal untuk review kontrak

**PROPOSED / DRAFT, 3 Oktober 2026.** Sampel berasal dari draft Curriculum yang telah diekstrak untuk Reyhan. Bukan paket Drill/TryOut/PvP atau seed siap publikasi. Kunci disalin dari sumber dan masih memerlukan review Curriculum.

- `questions.draft.json`: 10 soal lengkap beserta kunci dan pembahasan; jangan dikirim mentah ke endpoint siswa sebelum submit.
- `questions/*.draft.json`: salinan per soal untuk review.
- `master-data.proposed.json`: usulan kode master, belum di-seed.
- `assets.draft.json` dan `images/`: 6 gambar, termasuk beberapa gambar dalam pembahasan satu soal.
- `r2-upload-plan.json`: bucket `numora-bucket` dan key final yang direncanakan; `objectKey` null dan `uploadedToR2` false sampai receipt VERIFIED.
- `question-preview.proposed.schema.json`: schema review usulan, bukan schema impor runtime yang telah disetujui.
- `validation-report.json`: bukti validasi offline; tidak membuktikan upload/import Cloud.

Terdapat 7 PG, 2 PGK MCMA dan 1 PGK Kategori, tersebar pada 2 bab/3 subbab/3 indikator. Level mengikuti sumber Curriculum: `metadata.sourceLevelNumber: 1`. `difficulty: null` sengaja dipertahankan; EASY/MEDIUM/HARD untuk PvP belum disepakati. Schema impor repo saat ini masih mewajibkan difficulty, sehingga kesepuluh sampel **belum bisa langsung diimpor**. Jangan mengisi difficulty dengan nilai tebakan agar validasi lolos.

Kode usulan: `CH-DP / SC-DATA / IND-020` (8 soal), `CH-GP / SC-OG / IND-016` (1), `CH-GP / SC-TG / IND-017` (1). Indikator memakai identitas teknis `competencies`. Pemetaan indikator/level memerlukan integrasi PR #54 setelah rekonsiliasi terhadap main terbaru.

`stem`, `explanation` dan setiap opsi/pernyataan memakai `{text, assetKeys}`. Marker `[[asset:bahas-1]]` menandai posisi gambar di text; metadata manifest berisi placement, itemId, urutan, alt text dan referensi file. Kunci PG berbentuk `{optionId}`, MCMA `{optionIds}`, Kategori `{categoryByStatementId}` dengan kategori pada metadata. Rubrik nilai partial belum final; file ini tidak menetapkan angka penilaian.

Mulai review kode, isi soal, kunci, marker, gambar dan alt text. Kemudian jalankan `corepack pnpm run media:upload:samples --dry-run`. Untuk upload setelah deployment/configuration, ikuti [panduan R2](../../../api/CONTENT_MEDIA_UPLOADS.md). Kontrak bank soal lebih lengkap terdapat pada [handoff Backend](../../QUESTION_BANK_BACKEND_HANDOFF.md).

Sesudah upload, key terverifikasi bisa diisi oleh alat; soal tetap DRAFT dengan `importReady: false`. Langkah berikutnya adalah approval master/kurikulum, penyesuaian schema/runtime tiga tipe dan nullable difficulty, importer versioned, renderer serta signed GET sesuai hak akses. Jangan mengeksekusi JSON ini sebagai SQL atau menyamakan upload gambar dengan publish soal.
