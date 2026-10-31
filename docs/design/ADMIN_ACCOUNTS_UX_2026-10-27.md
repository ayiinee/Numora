# Akun Admin: audit dan perombakan UI

**ENGINEERING DECISION - pemilik, 27 Oktober 2026:** rombak halaman Akun Admin terlebih dahulu, dengan arah ringkas dan profesional yang dipilih pemilik. Pertahankan aturan produk, tiga peran, kontrak API, dan otorisasi NestJS.

## Audit awal

Screenshot baseline 320 dan 1440 px serta tiga E2E lama direkam sebelum implementasi. Banner gradien dan form undangan mendominasi viewport; daftar akun baru terlihat setelah scroll. Kartu di dalam kartu memanjangkan halaman. Nama, email, status mentah dan aksi tidak memiliki hierarki jelas. Dropdown peran langsung mengirim PATCH. Pesan kegagalan bercampur dengan pemberitahuan sukses. Pagination undangan memakai langkah mundur 20 meskipun ukuran halaman lima. Guard presentasi belum memakai pola pencabutan akses workspace lainnya.

## Referensi dan keputusan

- [Admin UI dari pemilik](https://dribbble.com/tags/admin-ui) dan [Team management settings, Untitled UI](https://dribbble.com/shots/20860246-Team-management-settings-Untitled-UI): pola pengelolaan anggota, identitas/peran/aksi terpisah, dan undangan yang dibuka saat dibutuhkan.
- [Carbon data table](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines) dan [pagination](https://www.carbondesignsystem.com/building-blocks/core/components/pagination/guidelines): toolbar pencarian, kolom konsisten, dan pagination dekat daftar. Ini referensi pola, bukan dependensi atau sumber aturan Numora.
- UI/UX Pro Max digunakan untuk aturan aksesibilitas dan form. Rekomendasi otomatis marketing/dark-mode yang tidak cocok ditolak; desain mengikuti sistem Numora dan pilihan pemilik.

Palet lokal: kanvas #F7F8FA, permukaan putih, teks #27313F, border #DDE1E8, ungu Numora #722CCE, tint #F5EDFF. Plus Jakarta Sans lokal: judul 28/36, judul bagian 18/26, isi 14/22, metadata 12/18. Kontrol minimum 44 px; jarak kelipatan empat.

```text
Akun Admin                         [Undang Admin]
Kelola akun dan akses tim Numora.
[Akun Admin] [Undangan]
------------------------------------------------
[Cari nama atau email                 ] [Cari]
Nama & email       Peran       Status     Aksi
...                ...        ...       Kelola
------------------------------------------------
Rentang pada halaman            Sebelumnya Berikutnya
```

Kritik sebelum implementasi: kartu statistik mengalihkan fokus dan kontrak tidak memberi total global, sehingga tidak ditambahkan. Form undangan pindah ke Dialog bersama. Daftar menjadi kartu semantik pada mobile. Perubahan akses memakai dialog dan tombol simpan; memilih dropdown tidak mengirim PATCH. Recovery dan pembatalan undangan memakai konfirmasi yang menyebut target.

## Batas fungsional

Hanya ACTIVE SUPER_ADMIN dengan capability akun boleh memasang workspace. Penolakan 401/403 menutup data dan dialog. Gunakan DTO generated, endpoint dan idempotency key existing; retry payload undangan/recovery yang sama mempertahankan key. Tidak mengubah backend, schema atau provider Auth. INVITED bukan bukti email diterima. Proteksi Super terakhir dan kelayakan operasi tetap milik server. Pagination memakai lima data dan nextOffset server; tidak menambahkan total atau filter yang tidak didukung kontrak.

## Loop audit

1. **Baseline:** tiga E2E lama lulus; screenshot 320/1440 px ditinjau sebelum perubahan. Temuan menjadi dasar struktur di atas.
2. **Implementasi pertama:** sembilan dari 12 skenario lulus. Audit menemukan duplikasi H1 dari AppShell dan heading halaman, serta aturan pagination mobile lama yang bertabrakan. Keduanya diperbaiki. Dua kegagalan lain berasal dari selector alert yang juga mencocokkan route announcer Next.js; selector diperjelas tanpa mengubah perilaku produk.
3. **Verifikasi interaksi:** seluruh 12 skenario lulus. Screenshot desktop/mobile dan dialog konflik ditinjau; isian bertahan saat gagal, PATCH hanya setelah Simpan, retry mempertahankan idempotency key, dan Escape/fokus dialog berjalan.
4. **Audit lanjutan:** 19 skenario lulus: 13 Akun Admin dan enam regresi sidebar. Pemeriksaan tambahan mencakup zoom 125%, viewport pendek, status undangan, menu semua peran dan akses 403 ketika dialog terbuka. Screenshot tablet kemudian menunjukkan ruang kosong berlebih; susunan tablet dipadatkan menjadi identitas/aksi dan satu baris metadata. Kolom status undangan diperlebar; input mobile 16 px menghindari pembesaran otomatis pada browser ponsel.
5. **Penutupan visual:** tiga skenario audit lulus setelah perapian tablet. Screenshot loading/error/empty menunjukkan border kartu bertingkat yang masih diwarisi primitive lama; styling state diratakan hanya di direktori Akun Admin. Tiga skenario yang terdampak diperiksa ulang dengan screenshot baru. Tidak ada overflow horizontal pada 320/390/768/1024/1440 px; aksi dialog tetap terjangkau pada 390x568 dan zoom 125%.

## Struktur dan pemeriksaan

`accounts.tsx` menangani pemuatan data dan operasi API. `accounts-panels.tsx` berisi tabel, identitas dan form bertipe DTO generated. Dialog, Tabs, Button, Icon dan pagination tetap memakai primitive proyek; tidak ada dependensi baru. CSS dan token hanya berlaku untuk halaman Akun Admin/dialognya. `AdminWorkspace` memakai izin `accounts` agar perubahan identitas atau penolakan 401/403 melepas data dan dialog; izin workspace lain tetap dipertahankan.

| Pemeriksaan                                | Hasil                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Seluruh unit frontend                      | 369 tes / 53 berkas lulus                                                          |
| Browser interaksi + sidebar                | 19 skenario lulus                                                                  |
| Audit ulang setelah perapian CSS           | 3 skenario lulus; dua skenario state diperiksa lagi setelah penyesuaian token Card |
| Root lint, web TypeScript, build produksi  | Lulus                                                                              |
| Format dan diff whitespace                 | Lulus                                                                              |
| Screenshot desktop/tablet/mobile dan state | Ditinjau langsung; [galeri](screenshots/admin-accounts/README.md)                  |

Jalankan ulang dari root dengan port 3300 bebas:

```powershell
pnpm --filter @tka/web test
pnpm --filter @tka/web exec playwright test admin-accounts.spec.ts admin-sidebar.spec.ts
pnpm lint
pnpm --filter @tka/web exec tsc --noEmit --incremental false
pnpm --filter @tka/web build
```

Pemeriksaan lokal memakai cache Next/Playwright terpisah di drive D karena ruang drive C terbatas; tidak mengubah environment bersama. Semua browser/API fixture adalah data sintetis. Hasil ini membuktikan interaksi frontend dan penanganan respons, bukan SMTP, Cloud Auth, aturan database secara terhubung, independent review, CI atau kesiapan rilis. Tidak ada migrasi, perubahan backend atau publikasi remote dalam pekerjaan ini.
