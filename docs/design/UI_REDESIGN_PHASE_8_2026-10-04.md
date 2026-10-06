# UI redesign — Phase 8: Auth, callback and onboarding

**ENGINEERING DECISION — final owner instruction, 7 October 2026:** remove the entire `auth-welcome-art` block (formula, owl and spark) from the shared AuthFrame at all widths, including login, callback and onboarding. Keep the owl in the header. This supersedes the initial mobile-only hiding request.

**ENGINEERING DECISION — owner follow-up, 7 October 2026:** the login card starts with “Mulai bersama NUMORA”; remove its graduation icon, “Selamat datang” eyebrow, audience note and one-time-role note. Keep the onboarding account note. These are presentation changes only.

**ENGINEERING DECISION — owner follow-up, 7 October 2026:** Google authentication loading uses a compact circular spinner instead of the rotating rounded-square outline. Hide the decorative lock while loading; retain status text and reduced-motion support.

**ENGINEERING DECISION — owner follow-up, 7 October 2026:** NUMORA header branding on authentication screens, including Admin/QA login, links to `/` as the public home/login entry. Use Next.js Link with an accessible label, existing focus styles and the shared minimum touch target. Navigation retains the existing session-based destination resolver.

**ENGINEERING DECISION — 4 October 2026:** the owner approved continuing from Phase 7 to Phase 8. Login, callback and first-time role selection now use the approved Student visual language. None of the 21 supplied screenshots covers Auth; this is a derived design, not a verified match to an unavailable Auth Figma frame. Phase 9 Admin remains a separate review gate.

## 1. Files changed

- [Auth screens](../../apps/web/src/features/onboarding/screens.tsx): recompose LoginScreen, CallbackScreen and OnboardingScreen; registration keeps Google identity read-only and native role radios. Buttons expose pending state; role selection is disabled during registration. Logout adds an optional full-width presentation prop; its default preserves Teacher verification.
- [Auth presentation](../../apps/web/src/features/onboarding/auth-presentation.tsx): pure AuthFrame, AuthStatus and GoogleIdentity composition; no queries, auth decisions, session or API ownership.
- [Composition CSS](../../apps/web/src/app/numora.css): scoped `auth-*` styles use existing tokens, local font, card/button/icon primitives and 700/960 breakpoints. Existing narrow-width adjustment hides decorative artwork at 320 px; smaller artwork and constrained title bounds prevent overlap at 360 px.
- [Auth screen regression](../../apps/web/src/features/onboarding/screens.test.tsx): six tests for OAuth failure/retry, session retry, StrictMode callback exchange, cancellation, role-only registration/pending/retry and disabled-account logout.
- [Auth browser regression](../../apps/web/e2e/auth.spec.ts): synthetic Supabase/REST fixtures exercise the real SDK/AuthProvider, PKCE, registration, role destinations and responsive states. No runtime auth bypass is introduced.
- [Design README](README.md), [baseline ledger](UI_REDESIGN_BASELINE_2026-10-03.md), [design-system addendum](NUMORA_UI_DESIGN_SYSTEM.md) and this report.

No dependency, new static asset, API contract, generated type, backend, database, scoring, authorization, commit, push, PR or deployment change. Earlier additive DEMO learning seed remains intact; this phase needs no additional cloud data.

## 2. Screens implemented

