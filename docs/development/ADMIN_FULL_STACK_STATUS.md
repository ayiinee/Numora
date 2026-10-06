# Admin full stack — implementation and acceptance

**ENGINEERING UPDATE — 7 October 2026:** Operations functional fixes cover transactional credential eligibility against school deactivation, PATCH validation, literal school search, retryable fresh school detail, URL/history filters, and clearing cached identities/credentials on access changes. See [Operations functional audit](ADMIN_OPERATIONS_FUNCTIONAL_AUDIT_2026-10-07.md). Local connected tests and browser fixtures do not close sandbox acceptance.

**ENGINEERING UPDATE — 7 October 2026:** Content functional fixes cover independent Tryout question pagination, Pretest edit/create state and reference retry, JSON envelope namespaces, retained server filters and clearing cached detail on target/access changes. See [functional audit](ADMIN_CONTENT_FUNCTIONAL_AUDIT_2026-10-07.md) for page coverage and test evidence. External gates in the ledger remain open.

**ENGINEERING EVIDENCE — 7 October 2026:** the owner requested deletion of persisted Content demos from the isolated Development database. Materials/question readers are now empty; related demo packages and test attempts were removed after backup and rehearsal. Three non-fixture drafts, six unrelated upload sessions and all accounts/schools/classes/memberships remain. This environment cleanup does not change milestone acceptance or product rules. See [cleanup evidence](ADMIN_CONTENT_DEMO_CLEANUP_2026-10-07.md).

Initial audit baseline: main f3f75b3. Current integration baseline: main fbb031b after PR #77, verified 6 October 2026. User authorization: implement Admin full stack and its required engine dependencies; fixed three subroles; internal email invitation; milestone delivery without a fixed date. Earlier division/ownership assignments do not restrict this authorized work. Academic approval and environment acceptance remain separate.

## Product and engineering boundaries

**PRD RULE:** PRD Numora v0.6 Final supersedes conflicting v0.5, Drill v1.2, TryOut v1.1 and Sprint assumptions. Admin may not ban/unban students or edit product formulas/results. Operations manages schools/teacher credentials and reads operational individuals. Content manages content/assessments/moderation/IRT, sees limited structures and aggregated students. Super Admin manages admin accounts and all admin domains.

**ENGINEERING DECISION — user-approved plan:** server-authoritative fixed role capabilities, current database assignment on every privileged request, scoped audit, isolated tab queries, durable invitation recovery, immutable content/policy/result pins. No public Admin signup, per-account permission override, credential exposure or scientific force release.

**PRD RULE:** students may have up to five active classes; leave/ban/takeover and nullable active teachers preserve history. Pretest uses 20 items and placement 0–7 → L1, 8–18 → L2, 19–20 → L3, without XP. Drill uses one variant, 10 items, >=80 unlock, latest stars (including zero), and final XP formula. Tryout uses 30 items, Monday 00:00–Sunday 23:59 WIB, batch-close auto-submit, one attempt, immediate XP and immutable result/explanation <=72 hours. PvP leaderboard is Top 10 plus self. These are rules, not evidence of implementation.

## Acceptance ledger

**ENGINEERING UPDATE — 6 October:** the owner requested a Content-role UI/UX iteration after the permission correction. Task guidance, readable review, deep links and responsive presentation are documented in the [Content UX report](../design/ADMIN_CONTENT_UX_2026-10-06.md). This presentation update does not close the external gates below.

| Milestone | Engineering gate                                                                                         | External gate                                                   | Status                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| M0        | Current source reconciliation, action-level backlog and explicit dependencies                            | PO corrections below                                            | Documentation implemented                                                |
| M1        | HTTP/browser subrole matrix, revocation with existing token, scoped DTO/audit, independent tab failure   | Sandbox acceptance                                              | Engineering implemented; sandbox acceptance pending                      |
| M2        | Invite/replay/recovery/conflict, fixed assignment, last-Super concurrency, callback/password             | SMTP/templates/redirects, actual email                          | Engineering implemented; sandbox email/operator acceptance pending       |
| M3        | School address, credential used_by, teacher verification, affiliation/roster, limited structure          | Domain supplied by main; sandbox acceptance                     | Engineering implemented; sandbox acceptance pending                      |
| M4        | Rich review/revision/readiness/archive, verified media, historical report detail/filter/audit            | Approved Curriculum metadata, R2 credentials/CORS               | Engineering implemented; sandbox storage/Curriculum acceptance pending   |
| M5        | Published policy selectors, retry, zero/latest stars, rich consumer, batch-close finalization, unique XP | Approved scoring/precision/blueprints; Pretest Student consumer | Engineering implemented; policy, consumer and sandbox acceptance pending |
| M6        | Existing request UI, scientific adoption, published participant readers, aggregates and release evidence | Approved respondent producer/mapping, Cloud and independent QA  | Engineering implemented; producer contract and acceptance pending        |

