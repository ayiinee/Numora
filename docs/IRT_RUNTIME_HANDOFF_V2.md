# Runtime AI IRT: handoff prioritas 2

**ENGINEERING IMPLEMENTATION ? 10 November 2026.** Scope riset sintetis lokal.
Tidak mengaktifkan delivery, hasil canonical, fallback, publication atau XP.

## Baseline dan pin

- Payload `irt-calibration-v1`; transport `irt-calibration-service-v1`.
- Notification compute v3 hanya membawa request ID, input digest dan generation.
- Model/policy tetap `research/irt/policy-v1.json`, R mirt 1.48.
- Profil aktif tetap Windows-v4 dan Linux-v1; pilih eksplisit, bukan autodetection.
- Manifest image aktif: `research/irt-linux-image-v2.json`. Pin exact LF profile
  bytes; file v1 menyimpan commitment CRLF historis. JSON profil, image R dan
  image producer tidak diubah oleh revisi manifest ini.
- Runtime menolak source, dependency, platform atau image yang berbeda.
  Jangan regenerate pin saat startup atau memakai mutable image tag.

## Eksekusi lokal

Dari AI root, dengan checkout Main yang memuat harness prioritas 2:

```powershell
python -B tools/check_irt_handoff.py --main-repo ../Numora
python -B -m unittest tests.service.test_irt_handoff_pins -v
python -B tools/verify_irt_linux.py --main-repo ../Numora --delivery --output .scratch/irt-runtime-priority2
```

Harness membutuhkan Docker, image R/producer yang persis sesuai manifest,
PostgreSQL image terpin dan build database Main existing. Semua database,
container dan volume dibuat dengan nama unik lalu dibersihkan. Tidak membaca
`.env`, credential production atau data peserta asli. PostgreSQL disposable
memakai `max_locks_per_transaction=1024` untuk transaksi fixture canonical besar;
ini bukan migrasi atau rekomendasi konfigurasi database bersama.

Recipe Prioritas 1 digunakan tanpa sampler baru: small 2+2, dua arm 1000+1000
(seed 20261119), tiga arm 1000+1000+100 (seed 20261120). Grade sintetis dan pin
manifest dibuat di Main. Adapter Main membekukan snapshot dan PostgreSQL
menghitung inputDigest; contoh UNBOUND tidak dikirim langsung ke AI.
Truth simulator terpisah. Fixture approval tetap RESEARCH_ONLY dan disposable.

## Tanggung jawab dan status

Main memiliki manifest, grade, pseudonym, approval, outbox dan dispatch. AI HTTP
menerima notification dan membuat inbox idempoten; daemon membaca view input
terbatas. Worker tidak membaca identitas akun atau menulis tabel canonical.
R tidak mendapat credential database, network atau writable root filesystem.
Supervisor Docker socket adalah boundary trusted-host, bukan sandbox multi-tenant.

Status transport tetap ACCEPTED/RUNNING/SUCCEEDED/FAILED/EXPIRED. Data kurang
adalah SUCCEEDED dengan outcome INSUFFICIENT; linking tertahan tidak dianggap
DRIFT. Peserta tanpa observasi valid UNSCORABLE dengan score null. Salah/kosong
sah tidak otomatis UNSCORABLE. Tidak ada nilai fallback buatan AI.

Concurrency 1, heartbeat 15 detik, lease 60 detik, timeout 900 detik. HTTP ACK
diharapkan kurang dari 10 detik pada pengujian lokal. Maksimal tiga generation
hanya melalui otorisasi Main, dengan input/policy/seed/runtime yang sama.
Cancel, lease hilang, generation stale dan approval revoke menahan penyegelan.
Artifact sealed immutable dan diverifikasi Main tanpa adopsi nilai canonical.

## Penerimaan dan rollback

Laporan acceptance agregat mencatat pin, skenario, duration, eligible/fitted,
hasil/status peserta, digest artifact, replay dan pembersihan resource. Raw logs,
snapshot dan truth lokal tidak dikomit. Timing compute tidak mencakup seed/freeze
jika diberi nama notification-to-artifact. Hasil ini bukan sertifikasi kapasitas VPS
atau validasi psikometrik universal; threshold dan estimator tidak dilonggarkan.

Rollback: hentikan transport Main serta daemon AI dan nonaktifkan flag riset.
Pertahankan artifact immutable; jangan menghapus histori/migrasi atau mengubah XP.
Tidak ada deployment atau migrasi shared database pada prioritas ini.

Adopter/finalizer Main, approval akademik/policy produksi, delivery authoritative,
kapasitas host tujuan dan keputusan aktivasi tetap dependency tahap berikutnya.
Comparison, self-adjustment, anchor-v2 dan IRT Drill berada di luar cakupan.
