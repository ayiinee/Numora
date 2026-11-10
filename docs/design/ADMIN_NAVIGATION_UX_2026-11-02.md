# Admin navigation — audit dan implementasi, 2 November 2026

**ENGINEERING DECISION ? 9 November 2026, rencana pemilik disetujui:** [Penataan Admin dan akses asesmen](../development/ADMIN_ASSESSMENT_REWORK.md) menggantikan bagian historis tentang menu Pretest terpisah, blocker consumer permanen, dan Analytics khusus Super. Paket memakai `/admin/assessments` dengan pipeline umum; Analytics tersedia sesuai scope ketiga subrole. Histori, izin server dan dependency Data/AI tetap berlaku.

**ENGINEERING DECISION — instruksi pemilik, 2 November 2026:** rombak menu Admin agar selaras dengan halaman Admin terbaru: sidebar lebih lebar, teks terbaca, pemisah di bawah logo, dan seluruh menu tetap dapat dijangkau. Arah visual mengikuti Akun Admin yang sudah disetujui: ringkas, profesional, Plus Jakarta Sans, permukaan putih dan aksen ungu Numora.

## Temuan dan keputusan

**ENGINEERING DECISION — pemilik, 9 November 2026:** submenu Pretest, Drill dan Tryout kini membuka `/admin/assessments/{pretest|drill|tryout}`. Daftar tabel, tambah dan detail menjadi halaman terpisah; tab jenis asesmen dihapus. Halaman tambah/detail mengaktifkan submenu jenisnya. Tautan lama menjaga konteks melalui pengalihan. [Spesifikasi daftar asesmen](ADMIN_ASSESSMENT_DIRECTORY_2026-11-09.md).

| Temuan                                                                                                 | Perbaikan                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lebar lama 210–232 px, termasuk variasi 224 px pada workspace, memecah label menjadi beberapa baris.   | Setelah feedback lanjutan, iterasi 304/280 px dipersempit menjadi 248 px. Padding/ikon dirapikan agar label utama tetap satu baris pada ukuran teks normal; teks tetap dapat membungkus saat diperbesar. |
| Seluruh sidebar ikut di-scroll sehingga logo dan identitas akun dapat hilang.                          | Grid dengan logo, navigasi yang di-scroll sendiri, dan identitas akun. Pemisah di bawah logo sejajar dengan pemisah akun.                                                                                |
| Deretan tautan panjang tanpa pengelompokan dan ikon yang berulang.                                     | Analytics tetap pertama untuk Super Admin berizin; kelompok Administrasi serta Konten & publikasi. Ikon memakai keluarga SVG existing.                                                                   |
| Item Generator tidak tercantum dalam urutan eksplisit Content sehingga tersortir mendahului bank soal. | Tambahkan Generator ke urutan Content setelah Pretest; kumpulan tautan dan izin tidak diperluas.                                                                                                         |
| Navigasi ponsel menambah panjang halaman dan tidak membatasi fokus ke menu.                            | Drawer memakai `Dialog` native existing, fokus tetap di dalam menu, Escape/tombol tutup mengembalikan fokus, tautan menutup drawer, dan berpindah ke desktop menutup drawer.                             |
| Chrome Operations/Content berbeda dari Super Admin.                                                    | Komponen dan stylesheet navigasi yang sama untuk seluruh Admin. Gaya halaman tidak diganti.                                                                                                              |

Nama akun dan label peran dapat membungkus tanpa ellipsis. Sidebar menggunakan warna lokal dari fondasi operasional: teks `#27313f`, muted `#626d7c`, border `#e4e7ed`, aksen `#722cce`, pilihan `#f5edff`, dan latar putih. Label menu 14 px dengan target minimum 44 px; label kelompok 12 px. Tidak ada submenu tersembunyi, statistik tambahan, atau dependency baru.

## Sidebar dropdown — keputusan pemilik, 9 November 2026

**ENGINEERING DECISION:** tahap pertama memakai empat kelompok dan maksimal dua tingkat. Keputusan ini menggantikan susunan tautan datar di bawah; tab halaman dan tujuan awal subrole tetap dipertahankan. Tidak ada perubahan API, permission atau publikasi.

