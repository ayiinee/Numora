# Teacher UI alignment — browser evidence

**ENGINEERING VERIFICATION — 9 November 2026:** synthetic browser fixtures, not connected-service acceptance. Captures show the implemented blue Teacher presentation on branch `feat/teacher-ui-alignment` above base `27b581b`. They are working-tree evidence, not an immutable release chain.

| Screen           | Mobile, 390 px                 | Desktop, 1440 px                 |
| ---------------- | ------------------------------ | -------------------------------- |
| Class directory  | [Mobile](classes-390.png)      | [Desktop](classes-1440.png)      |
| Class students   | [Mobile](students-390.png)     | [Desktop](students-1440.png)     |
| Invitation       | [Mobile](invite-390.png)       | [Desktop](invite-1440.png)       |
| Student progress | [Mobile](progress-390.png)     | [Desktop](progress-1440.png)     |
| Student notes    | [Mobile](feedback-390.png)     | [Desktop](feedback-1440.png)     |
| Profile          | [Mobile](profile-390.png)      | [Desktop](profile-1440.png)      |
| Verification     | [Mobile](verification-390.png) | [Desktop](verification-1440.png) |

Full-page mobile screenshots position fixed navigation at the initial viewport; browser checks separately verify scrolling and access to bottom content. All names, addresses, codes, counts and scores are test fixtures. Raw captures and geometry across thirteen widths are in ignored `.tmp/teacher-ui-alignment/`.

The suite checks 320, 360, 375, 390, 393, 430, 768, 834, 1024, 1280, 1366, 1440 and 1920 px. It also exercises create/invite, actual QR and copy/download, ban/unban, takeover, school departure, zero/null values, gated results, navigation/filter restoration, draft retention, authorization loss, keyboard focus and reduced motion.
