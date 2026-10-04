# Numora — Handoff bank soal, JSON, dan kontrak API untuk Backend

Tanggal: 3 Oktober 2026 · Revisi dokumen: 0.2 · Pemilik handoff: Reyhan / Data Engineering

**Tujuan:** menyepakati jalur JSON kurikulum → penyimpanan soal → preview tiga format → penyimpanan jawaban. Sepuluh soal adalah bank sampel preview, bukan paket Drill, TryOut, atau PvP siap terbit. Dokumen ini dapat dibagikan langsung ke Backend dan Frontend.

**Pembaruan 4 Oktober 2026 — USER CLARIFICATION:** Reyhan menyetujui DRAFT tanpa difficulty dan READY wajib terisi. Usulan nullable pada bagian 4 kini disiapkan sebagai `0023_draft_difficulty` pada baseline main `6550710`. Skrip operator sepuluh sampel beserta batasannya ada di [DRAFT_SAMPLE_IMPORT.md](DRAFT_SAMPLE_IMPORT.md). Pembahasan NOT NULL dan nomor migrasi lama di bawah adalah konteks historis, bukan status penerapan terbaru. Cloud belum diubah dan importer Admin/renderer belum menjadi fitur selesai.

## 1. Status keputusan dan batas dokumen

Label berikut harus dipertahankan saat handoff:

- **USER CLARIFICATION:** keputusan/arah yang dikonfirmasi Reyhan dalam percakapan 3 Oktober 2026; bukan klaim persetujuan rubrik oleh Curriculum/PO.
- **EXISTING:** tersedia dalam baseline lokal repo yang diperiksa.
- **PROPOSED:** kontrak/implementasi yang diusulkan untuk review Backend/Frontend/Data.
- **OPEN:** menunggu keputusan pihak terkait; tidak boleh diisi dengan asumsi produksi.
- **PARTLY OPEN:** arah umum diketahui, tetapi detail belum disetujui owner yang berwenang.
- **PRD RULE:** aturan yang langsung bersumber dari PRD/ADR yang dirujuk, terpisah dari usulan teknis.

