# Kontrak area siswa

**ENGINEERING UPDATE — 6 October 2026:** [JOB-16/17](../development/PVP_LEADERBOARDS_JOB16_17.md) supersedes historical pending-PvP and proposed tie rules in this document. Server-only activation defaults disabled; initial DEMO matches and mode-separated Best Poin use the published policy. Class/global activity uses posted Drill/Tryout account XP, Top 10 + self and dense rank. Generated contracts include per-difficulty availability, active-room recovery, `periodId`, authorized period listing, mode/rank provenance and update/stale metadata. Official activation still requires Curriculum approval; local fixture E2E is separate from staging sign-off.

Status 1 Oktober 2026. **ENGINEERING DECISION:** tampilan prototipe dipindahkan ke `/student`; semua data produk melewati NestJS. Route pratinjau lama dihapus dan mengembalikan 404 tanpa redirect.

## Dashboard dan akses

`GET /api/v1/students/me/dashboard` hanya menerima Student aktif melalui Bearer Google/Supabase. Identitas siswa selalu berasal dari token, tidak dari parameter klien.

Respons mencakup `displayName`, `affiliation`, `class` (id/nama/sekolah atau null), `completedLevels`, `availableLevels` (jumlah level READY dengan induk READY), `latestDrillScore`, `bestDrillScore`, lima `activities`, `activeDrill`, dan `features`. Nilai yang belum ada adalah null. Skor terbaik/terakhir dihitung dari hasil Drill historis siswa, bukan XP.

**PRD RULE:** skor Tryout pada aktivitas tetap null dengan `waitingIrt` sampai aturan rilis IRT terpenuhi. Dashboard menggunakan service riwayat yang sama dengan Penilaian. Jawaban/kunci tidak dikembalikan pada dashboard.

