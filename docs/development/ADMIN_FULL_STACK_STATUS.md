# Admin full stack — implementation and acceptance

Initial audit baseline: main f3f75b3. Current integration baseline: main fbb031b after PR #77, verified 6 October 2026. User authorization: implement Admin full stack and its required engine dependencies; fixed three subroles; internal email invitation; milestone delivery without a fixed date. Earlier division/ownership assignments do not restrict this authorized work. Academic approval and environment acceptance remain separate.

## Product and engineering boundaries

**PRD RULE:** PRD Numora v0.6 Final supersedes conflicting v0.5, Drill v1.2, TryOut v1.1 and Sprint assumptions. Admin may not ban/unban students or edit product formulas/results. Operations manages schools/teacher credentials and reads operational individuals. Content manages content/assessments/moderation/IRT, sees limited structures and aggregated students. Super Admin manages admin accounts and all admin domains.

**ENGINEERING DECISION — user-approved plan:** server-authoritative fixed role capabilities, current database assignment on every privileged request, scoped audit, isolated tab queries, durable invitation recovery, immutable content/policy/result pins. No public Admin signup, per-account permission override, credential exposure or scientific force release.

**PRD RULE:** students may have up to five active classes; leave/ban/takeover and nullable active teachers preserve history. Pretest uses 20 items and placement 0–7 → L1, 8–18 → L2, 19–20 → L3, without XP. Drill uses one variant, 10 items, >=80 unlock, latest stars (including zero), and final XP formula. Tryout uses 30 items, Monday 00:00–Sunday 23:59 WIB, batch-close auto-submit, one attempt, immediate XP and immutable result/explanation <=72 hours. PvP leaderboard is Top 10 plus self. These are rules, not evidence of implementation.

## Acceptance ledger

| Milestone | Engineering gate                                                                                         | External gate                                                   | Status                                                             |
| --------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| M0        | Current source reconciliation, action-level backlog and explicit dependencies                            | PO corrections below                                            | Documentation implemented                                          |
| M1        | HTTP/browser subrole matrix, revocation with existing token, scoped DTO/audit, independent tab failure   | Sandbox acceptance                                              | In progress                                                        |
| M2        | Invite/replay/recovery/conflict, fixed assignment, last-Super concurrency, callback/password             | SMTP/templates/redirects, actual email                          | Engineering implemented; sandbox email/operator acceptance pending |
| M3        | School address, credential used_by, teacher verification, affiliation/roster, limited structure          | Class lifecycle remains separate backlog                        | Pending                                                            |
| M4        | Rich review/revision/readiness/archive, verified media, historical report detail/filter/audit            | Approved Curriculum metadata, R2 credentials/CORS               | Pending                                                            |
| M5        | Published policy selectors, retry, zero/latest stars, rich consumer, batch-close finalization, unique XP | Approved scoring/precision/blueprints; Pretest Student consumer | Pending                                                            |
| M6        | Existing IRT request UI, publication contract, aggregate analytics, release evidence                     | Data compute/mapping/fallback, independent QA                   | Pending                                                            |

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

M0/M1 branches were pushed. Creating their draft PRs failed with GitHub connector `403: Resource not accessible by integration`; the local GitHub CLI is unauthenticated. PR descriptions are prepared. This does not block local milestone implementation, but review/CI on pull requests requires repository write access through an authenticated interface.
