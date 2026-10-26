# Ferdi Admin FE — FD-01–FD-06

**ENGINEERING DECISION — owner-approved plan, 26 October 2026:** continue only Ferdi's Admin frontend, shared UI and frontend structure from `f337603` (PR #99). The latest joblist is `SE_JOBLIST_2026-10-19.md`, including its 20 October ownership correction. Backend, migrations, worker and academic policy remain with their domain owners. Admin accounts/invite/recovery and large P2 optimizations are deferred.

## Canonical inventory and reconciliation

| Capability                                                                      | Canonical source / contract                                                                                     | Classification and next action                                                                                                                    |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Internal login, portal and assignment-aware navigation                          | main `6ba9638`; identity/me; PR #99 `f337603` for transient identity recovery                                   | Keep. Add FE workspace invalidation; do not edit shared Auth.                                                                                     |
| Schools/status and teacher credential issue/reissue/revoke                      | main schools client and existing `/admin/schools` endpoints                                                     | Keep. Finish search, URL context, confirmation and credential cleanup.                                                                            |
| Operational user/class list/detail                                              | main operations client, generated DTOs                                                                          | Keep restricted readers. Preserve filters/detail in URL. Backend expansion waits for TG-02/Andi.                                                  |
| Upload-first Excel V5, mapping/provenance, upload history and resume            | main upload/import/package clients and generated DTOs                                                           | Keep canonical intake. Fix history page size and access recovery.                                                                                 |
| Generator/import/preview                                                        | main generator/package/preview contracts                                                                        | Keep. Invalidate loaded workspaces after access loss; no scoring in preview.                                                                      |
| Bank/materials/packages/revisions/archive/moderation/IRT status                 | main content workbench and generated contracts                                                                  | Keep. Separate panels without changing publication, historical pins or IRT rules.                                                                 |
| Admin full-stack foundation, accounts, richer readers and Content workspace     | PR #92, `feat/admin-workspaces-main-sync` at `a52b9db`; older local `feat/admin-content-workspace` at `d88054b` | Port only after owner handoff and canonical backend integration. PR #92 was OPEN/conflicting at audit. Never merge the old full branch over main. |
| Pagination totals, server report filters, materials search and shell breadcrumb | PR #100 at `94f2d63`                                                                                            | Existing work, awaiting integration/handoff. Do not rebuild totals/contracts or overwrite its workbench/filter changes.                           |
| Legacy package-first intake / incompatible academic behavior                    | historical branches/documents                                                                                   | Replace with current upload-first flow; defer conflicting domain changes to their owner.                                                          |

Public GitHub PR state was read during planning; refresh it before publishing. The current implementation does not merge either PR.

## Frontend permission matrix

| Actor                                            | Schools / operational readers      | Content / import / generator / preview | General audit |
| ------------------------------------------------ | ---------------------------------- | -------------------------------------- | ------------- |
| Active Super Admin                               | Yes                                | Yes, with CONTENT_MANAGE               | Yes           |
| Active Operations                                | Yes                                | No                                     | No            |
| Active Content/Data/Moderation                   | No operational PII/token workspace | Yes, with CONTENT_MANAGE               | No            |
| Null assignment, disabled, non-Admin, signed out | No                                 | No                                     | No            |

This matrix controls presentation only. NestJS remains authoritative. New limited readers/capabilities from TG-02 are not inferred from the old branch.

## Flow checklist

- Operations: school search/select → create/edit/status → issue/reissue/revoke → restricted user/class list/detail. Check URL reload/Back, retry, pending, logout/account switch and late responses. No Admin ban/unban.
- Content: upload/generator → preview/destination → mapping/validation → saved progress/draft → review/readiness/approval → Publish → revision/archive/moderation. Keep 30/20/10 counts, server blockers and PGK restrictions; no new approval or scoring policy.
- A 401/403 unmounts the workspace. Recovery requests identity again before remounting. Network failures retain the current input. Stale revisions must not silently overwrite edits.
- Shared: existing `@tka/ui` primitives are canonical; Admin pagination remains local. Keep Teacher/PvP colors and global tokens.

## Ownership and handoff

No active handoff has been received for PR #92/#100 or their backend work. Ferdi implements independent FE gaps. Tangguh owns TG-01–03 reconciliation, RBAC and content APIs; Andi owns school/identity/class rules; Nafi owns assessment contracts; Aini owns runtime/migrations. Avicenna reviews FE, Aini reviews integration, Reyhan owns independent Admin acceptance and RY-03 baseline E2E corrections. No messages or approval requests have been sent on their behalf.

Handoff must record task ID, old/new DRI, file area, branch/PR/SHA, sanitized repro, expected/actual behavior, environment, tests and remaining boundaries. Backend-dependent work remains BLOCKED by that handoff, not reassigned to Ferdi.

## Baseline evidence and completion gates

- Planning SHA `f337603`: 72/72 Admin component tests and 3/3 targeted fixture E2E passed. Full Admin E2E stopped after four failures from stale editor-opening and importer-heading assumptions. These are historical baseline results, not validation of the new changes.
- Baseline sizes: `content.tsx` 61,301 bytes; `content-import.tsx` 47,966 bytes; `numora.css` 204,714 bytes. Size motivates maintenance work; it does not prove slow runtime.
- Record new unit/browser checks, responsive screenshots, lint/typecheck/build, contracts and integration evidence on the final SHA below. Separate fixture, connected Development, Google OAuth, CI and independent QA evidence.
- No task is DONE until independent review and acceptance are recorded. Do not claim cloud activation, deployment or MVP release readiness.

## Implementation ledger

### Access / flow increment — `feat/ferdi-admin-finalization`