**Baseline repo yang diperiksa:** commit `6049ef7e5d0a444307becef090634dd262492339` pada branch `feat/data-curriculum-slugs`, [PR #54](https://github.com/ayiinee/Numora/pull/54). PR memuat migrasi `0014_curriculum_slugs` dan `0015_indicator_question_levels`. Keberadaan kolom pada branch tidak membuktikan migrasi sudah diterapkan ke Cloud atau PR sudah di-merge. Periksa baseline integrasi aktual sebelum implementasi.

**Pembaruan R2, 3 Oktober 2026:** endpoint reservasi dan completion media kini diimplementasikan dalam PR terpisah berbasis `main` commit `2dc6bf6`, menggunakan bucket `numora-bucket`. Lihat [kontrak upload](../api/CONTENT_MEDIA_UPLOADS.md) dan [sampel](samples/2026-10-03/README.md). Endpoint importer/preview/jawaban rich JSON dalam dokumen ini tetap **PROPOSED**. Belum ada upload atau migrasi Cloud. Baseline historis PR #54 di atas masih diperlukan untuk pembahasan slug/level; nomor migrasinya harus direkonsiliasi karena main telah memakai 0014–0017 untuk Variant/IRT. Jangan menerapkan rantai lama ke main tanpa review.

### Keputusan yang sudah diperoleh

| Topik            | Status             | Ketentuan                                                                                                                                                  |
| ---------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Master kurikulum | USER CLARIFICATION | Belum dimasukkan. Data boleh mengusulkan kode dan pemetaan untuk direview.                                                                                 |
| Hierarki         | USER CLARIFICATION | Bab → Subbab → Level. Indikator menggunakan tabel teknis `competencies`. Level N subbab mengambil calon soal Level N indikator-indikator dalam subbab itu. |
| Level kurikulum  | USER CLARIFICATION | Mengikuti dokumen Curriculum. Tidak dikonversi otomatis ke EASY/MEDIUM/HARD.                                                                               |
| Kategori PvP     | OPEN               | Contoh Easy dari Level 1, Medium dari Level 3 ke atas masih gagasan. Batas lengkap, overlap, pemilihan dan persetujuannya belum final.                     |
| Target sampel    | USER CLARIFICATION | Preview seluruh tiga format dan penyimpanan jawabannya, bukan hanya PG.                                                                                    |
| Paket            | USER CLARIFICATION | Sepuluh soal tidak dijadikan satu paket Drill; paket per subbab/level menunggu penyusunan bank.                                                            |
| Gambar           | USER CLARIFICATION | Backend mengirim URL sementara bersama respons; frontend mengambil gambar langsung ke R2.                                                                  |
| Renderer         | PROPOSED           | Rich text + LaTeX + marker gambar; belum ada renderer yang disepakati/diimplementasikan.                                                                   |
| Impor ulang      | USER CLARIFICATION | Isi identik dilewati, revisi membuat versi baru, identitas berubah ditinjau, riwayat lama dipertahankan.                                                   |
| PGK              | PARTLY OPEN        | Arah dari Reyhan/tim: partial. Rumus, bobot, penalti, pembulatan, rentang dan konfigurasi resmi menunggu Curriculum.                                       |

## 2. Implementasi saat ini dan gap yang perlu ditangani

| Area            | EXISTING pada repo                                                                                            | Target handoff / gap                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Tipe soal       | Enum DB dan draft schema mengenal SINGLE_CHOICE, MULTIPLE_CHOICE_MULTIPLE_ANSWER, CATEGORY                    | Validasi payload per tipe dan runtime ketiganya masih perlu implementasi.                  |
| Authoring Admin | DTO soal memakai stem/explanation string, empat opsi A–D dan `answerOptionId`                                 | Bukan endpoint importer rich JSON; tidak boleh memaksa MCMA/Category menjadi PG.           |
| Respons siswa   | Stem string, opsi `{id,text}`, `selectedOptionId`                                                             | Perlu proyeksi rich text, kategori, media, dan jawaban tiga tipe.                          |
| Save answer     | Endpoint legacy menerima `{optionId: string                                                                   | null}`                                                                                     | Perlu kontrak tiga tipe dengan koordinasi kompatibilitas. |
| Impor schema    | Kode bab/subbab/indikator wajib; difficulty wajib EASY/MEDIUM/HARD; `answer` object belum diperketat per tipe | Perlu perubahan schema, validasi semantik, dan difficulty nullable sesuai keputusan level. |
| Versi soal      | `stem`, `options_or_statements`, `answer_key`, `explanation`, `media` berupa JSONB                            | JSONB menyediakan tempat penyimpanan, bukan validasi/render/penilaian otomatis.            |
| Difficulty DB   | `question_versions.difficulty` text NOT NULL                                                                  | Usulan nullable memerlukan migrasi lanjutan; PR #54 belum memperbaikinya.                  |
| Identitas impor | `questions.source_ref` tersedia tanpa unique import identity; metadata arbitrer belum otomatis tersimpan      | Perlu referensi impor durable dan provenance agar impor ulang tidak menggandakan data.     |
| Preview         | Sesi preview khusus tiga tipe belum ditetapkan                                                                | Jangan memasukkan bank lintas subbab sebagai fake paket Drill.                             |
| PGK scoring     | Rubrik partial belum final                                                                                    | Simpan jawaban mentah; jangan mengarang nilai numerik.                                     |

**PRD RULE / arsitektur repo:** frontend menggunakan API NestJS untuk data bisnis; akses Supabase browser dibatasi untuk auth. Otorisasi, penyimpanan jawaban, penilaian, dan progres diputuskan backend. API memakai `/api/v1`, UUID untuk identitas resource, camelCase untuk JSON, waktu ISO-8601 UTC, dan error `application/problem+json`.

## 3. Usulan kode master dan tabel pemetaan

**PROPOSED:** kode berikut hanya untuk scope sampel. Bukan daftar bab/subbab/indikator final seluruh kurikulum. Jangan menimpa master yang sudah dimasukkan tim lain; bila ada, gunakan kode existing dan revisi pemetaan. Nama berasal dari metadata ekstraksi kurikulum, bukan nama baru yang diarang.

### Bab dan subbab

| chapterCode | Nama bab              | chapters.slug       | subchapterCode | Nama subbab           | subchapters.slug      |
| ----------- | --------------------- | ------------------- | -------------- | --------------------- | --------------------- |
| CH-DP       | Data & Peluang        | data-peluang        | SC-DATA        | Data                  | data                  |
| CH-GP       | Geometri & Pengukuran | geometri-pengukuran | SC-OG          | Objek Geometri        | objek-geometri        |
| CH-GP       | Geometri & Pengukuran | geometri-pengukuran | SC-TG          | Transformasi Geometri | transformasi-geometri |

### Indikator

| competencyCode | chapterCode / subchapterCode | Nomor sumber | Deskripsi sumber                                                                                                    |
| -------------- | ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| IND-020        | CH-DP / SC-DATA              | 20           | Perumusan pertanyaan untuk mendapatkan data, serta penyajian dan penginterpretasian data                            |
| IND-016        | CH-GP / SC-OG                | 16           | Jaring-jaring bangun ruang: prisma, tabung, limas, dan kerucut                                                      |
| IND-017        | CH-GP / SC-TG                | 17           | Transformasi tunggal: refleksi, translasi, rotasi, dan dilatasi terhadap titik, garis, dan bangun datar pada bidang |

Deskripsi di atas dirapikan untuk keterbacaan. Teks sumber asli tetap dipertahankan pada provenance; Curriculum memeriksa nama/penempatan resmi.

### Pemetaan sepuluh soal

| externalId         | Tipe                            | chapterCode | subchapterCode | competencyCode | sourceLevelNumber |
| ------------------ | ------------------------------- | ----------- | -------------- | -------------- | ----------------- |
| CURR-IND20-L01-Q01 | SINGLE_CHOICE                   | CH-DP       | SC-DATA        | IND-020        | 1                 |
| CURR-IND20-L01-Q02 | SINGLE_CHOICE                   | CH-DP       | SC-DATA        | IND-020        | 1                 |
| CURR-IND20-L01-Q03 | SINGLE_CHOICE                   | CH-DP       | SC-DATA        | IND-020        | 1                 |
| CURR-IND20-L01-Q04 | SINGLE_CHOICE                   | CH-DP       | SC-DATA        | IND-020        | 1                 |
| CURR-IND20-L01-Q05 | SINGLE_CHOICE                   | CH-DP       | SC-DATA        | IND-020        | 1                 |
| CURR-IND20-L01-Q06 | MULTIPLE_CHOICE_MULTIPLE_ANSWER | CH-DP       | SC-DATA        | IND-020        | 1                 |
| CURR-IND20-L01-Q07 | MULTIPLE_CHOICE_MULTIPLE_ANSWER | CH-DP       | SC-DATA        | IND-020        | 1                 |
| CURR-IND20-L01-Q09 | CATEGORY                        | CH-DP       | SC-DATA        | IND-020        | 1                 |
| CURR-IND16-L01-Q03 | SINGLE_CHOICE                   | CH-GP       | SC-OG          | IND-016        | 1                 |
| CURR-IND17-L01-Q05 | SINGLE_CHOICE                   | CH-GP       | SC-TG          | IND-017        | 1                 |

Sampel berisi 7 PG, 2 MCMA, 1 Category; 8 soal Data, 1 Objek Geometri, 1 Transformasi Geometri. Ini sampel variasi format, bukan distribusi paket akademik.

### Cara resolve kode ke UUID

1. Cari chapter dari `chapters.code`.
2. Cari subchapter dengan pasangan `(chapter_id, code)`, bukan code saja.
3. Cari competency dengan pasangan `(subchapter_id, code)`.
4. Baca integer positif `metadata.sourceLevelNumber`; simpan ke `questions.curriculum_level_number`.
5. Jika master level diperlukan, resolve `(subchapter_id, level_number)`. Ketiga subbab sampel mempunyai calon Level 1 berbeda; bukan satu level global.
6. API bisnis dan foreign key tetap memakai UUID hasil resolve. Slug dipakai untuk navigasi, tidak mengganti code/UUID.

`levelCode` dapat tetap null: schema impor sekarang mengizinkannya dan tabel `levels` tidak mempunyai kolom code. Bila legacy payload mengirim levelCode non-null, importer harus mempunyai resolver terdokumentasi dan memeriksa kecocokannya dengan subbab/nomor level; jangan mengabaikan konflik.

Nomor urut bab/subbab, jumlah level lengkap, dan status READY master belum disetujui. Saat seeding nanti, tentukan display_order sesuai urutan Curriculum dan data existing; jangan menganggap urutan tiga baris tabel ini sebagai urutan resmi.

## 4. Pisahkan level kurikulum dari kategori PvP

**USER CLARIFICATION:** `curriculumLevelNumber` adalah level sumber dalam indikator; bukan EASY/MEDIUM/HARD, bukan cognitiveLevel C1–C6, dan bukan hasil kalibrasi IRT.

**PROPOSED untuk Backend/Data:**

- Pertahankan nama `difficulty` pada envelope demi kompatibilitas, tetapi jadikan optional/nullable dalam schema impor. Sampel mengirim null, tanpa nilai palsu.
- Ubah `question_versions.difficulty` menjadi nullable melalui migrasi Drizzle lanjutan yang direview. Nilai legacy dipertahankan untuk dibaca selama transisi; jangan menulis ulang ke EASY berdasarkan level.
- Sesuaikan DTO, decoder, package validation dan generator yang menganggap difficulty wajib. Nilai null perlu ditangani eksplisit; jangan crash atau diam-diam dianggap setara untuk retry/PvP.
- Kategori PvP nantinya ditentukan selector backend berdasarkan mapping level yang disetujui dan dipin sebagai versi kebijakan pada konteks match. Lokasi persistence policy mengikuti modul PvP, bukan ditambahkan ke setiap soal secara otomatis.

**OPEN:** batas Easy/Medium/Hard, level yang masuk tiap kategori, scope lintas bab, jumlah soal, eligibility tiga format dalam PvP, dan arti kesetaraan kesulitan untuk retry. Contoh Easy=Level 1 / Medium=Level 3 ke atas belum menjadi enum mapping produksi. Jangan menyimpulkan Hard=Level tertentu atau mengaktifkan pemilih PvP dari contoh tersebut.

**BLOCKER aktual:** JSON dengan difficulty null masih gagal terhadap schema impor repo lama dan insert ke kolom NOT NULL. Dokumen ini adalah usulan perubahan kontrak; importer belum boleh mengklaim sampel siap ditulis ke schema tersebut.

## 5. Kontrak JSON impor — konten internal yang memiliki kunci

**USER CLARIFICATION:** pertahankan bentuk tiga tipe yang dipakai JSON sampel. `answer` pada envelope impor adalah kunci dari Curriculum, bukan jawaban siswa.

| Field                                         | Target                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| externalId                                    | ID sumber stabil; digabung namespace sumber untuk identitas impor. Bukan UUID internal. |
| type                                          | Salah satu tiga enum tipe soal.                                                         |
| chapterCode / subchapterCode / competencyCode | String nonkosong, sesuai master pada scope yang benar.                                  |
| levelCode                                     | Optional/null; bukan syarat membuat kolom code baru pada levels.                        |
| difficulty                                    | PROPOSED optional/null sesuai bagian 4; bukan kategori PvP pada bank soal ini.          |
| stem / explanation                            | RichText `{text, assetKeys}`.                                                           |
| options                                       | `{id, content: RichText}[]`; pada CATEGORY dipakai sebagai daftar pernyataan.           |
| answer                                        | Kunci bertipe sesuai bagian 6.                                                          |
| metadata.sourceLevelNumber                    | Integer positif wajib untuk sampel drill-level ini.                                     |
| metadata.categories                           | Wajib pada CATEGORY, `{id,label}[]`; hanya definisi kategori, tanpa kunci.              |
| metadata.assetManifest                        | Referensi aset dan lokasi pemakaian, tidak berisi kredensial/URL bertanda tangan.       |
| metadata.source / sourceUrl / sourceLocation  | Provenance; tetap dipertahankan untuk operator yang berwenang.                          |
| metadata.variantKind                          | ORIGINAL untuk sepuluh sampel konkret. Bukan blueprint generator.                       |

### Contoh PG dari sampel, dengan kode usulan

```json
{
  "externalId": "CURR-IND20-L01-Q01",
  "type": "SINGLE_CHOICE",
  "chapterCode": "CH-DP",
  "subchapterCode": "SC-DATA",
  "competencyCode": "IND-020",
  "levelCode": null,
  "difficulty": null,
  "stem": {
    "text": "Seorang siswa ingin mengetahui jenis olahraga yang paling disukai siswa kelas IX. Pertanyaan yang paling tepat untuk memperoleh data tersebut adalah ....",
    "assetKeys": []
  },
  "options": [
    {
      "id": "A",
      "content": { "text": "Apakah olahraga penting bagi kesehatan?", "assetKeys": [] }
    },
    {
      "id": "B",
      "content": { "text": "Jenis olahraga apa yang paling kamu sukai?", "assetKeys": [] }
    },
    { "id": "C", "content": { "text": "Mengapa olahraga harus dilakukan?", "assetKeys": [] } },
    {
      "id": "D",
      "content": { "text": "Apakah kamu suka berolahraga setiap hari?", "assetKeys": [] }
    }
  ],
  "answer": { "optionId": "B" },
  "explanation": {
    "text": "Pertanyaan harus menanyakan langsung jenis olahraga yang disukai.",
    "assetKeys": []
  },
  "metadata": {
    "source": "CURRICULUM_SHEETS_SAMPLE",
    "sourceLevelNumber": 1,
    "cognitiveLevel": "C3",
    "variantKind": "ORIGINAL",
    "contentStatus": "DRAFT"
  }
}
```

Contoh di atas menyederhanakan metadata/pembahasan agar kontrak terbaca. File draft sumber tetap menjadi bahan review; contoh ini belum berstatus Curriculum-approved atau valid terhadap schema difficulty lama.

## 6. Ketentuan ketiga tipe dan validasi kunci

### PG — SINGLE_CHOICE

```json
{ "optionId": "B" }
```

Satu ID opsi valid. Import menolak ID yang tidak terdapat pada options. A–D/empat opsi adalah bentuk tujuh PG sampel dan fixture prototipe, bukan batas universal semua bank soal. ID opsi wajib unik dan stabil dalam versi; urutan array menentukan urutan tampilan.

### PGK MCMA — MULTIPLE_CHOICE_MULTIPLE_ANSWER

```json
{ "optionIds": ["A", "B", "D"] }
```

Kunci ini berasal dari sampel Q06. Setiap ID harus ada dalam options, tidak boleh duplikat. Urutan pilihan yang dipilih tidak mempunyai makna skor. Kunci impor wajib mempunyai jawaban benar; kebijakan jumlah minimum pilihan benar final tetap Curriculum. Jawaban siswa boleh kosong untuk menyatakan belum menjawab, bukan kunci kosong.

### PGK Kategori — CATEGORY

Bentuk yang dipertahankan dari draft:

```json
{
  "options": [
    { "id": "A", "content": { "text": "Berapa jam kamu belajar setiap hari?", "assetKeys": [] } },
    {
      "id": "B",
      "content": { "text": "Apa mata pelajaran yang paling kamu sukai?", "assetKeys": [] }
    },
    { "id": "C", "content": { "text": "Berapa jumlah saudara kandungmu?", "assetKeys": [] } }
  ],
  "answer": {
    "categoryByStatementId": {
      "A": "QUANTITATIVE",
      "B": "QUALITATIVE",
      "C": "QUANTITATIVE"
    }
  },
  "metadata": {
    "sourceLevelNumber": 1,
    "categories": [
      { "id": "QUANTITATIVE", "label": "Kuantitatif" },
      { "id": "QUALITATIVE", "label": "Kualitatif" }
    ]
  }
}
```

Ini potongan payload, bukan envelope lengkap. Setiap options.id adalah ID pernyataan. Seluruh pernyataan pada kunci harus terpetakan tepat sekali ke kategori valid. Jangan membatasi kategori menjadi benar/salah: sampel memakai kuantitatif/kualitatif. Jawaban siswa boleh belum mengisi seluruh pernyataan; field yang tidak ada berarti belum dijawab.

**PROPOSED validasi bersama:** perketat JSON Schema dengan cabang per type dan validasi semantik ID/referensi. Tolak tipe/struktur kunci salah, ID duplikat/tidak dikenal, kategori tanpa definisi, kode master silang scope, dan marker media tanpa referensi. Simpan rich text utuh; jangan mengubah MCMA menjadi satu ID atau membuang categories.

## 7. Pemetaan penyimpanan PostgreSQL

| Input                                         | Tabel/kolom target EXISTING                                         | Catatan                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| chapterCode / subchapterCode / competencyCode | chapters / subchapters / competencies                               | Resolve scope, bukan menyimpan nama sebagai foreign key.                                                                      |
| metadata.sourceLevelNumber                    | questions.curriculum_level_number                                   | Kolom baru PR #54; bukan difficulty.                                                                                          |
| Identitas keluarga soal                       | questions.id / primary_competency_id                                | UUID dibuat server.                                                                                                           |
| ORIGINAL / VARIANT                            | question_variants.kind / original_variant_id / question_id          | Sampel hanya original. Varian konkret mempertahankan keluarga.                                                                |
| type                                          | question_versions.question_type                                     | Enum tiga tipe.                                                                                                               |
| stem                                          | question_versions.stem                                              | RichText JSONB.                                                                                                               |
| options / metadata.categories                 | question_versions.options_or_statements                             | PROPOSED simpan `{options, categories}`; categories kosong/absen untuk non-CATEGORY. Perubahan decoder wajib dikoordinasikan. |
| answer                                        | question_versions.answer_key                                        | Kunci internal; jangan ikut respons pengerjaan.                                                                               |
| explanation                                   | question_versions.explanation                                       | RichText JSONB; akses mengikuti mode/hasil yang sah.                                                                          |
| Aset durable                                  | question_versions.media                                             | Manifest untuk versi tersebut, tanpa signed URL.                                                                              |
| difficulty                                    | question_versions.difficulty                                        | Null diblokir sampai migrasi nullable yang diusulkan tersedia.                                                                |
| provenance / externalId                       | Referensi impor/provenance PROPOSED                                 | Belum ada pemetaan durable unik yang cukup hanya dengan source_ref.                                                           |
| Versi yang dipakai attempt                    | attempt_items.question_version_id                                   | Dipin saat mulai; tidak berpindah ke versi terbaru saat resume.                                                               |
| Jawaban siswa                                 | attempt_answers.answer                                              | JSONB payload jawaban tervalidasi, bukan kunci.                                                                               |
| Nilai dan waktu grading                       | attempt_answers.awarded_points / graded_at                          | Null jika belum dapat dinilai; jangan isi 0 untuk pending rubric.                                                             |
| Kebijakan skor                                | assessment_packages / assessment_attempts.scoring_policy_version_id | Versi policy dipin; bukan menerima formula dari client.                                                                       |

**PROPOSED penyimpanan provenance:** simpan metadata sumber per versi, termasuk sumber, lokasi, tipe, nomor level dan review, melalui struktur yang direview Data/Backend. Salah satu pilihan ialah metadata JSONB pada versi + referensi impor terpisah. Kolom ini belum ada; jangan mengklaim endpoint Admin sekarang otomatis menyimpan seluruh metadata.

Impor satu keluarga/varian/versi/media/reference harus atomik. Aturan NOT NULL, unique, scope FK, dan requirement reviewer READY tetap dihormati. `metadata.contentStatus: READY` atau reviewer dari file sumber tidak boleh menjadi jalan bypass review; server menetapkan actor reviewer dan waktu review yang sah.

## 8. Impor ulang, deduplikasi, dan versi

**USER CLARIFICATION:** identitas sama + konten sama → skip; konten berubah → versi baru DRAFT; soal berbeda → externalId baru; perubahan tipe/indikator → review dahulu.

**PROPOSED mekanisme durable:** referensi impor ber-unique `(sourceNamespace, externalId)` yang menunjuk questionId/variantId, dengan rekaman per versi berisi contentHash, provenance dan batch. Nama tabel/kolom final direview Data. `source_ref` text saja tanpa unique tidak cukup untuk mencegah dua impor bersamaan.

ContentHash dihitung server dari konten canonical: type, resolved taxonomy/level, stem, opsi/pernyataan/kategori dan urutannya, kunci, pembahasan, manifest termasuk checksum gambar, serta difficulty jika ada. Jangan memasukkan signed URL, waktu request, batchId atau status review yang tidak mengubah konten ke hash. Normalisasi ID pilihan MCMA sebagai set; jangan mengurutkan ulang daftar opsi/pernyataan tampilan.

| Kondisi                                           | Hasil                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| ID belum dikenal dan valid                        | Buat keluarga/ORIGINAL/version 1 DRAFT, simpan referensi impor.                                                                       |
| ID sama, hash sama                                | SKIPPED_UNCHANGED; UUID/versi tidak berubah.                                                                                          |
| ID sama, hash berubah, tipe/indikator/level tetap | CREATED_REVISION; versi baru DRAFT, versi lama tetap.                                                                                 |
| ID sama, tipe/indikator/nomor level berubah       | NEEDS_REVIEW; jangan memindahkan keluarga yang sudah dipakai. Nomor level ikut review karena saat ini berada pada keluarga questions. |
| Konten baru dengan ID baru                        | CREATED; jangan dedup hanya berdasarkan teks yang mirip.                                                                              |
| ID duplikat dalam batch                           | Tolak batch dengan laporan baris; jangan last-write-wins.                                                                             |
| Dua request impor bersamaan                       | Unique + transaksi/locking menjamin satu identitas dan alokasi nomor versi konsisten.                                                 |

Revisi tidak mengubah paket terbit, attempt items, kunci snapshot lama, nilai hasil lama atau input IRT yang sudah dibekukan. Memperbarui paket memerlukan versi paket/review terpisah; importer tidak otomatis mengganti seluruh referensi ke versi terbaru.

## 9. Rich text, rumus, dan beberapa gambar

**PROPOSED renderer v1:** pertahankan `{text, assetKeys}` agar sesuai draft; marker `[[asset:ID]]` menyatakan posisi gambar pada text. Asset ID hanya unik di dalam versi soal. Resolver memakai pasangan `(questionVersionId, assetId)`.

```json
{
  "text": "Luas satu persegi:\n[[asset:bahas-1]]\nLuas total:\n[[asset:bahas-2]]",
  "assetKeys": [
    "question-media/CURR-IND16-L01-Q03/v1/bahas-1.png",
    "question-media/CURR-IND16-L01-Q03/v1/bahas-2.png"
  ]
}
```

Object key pada contoh merupakan ilustrasi historis, bukan file Cloud yang sudah ada. Untuk upload yang diimplementasikan, gunakan format `{assetId}-{sha256}.{ext}` dari [kontrak R2](../api/CONTENT_MEDIA_UPLOADS.md); nama pendek contoh di bawah tidak dipakai alat upload. Manifest menghubungkan assetId ke objectKey, checksum, altText, contentType, placement dan itemId. `assetKeys` berisi object key durable, bukan signed URL dan bukan path Windows. Bila belum diunggah, draft dapat berisi array kosong dan objectKey null, tetapi validasi delivery/preview bergambar harus menandai belum siap.

```json
{
  "assetId": "bahas-1",
  "objectKey": "question-media/CURR-IND16-L01-Q03/v1/bahas-1.png",
  "placement": "EXPLANATION",
  "itemId": null,
  "assetOrder": 1,
  "altText": "Luas satu persegi: sisi dikalikan sisi.",
  "contentType": "image/png"
}
```

Placement: STEM, OPTION, STATEMENT, EXPLANATION. OPTION/STATEMENT wajib memiliki itemId valid. Array/marker menentukan urutan; jangan menggabungkan semua gambar menjadi satu tanpa memeriksa keterkaitan teks. Enam pemakaian gambar sampel mempunyai lima file unik; dedup file tidak menghapus posisi pemakaian.

Rumus teks memakai `$...$` untuk inline dan `$$...$$` untuk display sebagai **PROPOSED**. JSON string LaTeX harus meng-escape backslash, misalnya `"$\\frac{1}{2}$"`. Rumus yang masih berbentuk gambar tetap dirender sebagai image; konversi ke LaTeX dilakukan setelah verifikasi, bukan OCR yang dianggap otomatis benar.

Frontend memecah text menjadi bagian teks/rumus/gambar pada posisi marker, merender dengan komponen aman tanpa HTML mentah, dan tidak menjalankan kode dari konten. Media gagal menampilkan fallback alt text + retry; jawaban tetap dapat disimpan. Parser marker/LaTeX, sanitasi, whitespace/newline, alt text dan layout responsif harus mempunyai contoh uji bersama.

## 10. R2 private dan URL sementara

**USER CLARIFICATION:** URL sementara diberikan bersama respons soal, agar frontend tidak meminta URL satu per satu ke backend untuk setiap gambar.

**PROPOSED alur:** backend memeriksa akses, menyaring media sesuai fase, menghasilkan signed GET URL, lalu menyertakan daftar media unik dan `expiresAt`. Browser mengambil byte gambar langsung dari R2; gambar tetap membutuhkan request HTTP ke R2, tetapi bukan proxy byte melalui NestJS.

```json
{
  "media": [
    {
      "assetId": "soal-1",
      "url": "https://example.invalid/r2-signed-image-placeholder",
      "expiresAt": "2026-10-03T10:00:00Z",
      "altText": "Diagram pada soal.",
      "contentType": "image/png"
    }
  ]
}
```

URL example.invalid di atas adalah placeholder nonfungsional. **OPEN:** TTL final, mekanisme renew dan batas batch. Drill tidak memiliki deadline pendek yang bisa dipakai sebagai TTL tetap. Backend perlu memberi expiresAt; ketika URL kedaluwarsa/nyaris kedaluwarsa, frontend dapat meminta pembaruan sekaligus untuk konteks yang masih diizinkan. Pembaruan media tidak mengubah urutan soal, versi atau jawaban tersimpan.

R2 presigned URL memberikan akses kepada pemegang URL sampai expiry dan dapat dipakai berulang selama valid. Ia memakai domain S3 API R2, bukan custom domain. Signer tetap server-side; jangan menyimpan URL sementara pada DB historis, menaruhnya di log/analitik/PR, atau mengirim kredensial R2. Browser fetch memerlukan konfigurasi CORS yang sesuai. Sumber: [Cloudflare R2 — Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

**Otorisasi media:** endpoint renewal hanya menerima asset ID dalam konteks preview/attempt/version yang diotorisasi; jangan menandatangani objectKey arbitrer dari client. Pengerjaan siswa hanya menerima stem/option/statement media. Jangan mengirim manifest/URL pembahasan sebelum hak akses hasil terpenuhi. Admin preview yang berwenang boleh melihat kunci/pembahasan melalui mode review terpisah.

## 11. Preview bank sampel terpisah dari asesmen produksi

**PROPOSED:** preview terautentikasi untuk Admin/operator internal yang diberi akses backend. Curriculum yang mereview mendapat akses melalui mekanisme internal yang disetujui; dokumen tidak menciptakan role publik baru bernama Curriculum atau membolehkan semua Student membaca draft.

Preview mempunyai sesi dan item terpin ke questionVersionId, serta jawaban tersimpan terpisah dari attempt produksi. Pilihan implementasi durable: tabel `content_preview_sessions`, `content_preview_items`, `content_preview_answers` melalui migrasi lanjutan, atau struktur preview setara yang direview Backend/Data. Tabel tersebut belum ada dan tidak boleh diasumsikan sama dengan assessment_attempts DRILL yang membutuhkan paket/level.

Preview lintas subbab tidak menghasilkan XP, mastery/unlock, leaderboard, exposure eksperimen produksi atau evidence kalibrasi IRT. Bila mencatat event QA, tandai sebagai preview dan keluarkan dari agregasi produksi. Refresh mempertahankan versi, urutan dan jawaban, bukan mengambil versi terbaru atau regenerasi soal.

## 12. Endpoint handoff — seluruh endpoint baru PROPOSED

Base `/api/v1`. Operator harus terautentikasi dan diotorisasi server; jangan menerima role/reviewer/owner dari body sebagai sumber izin.

| Endpoint usulan                                                                | Fungsi                                                           | Respons / batas                                                                        |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| POST /admin/content/import-validations                                         | Memeriksa `{sourceNamespace, questions}` tanpa write data bisnis | 200 laporan per externalId; kode/master/media/rubrik yang belum siap dilaporkan.       |
| POST /admin/content/imports                                                    | Impor tervalidasi dengan Idempotency-Key                         | 201 laporan CREATED/CREATED_REVISION/SKIPPED_UNCHANGED; rekomendasi batch atomik.      |
| POST /admin/content/preview-sessions                                           | `{questionVersionIds}` untuk membuat preview tiga format         | 201 UUID sesi; pin versi dan urutan, cek akses seluruh item.                           |
| GET /admin/content/preview-sessions/{sessionId}                                | Konten untuk mencoba menjawab                                    | 200 rich question DTO tanpa kunci/pembahasan; jawaban tersimpan + media sementara.     |
| PATCH /admin/content/preview-sessions/{sessionId}/answers/{questionInstanceId} | Menyimpan/mengganti/menghapus jawaban tiga tipe                  | 200 acknowledgment server sesudah commit.                                              |
| POST /admin/content/preview-sessions/{sessionId}/submit                        | Bekukan jawaban dan buat hasil preview                           | 200 hasil tersimpan; PGK dapat WAITING_RUBRIC. Submit ulang tidak membuat hasil ganda. |
| GET /admin/content/preview-sessions/{sessionId}/result                         | Hasil/review yang diotorisasi                                    | 200 raw answer, kunci/pembahasan sesuai izin; nilai PGK null bila pending.             |
| POST /admin/content/preview-sessions/{sessionId}/media-links                   | Renew beberapa asset ID dalam scope sesi/fase                    | 200 daftar link baru + expiresAt, bukan perubahan soal.                                |

Ini usulan API internal untuk sampel, bukan kewajiban menambah UI CRUD Admin ke scope fitur siswa. Batas batch/pagination/rate limit dan bentuk laporan rinci direview Backend/DevOps. Validasi tanpa write dapat melaporkan master/media belum tersedia; tidak otomatis membuat master atau mengunggah file.

**Legacy EXISTING:** `/assessment-attempts/{attemptId}/answers/{questionInstanceId}` dan `/tryout/attempts/{attemptId}/answers/{questionInstanceId}` sekarang menerima scalar optionId. Target produksi tiga format menggunakan semantic DTO di bawah, tetapi mekanisme rollout/path final **OPEN** bersama Backend/Frontend. Jangan mengganti body/response legacy secara diam-diam. Uji client lama, regenerasikan OpenAPI/shared types dari DTO NestJS, dan lakukan koordinasi breaking change. Preview baru dapat menguji kontrak tanpa merusak client Drill lama.

### Contoh laporan validasi

```json
{
  "canImport": false,
  "items": [
    {
      "externalId": "CURR-IND20-L01-Q01",
      "proposedAction": "CREATED",
      "errors": [{ "code": "MASTER_NOT_FOUND", "path": "chapterCode" }],
      "warnings": []
    }
  ]
}
```

Warning PGK_RUBRIC_PENDING hanya dikeluarkan untuk item PGK/batch PGK yang terkait, bukan setiap PG. Master not found memblokir write; pending rubric tidak menghalangi preview/raw-answer storage yang jelas belum memiliki grading final.

## 13. DTO soal untuk pengerjaan — tanpa kunci

**PROPOSED semantic DTO:** satu struktur rich text untuk stem/opsi dan media; type memilih komponen PG/MCMA/Category. Pada CATEGORY, options adalah pernyataan dan categories berasal dari metadata sumber yang telah divalidasi; metadata internal tidak dikirim secara utuh.

```json
{
  "questionInstanceId": "11111111-1111-4111-8111-111111111111",
  "questionVersionId": "22222222-2222-4222-8222-222222222222",
  "type": "CATEGORY",
  "stem": { "text": "Tentukan kategori data dari setiap pertanyaan.", "assetKeys": [] },
  "options": [
    { "id": "A", "content": { "text": "Berapa jam kamu belajar setiap hari?", "assetKeys": [] } },
    {
      "id": "B",
      "content": { "text": "Apa mata pelajaran yang paling kamu sukai?", "assetKeys": [] }
    },
    { "id": "C", "content": { "text": "Berapa jumlah saudara kandungmu?", "assetKeys": [] } }
  ],
  "categories": [
    { "id": "QUANTITATIVE", "label": "Kuantitatif" },
    { "id": "QUALITATIVE", "label": "Kualitatif" }
  ],
  "savedAnswer": { "categoryByStatementId": { "A": "QUANTITATIVE" } },
  "answerRevision": 1,
  "media": []
}
```

UUID di atas adalah contoh valid, bukan ID database yang sudah dibuat. `answerRevision`/media-rich DTO adalah usulan tambahan, bukan output runtime sekarang. Non-CATEGORY dapat memakai categories kosong/absen sesuai schema final. savedAnswer null berarti belum menjawab.

Proyeksikan payload dengan allowlist. Jangan menyebarkan envelope impor atau `question_versions` mentah. Kunci, explanation, manifest pembahasan, source review notes dan provenance internal tidak masuk respons pengerjaan siswa.

## 14. Kontrak jawaban mentah ketiga tipe

**PROPOSED:** body berikut untuk endpoint preview baru; semantic payload yang sama menjadi target endpoint produksi setelah rollout disepakati. Server memeriksa type dengan versi item terpin, bukan percaya type dari client.

### PG

```json
{ "type": "SINGLE_CHOICE", "answer": { "optionId": "B" }, "expectedRevision": 0 }
```

### MCMA

```json
{
  "type": "MULTIPLE_CHOICE_MULTIPLE_ANSWER",
  "answer": { "optionIds": ["A", "B", "D"] },
  "expectedRevision": 0
}
```

### Kategori, boleh belum lengkap

```json
{
  "type": "CATEGORY",
  "answer": { "categoryByStatementId": { "A": "QUANTITATIVE", "B": "QUALITATIVE" } },
  "expectedRevision": 0
}
```

### Hapus seluruh jawaban

```json
{ "type": "SINGLE_CHOICE", "answer": null, "expectedRevision": 1 }
```

Answer null berlaku juga untuk MCMA/Category. MCMA array kosong dan Category map kosong dinormalisasi menjadi belum menjawab. Pada Category, pengiriman map mengganti seluruh jawaban item; untuk menghapus satu pernyataan, kirim map terbaru tanpa ID itu. Jangan menganggap map sebagian sebagai patch yang diam-diam mempertahankan isi lama.

Ketentuan server:

1. Verifikasi sesi/attempt dimiliki actor yang benar, item termasuk konteks, masih dapat dijawab, dan deadline produksi bila berlaku belum lewat.
2. Validasi body/type/ID opsi/ID pernyataan/kategori terhadap versi terpin. MCMA duplikat ditolak. ID Category yang tidak diisi dibolehkan; ID tidak dikenal ditolak.
3. Simpan payload `answer` tervalidasi sebagai jawaban mentah; jangan menggantinya dengan benar/salah atau poin. Tipe didapat dari questionVersion. Pada produksi, `attempt_answers.answer` tetap JSONB; penyesuaian format kosong harus kompatibel dengan decoder yang ada.
4. Save mengganti jawaban terbaru dalam transaksi. Server menentukan savedAt. Client tidak boleh mengirim kunci, poin, score, XP, grading state atau owner.
5. **PROPOSED concurrency:** expectedRevision adalah revision server yang terakhir dibaca. Setelah save, server menaikkan revision dan mengembalikannya. Konflik revision dengan isi berbeda → 409 ANSWER_REVISION_CONFLICT, client baca ulang. Retry payload identik terhadap state yang sudah tersimpan dapat mengembalikan acknowledgment state itu tanpa write baru. Penyimpanan revision/idempotency harus dibuat eksplisit; kolom tersebut belum ada pada attempt_answers sekarang.
6. UI menampilkan Saved hanya setelah acknowledgment commit; request gagal/pending tidak berlabel tersimpan. Resume menggunakan state server. Sesudah submit jawaban immutable.

Contoh acknowledgment usulan:

```json
{
  "questionInstanceId": "11111111-1111-4111-8111-111111111111",
  "savedAnswer": { "categoryByStatementId": { "A": "QUANTITATIVE", "B": "QUALITATIVE" } },
  "answerRevision": 1,
  "savedAt": "2026-10-03T09:00:00Z"
}
```

Submit harus atomik/idempotent dan mengunci perubahan jawaban. Jika retry Idempotency-Key mengirim payload berbeda, tolak konflik. Hash/idempotency scoping mencakup actor + sesi/attempt + operasi, bukan key global seluruh pengguna.

## 15. PGK partial, hasil, dan histori

**USER CLARIFICATION / PARTLY OPEN:** arah rubrik MCMA dan Category adalah partial. Ini tidak memberi izin memakai rumus jumlah-benar/jumlah-opsi, penalti pilihan salah, all-or-nothing, skor per pernyataan tertentu, atau rounding buatan.

**OPEN dari Curriculum:** poin maksimum tiap tipe/item, reward/penalty untuk pilihan benar/salah, perlakuan kosong, pemilihan semua opsi, map Category parsial, rentang minimum, pembulatan, normalisasi, dan kompatibilitas model IRT. Bedakan nilai item berbasis rubrik dari skor final TryOut yang dirilis sesudah pemrosesan IRT.

Saat rubric belum tersedia, preview tetap dapat menyimpan dan menampilkan raw answer. Hasil menggunakan status pending yang jujur:

```json
{
  "questionInstanceId": "11111111-1111-4111-8111-111111111111",
  "gradingState": "WAITING_RUBRIC",
  "submittedAnswer": { "categoryByStatementId": { "A": "QUANTITATIVE", "B": "QUALITATIVE" } },
  "awardedPoints": null,
  "maxPoints": null,
  "scoringPolicyVersionId": null
}
```

Jangan mengganti pending menjadi nol, failed atau skor sementara yang dianggap final. Mode review Admin dapat melihat source key/pembahasan yang belum disetujui dengan label DRAFT; itu tidak menjadikan hasil sebagai skor akademik.

Ketika rubrik disetujui, buat scoring_policy_version yang immutable; paket/attempt mem-pin policy, content version dan maxPoints. Input siswa tetap mentah. Riwayat menyimpan output grading aktual dan waktu/policy yang digunakan. Perubahan rubrik/soal tidak menghitung ulang hasil yang sudah released tanpa workflow koreksi terpisah yang disetujui.

**PRD RULE / latest feature context:** TryOut tidak menampilkan score/kunci/pembahasan sebelum result release yang sah; Drill mengikuti fase submit/hasil dan kebijakan retensi yang disetujui. Dokumen ini tidak menetapkan kembali angka retensi, XP, bintang, distribusi paket atau parameter IRT yang OPEN.

## 16. Validasi error dan akses

**PROPOSED codes baru** ditambahkan ke format Problem Details repo; nama final direview Backend. Kode legacy yang masih digunakan tetap dipertahankan selama rollout.

| HTTP    | Code usulan                                     | Penyebab                                                           |
| ------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| 400     | QUESTION_PAYLOAD_INVALID                        | Struktur, type, duplicate ID, field kunci atau nilai invalid.      |
| 400     | ANSWER_INVALID                                  | Jawaban tidak cocok dengan tipe/opsi/kategori versi item.          |
| 422     | MASTER_NOT_FOUND / TAXONOMY_SCOPE_MISMATCH      | Mapping bab/subbab/indikator/level gagal.                          |
| 422     | MEDIA_REFERENCE_INVALID                         | Marker/assetId/itemId tidak cocok dengan manifest.                 |
| 422     | MEDIA_NOT_READY                                 | Preview delivery membutuhkan objek yang belum tersedia.            |
| 409     | IMPORT_IDENTITY_CHANGE_REQUIRES_REVIEW          | ID lama berpindah tipe/indikator/level.                            |
| 409     | ANSWER_REVISION_CONFLICT / IDEMPOTENCY_CONFLICT | Save/import retry tidak kompatibel dengan state/key.               |
| 409     | SCORING_POLICY_UNAVAILABLE                      | Permintaan grading/publish final tanpa policy sah.                 |
| 401     | Mengikuti baseline auth repo                    | Belum login/token invalid.                                         |
| 403/404 | Mengikuti baseline otorisasi repo               | Izin operator gagal atau konteks milik pihak lain tidak ditemukan. |

Respons validasi menyertakan externalId/index/path yang gagal tanpa kredensial, signed URL, stack trace atau informasi siswa lain. Source input tidak boleh langsung diteruskan sebagai log. Endpoint review/kunci dan signer media mempunyai pemeriksaan resource authorization yang sama dengan endpoint konten.

## 17. Urutan implementasi dan acceptance untuk sampel

1. **Data + Curriculum:** review tabel kode, nama/penempatan dan level sumber; pertahankan source ID. Review kunci/pembahasan dan aset; tidak menebak PvP difficulty.
2. **Backend + Data:** setujui kontrak nullable difficulty, cabang tiga tipe, provenance/import identity dan preview persistence. Buat perubahan schema/migrasi lanjutan jika dibutuhkan; jangan mengedit migrasi lama atau langsung mengubah dashboard.
3. **Data + DevOps:** upload aset terverifikasi ke R2 private dengan objectKey/checksum durable. Perubahan byte gambar memakai object key baru agar versi lama tidak menampilkan gambar berbeda.
4. **Backend:** implementasi validasi dry-run, importer transaksi/idempotensi, DTO rich, signer media dan preview answer storage. Hasil dry-run mengungkap blocker, tidak menulis data bisnis.
5. **Frontend:** renderer PG/MCMA/Category, LaTeX/marker, beberapa gambar, state save/resume, renew link dan hasil pending rubric.
6. **QA bersama:** verifikasi skenario di bawah sebelum menyatakan preview selesai. Integrasi asesmen produksi/paket menunggu bank dan kebijakan yang terkait.

| Acceptance      | Bukti minimum                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Pemetaan        | Sepuluh ID terpetakan ke 2 bab/3 subbab/3 indikator dan source level 1, tanpa merge lintas scope.         |
| Tiga format     | PG satu pilihan, MCMA beberapa pilihan, Category pilihan per pernyataan tampil dan tersimpan sesuai type. |
| Refresh/resume  | Jawaban dan pinned version tidak hilang/berganti; revision/save status jujur.                             |
| Gambar          | Enam pemakaian/lima file unik tetap pada posisi yang benar, termasuk lebih dari satu gambar pembahasan.   |
| URL expired     | Renewal batch berhasil untuk aset yang diizinkan; gagal tidak menghapus jawaban/merestart sesi.           |
| Akses kunci     | Respons pengerjaan dan media sebelum hasil tidak mengandung kunci atau aset pembahasan.                   |
| PGK pending     | Jawaban tetap tersimpan; nilai null/WAITING_RUBRIC, tanpa formula buatan.                                 |
| Impor ulang     | Batch identik tidak menggandakan soal/versi; revisi membuat versi baru DRAFT.                             |
| Histori         | Revisi source/asset tidak mengubah content version/hasil lama.                                            |
| Race/otorisasi  | Save bersamaan, stale revision, repeated submit, dan akses sesi pihak lain ditangani server.              |
| Isolasi preview | Tidak menambah progres, XP, leaderboard atau input IRT produksi.                                          |

**Definition of ready untuk write:** kode/master valid, schema difficulty sudah kompatibel, source identity durable, storage metadata terdefinisi dan kontrak impor direview. **Definition of ready untuk preview bergambar:** tambah object key yang benar dan signer/render siap. **Definition of ready untuk grading PGK final:** rubrik lengkap dan policy version disetujui. Ketiganya adalah gate berbeda.

## 18. Referensi dan penyerahan

Dokumen ini disusun dari snapshot lokal soal/Sheets 3 Oktober 2026 dan kode baseline yang disebutkan. Tidak mengklaim audit ulang seluruh isi GDocs saat dokumen dibuat.

- [Draft kurikulum](https://docs.google.com/document/d/1xqdU-DLVW3dlscxKOCb1H1MNPqIPgQFtgpGc-1Jbexg/edit?usp=sharing).
- [Sheets ekstraksi sampel](https://docs.google.com/spreadsheets/d/1zU6OeahFcDWhF6Eq5HNy2LsSFi5yPVahr7QnZbKn0nw/edit).
- [PR #54 — slug dan level soal](https://github.com/ayiinee/Numora/pull/54).
- Repo: `AGENTS.md`, `docs/product/PRODUCT_CONTEXT.md`, `OPEN_DECISIONS.md`, `PRD_MAPPING.md`, `docs/data/QUESTION_CONTRACT.md`, `docs/data/CURRICULUM_SLUG_LEVEL_MIGRATIONS_2026-10-03.md`, ADR-004 dan ADR-008.
- Sumber machine-readable: `packages/contracts/questions/question.schema.json`, `question-variant.schema.json`, OpenAPI, DTO Content/Learning dan schema Content/Assessments.
- Sampel workspace: folder `sample-json-2026-10-03` berisi `questions.draft.json`, `assets.draft.json`, gambar, snapshot sumber dan laporan validasi lama. Laporan lama tetap mencatat difficulty sebagai missing; keputusan baru memerlukan perubahan kontrak, bukan sekadar mengisi EASY.

**Yang diminta dari Backend saat review handoff:** sepakati bentuk DTO/persistence dan rollout tiga tipe, endpoint preview/import, aturan revision/idempotensi, nullable difficulty, TTL/renew media, serta pemilik perubahan migration/contract. **Yang masih ditunggu Curriculum:** rubrik partial lengkap, review kunci/aset dan taxonomy final. Pemetaan PvP/paket final tetap OPEN dan tidak memblokir penyusunan kontrak preview dengan batas yang dijelaskan.
