# Payload snapshot PvP dan notifikasi worker

**ENGINEERING DECISION — 14 November 2026:** lanjutkan audit Q19/Q34 melalui
proyeksi kolom pada read berulang, dengan baseline `main` `7288b4b3`. Perubahan
ini terpisah dari PR performa sebelumnya dan mempertahankan interval scheduler,
kontrak respons serta transaksi bisnis.

## Perubahan

- Snapshot PvP mengambil tiga kolom soal aktif dan lima kolom versi yang
  benar-benar digunakan decoder: questionType, stem, optionsOrStatements,
  answerKey dan explanation. Kunci/pembahasan tetap tersedia untuk validasi
  server, dan tetap tidak dikirim ke klien. Answer lookup memilih answer saja;
  row yang ada tetap dibedakan dari tidak ada jawaban.
- Membership, row lock match, transaksi snapshot, player fields, timer, deadline,
  scoring dan `record_pvp_delivery` tetap dijalankan seperti sebelumnya. Tidak
  ada cache baru, perubahan exposure atau pemindahan otoritas ke Redis/klien.
- Worker membaca timestamp aktivasi SYSTEM_STARTED saja. Presentasi feedback,
  undangan PvP, level unlock, Tryout opened/result memilih kolom untuk judul,
  body dan context. Seluruh join dan predicate recipient existing dipertahankan.
- Outbox, audience cutoff, cursor, insert/dedup, lock SKIP LOCKED, source retry,
  release discovery dan atomicity tidak berubah. Paket tidak perlu membawa
  seluruh importSource/configuration hanya untuk judul notifikasi.

Tidak ada migrasi, environment baru, perubahan DTO/OpenAPI atau release policy.
PR ini mengurangi byte, bukan jumlah query/interval runtime.

## Pengukuran localhost

Suite memiliki database/migrasi dan login runtime non-owner/RLS sendiri. Proxy
menghitung respons PostgreSQL serta Execute/Query setelah koneksi dihangatkan.
Harness memakai satu koneksi; pool runtime tidak diubah. Clock engine tetap
di fixture, delivery/exposure dan seluruh trigger database tetap aktif.

| Read/cycle fixture                                        | Sebelum (`7288b4b3`) |    Sesudah | Query |
| --------------------------------------------------------- | -------------------: | ---------: | ----- |
| Snapshot PvP RUNNING, belum dijawab                       |           5.009 byte | 3.490 byte | 9 → 9 |
| Discovery notifikasi idle, tidak ada Tryout aktif/release |           1.512 byte | 1.037 byte | 4 → 4 |
| Drain satu batch notifikasi, importSource fixture 32 KiB  |          34.640 byte | 1.081 byte | 7 → 7 |
| Sweep PvP idle                                            |              77 byte |    77 byte | 1 → 1 |
| Drain notifikasi idle                                     |             412 byte |   412 byte | 3 → 3 |
| Sweep satu PvP aktif tanpa Redis/notify transport         |           2.731 byte | 2.731 byte | 6 → 6 |

Pengurangan fixture snapshot sekitar 30,3%; discovery idle 31,4%; presentasi
paket 96,9%. Besaran metadata sengaja dinyatakan agar pengurangan 32 KiB tidak
dianggap ukuran semua paket nyata. Variasi timestamp dapat mengubah satu byte.
Byte localhost tidak menyertakan TLS, Auth, startup koneksi atau respons HTTP.

Pada baseline, kedua batas payload snapshot dan paket gagal seperti yang
diharapkan. Skenario state/jawaban/deadline tetap lulus. Sesudah optimasi semua
tiga tes baru lulus, termasuk satu exposure per delivery, snapshot yang sama,
own answer versus peer, deadline ke soal berikut, scoring, nonmember rejection,
fan-out tiga siswa, cursor durable dan dedup replay.

## Pengukuran cloud read-only

[measure-runtime-read-payload.mjs](../../scripts/measure-runtime-read-payload.mjs)
membandingkan projection SQL pada snapshot `REPEATABLE READ READ ONLY` dan
memeriksa mode read-only. Statement timeout 10 detik, lock timeout 1 detik,
sampel maksimal 20 versi dan estimasi baseline 512 KiB per grup. TLS DSN
dipertahankan; hanya angka agregat/status dicetak.

