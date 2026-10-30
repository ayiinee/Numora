# Ferdi PR stabilization — 28 October 2026

**ENGINEERING DECISION — owner-authorized execution, 28 October 2026:** pause further Admin page redesigns, preserve the completed UI, audit the open PR stacks, and stabilize one integration branch before expanding scope. This records engineering integration, not Curriculum approval, Cloud rollout or release acceptance.

## Preserved source and integration path

- Working branch: `feat/ferdi-admin-integration`; UI checkpoint: `28f622a`.
- Backup: `backup/ferdi-before-pr-stabilization-20261028-28f622a`.
- Remote `main`: `6ba9638c0a60469f1919e675e35d999f2dbde407`, fetched and verified as an ancestor of the working branch. No unresolved index entries were present.
- Local merge `063dd2b` already reconciles PR #92 (`a52b9db`) with the Ferdi stack through #107 (`762ad57`). Subsequent commits retain the owner-approved Admin navigation, accounts, schools, people, content/assessment and Pretest UI.
- Use a new integration PR from this branch to `main`. Keep the existing PR heads intact. Do not push the full backend/UI integration onto #107's CSS branch or independently merge ancestors already present here.
- Older PRs remain open until the canonical integration is accepted and merged. Closing them as superseded is a later repository action; this document does not close, retarget, approve or merge them.

## GitHub audit

Read directly from GitHub's PR, review, check-run, workflow-job and ruleset APIs on 28 October 2026. These are point-in-time findings; recheck immediately before merging. `mergeable` describes Git's ability to combine the PR with its configured base, not functional correctness or approval.

