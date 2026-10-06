# Student Home HTML and Figma refinement — 7 October 2026

**ENGINEERING DECISION — owner direction:** `/student` follows the composition and artwork of the supplied `Numora (3).html`. The Drill/Tryout hero keeps a gentle asymmetric silhouette inspired by the supplied `Numora.html`. Header arrangement, geometric pattern, purple treatment, and announcement follow Figma node `2574:212` in `UIUX-NUMORA` and the supplied header image. The owner clarified that the gem is omitted and the Figma account level is replaced by the existing Drill progress.

**PRD RULE:** All Home values and actions remain server driven. The sample names, XP, scores, ranks, question counts, and Tryout state in the supplied HTML/Figma are visual examples only. Account XP is the sum of immutable `xp_ledger.xp_amount` entries; decimal precision is preserved in the API and Indonesian display. Class leaderboard XP remains period scoped and is not used as the account total.

## Implementation boundary

- The Home header shows the account avatar/name, current school or Mandiri, total XP, Drill level progress, notifications, and a Tryout announcement only for an open or in-progress package. It has no gem or account-level policy.
- Hero, shortcuts, activity, class ranking, and feedback use the supplied composition and art, while keeping the existing API destinations, loading/error/empty states, five-item Student navigation, and carousel controls.
- The owner requested a compact Home hero: its height is approximately half the previous treatment (160 px on narrow screens, 180 px on wider screens). The full supplied owl image, including its illustrated purple background, stays within the Drill card. The header pattern is smaller and quieter. Shortcut cards remain links, with their arrow badges and the section's "Semua" link removed.
- The later owner refinement uses the shared UI library's gold star icon in the XP chip, a smaller visible hero action with its 44 px hit target, closer shortcut icon/title spacing, and 16 px Home section headings on mobile. The two-card hero wraps in both directions.
- The latest owner refinement removes the hero's arrow and pause/play controls. Drill and Tryout now each show the other card peeking only on the right; slide indicators, touch swipes, and timed looping remain. Autoplay pauses while hovered or focused and when the page is hidden or reduced motion is requested.
- The page uses the existing Next.js, shared UI primitives, Plus Jakarta Sans, and scoped CSS. No score, eligibility, XP policy, or assessment action is computed in the browser.

## Asset provenance

- `header-pattern.png`, `header-bell.svg`, and `header-announcement.svg` are unmodified exports returned for Figma node `2574:212`.
- `reference-*.png` files are crops of the image atlas embedded in the owner-supplied `Numora (3).html`; each crop keeps its original pixels and aspect ratio. Dynamic student avatars remain account or shared-avatar data, never sample portraits.
- The earlier internal `drill-owl.svg` and `tryout-owl.svg` remain in the worktree as historical assets from the previous Home iteration; the refined Home uses the supplied HTML art.

## Verification

Check the `/student` layout at 320, 390, 768, and 1440 px; asset loading and geometry; keyboard and reduced-motion carousel behavior; Mandiri and School states; unavailable/pending Tryout; XP zero and fractional amounts; notification, assessment, class ranking, and feedback links. Tests and screenshots use labeled fixtures, not product defaults.

The compact-hero refinement passed Playwright visual composition checks at 320, 390, and 1440 px, including the Tryout action staying inside its card. The Home loading/error flow, Home shortcut unit case, targeted ESLint, web TypeScript checking, Prettier checking, and the production web build passed.

The subsequent XP, spacing, type, and looping refinement passed carousel unit tests and Playwright checks at 320, 390, 768, and 1440 px. The browser checks cover looping and the Home loading/error flow. Targeted lint, TypeScript, and Prettier checks passed.

The right-only peek and simplified controls passed Home carousel unit tests and Playwright checks at 320, 390, and 1440 px, including both active slides and the loading/error flow. Targeted lint, TypeScript, Prettier, and the production web build passed.
