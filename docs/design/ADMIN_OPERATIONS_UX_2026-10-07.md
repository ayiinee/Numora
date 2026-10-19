# Admin Operasional — penyederhanaan portal

**ENGINEERING UPDATE — pemeriksaan fungsional, 7 October 2026:** perbaikan setelah redesign mencakup detail/retry, preservasi edit, credential eligibility transaksi, validasi API, tab/filter URL, dan pencabutan akses. Perubahan API ini dicatat terpisah dari bukti redesign di bawah. Lihat [audit fungsional](../development/ADMIN_OPERATIONS_FUNCTIONAL_AUDIT_2026-10-07.md).

**ENGINEERING DECISION — redesign lanjutan, 7 October 2026:** pemilik meminta gaya AdminLTE mengikuti Admin Content khusus untuk Operations. Tema dasar dipakai ulang melalui `admin-workspace-shell`; penataan Operations berada di `apps/web/src/app/admin-operations.css`. Content mempertahankan tampilannya, sedangkan Super tidak memakai tema workspace ini.

## Redesign AdminLTE

| Area             | Tampilan dan interaksi                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Shell            | Sidebar/topbar putih, canvas abu-abu, aksen ungu, radius 6–12 px, identitas Admin Operasional di topbar desktop/tablet                 |
| Sekolah          | Counts pada halaman yang dibaca, form tambah sekolah di disclosure keyboard-accessible, pencarian dan daftar sekolah dalam panel putih |
| Credential       | Detail sekolah, pengaturan data/status, penerbitan satu kali dan riwayat token tetap memakai reader/mutasi existing                    |
| Pengguna & kelas | Tab dengan ikon, filter dua kolom pada layar lebar, highlight pilihan, list/detail berdampingan di desktop                             |
| Detail           | Metadata ringkas, membership/verifikasi dan roster dalam section terpisah; UUID panjang dapat membungkus                               |
| Mobile/tablet    | Menu toggle di kiri, Escape mengembalikan fokus, panel ditumpuk, target kontrol minimum 44 px                                          |

Tidak ada dashboard baru, notifikasi palsu, data demo baru, atau perubahan API/database. Ringkasan, Analytics dan banner besar tetap dihapus. Pengguna/kelas tetap dibaca melalui server; tidak ada aksi ban, perubahan akademik, atau takeover baru.

## Validasi redesign

- **28/28 unit tests**: portal, operations dan shared UI foundation; assertion scope tema Content/Operations/Super juga lulus setelah perubahan terakhir pada frame.
- **20 skenario browser berbeda lulus**, termasuk recheck setelah locator label wajib diperbaiki: dua viewport Content workbench, portal empat assignment pada dua viewport, Operations list/detail/keyboard pada 320/768/1440 px, sekolah/credential pada tiga viewport, lifecycle sekolah pada Operations dan Super, serta limited view Content.
- ESLint dan format check pada file yang diubah lulus. Production build web termasuk TypeScript lulus dengan output terpisah dari dev server pengguna.
- [Galeri mobile/desktop](screenshots/admin-operations/README.md) memakai data sintetis di HTTP/provider fixture lokal. Tidak ada seed atau mutasi Cloud yang dijalankan. Ini tidak menggantikan acceptance Cloud dan QA independen.

**ENGINEERING DECISION — instruksi pemilik, 7 October 2026:** hapus halaman Ringkasan dan Analytics dari portal Admin Operasional, serta banner besar di bagian atas setiap halaman. Redesign berikutnya di atas mempertahankan penghapusan ini.

## Perilaku

- Navigasi Operations menampilkan **Sekolah & credential** dan **Pengguna & kelas**, sesuai capability server.
- Operations membuka `/admin/schools` saat masuk melalui `/admin` atau URL lama `/admin/analytics`. Halaman yang dihapus tidak dirender; redirect Analytics tidak memanggil endpoint analytics.
- Semua halaman yang memakai `AdminFrame` menyembunyikan banner untuk Operations. Judul `h1` tetap tersedia bagi pembaca layar; judul bagian, form, tabel, dan aksi modul tetap tersedia.
- Content mempertahankan landing bank soal dan tema workspace yang sudah ada. Super Admin mempertahankan Ringkasan, Analytics, dan banner.
- Ini perubahan presentasi. Matriks capability, otorisasi NestJS, kontrak API, database, dan data tersimpan tidak berubah.

## Acceptance

- Unit: redirect halaman lama, menu sesuai role, banner tersembunyi dengan judul aksesibel, regresi Content/Super, dan analytics Super tetap membedakan nol dari sumber unavailable.
- Browser fixture: Operations pada 320 dan 1440 px; navigasi dua modul, direct URL Analytics tanpa request data, banner sekolah/pengguna hilang, serta halaman pengguna masih berfungsi tanpa overflow horizontal.
- Regresi browser: portal tiga role dan unassigned, pembatasan view Content, detail membership/roster Operations, analytics Super, dan penolakan direct route IRT Operations.

## Hasil validasi penghapusan halaman sebelum redesign

- **27/27 unit tests** lulus: portal, IRT/analytics, dan operations.
- **14/14 browser scenarios** lulus: Operations pada 320/1440 px, portal role pada 390/1280 px, view Content terbatas, analytics Super, dan penolakan IRT Operations.
- ESLint pada seluruh kode yang diubah, format check, serta production build web termasuk TypeScript lulus. Build memakai direktori terpisah agar tidak mengganggu dev server pengguna.
- Screenshot lokal `.tmp/admin-operations-clean-320.png` dan `.tmp/admin-operations-clean-1440.png` diperiksa secara visual.

Browser memakai provider/API fixture lokal; ini bukan acceptance Cloud atau QA independen. Tidak ada perubahan database atau data Cloud.
