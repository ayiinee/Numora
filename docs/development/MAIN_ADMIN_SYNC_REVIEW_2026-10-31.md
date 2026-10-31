# Sinkronisasi main dan review Admin — 31 Oktober 2026

**ENGINEERING DECISION — instruksi pemilik:** tarik pembaruan main dan review hasil gabungan sebelum melanjutkan pekerjaan. Tidak menambah cakupan fitur atau menjalankan operasi database/deployment.

## Posisi dan preservasi

- Main remote dan lokal: `164e21539e49bc1870a8f92999225a8c3cad54ff`, setelah merge #103, #115, #116; #113, #108 dan #114 juga sudah tercakup.
- Head kerja sebelum sinkronisasi: `3b4062b2864b876e0f9d18063b3a59335fa016b7`, branch `feat/admin-irt-publication-ux`.
- Tiga commit belum tercakup main: `45bf3d8` UI-03 Impor, `01fd68e` UI-04 Analytics, `3b4062b` UI-05 IRT. Tidak ada remote branch yang mengandung head terakhir, dan daftar PR terbuka saat audit kosong. Ketiganya dipertahankan; mengambil main tidak berarti mengganti workspace dengan versi tanpa UI tersebut.
- Backup: `backup/admin-ui-before-main-20261031-3b4062b`. Satu perubahan lokal sebelum sinkronisasi adalah penghapusan panduan Next generated `apps/web/AGENTS.md`; salinannya disimpan di stash `ce63bd440046bebdaa730a7f81e6172967d412fb` dengan pesan `pre-main-sync-next-guide-deletion-2026-10-31`. Stash sebelumnya dipertahankan. Penghapusan generated tersebut tidak diterapkan kembali ke hasil integrasi.
- Common ancestor: `97a07330b01818e92258d734194733f0e4c7441f`. Rehearsal `git merge-tree` bersih, lalu main digabung ke branch kerja tanpa konflik. Local main di-fast-forward tanpa force; semua commit UI tetap menjadi ancestor hasil gabungan. Tidak ada rebase/reset atau pemilihan seluruh versi lama/baru.

## Review perubahan

| Area            | Hasil pemeriksaan                                                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Drill #103      | Predicate owner override tetap dibatasi kode/version policy, non-demo dan keanggotaan array packageIds. Pemeriksaan distribusi, level, PUBLISHED dan jadwal tetap berlaku. Tidak mengganti rubrik, XP atau hasil historis.                                                                                                     |
| Renderer #103   | Student memakai renderer bersama melalui compatibility export Admin. Penambahan bare root/fraction bersifat presentasi, dengan delimited LaTeX untuk bentuk kompleks; `trust:false`, batas ekspansi dan escaped fallback dipertahankan. `renderMedia:false` tidak memuat media Admin dari Student. Warna rumus mengikuti teks. |
| Media #115      | Guard menolak host R2/storage sebagai alamat API sebelum request upload dibuat. Tidak mengubah upload menjadi operasi langsung dari UI dan tidak mengirim token saat validasi gagal.                                                                                                                                           |
| Curriculum #116 | Proposal tetap DRAFT / PENDING_CURRICULUM_REVIEW / REVIEW_ONLY_NOT_SEED_INPUT. Validator offline valid; 23 indikator, 50 baris level subbab dan empat review item terbuka. Tidak menjalankan seed atau menyimpulkan persetujuan akademik.                                                                                      |
| CI #108         | Quality gate memeriksa seluruh required jobs; missing/skipped/cancelled tidak dianggap sukses. Dua shard browser, connected, build/contract dan bukti diagnostik dipertahankan. Tidak mengubah timeout/skips untuk menyembunyikan kegagalan.                                                                                   |
| Admin lokal     | Layout, akses role/capability, pagination, dialog, pin immutable, idempotensi, data kosong/ditolak, dan pemisahan adopsi dari publikasi tetap dipertahankan bersama renderer main.                                                                                                                                             |

Tidak ada perubahan migration chain atau lockfile dari baseline bersama ke main ini; tidak memerlukan migrasi lokal untuk sinkronisasi kode. Review ini tidak mengaplikasikan perubahan data, mengaktifkan IRT, atau memublikasikan hasil peserta.

## Bukti

