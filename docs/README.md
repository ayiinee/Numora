# Engineering Documentation Index

This directory contains the shared engineering context for the TKA Mathematics SMP platform.

Untuk Core Learning, [PRD Drill v1.2](product/sources/PRD_01_Drill_Latihan_Soal.docx.md) dan [PRD TryOut v1.1](product/sources/PRD_02_Core_Learning_TryOut.docx.md), diberikan pada 2 Oktober 2026, menjadi sumber terbaru. Lihat [rekonsiliasi perubahan](product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md). PRD v0.5 (28 September 2026) remains the cross-feature baseline, as confirmed by the Software Engineering coordinator on 28 September 2026. The PDF still carries its earlier “draft for review” label; the source PDF was supplied outside this repository and is not yet committed here. The summaries below do not replace the complete PRD. The supplied Sprint 2 Goal PDF is also external; its older 70% threshold has been superseded by the approved PRD's 80% rule.

## Product

- `product/PRODUCT_CONTEXT.md` — aturan PRD fitur terbaru dan baseline lintas fitur v0.5.
- `product/PRD_MAPPING.md` — mapping from PRD sections/requirements to technical modules.
- `product/OPEN_DECISIONS.md` — unresolved PRD items, engineering recommendations, and blockers.
- `product/GLOSSARY.md` — canonical project vocabulary.
- `product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md` — perubahan sumber, TBC, traceability acceptance, dan gap implementasi.
- `product/sources/` — salinan utuh PRD Drill v1.2 dan TryOut v1.1 dari pengguna.

## Architecture

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

- `design/README.md` — status, provenance, and use of the UI/UX baseline.
- `design/NUMORA_UI_DESIGN_SYSTEM.md` — team-supplied visual, component, responsive, and accessibility guidance before final UI handoff.
- `design/NUMORA_UI_SKILL.md` — team-supplied frontend workflow reference, adapted to local document paths; not an installed agent skill.

## Development

- `development/PROJECT_STRUCTURE.md` — panduan utama lokasi kode, struktur folder saat ini dan yang direncanakan, serta contoh kerja lintas tim.
- `development/GETTING_STARTED.md`
- `development/SPRINT_2_GOAL.md` — first Student vertical slice and additional Teacher UI needed for the prototype trial.
- `development/CORE_LEARNING_BACKEND_STATUS.md` — implementasi backend, bukti lokal, dan pekerjaan Core Learning yang tersisa.
- `development/STUDENT_AREA_IMPLEMENTATION.md` — integrasi desain siswa, migrasi PvP, verifikasi dan QA staging.
- `development/GIT_WORKFLOW.md`
- `development/CODING_STANDARDS.md`
- `development/ENVIRONMENTS.md`
- `development/ADMIN_CONTENT_DEMO_CLEANUP_2026-10-07.md` — pembersihan fixture Content pada Development, backup, data yang dipertahankan dan verifikasi reader kosong.
- `development/ADMIN_CONTENT_FUNCTIONAL_AUDIT_2026-10-07.md` — pemeriksaan seluruh halaman Content, perbaikan form/pagination/retry/akses, bukti tes dan gate eksternal.
- `development/ADMIN_OPERATIONS_FUNCTIONAL_AUDIT_2026-10-07.md` — pemeriksaan sekolah/credential/pengguna/kelas, perbaikan eligibility transaksi, detail/retry, navigasi dan pencabutan akses.
- `development/OWNERSHIP.md`

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
