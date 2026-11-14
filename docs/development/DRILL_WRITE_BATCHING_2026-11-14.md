# Bulk upsert grading Drill

**ENGINEERING DECISION — 14 November 2026:** selesaikan bagian grading pada
prioritas 5 melalui satu upsert seluruh jawaban, menggantikan loop satu statement
per item. Baseline main `7288b4b3`. Batch import ditangani terpisah di PR import.

Insert memakai nilai grading per item; conflict update hanya mengubah awarded
points, kategori, fullyCorrect, responseState dan gradedAt dari nilai EXCLUDED.
Jawaban tersimpan, revision, savedAt dan identitas row existing dipertahankan.
Jawaban kosong baru tetap JSON null. Guard array kosong mempertahankan perilaku
loop lama tanpa memanggil VALUES kosong.

Upsert berada dalam transaksi grading existing bersama final status, timer,
latest/best progress, unlock, XP immutable serta outbox. Lock attempt, duplicate
submit, ownership, policy/versi konten, partial-scoring gate dan histori tidak
berubah. Tidak ada migrasi, environment atau kontrak API baru.

## Verifikasi

Fixture PostgreSQL localhost memakai statement-level AFTER INSERT trigger khusus
pengukuran, lalu menghapus instrumentasinya dalam finally. Untuk sepuluh item
dan dua submit bersamaan, baseline menghasilkan **10 statement upsert**; sesudah
perubahan **1**. Submit replay tidak menulis ulang grading/XP. Budget statement
gagal pada baseline seperti yang diharapkan.

Suite reward/lifecycle juga memeriksa rollback setelah posting XP dan sebelum
completion outbox, akun lain, legacy policy pin, retry, score/stars nol, unlock
permanen dan hasil historis. Regresi tambahan memastikan sepuluh jawaban final
ada dan setiap jawaban yang sudah disimpan mempertahankan answer/revision/savedAt.
Query result/delivery, durasi dan formula reward tetap memakai jalur existing.

Tidak menjalankan grading atau benchmark mutasi pada Supabase cloud. Pengurangan
statement lokal bukan persentase egress atau SLO produksi. Ukuran hasil akhir
grading tetap sama; manfaat utamanya perjalanan API–DB di dalam transaksi.

```powershell
pnpm --filter @tka/api exec vitest run src/modules/learning/drill-reward.integration.spec.ts src/modules/learning/learning.flow.integration.spec.ts
pnpm --filter @tka/api typecheck
pnpm --filter @tka/api build
```

Gunakan NODE_ENV=test dan TEST_DATABASE_URL localhost khusus yang sudah
dimigrasikan, kosongkan DATABASE_URL/DATABASE_MIGRATION_URL cloud. Setelah review
dan merge, deploy API dan pantau transaksi grading, duplicate submit, XP/outbox
serta error. Rollback dengan revert dan redeploy, tanpa pemulihan data/schema.
