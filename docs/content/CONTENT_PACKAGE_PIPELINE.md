> **ENGINEERING DECISION — 6 October 2026:** the owner-approved [V5 upload-first workflow](UPLOAD_FIRST_WORKFLOW.md) supersedes package-first UI and required source/code fields below. Existing parser contracts remain readable for new copies.

**ENGINEERING DECISION — 6 Oktober 2026:** [alur upload terbaru](EXCEL_UPLOAD_WORKFLOW_2026-10-06.md) menggantikan langkah manual JSON pada portal. Input baru hanya Excel; satu tombol Simpan menjalankan validasi/media/impor. API JSON tetap menjadi transport internal. Uraian ekspor/input JSON di bawah adalah konteks kompatibilitas historis.

# Directed question import and package readiness

**ENGINEERING DECISION — owner approved, 6 October 2026:** one upload targets one package and one assessment use (DRILL, PRETEST, TRYOUT). A question family retains that use across revisions. Cross-use copies require a new identity and an explicit source-question reference. Unclassified legacy content is retained, not inferred or silently republished.

**PRD RULE — v0.6 Final:** complete Drill/Pretest/Tryout packages contain 10/20/30 questions respectively. Drill is scoped to subchapter/level; Pretest to chapter. Curriculum owns academic distribution/blueprints.

Choose/create a draft package, download its V4 workbook, parse, inspect/edit/select/order, validate, verify R2 media, then atomically import questions and replace draft membership. Missing/excess questions do not prevent draft saving. Show additions/revisions/unchanged/removals first. Optimistic revision checks and operation idempotency protect concurrent edits/retries. Published packages and historical versions are never overwritten.

V4 uses the existing PG/MCMA/Kategori columns plus a Paket key/value sheet binding package UUID, family/version, use, curriculum scope, stable source namespace and demo flag. Source name/reference are required. Positive `no` values are unique across sheets. Legacy Excel/JSON can be inspected and explicitly converted after providing context/order; a mismatched V4 binding is never overridden.

Review records the authenticated content administrator, timestamp and notes after technical checks. Review does not grant academic validity by inference, publish imported versions, run IRT/scoring or alter XP. Readiness separates structure, verified media, scope, count, recorded review and publication requirements. Missing official blueprint validation, runtime rich-format/media compatibility and approved policy remain explicit blockers.

**OPEN:** official blueprint distribution/validation contract, PGK rubric and remaining scoring/release dependencies. The pipeline does not invent them. Demo examples are not approved curriculum.

QA: scoped template mismatch, taxonomy/use isolation including legacy manual APIs, global ordering, partial drafts, retry/conflict/rollback, R2 failure/receipt mismatch, review permissions and immutable history. Database tests use an isolated local test database. Live R2 is verified separately when credentials are available.
