# SIS-001 — Siswa menyelesaikan Drill sampai hasil dan XP tersimpan

Run: 24399c07-9188-4db1-93cd-fe93ea4ec5ea
Role: siswa · Profil: quick
Mulai UTC: 2026-10-26T20:45:20.009Z
Selesai UTC: 2026-10-26T20:46:04.894Z
Waktu WIB: 27/10/2026, 03.45.20
Commit: 6ba9638c0a60469f1919e675e35d999f2dbde407 · Perubahan lokal: true
Fingerprint kode: 4e098254e3222862670490cd391c5ce6d9109175a4fd1fb0736eee323ae03ff7
Fingerprint aturan: 30fcd486e899fd090dee008c65aa078035f766de86b131d44f78de9585af3812

**Hasil profil: PASS**
**Penerimaan lengkap skenario: INCOMPLETE**

| Pemeriksaan | Status | Tes teramati | Jenis bukti | Keterangan |
| --- | --- | ---: | --- | --- |
| quality | PASS | 5 | static |  |
| rewards | PASS | 12 | isolated-unit |  |
| components | PASS | 29 | component |  |
| persistence | NOT_RUN | 0 | real-database | OUTSIDE_SELECTED_PROFILE |
| connected | NOT_RUN | 0 | connected-auth-fixture | OUTSIDE_SELECTED_PROFILE |
| accessibility | NOT_RUN | 0 | connected-auth-fixture | OUTSIDE_SELECTED_PROFILE |
| variety | NOT_RUN | 0 | benchmark | OUTSIDE_SELECTED_PROFILE |
| recovery | NOT_RUN | 0 | real-database | OUTSIDE_SELECTED_PROFILE |
| velocity | NOT_RUN | 0 | benchmark | OUTSIDE_SELECTED_PROFILE |
| volume | NOT_RUN | 0 | benchmark | OUTSIDE_SELECTED_PROFILE |
| load | NOT_RUN | 0 | benchmark | OUTSIDE_SELECTED_PROFILE |
| dependencies | NOT_RUN | 0 | static | OUTSIDE_SELECTED_PROFILE |
| manual-keyboard | NOT_RUN | 0 | manual | OUTSIDE_SELECTED_PROFILE |

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

## Langkah berikutnya
- Selesaikan checklist manual dan rekam bukti dengan pnpm qa manual.
- Bagikan: pnpm qa share --scenario SIS-001 --run 24399c07-9188-4db1-93cd-fe93ea4ec5ea
- Lihat konteks dan perubahan versi melalui pnpm qa status --role siswa.

