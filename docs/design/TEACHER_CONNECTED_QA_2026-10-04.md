# Teacher — connected development QA, 4 October 2026

**ENGINEERING DECISION:** the owner authorized continuing all Teacher frontend phases without interim review. The [frontend delivery report](TEACHER_REDESIGN_COMPLETE_2026-10-04.md) covers phases 1–8. This follow-up connects that implementation to the completed [Phase 0 dataset](../../packages/database/seeds/teacher-demo-report.md) and verifies the supported screens against real application data.

## Connected result

Five Chromium tests passed against real Supabase Auth, NestJS and PostgreSQL in **Numora-Staging**, project `pkamenfnwmoeisccnrnk`, the repository's development sandbox. The final run completed on 4 October at **22:53 WIB**. Product responses were not mocked. NestJS remains the frontend's business-data source; browser Supabase access is for authentication only.

| Flow                       | Verified behavior                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard and roster       | Three actual classes; 98 active students; 9-A has 34 rows; searching Siti returns her membership                                                                                  |
| Invitation and settings    | Canonical `NUM-9A26` code, generated QR PNG and download source; settings show the actual 34 students and are explicitly read-only                                                |
| Monitoring                 | All 34 students from the owned class; real progress; unavailable Tryout-batch and leaderboard capabilities are clearly identified                                                 |
| Student detail and history | Budi Santoso latest 70/best 90; Alya's released result 97; current result waits for IRT and exposes no score; Fikri has no practice or assessment history                         |
| Feedback and profile       | Siti has three real feedback rows, one unread; profile shows the real synthetic email and three classes; no false Google-provider claim; Teacher notifications remain unavailable |

Eleven screens were checked at thirteen widths: **320, 360, 375, 390, 393, 430, 768, 834, 960, 1024, 1280, 1440 and 1920 px**. All **143** screen/viewport checks passed horizontal-overflow and navigation-visibility assertions. The [portable gallery](screenshots/teacher-connected/README.md) contains 22 unmodified 390/1280 px captures and SHA-256 hashes. No browser JavaScript errors were recorded.

The QA account was provisioned through the development Admin Auth mechanism, with a real email/password session. A real Google OAuth redirect/session was **not tested**; no Google identity was fabricated.

## Dataset and security

Phase 0 retains one verified demo Teacher, one synthetic school and **98 students/memberships across 34/32/32 classes**. It contains 304 assessment attempts, 1,455 level-progress rows, two Tryout batches and 42 feedback rows. Each batch has 30 submissions and four pending/non-submitted students. Released scores derive to AVG **81.4**, distribution **8/12/6/4**; feedback is **38 read / 4 unread**, or **90.48%**. The full A–H mapping, exact inserted counts, raw-score checks and product gaps are in the Phase 0 report.

Connected browser QA refuses product mutation requests. Before/after row counts and ordered row digests matched for eleven tables, including demo and existing data: users, classes, memberships, attempts, items, answers, progress, feedback, XP ledger, outbox and audit. Session state, credentials and traces are not saved into committed artifacts. Local evidence and the private account vault remain ignored under `.qa-seed/teacher-demo/`.

**RLS was not weakened.** Phase 0 checked unchanged policies/grants/triggers and all 89 public tables retaining RLS. Its 22 API checks verified Teacher B isolation, Student role restrictions and anonymous rejection. This follow-up adds no schema, migration, scoring rule, public API or security-policy change, and applies no local notification migration to the sandbox.

## Final validation

| Check                                 | Result                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Full repository lint                  | PASS                                                                                                                     |
| Full monorepo typecheck               | PASS, 12 tasks                                                                                                           |
| Full monorepo build                   | PASS, 9 tasks                                                                                                            |
| Frontend Vitest                       | PASS, 23 files / 153 tests                                                                                               |
| Teacher fixture browser coverage      | All 23 cases verified: 22 passed in the full run; the 834 px case passed separately using an isolated artifact directory |
| Connected Teacher browser suite       | PASS, 5 tests, 48.1 seconds                                                                                              |
| Connected responsive assertions       | PASS, 143 checks / 22 captures                                                                                           |
| Business rows before/after browser QA | Unchanged                                                                                                                |

The initial 834 px fixture run failed while writing a trace because concurrent workspace checks removed a shared artifact path. Its isolated rerun passed; no UI assertion failed. The connected suite uses dedicated ports and private output directories. Earlier memory-limited build attempts were resolved by running the successful final build sequentially with a larger Node heap. The original Phase 0 typecheck blocker is historical; the final typecheck and build now pass.

The existing fixture suite also covers verification/access gates, empty/loading/error recovery, reduced motion, long names, keyboard/dialog behavior, QR/copy/download, logout recovery, feedback pagination/recipient isolation and delivery retry idempotency. It complements the connected suite, whose business operations are read-only.

## Reproduction

Use the repository-pinned `node_modules/.bin/pnpm.CMD`. Provision and apply the guarded Phase 0 seed before connected QA. The ignored private account manifest must already exist; never recreate production identities or print it. Build the API before starting the suite.

```powershell
$env:NODE_OPTIONS='--max-old-space-size=1536'
.\node_modules\.bin\pnpm.CMD --filter @tka/api build
$env:ALLOW_TEACHER_DEMO_BROWSER_QA='true'
node --env-file=.env apps/web/node_modules/@playwright/test/cli.js test --config apps/web/playwright.teacher-demo.config.ts
```

The connected config starts its own API on 3701 and web app on 3700, rejects reuse of existing servers, and disables trace/video/storage-state recording. It validates the exact development project, identity metadata and email provider before authenticated checks. Its fixture is anchored to 4 October 2026; the batch lifecycle changes naturally after its deadline. Rerunning the seed does not shift historical timestamps.

```powershell
.\node_modules\.bin\pnpm.CMD lint
.\node_modules\.bin\pnpm.CMD typecheck
$env:NUMORA_LOW_MEMORY='true'
$env:NODE_OPTIONS='--max-old-space-size=1536'
.\node_modules\.bin\pnpm.CMD exec turbo run build --concurrency=1
.\node_modules\.bin\pnpm.CMD --filter @tka/web exec vitest run --pool=threads --maxWorkers=1
.\node_modules\.bin\pnpm.CMD --filter @tka/web exec playwright test e2e/teacher.spec.ts --workers=1 --trace=off --output=../../.tmp/teacher-connected-final/fixture-results
```

## Added verification files and remaining scope

This follow-up adds `apps/web/playwright.teacher-demo.config.ts`, `apps/web/e2e-connected/teacher-demo.spec.ts`, this report and the portable gallery. It removes an unconditional Google-connected label from Teacher profile, and fixes the overloaded QR mock typing in `teacher-tools.test.tsx`. Existing parallel Teacher implementation files are preserved.

**MISSING_BACKEND:** Teacher batch monitoring, XP/leaderboard projections, Teacher notification inbox/read-all, school/profile enrichment, settings mutations and preferences. Advanced feedback context/reactions, takeover history, class block lists, exports, WhatsApp and session/2FA management remain gaps. An unavailable screen is not a completed backend feature.

**OPEN:** final XP/stars policy, automatic remediation, academic completion, approved class capacity and the unresolved official Tryout/IRT configuration. No formula, notification badge, remedial count, external integration or capacity rule is invented. The demo release is uncalibrated test evidence, not a scientific IRT calibration.

Supported frontend phases and connected development verification are complete. No deployment, merge or new backend system was performed in this follow-up.
