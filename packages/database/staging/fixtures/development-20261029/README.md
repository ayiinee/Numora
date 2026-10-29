# Audited mixed Development history

This is migration metadata and readable schema evidence, not a data dump. It contains no credentials, tokens, student data or scientific approvals.

The exact 62-row prefix was read from the documented Development sandbox on 29 October 2026. Existing business schema/data was exported with one consistent snapshot, restored to isolated PostgreSQL 17, and compared against a freshly migrated canonical database. Original SQL for four modern history hashes was unavailable; this fixture does not claim byte identity for those sources.

The bridge requires the exact prefix, canonical SQL hashes and matching column/default/constraint/index/policy/RLS catalogues for upload sessions and generator packages. CRLF aliases at 0033/0037 are proved from the canonical bytes. The old XP function must match the archived runtime SQL token sequence. The existing PvP trigger must have the known legacy `RETURN OLD` function and exact enabled BEFORE UPDATE OF status wiring; XP's immutable trigger, decimal columns and unique attempt index are checked separately.

Only after all checks pass does the runner append canonical adoption cursors, apply the policy-specific 0048 function, and replace the PvP function/revoke public execution from 0049 while retaining the inspected trigger. Existing history rows, import backfill, business data and policy pins are never rewritten or replayed. Extra/partial history and schema/function/trigger drift fail transactionally.

Use `development-history-bridge.integration.spec.ts` for synthetic success/replay and drift rejection. Actual backup and original-column digest evidence remain in restricted operator artifacts; rollout requirements and limits are in `docs/development/RUNTIME_QA_INTEGRATION_2026-10-29.md`.
