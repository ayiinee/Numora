# Audit mobile PvP dan Leaderboard — 31 Oktober 2026

**Catatan supersesi:** artwork v2 dalam laporan ini kemudian diganti dengan empat gambar dari pemilik. Perbaikan layout tetap berlaku. Untuk aset aktif, fondasi ukuran Home dan risiko komposisi yang masih ada, lihat [audit kepadatan terbaru](STUDENT_HERO_DENSITY_AUDIT_2026-10-31.md).

**ENGINEERING DECISION — instruksi pemilik:** samakan ilustrasi dengan `drill-owl-background.png` dan `tryout-exam-background.png`, kurangi sparkle/glow, periksa teks di atas gambar, dan audit kedua halaman mobile. Koreksi ini menggantikan arah artwork pertama pada [catatan hero](STUDENT_PVP_LEADERBOARD_HERO_2026-10-31.md).

Audit memakai Product Design pada browser in-app, preview localhost dan fixture sintetis terisolasi. Tidak memakai akun, database atau layanan cloud nyata. Screenshot diambil pada sesi audit ini; indikator Next.js disembunyikan hanya oleh harness preview. Navigasi bawah tetap fixed; posisi di tengah screenshot panjang merupakan hasil full-page capture, bukan posisi statis di dokumen.

Tujuan audit: siswa dapat menemukan aksi bermain, membuat/bergabung ke room dan membaca peringkat di layar kecil tanpa teks terpotong. Kekuatan yang dipertahankan: pilihan kesulitan berlabel, penanda pilihan selain warna, navigasi tetap, label input, serta state kosong/error dengan aksi pemulihan. Pemeriksaan aksesibilitas bersifat pendukung, bukan sertifikasi.

## Hasil dan perbaikan

| Langkah                    | Temuan dari screenshot/DOM                                                                                                                               | Perbaikan                                                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Masuk PvP, 390px        | Artwork lama berbulu/detail, kilatan neon, dan dekorasi ramai; berbeda dari referensi. Teks bersinggungan dengan karakter.                               | Dua artwork baru memakai kedua referensi langsung: bentuk sederhana, shading lembut, warna ungu/biru, ornamen bintang solid tanpa glow. Judul ringkas, area copy terpisah dari ilustrasi. |
| 2. Mulai duel              | Podium besar mendahului aksi bermain. Badge 10 soal berulang; teks tab 11px.                                                                             | Aksi Buat/Gabung dan kesulitan tampil sebelum podium. Metadata berulang dihapus. Kartu kesulitan diringkas tanpa mengubah pilihan/durasi/scoring; aturan poin tersedia di Aturan Duel.    |
| 3. Gabung, 320px           | Lebar isi tab 312px melebihi wadah 280px; teks terpotong walau halaman tidak overflow. Input kode hanya sekitar 105px karena berdampingan dengan tombol. | Grid tab dua kolom dengan min-width 0. Input dan tombol bertumpuk pada mobile; input 16px, target aksi minimal 44px. Kode sintetis berhasil menuju ruang tunggu.                          |
| 4. Ruang tunggu, 320px     | Kode 12 karakter pecah menjadi beberapa baris, menyulitkan pembacaan.                                                                                    | Kode satu baris, tombol Salin di bawahnya. QR dan tombol Siap dapat dicapai; aksi Siap berubah menjadi Menunggu pemain lain.                                                              |
| 5. Leaderboard, 320/390px  | Badge 9px, nama daftar 12px, info periode 11px; selector periode kurang tampak.                                                                          | Body utama 13–14px, badge dekoratif 10–11px, heading 19–26px; selector berbingkai 44px dengan label terpisah. Heading dan tanggal dapat berpindah baris.                                  |
| 6. Aktivitas Global, 320px | Nilai XP desimal pada podium saling bertabrakan. Tema Sulit terbawa ke scope Aktivitas.                                                                  | Ukuran angka XP responsif dan pembungkusan aman tanpa membuang digit; tema kesulitan hanya diterapkan pada Global PvP.                                                                    |
| 7. Kosong/error/retry      | Keadaan kosong dan gagal muat harus tetap jelas saat hero sudah tampil.                                                                                  | Keduanya diperiksa dengan fixture lokal. Coba lagi mengembalikan data ketika fixture normal dipulihkan.                                                                                   |

## Bukti

Galeri screenshot berada di [screenshots/pvp-hero-mobile-2026-10-31](screenshots/pvp-hero-mobile-2026-10-31/README.md), dengan pasangan sebelum/sesudah dan langkah audit bernomor.

