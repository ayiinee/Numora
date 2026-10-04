# Phase 6 — Student Profile, Settings and Feedback

**ENGINEERING DECISION — 4 October 2026:** the owner approved continuing after Phase 5. Implement only Phase 6a Profile/Join Class/logout and Phase 6b the complete Student feedback inbox against the approved [screenshot baseline](UI_REDESIGN_BASELINE_2026-10-03.md). The supplied Profile/Feedback PNGs are visual references, not product rules. Full Figma metadata remains unavailable. Phase 7 has not started.

## 1. Files changed

Earlier uncommitted phases remain intact.

| Files                                                                                                             | Change                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/core-learning/profile.tsx`                                                                 | Recompose account screen; existing Join Class payload, validation, identity refresh/cache invalidation, logout/destination retained. Reuse existing dashboard/current Tryout query keys for real statistics and affiliation detail |
| New `account-presentation.tsx`                                                                                    | Context header, purple identity/progress card, statistics, Tryout state, settings composition; data and callbacks come from the feature controller                                                                                 |
| New `feedback-inbox.tsx`, `feedback-card.tsx`, `feedback-queries.ts`                                              | Paginated list, summary, loaded-page filters, explicit read mutation with matching ACK, error/retry/empty/loading states; generated DTOs and existing NestJS endpoints                                                             |
| New `app/student/feedback/page.tsx`                                                                               | Student inbox destination protected by existing StudentAccess                                                                                                                                                                      |
| `feedback-overview.tsx`; `components/shell/app-shell.tsx`                                                         | Share existing summary query; add Home inbox link and desktop Catatan Guru navigation; mobile navigation remains the approved five items                                                                                           |
| `packages/ui/src/card.tsx`, `list-row.tsx`, `icon.tsx`, `tokens.css`; `app/numora.css`                            | Backward-compatible Card background/radius/border/shadow/padding variables; optional ListRow text reflow; shared settings icon/profile surface; scoped responsive composition                                                      |
| New `account.test.tsx`, `e2e/account.spec.ts`; `redesign.test.tsx`, `e2e/student.spec.ts`, `playwright.config.ts` | Explicit read/ACK/retry, pagination/account isolation, Join Class/logout regression, keyboard and viewport evidence; updated visual labels/navigation assertions; global browser timeout accommodates added flows                  |
| This report, design README/baseline/design-system note                                                            | Scope, states, verification, deviations and evidence                                                                                                                                                                               |

No backend/API contract/generated types, authorization, schema/migrations, scoring, progress rules, IRT, PvP protocol, worker/outbox or production gate changed. No Supabase data write/seed occurred in Phase 6. The earlier authorized DEMO Drill seed remains unchanged.

## 2. Screens implemented

| Screen/state           | Route/composition                                                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| School Student Profile | `/student/profile`; purple header and identity, real school/class and completed-level progress, latest Drill score and completed levels, current Tryout state, report/history CTA, account/learning rows, logout                    |
| Mandiri Profile        | Same route; Mandiri identity, optional Join Class form, real progress and equal access entry points without forced affiliation                                                                                                      |
| Account settings       | Inline semantic account/class disclosures; Google identity information and existing learning/history/Tryout destinations; no unsupported edit/transfer/certificate/help controls                                                    |
| Feedback inbox         | `/student/feedback`; contextual back header, filters, teacher/time/read status, lavender plain-text message cards, explicit read, offset pagination, summary and refresh                                                            |
| Loading/empty/error    | Independent profile data failures keep account/logout accessible; inbox skeleton, empty list/filter, denied/session-expired page, retained pages on pagination/refetch failure, row read failure/retry, independent summary failure |

Mobile keeps one column and reference section order. Tablet at the existing 700 breakpoint splits Profile overview/settings; feedback remains a controlled reading column. Desktop uses the existing sidebar, two Profile columns, and a feedback reading area/context summary panel inside the 1180 px maximum. Existing 960 breakpoint controls desktop navigation.

## 3. Reference comparison and deviations

Reference crops are inferred rather than measured Figma frame metadata: Profile `(20,16,410,1241)` and Feedback `(12,1,402,1654)`, both 390 px wide without resizing. Overlays and side-by-side comparisons check header, gutter, card bounds, wrapping, hierarchy, radius and spacing. No screenshot or crop is used as application UI/assets.

- Profile uses real authenticated name/email/Google avatar metadata with initials fallback. Account level, currency, XP bar, aggregate accuracy, teacher name/class size/join code and achievements are absent from the DTOs and are not fabricated. The corresponding visual slots use server completed-level progress and **latest Drill score**, explicitly labeled rather than renamed average accuracy.
- Profile header uses a functional settings anchor. Settings expose real account/class information with native keyboard disclosures and existing destinations. No fake avatar edit, certificate, help or separate Settings route is added. Material access and optional Join Class are retained.
- Tryout shows current API state and links to its available attempt/result where appropriate. No score/IRT passing grade, premium or predicted academic status is inferred; waiting results remain waiting.
- Student profile surface `#f7f8fc` is sampled from the PNG and centralized in shared tokens. Purple identity, white settings, paired stats and secondary lavender Tryout retain screenshot hierarchy. Shared Card customization fixes inline primitive style conflicts without replacing the primitive.
- Feedback header is correctly titled Catatan Guru rather than the screenshot's recycled Hasil Duel PvP. Teacher initials replace unavailable photos. Teacher role/class, associated Drill/Tryout/attempt/question, mastery/stars/XP and deep action targets are not in FeedbackDto and are omitted.
- Message body is displayed as escaped plain text with line breaks and wrapping. It is not parsed into HTML/links/formatting or mined to invent product actions.
- Filter count for Semua is the number of loaded distinct messages. Unread count comes from the global summary; filtering applies only to loaded pages and explicitly explains that more pages may contain unread messages. Unsupported Drill/Tryout filters are not added.
- Additional summary/refresh and pagination controls provide necessary missing states. Actual card height depends on real content and supported sections; artificial empty canvas is not copied from the export.
- Touch targets remain at least 44 px, input labels/focus are visible, long account text reflows, and fixed bottom nav reserves bottom space. Full-page browser screenshots use a 900 px viewport, so fixed navigation appears at that viewport boundary rather than the export's document bottom.