- FD-01 inventory above is prepared for review; TG-01 handoff is still pending.
- FD-02/03 independent FE changes: assignment/status gate before requests; unmount on 401/403; recovery waits for a newly checked profile; session/account/assignment changes discard workspace state. Existing API clients and generated contracts remain canonical.
- School search uses the complete existing list. URL keys are `schoolId`, `search`, `offset`, `tokenOffset`; Operations uses `view`, its existing filter names, `offset`, `userId`/`classId`. URL filters contain no credential. Back/Forward and reload restore the context. No new endpoint or handwritten response type.
- Upload history uses `ADMIN_PAGE_SIZE=5`. Tests preserve unsaved title/preview on 409, and close a loaded preview on 403.
- Current increment checks: Admin components 83/83, scoped Chromium E2E 10/10 at 320/390/768/1440, web TypeScript and targeted ESLint passed. Browser fixtures remain synthetic; no connected service or cloud mutation is implied.
- The new browser suite uses an isolated snapshot of the existing synthetic workbench, keeping the overlapping PR #100/RY-03 suite unchanged. Its historical failures still require QA handoff.

### FD-05 shared component catalogue

| Concern                              | Canonical implementation                                           | Consumers and action                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons, input/select, cards, badges | existing `@tka/ui` exports                                         | Admin, Student, Teacher, PvP: retain APIs and tokens; no new library.                                                                                |
| Modal confirmation and focus         | existing `Dialog`                                                  | Already used by Student, Teacher and PvP; Admin confirmation now composes it through local `AdminConfirmButton`, with pending/cancel/focus recovery. |
| Loading and empty/error presentation | existing `Skeleton`, `EmptyState`, feature-specific state wrappers | Reuse primitives; retain domain-specific messages and recovery instead of forcing one universal fetch/error component.                               |
| Pagination                           | local `AdminPagination` / `useAdminPagination`                     | School/token/upload/operational lists. Optional controlled offset supports URL state; fixed five-row policy stays out of shared UI.                  |
| Toast/notices                        | existing inline status/alert notices                               | No new toast system; retain durable actionable errors.                                                                                               |

There is no shared package API/token/shell change in this increment. Consumer implementation stays with its current owner. A separate shared-package migration is unnecessary until a concrete duplicate remains; consumer regression is still required for Admin CSS extraction.

### Documentation sources

Next.js is locked to 16.3.6. Context7 exposed versions only through 16.2.9 for this lookup. Its native History API guidance was cross-checked against the installed 16.3.6 documentation in `next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`. The URL helper uses native history and `popstate`, with an SSR snapshot that prevents unfiltered initial data requests during hydration.

### FD-04 component increment — `refactor/ferdi-admin-components`

- Workbench composition stays in `content.tsx`; report/history, packages, curriculum, and question/video panels move to adjacent feature modules. Shared editor fields and types stay local to Admin in `content-editor.tsx`.
- Upload source/history presentation moves to `content-upload-panels.tsx`; display labels have one local module. Intake state, request handlers, optimistic revisions, media receipts, selection/order, retry keys and resume remain in the parent. Existing preview/mapping primitives remain canonical.
- AST comparison against `14f4ab7` verified all 11 extracted function bodies unchanged. Admin component regression 83/83, web TypeScript and targeted ESLint passed. This increment changes no contract, permission or product rule. Large rewrites of the remaining intake orchestration are deferred.

### FD-06 CSS increment — `refactor/ferdi-admin-styles`

- Move the contiguous final section beginning `Internal content tools reuse Admin surfaces and assessment controls` from `numora.css` into `admin-content.css`. Root imports remain globals → numora → extracted Admin suffix → teacher, preserving the original order. Earlier shared/Admin shell rules remain in the composition stylesheet; no selector or asset was deleted.
- CSS AST comparison confirms identical order and values for 7,368 nodes. Eight school/content screenshots are pixel-identical before/after at 320/390/768/1440. Importer source/history was also checked at all four sizes. [Portable synthetic gallery](../design/screenshots/ferdi-admin/README.md).
- Final scoped Chromium check: 20/20 passed (14 Ferdi cases, 2 Student Home, 2 Teacher flow, 2 PvP). Separately, the existing upload suite passed 4 Drill/Pretest cases; 2 Tryout cases failed on legacy publication-label/indicator expectations. The current intake already uses `Publish sekarang` for immediate Tryout publication; that flow was not changed by these increments. RY-03/TG-03 must reconcile those expectations and any policy/document drift before full Admin acceptance. Tests were not skipped or edited to conceal this gap.

| File               | Baseline bytes | Measured bytes after extraction |
| ------------------ | -------------: | ------------------------------: |
| content.tsx        |         61,301 |                          26,456 |
| content-import.tsx |         47,966 |                          39,780 |
| numora.css         |        204,714 |                         189,345 |
| admin-content.css  |              — |                          14,764 |

This measures responsibility/file placement, not a runtime speed improvement. Total CSS rules and values are unchanged.

### Environment and remaining gates

The first `pnpm run ci` attempt passed script checks, 12 contract schemas, generated types and root lint, then failed in database typecheck with `FATAL ERROR: Zone Allocation failed - process out of memory`. C: also had approximately 290 MB free. Automatic approval review rejected recursive deletion of generated Next caches, including a narrower cache-only request. The non-destructive fallback compressed ignored, inactive Next outputs with Windows `compact`; no source, fixture, `.tmp`, account, schema or cloud data was deleted. Subsequent gates run serially to limit memory pressure.

All six packages remain pending independent review/acceptance. TG-01/02/03 handoff, expanded backend-dependent readers, legacy Tryout/browser alignment, connected Development/Auth/media/generator acceptance and production/release approval remain external gates. Account management/invite/recovery and large P2 refactors remain deferred. No cloud migration, seed, publication or deployment was performed.