| PR                                                 | Head                 | Configured base      | Observed blocker                                                                                            | Present in integration                   |
| -------------------------------------------------- | -------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| [#92](https://github.com/ayiinee/Numora/pull/92)   | `a52b9db`            | `main`               | Merge conflict; changes requested despite successful `quality`                                              | Yes                                      |
| [#99](https://github.com/ayiinee/Numora/pull/99)   | `f337603`            | `main`               | Mergeable; `quality` fails at Browser E2E                                                                   | Yes                                      |
| [#105](https://github.com/ayiinee/Numora/pull/105) | `111bcae`            | #99 branch           | Draft; mergeable; Browser E2E failure                                                                       | Yes                                      |
| [#106](https://github.com/ayiinee/Numora/pull/106) | `c1ba198`            | #105 branch          | Draft; mergeable; Browser E2E failure                                                                       | Yes                                      |
| [#107](https://github.com/ayiinee/Numora/pull/107) | `762ad57`            | #106 branch          | Draft; mergeable; Browser E2E failure                                                                       | Yes                                      |
| #72–76, #78–79, #89                                | Audited individually | Original Admin stack | All open/draft; #72 has a merge conflict with `main`; individual CI was not re-audited for this older group | Yes, each exact head is an ancestor      |
| [#102](https://github.com/ayiinee/Numora/pull/102) | `7f3313f`            | `main`               | Mergeable; changes requested; latest `quality` fails at Browser E2E                                         | No; separate backend/runtime integration |

The audit used commit ancestry, not matching titles or similar diffs, to establish containment. Closing a PR does not merge its code. If a squash merge is chosen later, commit ancestry will no longer prove that the old heads are in `main`; verify the accepted diff and integration PR before closing the old stack.

### Distinguish current failures from historical review

- [#92 review](https://github.com/ayiinee/Numora/pull/92#pullrequestreview-5597164896): fractional XP guard mismatch and `docs/README.md` conflict. Both have local corrections in `063dd2b`; GitHub's old head does not contain them. Passing [old-head CI](https://github.com/ayiinee/Numora/actions/runs/39229156308) did not cover the reported XP regression.
- [#99 CI](https://github.com/ayiinee/Numora/actions/runs/39423614488): eight Admin E2E failures, including pagination, shared portal/role navigation and Tryout upload workflow. The reviewer identified the same failures on `main`; they are not evidence of an auth retry regression. Build and OpenAPI freshness were skipped after E2E failed.
- [#107 CI](https://github.com/ayiinee/Numora/actions/runs/40332400062): stale Admin pagination selectors and later failures/global timeout; 11 failed scenarios were reported. Build and OpenAPI freshness were skipped. The local combined branch must run the complete browser suite, not only the original eight failing cases.
- [Latest #102 CI](https://github.com/ayiinee/Numora/actions/runs/40558462856), head `7f3313f`: backend tests, connected IRT and connected release-chain stages passed; Browser E2E reports eight Admin failures. Its 21 October review's transport-clock failure concerns an older head. Do not report that old failure as the current failing stage, or infer full release readiness from the passed intermediate stages.

Active `main` rulesets require `quality`, at least one approving review and code quality gates; the `main` ruleset also requires code-owner review. `.github/CODEOWNERS` names `@splakplutoy` and `@ayiinee`. The author cannot supply their own independent approval. No rule bypass is part of this plan.

## XP and migration review packet

**Review requested, not yet accepted:** the integration's forward migration `0048_tryout_partial_reward_guard.sql` replaces the guard for the pinned `TRYOUT_PGK_PARTIAL_V1` version 1 policy with `round(sum(awarded_points / max_points) * 10, 6)`. The finalizer uses the same PostgreSQL expression after persisted two-decimal item-point rounding. Other policy pins retain the existing category/ceiling calculation. Do not globally reinterpret older pins or rewrite results/ledger rows.

Review these files together:

- `packages/assessment-engine/src/tryout-finalizer.ts`
- `packages/database/drizzle/0048_tryout_partial_reward_guard.sql`
- `apps/api/src/modules/learning/tryout-partial-reward.integration.spec.ts`
- `packages/database/src/integrated-migrations.ts` and its tests
- [Existing integration and isolated migration evidence](FERDI_ADMIN_INTEGRATION_2026-10-26.md)

The HTTP regression covers XP `2.5`, `6.7`, `6.65`, `3.333333`, rounded item points, concurrent/idempotent submit, unauthorized submit, rejection of an incorrect ceiling, immutable ledger and IRT-gated results. The old SQL migrations `0000`–`0047` must retain their original Git blobs from #92; `0048` is forward-only.

### Separate #102 handoff

**PROPOSED integration order:** accept this canonical Admin chain first, then have #102's owner reconcile the runtime branch against it. Do not merge #102's existing migration journal wholesale. No #102 code, SQL or cloud migration is applied by this stabilization task.

Read-only `git merge-tree --write-tree HEAD origin/audit-pr-102` identified four textual conflicts:

1. `apps/api/src/modules/learning/drill-assessment.service.ts`
2. `apps/web/e2e-connected/release-chain.spec.ts`
3. `apps/web/src/features/core-learning/api.ts`
4. `packages/database/drizzle/meta/_journal.json`

The SQL file prefixes additionally collide semantically: #102's `0039_pvp_transient_queue_guard` / `0040_tryout_reward_decimal_guard` share journal positions with Admin `0039_admin_invitations` / `0040_admin_recovery_operations`. Git can add differently named files without reporting this as a text conflict. Both branches also define `drill_reward_guard()`; #102's current definition uses persisted points for every Tryout pin, whereas this integration deliberately preserves non-partial pins. Agree the supported policy behavior before generating the final forward migration and snapshot.

Against the present 49-entry chain, the runtime additions would start at the next free entries (currently `0049` onward); regenerate against the actual accepted head. Preserve already-applied SQL/hashes in any audited source environment. #102 includes runtime/Admin history reconciliation fixtures that must be reviewed with the existing Admin-fork bridge, not discarded during conflict resolution.

Required rehearsals for that later integration: clean database, existing canonical Admin database, audited Admin fork, audited #102 runtime history, rejection of unknown histories, retained historical rewards/results, final effective guard definition, PostgreSQL/Redis transport recovery and both connected chains. Do not execute this plan on the shared Development database merely to prove a merge.

## Ownership and review requests

The existing [ownership register](OWNERSHIP.md) remains authoritative. This packet requests collaboration; it does not claim another contributor has accepted an assignment.

| Work                                                        | Current execution / requested reviewer            | Required evidence                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Preserve and reconcile the Admin integration                | Ferdi (`@splakplutoy`)                            | Backup, exact source ancestry, unchanged historical SQL, local checks and canonical PR                 |
| Review finalizer/XP and later #102 migration reconciliation | Qurotul/Aini (`@ayiinee`), backend owner/reviewer | Policy-specific numeric equivalence, immutable history, agreed final migration order and final-head CI |
| Coordinate cross-branch order and team handoff              | Farel (PM; GitHub handle absent from register)    | One agreed merge path, no duplicate integration of old PR heads                                        |
| Independent acceptance and regression                       | Salim (`@Salim653`)                               | Acceptance on the accepted SHA and explicit real-service coverage                                      |

Do not guess Farel's GitHub account or send email/chat messages. The canonical PR body is the concrete review packet; named review requests and independent sign-off remain observable GitHub/team actions.

## Verification boundary

### Browser dependency acquisition in CI

Two attempts at head `509238a` reached successful tests and connected IRT, then spent multiple minutes downloading Ubuntu font/library packages from `azure.archive.ubuntu.com`. The second recorded 25.9 MB in 4 min 3 s (107 kB/s); the subsequent Chromium downloads were fast. Both were cancelled during installation, so neither is a passing full-quality result.

The workflow now prefers Ubuntu's official HTTPS archive in the runner's existing APT mirror list and limits the browser installation step to five minutes. Installation failures remain fatal; package signature verification, browser scenarios, business assertions and test timeouts are retained. This changes the disposable CI runner only. The [runner image's mirror configuration](https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/configure-apt-sources.sh) supplies the same official archive as its existing fallback; [upstream issue #14594](https://github.com/actions/runner-images/issues/14594) records the Azure-mirror stall class.

### Complete browser-suite coverage

The next attempt at `e4b39dd` completed both connected chains and browser installation (28 seconds), then reported 267 passing scenarios, three failures and 49 not run at the 900-second suite limit. The failures identified two Pretest selector races (clicking the first checkbox before the next page's content arrived) and a legacy Admin lifecycle test inside `student.spec.ts` that still expected desktop-only navigation and always-open forms. The corrected tests wait for the intended question identity and use the current responsive navigation, native disclosure/confirmation and assignment landing. Payload/order, authorization and lifecycle assertions remain intact.

The browser suite has grown from the configuration's original approximately 192 cases to 319. Its total budget is now 25 minutes, with 35 minutes for the complete quality job. The 90-second individual test limit, expectation timeouts, connected acceptance checks and all test cases are retained. This is CI workload allocation, not a product timer change; a final single successful run is still required.

Use logs under `D:/CodexCache/Numora-integration-20261026-762ad57/stabilization-*` for this run. Record actual results and the tested SHA in the canonical PR body. Interrupted memory-constrained attempts are not passing tests. Local lint, types, unit/integration tests, browser fixtures, connected service chains and GitHub `quality` are separate evidence.

All database writes in this task target disposable local PostgreSQL at `127.0.0.1:55442`, using `numora_test_stabilization_20261028` and the dedicated `numora_test_job06_stabilization` chain database. Redis uses dedicated localhost port `56379`. Test commands explicitly pin those service URLs; the connected harness also pins API/auth to localhost fixtures and PvP to its expected closed policy (`PVP_MODE=disabled`, strict content), regardless of local demo activation. Application environment loaders retain their existing behavior. No Cloud schema, data, credentials, email or external media is changed. Browser fixtures do not prove real Google OAuth/SMTP/R2 or academic/Data acceptance.