## 4. Functionality preserved and added interface safety

**PRD RULE:** Google login, one-class membership, optional Mandiri Join Class, historical progress, teacher-to-Student one-way feedback, and own-message access remain server controlled. Class self-transfer/leave remains OPEN-08/OPEN-15; no UI invents a policy.

**ENGINEERING DECISION:** use [existing feedback operations](../api/FERDI_FEEDBACK_OPERATIONS.md) and generated `FeedbackDto`, `FeedbackListDto`, `FeedbackSummaryDto`, `ReadFeedbackDto`.

- List uses `GET /students/me/feedback?limit=20&offset=...`, follows server `nextOffset`, preserves earlier pages on failure and deduplicates IDs without reordering server entries. Offset pagination retains the backend's documented concurrent-dataset limitations.
- Summary uses the unchanged `student-feedback-summary` cache key and GET endpoint shared with Home. Loading previews/list/filtering sends no read request.
- Read uses only `POST /students/me/feedback/{id}/read`; no actor or body/score fields are sent. Concurrent clicks are guarded. There is no optimistic false success: matching ID/valid server timestamp are required, then the list cache is updated and summary invalidated. Failure retains unread state and retry. The backend preserves the first read timestamp.
- Pending reads disable conflicting read/load/refresh actions; active list/summary fetches are cancelled before mutation so stale responses cannot overwrite the acknowledged local cache update. In the unread filter, successful removal restores focus to the filter and announces completion.
- Existing StudentAccess uses an account-keyed LearningProvider; switching identity clears private list/summary data and pending old-account requests cannot populate a new account's cache. Signed-out and foreign-role destinations retain existing guards.
- Join Class trims the code and retains current 6-character/legacy validation and case handling, POST endpoint, full invalidation and authoritative identity refresh. Failed input remains editable. Successful join does not derive affiliation from form input.
- Logout uses the existing AuthProvider and `/` destination; failure stays on Profile with retry. Profile data errors do not remove Join Class/logout controls.

Test fixtures are synthetic and isolated in unit/browser harnesses. They do not establish real Google OAuth, live NestJS authorization/persistence, cloud feedback delivery or release acceptance. No runtime auth bypass or browser business Data API is introduced.

## 5. Verification

Node 24/pnpm 12.6.0. Heavy checks run sequentially after an initial memory-allocation failure while checks ran concurrently.

