# Admin Content and Operations - main synchronization

**ENGINEERING UPDATE - 7 October 2026.** User-authorized consolidation of the Admin full-stack foundation, Content workspace (PR #89), and Operations workspace/functionality with main. This PR includes the still-unmerged foundation PRs #72-#79: it cannot be reviewed or deployed as a presentation-only change. Latest integrated main: `fe01103` (PR #93), including compact Student empty cards and the owner-approved Chapter 3 Drill allowlist and bounded grading/reward exception; other packages retain approved-policy/rubric gates. Source branch `feat/admin-content-workspace` and backup branch are retained. Existing PRs are not closed or merged by this operation.

## Integration decisions

| Area                 | Preserved behavior and conflict resolution                                                                                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role boundaries      | Database-backed current assignment/status, fixed three subroles, restricted operational DTOs, scoped audit and direct HTTP denial. No Admin ban/unban.                                                                                                                                              |
| Content workspace    | Role-scoped LTE layout, no Content summary/analytics/header banners, independent queries and denied-state clearing, immutable content review/revision/media/history.                                                                                                                                |
| Operations workspace | Matching role-scoped layout, no Operations summary/analytics/header banners, school/credential detail and safe single-use eligibility, users/classes/rosters, filter/history navigation and stale detail rejection.                                                                                 |
| New main content     | Excel templates/parser, directed package namespaces, import metadata/classification, package review and Pretest Student consumer remain available. Package import confirmation and lifecycle review share one validated route with explicit alternative request bodies; mixed payloads fail closed. |
| Pagination           | Main's five-row pagination applies to visible admin lists. Cursor APIs use their server cursor; other lists read one sentinel row. Editing state survives page changes.                                                                                                                             |
| Student/engine       | Main Student home, typed ordered autosave, reviewed answer state and Pretest/PvP routes remain. Rich content/media is integrated into those renderers. Approved policy/rubric pins, latest/best Drill distinction, zero stars, unique XP and batch deadlines remain server-authoritative.           |
| Tryout release       | Canonical published batch/finalization and participant values determine result visibility. Execution success alone never releases results. Production raw scores and UNSCORABLE results do not bypass the gate. Historical fixture-only legacy release remains scoped to demo packages.             |
| Shared styles        | Main shared palette/new Student styles retained; Content and Operations opt into their own scoped workspace styles.                                                                                                                                                                                 |
| Schema               | Main migration SQL/history retained; Admin migrations appended with identical SQL hashes. No destructive history backfill or Cloud schema write performed in this synchronization.                                                                                                                  |

## Migration compatibility

The canonical main migration prefix `0000`-`0030` is unchanged. Admin branch migrations are appended as follows; SQL bytes/hashes remain identical to the original branch.

| Published Admin branch tag                  | Canonical appended tag                      |
| ------------------------------------------- | ------------------------------------------- |
| `0028_admin_invitations`                    | `0031_admin_invitations`                    |
| `0029_admin_recovery_operations`            | `0032_admin_recovery_operations`            |
| `0030_content_revision_guard`               | `0033_content_revision_guard`               |
| `0031_historical_report_context`            | `0034_historical_report_context`            |
| `0032_assessment_policy_approval`           | `0035_assessment_policy_approval`           |
| `0033_partial_reward_provenance`            | `0036_partial_reward_provenance`            |
| `0034_admin_authored_package_pins`          | `0037_admin_authored_package_pins`          |
| `0035_pretest_blueprint_approval`           | `0038_pretest_blueprint_approval`           |
| `0036_legacy_package_fixture_compatibility` | `0039_legacy_package_fixture_compatibility` |

The normal integrated migrator recognizes only the known published Admin fork (canonical prefix and known hashes/timestamps), uses the existing exclusive transaction lock, applies missing main DDL and records the canonical cursor for already-applied Admin hashes without replaying their DDL or rewriting old history rows. Unknown histories fail before mutation. Rehearsal fixture: `packages/database/staging/fixtures/admin-stack-branch`; it is not an alternate deployment command.

For an isolated Development rollout: verify environment identity, take a database backup, run the normal `db:migrate` from the reviewed branch, then `db:check` and acceptance on the exact SHA. This synchronization has rehearsed fresh installs and known fork upgrades only on disposable localhost PostgreSQL. It has not migrated the user's Cloud database.

## Verification and acceptance

PR #92 consolidates this work against main `fe01103`. Verification below distinguishes local checks, connected CI and environment acceptance. Local database checks use a disposable localhost database, never the existing Cloud environment. Browser E2E uses a fixture API/Auth provider; it is separate from connected integration and Cloud acceptance. Tests and builds certify engineering compatibility, not final academic or environment acceptance.

The Pretest Student consumer now exists in main; remaining Pretest gates concern approved blueprint/rubric pins and consumer/environment acceptance, not an absent frontend. Curriculum approvals, Data/AI respondent producer/mapping/fallback evidence, real SMTP/invite delivery, R2/CORS and independent sandbox QA remain external gates. No demo reseeding, credential rotation or live email/media write is included.

### Recorded local checks

- Canonical migration SQL byte comparison: all 31 main files and nine original Admin files identical; unknown migration histories fail closed.
- PostgreSQL: 52/52 database tests, including 18 migration/history scenarios; schema check 112 expected tables/columns and RLS; normal upgrade and historical Staging bridge checks pass. No additional DDL generated from the merged snapshots.
- API: 256 tests discovered, seven Redis-dependent scenarios skipped locally. Initial full run: 248 passed, one 5-second broadcast timeout. Notification suite rerun with CLI `--testTimeout=30000`: 9/9 passed, unchanged assertions. Publisher/content-preview/Chapter 3 regression: 28/28 passed. Connected CI supplies PostgreSQL and Redis coverage.
- Worker: 17/17 tests passed. Assessment engine: 21/21 tests passed. Script checks: 68/68 passed; eight JSON schemas validate; OpenAPI and generated types fresh.
- Root lint/typecheck passed; production web, API and worker builds passed. Web: 321/321 tests passed after aligning the main contracts. Browser: 63/64 Admin scenarios passed initially; the Excel hydration timeout passed an isolated rerun with the same assertions (25.8 seconds), giving all 64 scenarios covered. Final counts are recorded in the PR evidence.
- First combined browser runs exposed stale fixture menu/capability names, the old 20-row roster cursor and unbound JSON import; these fixtures now follow server capabilities and main's five-row/directed import contracts. A cold development hydration timeout passed in the isolated rerun without changing the expectation. Fixture browser success is not Cloud Auth/R2/email acceptance.

Admin runtime code baseline for these checks: `9291f530a8274dc856c6e7b32dadd1c16c1a5e4d`. Main PR #93 was then merged at `f13d0cf`; root lint/typecheck and the isolated Excel browser rerun passed after that merge. Subsequent evidence-only documentation commits do not change runtime code. CI and final browser results for the PR head must be checked on GitHub; do not infer approval or deployment from this ledger.

### Merge preparation

CI run `37546155211` on `39e9e5b` passed contracts, lint, typecheck, tests, connected IRT and the connected release chain, but browser E2E finished with 226 passed and one failed. The Mandiri Tryout result fixture omitted the required `options` field consumed by the shared explanation renderer; the server already supplies that field. The fixture now includes the actual attempt options and uses `satisfies TryoutResultDto` to enforce the generated contract. The unchanged browser scenario passed locally (1/1), with web typecheck and formatting passing. A new head CI is required before merge; this fixture correction changes no production behavior or Cloud data.

Main subsequently advanced to `b508da0` (PR #95). The integration retains its opt-in DEMO PvP content mode and notice, imported option-wrapper compatibility and tests, alongside all Admin changes. The three context-document conflicts retain both Admin and PvP decisions. Contracts and generated types pass after this merge; final head CI remains the merge gate.