| Route            | Presentation and states                                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`              | Purple welcome/header and white login card; Google launch, pending session, OAuth error, identity retry, expired session and disabled-account exit                                      |
| `/auth/callback` | Focused loading/error card; cancelled, missing and expired code recovery; success returns to the existing root destination resolver                                                     |
| `/onboarding`    | Read-only Google name/email, two native Siswa/Guru choices, selected/focus/pending state, role validation, registration error/retry, session loading/error/disabled recovery and logout |

Mobile uses one column, 16 px card gutter and a 24 px card radius. At 768 px the form is centered within a controlled column under the welcome area. At 960 px and above the welcome/context panel and form become two columns in a 1080 px layout. Form width is capped at 480 px; desktop paragraphs are not stretched across the viewport.

## 3. Visual deviations

**ENGINEERING DECISION:** purple/ivory/white/lavender, Plus Jakarta Sans, shared controls and the existing owl asset follow the approved Student-derived direction. Typography and composition are checked against that language; exact Auth pixel fidelity cannot be measured without Auth reference frames. No substitute illustration or screenshot crop is created.

The small-screen owl is smaller than its desktop counterpart and hidden at 320 px to preserve text reflow. Native radios preserve keyboard behavior; the entire choice card provides the visible focus outline. The loading outline stops animating with reduced motion.

Development-only Admin preview remains under its existing `NODE_ENV` gate. Screenshots captured with the browser development server therefore include that link on Login; it is not a new public feature or registration option. The QA link retains its original project-specific development gate. Callback screenshots display generic recovery copy without provider error parameters or authorization codes.

## 4. Functionality preserved

**PRD RULE:** Student and Teacher authenticate through Google; role registration is one-time, Teacher features require school verification, and Admin identity is internally provisioned. Student Mandiri is a valid destination without compulsory class joining. The existing server identity determines role, status and verification.

`AuthProvider`, `getSupabase`, `destination`, generated identity DTOs and `getIdentity/registerIdentity` are unchanged. Google `signInWithOAuth` still uses `provider: 'google'` and the current origin's `/auth/callback`. The callback still exchanges its code once with the existing StrictMode guard. PKCE, session persistence/refresh, timeout, sign-out and account-switch isolation remain in the existing infrastructure.

Registration sends only `{ role }` through the existing API; no editable display name/email, password login, Admin role choice or browser authorization is added. Failed registration retains the selected role; pending submission disables role changes and another submit. Session failures retry identity checking, and an expired API session still clears local auth before offering Google login.

Before implementation, the [Supabase changelog](https://supabase.com/changelog.md), [Google authentication guide](https://supabase.com/docs/guides/auth/social-login/auth-google) and [code exchange reference](https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession) were checked. No applicable library/auth migration was needed for this visual phase.

## 5. Verification

| Check                                  | Result                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository ESLint, zero warnings       | Passed                                                                                                                                                  |
| Web TypeScript / Next route generation | Passed                                                                                                                                                  |
| Frontend Vitest                        | 18 files / 130 tests passed                                                                                                                             |
| Production web build                   | Passed; 21 static pages generated                                                                                                                       |
| Auth browser regression                | 20 distinct flows verified: 19 passed in the final 20-test run, corrected Student registration assertion passed separately                              |
| Existing cross-role browser regression | 12 passed: login, Teacher logout/profile restrictions, short/legacy verification and pending identity, four role guards, Admin school/token at 390/1440 |
| Visual evidence                        | 46 PNGs + 46 geometry records; all nine widths; zero horizontal overflow                                                                                |
| Formatting, local links, whitespace    | Passed                                                                                                                                                  |

Initial browser runs identified incomplete catalog data in the new synthetic dashboard fixture and registration assertions that matched two Mandiri labels or a hidden sidebar link. The fixture and selectors now use the complete catalog shape and visible semantic profile/Drill links. These were test-harness failures; no dashboard/runtime behavior was changed to satisfy them. Passing flows were not unnecessarily repeated. This is not a claim that all 32 verified browser flows passed in one invocation.

Auth coverage includes the actual SDK-generated Google provider/origin callback/S256 challenge, PKCE token exchange and session persistence, callback error/recovery, read-only long Google identity, native radio keyboard selection, role-only payload, pending/retry behavior, disabled/expired sessions and Student/Teacher/Admin destinations. Existing AuthProvider tests retain repeated-session, timeout, 401 and account-switch checks. Browser page-error assertions passed on successful runs.

Widths: **320, 360, 390, 393, 430, 768, 1024, 1280, 1440**. At 390 px the form card is x=16, width=358 and radius=24. At 1440 px the form is 480 px wide. Mobile, tablet, narrow long-identity and desktop captures were inspected; brand contrast and the 360 px heading/art overlap were corrected before final evidence.

## 6. Remaining issues

**OPEN:** Auth Figma frames and prototype states remain unavailable; exact frame comparison requires that handoff. Synthetic SDK/API fixtures do not establish a real Google consent flow, deployed provider/redirect configuration, live account registration or server authorization. Those integration checks and owner/peer review remain release gates. Product OPEN decisions are unchanged.

Phase 8 is ready for review. Phase 9 Admin has not started.

## 7. Screenshots

All captures and geometry are under ignored `.tmp/redesign-phase8`. They use synthetic identities and contain no real user information or credentials. Callback captures do not include browser URL chrome.

| Screen           | Mobile 390 px                                                   | Desktop 1440 px                                                   |
| ---------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| Login            | [Mobile](../../.tmp/redesign-phase8/login-390.png)              | [Desktop](../../.tmp/redesign-phase8/login-1440.png)              |
| Onboarding       | [Mobile](../../.tmp/redesign-phase8/onboarding-390.png)         | [Desktop](../../.tmp/redesign-phase8/onboarding-1440.png)         |
| Selected Teacher | [Mobile](../../.tmp/redesign-phase8/onboarding-teacher-390.png) | [Desktop](../../.tmp/redesign-phase8/onboarding-teacher-1440.png) |
| Callback error   | [Mobile](../../.tmp/redesign-phase8/callback-error-390.png)     | [Desktop](../../.tmp/redesign-phase8/callback-error-1440.png)     |

Additional captures cover callback loading/expired code, Student/Teacher registration failure, identity error, inactive/expired session, onboarding error/loading and long Google identity at 320 px.
