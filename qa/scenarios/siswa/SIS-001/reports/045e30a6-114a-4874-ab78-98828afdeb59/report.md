# SIS-001 — Siswa menyelesaikan Drill sampai hasil dan XP tersimpan

Run: 045e30a6-114a-4874-ab78-98828afdeb59
Role: siswa · Profil: full
Mulai UTC: 2026-11-15T14:54:29.027Z
Selesai UTC: 2026-11-15T14:54:36.071Z
Waktu WIB: 15/11/2026, 21.54.29
Commit: 3262d8cbfe2c7f711a6f6377834168d8b032bc59 · Perubahan lokal: true
Fingerprint kode: 4e20cdf87aa71049ff94561eee76eb5ecb6b83f56d342e9deefe60698ef5610e
Fingerprint aturan: 9899f95853d90b6264a52cf7d5550b59b223b71b6939c2f28673632e696efa85

**Hasil profil: BLOCKED**
**Penerimaan lengkap skenario: BLOCKED**

| Pemeriksaan | Status | Tes teramati | Jenis bukti | Keterangan |
| --- | --- | ---: | --- | --- |
| quality | BLOCKED | 0 | static | CORE_TOOLCHAIN_NOT_READY |
| rewards | BLOCKED | 0 | isolated-unit | CORE_TOOLCHAIN_NOT_READY |
| components | BLOCKED | 0 | component | CORE_TOOLCHAIN_NOT_READY |
| persistence | BLOCKED | 0 | real-database | CORE_TOOLCHAIN_NOT_READY; LOCAL_TEST_SERVICES_NOT_READY |
| connected | BLOCKED | 0 | connected-auth-fixture | CORE_TOOLCHAIN_NOT_READY; LOCAL_TEST_SERVICES_NOT_READY; REDIS_7_NOT_READY |
| accessibility | BLOCKED | 0 | connected-auth-fixture | CORE_TOOLCHAIN_NOT_READY; LOCAL_TEST_SERVICES_NOT_READY; REDIS_7_NOT_READY |
| variety | BLOCKED | 0 | benchmark | CORE_TOOLCHAIN_NOT_READY; LOCAL_TEST_SERVICES_NOT_READY |
| recovery | BLOCKED | 0 | real-database | CORE_TOOLCHAIN_NOT_READY; LOCAL_TEST_SERVICES_NOT_READY; REDIS_7_NOT_READY; POSTGRES_BACKUP_TOOLS_NOT_READY |
| velocity | BLOCKED | 0 | benchmark | CORE_TOOLCHAIN_NOT_READY; LOCAL_TEST_SERVICES_NOT_READY |
| volume | BLOCKED | 0 | benchmark | CORE_TOOLCHAIN_NOT_READY; LOCAL_TEST_SERVICES_NOT_READY |
| load | BLOCKED | 0 | benchmark | CORE_TOOLCHAIN_NOT_READY; LOCAL_TEST_SERVICES_NOT_READY; REDIS_7_NOT_READY; K6_NOT_READY |
| dependencies | BLOCKED | 0 | static | CORE_TOOLCHAIN_NOT_READY |
| manual-keyboard | NOT_RUN | 0 | manual | HUMAN_KEYBOARD_AND_USABILITY_REVIEW_REQUIRED |

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
- Periksa prasyarat/lingkungan: pnpm qa doctor --profile full
- Bagikan: pnpm qa share --scenario SIS-001 --run 045e30a6-114a-4874-ab78-98828afdeb59
- Lihat konteks dan perubahan versi melalui pnpm qa status --role siswa.

