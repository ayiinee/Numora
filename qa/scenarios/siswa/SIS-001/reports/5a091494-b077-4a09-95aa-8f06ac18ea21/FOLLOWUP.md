# SIS-001 — tindak lanjut hasil optimasi

Run versi baru: `5a091494-b077-4a09-95aa-8f06ac18ea21`, parent retest C `581a3c97-fe69-40d3-af72-576b22033593`. Implementasi berada di branch QA aktif; tidak ada commit/push/merge/deploy.

- Volume versi baru: **PASS**. Rekonsiliasi: `{"source": 111000, "delivered": 111000, "pending": 0, "processed_without_analytics": 0, "mismatch": 0}`. Hasil lama tetap tersedia; status retest ini hanya berlaku untuk fingerprint versi baru dan lingkungan lokal.
- HTTP load/stress versi baru: **PASS**. Lihat metrics dan rekonsiliasi pada result.json. Peningkatan profil gelombang 250 dari p95 14,730 detik ke 6.816 detik adalah observasi lokal satu pengukuran, bukan SLO produksi atau jaminan semua kondisi timeout terselesaikan.
- Worker 25/25 PASS; learning 42/42 PASS; workflow 39/39 PASS. Sweep API serial 237 PASS, satu tes workbook akademik eksternal NOT_RUN. Sweep tambahan tetap incomplete; fixture asli belum tersedia. Tidak ada penggantian workbook dengan sampel berbeda.
- Kegagalan awal mock projection dan konflik fixture TryOut pada sweep paralel dipertahankan dalam ringkasan regresi. Mock diperbarui dengan assertion bisnis yang sama; sweep API memakai satu worker pada database baru. Tidak ada perubahan kode TryOut atau pelonggaran assertion.
- Dependency dan manual tetap mengikuti result.json, bukan persetujuan penggunaan workflow. Kinerja lokal, auth fixture dan konten sintetis tidak membuktikan staging, Google login nyata atau persetujuan Curriculum.

Verifikasi struktur: signature worker dan DTO publik tetap; rollback kelompok/fallback, deduplikasi dan cooldown diuji. Delivery hasil tetap setelah grading committed; error delivery tetap dilempar dan retry tidak menggandakan XP/outbox.