Every milestone must include updated OpenAPI/generated types, migrations where required, tests of critical behavior/authorization, UI loading/error/empty/denied, lint/typecheck/build and review. Fixture and CI success do not establish Cloud acceptance.

## Decisions still requiring owners

**ENGINEERING DECISION - Product resolved in PR #77:** Tryout XP x10 and ceil-once rounding, Drill nearest-integer final XP, no expiry for new Drill explanations, and PG/MCMA/Category product weights 2/3/3 are approved. Partial credit contributes to Drill mastery and equivalent-correct XP. Tryout XP fallback and whole-batch result fallback have separate triggers. **OPEN:** exhaustive PGK rubric/full-correctness evidence, Drill score precision before stars and ordinary-result fallback formula/mapping remain academic dependencies. Reuse the canonical reward engine and preserve immutable legacy pins; do not reopen resolved formulas or backfill rewards.

**OPEN — Curriculum:** approved bank, taxonomy/indicator/difficulty, Pretest distribution, MCMA wrong-option treatment, B=4 case, rubric version and blueprint. Counts/mapping already final in v0.6 are not reopened.

**OPEN — Data/AI:** approved ordinal inputs, respondent result contract, mapping, quality gates, complete pipeline/repository version, fallback rules and labels. The externally supplied Scoring v1.0 remains Draft for approval, as confirmed by the user. No forced resultReleasedAt or fake grades.

**OPEN — environment:** SMTP/template/redirect setup, server-only Auth credentials, private R2 credentials/CORS and sandbox acceptance. Verify target before migrations or account/media writes. Local development does not use Docker or real-user staging.

**Separate backlog chosen by user:** full Pretest Student lifecycle and non-Admin UI. Membership/leave/ban/takeover is supplied by main PR #77 and remains owned by that domain; Admin readers integrate its durable state and retain no ban/ownership mutations.

## Release evidence

Record SHA, environment, commands, passed/failed/skipped counts and limits of each check. Migrations are committed and rehearsed before cloud application; no destructive history backfill. Product readiness requires the applicable external gates, not just the engineering milestone.

### M2 initial local evidence (pre-PR #77; rerun required)

Account provisioning is implemented on `feat/admin-accounts`, stacked on M1. New `/admin/accounts`, `/admin/auth/confirm`, and `/admin/recovery` flows consume the generated account/invitation contracts. Migrations 0028/0029 grant only the main server role access to durable invitation/recovery operations. The existing operator assignment script now shares the last-Super transaction lock; a separate verified-identity bootstrap/emergency command and [runbook](ADMIN_ACCOUNTS_RUNBOOK.md) are provided.

Local verification: 18 API tests passed (five dedicated PostgreSQL scenarios, five provider boundary scenarios, eight direct HTTP permission scenarios); 15 portal/account UI tests passed; three Chromium account scenarios passed, including retry key preservation, Operations direct-route denial, expired invite and 320/1440 px overflow checks. API/web typecheck and root lint passed. PostgreSQL was a temporary localhost-only test cluster; Auth and email delivery were fixtures. No Cloud account, email or schema was changed. Real SMTP/template/redirect acceptance, operator execution and independent QA remain open.

