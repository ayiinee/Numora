# Teacher — real development data gallery

These 22 PNGs were captured directly from the Teacher application using real Supabase Development Auth and NestJS responses on 4 October 2026 at approximately 22:53 WIB. All identities and learning records belong to the synthetic Phase 0 scenario; no credentials or tokens appear in the captures. Product API responses were not mocked.

See the [connected QA report](../../TEACHER_CONNECTED_QA_2026-10-04.md) for checks, data counts and limits. [manifest.json](manifest.json) records each unmodified PNG's SHA-256 hash.

| Screen/state                                    | Mobile, 390 px                | Desktop, 1280 px               |
| ----------------------------------------------- | ----------------------------- | ------------------------------ |
| Dashboard: three classes, 98 students           | [PNG](dashboard-390.png)      | [PNG](dashboard-1280.png)      |
| Class 9-A: 34-member roster                     | [PNG](class-roster-390.png)   | [PNG](class-roster-1280.png)   |
| Invite: actual join code and QR                 | [PNG](invite-390.png)         | [PNG](invite-1280.png)         |
| Class settings: actual read-only information    | [PNG](class-settings-390.png) | [PNG](class-settings-1280.png) |
| Monitoring: real cohort progress                | [PNG](monitoring-390.png)     | [PNG](monitoring-1280.png)     |
| Budi Santoso: latest 70, best 90                | [PNG](regression-390.png)     | [PNG](regression-1280.png)     |
| Alya: mastered progress and assessment history  | [PNG](alya-progress-390.png)  | [PNG](alya-progress-1280.png)  |
| Fikri: new student without assessment history   | [PNG](new-student-390.png)    | [PNG](new-student-1280.png)    |
| Siti: actual remedial feedback/read states      | [PNG](feedback-siti-390.png)  | [PNG](feedback-siti-1280.png)  |
| Teacher notifications: unavailable backend      | [PNG](notifications-390.png)  | [PNG](notifications-1280.png)  |
| Profile: verified synthetic Teacher and classes | [PNG](profile-390.png)        | [PNG](profile-1280.png)        |

All eleven screens also passed browser overflow/navigation checks at thirteen widths from 320 to 1920 px. Full-page screenshots keep the fixed mobile bottom bar at the original viewport position; this is capture behavior. The Next.js development indicator is visible because these are untouched development captures. Unsupported design statistics and backend capabilities are not fabricated to reproduce mockup numbers.