**ENGINEERING DECISION — JOB-07 tahap pertama, 2 Oktober 2026:** `features.tryout: true` untuk seluruh Student aktif, baik Mandiri maupun Sekolah. Field ini menyatakan hak akses fitur; tidak menyatakan paket sudah tersedia atau siswa boleh membuat attempt kedua. Gunakan state/`eligible` dari [current-package contract](CORE_LEARNING_FRONTEND_CONTRACT.md#tryout-and-penilaian--generic-lifecycle-implemented) untuk availability dan aksi start/resume/result. Pretest dan leaderboard kelas tetap mengikuti eligibility masing-masing.

**ENGINEERING DECISION:** layout siswa melakukan gate role dan menyediakan satu QueryClient per ID siswa. Logout/perubahan akun membuang cache; token tidak menjadi bagian query key. Gabung kelas menginvalidasi query dan memperbarui identitas. Alur Drill tetap memakai save/clear/resume/submit serta hasil asesmen umum yang sudah tersedia.

## PvP REST

| Endpoint                           | Respons / otorisasi                                                    |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/v1/pvp/availability`     | Student aktif; `available`, `reasonCode`, `message`                    |
| `GET /api/v1/pvp/classmates`       | Teman sekelas aktif, hanya ID/nama; Mandiri mendapat daftar kosong     |
| `GET /api/v1/pvp/invitations`      | Undangan milik siswa yang belum kedaluwarsa dan pengirim masih sekelas |
| `GET /api/v1/pvp/matches/:matchId` | Snapshot/hasil milik pemain; siswa lain ditolak 403                    |

**OPEN-07:** provider kebijakan produksi bernilai null. Create, join, ready/start, answer, invite, dan respons undangan ditolak `409 PVP_POLICY_OPEN`. Tidak ada environment flag, route, atau kontrol browser untuk mengaktifkan fixture pada akun nyata. Kebijakan fixture hanya diinjeksi dari tes.

## WebSocket

**ENGINEERING DECISION:** Socket.IO namespace `/pvp`, handshake `auth.authorization = "Bearer <access token>"`. Setiap command mengautentikasi ulang Student dan memeriksa kepemilikan/keanggotaan. Origin mengikuti `CORS_ORIGINS`.

Envelope memiliki `event`, `eventVersion: "1"`, UUID `requestId`, `sentAt` ISO, dan `payload`. Nama event tanpa prefix tambahan. Struktur lengkap: `packages/contracts/websocket/pvp-events.schema.json`; tipe frontend dihasilkan dari schema tersebut.

Commands: `room:create`, `room:join`, `player:ready`, `answer:submit`, `match:reconnect`, `room:leave`, `room:cancel`, `invitation:send`, `invitation:respond`. Callback acknowledgement memakai envelope `command:acknowledged` dengan `{ok:true,state,response}` atau `{ok:false,error:{status,code,detail}}`. `room:error` juga dikirim untuk kegagalan. Putus koneksi menghasilkan `player:disconnected`; transisi menggunakan `room:state`, `match:started`, `question:started`, `question:resolved`, `match:completed`, `match:forfeited`, `match:cancelled`, dan `invitation:received`.

Snapshot `room:state` dipersonalisasi: hanya pilihan jawaban pemain sendiri; kunci/pembahasan dan email tidak dikirim. Timer browser hanya visual berdasarkan `serverTime` dan `deadlineAt`; klien tidak mengirim waktu/skor. Request ID create, answer dan invite dilindungi persistence; jawaban pertama tidak dapat diganti.

**PRD RULE:** 10 soal identik; waktu 30/45/60 detik sesuai kesulitan; benar `100 + floor(50 × remaining / duration)`, salah/kosong 0. Pergantian setelah dua jawaban atau deadline. Reconnect 20 detik; forfeit/cancel tidak menghasilkan rekor leaderboard.

**PROPOSED, fixture tes saja:** room 600 detik, undangan 60 detik, dua pemain putus bersama berakhir cancellation. Nilai ini tidak menjadi kebijakan produk. Room/readiness expiry dan dual disconnect tetap menunggu OPEN-07.

**ENGINEERING DECISION:** satu instance API; PostgreSQL menyimpan setiap transisi/jawaban/versi/hasil dan outbox dalam transaksi dengan row lock. Redis menyimpan cache dan BullMQ delayed jobs; sweep PostgreSQL memperbaiki job hilang. Saat restart, pertandingan aktif dibatalkan tanpa kemenangan; gangguan penjadwalan membatalkan pertandingan dengan `SERVICE_INTERRUPTED`. Jangan menjalankan dua instance API PvP sebelum ada rancangan ownership/adapter dan tes failover.

## Leaderboard

- `GET /api/v1/leaderboards/pvp?difficulty=easy|medium|hard`: top 20 dan `ownEntry`, termasuk posisi di luar top 20. Best points dari pertandingan FINISHED/COMPLETED/recordEligible saja, terpisah per kesulitan dan periode.
- `GET /api/v1/leaderboards/class`: kelas ditentukan oleh keanggotaan aktif, Mandiri mendapat `403 CLASS_REQUIRED`.
- Respons: identitas minimum (ID/nama), points/rank, unit, periode WIB, updatedAt, policyPending/reasonCode. Tidak memuat email atau riwayat pertandingan pemain lain.
- **OPEN-11:** kelas mengembalikan `policyPending:true`; tidak ada XP otomatis atau formula asumsi. PvP mengembalikan policyPending selama OPEN-07 belum ditutup.
- **PRD RULE:** worker memperbarui proyeksi tiap jam; interval Kamis 00:00 WIB sampai batas eksklusif Kamis berikutnya, mencakup Rabu 23:59. Proyeksi lama direkonsiliasi sebelum diarsipkan, termasuk periode yang terlewat saat worker berhenti. PvP tidak masuk ledger/proyeksi kelas.
- **PROPOSED:** peringkat seri kompetisi `1,1,3`; perlu review sebelum rilis leaderboard.

OpenAPI berada di `packages/contracts/openapi/openapi.json`. Setelah perubahan DTO: `pnpm openapi:generate`, `pnpm contracts:pvp`, `pnpm contracts:types`, lalu validasi/check generated types.

## Pengaruh PRD Core Learning terbaru

[Drill v1.2 / TryOut v1.1](../product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md) mengubah policy asesmen yang dikonsumsi dashboard/history: TryOut gratis semua siswa, 35 soal/tiga format, status processing sampai released IRT ≤3×24 jam setelah batch end, dan released score immutable. XP tetap menunggu formula; threshold bintang/retensi Drill juga TBC. Class leaderboard masih memerlukan kelas dan tidak otomatis tersedia bagi Mandiri karena akses TryOut gratis. Tidak ada kontrak PvP/leaderboard atau generated types yang berubah melalui pembaruan docs ini.
