# Mengganti Redis Production melalui PuTTY

**ENGINEERING DECISION — permintaan pemilik, 16 November 2026:** sediakan
peralihan Redis manual dengan satu perintah untuk VPS Ubuntu/systemd yang ada.
Skrip ini menggunakan satu Redis aktif untuk API dan worker.

**ENGINEERING DECISION — permintaan pemilik, 16 November 2026:** peralihan
otomatis boleh memakai cadangan berikutnya setelah Redis aktif mengembalikan
error limit Upstash yang terkonfirmasi. Kegagalan jaringan/login tidak memicu
perpindahan. PostgreSQL dan pin hasil historis tidak berubah.

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

## Aktifkan pemilihan cadangan otomatis

Siapkan profil cadangan seperti di atas, dengan endpoint berbeda untuk masing-masing
profil. Pastikan `main` terbaru beserta dependensi workspace sudah ada di VPS.
Dari akun `admin-numora` yang sama, jalankan sekali:

```bash
cd /opt/numora
sudo env NUMORA_NODE_BIN="$(command -v node)" bash scripts/install-redis-failover.sh
```

Installer memasang unit oneshot dan timer systemd. Timer melakukan pemeriksaan
pertama setelah sekitar 30 detik (atau segera bila server sudah lama menyala),
lalu sekitar satu menit setelah setiap pemeriksaan selesai. Penundaan dan waktu
startup berarti pergantian tidak instan. Node memakai path nvm saat instalasi;
jika versi/path Node diganti, jalankan installer lagi.

Service berjalan sebagai akun pemasang. Untuk restart tanpa prompt password,
installer memasang `/etc/sudoers.d/numora-redis-failover` yang hanya mengizinkan
`stop`, `reset-failed`, dan `start` untuk pasangan unit `numora-api numora-worker`.
Akses baca journal diberikan melalui grup tambahan `systemd-journal` pada unit
watchdog. Isi file diperiksa dengan `visudo` sebelum dipasang. Skrip manual
tetap dapat digunakan.

Alur otomatis:

1. Jalankan satu GET ke Redis aktif; tidak memakai PING sebagai bukti kuota.
2. Beralih hanya bila error mengandung `max requests limit exceeded`, sesuai
   [diagnostik kuota bulanan Upstash](https://upstash.com/docs/redis/troubleshooting/max_requests_limit)
   dan deteksi limit worker saat ini. Error koneksi, TLS, auth, atau error lain
   dilaporkan tanpa mengganti koneksi.
3. Periksa profil cadangan menurut urutan angka, misalnya `backup-1`, `backup-2`,
   `backup-10`. Jika yang aktif `backup-2`, lanjutkan ke nomor sesudahnya.
   Cadangan perlu lolos SET/GET/DEL sebelum dipilih. Lewati profil tidak valid,
   endpoint duplikat, atau cadangan yang tidak menerima command.
4. Buat backup env dan gunakan prosedur switch/restart/health yang sama dengan
   peralihan manual. Maksimal satu percobaan restart per pemeriksaan; kegagalan
   startup tidak memicu rentetan restart ke semua cadangan.

Watchdog tidak membaca cadangan ketika Redis aktif sehat. Satu GET per menit
menambah sekitar 43.200 command per 30 hari, ditambah probe saat failover.
Menurut [pricing Upstash](https://upstash.com/pricing/redis), command operasional
seperti AUTH dan PING tidak ditagihkan. Kapasitas dan kuota aplikasi tetap perlu dipantau.

Endpoint yang sudah memberikan error limit dicatat sebagai hash tanpa URL atau
password di `/etc/numora/redis-failover-state.json` (600). Ada cooldown lima menit
setelah percobaan untuk menghindari pergantian berulang. Tidak ada perpindahan
kembali ke primary secara otomatis. Memutar password di endpoint yang sama
tidak membuatnya dianggap sebagai cadangan baru.

Jika semua cadangan tidak siap, koneksi tidak diganti dan kegagalan muncul di
journal. Bila kuota bulanan sudah pulih dan ingin memakai ulang urutan cadangan,
nonaktifkan timer, tunggu pemeriksaan yang sedang berjalan selesai, lalu pindahkan
file state agar dibuat ulang. Pertahankan profil dan backup env:

```bash
sudo systemctl disable --now numora-redis-failover.timer
systemctl is-active numora-redis-failover.service
```

Setelah service bukan `activating`/`active`, dari akun `admin-numora`:

```bash
mv /etc/numora/redis-failover-state.json "/etc/numora/redis-failover-state.before-reset.$(date +%Y%m%d-%H%M%S).json"
sudo systemctl enable --now numora-redis-failover.timer
```

Jalankan pemindahan state hanya jika file sudah ada. Untuk kembali ke primary,
gunakan perintah manual setelah Redis itu pulih. Semua batas antrean/PvP di atas
berlaku juga pada peralihan otomatis: ini cadangan instance terpisah dengan
restart aplikasi, bukan replikasi tanpa putus layanan.

Periksa pemasangan dan hasilnya:

```bash
systemctl list-timers numora-redis-failover.timer --no-pager
sudo journalctl -u numora-redis-failover -n 40 --no-pager
```

Untuk menonaktifkan perpindahan otomatis, cukup disable timer seperti di atas;
biarkan pemeriksaan yang sudah berjalan selesai. File sudoers tetap ada sampai
dihapus tersendiri oleh administrator.

## Menguji failover tanpa menghabiskan kuota

Pesan `Redis aktif menerima command; koneksi dipertahankan` menunjukkan probe
berhasil. `Deactivated successfully` normal untuk service oneshot setelah selesai;
yang perlu tetap aktif/enabled adalah timer:

```bash
systemctl is-enabled numora-redis-failover.timer
systemctl is-active numora-redis-failover.timer
systemctl list-timers --all numora-redis-failover.timer --no-pager
```

Setelah pull versi terbaru, jalankan installer sekali lagi agar unit uji tersedia:

```bash
cd /opt/numora
sudo env NUMORA_NODE_BIN="$(command -v node)" bash scripts/install-redis-failover.sh
```

Uji pemilihan cadangan tanpa mengganti env atau merestart service:

```bash
node /opt/numora/scripts/switch-redis.mjs test-auto
```

Mode ini mensimulasikan error limit pada Redis aktif dan menjalankan probe
SET/GET/DEL sungguhan pada cadangan. Harapkan hasil seperti
`[SIMULASI TANPA PERPINDAHAN] LULUS: backup-1 akan dipilih ketika limit terdeteksi.`
Nama menyesuaikan cadangan yang tersedia. Simulasi tidak membuktikan izin
restart, startup API/worker, atau jadwal timer; semuanya diperiksa terpisah.

Untuk uji penuh, lakukan ketika tidak ada sesi siswa/duel aktif karena koneksi
benar-benar dipindahkan dan API/worker direstart:

```bash
sudo systemctl start numora-redis-failover-test.service
sudo journalctl -u numora-redis-failover-test -n 60 --no-pager
systemctl is-active numora-api numora-worker
```

Unit uji memakai akun/grup, jalur Node/repo, sudoers dan prosedur peralihan yang
sama dengan watchdog. Ia menunggu lock bersama jika pemeriksaan lain masih
berjalan. Unit ini tidak di-enable dan tidak dipanggil timer; hanya berjalan
ketika diperintahkan secara eksplisit. Timer produksi tetap hanya memakai error
Redis sungguhan, tanpa flag simulasi atau variabel env yang dapat tertinggal.

Uji dianggap lulus jika journal memuat
`[UJI PERPINDAHAN NYATA] LULUS: perpindahan nyata ke backup-1 selesai.`,
kedua service kembali `active`, dan pemeriksaan timer selanjutnya menerima
command di Redis yang baru. Pengujian nyata tidak memulihkan primary secara
otomatis setelah sukses; gunakan perintah manual `primary` jika ingin kembali.
Jika semua cadangan gagal atau startup tidak sehat, hasil uji harus gagal;
pemulihan env mengikuti prosedur manual yang sama di atas.

Kedua mode uji menyimpan perubahan state limit/cooldown hanya dalam memori,
sehingga primary yang sebenarnya sehat tidak tercatat kehabisan kuota. Uji
tetap menghormati daftar endpoint yang benar-benar sudah habis dari state
produksi, tetapi mengabaikan cooldown hanya selama uji. Jangan melakukan load
test atau mengirim command massal untuk sengaja menghabiskan kuota.

## Verifikasi developer

```bash
node --test scripts/switch-redis.test.mjs scripts/redis-failover.test.mjs
bash -n scripts/install-redis-failover.sh
```

Pengujian lokal mencakup penolakan kandidat, kegagalan stop/write/start/health,
pemulihan gagal, konflik edit env, serta perlindungan kredensial pada error probe.
Pengujian tidak mengakses Redis atau systemd Production.
Tes failover mencakup error non-limit, urutan cadangan, semua cadangan habis,
cooldown, state rusak, error startup, dan penyimpanan state gagal.