## Batas audit

Verifikasi lokal: 12 unit test pada 2 file lulus, typecheck, ESLint dan build web lulus. Browser in-app diperiksa pada override 320, 390, 430 dan 1280px; tidak ada overflow halaman pada viewport yang diukur. Fokus Tab ke kontrol scope terlihat jelas. Browser responsif bukan pengujian perangkat mobile fisik.

- UI dan alur lokal diperiksa; bukan penerimaan backend/WebSocket produksi, dua akun Google, atau hasil pertandingan nyata.
- Tab Kelas berizin, pergantian arsip dengan data nyata, pertandingan aktif, screen reader, keyboard virtual iOS/Android dan native share sheet belum diaudit pada sesi ini.
- Observasi visual dan pengukuran DOM tidak membuktikan kepatuhan WCAG penuh. Uji keyboard dasar, label form, target klik, reflow dan keadaan pemulihan dipakai sebagai pemeriksaan pendukung.
- Tidak ada perubahan aturan skor, timer, XP, keanggotaan atau kontrak server.

## Aset dan prompt final

Built-in image_gen dengan referensi langsung kedua aset Home. Optimasi WebP lebar 1440px, kualitas 88:

- `apps/web/public/illustrations/student-home/pvp-duel-background-v2.webp`
- `apps/web/public/illustrations/student-home/leaderboard-trophy-background-v2.webp`

Versi awal tetap tersedia untuk riwayat, tetapi CSS kini memakai v2.

### pvpV2

Use case: style-transfer. The supplied drill-owl-background.png and tryout-exam-background.png are the EXACT art style references, not mere inspiration. Match their smooth clean simplified cartoon illustration, broad geometric shapes, soft restrained gradient shading, very simple surfaces, no fur texture, no cinematic render, no dramatic lighting. This is a sibling background asset for the SAME educational app. Wide landscape banner, approximately 2.5:1 aspect ratio. Full bleed rectangular artwork edge-to-edge (no white outside margin, no white frame, no built-in rounded corners). LEFT 62% must stay a quiet, unadorned dark gradient with only broad subtle curved abstract shapes for HTML text. All important subject details entirely in RIGHT 38%, comfortably inside frame. Exactly zero luminous trails, zero bloom, zero lens flare, zero glitter particles, zero sparkling dust, zero neon. At most two simple solid four-point yellow star SHAPES with no glow, as in reference. No text, lettering, logos, watermark. Replace the learning/book subject with TWO friendly owls in a friendly quiz challenge on the far right, faces resembling the exact original owl: round ivory faces and bellies, large simple dark purple eyes with tiny white highlights, smooth purple bodies, peach/gold beaks, simple wings, no detailed feathers. One can be a lighter lilac. They hold small quiz answer cards with only check marks, facing slightly toward each other, cheerful and focused, NOT fighting, no fists or battle armor, no cliffs. Use the SAME purple and lilac background palette as drill-owl-background. Maintain simple flat educational icon-like treatment, not a game poster.

### leaderboardV2

Use case: style-transfer. The supplied drill-owl-background.png and tryout-exam-background.png are the EXACT art style references, not mere inspiration. Match their smooth clean simplified cartoon illustration, broad geometric shapes, soft restrained gradient shading, very simple surfaces, no fur texture, no cinematic render, no dramatic lighting. This is a sibling background asset for the SAME educational app. Wide landscape banner, approximately 2.5:1 aspect ratio. Full bleed rectangular artwork edge-to-edge (no white outside margin, no white frame, no built-in rounded corners). LEFT 62% must stay a quiet, unadorned dark gradient with only broad subtle curved abstract shapes for HTML text. All important subject details entirely in RIGHT 38%, comfortably inside frame. Exactly zero luminous trails, zero bloom, zero lens flare, zero glitter particles, zero sparkling dust, zero neon. At most two simple solid four-point yellow star SHAPES with no glow, as in reference. No text, lettering, logos, watermark. Replace the exam sheet and stopwatch with a SINGLE simple golden winner trophy on a small purple pedestal on the far right. A small star embossed on cup and one small round medal beside it, all with the SAME simple soft shading and clean smooth surfaces as pencil and stopwatch in tryout-exam-background. Use the SAME blue backdrop palette as tryout-exam-background, broad blue curved abstract shapes, dark calm left area. Trophy completely visible with generous breathing room. No confetti or extra decorations.
