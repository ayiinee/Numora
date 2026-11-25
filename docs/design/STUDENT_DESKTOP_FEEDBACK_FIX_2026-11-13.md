# Perbaikan audit desktop dan respons siswa

**ENGINEERING DECISION — permintaan pemilik, 15 November 2026:** hapus tombol
Jeda/Lanjutkan banner dari beranda siswa. Ini menggantikan keputusan tampilan
kontrol jeda pada catatan historis di bawah. Indikator slide, swipe, keyboard,
autoplay, jeda hover/fokus dan reduced-motion tetap mengikuti perilaku existing.

**ENGINEERING DECISION — lanjutan komentar pemilik, 15 November 2026:** kartu
Aktivitas Terakhir diringkas dengan ilustrasi lebih kecil dan tanpa tanggal.
Badge Pretest Bab dihapus; judul dan nilai Pretest tetap tampil. Status kartu
katalog Tryout ditempatkan setelah judul pada baris yang sama, dengan wrap bila
ruang tidak mencukupi. Data hasil, nilai, tautan aksi dan aturan Tryout tetap.

**ENGINEERING DECISION — permintaan pemilik, 13 November 2026:** terapkan seluruh temuan F01–F16 pada [audit desktop siswa](STUDENT_DESKTOP_FEEDBACK_AUDIT_2026-11-13.md), menggunakan perubahan terbaru `main`. Dasar implementasi: `origin/main` pada `7288b4b3` (PR #170, judul header dan navigasi riwayat level). Branch: `fix/student-desktop-feedback`.

Keputusan ini menyetujui perbaikan presentasi dan pemulihan interaksi. Tidak mengubah otorisasi server, penilaian, alokasi paket, jumlah kesempatan, timer, XP, immutable history, atau dependency akademik/IRT yang masih OPEN. Tidak memerlukan migrasi atau perubahan kontrak API.

## Pemetaan temuan ke perubahan

| Temuan | Implementasi                                                                                                                                                                                                                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01    | Dashboard dan profil membaca query batch yang sama dengan katalog. Reader paket lama hanya dipakai bila server menyatakan routing batch tidak aktif. Error routing tetap error dengan retry. Ringkasan membedakan terjadwal, tersedia, sesi berjalan, dan jawaban terkirim. Status terkirim tidak menjanjikan hasil sudah terbit. |
| F02    | Tombol sebelumnya/berikutnya memakai grid responsif, lebar minimum dan label tanpa pemecahan kata. Komponen sesi digunakan bersama oleh Pretest, Drill, dan Tryout.                                                                                                                                                               |
| F03    | Dialog siswa memakai X kanan atas, target minimal 44 px, dan tinggi maksimum yang dapat digulir pada viewport pendek.                                                                                                                                                                                                             |
| F04    | Navigasi assessment memakai panah, nama tujuan yang sesuai, dan teks tujuan pada desktop. Pembahasan kembali ke hasil. X tetap menutup dialog.                                                                                                                                                                                    |
| F05    | Notifikasi mempertahankan sidebar desktop dan memakai Kembali, bukan Keluar.                                                                                                                                                                                                                                                      |
| F06    | Peringkat kelas menunggu data keanggotaan. Tanpa kelas aktif, tampil penjelasan dan Gabung kelas, tanpa request peringkat kelas tanpa pilihan kelas. Error otorisasi server tetap berlaku.                                                                                                                                        |
| F07    | Header Peringkat kembali ke beranda secara konsisten dari ketiga scope. Header room PvP mempertahankan perilaku keluar/kembali existing.                                                                                                                                                                                          |
| F08    | Persetujuan Tryout menampilkan ringkasan 30 soal/maksimal 10 menit dari baseline produk existing, batas efektif jadwal, satu kesempatan, timer tidak dijeda, auto-submit, penyimpanan, penguncian pilihan, dan batas rilis. Tanggal dari DTO batch/WIB. Sekolah/persetujuan dikunci saat start pending.                           |
| F09    | Hasil Pretest membedakan soal benar seluruhnya dari nilai. Penjelasan poin sebagian bersyarat terhadap aturan paket, tanpa mengubah hasil atau rubrik legacy.                                                                                                                                                                     |
| F10    | Hapus link kembali yang bersaing pada hasil dan pembahasan; header tetap sticky. Profil mempunyai satu jalur progres dan satu kartu Tryout, tanpa mengulang keduanya di daftar pengaturan.                                                                                                                                        |
| F11    | Footer dialog siswa memakai tombol bersama berlebar penuh dengan jarak sama. Laporan menggunakan slot actions Dialog dan Batal sekunder. Pending tetap melindungi pengiriman dan penutupan.                                                                                                                                       |
| F12    | Data peringkat yang belum diproyeksikan menampilkan satu status pembaruan dan satu refresh; tidak sekaligus mengklaim rekor kosong. Hilangkan istilah worker.                                                                                                                                                                     |
| F13    | Katalog/detail bab dan Tryout memakai frame desktop terpusat. Peta mempertahankan ilustrasi/urutan medali yang disetujui; desktop menambah ringkasan di samping peta. Mobile tetap satu kolom.                                                                                                                                    |
| F14    | Formatter `id-ID` pada riwayat, aktivitas, XP dan nilai level/profil, dengan maksimum enam desimal tampilan. Nilai mentah tidak ditulis ulang. Istilah siswa mandiri, latihan, dan peringkat diseragamkan pada area yang diubah.                                                                                                  |
| F15    | Label editor menjadi Tutup editor ketika terbuka. Pemilih foto berlabel Indonesia, menyebut nama file/status, dan mempertahankan input native yang dapat difokuskan.                                                                                                                                                              |
| F16    | Copy kosong/pending/hasil/pemulihan mengikuti arti bagi siswa dan langkah berikutnya. Hapus istilah attempt/server yang tidak diperlukan pada respons yang disentuh. Ikon yang berbeda sesuai konteks tetap dipertahankan.                                                                                                        |

Kontrol jeda carousel ditambahkan agar siswa dapat menghentikan pergantian banner tanpa menahan hover/fokus. Dukungan reduced-motion dan inert clone dipertahankan. Pemicu laporan tetap terpasang saat dialog terbuka agar Batal/X mengembalikan fokus. Konfirmasi pengiriman modal menerima fokus setelah berhasil.

## Validasi

Audit awal adalah bukti sebelum perubahan. Screenshot verifikasi baru berada di `.tmp/student-feedback-fix-2026-11-13/`, tetap ignored karena memakai sesi akun existing.

- `pnpm lint`: lulus, tanpa warning.
- Build produksi `next build --webpack` dengan `NUMORA_LOW_MEMORY=true` dan direktori output terpisah: lulus kompilasi, TypeScript, generasi halaman, dan build traces. Build ini memverifikasi kode; konfigurasi login lokal harus dimuat melalui launcher dotenv proyek.
- 165 tes terarah dalam 14 file: lulus melalui run gabungan dan retest area yang berubah. Run gabungan 164 tes awal menghasilkan 163 lulus dan satu assertion label lama gagal; setelah assertion diperbarui, seluruh 13 tes file profil lulus. Tes fokus laporan ditambahkan; retest akhir support + assessment-review lulus 15/15. Tidak ada assertion penyimpanan/otorisasi yang dilonggarkan.
- `git diff --check`: lulus. Perubahan generated Next config/type tidak masuk diff.
- Browser: desktop 1440×900, laptop 1366×768, tablet 768×1024, mobile 390×844. Navigasi soal, status Tryout dashboard/profil, sidebar notifikasi, pemulihan kelas, pending peringkat, katalog dan aturan Tryout diperiksa langsung.

Pemeriksaan tambahan memverifikasi hasil Pretest tersimpan (56,67 dan 8 soal benar seluruhnya), hasil/pembahasan Drill, dialog level, dialog laporan desktop/mobile, serta Batal mengembalikan fokus ke tombol laporan. Peta desktop akhir berlebar 960 px tanpa overflow horizontal; prioritas selector diperbaiki setelah pemeriksaan menemukan stylesheet level masih membatasi 520 px. Bukti final peta: `22-peta-final-lengkap.png`; dialog laporan: `19-dialog-laporan.png` dan `20-dialog-laporan-mobile.png`. Galeri lokal: `.tmp/student-feedback-fix-2026-11-13/index.html`.

Tes memakai `vitest run --maxWorkers=1 --pool=threads` karena worker fork awal mengalami timeout startup pada mesin lokal. Satu retest tambahan sempat mengalami timeout worker threads ketika build berjalan bersamaan; retest berikutnya lulus. Tidak mengubah konfigurasi tes repository. File yang diperiksa: tryout-queries, leaderboards, account, redesign, support, pretest-result, assessment-review, assessment-session, pretest, drill, tryout-recovery, profile-editor, pvp-presentation, student-pvp.

Tes terarah mencakup routing batch vs legacy, kegagalan/retry routing, ringkasan sesi berjalan/terjadwal/terkirim, pemulihan keanggotaan dan pending peringkat, serta regresi assessment, laporan, profil dan presentasi PvP. Assertion teks mengikuti nama kontrol baru; assertion perilaku penyimpanan, otorisasi dan riwayat dipertahankan.

Pemeriksaan browser memakai aksi baca, buka/tutup, filter dan dialog tanpa final submit. Tidak mengubah jawaban, memulai Tryout, melanjutkan timer Drill, membuat room PvP, atau mengirim laporan palsu. State kegagalan/pengiriman pada unit test memakai fixture sintetis. Ini tidak menggantikan acceptance terintegrasi atau pembuktian semua event WebSocket.

## Lingkungan verifikasi

Build memakai output terpisah dan mode hemat memori. Pemeriksaan browser lokal sempat terhambat cache pengembangan dan reload yang timeout; hanya state yang sudah terlihat dicatat sebagai verifikasi lulus. Build akhir setelah perbaikan fokus laporan dan selector peta selesai dengan exit 0. Bukti screenshot dan log lingkungan tetap ignored serta tidak dipublikasikan dalam PR.

## Rekonsiliasi PR #178 dengan main — 15 November 2026

**ENGINEERING DECISION — permintaan pemilik untuk rekonsiliasi:** basis integrasi
`5b8b6d5e` sudah memuat perbaikan Tryout #180 dan optimasi #179. Sembilan file
berkonflik diselaraskan tanpa mengganti hasil, timer, XP, atau pemeriksaan server.

- `tryout-queries.ts` memakai reader dari main: status `scheduled`, `checking`,
  `waitingIrt`, `overdue`, dan `resultReady` tetap dibedakan. Routing legacy hanya
  aktif saat server menyatakan routing batch nonaktif. Tidak menyalin reader lama
  `batchTryoutSummary` yang belum memahami publikasi dan kelayakan resume terbaru.
- `account-presentation.tsx`, `dashboard-presentation.tsx`, `profile.tsx`, dan
  `student-home-carousel.tsx` memakai tipe, label, dan tujuan Tryout yang sama.
  Label Siswa mandiri, editor profil, penghapusan navigasi berulang, serta kontrol
  jeda carousel dari F01/F10/F15/F16 dipertahankan.
- `tryout-batches.tsx`, `tryout-presentation.tsx`, dan `tryout.tsx` mempertahankan
  kartu Jadwal/Terlewat/Riwayat, penyegaran/error, guard resume, guard start ganda,
  dan hasil null/UNSCORABLE dari main. Informasi sekolah/paket terkunci, jawaban
  tersimpan, dan tenggat hasil pada dialog batch tetap memenuhi F08.
- `assessment-review.tsx` mempertahankan peta/dialog pembahasan Tryout terbaru,
  panah kembali ke hasil, dan menghapus tautan kembali yang berulang untuk Drill.

Tes query F01 diselaraskan dengan kontrak status main dan diperluas untuk status
publikasi, sesi kedaluwarsa, serta payload routing invalid. Assertion label pada
E2E login mengikuti copy Siswa mandiri; pemeriksaan peran dan navigasi tetap ada.
Selector profil dan connected Drill juga memakai label Siswa mandiri dan Kembali
ke latihan. Pengujian tetap memeriksa afiliasi sesudah kegagalan gabung kelas,
tujuan navigasi, konfirmasi jeda, serta persistensi jawaban dan timer.
Verifikasi lokal: 103 tes dalam lima file lulus dan ESLint area terkait lulus.
CI penuh pada SHA rekonsiliasi tetap menjadi gate sebelum merge; verifikasi lokal
ini tidak dinyatakan sebagai acceptance terintegrasi atau bukti QA cloud.

Run CI `43629591453` meluluskan validate, unit/integration, connected, dan build.
Kegagalan browser yang tersisa adalah selector afiliasi yang cocok dengan sidebar
dan kartu profil sekaligus. Selector kini dibatasi ke region Profil dan progres
atau header beranda yang terlihat, tanpa mengubah assertion afiliasi. Pengujian
carousel tetap memeriksa jeda/lanjut serta target 44 px, dialog memeriksa X kanan
atas, dan alur Mandiri memeriksa tidak adanya request peringkat kelas tanpa kelas.

Retest lima skenario browser lokal dihentikan setelah navigasi timeout dan target
Chromium crash. Run ini bukan bukti lulus; trace/screenshot sintetis tetap di
direktori ignored. Timeout dan assertion CI tidak dinaikkan untuk menutupinya.
