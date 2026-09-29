# Detail audit baca Staging untuk rekonsiliasi Drill — 30 September 2026

Snapshot read-only dari `Numora-Staging` (`pkamenfnwmoeisccnrnk`) pada 30 September 2026 WIB. Tidak memuat kredensial, isi baris pengguna, atau PII. Dokumen ini melengkapi [laporan status Staging](SUPABASE_STAGING_AUDIT_2026-09-30.md) dan menjawab permintaan data dalam review PR #10. Reyhan kemudian menegaskan bahwa **skema Staging adalah acuan model database**. Saat diperiksa, `main` telah menambahkan `0001_open_the_twelve.sql` dan `0002_amusing_ravenous.sql` dengan bentuk tabel berbeda. Perbedaan tersebut harus direkonsiliasi pada riwayat migrasi dan kode aplikasi; skema `main` bukan target pengganti Staging. PR #10 belum dapat langsung di-merge atau dijalankan ulang karena benturan berkas dan riwayat migrasi.

## Seluruh riwayat `drizzle.__drizzle_migrations`

`created_at` disimpan sebagai Unix epoch milidetik; kolom UTC berikut hanya membantu pembacaan. Urutan ID 10–12 adalah catatan rekonsiliasi, bukan bukti DDL lama dijalankan ulang.

|  ID | Hash SHA-256                                                       | `created_at` (ms) | UTC                      |
| --: | ------------------------------------------------------------------ | ----------------: | ------------------------ |
|   1 | `71a4fdb33a68638cfe2c0a57f03d4cee140f104d750d0153c6c82b414db9dcad` |     1790617807491 | 2026-09-28T17:50:07.491Z |
|   2 | `2f7f66153f82d0ce03446679eb153059e81813717c9602488fbfaa50dd014e5e` |     1790667128109 | 2026-09-29T07:32:08.109Z |
|   3 | `957844259394c969c4490b2e9d0a2c8c64bd2065c4c1069078ea8e097840ad37` |     1790667460697 | 2026-09-29T07:37:40.697Z |
|   4 | `fb0bbd1b9c369d18fc1949ca4e4e79cd93ff784e5a52440d3b57ab0b15edea56` |     1790667538248 | 2026-09-29T07:38:58.248Z |
|   5 | `2413ceacb3885b37c398874c8bbaceb145f6ef818f7d0c365d957d51c0412e99` |     1790667628246 | 2026-09-29T07:40:28.246Z |
|   6 | `6ed12db9e283f32d51317e9ab5a68b8551ca1b4f13c5694fcd7cea4d19bb7dca` |     1790667672906 | 2026-09-29T07:41:12.906Z |
|   7 | `34b7b8a5021b49373cf7246c1fcc55a48f826788a02e19b86719d650151e9cf5` |     1790687771604 | 2026-09-29T13:16:11.604Z |
|   8 | `729ea8eb1ea28bc7a23cb6fc2c00c0c7465a0b31f6fa0088deeabe7e0532b12b` |     1790687850730 | 2026-09-29T13:17:30.730Z |
|   9 | `496e2007ffa9f3a0cc109b598236eb1983baa8ef0f63029594bcf4214160f203` |     1790687872052 | 2026-09-29T13:17:52.052Z |
|  10 | `360c52b2fc811f0711dcbd6b124c32224f1a60cac66063eecf68cfe726c82186` |     1790604821659 | 2026-09-28T14:13:41.659Z |
|  11 | `e0e17fad6a94e0fab072056bbd24b1b742e996fc9ac725b6fd2cdb32fbbc8f7f` |     1790690050100 | 2026-09-29T13:54:10.100Z |
|  12 | `f483b0eea643ffa859f72d61ae03516e3419237421455cd9343ffd6b471e65d4` |     1790690135460 | 2026-09-29T13:55:35.460Z |

Terdapat 12 entri dengan 12 hash unik. Sembilan entri pertama merekam bootstrap lama; tiga entri terakhir mencocokkan rangkaian migrasi kanonik PR #10. Supabase Migration History secara terpisah berisi 10 entri (sembilan bootstrap + satu rekonsiliasi). Riwayat ini harus dibandingkan dengan jurnal Drizzle pada `main` terbaru sebelum migrasi korektif.

## Jumlah data yang perlu diperhatikan

