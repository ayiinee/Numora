# PvP initial connection feedback

**ENGINEERING DECISION — perbaikan UI, 15 November 2026:** koneksi Socket.IO
awal dibedakan dari koneksi gagal/terputus. Lobby memakai spinner pada tombol
Buat room dengan label tetap selama menghubungkan; kartu pemulihan dan tombol
Sambungkan lagi hanya muncul setelah `connect_error` atau `disconnect`.
Kartu koneksi terputus di room mengikuti pembedaan yang sama. Kontrol perintah
tetap nonaktif sampai socket tersambung. Timer, request ID/idempotensi,
otorisasi, kebijakan reconnect server dan pin sesi tidak berubah.

Regresi frontend mencakup koneksi awal tertunda, larangan pengiriman sebelum
tersambung, kegagalan, retry, keberhasilan koneksi dan putus koneksi berikutnya.
Ini bukan bukti penerimaan dua pemain pada backend terintegrasi.

## Verifikasi lokal

- 26 tes pada `student-pvp.test.tsx` dan `pvp-presentation.test.tsx` lolos.
- ESLint file berubah, Prettier dan typecheck web lolos.
- Build produksi web dengan webpack dan direktori output terpisah lolos.
- Tes browser existing pada 320, 768 dan 1280 piksel, serta keluar saat duel
  terputus, lolos dengan transport sintetis lokal. Percobaan pertama 320 piksel
  timeout menunggu navigasi ke room selama 20 detik; pengulangan khusus tes
  tersebut lolos tanpa mengubah assertion atau batas waktu.
- Screenshot lobby pada ketiga lebar diperiksa; kartu pemulihan tidak tampil
  pada koneksi normal dan tidak ada overflow horizontal.
