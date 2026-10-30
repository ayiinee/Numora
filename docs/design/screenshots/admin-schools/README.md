# Bukti visual Sekolah & credential

**ENGINEERING VERIFICATION - 27 Oktober 2026:** akun, sekolah, Guru, token dan respons API/clipboard memakai fixture sintetis. Tidak ada data pribadi atau credential nyata. [Arah desain, loop audit dan pemeriksaan](../../ADMIN_SCHOOLS_UX_2026-10-27.md).

| Tampilan                      | Screenshot                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Daftar sekolah                | [Desktop 1440 px](schools-list-desktop.png), [ponsel 390 px](schools-list-mobile.png), [320 px](schools-list-narrow.png) |
| Sekolah terpilih, Super Admin | [Desktop](schools-detail-desktop.png), [ponsel](schools-detail-mobile.png)                                               |
| Sekolah terpilih, Operations  | [Desktop](operations-detail-desktop.png), [tablet 768 px](operations-detail-tablet.png)                                  |
| Kegagalan tambah sekolah      | [Dialog dengan isian tetap tersedia](schools-create-error.png)                                                           |
| Token baru                    | [Token sintetis dan aksi salin](schools-issued-token.png)                                                                |
| Loading                       | [Daftar sekolah](schools-loading.png)                                                                                    |
| Kegagalan riwayat token       | [Pesan dan coba lagi](schools-token-error.png)                                                                           |
| Belum ada credential          | [Empty state](schools-tokens-empty.png)                                                                                  |

Daftar/detail direkam sebagai halaman penuh, sedangkan dialog dan state memakai ukuran viewport. Indikator development Next.js disembunyikan hanya pada capture. Form/tabel tetap diuji dengan keyboard, viewport 320x568, reduced motion dan zoom 125%.