| Objek                      | Jumlah baris |
| -------------------------- | -----------: |
| `public.chapters`          |            0 |
| `public.level_progress`    |            0 |
| `public.levels`            |            0 |
| `public.question_variants` |            0 |
| `public.question_versions` |            0 |
| `public.questions`         |            0 |
| `public.subchapters`       |            0 |
| Seluruh 46 tabel `public`  |      0 total |
| `auth.users`               |            2 |
| `storage.objects`          |            0 |

Dua akun Supabase Auth **ada**, meski semua tabel aplikasi kosong. Setelah snapshot, Reyhan mengonfirmasi bahwa keduanya merupakan entri yang keliru, bukan akun pengguna Numora yang sengaja disiapkan. Klarifikasi ini berasal dari pemilik proyek, bukan dari isi akun. Keduanya belum dihapus; keputusan pembersihan akun terpisah dari rekonsiliasi migrasi. `assessment_attempts` dan `attempt_answers` masing-masing 0 baris. Tidak ada hasil Drill historis dalam tabel aplikasi saat snapshot ini, namun perubahan skema tetap harus diuji untuk deployment baru dan data mendatang.

## Struktur tujuh tabel Drill

Kolom ditampilkan dalam urutan ordinal PostgreSQL. `NULL` pada default berarti tidak ada default. Bagian constraint menampilkan hasil `pg_get_constraintdef`; indeks menampilkan `pg_indexes.indexdef` dari database aktif.

### `public.chapters` (0 baris)

|   # | Kolom           | Tipe             | Nullable | Default                   |
| --: | --------------- | ---------------- | -------- | ------------------------- |
|   1 | `id`            | `uuid`           | NO       | `gen_random_uuid()`       |
|   2 | `code`          | `text`           | NO       | —                         |
|   3 | `name`          | `text`           | NO       | —                         |
|   4 | `description`   | `text`           | YES      | —                         |
|   5 | `display_order` | `integer`        | NO       | —                         |
|   6 | `status`        | `content_status` | NO       | `'DRAFT'::content_status` |

Constraints (C = CHECK, F = FK, P = primary key):

```text
C chapters_name_ck: CHECK (length(TRIM(BOTH FROM name)) > 0)
C chapters_order_ck: CHECK (display_order > 0)
P chapters_pkey: PRIMARY KEY (id)
```

Indeks:

```sql
CREATE UNIQUE INDEX chapters_code_uq ON public.chapters USING btree (code);
CREATE UNIQUE INDEX chapters_order_uq ON public.chapters USING btree (display_order);
CREATE UNIQUE INDEX chapters_pkey ON public.chapters USING btree (id);
```

### `public.subchapters` (0 baris)

|   # | Kolom           | Tipe             | Nullable | Default                   |
| --: | --------------- | ---------------- | -------- | ------------------------- |
|   1 | `id`            | `uuid`           | NO       | `gen_random_uuid()`       |
|   2 | `chapter_id`    | `uuid`           | NO       | —                         |
|   3 | `code`          | `text`           | NO       | —                         |
|   4 | `name`          | `text`           | NO       | —                         |
|   5 | `description`   | `text`           | YES      | —                         |
|   6 | `display_order` | `integer`        | NO       | —                         |
|   7 | `status`        | `content_status` | NO       | `'DRAFT'::content_status` |

Constraints (C = CHECK, F = FK, P = primary key):

```text
C subchapters_order_ck: CHECK (display_order > 0)
F subchapters_chapter_id_chapters_id_fk: FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE RESTRICT
P subchapters_pkey: PRIMARY KEY (id)
```

Indeks:

```sql
CREATE UNIQUE INDEX subchapters_chapter_code_uq ON public.subchapters USING btree (chapter_id, code);
CREATE UNIQUE INDEX subchapters_chapter_order_uq ON public.subchapters USING btree (chapter_id, display_order);
CREATE UNIQUE INDEX subchapters_pkey ON public.subchapters USING btree (id);
```

### `public.levels` (0 baris)

|   # | Kolom                 | Tipe             | Nullable | Default                   |
| --: | --------------------- | ---------------- | -------- | ------------------------- |
|   1 | `id`                  | `uuid`           | NO       | `gen_random_uuid()`       |
|   2 | `subchapter_id`       | `uuid`           | NO       | —                         |
|   3 | `level_number`        | `integer`        | NO       | —                         |
|   4 | `description`         | `text`           | YES      | —                         |
|   5 | `difficulty_criteria` | `jsonb`          | YES      | —                         |
|   6 | `status`              | `content_status` | NO       | `'DRAFT'::content_status` |

