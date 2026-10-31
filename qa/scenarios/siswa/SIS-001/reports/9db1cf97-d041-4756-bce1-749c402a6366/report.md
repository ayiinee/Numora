# SIS-001 — Siswa menyelesaikan Drill sampai hasil dan XP tersimpan

Run: 9db1cf97-d041-4756-bce1-749c402a6366
Role: siswa · Profil: standard
Mulai UTC: 2026-10-27T03:36:35.358Z
Selesai UTC: 2026-10-27T03:49:11.593Z
Waktu WIB: 27/10/2026, 10.36.35
Commit: 6ba9638c0a60469f1919e675e35d999f2dbde407 · Perubahan lokal: true
Fingerprint kode: bb756c57ced4a4c19c5b14195598d4964b98c94cf6a0097d51ca67180f54a495
Fingerprint aturan: dd250eb713669c464b1a9a59bcac1c89141fb5b6a5d65ccdb7313841103eb524

**Hasil profil: PASS**
**Penerimaan lengkap skenario: INCOMPLETE**

| Pemeriksaan | Status | Tes teramati | Jenis bukti | Keterangan |
| --- | --- | ---: | --- | --- |
| quality | PASS | 5 | static |  |
| rewards | PASS | 12 | isolated-unit |  |
| components | PASS | 29 | component |  |
| persistence | PASS | 1 | real-database |  |
| connected | PASS | 4 | connected-auth-fixture |  |
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
- Lanjutkan cakupan: pnpm qa run --scenario SIS-001 --profile full
- Bagikan: pnpm qa share --scenario SIS-001 --run 9db1cf97-d041-4756-bce1-749c402a6366
- Lihat konteks dan perubahan versi melalui pnpm qa status --role siswa.

