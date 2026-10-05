# Teacher pull request handoff — 5 October 2026

**ENGINEERING DECISION:** the owner requested committing the completed Teacher work and opening a pull request to `main`. Publication uses `codex/teacher-demo-redesign`, prepared in an isolated worktree from `origin/main` at `f58eea6`. Unrelated Student, backend, worker, contract and notification-migration changes in the shared workspace are preserved outside this pull request.

The pull request contains two concerns in separate commits: the guarded synthetic Teacher development seed and the responsive Teacher frontend with verification evidence. Main's Student/Admin/join CSS is preserved; only the previous Teacher block moves into `teacher.css`. No business schema, public API, scoring policy or RLS changes are included.

## Verification on the publication branch

| Check                                   | Result                        |
| --------------------------------------- | ----------------------------- |
| Full repository lint                    | PASS, zero warnings           |
| Full monorepo typecheck                 | PASS, 14 tasks                |
| Full monorepo build                     | PASS, 10 tasks                |
| Frontend Vitest                         | PASS, 23 files / 163 tests    |
| Auth + Teacher Playwright regression    | PASS, 43 tests in 3.4 minutes |
| Seed environment/Auth safety tests      | PASS, 3 tests                 |
| Repository script checks                | PASS, 48 tests                |
| Contract validation and generated types | PASS                          |
| Whitespace and secret/artifact scan     | PASS                          |

The frontend count is higher than the 4 October report because the new `main` contains additional join-flow regression tests. Build used `NUMORA_LOW_MEMORY=true`, a 1536 MB Node heap, and sequential Turbo execution. Full cloud-connected and isolated restore seed checks were completed on 4 October and are recorded in the [Phase 0 report](../../packages/database/seeds/teacher-demo-report.md) and [connected QA report](TEACHER_CONNECTED_QA_2026-10-04.md). No cloud writes or reseeding were performed while preparing this pull request.

The [connected gallery](screenshots/teacher-connected/README.md) contains 22 synthetic real-data captures; the [frontend gallery](screenshots/teacher-redesign/README.md) includes synthetic fixture screens and supplied-reference comparisons. Password vaults, Auth session states, dumps, logs, traces and other private `.qa-seed` artifacts are excluded. Demo timestamps are historical; batch availability naturally changes after the 5 October deadline.

## Limits

Teacher batch monitoring, leaderboard/XP projections, notification inbox and settings mutations still need backend support. OPEN product policies remain unresolved. Real Google OAuth was not tested by the connected suite. The PR adds no automatic production seed or migration/deployment step. GitHub CI runs after PR creation; its result is separate from the local checks above.
