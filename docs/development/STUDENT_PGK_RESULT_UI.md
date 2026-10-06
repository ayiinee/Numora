# Student PGK, review, rewards and result UI

**ENGINEERING DECISION — Aini, 6 October 2026:** reuse Student styles for typed answers, persisted review states, expandable XP detail, and TryOut **Info nilai**. Incomplete Category answers are warned about but may be submitted.

**ENGINEERING DECISION — revised by Aini:** result pages show a **Lihat pembahasan** button. Dedicated Drill/TryOut explanation pages reuse the question-taking layout, with read-only answers and explanation below the question. No answer matrix appears on the result page. Navigation in explanation is for selecting a question; it never saves or resubmits.

**PRD RULE / owner clarification:** server owns grading, mastery, stars, rewards and release. TryOut XP is posted at submit independently of IRT. Historical results/rewards are not recalculated.

## Integration boundary

- Existing endpoints gain typed answers/review and persisted reward detail; legacy PG contracts remain compatible.
- Before TryOut release, only persisted total XP is shown. Keys, explanation, points and equivalent-correct detail remain hidden.
- Review statuses use stored awarded/max points. UI never infers grading from selected options.
- Existing releases without canonical method provenance do not claim IRT. Unknown method is shown as not recorded.
- **OPEN:** PGK rubric, Drill decimal score/star precision, IRT mapping and standard-score formula. Production PGK start/grading and new publication remain blocked; fixtures are TEST ONLY.
- Pretest, PvP, content publication and statistical computation remain outside scope.

## Verification

Test typed save/clear/resume/ACK/retry, incomplete Category warning, four review states, separate explanation routes and release/ownership gates, zero/legacy XP, provenance, keyboard and responsive layout. Record actual validation and remaining production acceptance dependencies here.

### Local engineering results — 6 October 2026

These are **working-tree checks**, not acceptance evidence for a fixed release SHA:

| Check                                  | Actual result                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Web unit/component suite               | 29 files, 224 tests passed                                                                                                            |
| API suite on isolated PostgreSQL/Redis | 36 files, 163 tests passed, no skips; typed-answer and TryOut HTTP cases rerun after the final XP-read change (3 passed)              |
| Assessment engine                      | 3 files, 16 tests passed                                                                                                              |
| Database integration suite             | 11 files, 26 tests passed, no skips                                                                                                   |
| Worker                                 | 6 files, 16 tests passed                                                                                                              |
| Repository script checks               | 68 passed                                                                                                                             |
| Browser                                | 5 passed: Drill/TryOut at 390 px and PG/MCMA/Category save, clear, refresh/resume, submit and separate explanation at 320/768/1280 px |
| Static/build contracts                 | lint, all-package typecheck, API build, Web production webpack build, JSON Schema validation and generated-type freshness passed      |

Browser PGK grading/results use **TEST ONLY** fixtures. The API integration runs actual NestJS controllers/services and PostgreSQL transactions; it verifies ownership, release gating, clear-to-null, pinned review evidence and published canonical result provenance. It does not approve a rubric or implement partial scoring.

The mobile Category test caught hidden legends inheriting full-width positioning. The scoped fix preserves accessible statement names and removes horizontal overflow. XP is read once for a TryOut result so its total and detail use the same stored ledger value.

### Remaining acceptance gate

**OPEN / engineering verification:** rerun the connected API → PostgreSQL → browser → result/history/dashboard chain from a clean checkout on **one committed SHA**. Concurrent Pretest/TryOut lifecycle changes were being added and committed in this workspace during verification; these checks must not be attributed to the former main SHA or a later commit automatically. The existing release-chain guard remains enforced.

**OPEN / academic rollout:** actual PGK grading/partial XP and new IRT/standard-score publication still require approved owner inputs. Dedicated explanation screens and their fixtures do not establish production acceptance of those policies. This increment does not require its own database migration; the separate lifecycle increment owns migration 0028.
