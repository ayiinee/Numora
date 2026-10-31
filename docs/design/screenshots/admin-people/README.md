# Galeri Pengguna & kelas

**ENGINEERING VERIFICATION - 27 Oktober 2026:** screenshot dari Playwright dengan data sintetis lokal. Nama, email example.test, kelas dan sekolah bukan data pengguna nyata. Bukti ini memeriksa frontend; tidak menyatakan acceptance cloud/database, CI atau kesiapan rilis.

| Tampilan                            | Bukti                                                                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Super Admin: daftar pengguna        | [Desktop 1440](super-users-list-1440.png), [ponsel 390](super-users-list-390.png)                                                                                                                            |
| Super Admin: detail dan keanggotaan | [Desktop](super-users-detail-1440.png), [ponsel](super-users-detail-390.png)                                                                                                                                 |
| Super Admin: kelas dan anggota      | [Daftar desktop](super-classes-list-1440.png), [detail ponsel](super-classes-detail-390.png)                                                                                                                 |
| Operations                          | [Pengguna desktop](operations-users-list-1440.png), [detail ponsel](operations-users-detail-390.png), [kelas tablet](operations-classes-list-768.png), [anggota desktop](operations-classes-detail-1440.png) |
| Filter nama                         | [Sekolah/Guru/status](classes-filters.png), [dialog Guru](teacher-picker.png)                                                                                                                                |
| Pemulihan                           | [Memuat](users-loading.png), [gagal dan coba lagi](users-error.png), [hasil kosong](users-empty.png)                                                                                                         |

Dialog pada screenshot full-page hanya meredupkan area viewport aktif; perilaku ini berasal dari pengambilan screenshot panjang. Pemeriksaan keyboard dan viewport pendek memakai dialog native secara langsung.

[Audit dan hasil verifikasi](../../ADMIN_PEOPLE_UX_2026-10-27.md).
