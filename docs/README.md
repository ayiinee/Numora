# Engineering Documentation Index

This directory contains the shared engineering context for the TKA Mathematics SMP platform.

Mulai dari [Product Context](product/PRODUCT_CONTEXT.md), [Open Decisions](product/OPEN_DECISIONS.md), dan [PRD Mapping](product/PRD_MAPPING.md). PRD v0.6 adalah baseline; [konteks varian/IRT v2 yang disetujui pemilik pada 8 November 2026](AI_IRT_V2_CONTEXT.md) menggantikan aturan yang bertentangan untuk distribusi Drill, Tryout, IRT dan adjustment. Acuan ini memuat sumber DOCX utuh, keputusan, OPEN dan gap implementasi kedua repo. Persetujuan desain tidak berarti fitur sudah aktif.

[PRD Drill v1.2](product/sources/PRD_01_Drill_Latihan_Soal.docx.md), [PRD TryOut v1.1](product/sources/PRD_02_Core_Learning_TryOut.docx.md), dan [rekonsiliasi 2 Oktober](product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md) tetap tersedia sebagai sumber historis; bukan pengganti baseline/amendemen terbaru. Ambang 70% pada Sprint 2 lama sudah digantikan oleh aturan ketuntasan 80%.

## Product

- [PRD Admin v1.0](product/ADMIN_PRD.md) — kebutuhan, workflow, izin, 81 acceptance criteria dan dependency substantif; atribut memakai sistem existing. [Arsip discovery](product/ADMIN_REQUIREMENTS_DISCOVERY.md) menyimpan ADM-DEC-001–076.
- `AI_IRT_V2_CONTEXT.md` — amendemen pemilik untuk varian/IRT v2, keputusan, OPEN dan audit implementasi kedua service.
- [Runtime IRT riset lokal](IRT_RESEARCH_RUNTIME.md) ? pipeline snapshot/transport/kalibrasi; [bukti dan acceptance yang belum tuntas](IRT_RESEARCH_ACCEPTANCE_V1.json). Nonaktif secara default dan belum disetujui untuk produksi.
- `product/PRODUCT_CONTEXT.md` — baseline PRD v0.6 dan amendemen pemilik terbaru.
- `product/PRD_MAPPING.md` — mapping from PRD sections/requirements to technical modules.
- `product/OPEN_DECISIONS.md` — unresolved PRD items, engineering recommendations, and blockers.
- `product/GLOSSARY.md` — canonical project vocabulary.
- `product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md` — perubahan sumber, TBC, traceability acceptance, dan gap implementasi.
- `product/sources/` — salinan utuh PRD Drill v1.2 dan TryOut v1.1 dari pengguna.

## Architecture

- [Spesifikasi Teknis Admin](architecture/ADMIN_TECHNICAL_SPEC.md) — route/API/field existing, state, versi data, transaksi, error, migrasi, gap implementasi dan rencana verifikasi.
- `architecture/ARCHITECTURE.md` — system architecture and responsibilities.
- `architecture/SYSTEM_CONTEXT.md` — external actors/systems and system boundaries.
- `architecture/MODULE_BOUNDARIES.md` — module decomposition and dependency rules.
- `architecture/DATABASE.md` — persistence model, invariants, and migration rules.
- `architecture/REALTIME_PVP.md` — PvP state, WebSocket responsibilities, and durability.

## API

- `api/API_GUIDELINES.md`
- `api/AUTHORIZATION.md`
- `api/IDEMPOTENCY.md`
- `api/CORE_LEARNING_FRONTEND_CONTRACT.md` — kontrak Drill, riwayat, dan infrastruktur Tryout; mencatat batas keputusan OPEN.
- `api/STUDENT_AREA_CONTRACT.md` — dashboard, PvP Socket.IO, leaderboard dan batas rilis OPEN.

## Data

- `data/QUESTION_CONTRACT.md`
- `data/EVENTS.md`
- `data/ANALYTICS.md`
- `data/IRT_INTEGRATION.md`
- [Knowledge varian soal dan IRT, 2 Oktober 2026](data/QUESTION_VARIANT_IRT_KNOWLEDGE_2026-10-02.md) - ringkasan PDF rancangan, konfigurasi OPEN, dan pemetaan sisa JOB-07; status PROPOSED, bukan approval policy.

## Design

