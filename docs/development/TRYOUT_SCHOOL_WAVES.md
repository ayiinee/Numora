# Gelombang dan akses Tryout - 25 November 2026

**ENGINEERING DECISION — perbaikan validasi pasangan, 26 November 2026:** kode keluarga impor bukan identitas pasangan original/varian. Paket generated dan revisi Kurikulumnya boleh berbeda family code dari original bila relasi sumber generator tersimpan menghubungkan pasangan tersebut. Backend memverifikasi relasi generator durable, bukan nama paket atau metadata bebas. Validasi publikasi, policy, distribusi dan pasangan gelombang tetap berlaku. Parent code sama tidak membuktikan linking/kelayakan statistik IRT.

**ENGINEERING DECISION - instruksi pemilik, 26 November 2026:** provisioning enam sekolah memakai konfigurasi `scripts/tryout-schools-20261126.json`, original `331115ad-8569-468d-9382-e8577c7afd55` dan varian revisi Kurikulum `5fc03163-4ca0-4c17-8db5-eaa86b825ae7`. Nama batch `TRY OUT TKA <NAMA SEKOLAH>`, mulai 26 November 2026 04.00 WIB dan tutup 3 Desember 2026 04.00 WIB, langsung publikasi. Satu gelombang bersama, tanpa penerima Mandiri. Ini konfigurasi operasional, bukan bukti data produksi sudah dibuat.

**ENGINEERING DECISION - persetujuan pemilik:** batch baru memakai gelombang Admin dengan pasangan versi original/varian tetap. Target adalah sekolah terpilih atau Mandiri, tanpa fallback sekolah lain. Identitas sekolah berasal dari keanggotaan kelas aktif; sekolah nonaktif tidak menjadi Mandiri. Satu kesempatan per akun/sekolah/gelombang atau satu Mandiri; lintas sekolah boleh, lintas sekolah-Mandiri tidak. Kesempatan terpakai saat attempt dibuat, termasuk bila kemudian dihentikan. Gelombang baru tidak menghapus exposure.

Sekolah memakai alokasi 50/50 saat start berdasarkan assignment attempt per batch/sekolah; Mandiri dialokasikan seimbang saat start dengan assignment persisten. Perbaikan alokasi juga berlaku untuk delegasi BALANCED_50_50 batch lama tanpa gelombang. Riwayat, sesi dan XP lama tidak berubah. Original/varian, roster dan hak pengerjaan tidak direset melalui edit penerima. Paparan keluarga soal sebelumnya tidak menjadi evidence independen baru; tidak mengubah parameter ilmiah atau menggabungkan kalibrasi lintas batch.

**OPEN:** parameter ilmiah, linking dan pemetaan tetap mengikuti dependency Data/AI existing. Pengujian lokal tidak membuktikan aktivasi cloud.

Konfigurasi dan penerima batch bergelombang dikunci saat publikasi untuk menjaga pasangan paket dan target sekolah. Jadwal tutup masih dapat diperpanjang melalui aksi existing; stop dan batal tetap tersedia sesuai lifecycle.

## Aktivasi dan verifikasi

### Provisioning VPS setelah pull

Jalankan dari root repo sesudah dependency, migrasi hingga `0082`, build dan restart API/worker selesai. Sekolah harus sudah aktif, nama harus cocok (case/spasi dinormalisasi), paket harus terbit dan satu keluarga atau memiliki relasi sumber generator yang tercatat. Siswa boleh bergabung setelah publikasi; wajib memiliki keanggotaan kelas aktif sekolah tujuan saat mulai. Script tidak membuat sekolah, akun, paket atau keanggotaan kelas.

Gunakan token sesi Admin berizin `CONTENT_MANAGE`; jangan kirim token lewat chat atau commit. Isi `NUMORA_API_URL` dengan URL API NestJS sebenarnya yang berakhiran `/api/v1` (bukan URL frontend). HTTPS wajib kecuali localhost. Contoh Bash di VPS, input token disembunyikan:

```bash
export NUMORA_API_URL='http://127.0.0.1:3001/api/v1' # sesuaikan port API VPS
read -rsp 'Token sesi Admin: ' NUMORA_ADMIN_ACCESS_TOKEN; echo
export NUMORA_ADMIN_ACCESS_TOKEN
node scripts/provision-tryout-batches.mjs --config scripts/tryout-schools-20261126.json
node scripts/provision-tryout-batches.mjs --config scripts/tryout-schools-20261126.json --apply
unset NUMORA_ADMIN_ACCESS_TOKEN
```

