# Admin Content UI evidence

**ENGINEERING VERIFICATION:** synthetic browser fixtures, not live Cloud acceptance. The role is Admin Content, Data & Moderation; no real identities or credentials are shown.

| Screen        | Desktop                          | Mobile                         |
| ------------- | -------------------------------- | ------------------------------ |
| Question bank | [1440 px](bank-desktop.png)      | [375 px](bank-mobile.png)      |
| Material list | [1440 px](materials-desktop.png) | [375 px](materials-mobile.png) |
| JSON import   | [1440 px](import-desktop.png)    | [375 px](import-mobile.png)    |

These captures use the scoped Content workspace theme. See [implementation and remaining gates](../../ADMIN_CONTENT_UX_2026-10-06.md).

## Current AdminLTE reference update

The latest owner-supplied screenshot supersedes the preceding theme for Content only: purple accent, white topbar/sidebar, grey canvas, compact cards and controls, outline task icons, lifecycle badges and separate desktop question/action columns. Mobile retains stacked cards, a left menu toggle and scrollable tabs. Numora branding and existing controls remain; no template dependency is installed.

Current validation: 35 targeted unit tests and 22 browser scenarios passed, covering the Content workbench at 320/375/768/1440 px, desktop/mobile role separation, import, review, historical moderation, IRT, Pretest blockers and limited operational structures. The mobile menu is keyboard-operated with Escape restoring focus. Lint, formatting, web typecheck and isolated webpack production build passed. The checks use synthetic browser/API fixtures; they are not connected Cloud acceptance. Four final capture rechecks refresh the desktop/mobile gallery after the warning-colour contrast adjustment. Earlier results below refer to their own iterations.

```powershell
$env:NUMORA_E2E_WEBPACK='true'
pnpm --filter @tka/web exec playwright test e2e/admin.spec.ts e2e/admin-content-lifecycle.spec.ts e2e/admin-irt-analytics.spec.ts e2e/admin-assessment-publisher.spec.ts e2e/admin-operations.spec.ts --grep 'Content catalog pagination|Content workspace UX|Unified Admin portal|Content reviews|moderation opens|IRT request pins|Pretest editorial|Content only loads'
```

The latest owner update removes Ringkasan and Analytics from Content navigation and redirects their URLs to the bank. Content page banners are removed. The former home captures ([desktop](home-desktop.png), [mobile](home-mobile.png)) are historical evidence of the preceding iteration and do not represent the current portal.

## Reproduce

```powershell
$env:NUMORA_E2E_WEBPACK='true'
pnpm --filter @tka/web exec playwright test e2e/admin.spec.ts e2e/admin-content-lifecycle.spec.ts e2e/admin-assessment-publisher.spec.ts e2e/admin-irt-analytics.spec.ts e2e/admin-operations.spec.ts
```

The suite owns localhost:3300 and intercepts the fixture API at localhost:3301. Keep those ports free. Capture geometry and additional tab images are generated under `.tmp/redesign-phase9/content-ux-*`; reviewed portable captures are included here.

## Latest list update

Content displays 6 demo material entries with 3 per page, plus 10 distinct demo question examples with 5 per server page. Technical upload/R2 smoke fixtures are available in history; the default sample uses demo seed questions. Non-demo content is retained. The nine tabs predate the redesign and map to PRD capabilities; their grouping and names are engineering UI choices.

20 targeted web unit tests, one connected PostgreSQL integration scenario (rolled-back fixtures), and seven browser scenarios passed, followed by two desktop/mobile pagination capture rechecks. The isolated Development dataset was additionally checked read-only: 10 selected examples, pages 5/5, three formats, 481 stored versions unchanged. Typecheck, lint, API build, isolated web production build and contract/schema freshness passed. Current bank/material captures show synthetic pagination fixtures; the database checks are separate evidence. All four refreshed bank/material captures were visually reviewed.

```powershell
$env:NUMORA_E2E_WEBPACK='true'
pnpm --filter @tka/web exec playwright test e2e/admin.spec.ts --grep 'Content catalog pagination|Content workspace UX|Workbench retry'
# From apps/api, in the configured isolated Development sandbox:
$env:ADMIN_CATALOG_SANDBOX_CHECK='true'
node --env-file=../../.env ./node_modules/vitest/vitest.mjs run src/modules/content/content-catalog.integration.spec.ts --maxWorkers=1
```

## Previous removal update

18 targeted unit tests and all 11 selected browser scenarios passed. Browser checks cover Content redirects, no Analytics request, absence of the page banner, all nine workbench tabs, import, keyboard navigation and 320/768/1440 px layouts; the shared portal checks preserve Operations, Super and unassigned behavior. Two Content portal scenarios initially matched both import links; an exact accessible-name selector corrected the test and both reruns passed. Web typecheck, targeted lint and the isolated production build (`.next-admin-content-ux`) passed. The four bank/import screenshots above were refreshed; home screenshots remain historical.

```powershell
$env:NUMORA_E2E_WEBPACK='true'
pnpm --filter @tka/web exec playwright test e2e/admin.spec.ts --grep 'Content workspace UX|Unified Admin portal'
```

## Previous iteration results

| Check                                 | Result                                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Web unit tests                        | 39 files, 240/240 passed (`vitest run --maxWorkers=1`)                                                                             |
| Admin browser regression              | 35/35 passed; covers Content/Operations/Super/unassigned, publisher, IRT, moderation, operational boundaries and responsive states |
| Final Content polish                  | 5/5 browser rechecks after math rendering/copy polish; 320/768/1440 px workbench and historical review/moderation                  |
| Repository lint                       | Passed, zero warnings                                                                                                              |
| Web typecheck / production TypeScript | Passed                                                                                                                             |
| Isolated production build             | Passed, Next.js 16.3.6 webpack; output `.next-admin-content-ux`                                                                    |
| Contracts                             | 8 schemas validated; generated types fresh                                                                                         |
| Script checks                         | 68/68 passed                                                                                                                       |
| Visual verification                   | Six portable captures; desktop/mobile reviewed; no horizontal overflow in the tested views                                         |

The initial concurrent build/test attempt hit native Windows worker exits while free RAM was around 0.7 GB. The completed results above come from the successful reruns: unit tests used one worker, followed by a separate build with `NUMORA_LOW_MEMORY=true` and a 1536 MiB Node heap. The user’s localhost:3000/3001 services were not stopped. No connected Cloud or independent QA acceptance is claimed.
