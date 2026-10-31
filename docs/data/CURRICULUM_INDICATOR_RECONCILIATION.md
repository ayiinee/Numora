# Rekonsiliasi indikator dan level Drill dari PR #66

**USER REQUEST — Reyhan, 31 Oktober 2026:** pisahkan sisa pekerjaan PR #66 dari perubahan yang sudah masuk main, pertahankan pemetaan Curriculum yang belum tergantikan, dan tutup PR lama setelah penggantinya tersedia.

**ENGINEERING DECISION:** gunakan identitas pada [master kanonis](../../packages/database/seeds/curriculum-master.json) yang sudah masuk melalui PR #84/#85. [Proposal review](proposals/drill-indicators.v0.6.json) menyimpan 23 indikator, 50 level subbab, sumber dokumen/revisi/baris dan seluruh catatan ekstraksi PR #66. Data tetap DRAFT dengan approvalStatus PENDING_CURRICULUM_REVIEW serta usage REVIEW_ONLY_NOT_SEED_INPUT. Ini artefak review, bukan input seeder atau bukti persetujuan akademik.

## Asal dan identitas

- Sumber dipulihkan dari [PR #66](https://github.com/ayiinee/Numora/pull/66), commit 996714cf96be37ea91f84ce2b9097197f982874a, berkas docs/data/curriculum-master.v0.6.json. Data sumber menyebut snapshot 4 Oktober 2026; ini bukan ekstraksi ulang Google Docs terkini.
- Checksum semantik menjaga jejak sumber serta mendeteksi perubahan master kanonis. Perubahan nama/kode master berikutnya memerlukan rekonsiliasi proposal.
- Kode bab/subbab tetap mengikuti master yang sudah disepakati. Nama tampilan CH-GP memakai **Geometri dan Pengukuran**. Nama sumber/alias lama disimpan sebagai provenance.
- IND-001 sampai IND-023 merupakan kode engineering usulan dari ekstraksi lama, bukan klaim kode akademik resmi.
- Lima level per sepuluh subbab menghasilkan 50 calon baris level subbab. Ini tidak menciptakan 50 level per indikator dan tidak memetakan level ke EASY/MEDIUM/HARD. description/difficultyCriteria level tetap null.

## Pemetaan yang dipertahankan

| Kode indikator | Bab    | Subbab     | Deskripsi sumber                                                                                                                                                                       | Status review         |
| -------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| IND-001        | CH-BIL | SC-BR      | Perbandingan dan sifat-sifat bilangan                                                                                                                                                  | DRAFT; belum disahkan |
| IND-002        | CH-BIL | SC-BR      | Operasi aritmetika pada bilangan                                                                                                                                                       | DRAFT; belum disahkan |
| IND-003        | CH-BIL | SC-BR      | Estimasi/ perkiraan hasil perhitungan                                                                                                                                                  | DRAFT; belum disahkan |
| IND-004        | CH-BIL | SC-BR      | Faktorisasi prima bilangan asli                                                                                                                                                        | DRAFT; belum disahkan |
| IND-005        | CH-BIL | SC-BR      | Rasio (skala, proporsi, dan laju perubahan)                                                                                                                                            | DRAFT; belum disahkan |
| IND-006        | CH-BIL | SC-BR      | Perbandingan senilai dan berbalik nilai.                                                                                                                                               | DRAFT; belum disahkan |
| IND-007        | CH-ALG | SC-PPL     | Persamaan linear satu variabel                                                                                                                                                         | DRAFT; belum disahkan |
| IND-008        | CH-ALG | SC-PPL     | Pertidaksamaan linear satu variabel                                                                                                                                                    | DRAFT; belum disahkan |
| IND-009        | CH-ALG | SC-PPL     | Sistem persamaan linear dua variabel                                                                                                                                                   | DRAFT; belum disahkan |
| IND-010        | CH-ALG | SC-BA      | Bentuk aljabar dan sifat-sifat operasinya (komutatif, asosiatif, dan distributif)                                                                                                      | DRAFT; belum disahkan |
| IND-011        | CH-ALG | SC-FUNGSI  | Relasi dan fungsi (domain, kodomain, range), serta penyajiannya.                                                                                                                       | DRAFT; belum disahkan |
| IND-012        | CH-ALG | SC-BD      | Barisan berhingga bilangan                                                                                                                                                             | DRAFT; belum disahkan |
| IND-013        | CH-ALG | SC-BD      | Deret berhingga bilangan.                                                                                                                                                              | DRAFT; belum disahkan |
| IND-014        | CH-GP  | SC-OG      | Hubungan antar- sudut yang terbentuk oleh dua garis yang berpotongan, dan oleh dua garis sejajar yang dipotong suatu garis transversal (termasuk penentuan besar sudut dalam segitiga) | DRAFT; belum disahkan |
| IND-015        | CH-GP  | SC-OG      | Teorema Pythagoras. Kekongruenan dan kesebangunan bangun datar                                                                                                                         | DRAFT; belum disahkan |
| IND-016        | CH-GP  | SC-OG      | Jaring-jaring bangun ruang: prisma, tabung, limas, dan kerucut                                                                                                                         | DRAFT; belum disahkan |
| IND-017        | CH-GP  | SC-TG      | Transformasi tunggal: refleksi, translasi, rotasi, dan dilatasi terhadap titik, garis, dan bangun datar pada bidang                                                                    | DRAFT; belum disahkan |
| IND-018        | CH-GP  | SC-PENG    | Keliling dan luas bangun datar (daerah segi banyak dan daerah lingkaran, serta daerah gabungannya)                                                                                     | DRAFT; belum disahkan |
| IND-019        | CH-GP  | SC-PENG    | Volume bangun ruang (prisma, limas, dan bola)                                                                                                                                          | DRAFT; belum disahkan |
| IND-020        | CH-DP  | SC-DATA    | Perumusan pertanyaan untuk mendapatkan data, serta penyajian dan penginterpretasian data                                                                                               | DRAFT; belum disahkan |
| IND-021        | CH-DP  | SC-DATA    | Penentuan dan penaksiran rerata (mean), median, modus, dan jangkauan (range) dari data                                                                                                 | DRAFT; belum disahkan |
| IND-022        | CH-DP  | SC-DATA    | Perbandingan ukuran pemusatan dan ukuran penyebaran beberapa kelompok data                                                                                                             | Perlu konfirmasi      |
| IND-023        | CH-DP  | SC-PELUANG | Peluang dan frekuensi relatif dari kejadian tunggal.                                                                                                                                   | DRAFT; belum disahkan |

## Catatan review yang masih perlu keputusan

| ID              | Persoalan                                                       | Penanganan                                                                                                                  |
| --------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| CURR-REVIEW-001 | Header Indikator 6 menyebut Bilangan, tabel utama Bilangan Real | OPEN; pertahankan SC-BR dan konfirmasi sumber                                                                               |
| CURR-REVIEW-002 | Penomoran Data & Peluang berbeda antar tab                      | OPEN; referensi sistem tetap CH-DP                                                                                          |
| CURR-REVIEW-003 | Ringkasan Bab Data/Peluang menyebut Transformasi Geometri       | OPEN; konfirmasi judul yang diduga tersalin                                                                                 |
| CURR-REVIEW-004 | IND-022 ditempatkan berbeda pada Data/Peluang                   | OPEN; sementara SC-DATA dan reviewRequired=true; jangan pindahkan diam-diam                                                 |
| CURR-REVIEW-005 | Alias Geometri & Pengukuran / Geometri dan Pengukuran           | Nama kanonis sudah diterapkan; sumber/alias tetap tersimpan. Penyelesaian nama ini tidak mengesahkan pemetaan akademik lain |

## Validasi offline

Jalankan dari root repository memakai runtime repo:

```powershell
corepack pnpm data:curriculum:validate
node --test scripts/validate-curriculum-indicators.test.mjs
```

Hasil yang diharapkan: valid=true, indicators=23, subchapterLevels=50, readyForSeed=false dan empat review item OPEN. Validator memeriksa scope/duplikasi, rentang level, provenance, checksum, nama kanonis serta flag review IND-022. Validator hanya membaca JSON lokal; tidak memuat env, membuka koneksi, melakukan SQL, upload, atau publikasi. Flag --apply ditolak. Tes ini juga menjadi bagian test:checks existing.

## Yang sudah menggantikan bagian lama PR #66

| Bagian lama                                          | Acuan sekarang                                                                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Master 4 bab/10 subbab dan seed                      | packages/database/seeds/curriculum-master.json serta db:seed:curriculum existing; scope seeder tetap bab/subbab                                                 |
| Migrasi 0023_draft_difficulty dan journal alternatif | Migrasi kanonis 0023_content_import_preview, 0026_prd_v06_data_alignment dan 0036_tryout_optional_difficulty; jangan mengembalikan journal/snapshot lama        |
| DTO nullable dan impor DRAFT                         | DTO serta importer Admin JSON v2/Excel yang sudah ada pada main                                                                                                 |
| SQL khusus 10 soal                                   | Gunakan importer yang ada. Skrip lama mensyaratkan constraint question_versions_ready_difficulty_ck, yang sudah diganti migrasi 0036, sehingga tidak dipulihkan |
| Pengaman URL backend upload                          | Dipisahkan pada [PR #115](https://github.com/ayiinee/Numora/pull/115)                                                                                           |

Sepuluh JSON sampel dan aset sumber tetap berada di docs/data/samples/2026-10-03. Lolos skema impor tidak membuktikan target database sudah mempunyai master terkait, receipt gambar terverifikasi, atau render aplikasi selesai. Pemetaan soal menggunakan kode yang sudah diselesaikan importer; UUID tetap dari database.

## Handoff sebelum implementasi seed indikator/level

1. Curriculum mengonfirmasi empat persoalan sumber yang masih OPEN dan deskripsi tiap indikator; catat referensi persetujuannya.
2. Cocokkan kode/scope dengan master database aktual dan materi yang telah dibuat melalui alur Admin V5. Pertahankan UUID/identitas yang sudah digunakan, termasuk isi bersejarah; jangan menyimpulkan database kosong hanya dari file seed.
3. Data menyiapkan perubahan terbatas pada seeder master yang ada atau adapter yang disetujui. Perlakukan proposal ini sebagai bahan review sampai ada pemetaan disahkan; jangan langsung mengirimnya sebagai payload soal.
4. Uji dry-run, conflict/rollback, replay idempotent dan pelestarian konten/akun pada target TEST terisolasi sebelum mengusulkan penerapan Cloud. Persetujuan kode, bukti backup/restore operator dan eksekusi Cloud tetap bukti yang terpisah.

PR ini mempertahankan data dan batas keputusan; tidak menambah migrasi, seeder aktif, perubahan scoring, impor pertanyaan, atau status READY. Lihat [master bab/subbab](CURRICULUM_MASTER_SEED.md) dan [alur upload yang disetujui](../content/UPLOAD_FIRST_WORKFLOW.md) untuk jalur aktif.
