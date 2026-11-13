# Audit alur Tryout - 10 November 2026

**ENGINEERING DECISION - implementasi aturan existing:** audit mengikuti permintaan pemilik untuk mencocokkan Admin PRD bagian 6 dan Admin Technical Spec bagian 7.5, dengan amendemen pemilik sebagai acuan bila berbeda. Salinan [sumber](../sources/admin-delivery-2026-11-10/README.md) identik byte dengan kedua lampiran Downloads (SHA-256 diperiksa). Tidak menetapkan policy akademik baru.

## Temuan dan tindakan

| Area | Hasil pemeriksaan |
| --- | --- |
| Master vs batch | Versi paket dipilih terpisah dari jadwal dan delegasi batch; perubahan master tidak mengganti pin attempt. |
| Draft lewat jadwal | BUG: API dan trigger DB mengunci Draft yang belum pernah dibuka. Diperbaiki melalui `batchEditable` dan migrasi 0065; Draft dapat dijadwal ulang/dibatalkan, publikasi tetap mensyaratkan waktu mendatang. |
| Sekolah nonaktif | BUG: sekolah diperiksa saat simpan, tetapi tidak diperiksa lagi saat terbit. Validasi dipakai pada kedua jalur dengan row lock; kegagalan publikasi tidak mengubah revisi/status. |
| Operasional | BUG: guard Content menutup akses baca jadwal/status. GET daftar/detail kini memakai `OPERATIONS_LIMITED_READ`; options dan seluruh mutasi tetap `CONTENT_MANAGE`. UI menyediakan navigasi dan menyembunyikan kontrol perubahan. |
| Modal pengaturan | BUG: formulir dalam dialog tertutup tetap terpasang dan meminta options. Form hanya dipasang saat pengaturan dibuka oleh pengelola Content. |
| Publikasi batch | Pemeriksaan paket terbit/non-demo, policy sah, delegasi, jadwal mendatang, larangan overlap serta revisi tetap dipertahankan. |
| Siswa multisekolah | Pemilihan sekolah eksplisit; tidak mengambil delegasi pertama. Sekolah tanpa delegasi ditolak. Mandiri membutuhkan nol membership aktif. |
| Attempt | Advisory lock dan constraint siswa/batch mencegah attempt ganda; resume mempertahankan assignment/paket. |
| Durasi | Waktu server authoritative; sepuluh menit dibatasi penutupan batch. Jawaban dan urutan runtime dipin. |
| PG/PGK dan XP | Rubrik Tryout existing dipakai; ekuivalen benar dan XP dipertahankan. Audit tidak mengubah formula, policy, hasil atau XP historis. |
| Rilis hasil | Belum sesuai target end-to-end multi-paket. `TryoutBatchesService.detail` mengembalikan blocker finalisasi; `TryoutService.result` dan reader canonical menahan batch Admin. Ini pengaman yang disengaja, bukan selector/UI yang boleh dilewati. |
| IRT v1 | Adopter/finalizer v1 ada untuk riset opt-in; staging hasil bukan publikasi siswa. Legacy prepare menolak batch Admin. Target rilis produksi masih memerlukan integrasi authoritative. |
| Varian/anchor | Pengembangan A/B dan kalibrasi mengikuti handoff existing; delegasi sekolah bukan randomisasi A/B. Tidak menganggap lima anchor per pasangan cukup untuk linking seluruh arm. |

## Batas yang belum selesai

**OPEN / delivery dependency:** sesuai [delivery IRT](../TRYOUT_IRT_DELIVERY_CONTEXT.md), jalur produksi membutuhkan snapshot multi-paket, policy/approval sah, adopsi canonical, coverage seluruh peserta, keputusan IRT/fallback per arm dan publikasi atomik hasil bersama pembahasan. Detail numerik/coverage/fallback yang belum disahkan tidak dikarang. Tidak mengaktifkan research flag atau mengubah guard untuk menyatakan hasil siap.

Konsekuensi: alur membuat batch hingga menyelesaikan jawaban dapat diuji lokal; rilis hasil siswa multi-paket belum dapat dinyatakan berhasil. Batas 72 jam adalah kewajiban produk yang belum dipenuhi jalur tersebut, bukan bukti bahwa scheduler sudah menyelesaikannya.

## Verifikasi

Fixture sintetis localhost, bukan data siswa/cloud. Tes regresi mencakup Draft kedaluwarsa, revisi stale, publikasi sekolah nonaktif tanpa perubahan parsial, izin baca/mutasi, overlap bersamaan, delegasi multisekolah, start/replay, deadline, penyelesaian dan penahanan hasil. Browser memeriksa Content dan Operasional, viewport serta aksesibilitas. Hasil perintah final dicatat setelah eksekusi; tes dengan mock bukan bukti integrasi AI atau persetujuan produksi.


Hasil verifikasi lokal:

