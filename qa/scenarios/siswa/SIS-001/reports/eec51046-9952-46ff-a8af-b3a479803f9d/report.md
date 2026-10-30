# SIS-001 — Siswa menyelesaikan Drill sampai hasil dan XP tersimpan

Run: eec51046-9952-46ff-a8af-b3a479803f9d
Role: siswa · Profil: full
Mulai UTC: 2026-10-26T20:35:20.512Z
Selesai UTC: 2026-10-26T20:41:53.912Z
Waktu WIB: 27/10/2026, 03.35.20
Commit: 6ba9638c0a60469f1919e675e35d999f2dbde407 · Perubahan lokal: true
Fingerprint kode: 29dac911c2c190bb38e51a4bcb5b07b855089a3f9f067e110f5a4c2c2a12caec
Fingerprint aturan: 434dd4851b09db7632e1de035dda8b988936a21785f9201ffd17a8814ab2ee59

**Hasil profil: INCOMPLETE**
**Penerimaan lengkap skenario: INCOMPLETE**

| Pemeriksaan | Status | Tes teramati | Jenis bukti | Keterangan |
| --- | --- | ---: | --- | --- |
| quality | NOT_RUN | 0 | static | OUTSIDE_FOCUSED_QA_TOOLING_REGRESSION |
| rewards | NOT_RUN | 0 | isolated-unit | OUTSIDE_FOCUSED_QA_TOOLING_REGRESSION |
| components | NOT_RUN | 0 | component | OUTSIDE_FOCUSED_QA_TOOLING_REGRESSION |
| persistence | NOT_RUN | 0 | real-database | OUTSIDE_FOCUSED_QA_TOOLING_REGRESSION |
| connected | NOT_RUN | 0 | connected-auth-fixture | OUTSIDE_FOCUSED_QA_TOOLING_REGRESSION |
| accessibility | NOT_RUN | 0 | connected-auth-fixture | OUTSIDE_FOCUSED_QA_TOOLING_REGRESSION |
| variety | NOT_RUN | 0 | benchmark | OUTSIDE_FOCUSED_QA_TOOLING_REGRESSION |
| recovery | PASS | 6 | real-database |  |
| velocity | NOT_RUN | 0 | benchmark | OUTSIDE_FOCUSED_QA_TOOLING_REGRESSION |
| volume | NOT_RUN | 0 | benchmark | OUTSIDE_FOCUSED_QA_TOOLING_REGRESSION |
| load | PASS | 3 | benchmark |  |
| dependencies | NOT_RUN | 0 | static | OUTSIDE_FOCUSED_QA_TOOLING_REGRESSION |
| manual-keyboard | NOT_RUN | 0 | manual | OUTSIDE_FOCUSED_QA_TOOLING_REGRESSION |

## Batas kesimpulan
- Focused recovery and k6 regression after QA tooling correction; other checks are NOT_RUN in this version. Do not merge earlier PASS evidence into current acceptance.
- Uses unchanged application build from parent run and a new isolated clone with prior attempts; tests the revised QA tooling, not a new application build.
- Local baseline has no production SLO. Fixture authentication does not prove real Google OAuth or staging.
- Redis transport probe does not prove degraded API behavior or cloud failover. Manual review and 100k volume completion remain open.

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
- recovery: {"mode":"recovery","source":"direct-outbox-not-http","samples":[],"restoreDatabase":"numora_test_qa_eec51046995246ffa8afb3a479803f9d_recovery_restore","limitation":"Local worker/transport/database rehearsal only. Does not prove Google login, cloud failover, R2 restore, deployment rollback or production RTO/RPO."}
- load: {"phases":[{"phase":"load","vus":[10,25,50,100],"completed":1878,"integrityErrors":0,"duration":{"avg":441.44443121576234,"p(50)":330.6612,"p(95)":1255.312175,"p(99)":1991.5595700000017,"max":3354.3648},"errorRate":0,"throughput":82.06375693517415,"iterations":1878},{"phase":"stress","vus":[250],"completed":500,"integrityErrors":0,"duration":{"avg":2678.1934900319934,"p(50)":1938.9528,"p(95)":7091.707409999998,"p(99)":10101.350540000001,"max":10451.2908},"errorRate":0,"throughput":87.64163926582367,"iterations":447}],"reconciliation":{"graded":2378,"broken":0,"accepted":2378},"slo":"NOT_DEFINED","environment":"LOCAL_SHARED_GENERATOR_AND_SERVER"}

## Langkah berikutnya
- Lanjutkan verifikasi dalam run baru: pnpm qa run --scenario SIS-001 --profile full
- Bagikan: pnpm qa share --scenario SIS-001 --run eec51046-9952-46ff-a8af-b3a479803f9d
- Lihat konteks dan perubahan versi melalui pnpm qa status --role siswa.

