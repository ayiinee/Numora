# Audit revisi Kurikulum Tryout

## Catatan perubahan production

Pada 24 November 2026 WIB, skrip dari commit `fdf49328` dijalankan dari branch lokal
untuk membuat draf revisi. Saat itu skrip belum melewati review PR, CI GitHub, dan
merge ke `main`. Tes lokal dan persetujuan pengerjaan mendahului operasi tersebut.
Jalur revisi Admin yang tersedia saat itu hanya mendukung pilihan ganda, sedangkan
soal 27 bertipe kategori.

- Paket sumber `c235f2e2-3057-4279-a97e-efd399799e57`.
- Draf revisi v2 `5fc03163-4ca0-4c17-8db5-eaa86b825ae7`, dengan 30 soal dalam urutan semula.
- Empat versi soal baru pada posisi 10, 16, 17, dan 27, dengan hubungan ke versi
  terdahulu. Sebanyak 26 versi dipakai ulang.
- Operasi tercatat di `audit_logs` sebagai `tryout_curriculum_revision_20261124`.
  Verifikasi baca-saja setelah transaksi menemukan kembali UUID draf yang sama.
- Pemeriksaan PostgreSQL terisolasi mencakup dry-run, penolakan digest basi,
  pembuatan draf, komposisi, dan replay. Pemeriksaan production melalui Admin
  memverifikasi tampilan enam soal. PDF memuat 30 soal dan lima diagram berbeda.

Skrip dan tes dalam PR ini menyimpan jejak implementasi operasi tersebut. Draf
yang sudah tercatat menjadi bukti audit. Eksekusi ulang production berada di luar
cakupan PR ini.

## Prosedur perubahan berikutnya

1. Ajukan skrip dan rencana perubahan lewat PR ke `main`. Sertakan target,
   ruang lingkup data, hasil dry-run dan tes terisolasi, serta rencana pemulihan.
2. Selesaikan review dan CI pada SHA yang sama. Merge melalui prosedur tim.
3. Operator memakai checkout dengan SHA hasil merge yang terverifikasi dan
   role database sesuai runbook. Cocokkan ulang target serta digest dry-run
   sebelum apply. Bila berbeda, hentikan dan perbarui review.
4. Verifikasi hasil dengan akses baca-saja dan catat SHA, hasil, serta receipt audit.
   Persetujuan Kurikulum dan publikasi draf tetap mengikuti alur Admin.

Deploy aplikasi mengikuti [runbook deployment](DEPLOYMENT.md). Cocokkan SHA yang
akan dibangun dengan GitHub `main` sebelum restart service.
