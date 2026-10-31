# Request IRT & publikasi — galeri UI-05

30 Oktober 2026. **Seluruh data sintetis**, Admin DEMO. Baseline Analytics `01fd68e`; hasil pada `feat/admin-irt-publication-ux`. Ini bukti tampilan localhost, bukan evidence ilmiah, layanan compute nyata atau hasil produksi peserta.

| Layar    | Sebelum                                 | Sesudah                                                                                 |
| -------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| 1440×900 | [Workspace awal](before-1440.png)       | [Batch & publikasi](batch-1440.png)                                                     |
| 1024×900 | —                                       | [Batch tablet landscape](batch-1024.png)                                                |
| 768×900  | —                                       | [Batch tablet portrait](batch-768.png)                                                  |
| 390×900  | [Workspace awal ponsel](before-390.png) | [Batch ponsel](batch-390.png)                                                           |
| 320×900  | —                                       | [Batch layar sempit](batch-320.png)                                                     |
| 1440×900 | —                                       | [Daftar request](requests-1440.png), [detail dan metadata](detail-1440.png)             |
| 390×900  | —                                       | [Daftar request ponsel](requests-390.png), [detail dan metadata ponsel](detail-390.png) |
| 390×844  | —                                       | [Dialog persiapan](prepare-390.png)                                                     |

Gambar sesudah berasal dari build produksi lokal. Capture full-page menempatkan scroll di awal dan membuat topbar statis hanya saat capture. Ini menghindari artefak sticky header di tengah gambar. Kode aplikasi tetap memakai perilaku shell aslinya. Overlay development disembunyikan pada capture development/baseline; hasil produksi tidak memiliki overlay tersebut.

Metadata teknis pada screenshot detail sengaja dibuka untuk memeriksa UUID/hash panjang; pada tampilan awal bagian tersebut tertutup. Gambar dialog memakai viewport, sehingga tombol lengkap terlihat tanpa menggambar seluruh halaman di belakang modal. Viewport pendek 390×568 dan zoom 125%, reduced motion, fokus, Escape dan akses ke tombol yang perlu scroll diuji terpisah.

Tidak ada overflow horizontal pada audit lima lebar layar. Kasus kode blocker panjang yang gagal pada putaran kedua telah diperbaiki dan diulang. Axe pada workspace batch/detail 320 px (WCAG 2 A/AA dan 2.1 AA) tidak menemukan pelanggaran otomatis; hasil ini bukan pengganti audit aksesibilitas manusia.

[Laporan implementasi, referensi, guard dan hasil tes](../../ADMIN_IRT_UX_2026-10-30.md).
