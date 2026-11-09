# Hero PvP dan Leaderboard siswa — 31 Oktober 2026

**Catatan supersesi:** artwork dalam catatan ini bersifat historis. Implementasi aktif memakai empat gambar dari pemilik dan fondasi ukuran bersama Home; lihat [implementasi aktif dan audit kepadatan](STUDENT_HERO_DENSITY_AUDIT_2026-10-31.md).

**ENGINEERING DECISION — instruksi pemilik:** hero PvP dan hero Leaderboard PvP mengikuti gaya hero carousel Home/Belajar: gambar latar penuh, sudut asimetris, badge transparan dan teks di sisi kiri. Hero tetap statis karena setiap halaman hanya memiliki satu banner. Tab Kelas/Aktivitas tidak ditambah hero baru.

Implementasi memakai `StudentIllustratedHero` dan CSS bersama di `apps/web/src/features/core-learning/`. Teks tetap HTML, gambar dekoratif menjadi CSS background, tanpa memotong judul/deskripsi pada layar kecil. Label tingkat, durasi, penjelasan poin, pilihan periode dan interaksi REST/WebSocket tetap mengikuti implementasi existing. Tidak mengubah aturan produk atau kontrak.

## Artwork

Dibuat dengan built-in image_gen, lalu dioptimasi menjadi WebP lebar 1280px (quality 85):

- `apps/web/public/illustrations/student-home/pvp-duel-background.webp`
- `apps/web/public/illustrations/student-home/leaderboard-trophy-background.webp`

Prompt final (built-in mode):

### pvp

Use case: stylized-concept. Asset type: full-bleed landscape background for Numora student PvP hero. Create a 1536x864 landscape polished playful educational illustration. Smooth softly shaded 2.5D cartoon style, purple and lilac flowing abstract background, warm gold and peach highlights, matching friendly owl math learning banner aesthetic. On the RIGHTMOST 38% only: two cute purple owl students facing one another in a friendly quiz duel, one slightly lighter purple, small lightning bolt between them, little golden sparkles. Left 62% is empty deep purple (#6330ad to #7943c7) flowing subtle shapes for white HTML text overlay. Keep all faces and details entirely right of 65% width. Crop close to characters, no white border or outer margin, background fills entire rectangular canvas edge to edge. No text, no letters, no logos, no watermark. Mood energetic, friendly, age appropriate for grade 9. Output only this one banner.

### leaderboard

Use case: stylized-concept. Asset type: full-bleed landscape background for Numora student leaderboard hero. Create a 1536x864 landscape polished playful educational illustration. Smooth softly shaded 2.5D cartoon style matching friendly purple owl math learning banner aesthetic. Purple and lilac flowing abstract background with gold/peach accents. On the RIGHTMOST 35% only: a beautiful large golden trophy with small purple base, a tiny gold star medal and celebratory sparkles, gentle sense of achievement. Left 65% is empty deep purple (#6330ad to #7943c7) flowing subtle shapes for white HTML text overlay. Keep all trophy and details entirely right of 65% width, comfortably inside frame. No podium digits. No white border or outer margin, background fills rectangular canvas edge to edge. No text, no letters, no logos, no watermark. Output only this one banner.

## Verifikasi

Hasil lokal:

- Unit PvP/Leaderboard: 2 file, 12 tes lulus (`--pool=threads --maxWorkers=1`). Instalasi Vitest lokal semula memiliki satu chunk terpotong; dipulihkan dari paket versi yang sama, tanpa perubahan manifest/lockfile.
- `pnpm --filter @tka/web typecheck`, ESLint pada file yang diubah dan build web lulus.
- `e2e/pvp.spec.ts`: 4 tes lulus pada 320, 390, 768 dan 1280px, mencakup create/join, ready, jawaban terkunci, reconnect, hasil dan ketiga kesulitan Leaderboard. Tidak ada overflow horizontal atau page error. Pemeriksaan 768/1280px diulang setelah penyempurnaan skala ilustrasi.
- Screenshot lokal ada di `.tmp/redesign-phase5/`, termasuk `lobby-create-<width>.png` dan `leaderboard-easy-<width>.png`. Berkas ini ignored, bukan galeri bukti portabel di Git.

Fixture browser bersifat sintetis lokal, bukan penerimaan layanan terintegrasi.
