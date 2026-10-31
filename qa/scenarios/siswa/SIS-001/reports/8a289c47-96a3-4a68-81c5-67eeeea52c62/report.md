# SIS-001 — Siswa menyelesaikan Drill sampai hasil dan XP tersimpan

Run: 8a289c47-96a3-4a68-81c5-67eeeea52c62
Role: siswa · Profil: full
Mulai UTC: 2026-10-26T19:57:15.188Z
Selesai UTC: 2026-10-26T20:07:24.352Z
Waktu WIB: 27/10/2026, 02.57.15
Commit: 6ba9638c0a60469f1919e675e35d999f2dbde407 · Perubahan lokal: true
Fingerprint kode: 5e88d4e87d2c4c3b60064e29bc9286ebdd6aa2e219ec6f3d67b3eb031a80dbc4
Fingerprint aturan: d8c6cbd944730deb70449cda4797c695422b8d00f6231b1726fa4be99af2cbb2

**Hasil profil: BLOCKED**
**Penerimaan lengkap skenario: BLOCKED**

| Pemeriksaan | Status | Tes teramati | Jenis bukti | Keterangan |
| --- | --- | ---: | --- | --- |
| quality | PASS | 5 | static |  |
| rewards | PASS | 12 | isolated-unit |  |
| components | PASS | 29 | component |  |
| persistence | PASS | 1 | real-database |  |
| connected | PASS | 4 | connected-auth-fixture |  |
| accessibility | PASS | 3 | connected-auth-fixture |  |
| load | BLOCKED | 0 | benchmark | EXPERIMENT_INCOMPLETE_OR_SAFETY_STOP |
| volume | NOT_RUN | 0 | benchmark | RUN_INTERRUPTED_BEFORE_COMPLETION |
| velocity | NOT_RUN | 0 | benchmark | RUN_INTERRUPTED_BEFORE_COMPLETION |
| variety | NOT_RUN | 0 | benchmark | RUN_INTERRUPTED_BEFORE_COMPLETION |
| recovery | NOT_RUN | 0 | real-database | RUN_INTERRUPTED_BEFORE_COMPLETION |
| dependencies | NOT_RUN | 0 | static | RUN_INTERRUPTED_BEFORE_COMPLETION |
| manual-keyboard | NOT_RUN | 0 | manual | RUN_INTERRUPTED_BEFORE_COMPLETION |

## Batas kesimpulan
- Synthetic PG content and email auth fixtures; not Google login, academic content approval or staging acceptance.
- Local performance is a baseline with no approved production SLO; generator and application share one machine.
- Manual keyboard/UAT evidence is separate; automated accessibility is not a complete accessibility certification.
- Variety invalid-envelope rejection is contract/generator evidence; connected tests cover API input rejection.
- Recovery is local database/worker/transport rehearsal, not cloud failover, R2 recovery or production RTO/RPO.

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
- load: {"phases":[{"phase":"load","vus":[10,25,50,100],"completed":0,"integrityErrors":0,"duration":{"avg":0,"p(50)":0,"p(95)":0,"p(99)":0,"max":0},"errorRate":1,"throughput":47.471884776241275,"iterations":0}],"slo":"NOT_DEFINED"}

## Langkah berikutnya
- Periksa prasyarat/lingkungan: pnpm qa doctor --profile full
- Bagikan: pnpm qa share --scenario SIS-001 --run 8a289c47-96a3-4a68-81c5-67eeeea52c62
- Lihat konteks dan perubahan versi melalui pnpm qa status --role siswa.

