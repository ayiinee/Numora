# Runtime/QA integration after Admin #110

**ENGINEERING DECISION — owner instruction, 29 October 2026:** integrate runtime PR #102 and the additional QA/runtime/dependency work in #109 against accepted `main` `ca28a876b10387d3645c36d2d5d3696425726e12`. Preserve the current Admin flow, original source histories and existing product decisions. This work prepares one reviewable integration and rehearses migrations on isolated databases; Cloud rollout and independent acceptance remain separate.

Inputs: #102 `b8734c6fbab62d18b7c644be94c2bb988ab899e0`, #109 `f0790739529280b93df7a7f0f2b8244cdfa89824`. The source branches remain unchanged.

## Integration constraints

- Keep canonical SQL and journal entries `0000`–`0048` byte-identical to accepted main. Append the immutable runtime PvP trigger at the next position. The type widening already exists in `0043`; preserve #110's policy-specific XP guard.
- Archive the original runtime `0039/0040` and published Admin SQL/hashes as provenance. Known history bridges preserve original rows, reject unknown/partial histories and never replay an existing trigger. Older broad XP guards must not shadow `0048`.
- Retain rich-question validation, media/answer API methods, latest Admin UI/tests and main's Admin-fork bridge. Carry over generator-mode main API routing, the Chapter 3 allowlist, Redis-independent PvP deadlines and recovery timestamps, worker/result optimizations, QA tooling and dependency remediation.
- Do not reinterpret academic OPEN items or treat historical failed load/manual reports as acceptance. Final integration tests and exact source SHA are recorded below once available.

## Verification plan

Fresh schema, upgrade from canonical main/Admin, audited Admin forks and original runtime history; replay; partial/unknown history and drift rollback; immutable historical rewards and both partial/legacy XP. Run database/API/worker/web suites, lint/types/contracts/build, Redis transport, connected release/IRT/PvP and complete browser coverage on the final source.

Status: integration and isolated migration reconciliation in progress. No shared database has been changed.