Perintah pertama hanya preview; `--apply` membuat dan langsung memublikasikan keenam batch melalui API Admin existing beserta audit/otorisasinya. Publikasi tetap memvalidasi kesiapan akademik lewat backend. Wajib dijalankan sebelum 26 November 04.00 WIB; jadwal yang lewat tidak dibackdate atau digeser otomatis. Menjalankan ulang konfigurasi sama melewati batch yang sudah terbit dan melanjutkan draft. Konflik konfigurasi/nama ambigu menghentikan proses tanpa menimpa batch existing. Kegagalan setelah sebagian publikasi tidak membatalkan batch yang sudah berhasil; periksa Admin lalu jalankan ulang. Token kedaluwarsa perlu diganti token sesi baru.

**ENGINEERING DECISION:** satu operator provisioning pada satu VPS/root checkout; lock lokal mencegah proses bersamaan di checkout tersebut. Jangan jalankan dari beberapa host/checkout atau membuat batch bernama sama secara manual bersamaan. Idempotensi lintas host memerlukan dukungan idempotency key server bila nanti diperlukan. Bila proses dibunuh paksa, hapus lock `.tmp/tryout-provision.lock` hanya setelah memastikan tidak ada proses provisioning aktif. Tidak ada hook otomatis pada `git pull` dan tidak ada akses langsung ke DB bisnis.

### Verifikasi implementasi

Migrasi `0081_tryout_school_waves.sql` harus diterapkan sebelum API/worker baru. Pasangan gelombang immutable; batch lama tidak diberi gelombang otomatis. Pemilihan exposure berdasarkan delivery pertama hanya berlaku untuk batch bergelombang; semantik snapshot legacy dipertahankan.

Verifikasi lokal: suite batas batch dan skenario HTTP/PostgreSQL terpilih menguji targeting, roster, multisekolah, race start lintas batch, dua arah perpindahan sekolah/Mandiri, balance Mandiri, exposure pertama/ulang dan periode baru. Suite browser Admin mencakup viewport 320/390/768/1440, keyboard dan axe. Tes lain yang tidak dipilih bukan acceptance. Tidak ada migrasi cloud atau deployment.

Hasil akhir 26 November 2026: 10 tes backend terpilih lulus (30 kasus lain tidak dipilih), 6 tes browser produksi terpilih lulus, dan 4 tes adapter IRT lulus. Lint repo, typecheck database/API/Web/orchestration, build database/assessment-engine/orchestration/API/worker/Web, validasi 17 kontrak dan pengecekan generated types lulus. Build Web awal dihentikan pengingat kerentanan Next.js existing; pengulangan build berhasil. Pembaruan dependency keamanan terpisah tetap diperlukan. Ini bukan penerimaan pipeline ilmiah penuh atau rilis produksi.

## Perbaikan alokasi saat start - 26 November 2026

**ENGINEERING DECISION - disetujui pemilik:** seluruh delegasi BALANCED_50_50 memakai jumlah assignment attempt, bukan roster publikasi. Paket berjumlah lebih sedikit dipilih; saat sama dipilih acak. Lock transaksi per delegasi sekolah/batch melindungi start paralel. Assignment dan attempt disimpan atomik; resume tidak mengubah paket. Attempt batal/tidak selesai tetap dihitung, transaksi gagal tidak dihitung. Dari kosong 200 start menghasilkan 100:100, bukan jaminan jumlah selesai atau kecukupan ilmiah IRT. Ketimpangan existing diseimbangkan bertahap tanpa mengganti sesi lama.

Snapshot roster lama tetap immutable sebagai histori tetapi tidak lagi menjadi syarat izin atau penentu start baru. SINGLE_PACKAGE dan Mandiri mempertahankan perilaku existing. Jika paket terpilih tidak siap, start gagal tanpa fallback diam-diam. Endpoint dan JSON tetap; makna BALANCED_50_50 kini alokasi saat start.

Rollout: migrasi indeks assignment diterapkan sebelum backend baru. Hentikan backend lama sebelum menerima start dengan backend baru; jangan layani dua algoritma bersamaan. Provisioning sekolah boleh dilakukan tanpa siswa. Jadwal yang lewat tetap ditolak. Verifikasi assignment per batch/sekolah sesudah rollout; tidak ada backfill/rewrite hasil, XP, exposure atau assignment historis.

Verifikasi perbaikan: 10 tes backend terpilih lulus, termasuk 200 start HTTP paralel menghasilkan 100:100, snapshot lama diabaikan, rollback, duplicate start dan resume. Tujuh tes browser produksi terpilih lulus, termasuk anggota sekolah yang baru bergabung; lint, typecheck dan build Web lulus. Tes terpilih tidak menggantikan seluruh CI.
