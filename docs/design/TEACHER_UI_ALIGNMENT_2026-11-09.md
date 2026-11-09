# Teacher UI alignment — 9 November 2026

**ENGINEERING DECISION — owner-approved plan:** Teacher adopts the current Student visual foundation with scoped blue identity, ivory canvas, Plus Jakarta Sans, patterned headers, 20 px cards, outline icons, existing illustrations, and Kelas / Profil navigation.

## Approved presentation

- Kelas uses searchable row cards. Create opens a short dialog and proceeds to the actual class invitation. Takeover remains secondary.
- Class context contains invitation, member management and a searchable/sortable roster. Ban/unban uses one dialog with explicit confirmation.
- A student's workspace has URL-backed Progres / Riwayat / Catatan tabs. Progress groups server-provided chapter/subchapter labels without calculating academic completion. Unvisited history/notes panels do not fetch.
- Notes retain their draft across tabs and warn before leaving the student. Existing delivery UUIDs, pagination, permissions and release states are preserved.
- Search/order survive contextual navigation. Legacy feedback links open the student's Catatan tab.
- Profile and verification use the same foundation. School departure and access recovery remain explicit.

No API, schema, product policy, scoring or publication change is authorized by this design. No generated illustration is required. Class membership counts are not presented as unique students across classes.

## Validation boundary

UI component/browser fixtures verify presentation and interactions; they are not connected-service acceptance. No cloud schema, auth account or business data was changed.

## Local verification

- Teacher browser suite: 26/26 passed at thirteen widths from 320 to 1920 px. A final 4/4 delta run adds cached-roster authorization-loss coverage and rechecks contextual drafts, notes authorization loss and the lifecycle flow using a legacy mixed-case takeover code.
- Student/Admin/verification regression: 17/17 passed, including one repeated Teacher viewport. Across these runs, 43 distinct browser cases passed. Keyboard, dialog focus restoration, zero/null values, pending IRT, read-state absence, retry UUIDs and real QR/copy/download behavior are exercised with synthetic fixtures.
- Frontend Vitest: the initial complete run covered 455 cases (454 passed, one obsolete Profile-heading expectation). That assertion and incomplete query fixtures were updated; the 71-case affected-file rerun passed. The final Profile selector also passed its focused rerun after a TypeScript-only selector-option correction.
- Repository lint: passed with zero warnings.
- Monorepo typecheck: 14/14 tasks passed, sequentially.
- Production build: 10/10 monorepo tasks passed, including Next.js production pages, API and worker. Existing placeholder-package cache-output warnings remain.

[Portable mobile/desktop evidence](screenshots/teacher-ui-alignment/README.md) covers verification, classes, roster, invitation, progress, notes and profile. Raw geometry and logs remain ignored in `.tmp/teacher-ui-alignment/`.

Validation used Node 24.22.1 / pnpm 12.6.0. Browser binaries and temporary downloads were placed under ignored `.tmp/teacher-ui-runtime/` on drive D because the system drive was full. This changes no tracked runtime or browser dependency.
