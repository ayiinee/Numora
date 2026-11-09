# Daftar dan detail paket asesmen — 9 November 2026

**ENGINEERING DECISION — rencana pemilik disetujui:** Pretest, Drill dan Tryout masing-masing mempunyai rute `/admin/assessments/{pretest|drill|tryout}`, halaman tambah `/new` dan detail `/:id`. Sidebar menuju daftar, tanpa tab jenis asesmen, header besar atau paragraf pengantar. Judul semantik tetap tersedia bagi pembaca layar.

Daftar hanya memuat search nama/kode, filter status/bab/sumber, muat ulang, Tambah paket, tabel dan pagination lima baris. Nama paket dan Kelola membuka detail; seluruh mutasi berada di tambah/detail. Tidak ada hapus permanen. Pencarian/filter/pagination di server dan URL; query daftar ikut pada rute tambah/detail agar Kembali tetap konsisten setelah reload.

Form tambah mempertahankan field, validasi dan kontrak existing. Setelah simpan, buka detail. Detail memakai pipeline review/approval/publish/archive existing dan memungkinkan rename DRAFT dengan revision serta membership yang dipertahankan. Detail tidak mengambil daftar paket. Pemilih paket pada impor tetap tersedia. Rute lama mempertahankan konteks melalui pengalihan. Paket dengan jenis berbeda diarahkan ke detail jenis sebenarnya setelah guard dan GET paket berhasil.

API daftar menambah `search?: string` maksimal 160 karakter, pencocokan substring nama atau familyCode tanpa membedakan kapital; `%` dan `_` diperlakukan sebagai karakter literal. Urutan existing ditambah ID sebagai tie-breaker. Total dan rows memakai predikat sama. Status akses hanya dibaca dari DTO server; tidak tersedia bukan dianggap tersedia. Tidak mengubah schema, aturan asesmen, histori, permission atau environment.

**OPEN:** persetujuan akademik/IRT tetap sesuai register produk. Penataan ini tidak menyelesaikan dependency tersebut. Implementasi pada `feat/admin-assessment-rework`; pengujian lokal terisolasi, tanpa push, merge atau perubahan cloud.

## Verifikasi implementasi

- **89 unit test / 5 file lulus:** navigasi, kompatibilitas rute, portal serta regresi preview/upload impor.
- **24 tes integrasi HTTP/PostgreSQL lulus:** termasuk pencarian nama/kode, kombinasi filter/total/pagination, panjang input, karakter pencarian literal, rename tanpa mengganti ID/poin item, konflik revisi dan publikasi Pretest non-demo sampai start/resume/submit siswa tanpa XP. PostgreSQL 18.6 audit pada localhost 35440 dihentikan kembali setelah tes; tidak memakai data cloud.
- **9/9 browser direktori lulus pada run terakhir**, mencakup ketiga daftar/tambah/detail, konteks Back/reload, pencarian server fixture, salah jenis, kegagalan create, konflik rename, paket hilang, arsip, keyboard, availability yang tidak tersedia, Axe dan viewport 320/390/768/1440. Screenshot desktop/ponsel ditinjau.
- **7/7 regresi Pretest/publikasi/jadwal dan akses** lulus pada run gabungan sebelumnya. **17/17 sidebar dan 2/2 publisher** lulus pada run regresi terpisah. Seluruh browser memakai build produksi lokal dan Auth/API fixture TEST ONLY; bukan bukti Google OAuth atau kondisi paket pada lingkungan pengguna.
- Percobaan browser awal mempertahankan bukti gagal: tes melakukan reload sebelum navigasi selesai dan memakai selector label/status/alert yang ambigu. Perbaikannya menunggu halaman tujuan dan memilih elemen semantik yang tepat, tanpa mengubah assertion bisnis. Run gabungan terakhir sebelum direktori final menghasilkan 15 lulus/1 kegagalan selector status arsip; direktori final diulang utuh dan lulus 9/9. Artefak berada di ignored `apps/web/test-results/assessment-directory*`.
- Lint repository, TypeScript Web/API, build produksi Web, validasi 12 schema kontrak, freshness tipe generated, formatting berkas perubahan dan `git diff --check` lulus. OpenAPI diregenerasi dari build API. `.env` tidak berubah, tidak ada migrasi, push, merge atau deployment. Review manusia/QA independen tetap terpisah dari verifikasi lokal ini.

