# AGENTS.md — Engineering Instructions for Human and AI Contributors

## Purpose

This file is the default engineering context for contributors and AI coding agents working on the TKA Mathematics SMP platform.

The project is a responsive learning platform for independent and school-affiliated Grade IX SMP/MTs students preparing for TKA Mathematics. It includes school/teacher verification, classes, pretest, drill, tryout, progress, feedback, content administration, reports, leaderboards, realtime PvP, video recommendations, analytics, and IRT.

## Mandatory reading order

Before implementing a feature, read:

1. `docs/product/PRODUCT_CONTEXT.md`
2. `docs/product/OPEN_DECISIONS.md`
3. `docs/product/PRD_MAPPING.md`
4. `docs/development/SPRINT_2_GOAL.md` for prototype or current-sprint work
5. `docs/development/PROJECT_STRUCTURE.md` for code placement and folder conventions
6. For frontend UI work, `docs/design/README.md` and `docs/design/NUMORA_UI_DESIGN_SYSTEM.md`; use `docs/design/NUMORA_UI_SKILL.md` as the team workflow reference
7. Relevant architecture/API/data document
8. Relevant ADRs
9. Existing tests and contracts for the module

## Source-of-truth precedence

1. Latest approved PRD — product behavior and acceptance criteria. The project owner supplied PRD v0.6 Final on 4 October 2026 as the latest source (docs/product/sources/PRD_Numora_v0.6.docx.md). Earlier rules below remain historical context; consult PRODUCT_CONTEXT.md and OPEN_DECISIONS.md for supersession and unresolved dependencies.
2. Approved ADR — technical decision only.
3. Approved module specification.
4. Machine-readable contract.
5. Database schema/migrations.
6. Code.

Never invent an answer for an OPEN item. Implement extensibility around it or use explicitly labeled demo/test fixtures.

For visual decisions, use the latest approved UI/UX handoff for screen-specific layout and interaction, then the team-supplied UI design-system baseline for shared tokens, components, responsive behavior, and accessibility. The handoff is not available yet. Neither visual source changes product rules from the approved PRD. Keep provisional design values easy to replace when UI/UX finalizes them.

## Requirement labels

When adding or changing documentation, distinguish:

- **PRD RULE** — directly stated in the latest owner-approved PRD.
- **ENGINEERING DECISION** — approved technical decision from team alignment/ADR.
- **PROPOSED** — recommendation awaiting approval.
- **OPEN** — unresolved product/academic decision.

Do not present a proposal as a PRD rule.

## Architectural constraints

- Frontend must not query product/business data directly from PostgreSQL/Supabase Data API.
- Supabase in the browser is limited to authentication-related needs unless a new ADR explicitly approves otherwise.
- NestJS is authoritative for authorization, assessment lifecycle, scoring, progress, XP, PvP, and other domain rules.
- PostgreSQL is the durable source of truth.
- Redis is cache/ephemeral/queue infrastructure. Restarting Redis must not erase durable business truth.
- PvP time, answer validity, transition, and score are server-authoritative.
- Historical assessment results must not be recalculated after question/scoring revisions.
- Attempts must reference the content/scoring versions actually used.
- Business time rules such as weekly Tryout package release and leaderboard reset use `Asia/Jakarta`; durable timestamps are stored in UTC.
- Sensitive state-changing operations must be idempotent or protected by equivalent database constraints/transactions.

## Product rules from approved PRD v0.6

The full source is `docs/product/sources/PRD_Numora_v0.6.docx.md`. Reyhan confirmed on 5 October 2026 that Tryout XP uses equivalent-correct ×10; AC-15's ×100 is a typo. `docs/data/PRD_V06_DATA_ALIGNMENT.md` records the implementation and rollout boundaries. This supersedes conflicting older feature-PRD and OPEN register entries.