- [Backlog UI/UX Admin, 30 Oktober 2026](design/ADMIN_UI_BACKLOG_2026-10-30.md) — prioritas, batas pekerjaan dan kriteria penerimaan setelah integrasi.
- `design/README.md` — status, provenance, and use of the UI/UX baseline.
- `design/NUMORA_UI_DESIGN_SYSTEM.md` — team-supplied visual, component, responsive, and accessibility guidance before final UI handoff.
- `design/NUMORA_UI_SKILL.md` — team-supplied frontend workflow reference, adapted to local document paths; not an installed agent skill.

## Development

- [Runtime/QA integration after Admin #110](development/RUNTIME_QA_INTEGRATION_2026-10-29.md) — canonical 0049, historical XP compatibility, exact Development history adoption and backup/rehearsal procedure.
- [Ferdi PR stabilization, 28 October 2026](development/FERDI_PR_STABILIZATION_2026-10-28.md) — current PR blockers, preserved integration path, XP review packet and separate #102 migration handoff.
- [Ferdi Admin integration, 26 October 2026](development/FERDI_ADMIN_INTEGRATION_2026-10-26.md) — PR #92 reconciliation, partial Tryout XP correction, isolated test evidence and remaining review gates.

- `development/PROJECT_STRUCTURE.md` — panduan utama lokasi kode, struktur folder saat ini dan yang direncanakan, serta contoh kerja lintas tim.
- `development/GETTING_STARTED.md`
- [Development startup verification](development/DEV_STARTUP_VERIFICATION.md) — source SHA, health/runtime/worker/probe evidence, service dependency audit and handoff, and owner-deferred teammate reproduction.
- `development/SPRINT_2_GOAL.md` — first Student vertical slice and additional Teacher UI needed for the prototype trial.
- `development/CORE_LEARNING_BACKEND_STATUS.md` — implementasi backend, bukti lokal, dan pekerjaan Core Learning yang tersisa.
- `development/STUDENT_AREA_IMPLEMENTATION.md` — integrasi desain siswa, migrasi PvP, verifikasi dan QA staging.
- `development/GIT_WORKFLOW.md`
- [CI diagnostics](development/CI_DIAGNOSTICS.md) — independent required jobs, aggregate quality gate, artifact handling and reproduction.
- [CI baseline and handoff, 27 October 2026](development/CI_BASELINE_2026-10-27.md) — historical main evidence and open feature failures, distinct from candidate validation.
- `development/CODING_STANDARDS.md`
- `development/ENVIRONMENTS.md`
- [Development recovery, 6 October 2026](development/DEV_SCHEMA_RECOVERY_2026-10-06.md) — historical schema-recovery evidence, API watcher fix, and later migration mapping; not a migration runbook.
- `development/ADMIN_CONTENT_DEMO_CLEANUP_2026-10-07.md` — pembersihan fixture Content pada Development, backup, data yang dipertahankan dan verifikasi reader kosong.
- `development/ADMIN_CONTENT_FUNCTIONAL_AUDIT_2026-10-07.md` — pemeriksaan seluruh halaman Content, perbaikan form/pagination/retry/akses, bukti tes dan gate eksternal.
- `development/ADMIN_OPERATIONS_FUNCTIONAL_AUDIT_2026-10-07.md` — pemeriksaan sekolah/credential/pengguna/kelas, perbaikan eligibility transaksi, detail/retry, navigasi dan pencabutan akses.
- `development/OWNERSHIP.md`
- [Temuan flow Guru, 20 Oktober 2026](development/TEACHER_GURU_FINDINGS_2026-10-20.md) — tiket GF-01..GF-04 dari polish FE Guru: kontrol ban/unban/takeover/leave tanpa jalur UI, undangan link yang belum masuk kontrak, dan ketidaksesuaian kontrak feedback/riwayat.

## Testing

- `testing/TEST_STRATEGY.md`
- `testing/QA_GUIDE.md`

## Security and privacy

- `security/SECURITY.md`
- `security/PRIVACY.md`

## Operations

- `operations/DEPLOYMENT.md`
- `operations/OBSERVABILITY.md`
- `operations/BACKUP_RESTORE.md`
- `operations/RELEASE_CHECKLIST.md`

## Architecture Decision Records

See `adr/README.md` and the individual ADR files.

## Status terminology

- **PRD RULE** — aturan eksplisit PRD terbaru untuk area terkait; v0.5 tetap baseline lintas fitur.
- **ENGINEERING DECISION** — approved during technical alignment.
- **PROPOSED** — recommendation pending approval.
- **OPEN** — unresolved product/academic decision.

- [Admin Content/Operations synchronization with main, 7 October 2026](development/ADMIN_MAIN_SYNC_2026-10-07.md) ? combined scope, migration compatibility and verification limits.