| Kelompok         | Menu utama                | Submenu                                                                     |
| ---------------- | ------------------------- | --------------------------------------------------------------------------- |
| Pemantauan       | Dashboard                 | Langsung; memakai route `/admin/analytics` existing                         |
| Operasional      | Sekolah & verifikasi guru | Langsung; Content memakai struktur baca saja existing                       |
| Operasional      | Pengguna & kelas          | Pengguna · Kelas                                                            |
| Konten & asesmen | Bank konten               | Soal · Struktur materi · Video · Tambah konten                              |
| Konten & asesmen | Review & laporan          | Status review · Laporan masalah · Riwayat aktivitas (capability AUDIT_READ) |
| Konten & asesmen | Paket asesmen             | Pretest · Drill · Tryout                                                    |
| Konten & asesmen | Hasil Tryout              | Batch & rilis hasil · Proses IRT                                            |
| Administrasi     | Akun Admin                | Daftar Admin · Undangan                                                     |

Induk adalah tombol buka/tutup dengan chevron, `aria-expanded` dan `aria-controls`. Beberapa induk dapat terbuka bersamaan. Kunjungan awal membuka induk aktif; navigasi membuka induk tujuan tanpa menutup lainnya. Pengguna dapat menutup induk aktif secara manual. Status disimpan dalam `sessionStorage` berdasarkan akun dan assignment/capability, dipakai bersama desktop dan drawer, dengan fallback memori. Logout membersihkan preferensi akun aktif.

Penanda aktif mengikuti pathname dan query; tab Akun Admin memakai `view=accounts|invitations`. Back, reload dan tab existing mengikuti URL. Generator, impor dan preview impor berada di Tambah konten; detail versi berada di Status review; detail laporan berada di Laporan masalah. Status review hanya membuka verifikasi versi existing, bukan antrean baru. Tautan lama tetap berlaku. Lebar 248 px, scroll internal dan Dialog mobile dipertahankan.

Penerimaan memakai unit navigasi dan fixture browser lokal: izin subrole/assignment kosong, beberapa induk terbuka, pemulihan sesi, storage diblokir, navigasi query/Back/reload, keyboard, drawer/fokus, layar pendek, zoom dan viewport 320–1440 px. Bukti fixture bukan penerimaan layanan nyata.

Verifikasi implementasi 9 November 2026 pada `feat/admin-assessment-rework`:

- Unit Web terkait Admin, akses dan shell Guru: **27 file / 233 tes lulus**; termasuk 29 pemeriksaan model navigasi dan preferensi dropdown.
- Browser Chromium dengan build produksi dan fixture **TEST ONLY** di localhost: **39 tes lulus** pada sidebar, Analytics, Pretest dan publisher. Semua 16 submenu diuji melalui klik, bersama tab existing, Back/reload, beberapa dropdown terbuka, state desktop/mobile, storage ditolak, assignment kosong, scroll internal, fokus/Escape, zoom 100/125/200%, serta ukuran 320/390/768/1440 px dan layar pendek. Audit Axe sidebar/drawer ketiga subrole tidak menemukan pelanggaran.
- ESLint seluruh repo, TypeScript Web dan build produksi Web lulus. Screenshot/trace pengujian berada dalam `apps/web/test-results` yang diabaikan Git.
- Review diff mempertahankan tab dan rute existing; tidak mengubah API, schema, permission, `.env` atau database cloud. Tidak ada push/merge.

## Batas fungsional (historis; lihat keputusan terbaru di atas)

**ENGINEERING DECISION — feedback lanjutan pemilik, 2 November 2026:** lebar akhir desktop menjadi 248 px mengikuti batas pada gambar pemilik. Tombol di sebelah logo menutup sidebar sepenuhnya, konten memakai ruang yang tersedia, dan tombol Buka sidebar muncul di header. Fokus keyboard berpindah ke tombol yang relevan. Preferensi disimpan di `sessionStorage` agar bertahan saat berpindah halaman/reload pada tab yang sama; jika storage diblokir, tombol tetap bekerja dalam memori. Drawer ponsel terpisah dari preferensi desktop.

