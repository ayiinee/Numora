# NUMORA UI DESIGN SYSTEM

**ENGINEERING DECISION — Operations reference, 7 October 2026:** the owner requested Operations redesign using the existing Content AdminLTE style. `admin-workspace-shell` shares the white/purple/grey theme from `apps/web/src/app/admin-content.css` between Content and Operations. `apps/web/src/app/admin-operations.css` scopes Operations list/detail layouts, filters and school creation disclosure. Content retains its presentation; Super and other areas retain their theme. This supersedes earlier statements that Operations still awaits this visual iteration. [Operations scope and acceptance](ADMIN_OPERATIONS_UX_2026-10-07.md).

**ENGINEERING DECISION — Admin Content reference, 6 October 2026:** the owner supplied an AdminLTE-style desktop/tablet/mobile screenshot and requested Content-role redesign first. `apps/web/src/app/admin-content.css` now owns its scoped purple (`#6200d9`), white surfaces, cool grey canvas (`#f7f8fa`), compact 6–12 px radii and white topbar. These replace conflicting shared visual values for `CONTENT_DATA_MODERATION` only. Existing Numora branding, local typography and UI primitives remain. Operations, Super Admin and other areas keep their theme. This does not restore Content Ringkasan/Analytics or the removed page banner. See [Content scope and evidence](ADMIN_CONTENT_UX_2026-10-06.md#adminlte-reference-redesign).

**ENGINEERING DECISION — Teacher redesign, 4 October 2026:** the owner authorized Teacher frontend phases 1–8 without interim review. Teacher follows the supplied Desktop/Mobile PNGs with scoped blue tokens in `apps/web/src/app/teacher.css`. This replaces conflicting Student-derived Teacher values only. Student/Admin keep the shared palette below. See the [Teacher audit](TEACHER_REDESIGN_AUDIT_2026-10-04.md) and [complete report](TEACHER_REDESIGN_COMPLETE_2026-10-04.md). Sampled palette and provisional geometry are identified separately; no product rule or missing API capability is invented.

**ENGINEERING DECISION — approved screenshot redesign, 3 October 2026:** the [current redesign baseline](UI_REDESIGN_BASELINE_2026-10-03.md) supersedes conflicting visual values below. Phase 1 applies local Plus Jakarta Sans, semantic lavender surfaces, 20 px cards, 44 px control targets, and Belajar / Materi / Tryout / PvP / Profil navigation. Canonical runtime values live in `packages/ui/src/tokens.css`; see the [foundation report](UI_REDESIGN_PHASE_1_2026-10-03.md). The original team baseline is retained below as historical guidance. This visual decision does not approve OPEN product policies.

**Version:** 0.1 - Parallel Engineering Baseline

**ENGINEERING DECISION — Phase 4, 4 October 2026:** measured Tryout PNG surfaces add `--color-surface-muted` (`#f8f7fc`, catalog) and `--color-surface-cool` (`#f3f6fa`, detail) to the existing tokens. These preserve the supplied screen-specific neutral surfaces without changing other screens. See the [Phase 4 report](UI_REDESIGN_PHASE_4_2026-10-04.md); original Figma metadata remains unverified.

**ENGINEERING DECISION — Phase 5, 4 October 2026:** PvP shares translucent header surface/border tokens and a deep green hero token in `packages/ui/src/tokens.css`, with existing purple/success/warm tokens for difficulty variants. Podium and question choice primitives are extended without parallel libraries. See the [Phase 5 report](UI_REDESIGN_PHASE_5_2026-10-04.md); screenshot metadata/assets and production PvP policies remain unresolved.

**Date:** 28 September 2026

**Product:** NUMORA - Sistem Drill & Practice untuk Tes Kemampuan Akademik Siswa SMP

**Purpose:** Shared visual and implementation contract for UI/UX, Software, QA, and AI coding agents while design and development run in parallel.

**Status:** Engineering baseline, not a replacement for future approved UI/UX handoff.

---

## Table of contents

- 0. How to use this document
- 1. Visual reference summary
- 2. Brand identity
- 3. Color system
- 4. Typography
- 5. Spacing and layout tokens
- 6. Responsive system
- 7. Iconography and illustration
- 8. Motion and interaction
- 9. Core component library
- 10. Learning-specific components
- 11. Screen patterns
- 12. State model
- 13. Accessibility baseline
- 14. Content and microcopy
- 15. Figma Community / Duolingo-inspired reuse policy
- 16. Implementation architecture for Software
- 17. AI coding-agent contract
- 18. Parallel UI/UX <-> Software workflow
- 19. Product-aware UI guardrails from latest feature PRDs
- 20. Review checklist
- 21. Reference assets and implementation notes
- 22. Open items to be finalized by UI/UX
- 23. Compact instruction block for repository AI guidance
- 24. Change policy

## 0. How to use this document

This document is the default UI implementation rule for NUMORA when the final page-level mockup is not yet available.

Use it to:

- build functional frontend screens without drifting away from the UI/UX direction;
- give Codex, Antigravity, or another coding agent a stable design context;
- standardize colors, spacing, radii, components, states, navigation, and responsive behavior;
- minimize rework when final UI/UX mockups are merged in the next sprint;
- review whether a screen feels like NUMORA even when it was produced by different developers or AI agents.

This document **does not define product behavior**. Product behavior comes from the latest PRD.

### 0.1 Source precedence

When information conflicts, follow this order:

1. **Latest PRD** - product behavior and access rules.
2. **Latest approved Figma/UI/UX handoff** - final screen-specific layout and interaction.
3. **This design system** - shared styling, component, responsive, and accessibility baseline.
4. **Existing repository implementation** - only when still compatible with the above.
5. **External Figma Community/UI-kit references** - inspiration and reusable pattern source only.

### 0.2 Current product sources

Product baseline:

- PRD v0.5: `https://docs.google.com/document/d/1c2LudkksGK1SbY9aX4IuDfomwozzZGyy/edit`
- System Design: `https://docs.google.com/document/d/1NLwZGaElhYTTG7kzUZ2ATHf9J7UN-Zy9bJ4GbLIPndE/edit`

The current PRD describes a responsive web product. Therefore, mobile mockups are a **visual language reference**, not a requirement to implement a mobile-only fixed canvas.

### 0.3 Design-system philosophy

NUMORA should feel:

- **Creative** - visually distinctive, not a generic school portal.
- **Warm** - learning should feel inviting rather than exam-like.
- **Optimistic** - progress and mastery should feel visible and rewarding.
- **Youthful** - suitable for SMP students without becoming childish.
- **Clear** - academic tasks, states, and next actions must be immediately understandable.
- **Consistent** - the same action, state, or hierarchy should look and behave the same everywhere.

The intended product personality can be summarized as:

> Creative, warm, optimistic, focused, and encouraging.

---

# 1. Visual reference summary

The supplied concept screens establish several strong patterns:

1. Warm ivory page backgrounds.
2. White/pearl surfaces for cards and functional content.
3. Vibrant purple as the dominant primary action.
4. Peach and golden yellow as emotional/reward accents.
5. Soft purple for secondary surfaces, tabs, and progress.
6. Rounded cards, buttons, list rows, controls, and navigation.
7. Color-coded subject/category icons inside circular or rounded containers.
8. Large friendly illustration zones on dashboard, pretest, tryout, help, and game-oriented screens.
9. Compact mobile information hierarchy with a persistent navigation region.
10. Repeated learning patterns: progress, level, score, XP/reward, list rows, assessment options, and call-to-action buttons.

The supplied screen inventory includes visual directions for:

- Student home/dashboard
- Learning/material list
- Assessment question
- Class leaderboard
- Minigame/PvP entry
- Profile
- Pretest
- Tryout
- Explanation/review
- Practice history
- Settings
- Help

These are **reference patterns**, not proof that every shown label or behavior is current product policy. Always check the PRD.

---

# 2. Brand identity

## 2.1 Name

Use **NUMORA** as the product name unless a newer product decision explicitly changes it.

Do not use old placeholder names such as `TKA Math SMP`, `LMS TKA`, or other previous working names in production UI unless the team explicitly asks for them.

## 2.2 Logo

The current brand mark is a geometric owl supplied by the team.

Visual meaning encoded in the mark:

- Owl: knowledge, focus, analysis.
- Geometric construction: mathematics, logic, structure.
- Purple body: main NUMORA identity.
- Peach head accent: warmth and youthful character.
- Golden circular eye elements: progress, energy, optimism.
- Ivory face: calm and approachable learning environment.

### Logo usage rules

Do:

- preserve the original aspect ratio;
- keep sufficient clear space around the mark;
- use the supplied mark rather than redrawing it from scratch;
- place it on neutral/light backgrounds where possible;
- use an icon-only version in compact navigation only if UI/UX has approved that crop/version.

Do not:

- stretch or skew the logo;
- recolor individual geometry ad hoc;
- add shadows, outlines, glows, or gradients without UI/UX approval;
- combine the NUMORA owl with Duolingo assets or mascots;
- use the owl as a decorative pattern so heavily that it reduces readability.

**Bundled reference asset:** `assets/numora-logo.png`

---

# 3. Color system

## 3.1 Canonical brand palette

These values are **source-defined and must not be changed casually**.

| Token                  | Name          |       HEX | Primary role                                                          |
| ---------------------- | ------------- | --------: | --------------------------------------------------------------------- |
| `--numora-purple`      | Sagat Purple  | `#722CCE` | Primary/action color, active navigation, high-emphasis actions        |
| `--numora-purple-soft` | Soft Purple   | `#B88AC9` | Secondary actions, tabs, badges, progress, level accents              |
| `--numora-peach`       | Peach         | `#FA9A71` | Warm highlights, illustration accents, notifications, playful moments |
| `--numora-gold`        | Golden Yellow | `#F8D080` | Rewards, XP, achievements, level-up, streak, milestones               |
| `--numora-ivory`       | Ivory         | `#F6EFCD` | Main warm page background                                             |
| `--numora-pearl`       | Pearl         | `#F3FAF8` | Cards, surfaces, clean neutral sections                               |

## 3.2 Semantic usage

### Sagat Purple - `#722CCE`

Use for:

- primary CTA;
- active navigation;
- selected high-emphasis tabs;
- strong focus/brand accents;
- links when styled as a strong interaction;
- primary progress emphasis where appropriate.

Examples:

- Mulai Latihan
- Selanjutnya
- Mulai Pretest
- Mulai Tryout
- Simpan
- Kirim

Do not use purple as the background for large amounts of body text.

### Soft Purple - `#B88AC9`

Use for:

- secondary surfaces;
- low-emphasis selection;
- badges;
- level labels;
- inactive/secondary progress accents;
- tabs that should feel interactive but not primary.

Do not use Soft Purple for small text on a light background. Its contrast is insufficient for normal body copy.

### Peach - `#FA9A71`

Use for:

- warm illustration regions;
- secondary highlights;
- friendly notifications;
- decorative blocks;
- optional category differentiation.

Peach is an **accent**, not a default text color.

### Golden Yellow - `#F8D080`

Use for:

- achievement/reward contexts;
- stars;
- XP milestones;
- streak and level-up moments;
- positive decorative emphasis.

Do not use Golden Yellow for body text on Ivory/Pearl/white.

### Ivory - `#F6EFCD`

Use for:

- page background;
- large low-information areas;
- calm learning surfaces.

### Pearl - `#F3FAF8`

Use for:

- card surfaces;
- question containers;
- form panels;
- settings list groups;
- neutral dashboard sections.

## 3.3 Accessibility note from contrast checks

Measured contrast against white/light surfaces shows:

- Sagat Purple on white: approximately **7.08:1** - suitable for normal text.
- Sagat Purple on Ivory: approximately **6.12:1** - suitable for normal text.
- Soft Purple on white: approximately **2.79:1** - **not sufficient** for normal body text.
- Peach on white: approximately **2.12:1** - **not sufficient** for normal body text.
- Golden Yellow on white: approximately **1.47:1** - **not sufficient** for normal body text.

Therefore:

- use Purple or a dark neutral for text;
- use Soft Purple, Peach, and Gold mainly as fills, badges, icons, borders, illustrations, or large decorative elements;
- never communicate correctness, failure, lock, or reward using color alone.

## 3.4 Engineering neutral colors - provisional

The source material does not define a full neutral or semantic status palette. Until UI/UX publishes final tokens, Software may use the following **provisional implementation tokens**:

```css
:root {
  --color-text: #2f213d;
  --color-text-muted: #675b72;
  --color-border: #e4ddcf;
  --color-surface: #f3faf8;
  --color-surface-strong: #ffffff;
  --color-bg: #f6efcd;

  --color-success: #2f8f6b;
  --color-warning: #a86d00;
  --color-danger: #b83a45;
  --color-info: #2e6f9e;
}
```

Rules:

- Treat these as semantic fallbacks, not NUMORA brand colors.
- Keep them centralized in tokens.
- Replace them once UI/UX provides approved values.
- Never hardcode these inside feature components.

## 3.5 Full CSS color token baseline

```css
:root {
  --numora-purple: #722cce;
  --numora-purple-soft: #b88ac9;
  --numora-peach: #fa9a71;
  --numora-gold: #f8d080;
  --numora-ivory: #f6efcd;
  --numora-pearl: #f3faf8;

  --color-primary: var(--numora-purple);
  --color-secondary: var(--numora-purple-soft);
  --color-accent-warm: var(--numora-peach);
  --color-reward: var(--numora-gold);
  --color-bg: var(--numora-ivory);
  --color-surface: var(--numora-pearl);
  --color-surface-strong: #ffffff;

  --color-text: #2f213d;
  --color-text-muted: #675b72;
  --color-border: #e4ddcf;
}
```

---

# 4. Typography

## 4.1 Source status

The supplied material defines the visual personality but **does not lock a final typeface**.

Therefore typography below is an **engineering baseline**, not a final brand decision.

## 4.2 Recommended fallback stack

If the repository does not already have an approved font:

```css
--font-sans:
  'Nunito Sans', 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
  sans-serif;
```

Why this baseline:

- rounded/friendly enough for the current youth-oriented visual direction;
- readable for long learning sessions;
- works well in responsive web interfaces.

Do **not** add a new font package if the repository already contains an approved UI/UX typeface. Use the existing approved font instead.

## 4.3 Type scale - provisional implementation baseline

| Token     | Size | Line height |  Weight | Typical usage                       |
| --------- | ---: | ----------: | ------: | ----------------------------------- |
| `display` | 32px |        40px |     800 | Hero greeting, major success state  |
| `h1`      | 28px |        36px |     800 | Page title                          |
| `h2`      | 22px |        30px |     700 | Section title                       |
| `h3`      | 18px |        26px |     700 | Card/feature title                  |
| `body-lg` | 16px |        24px | 600/400 | Main reading text                   |
| `body`    | 14px |        22px | 400/600 | Standard interface text             |
| `label`   | 13px |        18px |     700 | Field labels, tabs, compact actions |
| `caption` | 12px |        16px | 600/400 | Metadata, timestamps, helper copy   |

Guidelines:

- Use boldness for hierarchy, not excessive size jumps.
- Avoid all-caps for primary educational copy.
- Keep assessment question text comfortably readable; never reduce question text merely to fit one screen.
- Allow content to flow vertically on small screens.

---

# 5. Spacing and layout tokens

## 5.1 Base spacing

Use a 4px base grid.

```text
space-0  = 0
space-1  = 4px
space-2  = 8px
space-3  = 12px
space-4  = 16px
space-5  = 20px
space-6  = 24px
space-8  = 32px
space-10 = 40px
space-12 = 48px
space-16 = 64px
```

Default choices:

- Card padding: 16-20px.
- Section gap: 24-32px.
- Form control vertical gap: 12-16px.
- Dense list row: 12px vertical / 16px horizontal.
- Page horizontal padding: 16px mobile, 24px tablet, 32px desktop.

Avoid arbitrary values such as `13px`, `17px`, `29px` unless required by a precise Figma handoff.

## 5.2 Radius system

Current UI direction is rounded and approachable.

```text
radius-sm   = 10px
radius-md   = 14px
radius-lg   = 18px
radius-xl   = 24px
radius-pill = 999px
```

Use:

- Button: 14-18px or pill where the design requires it.
- Card: 16-20px.
- Input: 12-14px.
- Modal/dialog: 20-24px.
- Badge/chip/tab: pill or 12-14px.

Avoid sharp 0-4px corners on student-facing primary surfaces unless a newer UI/UX decision explicitly uses them.

## 5.3 Border

Default border:

```css
border: 1px solid var(--color-border);
```

Use borders to separate surfaces before adding heavy shadows.

## 5.4 Shadow - provisional

NUMORA should feel soft, not glossy or enterprise-heavy.

```css
--shadow-sm: 0 2px 6px rgba(47, 33, 61, 0.06);
--shadow-md: 0 6px 18px rgba(47, 33, 61, 0.1);
```

Guidelines:

- Standard cards: border + `shadow-sm` or border only.
- Floating dialog/popover: `shadow-md`.
- Do not apply a drop shadow to every list row.

---

# 6. Responsive system

## 6.1 Product requirement

NUMORA is a **responsive web application**.

The supplied UI concept is strongly mobile-oriented, so Software must preserve the visual language while adapting information architecture to larger screens.

## 6.2 Engineering breakpoints - provisional

```text
Mobile:  < 640px
Tablet:  640px - 1023px
Desktop: >= 1024px
Wide:    >= 1280px
```

If the repository already has breakpoints, use the existing breakpoint system rather than introducing another one.

## 6.3 Layout behavior

### Mobile

- Single content column.
- Bottom navigation is acceptable for primary student areas.
- 16px page padding.
- Full-width primary CTA when it improves clarity.
- Cards stack vertically.

### Tablet

- Increase content width and whitespace.
- Use 2-column card arrangements when it improves scanability.
- Bottom navigation may remain if UI/UX has not delivered tablet navigation.

### Desktop

Do not simply stretch the mobile screen.

Preferred baseline:

- persistent left/sidebar navigation for authenticated areas if compatible with current app structure;
- centered main content column;
- optional secondary/context panel for progress or detail;
- max content width approximately 1180-1280px;
- educational reading/assessment column approximately 680-820px for focus.

If final Figma specifies a different desktop navigation, follow Figma.

## 6.4 Recommended shell

```text
Desktop
+-------------------------------------------------------------+
| Sidebar | Header / Context                                  |
|         +----------------------------------+------------------+
|         | Main content                     | Optional aside   |
|         |                                  | progress/context |
|         |                                  |                  |
+-------------------------------------------------------------+

Mobile
+-----------------------------+
| Header                      |
| Main content                |
|                             |
|                             |
| Bottom navigation           |
+-----------------------------+
```

---

# 7. Iconography and illustration

## 7.1 Icons

Use one consistent icon style.

Recommended engineering baseline when no approved icon set exists:

- rounded outline icons;
- 20px standard;
- 24px navigation/action;
- consistent stroke width;
- use `currentColor` so semantic color is controlled by the parent.

If the repository already uses an icon library, reuse it.
If no library exists, `lucide-react` is an acceptable **provisional** engineering choice, but do not introduce it if doing so conflicts with existing project decisions.

## 7.2 Category icon containers

Subject/category icons may use circular or rounded tiles with distinct accent backgrounds.

Do not make every category use a new arbitrary color. Prefer a controlled mapping based on brand and approved semantic accents.

## 7.3 Illustrations

Illustrations should:

- support the task, reward, or emotion;
- stay secondary to learning content;
- use warm/playful shapes compatible with the palette;
- avoid visual noise on assessment pages;
- never reduce contrast/readability of text.

Large decorative illustration is appropriate for:

- dashboard hero;
- onboarding;
- empty state;
- pretest intro;
- tryout intro;
- achievement/reward;
- help/education.

Keep actual question/assessment surfaces calmer.

---

# 8. Motion and interaction

The current sources do not define a detailed motion system. Use restrained motion by default.

## 8.1 Baseline

```text
Fast interaction: 120-160ms
Standard transition: 180-240ms
Large panel/modal: 240-320ms
```

Use easing similar to:

```css
cubic-bezier(0.2, 0.8, 0.2, 1)
```

## 8.2 Allowed motion

- button press feedback;
- tab indicator movement;
- progress update;
- modal entrance;
- success/reward microinteraction;
- skeleton/loading transition.

Avoid:

- looping animation during concentrated assessment work;
- large bouncing UI elements;
- animation that delays an answer or submission;
- motion that is required to understand state.

Respect `prefers-reduced-motion`.

---

# 9. Core component library

A coding agent must prefer shared components. Do not recreate the same component independently on each page.

Recommended primitive structure:

```text
components/
  ui/
    button/
    icon-button/
    card/
    surface/
    input/
    select/
    checkbox/
    radio/
    tabs/
    badge/
    progress/
    modal/
    toast/
    skeleton/
    empty-state/
    status-state/
    list-row/
    avatar/
    navigation/
    question-option/
```

Actual repository naming may differ. Reuse existing conventions.

---

## 9.1 Button

### Variants

#### Primary

Use for one dominant action in a context.

```text
Background: Sagat Purple
Text: White
Radius: md-lg
Height: 44-48px minimum
Weight: 700
```

Examples:

- Mulai Latihan
- Selanjutnya
- Mulai Pretest
- Mulai Tryout
- Simpan

#### Secondary

Use for a visible alternative action.

Preferred baseline:

- Pearl/white surface;
- purple text;
- border or soft-purple background depending on hierarchy.

#### Ghost

Use for low-priority contextual actions.

#### Destructive

Use only for destructive account/admin operations.
Do not use Peach as a danger color merely because it is warm.

### States

Every button must define:

- default;
- hover;
- pressed;
- focus-visible;
- loading;
- disabled.

Do not remove the button label during loading if it causes layout jump. Prefer spinner + stable label or a stable loading label.

---

## 9.2 Card / Surface

Use Pearl or white surfaces over Ivory background.

Common card variants:

- `default`
- `interactive`
- `highlight`
- `reward`
- `danger/attention`

Interactive cards must show hover/focus state on devices that support it.

Do not make a card clickable without keyboard semantics.

---

## 9.3 Input and form controls

Baseline:

- label above control;
- 44px minimum height;
- 12-14px radius;
- light neutral border;
- visible purple focus ring;
- helper/error text below;
- preserve entered data when a submit fails where safe.

Never use placeholder text as the only label.

---

## 9.4 Tabs / Segmented control

Use for switching between closely related views such as:

- current/history;
- material category;
- explanation modes where product policy allows;
- leaderboard scope.

Rules:

- active state uses primary or strong soft-purple emphasis;
- inactive state remains readable;
- tab order must be keyboard-accessible;
- use semantic tab roles when behavior is truly tabbed content.

---

## 9.5 Progress

Progress is a core NUMORA pattern.

Types:

- learning progress;
- level completion;
- question position;
- XP/reward progress;
- tryout progress.

Rules:

- label progress numerically when important;
- do not rely on bar length alone;
- distinguish academic progress from activity/XP;
- reward-related progress may use Gold;
- academic mastery should not be visually confused with gamification score.

---

## 9.6 Badge / Chip

Use for:

- status;
- level;
- role/user type;
- difficulty;
- content status;
- compact metadata.

Keep copy short.
Do not use badges as buttons unless they are explicitly interactive.

---

## 9.7 Navigation

Student mobile primary navigation may use a bottom nav pattern consistent with the supplied concept.

Rules:

- 3-5 primary destinations maximum in bottom navigation;
- active destination uses Sagat Purple;
- icon + text label preferred;
- profile/settings should not displace a core learning destination unless approved by UI/UX;
- desktop should adapt to a sidebar or another desktop-appropriate pattern rather than a stretched bottom nav.

Navigation labels must follow actual product scope from the PRD.

---

## 9.8 List Row

Use reusable list rows for:

- material/subbab;
- practice history;
- settings;
- students/classes;
- help menu;
- question/admin lists.

Recommended structure:

```text
[leading icon/avatar] [title + metadata] [status/progress] [chevron/action]
```

Do not invent a different row shape on every page.

---

## 9.9 QuestionOption

This is one of the most important reusable components.

Required states:

- default;
- hover/focus;
- selected;
- disabled/locked;
- correct after submission/review;
- incorrect after submission/review;
- optionally revealed correct answer after review.

Rules:

- Do not reveal correctness while a live assessment still allows changes unless the product mode explicitly requires it.
- State must be communicated by icon/text/border as well as color.
- Entire option row should be a large interaction target.
- Preserve math readability.

Suggested anatomy:

```text
+--------------------------------------------+
| [A]  Answer text                           |
+--------------------------------------------+
```

For MCMA/category questions, use the appropriate checkbox/category interaction only after the product rules are finalized.

---

## 9.10 Modal / Confirmation

Use for:

- destructive confirmation;
- final assessment submit confirmation;
- leaving an in-progress state when consequences exist;
- important blocking decisions.

Submit confirmation should support copy such as the number of unanswered questions when required by the PRD.

Do not use a modal for routine navigation.

---

## 9.11 Toast / Inline feedback

Use toast for lightweight, non-blocking confirmations.
Use inline feedback for form validation and persistent failure.

Examples:

- `Jawaban tersimpan.` - non-blocking save status.
- `Soal belum tersimpan. Coba lagi.` - persistent form failure.

Do not rely on toast alone for critical errors that require user action.

---

## 9.12 EmptyState / ErrorState / LockedState

Every significant data view must have states for:

- loading;
- empty;
- failed to load;
- unauthorized;
- locked/unavailable when product policy applies.

Keep each state semantically different.

Example:

- Empty: "Belum ada riwayat latihan."
- Error: "Riwayat belum dapat dimuat. Coba lagi."
- Locked: "Fitur ini tersedia setelah kamu bergabung ke kelas."

Only use the locked message when the PRD actually requires a class.

---

# 10. Learning-specific components

## 10.1 LearningMaterialCard

Use for Bab/Subbab list.

Anatomy:

```text
[category icon]  Subbab title
                 progress / completed items
                 optional latest score
                                    [chevron]
```

Keep the status concise.

## 10.2 LevelCard / LevelNode

Required states:

- locked;
- open;
- in progress;
- completed;
- mastered/3-star if product needs this distinction.

Remember:

- star count is motivational;
- unlock is controlled by the PRD threshold/rule, not by visual assumptions.

## 10.3 AssessmentHeader

Should provide only the information needed to stay oriented:

- activity name;
- current question / total;
- timer if applicable;
- save/connectivity indicator when relevant;
- exit/back action with consequence handling.

Drill v1.2 uses an informational count-up timer with no pause or deadline; <15 minutes is speed-bonus eligibility only (formula TBC). Do not implement an old fixed 20-minute countdown based on stale UI/reference material.

## 10.4 ResultSummary

Potential fields supported by the PRD:

- score 0-100;
- pass/not yet pass;
- stars;
- XP;
- level unlock effect;
- CTA to explanation/history/next allowed action.

Do not present leaderboard XP as academic score.

## 10.5 ExplanationCard

Anatomy:

- question reference;
- user answer;
- correct answer;
- explanation;
- report-question action where relevant.

Keep explanation surfaces calm and readable; avoid excessive illustration around dense learning content.

## 10.6 Reward / Achievement

Gold is the main reward accent.

Use celebratory visual emphasis only after meaningful progress such as:

- level complete;
- 3-star result;
- level unlocked;
- XP/streak milestone.

Do not turn every correct answer into a large full-screen celebration during focused drill unless approved by UI/UX.

---

# 11. Screen patterns

## 11.1 Student Dashboard

Priority order:

1. Identity/greeting and current status.
2. Clear next learning action.
3. Progress/mastery summary.
4. Recent activity/feedback.
5. Secondary features.

For User Mandiri, clearly show the current status without implying error. Their allowed features are determined by the PRD.

For User Sekolah, show class context without overwhelming the main learning action.

## 11.2 Learning catalog

Recommended hierarchy:

```text
Page title
Optional category tabs
Bab/Subbab list
Progress per item
Clear open/locked/completed state
```

Avoid turning the catalog into a dense admin table on student-facing screens.

## 11.3 Drill / Assessment

Focus mode:

- reduce decorative background;
- one primary question surface;
- clear answer options;
- clear next/submit action;
- visible state persistence where relevant;
- no distracting leaderboard or unrelated dashboard metrics.

## 11.4 Pretest intro

Show:

- purpose;
- optional nature when required;
- relevant rule/expectation;
- one dominant CTA;
- previous completion result if already completed.

Do not imply that pretest is required if the PRD says optional.

## 11.5 Tryout

Treat tryout as a formal simulation while keeping NUMORA visual warmth.

TryOut v1.1 requires free MVP access for all Students, Ongoing/Past listing, detail/tutorial/rules, 35 PG/PGK MCMA/Category questions, countdown without pause and auto-submit at 0 without confirmation. Show submission success, waiting for batch end, IRT processing, released result/explanation, expired/unavailable and error/session states. Result must release within 3×24h after batch end and stay immutable; no partial score while waiting. Duration/scale/XP/past never-attempted eligibility remain TBC.

## 11.6 Leaderboard

Separate semantic meaning:

- class/activity leaderboard;
- global/PvP leaderboard.

Do not visually imply that ranking equals intelligence or official academic performance.

Use clear scope labels.

## 11.7 Profile / Settings / Help

Use grouped list rows and low cognitive load.
Keep high-emphasis purple for primary actions, not every row.
Dangerous account/session actions should be visually separated from normal settings.

## 11.8 Teacher surface

Use the same NUMORA tokens, but reduce decorative/gamified density.

Prioritize:

- class context;
- student list;
- progress readability;
- search/sort;
- feedback workflow;
- clear ownership boundaries.

## 11.9 Admin surface

Admin UI should feel operational and data-oriented while still using NUMORA tokens.

Prefer:

- denser tables/list views;
- clear filters/status;
- restrained illustration;
- predictable CRUD forms;
- audit and version visibility;
- pagination/search when required.

Do not force student-style gamification into admin screens.

---

# 12. State model

Every reusable feature should consider this state checklist.

## 12.1 Network/data states

- idle
- loading
- loaded
- empty
- error
- retrying
- offline/reconnecting when relevant

## 12.2 Permission/access states

- authenticated
- unauthenticated
- unauthorized role
- inactive account
- teacher unverified
- student mandiri
- student school-affiliated
- locked by product rule

## 12.3 Assessment states

- not started
- in progress
- saving
- save failed
- ready to submit
- submitted
- completed
- explanation available
- explanation expired/unavailable
- reconnect/resume

The exact transitions are controlled by backend/product logic, not presentation.

---

# 13. Accessibility baseline

Accessibility is part of the design system, not an optional polish step.

## 13.1 Required

- Minimum touch/click target: approximately 44x44px.
- Visible `:focus-visible` treatment.
- Keyboard-accessible controls and navigation.
- Form fields have persistent labels.
- Error messages identify the problem in text.
- Status is not communicated by color only.
- Body text uses sufficient contrast.
- Images/illustrations that convey meaning have alt text.
- Decorative images use empty alt text.
- Respect reduced-motion preference.
- Do not trap keyboard focus outside an active modal.
- Use semantic HTML before ARIA workarounds.

## 13.2 Focus style

Engineering baseline:

```css
:focus-visible {
  outline: 3px solid #722cce;
  outline-offset: 3px;
}
```

Adjust only if a newer approved UI/UX token exists.

---

# 14. Content and microcopy

NUMORA copy should be:

- friendly;
- concise;
- clear;
- encouraging without exaggeration;
- age-appropriate for SMP;
- factual about scores and progress.

Prefer:

- "Coba lagi"
- "Lanjutkan latihan"
- "Level berikutnya terbuka"
- "Jawaban tersimpan"

Avoid:

- shaming copy;
- exaggerated claims such as "Kamu jenius!" based only on one score;
- treating leaderboard position as academic intelligence;
- technical backend wording in student UI;
- inconsistent terms such as mixing `KKM` with the current PRD term `Ambang Ketuntasan`.

---

# 15. Figma Community / Duolingo-inspired reuse policy

The team supplied these references:

1. `https://www.figma.com/community/file/1279168389289425844/duolingo-app-ui-free-ui-kit-recreated`
2. `https://www.figma.com/community/file/1377326303556981356/duolingo-free-ui-kit-by-marvilo`
3. `https://www.figma.com/community/file/1460744749282136015/duolingo-design-system`
4. `https://www.figma.com/community/file/1439600081437366863/duolingo-unofficial-design-language`
5. `https://www.figma.com/community/file/1349313332454280331/duolingo-com-web-pages-ui`

Use these resources to accelerate design work, especially for generic interaction patterns such as:

- buttons;
- cards;
- progress bars;
- tabs;
- navigation;
- badges;
- list rows;
- quiz answer states;
- modals;
- achievement/reward structures.

### Adaptation rule

Do **not** treat those files as the NUMORA design system.

When reusing a pattern:

1. Keep the component's useful interaction/layout logic.
2. Replace colors with NUMORA tokens.
3. Replace icons/illustrations with approved NUMORA/generic assets.
4. Replace copy and domain semantics with NUMORA concepts.
5. Normalize radius, spacing, typography, and states to this document.
6. Validate responsiveness for NUMORA web requirements.
7. Verify the Community resource's license before directly copying assets or component implementation.

The goal is **reuse without becoming a Duolingo clone**.

### What not to copy

Do not directly reuse without explicit review:

- Duolingo mascot/characters;
- brand logo;
- signature brand green or exact brand palette as NUMORA identity;
- proprietary copy;
- branded illustrations;
- unique branded sound/motion identity;
- assets whose license has not been checked.

---

# 16. Implementation architecture for Software

The design system should support the team's parallel workflow.

Recommended frontend separation:

```text
API / data layer
      |
State / feature logic
      |
Feature container
      |
Shared NUMORA UI primitives
      |
Page composition / responsive layout
```

A final Figma handoff should mostly change the last two layers, not business logic.

## 16.1 Keep tokens centralized

Recommended files, adapted to the existing repo:

```text
styles/
  tokens.css
  globals.css
components/
  ui/
features/
app/ or pages/
```

Do not create this structure if an equivalent already exists. Integrate with the repository's conventions.

## 16.2 No hardcoded design drift

Feature code should not contain scattered values such as:

```css
color: #722cce;
border-radius: 17px;
background: #f6efcd;
```

Instead use tokens/components:

```css
color: var(--color-primary);
border-radius: var(--radius-lg);
background: var(--color-bg);
```

## 16.3 Example token file

```css
:root {
  --numora-purple: #722cce;
  --numora-purple-soft: #b88ac9;
  --numora-peach: #fa9a71;
  --numora-gold: #f8d080;
  --numora-ivory: #f6efcd;
  --numora-pearl: #f3faf8;

  --color-primary: var(--numora-purple);
  --color-secondary: var(--numora-purple-soft);
  --color-reward: var(--numora-gold);
  --color-bg: var(--numora-ivory);
  --color-surface: var(--numora-pearl);
  --color-surface-strong: #ffffff;
  --color-text: #2f213d;
  --color-text-muted: #675b72;
  --color-border: #e4ddcf;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 18px;
  --radius-xl: 24px;
  --radius-pill: 999px;

  --shadow-sm: 0 2px 6px rgba(47, 33, 61, 0.06);
  --shadow-md: 0 6px 18px rgba(47, 33, 61, 0.1);

  --font-sans: 'Nunito Sans', 'Inter', ui-sans-serif, system-ui, sans-serif;
}
```

## 16.4 If Tailwind is already used

Map existing tokens to theme variables instead of sprinkling arbitrary values in class names.

Good:

```text
bg-numora-bg
text-numora-primary
rounded-numora-lg
```

Avoid repeated arbitrary values like:

```text
bg-[#F6EFCD]
text-[#722CCE]
rounded-[17px]
```

A one-off arbitrary value is acceptable only when matching a precise Figma measurement that should not become a global token.

---

# 17. AI coding-agent contract

This section is intentionally explicit so this document can be used as context for Codex, Antigravity, or another implementation agent.

## 17.1 Mandatory behavior

When asked to implement or modify a NUMORA screen:

1. **Read the relevant current PRD requirement first** if product behavior matters.
2. **Inspect the repository before coding.** Find existing tokens and reusable components.
3. **Do not invent product behavior from the screenshot.** Screenshots are visual references only.
4. **Do not duplicate an existing component** if it can be extended safely.
5. **Use NUMORA tokens.** Do not create a page-specific mini design system.
6. **Keep business logic outside presentational components.**
7. **Implement states, not only happy path.**
8. **Make the screen responsive.** Mobile reference does not mean fixed mobile layout.
9. **Preserve accessibility.** Do not trade accessibility for visual similarity.
10. **Do not add dependencies casually.** Reuse the current stack first.
11. **Flag unresolved design/product decisions** in code comments or implementation notes rather than guessing.
12. **Prefer small, reviewable components and changes.**

## 17.2 Before-code checklist for an AI agent

Ask internally:

```text
What role is viewing this screen?
What user type/state applies?
What is the primary action?
What business rules come from the PRD?
What reusable components already exist?
What page states are required?
What happens on mobile/tablet/desktop?
Does the mockup contain stale behavior?
Which design values are canonical vs provisional?
```

## 17.3 Definition of Done for UI code

A UI task is not complete until:

- it uses shared tokens/components where possible;
- primary and secondary visual hierarchy are clear;
- loading/empty/error/disabled states are implemented as relevant;
- keyboard focus works;
- mobile and desktop layouts do not break;
- long Indonesian copy does not overflow;
- API failure does not destroy user input where recovery is expected;
- temporary placeholder visuals are marked and easy to replace;
- no known PRD rule is contradicted by the interface;
- no outdated requirement is reintroduced from old code/mockups.

---

# 18. Parallel UI/UX <-> Software workflow

The current team intentionally develops UI/UX and Software in parallel.

Use the following contract.

## 18.1 UI/UX track

Produces:

- page inventory;
- user flows;
- wireframes;
- design tokens;
- final components/variants;
- responsive design decisions;
- states;
- high-fidelity mockups;
- handoff notes.

## 18.2 Software track

May proceed before final mockup with:

- route/page shell;
- data loading;
- API integration;
- authentication/access;
- forms and validation;
- assessment lifecycle;
- functional shared components;
- responsive baseline;
- loading/error/empty states;
- automated tests.

Software should avoid high-cost custom visual work before UI/UX is final.

## 18.3 Integration sprint

When final UI/UX arrives:

1. compare final Figma components with shared coded primitives;
2. update tokens first;
3. update primitives second;
4. update page composition third;
5. avoid rewriting working feature logic;
6. perform visual/regression QA;
7. reconcile any divergence with the PRD and PO.

This order minimizes rework.

---

# 19. Product-aware UI guardrails from latest feature PRDs

The following guardrails follow [Drill v1.2 / TryOut v1.1](../product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md), supplied 2 October 2026, and the remaining cross-feature v0.5 baseline. Source TBC items remain unresolved.

## 19.1 User access

- Student and teacher use Google Auth.
- User Mandiri remains a valid logged-in user and keeps history.
- Student without a class is **not an error state**.
- User Mandiri may use Drill, free MVP TryOut, and PvP room creation.
- Class leaderboard depends on class membership; Pretest affiliation retains the v0.5 baseline pending clarification. TryOut does not require a Class or payment.
- Teacher verification uses school + single-use token.

## 19.2 Learning hierarchy

Use:

```text
Bab -> Subbab -> Level
```

Current baseline:

- Curriculum-defined level structure; five is the old v0.5 baseline, not a final hardcoded layout;
- 10 questions per level.

Do not embed these as visual assumptions in many components. Consume configuration/data where the implementation supports it.

## 19.3 Drill

- 10 questions baseline.
- Informational count-up timer; no pause or deadline. <15 minutes eligible for speed bonus, ≥15 not eligible; amount TBC.
- Free navigation and answer changes before submit.
- Submit confirms unanswered questions.
- Score is 0-100.
- `>= 80` unlocks the next level.
- `< 80` does not revoke already-open levels.
- Star system is motivational and is not the unlock rule.
- Explanation only after submit; retention DRL-OPEN-07, no final 90-day assumption.
- All star thresholds/base XP/speed formula remain TBC; do not display demo formulas as final.
- Best score highest valid attempt, separate history; completed-level retry and no relock.
- Honest saved/error states and refresh/exit warning reflecting actual persistence.
- Failure-only max-three relevant YouTube videos, empty/broken-link/report states, question-report modal.

## 19.4 Tryout

- Free MVP for all Students; no payment/class-lock UI. Monday release remains v0.5 cadence baseline; exact batch end TBC.
- 35 questions, PG/PGK MCMA/Category, one per view with navigator.
- Countdown no pause; manual submit confirms; auto-submit at 0 has no confirmation.
- Ongoing/Past listing, detail/tutorial/rules; past never-attempted eligibility TBC.
- One attempt per package per user.
- Same package for users in the same period to support IRT validity.
- Result/explanation only after release IRT, ≤3×24h after batch end; no partial score while processing. Released simulation score immutable.
- XP from score only, no time bonus; conversion/duration/TKA scale/model TBC.

UI needs a clear `waiting for result/IRT` state.

## 19.5 Leaderboard

- Keep class/activity and global/PvP meaning distinct.
- Do not present leaderboard as official academic ability.

## 19.6 Feedback

- Teacher -> student is one-way in current scope.
- Do not render a reply box unless the PRD changes.

---

# 20. Review checklist for PM / UI/UX / Software

Use this during design review or pull-request review.

## Brand

- [ ] Uses Sagat Purple as primary action color.
- [ ] Uses Ivory/Pearl as base surfaces.
- [ ] Peach/Gold are accents, not body-text colors.
- [ ] NUMORA logo is not distorted.
- [ ] External reference branding has been removed/adapted.

## Layout

- [ ] Spacing follows a consistent scale.
- [ ] Rounded shape language is consistent.
- [ ] Page hierarchy is obvious.
- [ ] Mobile reference has been adapted for desktop, not simply stretched.
- [ ] Assessment pages remain focused.

## Components

- [ ] Shared components are reused.
- [ ] Buttons have hierarchy and states.
- [ ] Cards/list rows are consistent.
- [ ] Question options support all required states.
- [ ] Progress has text/semantic context.

## Product correctness

- [ ] Screen follows latest PRD.
- [ ] No old 70% drill threshold remains; Drill v1.2 confirms 80.
- [ ] Drill is not incorrectly locked for User Mandiri.
- [ ] Drill is not shown as a fixed 20-minute countdown.
- [ ] Tryout result availability matches current IRT rule.
- [ ] Feedback remains one-way if current scope is unchanged.

## Accessibility

- [ ] Normal text contrast is sufficient.
- [ ] Focus states are visible.
- [ ] Keyboard flow works.
- [ ] Controls have labels.
- [ ] Target sizes are usable.
- [ ] State is not color-only.
- [ ] Reduced motion is respected.

## Engineering

- [ ] No scattered hardcoded brand colors.
- [ ] No duplicate one-off component where a primitive exists.
- [ ] Business logic is separated from view styling.
- [ ] Error/loading/empty states exist.
- [ ] Layout works at representative mobile/tablet/desktop widths.
- [ ] New dependency is justified.

---

# 21. Reference assets and implementation notes

Bundled with the NUMORA UI skill:

- `assets/numora-logo.png`
- `assets/reference-mobile-screens.png`

These assets are intended to help maintain visual direction. The screenshot is not a pixel-perfect implementation contract unless UI/UX explicitly marks it as final.

---

# 22. Open items to be finalized by UI/UX

The supplied source does not currently establish all of the following as final. Keep them configurable/provisional:

- final font family;
- complete neutral palette;
- semantic success/warning/error/info colors;
- exact icon library;
- exact shadow tokens;
- exact desktop navigation pattern;
- full desktop grid specification;
- motion/easing specification;
- illustration library and usage rules;
- final component measurements;
- dark mode policy;
- complete teacher/admin visual specification.

Do not falsely label provisional values as final design decisions.

When UI/UX finalizes any of these, update this document and shared frontend tokens/components rather than patching individual pages.

---

# 23. Compact instruction block for repository AI guidance

The block below may be copied into `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, or another repository-level AI instruction file if the team does not install the full skill.

```text
NUMORA UI RULES

- Product behavior follows the latest PRD; design references cannot override it.
- Use NUMORA brand tokens: primary #722CCE, soft purple #B88AC9, peach #FA9A71,
  gold #F8D080, background #F6EFCD, surface #F3FAF8.
- Use rounded, warm, youthful, clean surfaces. Purple is the main CTA/action color.
- Peach/Gold/Soft Purple are accents; do not use them as low-contrast body text.
- Reuse shared Button/Card/Input/Tabs/Badge/Progress/Navigation/QuestionOption/State components.
- Do not hardcode design values throughout feature code; centralize them as tokens.
- Separate business/data logic from presentational UI so final Figma can be merged without rewrites.
- Implement loading, empty, error, disabled/locked, and unauthorized states where relevant.
- Build responsive web UI: mobile first, but do not stretch mobile mockups onto desktop.
- Keep minimum interaction target around 44x44px and visible keyboard focus.
- Do not copy Duolingo branding, mascot, copy, or unlicensed assets. Reuse only generic interaction/component patterns and restyle them for NUMORA.
- Latest PRD guardrails: Mandiri can use Drill/free MVP TryOut and create PvP rooms; Drill threshold >=80, count-up no pause/deadline; XP/stars/retention TBC. TryOut 35 PG/PGK MCMA/Category, countdown auto-submit, one attempt/package, released IRT result within 3x24h of batch end and immutable. Feedback remains one-way.
- If UI/UX or PRD has an unresolved decision, do not invent a final rule. Use a replaceable placeholder and flag the dependency.
```

---

# 24. Change policy

Any design-system change that affects multiple features should be made at the token or component level first.

When changing a global rule:

1. Record what changed.
2. Record why.
3. Identify affected components/pages.
4. Update tokens/components.
5. Run regression/visual checks.
6. Update this document/version.

Avoid hidden design-system changes inside one feature PR.

---

**End of NUMORA UI Design System v0.1**

## Phase 6 account and feedback alignment — 4 October 2026

**ENGINEERING DECISION:** the owner approved Phase 6 after Phase 5. Student Profile follows the supplied identity/statistics/Tryout/settings screenshot and uses real authenticated information, completed levels and latest Drill score. Inbox Catatan Guru uses existing generated list/summary/read DTOs, explicit server-acknowledged read state, offset pagination and account-isolated cache. Home and desktop navigation link to `/student/feedback`; mobile navigation remains five items.

Shared Card adds optional CSS variables for radius/border/shadow alongside existing background/padding customization; defaults remain unchanged. ListRow adds optional text reflow for long account names/email. Shared Icon includes settings; `--color-surface-profile: #f7f8fc` is sampled from the PNG. No new component library or API/schema/product-policy change is introduced. Unsupported editable profile/certificates/XP/average accuracy and feedback-to-attempt context remain gaps. See the [Phase 6 report](UI_REDESIGN_PHASE_6_2026-10-04.md) for verification and deviations.

## Screenshot redesign Phase 7 — Teacher, 4 October 2026

**ENGINEERING DECISION:** the owner approved continuing from Phase 6. Teacher verification, class/create, students, progress and profile use a derived Student visual language: purple identity/context, ivory page, white 20 px cards, lavender rows, 24 px hero and existing responsive breakpoints. Reduce decorative density and prioritize monitoring readability. Shared AppShell keeps Teacher navigation and the existing sidebar; no Student bottom nav is copied into Teacher routes.

**PRD RULE:** verified owned-Class access and read-only monitoring remain server-authoritative. Keep latest/best independent, render score zero, and distinguish null with a dash/legend; no new academic completion, XP or mastery formula is derived. Verification preserves short/legacy case-sensitive tokens and identity refresh; unauthorized resources and expired sessions use explicit recovery. See the [Phase 7 report](UI_REDESIGN_PHASE_7_2026-10-04.md) for files, evidence, tests and limitations. No Teacher screenshot was supplied; pixel identity against an unavailable Teacher Figma frame is not claimed.

## Screenshot redesign Phase 8 — Auth, 4 October 2026

**ENGINEERING DECISION:** the owner approved continuing from Phase 7. Login, callback and onboarding use a derived Student visual language: purple welcome/header, ivory background, white 24 px form card, lavender role choices, existing owl/Brand/Icon and local Plus Jakarta Sans. Mobile form gutter is 16 px; tablet forms are centered; desktop starts at the existing 960 px breakpoint with a two-column layout and maximum 480 px form. Narrow screens reserve title space for the illustration and hide it at 320 px. Role cards use native radios with a visible containing-card focus outline; busy states disable submission/selection and loading motion respects reduced motion.

**PRD RULE:** Google Student/Teacher authentication, one-time registration, Teacher verification and internally provisioned Admin identity remain unchanged. AuthProvider, PKCE/session infrastructure, generated identity contracts and role destinations retain their ownership. Browser metadata is displayed as Google identity, never used as authorization. Auth has no supplied screenshot; see the [Phase 8 report](UI_REDESIGN_PHASE_8_2026-10-04.md) for derived-design limitations, files, states, verification and mobile/desktop evidence. No database seed or new auth capability is introduced in this phase.

## Screenshot redesign Phase 9 — Admin, 4 October 2026

**ENGINEERING DECISION:** the owner approved continuing from Phase 8 to Phase 9. Existing school/token management and all nine workbench panels use the Student-derived purple/ivory/white/lavender language, local Plus Jakarta Sans and shared UI primitives. Admin has no supplied screenshot; this is a derived composition, not a verified Admin Figma match. Header/card radii, input/button states and spacing use existing tokens. Mobile uses one column, a locally scrolling workbench navigator and safe text wrapping; existing 700/960/1200 breakpoints expand school detail and editor/list composition. Primary actions remain purple, editing actions use secondary lavender, archive/revoke actions use the shared danger outline. Loading, empty, retry and API-denied states follow the same visual pattern.

**PRD RULE:** NestJS authorization, single-use Teacher verification, historical question/content versions and server-owned IRT/result release remain authoritative. No schema, scoring, generated contract, Supabase business query, parameter editor or production fixture activation is introduced. Pending native forms disable controls; 401/403 states hide cached forms. Existing native confirmation/prompt interactions remain in place with the original handlers. The [Phase 9 report](UI_REDESIGN_PHASE_9_2026-10-04.md) records verification and screenshots. Earlier additive DEMO learning seeds remain unchanged.
