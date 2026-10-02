# Teacher Monitoring tahap 1

## Kontrak yang sudah tersedia

**PRD RULE:** Teacher hanya boleh membaca Student dari Class yang ia kelola. Monitoring tidak mengubah hasil Assessment atau Progress.

**ENGINEERING DECISION:** Endpoint baca berikut memerlukan bearer token Supabase yang dipetakan ke akun Teacher aktif dan keanggotaan sekolah terverifikasi yang masih berlaku. Class arsip dan anggota yang sudah keluar tidak masuk hasil.

- `GET /api/v1/classes` → `{ "items": [{ "id": "UUID", "name": "IX A", "joinCode": "KODE" }] }` untuk Guru pemilik Class.
- `GET /api/v1/classes/{classId}/students` → `{ "class": { "id": "UUID", "name": "IX A" }, "items": [{ "id": "UUID", "displayName": "Nisa" }] }`.

Kesalahan memakai `application/problem+json`: 401 untuk sesi tidak berlaku, 403 untuk role/verifikasi/kepemilikan yang tidak memenuhi syarat, dan 404 untuk Class yang tidak ada atau diarsipkan. Path ID divalidasi sebagai UUID. Daftar Student hanya mengirim identitas minimum tanpa email atau kode join.

## Alur persiapan Class

**PRD RULE:** Token Guru berlaku 3×24 jam dan sekali pakai. Siswa hanya boleh menjadi anggota aktif satu Class.

**ENGINEERING IMPLEMENTATION awaiting FE/BE/QA review:** Admin yang sudah diprovisikan mengelola sekolah dan token melalui `/api/v1/admin/schools`. Token acak hanya dikembalikan ketika diterbitkan atau diterbitkan ulang; database menyimpan SHA-256, waktu kedaluwarsa, pemakaian, dan pencabutan. Guru memilih sekolah aktif dan mengirim token ke `POST /api/v1/schools/{schoolId}/teacher-verifications`. Konsumsi token dan pembuatan keanggotaan Guru berlangsung dalam satu transaksi; kondisi belum terpakai, belum dicabut, dan belum kedaluwarsa diperiksa saat pembaruan. Guru terverifikasi membuat Class melalui `POST /api/v1/classes`; respons dan daftar Class miliknya memuat `joinCode`. Siswa bergabung melalui `POST /api/v1/classes/join` dan keunikan anggota aktif ditegakkan indeks database. Akun Admin belum dapat didaftarkan dari formulir publik; kebijakan autentikasi Admin final mengikuti OPEN-14.

## Student Detail Drill demo

**ENGINEERING IMPLEMENTATION awaiting FE/BE/QA review:** `GET /api/v1/classes/{classId}/students/{studentId}/progress` mengembalikan identitas Student dan daftar Level terbit dalam urutan Content. Setiap baris memuat `levelId`, label bab/subbab/Level, `accessStatus: "LOCKED" | "UNLOCKED"`, `inProgress`, `latestDrillScore: number | null`, dan `bestDrillScore: number | null`. Level pertama terbuka menurut baseline PRD; level berikutnya terbuka hanya setelah progres tersimpan. Skor 0 adalah nilai nyata; `null` berarti belum ada hasil. Latest ditentukan oleh waktu finalisasi terbaru; best adalah skor final tertinggi. Riwayat sebelum Student bergabung tetap terlihat selama ia menjadi anggota aktif Class Teacher tersebut. Endpoint memanggil pemeriksaan Class milik Teacher yang sudah ada sebelum membaca progres.

**OPEN-01:** Definisi _Tuntas_ dan taksonomi final belum disetujui. Monitoring tahap ini tidak menampilkan interpretasi akademik _Tuntas_; data level demo dan status akses mengikuti ambang 80 yang juga dikonfirmasi Drill v1.2. Endpoint memerlukan migrasi Core Learning sebelum dapat dipakai di Cloud Development.

**ENGINEERING IMPLEMENTATION (review PR #17):** Untuk level setelah Level 1, akses memerlukan `level_progress.unlocked_at` yang terisi. Keberadaan baris progres saja tidak membuka level. API Student dan monitoring Teacher memakai syarat yang sama; submit Drill yang mencapai 80% juga mengisi waktu unlock pada baris level berikutnya yang sebelumnya masih kosong.

## Core Learning source update

[Drill v1.2](../product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md) confirms highest valid best score, separate attempt history, independent subchapter progress and irreversible unlock. Teacher remains a consumer of owned-Class progress, not a Drill parameter/content editor. Star thresholds, XP and retention remain DRL-OPEN; monitoring must not derive final formulas or reinterpret TryOut simulation scores. Free all-Student TryOut does not broaden Teacher access to Mandiri or another Teacher's Students.

## Feedback Guru satu arah

**PRD RULE:** Guru dapat mengirim catatan satu arah maksimal 1.000 karakter kepada Student dalam Class yang dikelolanya; Student tidak membalas. Status baca ditampilkan kepada Guru.

**ENGINEERING IMPLEMENTATION:** Semua endpoint berikut memakai Bearer Supabase melalui NestJS; browser tidak membaca tabel `feedback` secara langsung.

| Endpoint | Akses dan hasil |
|---|---|
| `POST /api/v1/classes/{classId}/students/{studentId}/feedback` | Teacher aktif dan terverifikasi, pemilik Class aktif; Student harus anggota aktif Class. Body `{ "body": "...", "clientRequestId": "<uuid>" }`; `clientRequestId` opsional, body di-trim dan harus 1–1.000 karakter. Retry dengan ID/payload sama mengembalikan catatan yang sama; ID sama dengan payload/aktor berbeda mendapat `409`. Mengembalikan `{ id, sentAt, readAt: null }` (`201`). |
| `GET /api/v1/classes/{classId}/students/{studentId}/feedback` | Teacher yang sama; daftar catatan yang ia kirim pada Class/Student itu beserta `readAt`, terbaru lebih dahulu. |
| `GET /api/v1/students/me/feedback` | Student aktif; hanya catatan milik Student autentikasi, terbaru lebih dahulu. |
| `PATCH /api/v1/students/me/feedback/{feedbackId}/read` | Hanya penerima Student. Menetapkan `readAt` sekali; pengulangan mengembalikan state yang sama dan tidak membuat event kedua. |

Request lintas Class/Teacher ditolak, Student yang bukan anggota aktif tidak terungkap (`404`), role yang salah/Teacher tidak terverifikasi ditolak (`403`), input body tidak valid mendapat `400`, dan feedback milik Student lain mendapat `404`. Record menyimpan `class_id_at_send` sebagai konteks historis. `feedback_sent`/`feedback_read` ditulis ke analytics outbox dalam transaksi yang sama; payload tidak memuat isi feedback. Pengiriman memakai idempotency key opsional agar retry network tidak membuat catatan ganda. Fitur Feedback bukan bagian sesi uji coba sekolah pertama menurut CLARIFICATION-006.
