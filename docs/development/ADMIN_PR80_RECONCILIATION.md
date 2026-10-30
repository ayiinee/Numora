# Rekonsiliasi PR Admin #80 — 30 Oktober 2026

**ENGINEERING DECISION — pelaksanaan Aini atas permintaan pemilik:** perbaikan PR lama dilakukan melalui akun `ayiinee`, mempertahankan implementasi terbaru pada main `9ca7db5`.

Tujuan awal #80 adalah pembatasan Admin menurut assignment aktif dan pemisahan akses operasi/konten. Tujuan tersebut sudah ditangani oleh integrasi Admin #110 dan runtime #111. Mengembalikan implementasi 6 Oktober akan menghapus capability terbaru, audit berdasarkan domain, penelusuran pengguna/kelas dan editor yang sudah diterima.

| Area PR lama       | Implementasi yang dipertahankan                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Permission sentral | `admin-capabilities.ts`, capability dari assignment server; null/unknown tidak memiliki hak                                               |
| Guard Admin/konten | `AdminGuard` dan `ContentAdminGuard`; akun aktif dan capability diperiksa sebelum akses                                                   |
| Sekolah/token      | Controller dan service sekolah terbaru; Content hanya mendapat pembacaan terbatas yang diizinkan                                          |
| Audit              | `AUDIT_READ` dengan scope domain dan redaksi pada server; tidak mengembalikan aturan lama yang membatasi seluruh audit kepada Super Admin |
| Frontend           | Workspace, navigation, akses, pagination dan generated types dari main terbaru                                                            |

Sisa kontribusi yang diintegrasikan berupa tes guard langsung, disesuaikan dengan capability saat ini. Tes memeriksa default route yang menolak akses tanpa capability account-management, assignment tak dikenal, peran/status tidak valid, penolakan lintas capability, serta konteks/header peran canonical. Capability yang diklaim pada payload profil tidak dapat melewati assignment server.

Ini rekonsiliasi kode/tes, bukan aturan produk baru. Tidak ada perubahan aplikasi, kontrak, skema, assignment akun nyata atau Cloud. Tes HTTP permission existing tetap diperlukan, demikian juga seluruh required CI pada head baru sebelum approval/merge.