| Konfigurasi                | Grup SQL                      | Sampel            | Byte TLS sebelum → sesudah |
| -------------------------- | ----------------------------- | ----------------- | -------------------------: |
| Development/Staging `.env` | Kolom versi untuk decoder PvP | 20 versi PG READY |            24.704 → 16.540 |
| Production `.env.prod`     | Kolom versi untuk decoder PvP | 20 versi PG READY |            24.391 → 16.388 |
| Development/Staging `.env` | ID/judul paket notifikasi     | 1 kandidat Tryout |                1.650 → 205 |
| Production `.env.prod`     | ID/judul paket notifikasi     | 1 kandidat Tryout |                1.650 → 205 |

Seluruh input decoder dan ID/judul sama sebelum/sesudah. Query tetap satu per
grup. Pengurangan grup versi sekitar 32,8–33,0%; paket sekitar 87,6%. Sampel
ini bukan pemilihan room atau event aktual, dan bukan endpoint lengkap/Usage.
Tidak ada isi soal, kunci, judul atau ID nyata yang ditulis ke log/repo.

**Jangan memanggil snapshot PvP atau worker discovery pada cloud sebagai
benchmark read-only:** snapshot mencatat delivery dan discovery dapat membuat
outbox. Pengukuran cloud di atas hanya SQL SELECT. Tidak ada fixture, publikasi,
exposure, migrasi, finalisasi atau mutasi bisnis cloud.

```powershell
node --env-file=.env scripts/measure-runtime-read-payload.mjs
node --env-file=.env.prod scripts/measure-runtime-read-payload.mjs
```

Pilih file environment secara eksplisit; DATABASE_URL dari shell tidak boleh
menimpa pilihan tersebut. Skrip tidak memuat environment atau koneksi migrator
secara otomatis.

## Evaluasi polling

[Scope notifikasi yang disetujui](../product/MATERIALS_NOTIFICATIONS_2026-10-04.md)
menetapkan worker lima detik; [runbook](MATERIALS_NOTIFICATIONS_RUNBOOK.md)
menetapkan polling yang sama dan source retry 30 detik. PvP memakai sweep satu
detik untuk memperbaiki job Redis yang terlewat, sedangkan reconnect 20 detik
tetap server-authoritative. Interval tersebut dipertahankan.

Pengukuran idle di atas membedakan frekuensi dan byte. Model kasar per proses:
`cycle/hari = 86400 / intervalDetik`; kalikan byte/cycle untuk model transfer
fixture, dan jumlah query/cycle untuk model calls. Ini bukan angka billing atau
bukti jumlah worker cloud. Periksa jumlah instance aktif dan SHA/config deploy
sebelum mengalikan; jumlah koneksi pool bukan jumlah instance.

Backoff/leader tambahan dan cache release/permission tidak dimasukkan tanpa
bukti workload serta evaluasi batas delivery/deadline. Main sudah mempunyai
busy guard per loop dan durable locking; duplikasi proses produksi belum
dibuktikan. Pengurangan scan/index perlu EXPLAIN, bukan diasumsikan mengurangi
egress ketika row/field hasil sama.

## Verifikasi dan rollout

29 tes API pada lima file lulus tanpa skip, mencakup tiga regresi baru, engine
PvP, deadline/late answer, 20-second reconnect/forfeit, restart recovery,
scheduler fallback serta delivery/authorization notifikasi. Enam tes worker
lifecycle juga lulus; provider Redis dimock pada suite lifecycle, bukan klaim
acceptance transport Redis langsung. Typecheck API/worker dan ESLint/Prettier
lulus; build keduanya diverifikasi sebelum PR.

```powershell
pnpm --filter @tka/api exec vitest run src/modules/pvp/runtime-read-payload.integration.spec.ts src/modules/pvp/pvp.flow.integration.spec.ts src/modules/pvp/pvp-recovery-clock.integration.spec.ts src/modules/pvp/pvp-scheduler.spec.ts src/modules/notifications/notifications.integration.spec.ts
pnpm --filter @tka/worker exec vitest run src/worker-runtime.spec.ts
pnpm --filter @tka/api typecheck
pnpm --filter @tka/worker typecheck
pnpm --filter @tka/api build
pnpm --filter @tka/worker build
```

Gunakan NODE_ENV=test dan TEST_DATABASE_URL localhost terpisah, kosongkan
DATABASE_URL/DATABASE_MIGRATION_URL cloud. Sesudah review/merge, deploy API dan
worker bersama agar kedua reader diperbarui. Pantau deadline/reconnect/error,
backlog notifikasi dan Usage pada trafik sebanding. Rollback melalui revert dan
redeploy; tidak ada data/schema yang perlu dipulihkan oleh PR ini.
