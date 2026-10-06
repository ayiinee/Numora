# Penerimaan sekali Drill Bab 3 — 7 Oktober 2026

**ENGINEERING DECISION — instruksi eksplisit pemilik proyek:** “KHUSUS KALI INI ter-accept langsung biar gak draft, dan langsung muncul di student”. Berlaku hanya pada 120 original indikator 16–19, Paket 1, level 1–3, namespace `NUMORA_AI_DRILL_1`. Impor berikutnya tetap mengikuti alur review biasa.

## Status dan batas

- 12 paket PUBLISHED; 120 keluarga soal dan versi aktif READY / CONTENT_VALID.
- Versi accepted baru menyalin versi impor, dengan `revised_from_question_version_id`; versi DRAFT lama dipertahankan sebagai histori.
- Difficulty `OWNER_ACCEPTED_UNCALIBRATED`, audit `OWNER_ONE_OFF_DRILL_ACCEPTED`. Tidak mengklaim review Curriculum atau kalibrasi IRT.
- Policy `DRILL_CH3_OWNER_ACCEPTED_2026_10_07`, versi 1, memiliki allowlist UUID di bawah. Runtime memakai policy yang dipin pada attempt; paket lain tetap mengikuti guard PGK existing.
- PG dinilai tepat/salah. MCMA menghitung keputusan memilih/tidak memilih yang benar; Kategori menghitung pernyataan yang dikategorikan benar. Jawaban kosong bernilai nol. Benar ekuivalen = keputusan benar / jumlah keputusan; poin per soal dibulatkan dua desimal. Rubrik khusus disimpan SEALED, mengikuti pola keputusan parsial Tryout existing.
- Nilai, mastery 80%, bintang dan XP dasar memakai benar ekuivalen. XP dasar dibulatkan ke integer karena kolom `base_xp` existing; bonus kecepatan dan cap 150 tetap existing. Ini batas sementara pengecualian, bukan rubrik Drill umum yang disahkan Curriculum.
- Indikator 19 dipisah ke `SC-VOLUME-OWNER-CH3` / `volume-bangun-ruang`, UUID `8d30ddaf-0054-4978-97e6-6aae35d60bca`. Indikator 18 tetap `SC-PENG`; satu paket aktif per level tetap berlaku. Tidak ada attempt/progress Pengukuran saat perubahan ini diterapkan.
- Pembahasan accepted `pg-17-3-2` memperbaiki tanda koordinat: refleksi X lalu Y menghasilkan `(-x,-y)`, setara rotasi 180°. Histori sumber tetap utuh.
- Level 4–5 belum memiliki soal. Unlock Student tetap normal; penerimaan konten tidak membuka semua level untuk semua siswa.

## Paket yang diizinkan

| Indikator | Level | UUID paket |
|---|---:|---|
| 16 | 1 | 694a48b4-03de-4254-a443-210c196d3528 |
| 16 | 2 | fa2d8843-62da-48a0-815e-ddb80d1534e5 |
| 16 | 3 | bc4f2a8e-3670-4a9e-a321-cc9435a9b0fd |
| 17 | 1 | 8c3cb363-8d68-4044-8550-c2de2e9f28fe |
| 17 | 2 | 12aafccb-52b2-4d03-9ac0-06dd100da5a8 |
| 17 | 3 | a656f8e9-1910-468d-84fb-6798bca2398a |
| 18 | 1 | 0853cc60-3f65-4030-8dc5-a199d8219126 |
| 18 | 2 | a02d4872-2a1a-46e5-80b5-e45220593f9b |
| 18 | 3 | ba6765c5-d62a-48b4-b73a-078276ed83f0 |
| 19 | 1 | 7f3a2052-6b81-40f9-ad6e-8f750f0093e9 |
| 19 | 2 | 5e8be7e3-7b46-40a4-80bd-8c78cf70cf18 |
| 19 | 3 | 7bb671ae-c46f-43fc-b227-df32b2b15000 |

## Verifikasi

Tes unit membatasi policy/UUID/version, memvalidasi jawaban PGK, memeriksa parsial/kosong dan menjaga reward paket biasa. Typecheck, lint dan build API lulus.

Pemeriksaan dengan service Student dan PostgreSQL nyata menjalankan 12 paket / 120 soal: katalog, tiga format, simpan jawaban, submit, skor parsial, pembahasan, XP, penolakan level terkunci, unlock bertahap dan submit ulang tanpa XP ganda. Autentikasi memakai identity test double; ini bukan tes browser. Seluruh fixture, attempt dan XP uji di-rollback.

Jalankan dari repo `Numora-ai-service`, setelah build API:

```powershell
node --env-file=../Numora/.env .scratch/check_chapter3_student.cjs
```

Database target mengikuti `.env` lokal yang dikonfigurasi; tidak ada deployment VPS dalam pekerjaan ini. Skrip operasi/mapping berada pada `.scratch/` ignored; audit dan allowlist canonical tersimpan di database.
