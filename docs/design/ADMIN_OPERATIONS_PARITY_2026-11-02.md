# Penyelarasan UI Admin Operasional

**ENGINEERING DECISION — instruksi pemilik, 2 November 2026:** lanjutkan review teknis dan pengembangan UI Operations pada branch lanjutan sambil menunggu review independen PR #117/#118. Approval GitHub, merge dan deploy tetap terpisah. Prioritas: Sekolah & credential, lalu Pengguna & kelas; Content menyusul.

**ENGINEERING IMPLEMENTATION — lokal:** branch `feat/admin-operations-ui-parity` berangkat dari `b7359c3` (head #118), yang sudah menyertakan perbaikan tes #117. Perubahan ini belum menyatakan bahwa kedua PR sudah disetujui atau masuk main.

## Temuan dan perubahan

Halaman sekolah dan pengguna/kelas sudah memakai komponen serta `admin-management-shell` yang disetujui pada Super Admin. Namun, khusus Operations, kedua halaman juga menambahkan `admin-workspace-shell` lama. CSS legacy mengubah tinggi topbar, token dan semua form. Pencarian sekolah menjadi grid bertumpuk pada desktop; tinggi topbar 68 px tidak sejajar dengan header logo sidebar 76 px.

- Lepaskan class workspace legacy dari dua halaman modern, tetap pertahankan penanda role `admin-operations-shell`.
- Gunakan fondasi management existing: kanvas abu terang, permukaan putih, Plus Jakarta Sans lokal, ungu Numora, daftar utama dan dialog terfokus. Tidak ada CSS atau komponen paralel baru.
- Gunakan frame management juga saat autentikasi/URL masih dimuat dan saat akses modul Operations ditolak/dicabut. Judul serta pemulihan tetap terlihat.
- Pertahankan daftar sekolah, ruang sekolah terpilih, dialog credential, tab pengguna/kelas, filter bertahap dan detail baca saja.

## Kriteria pemeriksaan

- Pencarian sekolah sejajar mulai 768 px; ponsel memakai susunan responsif existing. Input tidak menimpa ikon.
- Topbar dan header logo sejajar pada desktop untuk Super dan Operations.
- Daftar/detail dapat dipakai pada 320, 390, 768, 1024 dan 1440 px tanpa overflow halaman.
- Sidebar tetap dapat digulir dan dibuka/ditutup, termasuk keyboard, layar pendek dan pembesaran.
- Dialog dapat dibatalkan dan mengembalikan fokus; perubahan sensitif tetap memerlukan konfirmasi existing.
- Filter, pagination lima data, URL, reload dan Back tetap berfungsi. Pengguna/kelas tetap baca saja.
- Loading/error/empty/retry terlihat. Penolakan 401/403 menutup dialog dan menghapus tampilan data privat.
- Content dan akun tanpa assignment tidak mendapatkan akses pengelolaan Operations. Ban/unban tetap milik Guru.

## Batas dan integrasi

Perubahan terbatas pada presentasi. DTO, API, capability, otorisasi NestJS, TTL/idempotensi credential, database/migrasi, aturan akademik, scoring dan histori XP tidak berubah. Pengujian browser fixture membuktikan perilaku frontend terhadap respons sintetis, bukan penerimaan OAuth/layanan cloud atau release readiness.

Integrasi tetap menunggu review independen: selesaikan #117, sesuaikan basis serta verifikasi #118 terhadap main, lalu sinkronkan branch Operations dan tinjau diff tersisa sebelum PR/merge. Pengembangan lokal tidak memerlukan penonaktifan branch protection.

## Hasil validasi

- Build produksi frontend dengan konfigurasi fixture: lulus, termasuk pemeriksaan TypeScript Next.js.
- Unit `admin-workspace.test.tsx` dan `portal.test.tsx`: **37/37 lulus**. Meliputi frame loading/akses dicabut yang baru, pembersihan data privat, pergantian akun dan regresi role.
- Browser Chromium produksi: **54/54 lulus** dari `admin-schools-ux.spec.ts`, `admin-people-ux.spec.ts`, `admin-operations.spec.ts` dan `admin-sidebar.spec.ts`. Tidak ada skip/retry. Mencakup daftar/detail responsif, filter/history, aksi credential, penolakan akses, drawer, keyboard, pembesaran 125/200% dan aksesibilitas navigasi.
- Lint seluruh repositori: lulus, tanpa warning.
- Audit visual gambar desktop/ponsel sekolah dan pengguna/kelas: header, pencarian, hierarki daftar, wrapping nama panjang serta detail/roster dapat dibaca.

Pengujian unit pertama menemukan locator `status` terlalu umum pada tes baru karena skeleton juga memiliki role tersebut. Locator diperjelas ke teks loading; kode produk tidak diubah untuk melemahkan pengujian. Tes ulang 37/37 lulus. CI branch baru, connected backend ulang dan review manusia belum dijalankan. CI hijau #117/#118 tetap bukti untuk head masing-masing, bukan CI branch baru ini.

Galeri menggunakan **data sintetis**, diambil dari build sumber yang sudah diperbaiki, tanpa manipulasi class DOM:

| Halaman              | Desktop                                                            | Ponsel                                                           |
| -------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Sekolah & credential | [1440 px](screenshots/admin-operations-parity/schools-desktop.png) | [390 px](screenshots/admin-operations-parity/schools-mobile.png) |
| Pengguna & kelas     | [1440 px](screenshots/admin-operations-parity/people-desktop.png)  | [390 px](screenshots/admin-operations-parity/people-mobile.png)  |