- `adminNavigation` dan capability/profile existing tetap menentukan tautan. NestJS tetap otoritatif untuk setiap operasi.
- Assignment kosong tidak mendapat modul. Operations/Content tetap tanpa Analytics; tampilan struktur Content tetap baca saja.
- `activeAdminHref` tetap memilih rute paling spesifik, sehingga Impor/Pretest/Generator tidak sekaligus menandai Konten sebagai halaman aktif.
- Tujuan awal, otorisasi logout, draft, API, database, skor, XP, publikasi dan aturan akademik tidak diubah.
- Menu Student/Teacher tetap memakai markup dan gaya existing; CSS baru dibatasi ke `.app-shell--admin`.

## Struktur implementasi

- `apps/web/src/components/shell/admin-navigation.tsx`: presentasi tautan berizin, pengelompokan, dan identitas akun.
- `apps/web/src/components/shell/app-shell.tsx`: integrasi desktop/drawer dengan `Dialog` shared existing.
- `apps/web/src/app/admin-navigation.css`: satu sumber gaya menu Admin, diimpor setelah stylesheet halaman. Aturan navigasi lama pada `admin-workspaces.css` dihapus agar tidak saling menimpa.
- `apps/web/e2e/admin-sidebar.spec.ts`: regresi ukuran pendek, zoom, keyboard, drawer, role, label panjang dan aksesibilitas.

## Feedback loop dan bukti

1. Rekam baseline menggunakan fixture Admin pada 1536×695; label panjang membungkus dan logo/akun ikut bergeser saat sidebar di-scroll.
2. Audit iterasi pertama: 9/10 skenario lolos. Zoom 125% mengungkap `height: 100dvh` pada elemen fixed membuat bagian bawah keluar dari viewport.
3. Perbaiki dengan batas fixed atas–bawah dan tinggi otomatis. Drawer memakai batas lebar persentase agar sesuai pada zoom. Putaran berikutnya 12/12 lolos, termasuk zoom 200% dan Analytics sebagai menu pertama.
4. Urutan Content dirapikan, kemudian hasil akhir diperiksa dengan build produksi dan regresi terkait. Hasil final dicatat di galeri audit.
5. Feedback lanjutan pada gambar pemilik: persempit sidebar dari 304/280 px menjadi 248 px, rapikan padding/ikon, dan tambahkan buka/tutup desktop. Tes menunggu navigasi akun siap sebelum interaksi, lalu memeriksa keyboard, reload, perpindahan halaman dan independensi drawer ponsel untuk tiga peran. Label utama Super Admin tetap satu baris pada desktop 1024/1440 px.

[Galeri dan hasil pemeriksaan final](screenshots/admin-navigation/README.md).

Browser memakai akun, API dan sesi Supabase sintetis di localhost terisolasi. Ini bukan penerimaan layanan nyata, review manusia, CI, atau persetujuan deploy. Branch implementasi berawal dari `e369a19` (fondasi UI-03–UI-05 pada PR #117 yang masih terbuka saat audit); perubahan ini tidak menyatakan PR tersebut sudah merged.

## Referensi visual dan interaksi

- [Dribbble Admin UI](https://dribbble.com/tags/admin-ui): perbandingan hierarki dan kepadatan navigasi.
- [Taurus sidebar](https://dribbble.com/shots/22474831-Dashboard-Sidebar-Navigation-Taurus): label/ikon sejajar dan penandaan posisi aktif. Referensi dilihat lewat browser; logo/aset tidak disalin.
- [Atlassian navigation layout](https://atlassian.design/components/navigation-system/layout): pembanding ruang navigasi yang cukup untuk label.
- [Carbon UI shell left panel](https://www.carbondesignsystem.com/building-blocks/core/components/ui-shell-left-panel/guidelines): navigasi konsisten dan hierarki terbatas. Referensi tidak mengubah aturan produk Numora.

### Breadcrumb navbar yang dapat dinavigasi

**ENGINEERING DECISION - permintaan pemilik:** konteks navbar Admin menjadi breadcrumb semantik dengan tautan ke halaman induk dan aria-current pada halaman aktif. Daftar/tambah/detail asesmen memiliki jalur terpisah; tautan kembali daftar menjaga search, filter dan offset yang dikenal. Detail versi soal serta sesi preview memiliki induk Bank soal/Tambah konten. Menu induk mengikuti daftar capability-filtered; breadcrumb tidak mengubah permission. Navbar dapat membungkus pada viewport sempit. Root /admin mengikuti tujuan awal assignment existing.
