# SIS-001 — Siswa menyelesaikan Drill sampai hasil dan XP tersimpan

Run: d0cbc498-7faf-451f-a429-be68e441dd3e
Role: siswa · Profil: full
Mulai UTC: 2026-10-26T19:56:05.317Z
Selesai UTC: 2026-10-26T19:56:38.791Z
Waktu WIB: 27/10/2026, 02.56.05
Commit: 6ba9638c0a60469f1919e675e35d999f2dbde407 · Perubahan lokal: true
Fingerprint kode: 56e5fcb25d81dd2ef503e9e19f3b196b20cf9a221c502c309736f3ab96d1010f
Fingerprint aturan: d8c6cbd944730deb70449cda4797c695422b8d00f6231b1726fa4be99af2cbb2

**Hasil profil: INCOMPLETE**
**Penerimaan lengkap skenario: INCOMPLETE**

| Pemeriksaan | Status | Tes teramati | Jenis bukti | Keterangan |
| --- | --- | ---: | --- | --- |
| quality | NOT_RUN | 0 | static | PENDING |
| rewards | NOT_RUN | 0 | isolated-unit | PENDING |
| components | NOT_RUN | 0 | component | PENDING |
| persistence | NOT_RUN | 0 | real-database | PENDING |
| connected | NOT_RUN | 0 | connected-auth-fixture | PENDING |
| accessibility | NOT_RUN | 0 | connected-auth-fixture | PENDING |
| load | NOT_RUN | 0 | benchmark | PENDING |
| volume | NOT_RUN | 0 | benchmark | PENDING |
| velocity | NOT_RUN | 0 | benchmark | PENDING |
| variety | NOT_RUN | 0 | benchmark | PENDING |
| recovery | NOT_RUN | 0 | real-database | PENDING |
| dependencies | NOT_RUN | 0 | static | PENDING |
| manual-keyboard | NOT_RUN | 0 | manual | PENDING |

## Batas kesimpulan
- Synthetic PG content and email auth fixtures; not Google login, academic content approval or staging acceptance.
- Local performance is a baseline with no approved production SLO; generator and application share one machine.
- Manual keyboard/UAT evidence is separate; automated accessibility is not a complete accessibility certification.
- Variety invalid-envelope rejection is contract/generator evidence; connected tests cover API input rejection.
- Recovery is local database/worker/transport rehearsal, not cloud failover, R2 recovery or production RTO/RPO.
- HARNESS_INTERRUPTED: EPERM: operation not permitted, rename 'D:\Dev\Numora\qa\.local\sessions\49bb4b5a-6b9f-42ff-9b5d-0673f8f5f87a.json.tmp-8152b711-3c68-48f0-a4df-fd66ae8c6f88' -> 'D:\Dev\Numora\qa\.local\sessions\49bb4b5a-6b9f-42ff-9b5d-0673f8f5f87a.json'

## Pemeriksaan manual

## Keterlacakan
- TC-001: Save, offline retry, refresh, submit and reopen preserve the correct result → components, connected → sumber DRILL (required)
- TC-002: 70 fails mastery; 80 unlocks; latest zero never erases best/unlock → persistence, connected → sumber DRILL (required)
- TC-003: Student A/B, anonymous and wrong-role access are denied → connected → sumber AUTH (required)
- TC-004: Invalid input, premature results and locked levels are rejected → connected → sumber AUTH (required)
- TC-005: XP formula, rounding and 900-second boundaries → rewards, persistence, connected → sumber REWARDS (required)
- TC-006: Concurrent submit posts one result, XP and completion event; rollback is atomic → persistence, connected → sumber REWARDS (required)
- TC-007: Code quality and contract checks remain visible → quality → sumber WORKFLOW (required)
- TC-008: Supported viewports and automated accessibility → accessibility → sumber WORKFLOW (required)
- TC-009: HTTP load/stress produces measurable latency and reconciled accepted results → load → sumber WORKFLOW (required)
- TC-010: Volume preserves event identity/content at 1k, 10k and 100k → volume → sumber OUTBOX (required)
- TC-011: Velocity records incoming/processed rate, backlog and drain time → velocity → sumber OUTBOX (required)
- TC-012: Supported payload variety survives the worker; invalid generator envelopes are rejected by contract → variety → sumber EVENT (required)
- TC-013: Worker redelivery and DB/Redis transport recovery preserve durable data; local backup restores → recovery → sumber OUTBOX (required)
- TC-014: Dependency findings are recorded for triage → dependencies → sumber WORKFLOW (required)
- TC-015: Human keyboard and usability review → manual-keyboard → sumber WORKFLOW (required)

## Metrik eksperimen

## Langkah berikutnya
- Selesaikan checklist manual dan rekam bukti dengan pnpm qa manual.
- Bagikan: pnpm qa share --scenario SIS-001 --run d0cbc498-7faf-451f-a429-be68e441dd3e
- Lihat konteks dan perubahan versi melalui pnpm qa status --role siswa.