The GitHub connector returned `403: Resource not accessible by integration` and the local CLI was unauthenticated. The existing authenticated GitHub browser session subsequently allowed draft PR creation: M0 [#72](https://github.com/ayiinee/Numora/pull/72), M1 [#73](https://github.com/ayiinee/Numora/pull/73), M2 [#74](https://github.com/ayiinee/Numora/pull/74), M3 [#75](https://github.com/ayiinee/Numora/pull/75). These are stacked, unmerged review deliverables; creating a PR does not establish review or acceptance.

### M3 initial local evidence (pre-PR #77; rerun required)

Operations now has paginated/searchable schools with addresses, credential lifecycle and identified consumer, individual verification/affiliation and membership history, and active/former class rosters. A class remains visible when its recorded Teacher is no longer verified. Separate limited school/class endpoints explicitly project structure/count fields; Content receives neither individual identities nor credentials. Readers support multiple membership records without implementing the separate class lifecycle.

Privileged responses carry the fresh database subrole. The portal discards a response from a changed assignment and clears previously loaded data before refreshing identity, including when the next request is still permitted.

Local verification: 209 web tests and 50 Chromium Admin/Auth scenarios passed, including Operations and limited Content at 320/1440 px. The dedicated PostgreSQL Operations integration scenario passed, covering address/credential consumer, affiliation, historical membership, roster, unverified Teacher and exact limited fields. Eight direct HTTP authorization scenarios passed with fresh-role response assertions; the browser access-change test passed. API/web typecheck and root lint passed. Auth/browser services remained fixtures; PostgreSQL remained localhost-only. No Cloud data or schema was changed. SMTP, R2, scientific acceptance and independent QA remain separate gates.

### M4 initial local evidence (pre-PR #77; rerun required)

Imported PG/MCMA/Category versions now expose detail, readiness, audited READY/REVISION/ARCHIVED review and immutable revision lineage. Revision requests pin their source version and preserve idempotency across retries. Active package references block archive/revision; old preview and attempt pins remain readable. The browser uses reserve–PUT–complete with upload progress and completion retry, retaining only VERIFIED durable asset references. Report queues have server filters and pagination; question detail resolves the historical attempt item, and new video reports retain a target snapshot. Legacy video reports explicitly label current metadata. Report resolution can link a revision in the original lineage and records its reason.

Migrations 0030/0031 were rehearsed on localhost-only PostgreSQL, including main/compute role isolation, imported payload immutability and report-context guards. Verification: 213 web tests; 52 Chromium Admin/Auth scenarios (29 admin/account/operations/content plus 23 Auth); 16 dedicated content-chain and two report HTTP/PostgreSQL scenarios passed. `pnpm run ci` passed (script/contract checks, lint, typecheck, disconnected tests and build); database/Redis suites in that invocation were skipped because connected test URLs were absent. Auth, storage and browser APIs remain fixtures. No Cloud schema, media or account was changed. Approved metadata, actual R2/CORS, email and independent QA remain open.

### M5 initial implementation and local evidence (pre-PR #77)

Editorial assessment publication now selects supported published policies with immutable approval evidence. Drill enforces one MVP variant and ten reviewed items, replaces the active package atomically and supports retry of the same package. Latest zero-star attempts are separate from best statistics. Tryout publication validates thirty items, Jakarta weekly windows, duration/policy pins and durable batch cutoff/72-hour due time. API reads/saves and recovery use the earlier persisted deadline or batch close, including legacy attempts. Finalization persists points, ordinal category, omission and full correctness, and writes unique XP in the same transaction, independently of IRT. There are no default academic rounding or partial-credit rules.

The Student consumer uses generated PG/MCMA/Category answer contracts, safe rich text and owned signed media access. Active responses exclude keys/explanations. Review uses historical content pins. Pretest has draft/edit, twenty-item review, family revisions/replay, archive, approved-blueprint selection and readiness, but production publish remains blocked by the separate Student consumer and unresolved Curriculum blueprint.

Local evidence includes 218 web tests, 15 connected worker tests, four engine policy/runtime tests, and two new Chromium scenarios (Pretest at 320/1440 px and MCMA/Category Student saves at 320 px). The publisher PostgreSQL suite covers first-attempt zero stars, latest/best, unique XP, package replacement, immutable pins, Pretest review/revision replay, weekly Tryout publication, batch-close race, media ownership/phases, partial approval rejection and the restricted main database role. A separate approved-rubric fixture proves weighted MCMA/Category partial credit and ordinal/full-correctness separation. Fixtures are labeled TEST ONLY and are not academic acceptance.

`pnpm run ci` reached successful contract/script checks, lint, typecheck, tests and production build against localhost PostgreSQL. That invocation ran 156 API tests with seven environment-dependent scenarios skipped; dedicated Redis-connected API/worker verification is recorded separately. Full Admin/Auth browser regression and the final connected API run are in progress before PR handoff. No Cloud schema, email, media or academic policy was changed. Scientific package-quality gates were preserved, rather than manufactured by editorial review.

### PR #77 integration - M5

Current main domain/reward/notification implementations are preserved. Canonical PG policies have exact source-backed approval checks; richer policies cannot override fixed XP or 2/3/3 product weights. One canonical ledger write retains immutable reward pins and notification transactions. Tryout rounding uses PostgreSQL numeric ordinal facts and applies ceil once; historical null reward pins remain legacy without backfill. Migration snapshots were regenerated after canonical 0027; original applied 0024/0025 and main 0026/0027 are unchanged. Local engine 11 tests and publisher/learning 7 scenarios passed after integration. Final connected/Cloud acceptance is tracked separately.

### M6 implementation and acceptance boundary

The [IRT/analytics contract](../api/ADMIN_IRT_ANALYTICS.md) records the request selector, immutable pins, prepare/retry/adoption, distinct scientific/execution/publication states, SLA/blockers, scoped durable aggregates and published participant readers. The worker closes completed batches with a single outbox event. Snapshot v2 distinguishes collection deadline from late grading while retaining actual finalization time and frozen historic inputs. History now reads posted XP and persisted stars. No fallback/scale formula or publication bypass was introduced.

Historical pre-PR #77 local serial CI checks passed: 169 API tests, 15 worker tests, 24 database tests, 221 web tests, four engine tests, two orchestration tests and 68 script checks, plus contract freshness, lint, typecheck and production builds. QA Admin provisioning and canonical upgrade/Staging-bridge fixture checks also passed against localhost only. The initial parallel test run had web fork-startup timeouts; sequential execution passed without relaxing assertions. The connected operator fixture was corrected to Super Admin for its cross-domain flow and propagated through M1?M5. Final browser/connected completion is recorded separately in the ignored `.tmp/admin-final-evidence.json`, connected artifacts and GitHub checks; require an exact matching SHA. This paragraph alone does not establish release acceptance. Three new Chromium scenarios passed at 320/1440 px, including operation-key replay, scientific PASS without publication, SLA blockers, valid zero versus unavailable and Operations direct-route denial. The new integration scenarios use the restricted main/compute database roles and explicit TEST ONLY academic/fallback evidence. No Cloud data/schema/email/media was changed. M6 is not marked fully accepted: the approved respondent producer and mapping contract, actual sandbox acceptance and independent QA remain open.

See [independent QA scenarios and owner handoffs](ADMIN_QA_HANDOFF_2026-10-06.md). M5 is draft [#78](https://github.com/ayiinee/Numora/pull/78), stacked on M4; all milestones remain unmerged.

M6 is draft [#79](https://github.com/ayiinee/Numora/pull/79), stacked on M5. The [QA handoff](ADMIN_QA_HANDOFF_2026-10-06.md) records concrete independent scenarios and external owners.

### Integrated local verification after PR #77

The implementation tree at `0a560c8` passed serial connected tests: 192 API, 16 worker, 26 database, 231 web, 11 assessment-engine and two IRT-orchestration tests, plus 68 script checks. The nine direct HTTP permission scenarios include fresh assignments, disabled accounts and scoped analytics. QA Admin provisioning, canonical upgrade and the historical Staging-bridge fixture passed on disposable localhost databases. Fresh migrations through 0036 and the full snapshot chain were verified; canonical 0024-0027 are unchanged. Contract validation/freshness, lint and typecheck passed. The six stale fixture expectations encountered during integration were corrected to current authorization, scoped audit and published item pins; assertions and server guards were retained.

This documentation commit does not change runtime behavior. Final clean-SHA built API/worker, browser and CI evidence is recorded separately in ignored `.tmp/admin-final-evidence.json` and connected artifacts, which must match the tested commit. Earlier interrupted or pre-integration browser evidence is historical. SMTP/email, private R2, Curriculum approval, respondent producer/mapping, Pretest Student consumer and independent sandbox QA remain concrete release gates. No Cloud schema, accounts, email or media were changed.

### Permission correction — 6 October 2026

**PRD RULE:** Content/Data/Moderation retains limited school/class views and aggregate Student data under §3.3. Operational management and individual rosters belong to Operations/Super; all Admin subroles remain denied Teacher ban/unban. See the [current permission matrix](../api/ADMIN_PERMISSION_MATRIX.md).

**ENGINEERING DECISION:** the Content view is explicitly labelled “baca saja”, with credential status counts and no management actions. All roles receive Student affiliation/activity aggregates; Operations no longer queries or receives IRT request failure diagnostics. Content audit masks non-Admin actor identifiers, including actor filters. School affiliation counts use the same active-membership predicate as identity. Existing subrole assignments were verified read-only; none were changed.

Local regression evidence: 27 focused API tests including real isolated PostgreSQL operational/audit/aggregate readers, 236 web tests, five Chromium scenarios with direct-route denial and 320/1440 px checks, contract validation/generated-type freshness, lint, workspace typecheck and production build. Browser Auth/API remain synthetic fixtures. The immediate membership-exit fixture now uses database timestamps to avoid JavaScript millisecond truncation violating PostgreSQL microsecond chronology; constraints remain enforced. No migration, Cloud data mutation or academic-policy change is part of this correction. Independent review and external acceptance remain separate gates.