- Students and Teachers authenticate with Google.
- Teacher features require valid school verification through a single-use token valid for 3×24 hours.
- A Student belongs to at most five active classes, possibly across schools. Zero active classes means Mandiri; one to five means School. Progress, history and XP belong to the account. Leave/ban ends membership without deleting history; only the active class Teacher can ban/unban.
- Classes remain available without an active Teacher. Takeover requires a verified Teacher from the same school and no active class owner. A Teacher leaving a school loses class ownership and monitoring access.
- Pretest is optional, 20 questions and at most once completed per chapter: 0–7 correct starts Level 1, 8–18 starts Level 2, 19–20 starts Level 3. Skip starts Level 1. Curriculum supplies the chapter/subchapter blueprint and distribution.
- Drill: five levels/subchapter, 10 questions/level, unlimited count-up timer, 80% mastery, one variant/level for MVP and retry of that same pool. Score and stars in the current level state use the latest attempt; best score and unlock history persist. Stars: 0 score →0, up to 50 →1, below 100 →2, 100 →3. No 90-day explanation expiry is introduced by v0.6.
- Tryout: shared 30-item weekly package released Monday 00:00 WIB, closing Sunday 23:59 WIB, one attempt/package/user, result/explanation together after IRT within 72 hours of batch close. The effective deadline cannot exceed batch close. PGK partial rubrics come from Curriculum; the current scoring engine remains single-choice until that handoff is implemented.
- Class and global activity leaderboards use account-based Drill + Tryout XP. PvP uses separate Best Poin per difficulty/week. A Student appears in every active class; ban removes their current class entry immediately.
- Drill XP = min(150, correct/total×100 + max(0,(900−elapsedSeconds)/900×50)). Tryout XP = equivalent-correct×10 immediately after completion, before IRT release. Pretest awards no XP. Never rewrite historical policy pins, results or posted XP.
- Admin subroles separate Super Admin, Operations, and Content/Data/Moderation. Subrole null grants no Admin capability. No Admin role permits class ban/unban.
- Content lifecycle is DRAFT/READY/REVISION/ARCHIVED. READY requires metadata, difficulty, answer key and explanation. DRAFT import/preview is not publication. Important content revisions create new immutable versions.
- Leaderboards update hourly and reset/archive Wednesday 23:59 WIB.
- PvP permits Mandiri and School students together; uses realtime WebSocket, 10 questions, server-authoritative scoring, and a 20-second reconnect window.
- IRT methods, statistical thresholds and pipeline belong to Data/AI, not an invented product rule; retain versioned input/results and approved release/fallback boundaries.
- Admin cannot modify MVP product parameters such as mastery threshold, tryout limit, XP formula, or leaderboard reset in the UI.

## Known PRD ambiguities that must not be guessed

- Drill is described as an unlimited count-up timer, while some wording still refers to timeout/timer completion. Treat product timeout semantics as clarification pending; do not introduce a hidden timeout.
- The supplied Sprint 2 Goal PDF uses the old 70% Drill threshold. The team confirmed that Sprint 2 follows PRD v0.5: 80% unlocks the next level.
- XP product formulas are final in v0.6 with the ×10 Tryout correction above. Display formatting must not silently replace the persisted decimal amount with an integer formula.
- PGK scoring is OPEN-04.
- Curriculum's approved bank, difficulty, question distribution and PGK rubrics remain delivery dependencies. Missing academic inputs do not authorize publication or guesses.

## Coding rules

- **ENGINEERING DECISION — owner instruction, 7 October 2026:** new branch names must not start with `codex`; use descriptive prefixes such as `feat/`, `fix/`, or `docs/`.
- TypeScript strict mode.
- DB identifiers: `snake_case`; TypeScript/API JSON: `camelCase`.
- External identifiers use UUID unless an ADR says otherwise.
- API base path: `/api/v1`.
- API errors follow `application/problem+json` conventions.
- Use OpenAPI-generated/shared types where an API contract exists; do not create duplicate handwritten API response types without reason.
- Do not put business rules in React components.
- Do not allow Controllers to contain complex domain logic; use domain/application services.
- Validate untrusted inputs at API/WebSocket boundaries.
- Do not expose stack traces, secrets, auth tokens, verification tokens, or unnecessary student PII in logs.
- Prefer explicit state machines for assessments and PvP rather than booleans such as `isDone`.

## Database and migration rules

- Schema changes require migrations committed to Git.
- Do not modify shared/staging/production schema manually via dashboard as the normal workflow.
- Historical content is versioned/archiveable, not destructively overwritten.
- XP is recorded in an immutable ledger with unique source semantics.
- Outbox events are inserted in the same DB transaction as the business mutation they represent.
- Single-use teacher tokens must be consumed transactionally and stored as secure hashes rather than reusable plaintext where feasible.

## Testing expectations

At minimum, test business-critical rules:

- teacher token expiry and single-use race condition
- five-class limit, duplicate membership, leave/ban/rejoin and same-school teacherless takeover
- locked-level access rejection
- drill 80% unlock logic and star independence
- duplicate submit/idempotency
- weekly Tryout package release, one attempt/package, and IRT-gated result
- historical content/scoring version preservation
- class vs PvP leaderboard separation
- PvP scoring/timer/reconnect/forfeit
- authorization across teacher-owned classes

Critical flows require E2E coverage before release.

## Definition of Ready

Do not start final behavior for a feature unless its user story, acceptance criteria, authorization, persistence impact, contract, failure states, and relevant OPEN dependencies are known. Generic infrastructure can proceed around unresolved product policies.

## Definition of Done

A feature is not done until:

- acceptance criteria pass
- code is reviewed
- lint/typecheck/build pass
- migrations are included if needed
- API/contract is updated if needed
- tests cover critical behavior
- authorization is tested
- loading/error/empty/access-denied states are handled where applicable
- docs are updated
- no secrets are committed
- QA can verify the flow

## Change discipline

When requirements change:

1. Update PRD/module spec first or record the approved decision.
2. Update `OPEN_DECISIONS.md` and `PRD_MAPPING.md`.
3. Update ADR only if the technical architecture changes.
4. Update contracts/schema/migrations.
5. Update implementation and tests.

Never silently change a product rule only in code.
