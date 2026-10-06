# Student Home HTML and Figma refinement — 7 October 2026

**ENGINEERING DECISION — owner direction:** `/student` follows the composition and artwork of the supplied `Numora (3).html`. The Drill/Tryout hero keeps a gentle asymmetric silhouette inspired by the supplied `Numora.html`. Header arrangement, geometric pattern, purple treatment, and announcement follow Figma node `2574:212` in `UIUX-NUMORA` and the supplied header image. The owner clarified that the gem is omitted and the Figma account level is replaced by the existing Drill progress.

**PRD RULE:** All Home values and actions remain server driven. The sample names, XP, scores, ranks, question counts, and Tryout state in the supplied HTML/Figma are visual examples only. Account XP is the sum of immutable `xp_ledger.xp_amount` entries; decimal precision is preserved in the API and Indonesian display. Class leaderboard XP remains period scoped and is not used as the account total.

## Implementation boundary

- The Home header shows the account avatar/name, current school or Mandiri, total XP, Drill level progress, notifications, and a Tryout announcement only for an open or in-progress package. It has no gem or account-level policy.
- Hero, shortcuts, activity, class ranking, and feedback use the supplied composition and art, while keeping the existing API destinations, loading/error/empty states, five-item Student navigation, and carousel controls.
- The owner requested a compact Home hero: its height is approximately half the previous treatment (160 px on narrow screens, 180 px on wider screens). The full supplied owl image, including its illustrated purple background, stays within the Drill card. The header pattern is smaller and quieter. Shortcut cards remain links, with their arrow badges and the section's "Semua" link removed.
- The later owner refinement uses the shared UI library's gold star icon in the XP chip, a smaller visible hero action with its 44 px hit target, closer shortcut icon/title spacing, and 16 px Home section headings on mobile. The two-card hero wraps in both directions.
- The latest owner refinement removes the hero's arrow and pause/play controls. Drill and Tryout now each show the other card peeking only on the right; slide indicators, touch swipes, and timed looping remain. Autoplay pauses while hovered or focused and when the page is hidden or reduced motion is requested.
- The owner supplied a new owl image for the Drill hero. Its purple illustration is rendered as the card background with a zoomed crop that keeps the source image's white outer margins outside the card. The carousel follows the supplied HTML's five-card clone sequence, right-side peek, anticipation/snap/settle timing, drag threshold, keyboard navigation, and seamless wrap.
- **ENGINEERING DECISION — owner refinement:** the Home Tryout hero uses the supplied blue checklist/stopwatch banner as its background, cropped in CSS to exclude white outer margins. White text and a subtle dark overlay on the left preserve readability; the existing status and action destinations remain server driven.
- **ENGINEERING DECISION — owner refinement:** Shortcut Belajar cards follow `Numora_student_redesign_fixed.html`: lavender/blue/mint gradients for Latihan Soal/Tryout/PvP, fine borders, 128 px desktop minimum height, compact 94 px mobile and 90 px narrow-screen minimum heights, proportionate artwork, and smaller labels. Cards keep their existing destinations and the previously approved removal of arrow badges and the section's "Semua" link.
- The page uses the existing Next.js, shared UI primitives, Plus Jakarta Sans, and scoped CSS. No score, eligibility, XP policy, or assessment action is computed in the browser.

## Asset provenance

- `header-pattern.png`, `header-bell.svg`, and `header-announcement.svg` are unmodified exports returned for Figma node `2574:212`.
- `reference-*.png` files are crops of the image atlas embedded in the owner-supplied `Numora (3).html`; each crop keeps its original pixels and aspect ratio. Dynamic student avatars remain account or shared-avatar data, never sample portraits.
- `drill-owl-background.png` is an unmodified copy of the owner-supplied `Burung Hantu Ungu Belajar Matematika.png`. CSS crops its white border at display time.
- `tryout-exam-background.png` is an unmodified copy of the owner-supplied `Spanduk Biru Checklist dan Stopwatch Ujian.png`. CSS crops its white border at display time.
- The earlier internal `drill-owl.svg` and `tryout-owl.svg` remain in the worktree as historical assets from the previous Home iteration; the refined Home uses the supplied HTML art.

## Verification

Check the `/student` layout at 320, 390, 768, and 1440 px; asset loading and geometry; keyboard and reduced-motion carousel behavior; Mandiri and School states; unavailable/pending Tryout; XP zero and fractional amounts; notification, assessment, class ranking, and feedback links. Tests and screenshots use labeled fixtures, not product defaults.

The compact-hero refinement passed Playwright visual composition checks at 320, 390, and 1440 px, including the Tryout action staying inside its card. The Home loading/error flow, Home shortcut unit case, targeted ESLint, web TypeScript checking, Prettier checking, and the production web build passed.

The subsequent XP, spacing, type, and looping refinement passed carousel unit tests and Playwright checks at 320, 390, 768, and 1440 px. The browser checks cover looping and the Home loading/error flow. Targeted lint, TypeScript, and Prettier checks passed.

The right-only peek and simplified controls passed Home carousel unit tests and Playwright checks at 320, 390, and 1440 px, including both active slides and the loading/error flow. Targeted lint, TypeScript, Prettier, and the production web build passed.

The HTML-matched carousel and new Drill image passed Home carousel unit tests and Playwright layout and asset checks at 320, 390, and 1440 px. The browser check also verifies mouse drag wrapping at 390 px and the loading/error flow. Targeted lint, TypeScript, Prettier, and the production web build passed.

The shortcut-card refinement passed Playwright checks at 320, 390, 768, and 1440 px, with screenshots reviewed for artwork, spacing, borders, and label fit. Targeted lint and Prettier passed. At this verification, workspace typecheck and production build were blocked by missing `hasNext` fields in Admin fixtures (`e2e/admin.spec.ts` and initially `src/features/admin/content.spec.tsx`); the web build compiled successfully before the unrelated type gate failed.

The blue Tryout background passed browser checks at 320, 390, and 1440 px, including image loading, right-side peeking, navigation, and loading/error states. Screenshots confirm that the white source margins are outside the visible card. The error panel uses compact shared-Card styling so its retry action stays inside the hero; the recovery button geometry check passed. Targeted lint, TypeScript, Prettier, and the production web build passed.