Constraints (C = CHECK, F = FK, P = primary key):

```text
C levels_number_ck: CHECK (level_number > 0)
F levels_subchapter_id_subchapters_id_fk: FOREIGN KEY (subchapter_id) REFERENCES subchapters(id) ON DELETE RESTRICT
P levels_pkey: PRIMARY KEY (id)
```

Indeks:

```sql
CREATE UNIQUE INDEX levels_pkey ON public.levels USING btree (id);
CREATE UNIQUE INDEX levels_subchapter_number_uq ON public.levels USING btree (subchapter_id, level_number);
```

### `public.questions` (0 baris)

|   # | Kolom                   | Tipe                       | Nullable | Default                   |
| --: | ----------------------- | -------------------------- | -------- | ------------------------- |
|   1 | `id`                    | `uuid`                     | NO       | `gen_random_uuid()`       |
|   2 | `primary_competency_id` | `uuid`                     | NO       | —                         |
|   3 | `source_ref`            | `text`                     | YES      | —                         |
|   4 | `status`                | `content_status`           | NO       | `'DRAFT'::content_status` |
|   5 | `created_at`            | `timestamp with time zone` | NO       | `now()`                   |

Constraints (C = CHECK, F = FK, P = primary key):

```text
F questions_primary_competency_id_competencies_id_fk: FOREIGN KEY (primary_competency_id) REFERENCES competencies(id) ON DELETE RESTRICT
P questions_pkey: PRIMARY KEY (id)
```

Indeks:

```sql
CREATE INDEX questions_competency_idx ON public.questions USING btree (primary_competency_id);
CREATE UNIQUE INDEX questions_pkey ON public.questions USING btree (id);
```

### `public.question_versions` (0 baris)

|   # | Kolom                   | Tipe                       | Nullable | Default                   |
| --: | ----------------------- | -------------------------- | -------- | ------------------------- |
|   1 | `id`                    | `uuid`                     | NO       | `gen_random_uuid()`       |
|   2 | `variant_id`            | `uuid`                     | NO       | —                         |
|   3 | `version_number`        | `integer`                  | NO       | —                         |
|   4 | `question_type`         | `question_type`            | NO       | —                         |
|   5 | `stem`                  | `jsonb`                    | NO       | —                         |
|   6 | `options_or_statements` | `jsonb`                    | NO       | —                         |
|   7 | `answer_key`            | `jsonb`                    | NO       | —                         |
|   8 | `explanation`           | `jsonb`                    | NO       | —                         |
|   9 | `media`                 | `jsonb`                    | YES      | —                         |
|  10 | `difficulty`            | `text`                     | NO       | —                         |
|  11 | `content_status`        | `content_status`           | NO       | `'DRAFT'::content_status` |
|  12 | `reviewed_by_user_id`   | `uuid`                     | YES      | —                         |
|  13 | `reviewed_at`           | `timestamp with time zone` | YES      | —                         |
|  14 | `created_at`            | `timestamp with time zone` | NO       | `now()`                   |

Constraints (C = CHECK, F = FK, P = primary key):

```text
C question_versions_number_ck: CHECK (version_number > 0)
C question_versions_review_ck: CHECK (content_status <> 'READY'::content_status OR reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
F question_versions_reviewed_by_user_id_users_id_fk: FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
F question_versions_variant_id_question_variants_id_fk: FOREIGN KEY (variant_id) REFERENCES question_variants(id) ON DELETE RESTRICT
P question_versions_pkey: PRIMARY KEY (id)
```

Indeks:

```sql
CREATE UNIQUE INDEX question_versions_pkey ON public.question_versions USING btree (id);
CREATE INDEX question_versions_status_idx ON public.question_versions USING btree (content_status);
CREATE UNIQUE INDEX question_versions_variant_version_uq ON public.question_versions USING btree (variant_id, version_number);
```

### `public.question_variants` (0 baris)

|   # | Kolom                 | Tipe           | Nullable | Default             |
| --: | --------------------- | -------------- | -------- | ------------------- |
|   1 | `id`                  | `uuid`         | NO       | `gen_random_uuid()` |
|   2 | `question_id`         | `uuid`         | NO       | —                   |
|   3 | `original_variant_id` | `uuid`         | YES      | —                   |
|   4 | `variant_code`        | `text`         | NO       | —                   |
|   5 | `kind`                | `variant_kind` | NO       | —                   |
|   6 | `origin`              | `text`         | NO       | —                   |