| Check                             | Result                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Frontend unit suite               | **16 files / 118 tests passed**                                                                            |
| Repository lint                   | **Passed, zero warnings**                                                                                  |
| Web/shared UI typecheck           | **Passed**                                                                                                 |
| Focused account browser           | **11 flows passed after final geometry polish**                                                            |
| Full browser regression           | **84 unique flows verified**: 81 passed initially; three corrected selectors passed in final 14-flow rerun |
| Production build                  | **Passed**                                                                                                 |
| Formatting/local links/whitespace | **Passed**                                                                                                 |

Final measured 390 px Profile geometry: header `(0,0,390,64)`; identity card `(16,80,358,240.28)` with 24 px radius; stat cards 173 px wide/14 px radius; settings `(16,594.25,358,457.73)` with 20 px radius. Comparison with the inferred PNG crop confirms the main gutter/header/card geometry; unsupported content and minimum touch targets remain the deviations above.

Screenshots/geometry cover Profile School/Mandiri, all/unread/read/empty feedback at 320, 360, 390, 393, 430, 768, 1024, 1280 and 1440 px, plus read-error/forbidden at 390 (**56 captures**). Capture assertions reject horizontal body overflow and browser runtime errors. Browser coverage includes keyboard account disclosure, explicit read/no-auto-read, focus restoration, pagination and read retry, retained messages on refetch failure, identity-refresh join and guarded logout.

The initial full browser run exposed three selectors that matched multiple old/new affiliation labels. Those assertions now target the visible authoritative affiliation badge while retaining the identity refresh, class dashboard and removed-route checks. The final rerun passed all 14 flows: those three corrected assertions and all eleven account flows after presentation-only spacing polish. The remaining 70 flows passed the preceding full run; they were not repeated after the final account-only spacing change.

Unit coverage checks mismatched ACK, lost/failed read, no optimistic success, double clicks, server offsets, retained pages, deduplication, loaded-only filtering, account changes, signed-out access, score zero, pending IRT, invalid join input and logout retry. Existing Student/Mandiri/School/Teacher/Admin assessment and PvP regressions remain in the full suite. Backend integration is separate because backend/schema/contracts are unchanged.

## 6. Remaining issues and next gate

Original avatar/hero metadata and full Figma component/frame access remain unavailable. Editable profile, self-transfer, certificates/help, message-to-attempt context/filters and unsupported account currency/XP/accuracy require actual approved capabilities/contracts. No unresolved product decision is resolved by visual copy.

Phase 6 awaits owner review before Phase 7 — Teacher. No commit, push, PR, deployment or database write occurred.

## 7. Screenshot evidence

Ignored local artifacts use synthetic identities and are not automatically available in other checkouts. Each of the six main states also has all nine viewport widths and geometry JSON.

| State               | Mobile 390                                                | Desktop 1440                                               |
| ------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| School Profile      | [PNG](../../.tmp/redesign-phase6/profile-school-390.png)  | [PNG](../../.tmp/redesign-phase6/profile-school-1440.png)  |
| Mandiri Profile     | [PNG](../../.tmp/redesign-phase6/profile-mandiri-390.png) | [PNG](../../.tmp/redesign-phase6/profile-mandiri-1440.png) |
| All feedback        | [PNG](../../.tmp/redesign-phase6/feedback-all-390.png)    | [PNG](../../.tmp/redesign-phase6/feedback-all-1440.png)    |
| Unread filter       | [PNG](../../.tmp/redesign-phase6/feedback-unread-390.png) | [PNG](../../.tmp/redesign-phase6/feedback-unread-1440.png) |
| After explicit read | [PNG](../../.tmp/redesign-phase6/feedback-read-390.png)   | [PNG](../../.tmp/redesign-phase6/feedback-read-1440.png)   |
| Empty inbox         | [PNG](../../.tmp/redesign-phase6/feedback-empty-390.png)  | [PNG](../../.tmp/redesign-phase6/feedback-empty-1440.png)  |

Additional evidence: [read failure](../../.tmp/redesign-phase6/feedback-read-error-390.png), [forbidden](../../.tmp/redesign-phase6/feedback-forbidden-390.png), [Profile comparison](../../.tmp/redesign-phase6/profile-school-comparison-390.png), [Feedback comparison](../../.tmp/redesign-phase6/feedback-all-comparison-390.png), and [geometry aggregate](../../.tmp/redesign-phase6/visual-checks.json). Both comparisons also have overlays.