### Koreksi toolbar dan runtime lokal � 9 November 2026

**ENGINEERING DECISION � permintaan pemilik:** pencarian nama/kode paket memakai input berikon, tinggi minimum 44 px, focus ring, dan ukuran teks 16 px pada ponsel. Submit, filter URL dan kontrak pencarian tetap.

Diagnosis lokal: proses API yang direstart tidak membawa `CONTENT_IMPORT_PREVIEW_ENABLED=true`; gate existing juga dipakai daftar paket. Proses lokal dijalankan ulang dengan flag tersebut melalui environment proses, tanpa mengubah `.env`, default gate, permission atau rollout cloud. Restart berikutnya perlu membawa flag yang sama. Health API dan halaman Pretest HTTP 200; lint berkas dan typecheck Web lulus. Verifikasi sesi Admin nyata dan tampilan browser belum diulang pada koreksi ini.


### Detail paket: konten sebagai area utama

**ENGINEERING DECISION - instruksi pemilik, 9 November 2026:** detail paket ditata ulang menyeluruh tanpa header pengantar tambahan. Identitas objek dan status tampil ringkas, diikuti hitungan soal/review/pemeriksaan. Informasi sumber, cakupan, perubahan nama dan kelanjutan paket lama berada dalam panel pengaturan yang tertutup awalnya. Daftar soal dan review menjadi area utama; akses siswa, checklist, persetujuan, publikasi dan arsip berada dalam panel samping. Pada layar sempit panel samping berada setelah soal. Semua kontrak, pembatasan status, konfirmasi, konflik revisi dan permission existing dipertahankan. Komponen bersama memakai susunan yang konsisten pada detail Drill/Tryout dan pemilih paket existing.

Verifikasi koreksi: tes browser dengan fixture TEST ONLY mencakup detail salah jenis, simpan nama, konflik, paket hilang, layout 320/390/768/1440 dan audit aksesibilitas. Kondisi paket nyata pada database pengguna tidak dianggap telah diverifikasi melalui fixture.

Hasil akhir koreksi detail: 12/12 tes browser direktori dan publisher lulus; audit axe detail lulus; lint berkas, typecheck Web, formatting dan build produksi terisolasi (.next-detail-build) lulus. Tidak ada perubahan API, schema, konfigurasi .env atau publikasi cloud.

### Iterasi keterbacaan detail

**ENGINEERING DECISION - pemilik:** daftar soal detail ditampilkan seluruhnya dalam satu halaman (termasuk 20 soal Pretest), menggantikan pagination lima soal khusus detail; pagination direktori tetap. Nomor soal dan status pemeriksaan menjadi identitas kartu. Kunci dan pembahasan berada dalam disclosure per soal. Aksi pengeluaran menyebut tujuan paket dengan penjelasan bahwa soal tetap di bank konten. Warna ungu menandai identitas/aksi utama, hijau jawaban, kuning syarat belum terpenuhi, merah pengeluaran; label teks tetap menyampaikan makna tanpa bergantung pada warna. Istilah review dan persetujuan menggunakan bahasa yang lebih jelas. Tidak mengubah aturan akademik atau API.

### Tabel soal dan perbaikan yang dapat ditindaklanjuti

**ENGINEERING DECISION - pemilik:** detail menampilkan seluruh soal sebagai tabel nomor, identitas/ringkasan, keterbacaan isi, status tinjauan dan aksi. Lihat & tinjau membuka dialog per soal; soal yang payload-nya ditolak validasi tidak dapat diberi review melalui dialog. Periksa/perbaiki mengarah ke detail versi existing, termasuk jalur revisi existing. Paket legacy tanpa provenance diarahkan ke persiapan sumber existing sebelum impor nyata. Tidak membuat provenance atau menganggap review lama sah.

