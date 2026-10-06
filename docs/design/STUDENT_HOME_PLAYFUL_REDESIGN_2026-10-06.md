# Student Home playful redesign — 6 October 2026

## Direction and source

**ENGINEERING DECISION — user-approved visual target:** Image 2 attached to the request controls the `/student` composition; Image 1 supplies only the desired playful and clean tone. The implementation uses the existing Plus Jakarta Sans, Numora palette and shell. The screenshot's names, attempt counts, XP and dates are examples, never runtime fixtures.

**PRD RULE:** Assessment state, XP, class affiliation, Tryout release and feedback read state remain server-authoritative under PRD v0.6 and its recorded clarifications. No API, database, scoring, authorization or navigation destination changed.

## Implementation

- Affected Home files: `dashboard-new.tsx`, `dashboard-presentation.tsx`, `home-class-podium.tsx`, and `feedback-overview.tsx`; `student-home-carousel.tsx` and `student-home.css` are new. Relevant `redesign.test.tsx`, `account.test.tsx`, and `e2e/student.spec.ts` expectations were updated. The existing compact `StudentIdentityHeader` remains available to Materi; the new Home header is separate. Shared `AppShell`, `LeaderboardPodium` and the five-item Student bottom navigation are unchanged.
- Mobile uses a 16 px gutter and the requested section order. Tablet uses a centered single content column. At the existing 960 px desktop shell breakpoint, the main content and class/feedback column sit side by side.
- Drill is the first carousel slide. The two slides loop at 6 seconds with previous/next, indicators, swipe and pause/play. Manual navigation resets the interval. Hover, focus, hidden document and manual pause suspend it. Reduced motion disables autoplay and slide transitions. Inactive slides are `inert` and `aria-hidden`; automatic rotation uses `aria-live="off"`.
- The Drill hero uses the saved attempt ID or links to Materi. Tryout actions use the current package state and saved attempt ID; unavailable and waiting states do not offer Start. The Tryout query has its own loading/error/retry state. Home rendering performs only existing GET queries; viewing feedback does not call its read endpoint.
- Class rows display the first three server entries, their server ranks and stored unit/points. A separate own-rank row appears only when outside the first three. Pending policy, unavailable, empty, Mandiri and request-error states remain explicit. Activity rows preserve `0`, pending/legacy reward labels, Demo and waiting IRT.

## Illustration provenance

`drill-owl.svg` and `tryout-owl.svg` are new internal vector illustrations based on the geometric eyes, head, beak and purple body of `apps/web/public/figma/numora-owl-source.png`. The original file was not changed. Both SVGs have transparent backgrounds and no baked-in text or controls. The asset details are recorded in [STUDENT_HOME_PLAYFUL_ASSETS.json](STUDENT_HOME_PLAYFUL_ASSETS.json). No external art was used.

## Review and results

- Final fixture screenshots: [320 px](screenshots/student-home-playful/home-320.png), [390 px](screenshots/student-home-playful/home-390.png), [1440 px](screenshots/student-home-playful/home-1440.png). Playwright also checked 360, 393, 430, 768, 1024 and 1280 px. After first review, the mobile owl illustration was enlarged and the 320 px section headings were reduced to avoid wrapping beside their links.
- `pnpm lint`: passed. `pnpm typecheck`: 14/14 tasks passed. `pnpm test`: 14/14 tasks passed, including 242 web tests; the repository's integration tests remained skipped under the existing configuration. `pnpm build`: 10/10 tasks passed. `playwright test e2e/student.spec.ts -g "home visual composition"`: 9/9 passed.
- Playwright checked section order and horizontal overflow, keyboard carousel navigation, destination links and that opening Home or navigating to notifications creates no assessment attempt or feedback read mutation. Four existing cross-route flows at 320, 390, 768 and 1440 px and the independent Tryout error/retry flow also passed after their Home assertions were updated.

## Known visual deviations

The reference depicts a sample avatar, decorative award art, fabricated counts and a four-item navigation. Home shows the real account avatar or initials, real class/reward data and Numora's approved five-item bottom navigation. The new owl follows the existing geometric Numora asset rather than tracing the screenshot's different mascot.