- API: 36 tes lulus, mencakup content-chain/batch, batas jadwal, lifecycle dan partial reward. Dua suite legacy awalnya ditolak guard isolasi karena URL menunjuk database `postgres`; dijalankan ulang pada `numora_test_tryout_audit` yang sudah dimigrasi, 5/5 lulus. Guard tidak diubah.
- Unit UI: 36 tes navigasi dan recovery lulus.
- Engine: 8 tes partial scoring dan reward lulus.
- Browser: 2 tes lulus; Content create/delegasi/publikasi, viewport 320-1440, aksesibilitas dan Operasional baca-saja/direct-route.
- Typecheck API/Web dan build API lulus; lint berkas terkait dan `git diff --check` lulus.
- Migrasi 0065 diuji melalui fresh migration pada PostgreSQL 18 localhost. Ini bukan sertifikasi lingkungan PostgreSQL 16/cloud.
- Dua kegagalan browser awal berasal dari fixture role yang salah diubah dan editor tersembunyi yang tetap melakukan request. Fixture diperbaiki dan mount editor dibatasi; pengulangan kedua skenario lulus.

Tidak ada perubahan DB cloud, hasil historis, policy approval, publikasi otomatis atau push. Build produksi Web juga lulus (kompilasi, TypeScript dan generasi halaman). Batas UI/respons API tidak berubah bentuk, sehingga tidak ada regenerasi tipe OpenAPI yang diperlukan untuk perubahan izin ini.

## Jadwal form batch

ENGINEERING DECISION � instruksi pemilik, 10 November 2026: waktu mulai wajib di masa depan, termasuk saat menyimpan Draft. Picker memakai WIB; server memvalidasi terhadap waktu database. Mengubah waktu mulai mengisi ulang waktu tutup menjadi tujuh hari setelahnya sebagai default formulir, bukan durasi wajib; admin tetap dapat mengubah waktu tutup selama sesudah mulai. Draft lama dapat dijadwalkan ulang tanpa mengubah attempt atau hasil historis.

## Tindak lanjut UI Siswa — 13 November 2026

**ENGINEERING DECISION — perbaikan UX Siswa:** Jadwal memuat sesi aktif, batch terbuka, dan jadwal mendatang. Terlewat berisi paket tertutup tanpa sesi siswa. Riwayat memuat Tryout yang sudah dikirim dan menyediakan akses ke status rilis. Progres menghitung soal terisi lengkap yang sudah diterima server. Posisi dan tanda ragu dipulihkan di browser yang sama per akun dan sesi.

Daftar batch, Riwayat, dan halaman hasil memakai pemeriksaan publikasi yang sama. Kontrak daftar batch menambahkan status hasil dan kemampuan melanjutkan sesi. Riwayat siswa menerima filter opsional `activity=tryout` sebelum paginasi. Status keterlambatan memakai tenggat dan waktu server. Batas rilis 72 jam tetap berlaku, dengan akses pembahasan setelah publikasi.

Verifikasi lokal tindak lanjut: 103 tes frontend, 18 skenario Chromium pada build produksi lokal, dan 17 tes API pada PostgreSQL disposable. Chromium mencakup 320, 390, 768, 1280, serta 1440 px, termasuk layar pendek 320 × 640, simpan ulang, Back, PGK, dan pengiriman otomatis. Kontrak, lint, typecheck, dan build Web/API lulus. Pengujian memakai data sintetis dan tidak menguji publikasi IRT produksi.

Audit ulang P1: polling setelah waktu habis mempertahankan status kedaluwarsa dan tidak memicu kirim ulang otomatis. Form ditutup jika server menyatakan sesi batal atau akses hilang, sedangkan gangguan sementara mempertahankan jawaban lokal. Daftar batch memakai koneksi transaksi yang sama untuk memeriksa publikasi. Tes delegasi batch lulus dengan pool satu koneksi, bersama 105 tes frontend, 18 skenario Chromium sintetis, dan 17 tes API pendukung.

## Perbaikan P2 UI Siswa

**ENGINEERING DECISION — perbaikan UX Siswa:** kartu katalog menampilkan waktu buka dan tutup dari API dalam WIB dan mengelompokkan batch terjadwal di bagian Akan datang. Halaman hasil menampilkan nilai terbit pada skala 0–100 dengan format angka Indonesia. Akses pembahasan berada di kartu nilai dan mengikuti data hasil yang diterbitkan server.

Pembahasan Tryout menggunakan label Jawabanmu dan Kunci pada opsi atau pernyataan. Peta soal menampilkan status dari data penilaian server. Panel desktop dan dialog mobile menggunakan peta yang sama, dengan fokus ke judul soal setelah siswa memilih nomor. Status setelah pengiriman menampilkan aksi untuk memeriksa hasil atau membuka Riwayat.

Regresi lokal mencakup 32 skenario Chromium dengan fixture sintetis, termasuk Tryout, Drill dan Pretest. Tampilan P2 diuji pada 320, 390, 768, 1280 dan 1440 px, serta reflow 640 CSS px yang setara dengan viewport 1280 px pada zoom 200 persen. Cakupan termasuk akses pembahasan sebelum rilis, nilai null, jadwal WIB, target sentuh, kontras peta, fokus, Escape, rumus dan gambar. Pengujian ini tidak mencakup IRT produksi.

Audit ulang P2 memeriksa penyegaran pembahasan, reflow rumus panjang, tanggal yang tidak dapat dibaca, dan pemulihan status Riwayat. Gangguan koneksi sementara mempertahankan posisi pada pembahasan yang sudah dirilis. Hasil audit lokal mencakup 167 tes Core Learning, 32 skenario Chromium, lint, typecheck, dan build Web.