Impor penambahan disembunyikan saat jumlah soal mencapai kapasitas; impor perbaikan tetap tersedia melalui dialog karena paket penuh dapat berisi versi tidak valid. Komposisi soal ditampilkan dalam disclosure, dengan label jenis/kesulitan Indonesia dan nama kurikulum jika ditemukan; kode menjadi fallback. Jumlah soal bukan tanda kesiapan. Syarat paket dan akses siswa disembunyikan dalam disclosure, terpisah dari status per baris; API saat ini belum memberikan rincian kegagalan validasi per field untuk item yang question=null, sehingga UI tidak mengarang letak kesalahan. Persetujuan dan penerbitan ditampilkan sebagai dua langkah terpisah.

Verifikasi lokal: empat browser checks detail/konflik/20 baris/responsif/axe lulus; satu browser check soal legacy tidak valid, review nonaktif dan navigasi ke persiapan sumber lulus. Lint dan typecheck Web lulus. Semua data browser TEST ONLY; kondisi database pengguna belum dibuktikan melalui fixture.

### Ringkasan compact dan satu pintu tinjauan

**ENGINEERING DECISION - pemilik:** identitas paket diringkas menjadi judul kecil, kode/versi dan badge status. Statistik jumlah soal/tinjauan/syarat ditampilkan inline. Pengaturan paket dibuka melalui tombol modal, termasuk nama, sumber, komposisi dan persiapan paket lama. Tabel soal memakai baris compact dengan satu aksi Tinjau; akses perbaikan berada di dalam dialog tinjauan yang sama, menggunakan endpoint/halaman revisi existing. Tidak membuat jalur review kedua. Daftar Pretest memakai tabel compact tanpa panel filter; pencarian, pagination dan kompatibilitas URL lama dipertahankan. Filter Drill/Tryout tetap.

Verifikasi iterasi compact: 12/12 tes browser direktori lulus, termasuk modal pengaturan, tabel 20 soal, alur Tinjau, sumber legacy, konflik, arsip, viewport 320-1440 dan axe. Lint, typecheck, formatting, diff-check dan build produksi terisolasi lulus. Fixture TEST ONLY; tanpa perubahan API, .env atau database cloud.

### Bahasa ketersediaan siswa

**ENGINEERING DECISION - permintaan pemilik:** label BLOCKED menjadi Belum bisa dikerjakan; AVAILABLE menjadi Bisa dikerjakan; SCHEDULED menjadi Menunggu jadwal mulai; DRAFT menjadi Belum diterbitkan. Label ketersediaan dipisahkan dari status publikasi. Alasan memakai istilah soal, aturan penilaian dan kesiapan bab; kode server yang memiliki beberapa kemungkinan tetap dijelaskan sebagai beberapa kemungkinan, bukan ditebak penyebabnya. Ketentuan kelayakan siswa tetap dijelaskan pada detail. Tidak mengubah aturan akses.

**ENGINEERING DECISION - pemilik, 10 November 2026:** Pretest menggunakan seluruh lebar workspace di sebelah sidebar. Batas max-width frame dan padding horizontal kontainer dihapus khusus Pretest; padding internal tabel tetap menjaga keterbacaan. Detail mempertahankan inset 16 px. Halaman modul lain tetap mengikuti layout existing.

### Detail terpadu - 10 November 2026

**ENGINEERING DECISION - permintaan pemilik:** identitas, statistik dan aksi pengaturan/penerbitan berada dalam satu kartu compact. Tabel soal menjadi permukaan kerja utama dengan header, caption bantuan ringkas dan tombol Tinjau konsisten. Penerbitan/arsip dibuka melalui modal agar formulir tidak memenuhi halaman. Modal Tinjau menyediakan navigasi sebelumnya/berikutnya, mengosongkan catatan saat berganti soal agar catatan tidak tersimpan ke soal yang keliru. Permission, validasi dan konfirmasi existing tetap.
