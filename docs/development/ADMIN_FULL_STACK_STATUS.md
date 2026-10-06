# Admin full stack — implementation and acceptance

Initial audit baseline: main f3f75b3. Current integration baseline: main fbb031b after PR #77, verified 6 October 2026. User authorization: implement Admin full stack and its required engine dependencies; fixed three subroles; internal email invitation; milestone delivery without a fixed date. Earlier division/ownership assignments do not restrict this authorized work. Academic approval and environment acceptance remain separate.

## Product and engineering boundaries

**PRD RULE:** PRD Numora v0.6 Final supersedes conflicting v0.5, Drill v1.2, TryOut v1.1 and Sprint assumptions. Admin may not ban/unban students or edit product formulas/results. Operations manages schools/teacher credentials and reads operational individuals. Content manages content/assessments/moderation/IRT, sees limited structures and aggregated students. Super Admin manages admin accounts and all admin domains.

**ENGINEERING DECISION — user-approved plan:** server-authoritative fixed role capabilities, current database assignment on every privileged request, scoped audit, isolated tab queries, durable invitation recovery, immutable content/policy/result pins. No public Admin signup, per-account permission override, credential exposure or scientific force release.

**PRD RULE:** students may have up to five active classes; leave/ban/takeover and nullable active teachers preserve history. Pretest uses 20 items and placement 0–7 → L1, 8–18 → L2, 19–20 → L3, without XP. Drill uses one variant, 10 items, >=80 unlock, latest stars (including zero), and final XP formula. Tryout uses 30 items, Monday 00:00–Sunday 23:59 WIB, batch-close auto-submit, one attempt, immediate XP and immutable result/explanation <=72 hours. PvP leaderboard is Top 10 plus self. These are rules, not evidence of implementation.

## Acceptance ledger

| Milestone | Engineering gate                                                                                         | External gate                                                   | Status                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| M0        | Current source reconciliation, action-level backlog and explicit dependencies                            | PO corrections below                                            | Documentation implemented                                              |
| M1        | HTTP/browser subrole matrix, revocation with existing token, scoped DTO/audit, independent tab failure   | Sandbox acceptance                                              | Engineering implemented; sandbox acceptance pending                    |
| M2        | Invite/replay/recovery/conflict, fixed assignment, last-Super concurrency, callback/password             | SMTP/templates/redirects, actual email                          | Engineering implemented; sandbox email/operator acceptance pending     |
| M3        | School address, credential used_by, teacher verification, affiliation/roster, limited structure          | Domain supplied by main; sandbox acceptance                     | Engineering implemented; sandbox acceptance pending                    |
| M4        | Rich review/revision/readiness/archive, verified media, historical report detail/filter/audit            | Approved Curriculum metadata, R2 credentials/CORS               | Engineering implemented; sandbox storage/Curriculum acceptance pending |
| M5        | Published policy selectors, retry, zero/latest stars, rich consumer, batch-close finalization, unique XP | Approved scoring/precision/blueprints; Pretest Student consumer | Pending                                                                |
| M6        | Existing IRT request UI, publication contract, aggregate analytics, release evidence                     | Data compute/mapping/fallback, independent QA                   | Pending                                                                |

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