Constraints (C = CHECK, F = FK, P = primary key):

```text
C question_variants_original_ck: CHECK (kind = 'ORIGINAL'::variant_kind AND original_variant_id IS NULL OR kind = 'VARIANT'::variant_kind AND original_variant_id IS NOT NULL)
F question_variants_original_variant_id_question_variants_id_fk: FOREIGN KEY (original_variant_id) REFERENCES question_variants(id) ON DELETE RESTRICT
F question_variants_question_id_questions_id_fk: FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT
F question_variants_same_family_fk: FOREIGN KEY (original_variant_id, question_id) REFERENCES question_variants(id, question_id) ON DELETE RESTRICT
P question_variants_pkey: PRIMARY KEY (id)
```

Indeks:

```sql
CREATE UNIQUE INDEX question_variants_id_question_uq ON public.question_variants USING btree (id, question_id);
CREATE INDEX question_variants_original_idx ON public.question_variants USING btree (original_variant_id);
CREATE UNIQUE INDEX question_variants_pkey ON public.question_variants USING btree (id);
CREATE UNIQUE INDEX question_variants_question_code_uq ON public.question_variants USING btree (question_id, variant_code);
```

### `public.level_progress` (0 baris)

|   # | Kolom                   | Tipe                       | Nullable | Default             |
| --: | ----------------------- | -------------------------- | -------- | ------------------- |
|   1 | `id`                    | `uuid`                     | NO       | `gen_random_uuid()` |
|   2 | `student_id`            | `uuid`                     | NO       | —                   |
|   3 | `level_id`              | `uuid`                     | NO       | —                   |
|   4 | `unlocked_at`           | `timestamp with time zone` | YES      | —                   |
|   5 | `completed_at`          | `timestamp with time zone` | YES      | —                   |
|   6 | `unlock_source`         | `text`                     | YES      | —                   |
|   7 | `unlocking_attempt_id`  | `uuid`                     | YES      | —                   |
|   8 | `completion_attempt_id` | `uuid`                     | YES      | —                   |
|   9 | `latest_score`          | `numeric`                  | YES      | —                   |
|  10 | `best_score`            | `numeric`                  | YES      | —                   |
|  11 | `best_stars`            | `integer`                  | YES      | —                   |

Constraints (C = CHECK, F = FK, P = primary key):

```text
C level_progress_best_score_ck: CHECK (best_score IS NULL OR best_score >= 0::numeric AND best_score <= 100::numeric)
C level_progress_completed_ck: CHECK (completed_at IS NULL OR unlocked_at IS NOT NULL AND completed_at >= unlocked_at)
F level_progress_completion_attempt_id_assessment_attempts_id_fk: FOREIGN KEY (completion_attempt_id) REFERENCES assessment_attempts(id) ON DELETE RESTRICT
F level_progress_level_id_levels_id_fk: FOREIGN KEY (level_id) REFERENCES levels(id) ON DELETE RESTRICT
F level_progress_student_id_users_id_fk: FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT
F level_progress_unlocking_attempt_id_assessment_attempts_id_fk: FOREIGN KEY (unlocking_attempt_id) REFERENCES assessment_attempts(id) ON DELETE RESTRICT
P level_progress_pkey: PRIMARY KEY (id)
```

Indeks:

```sql
CREATE UNIQUE INDEX level_progress_pkey ON public.level_progress USING btree (id);
CREATE UNIQUE INDEX level_progress_student_level_uq ON public.level_progress USING btree (student_id, level_id);
```

## Batas hasil audit

Snapshot ini membuktikan struktur dan jumlah baris pada waktu pemeriksaan, tetapi belum membuktikan bahwa rangkaian migrasi PR #10 dapat digabung dengan riwayat `main` terbaru. Langkah integrasi harus mempertahankan model data Staging sebagai target: sesuaikan API Drill/kontrak yang sudah ada, susun migrasi maju setelah `0002` di `main` agar instalasi baru mencapai target yang sama, dan rancang jalur untuk Staging yang sudah memiliki target tersebut tanpa menjalankan DDL duplikat. Uji kedua jalur pada database kosong dan salinan Staging. Backup manual/PITR belum diverifikasi; organisasi menggunakan paket Free. Jangan menjalankan migrasi korektif di Staging sebelum ada backup yang dapat dipulihkan dan hasil uji transisi.