[CI main pada SHA 164e215](https://github.com/ayiinee/Numora/actions/runs/41186744179) selesai sukses: validate, tests, connected, browser-e2e (1), browser-e2e (2), build-contract, quality. Ini evidence main remote, bukan klaim CI untuk gabungan tiga commit UI lokal.

Verifikasi awal hasil gabungan: 88 tes skrip lulus; 58 file / 424 tes unit web lulus; empat tes unit kebijakan Drill lulus. Satu kasus SQL PostgreSQL sengaja tidak dijalankan tanpa `TEST_DATABASE_URL` terisolasi. Contract schema/types, root lint, API/web TypeScript dan web production build lulus. Browser akhir dicatat sebelum merge commit disimpan.

Putaran browser pertama: **87/89 lulus**. Dua kegagalan Upload-first TRYOUT terjadi karena tes legacy mengeklik pembahasan yang kini sudah terbuka secara default pada UI-03, sehingga menutupnya sebelum assertion. Koreksi terbatas pada tes: periksa default open/penjelasan terlihat, uji tutup/hidden, lalu buka kembali/terlihat. Tidak mengubah preview aplikasi, menghapus assertion publish/idempotensi, melemahkan rule atau menambah timeout. Retest mencakup ketiga jenis paket, sehingga empat kasus DRILL/PRETEST tambahan ikut diperiksa.

Run retest berikutnya dihentikan setelah DRILL mencapai riwayat dan menemukan asumsi legacy lain: filter kini dibuka melalui `Filter riwayat`, dan tombol baca memiliki accessible name lengkap `Lihat <nama file>`. Tes diselaraskan dengan kedua interaksi tersebut; seluruh assertion simpan, media, idempotensi, Publish, filter, reload dan status tetap diperiksa. Tidak ada kasus yang dikecualikan. Run penuh terakhir **93/93 lulus** pada build produksi hasil gabungan, meliputi UI-01 sampai UI-05, role/scroll/pagination, pembaca soal, keenam upload-first, serta alur Drill Student pada 320/1440 px. Sisa tes legacy Admin/Ferdi di luar run tersebut juga **44/44 lulus**. Total 137 skenario browser lulus pada dua run yang saling melengkapi.

Health awal web 3000 dan API 3001 mengembalikan HTTP 200. Namun executable dua proses tersebut masih Node 24.19.0, di bawah floor `>=24.22.1 <25` pada package.json. Seluruh pemeriksaan kode memakai Node 24.22.1. Pemilik mengonfirmasi tidak ada sesi aktif yang perlu dipertahankan; web/API kemudian dijalankan ulang memakai executable 24.22.1 dan konfigurasi file environment yang sama. Runtime aktual listener dua port diverifikasi 24.22.1; web, API health dan database health 200, identitas tanpa token 401. Kompilasi watch API nol error. Node global, `.env`, data dan migration chain tidak diubah. Health proses bukan bukti login/layanan bisnis atau deployment SHA.

Node 24.22.1 / pnpm 12.6.0; cache dan build browser memakai dist terisolasi. Restart layanan development dilakukan setelah konfirmasi tidak ada sesi aktif. Tes browser memakai fixture Supabase/API localhost, bukan layanan nyata. Pengujian PostgreSQL khusus membutuhkan database test terisolasi; skip lokal tetap dicatat terpisah dari connected CI main. Worker/compute nyata, QA independen, deployment dan CI branch gabungan tidak dinyatakan lulus oleh review lokal ini. Terminal baru tetap perlu memilih Node yang memenuhi engine repo karena global default tidak diubah.

## Kesimpulan dan kelanjutan

**ENGINEERING REVIEW:** aman melanjutkan pengembangan lokal dari branch hasil gabungan; tidak ditemukan blocker kode pada cakupan diff dan regresi yang diperiksa. Runtime web/API aktif sudah memakai versi yang disyaratkan. Dua penyesuaian tes legacy mengikuti UI yang telah disetujui, bukan perubahan aturan produk.

Main tetap menunjuk `164e215`; UI-03/UI-04/UI-05 berada di branch kerja dan belum masuk main remote. Merge hasil sinkronisasi disimpan lokal, tanpa push, PR baru atau deployment. Sebelum hasil UI ini dipakai tim, perubahan lokal tersebut perlu jalur PR/review/CI gabungan. Tidak menganggap keberhasilan CI main sebagai keberhasilan CI untuk tiga commit lokal.
