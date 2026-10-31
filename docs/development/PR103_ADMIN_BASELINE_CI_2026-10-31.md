# PR 103 — Admin baseline integration and CI

**ENGINEERING FIX — owner request, 31 October 2026:** integrate the repaired Admin E2E baseline into PR #103, retain its Drill/math rendering fixes, and rerun the complete existing CI. This does not change product rules, content approval, assessment history, or database state.

## Evidence and integration

- Original PR head: `8ee2732fec7e75a8784ee2b462dfa3faa640c58c`.
- Original failed CI: [run 39789853543](https://github.com/ayiinee/Numora/actions/runs/39789853543). Its Browser E2E step reported eight Admin failures, 165 passed, 21 not run and a 900-second suite/teardown timeout. This incomplete run does not establish a Drill/rendering regression or complete release acceptance.
- Exact failures: five-row pagination at 390/1280 px; SUPER_ADMIN and CONTENT_DATA_MODERATION navigation at both widths; upload-first TRYOUT at both widths.
- Integrated main: `52457c6c26898ccdb6aa821799f5c562506a4f77`, whose [complete CI run 41176351687](https://github.com/ayiinee/Numora/actions/runs/41176351687) succeeded. It includes the repaired Admin editor/navigation/assignment/upload assertions (`a39088c`, `72ab959`, `509238a`, `b8734c6`) and subsequent accepted changes.
- Merge conflicts were restricted to the Drill service and the old Admin renderer path. Main's current rubric engine and archived/non-demo READY checks remain. The owner-policy SQL helper retains exact code/version, non-demo and JSON-array membership checks, alongside existing schedule, level, PUBLISHED and distribution guards.
- Main extracted the renderer to `components/content-rich-text.tsx`. The PR's flat-root/fraction rendering and math-only `renderMedia` option now live there; the Admin module remains its compatibility re-export. KaTeX trust/expansion protections and escaped fallback text remain.
- The workflow, browser partition, suite coverage, timeouts, retry policy, migrations and scoring rules are unchanged relative to main. There is no test exclusion, skip or weakened assertion added by this integration.

## Local verification

Runtime: Node **24.22.1**, pnpm **12.6.0**, frozen lockfile, isolated Windows worktree. Production/development database credentials were not loaded.

- The renderer regression suite first reproduced **3 failures / 4 passes** against main's unextended shared renderer; the integrated renderer passed **7/7**.
- Existing policy suite: **4 passed**, **1 PostgreSQL case skipped locally** because no isolated `TEST_DATABASE_URL` was supplied. The unchanged full CI supplies isolated PostgreSQL/Redis and runs the connected suites.
- `pnpm test:checks`: **74 passed**.
- `pnpm exec tsc -p apps/api/tsconfig.json --noEmit`: passed.
- Dependency package builds (`database`, `assessment-engine`, `irt-orchestration`), scoped lint and formatting: passed.
- Focused browser regression: **12 passed**, one worker, including all eight previously failing cases plus Operations/unassigned navigation at both widths:

```powershell
pnpm --filter @tka/web exec playwright test e2e/admin.spec.ts --grep "Admin five-row pagination|Unified Admin portal|Upload-first TRYOUT" --reporter=line
```

Independent review found no critical/important code issue. Next's incidental `apps/web/AGENTS.md` regeneration was restored before commit. Uncommitted Pretest/operator changes in the original checkout were left untouched.

## Complete CI boundary

The branch update triggers the existing complete pull-request workflow. Its authoritative result is the checks on [PR #103](https://github.com/ayiinee/Numora/pull/103), including validate, isolated tests, connected chain, both complete browser shards, build/OpenAPI freshness and the final quality gate. Local focused results above do not substitute for that remote result, and this document does not label an incomplete/in-progress run as passing. No production rollout or PR merge is performed by this repair.
