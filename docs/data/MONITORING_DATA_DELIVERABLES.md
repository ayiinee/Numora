# Handoff Monitoring dan Feedback — rekonsiliasi PR #30

**ENGINEERING DECISION — Aini, 30 Oktober 2026:** atas permintaan pemilik, PR RayDitya direkonsiliasi melalui akun `ayiinee` terhadap main `650308a`. Implementasi Feedback yang lebih baru sudah masuk melalui integrasi sebelumnya; controller/service, kontrak, notifikasi dan aturan akses terbaru dipertahankan. PR ini melengkapi bukti regresi dan panduan, tanpa mengembalikan API atau seed lama.

## Perilaku dan kontrak yang berlaku

**PRD RULE:** data progres/hasil dimiliki akun. Guru hanya mengakses siswa dalam kelas yang dimilikinya dan akses monitoring berakhir ketika kepemilikan/keanggotaan berakhir. Kelas dapat tetap ada tanpa Guru. Angka akademik mengikuti sumber produk terbaru, bukan contoh data pada PR lama.

**ENGINEERING IMPLEMENTATION — kontrak existing:**

| Operasi         | Endpoint                                                                | Hasil                                                                                                |
| --------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Guru mengirim   | `POST /api/v1/classes/{classId}/students/{studentId}/feedback`          | `201`, `{id}`; body berisi UUID `clientRequestId` wajib dan `body` 1–1.000 karakter bukan whitespace |
| Guru membaca    | `GET /api/v1/classes/{classId}/students/{studentId}/feedback`           | `{items, nextOffset}`, mengikuti limit/offset dan akses kelas saat ini                               |
| Riwayat asesmen | `GET /api/v1/classes/{classId}/students/{studentId}/assessment-results` | Riwayat dengan cursor, sesuai akses dan waktu rilis hasil                                            |
| Inbox siswa     | `GET /api/v1/students/me/feedback`                                      | Hanya milik akun siswa peminta, dengan limit/offset                                                  |
| Ringkasan siswa | `GET /api/v1/students/me/feedback/summary`                              | Jumlah belum dibaca dan catatan terbaru milik akun                                                   |
| Tandai dibaca   | `POST /api/v1/students/me/feedback/{feedbackId}/read`                   | `201`, `{id, readAt}`; waktu baca pertama dipertahankan saat retry                                   |

Siswa tidak membalas melalui endpoint Guru. Error memakai `application/problem+json`. Session tidak sah ditolak; peran/status/verifikasi dan kepemilikan tetap diperiksa pada server. `clientRequestId` yang sama dengan payload sama tidak menggandakan feedback/outbox; penggunaan ID yang sama untuk aktor/payload lain ditolak. Validasi idempotensi tidak memberi akses kepada Guru yang sudah kehilangan kepemilikan.

Sumber kontrak: [OpenAPI](../../packages/contracts/openapi/openapi.json), [otorisasi](../api/AUTHORIZATION.md), [Monitoring](../api/TEACHER_MONITORING.md). DTO dan source service terbaru lebih tepat untuk reproduksi daripada nomor baris pada laporan 2 Oktober.

## Matriks bukti

| Kondisi                                                                            | Pemeriksaan existing / tambahan                                                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Sesi kosong, siswa/Admin mencoba route Guru, Guru belum diverifikasi atau disabled | Ditolak sebelum mengungkap catatan siswa                                                              |
| Guru kelas lain atau siswa di luar roster                                          | `404` untuk Feedback; tidak membocorkan keberadaan catatan                                            |
| Retry kirim bersamaan                                                              | Satu feedback dan efek outbox sesuai sumber idempotensi                                               |
| Riwayat Guru                                                                       | Terbatas pada kelas dan siswa yang diizinkan; pagination tidak membuka kelas lain                     |
| Tandai dibaca bersamaan                                                            | Hanya penerima, timestamp pertama tetap sama dan event tidak berulang                                 |
| Kepemilikan berakhir setelah pengiriman                                            | Tambahan regresi #30: retry identik dan pembacaan Guru ditolak, catatan lama tetap ada di inbox siswa |

Tes tambahan menggunakan kelas/membership terpisah dalam database test localhost, mengakhiri kepemilikan dengan menjadikan kelas tanpa Guru, lalu membersihkan data fixture terkait. Ini tidak memindahkan kepemilikan kelas nyata atau menulis ke layanan bersama.

## Reproduksi dan batas

Gunakan Node/pnpm dari repository dan [layanan test terisolasi](../development/GETTING_STARTED.md#dedicated-local-test-dependencies). Setelah migrasi database test:

```powershell
pnpm --filter @tka/api exec vitest run src/modules/feedback/feedback.integration.spec.ts
```

Suite sengaja **skipped** bila `TEST_DATABASE_URL` tidak diatur. Hasil skipped tidak membuktikan penerimaan database; required CI menjalankan PostgreSQL/Redis terisolasi. Catat SHA, environment, jumlah pass/skip dan tautan run. Jangan mengganti URL dengan database Cloud atau memakai akun siswa nyata untuk fixture ini.

Seed `db:seed:monitoring` dari branch 2 Oktober tidak diaktifkan kembali. Ia memakai namespace/policy dan status bintang historis yang sudah digantikan; menjalankannya bukan syarat menggunakan API Feedback. Fixture HTTP/PostgreSQL existing dan fixture Guru/siswa browser menjadi dasar QA yang sesuai kontrak terbaru. Tidak ada migrasi, perubahan scoring/XP, import soal, Auth provisioning, atau deployment yang dilakukan oleh rekonsiliasi ini.

Event, audit, notifikasi dan outbox mengikuti implementasi/flag existing; tidak menetapkan kontrak ilmiah atau kebijakan akademik baru. Bukti CI kandidat baru dan review tetap wajib sebelum merge. Tidak mengklaim tes layanan Development nyata, Google OAuth atau hasil browser dari bukti database saja.
