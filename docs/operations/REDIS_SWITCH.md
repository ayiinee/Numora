# Mengganti Redis Production melalui PuTTY

**ENGINEERING DECISION — permintaan pemilik, 16 November 2026:** sediakan
peralihan Redis manual dengan satu perintah untuk VPS Ubuntu/systemd yang ada.
Skrip ini menggunakan satu Redis aktif untuk API dan worker.

## Persiapan sekali

File `scripts/switch-redis.mjs` harus sudah berada di `/opt/numora` pada VPS,
beserta dependensi workspace yang sudah dipasang. Gunakan akun `admin-numora`
yang memiliki `/etc/numora/production.env`, akses `sudo`, Node.js 24 dan `flock`
(paket Ubuntu `util-linux`). Kedua unit harus membaca
`EnvironmentFile=/etc/numora/production.env`; skrip memeriksanya sebelum stop.
Jangan jalankan seluruh skrip dengan `sudo`: Node dari nvm memakai akun biasa.

Simpan koneksi yang sekarang aktif sebagai profil primary. Perintah menolak
menimpa profil yang sudah ada:

```bash
node /opt/numora/scripts/switch-redis.mjs save-current primary
```

Buat file cadangan melalui editor di PuTTY:

```bash
umask 077
touch /etc/numora/redis-backup-1.env
chmod 600 /etc/numora/redis-backup-1.env
nano /etc/numora/redis-backup-1.env
```

Isi **di dalam nano**, lalu simpan Ctrl+O, Enter, dan keluar Ctrl+X:

```dotenv
REDIS_URL="rediss://default:PASSWORD_REDIS_CADANGAN@HOST_REDIS_CADANGAN:6379"
```

Gunakan URL TLS dari penyedia Redis cadangan. Karakter khusus di username atau
password perlu di-URL-encode. Jangan memasukkan URL ke argumen command/history,
Git atau chat. Untuk cadangan berikutnya, gunakan file `redis-backup-2.env`, dst.
Semua file env/profil/backup harus tetap privat (600) dan dimiliki akun ini.

## Satu perintah untuk beralih

```bash
node /opt/numora/scripts/switch-redis.mjs backup-1
```

Kembali ke primary, setelah koneksi dan kuotanya pulih:

```bash
node /opt/numora/scripts/switch-redis.mjs primary
```

Profil `backup-2` dan seterusnya memakai perintah yang sama. Skrip dapat meminta
password `sudo` Ubuntu. Biarkan selesai; pemeriksaan startup maksimal 60 detik,
ditambah waktu systemd stop/start dan pemulihan jika diperlukan.

Skrip mengunci peralihan agar dua eksekusi tidak bertabrakan, mengecek TLS dan
baca/tulis pada key acak dengan TTL 30 detik, membuat backup env privat, stop
API/worker, mengganti hanya `REDIS_URL` secara atomik, lalu start keduanya.
`BULLMQ_PREFIX`, database dan konfigurasi lain dipertahankan. Web tidak direstart.
Profil primary yang disimpan hanya salinan koneksi; pemilihannya tidak berubah
otomatis saat skrip dijalankan.

Sukses berarti API menjawab health lokal di port 3001 dan worker aktif dengan
log koneksi Redis dari invocation systemd saat ini, dalam tiga pemeriksaan
berturut-turut. Ini bukan uji kapasitas 200 siswa atau bukti seluruh pekerjaan
antrean sudah selesai. Untuk leaderboard, periksa log proyeksi:

```bash
sudo journalctl -u numora-worker -n 60 --no-pager
```

## Batas peralihan dan pemulihan

Lakukan sebelum sesi siswa atau setelah aktivitas selesai: API dan worker
berhenti sebentar, koneksi WebSocket terputus, dan pemulihan startup PvP existing
dapat membatalkan room yang belum selesai. Redis baru tidak otomatis mempunyai
antrean BullMQ, delayed jobs, cache atau state PvP dari Redis lama. Prefix yang
sama tidak menyalin data antar-instance. PostgreSQL tetap sumber data bisnis
yang tahan lama; jangan mengasumsikan setiap job lama akan diputar ulang.
Antrean yang relevan perlu ditinjau terpisah sebelum Redis lama dihapus atau
dipakai kembali. Skrip tidak menghapus atau memindahkan antrean lama.

Jika startup gagal, skrip mencoba stop kedua service, mengembalikan env, start,
dan memeriksa keduanya lagi. Jika Redis lama masih kehabisan kuota, pemulihan
layanan bisa tetap gagal; pesan akan menyatakan **pemulihan belum terkonfirmasi**
dan menampilkan lokasi backup. Periksa:

```bash
systemctl is-active numora-api numora-worker
sudo journalctl -u numora-api -u numora-worker -n 80 --no-pager
```

Jika ada edit env lain ketika peralihan berjalan, skrip berhenti agar edit itu
tidak ditimpa. Hindari edit env, restart/deploy lain, dan Ctrl+C selama proses.
Backup tetap tersedia bila proses terputus oleh putus koneksi atau mesin mati.
Ini peralihan manual ke database Redis berbeda, bukan replikasi atau HA otomatis.

## Verifikasi developer

```bash
node --test scripts/switch-redis.test.mjs
```

Pengujian lokal mencakup penolakan kandidat, kegagalan stop/write/start/health,
pemulihan gagal, konflik edit env, serta perlindungan kredensial pada error probe.
Pengujian tidak mengakses Redis atau systemd Production.
