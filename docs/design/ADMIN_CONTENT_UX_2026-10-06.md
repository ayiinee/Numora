# Admin Content workspace — 6 October 2026

**ENGINEERING EVIDENCE — 7 October update:** persisted Content demos were removed from Development at the owner's request. Materials and both question-bank readers now return empty lists. The six/ten-example descriptions and synthetic screenshots below record the preceding UI iteration, not current Cloud contents. Three non-fixture drafts and six unrelated upload sessions remain. See [cleanup and retention evidence](../development/ADMIN_CONTENT_DEMO_CLEANUP_2026-10-07.md).

**ENGINEERING DECISION:** the owner requested UI/UX improvements for Admin Content, Data & Moderation first, after permission reconciliation. Baseline: `735d9ee`. This update changes presentation and navigation, not authorization, grading, publication requirements, database state, or product formulas.

**PROPOSED — preceding iteration:** the earlier geometry interpreted the shared purple/lavender design system. The owner-supplied AdminLTE reference below supersedes that visual direction for Content; Plus Jakarta Sans and shared controls remain. No dependencies or public media URLs are added.

## AdminLTE reference redesign

**ENGINEERING DECISION — latest owner request:** the supplied reference guides layout, density and palette for Admin Content only. This uses the existing Numora shell and controls; no AdminLTE package, external font or template dependency is introduced. The reference's welcome dashboard, revenue, ratings and notification control are not added because those are not current Content tasks. Ringkasan, Analytics and the large page banner remain removed.

| Surface        | Current presentation                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Shell          | White topbar/sidebar, pale grey canvas, purple active navigation; authenticated account identity in the desktop/tablet topbar |
| Mobile/tablet  | Left menu toggle, white brand bar; navigation can be opened by keyboard and closed with Escape with focus restored            |
| Workbench tabs | Existing nine tasks with local outline icons and a horizontally scrollable tab strip at narrower widths                       |
| Question bank  | Full-width list; desktop separates question summary from actions; mobile stacks them; status text also has coloured badges    |
| Materials      | Existing authoring/list layout with compact white controls and lifecycle badges; 6 demo entries and 3 per page retained       |
| Content tools  | Shared scoped palette/radii/forms across import/media, pinned review, reports, Pretest, IRT and limited structure readers     |

Presentation is scoped by the current database-backed Content role. Super/Operations controls and navigation retain their prior presentation. Question keys, publication blockers, independent tab queries and historical pins retain their existing server boundaries. Preview/import remains DRAFT and unscored. The question bank still requests the compact demo catalog with 5 per server page, retaining all history elsewhere.

Visual evidence and current validation are recorded in the [gallery](screenshots/admin-content/README.md). Earlier iteration results below are historical and should not be reported as new checks for this theme.

### Workspace behaviour retained

**ENGINEERING DECISION — latest owner update:** Ringkasan and Analytics are temporarily removed from the Content portal. `/admin` and `/admin/analytics` redirect an active Content account to `/admin/content`; the Analytics panel does not mount or request metrics. Every Content page omits the large workspace/title/description/role banner. A visually hidden page heading preserves accessible structure; the navigation bar, sidebar, breadcrumb and logout remain available. Operations/Super pages and server capabilities are unchanged. This supersedes the preceding home and Content analytics presentation.

| Area           | Updated experience                                                                                         | Existing capability / boundary                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Content entry  | Opens the question bank directly; Ringkasan is absent from navigation and its URL redirects                | Existing bank authorization retained; no simulated counts or approval state                      |
| Navigation     | Content tools appear first; read-only school/class context last; active module shown in the breadcrumb     | Content still has no operational management or individual student reader                         |
| Workbench      | Each tab explains its purpose; URL `?view=` supports direct links, reload and Back                         | Each tab retains its independent server query/failure handling                                   |
| Question bank  | List and review actions appear first; manual PG editor is disclosed on demand and opens for revision       | PGK authoring continues through JSON; no new grading behavior                                    |
| Import         | Four ordered steps, current step, validation/import/preview controls, direct imported-version review links | Import remains DRAFT and preview remains unscored                                                |
| Media          | Optional upload panel explains when images are needed                                                      | Existing reserve–PUT–complete, VERIFIED receipt and signed preview retained                      |
| Version review | Pinned question, choices, answer key, explanation, taxonomy and readiness shown as readable content        | Answer keys stay inside the authorized Admin detail; no Student attempt DTO changes              |
| Source/history | JSON, immutable lineage and reviewer identity available in disclosure panels                               | Source payload is preserved; historical report uses the reported version                         |
| Moderation     | Readable historical target and clear follow-up form; return link restores Reports tab                      | Resolution still uses existing authenticated mutation and audit                                  |
| IRT            | Four distinct stages and automatically visible batch blockers                                              | Successful execution alone never releases results; no substitute Data algorithm or force release |
| Pretest        | Clear distinction between editorial work and blocked Student publication                                   | Existing blueprint/consumer gates remain authoritative                                           |
| Analytics      | Temporarily absent from Content navigation; its URL redirects without mounting the metrics panel           | Server aggregates and other Admin roles remain available under existing authorization            |

The neutral workspace theme is scoped to `CONTENT_DATA_MODERATION`. Operations and Super Admin retain their existing theme for later role-specific work. Shared review/import explanations also help Super Admin using the same content tools.

## Acceptance and evidence

Browser evidence uses synthetic Supabase/API fixtures with the real AuthProvider and HTTP clients. It does not prove Cloud SMTP, R2, scientific acceptance or independent QA. No Cloud schema/data were modified.

The browser suite verifies task navigation, keyboard activation, direct URL/reload/Back, all nine workbench tabs and horizontal overflow at 320, 768 and 1440 px. Existing suites additionally cover the three roles, denial, loading/error/empty states, publisher behavior, historical moderation, review and IRT blockers.

Previous iteration validation: 240 web unit tests, 35 Admin browser scenarios, 5 Content polish rechecks and 68 script checks passed. Repository lint, web typecheck/production build, schema validation and generated-contract freshness also passed. The [gallery](screenshots/admin-content/README.md) records current screenshots, historical captures and reproducible commands. Screenshots use synthetic content, not the approved Curriculum bank.

Latest removal update: 18 targeted unit tests and 11 selected browser scenarios passed, together with web typecheck, targeted lint and the isolated production build. The bank/import desktop and mobile captures were refreshed. The gallery distinguishes this evidence from the preceding full redesign regression.

## Content & assessment list update

**ENGINEERING DECISION — latest owner request:** Content Materi displays 6 demo entries, 3 per page. An explicit checkbox exposes other demo taxonomy entries; parent/competency selections retain the full server taxonomy. Non-demo material is retained. The Content question bank displays 5 versions per server page and at most 10 distinct demo examples. Fixture deduplication happens before pagination using complete payload identity; all versions remain inspectable in Verifikasi & riwayat and available to package authoring. See the [catalog API boundary](../api/CONTENT_IMPORT_PREVIEW.md#daftar-demo-admin-content--6-oktober-2026).

The nine workbench tabs implement PRD capabilities, but their order, grouping and names are UI decisions. Traceability: Materi/Soal/Paket Drill/Draf Tryout → §3.2–3.3/§7–9/§11/§18; Video/Laporan → §10; IRT → §13; Verifikasi & riwayat/Audit → §18.2/NFR-07. No additional product authority or parameter editor is introduced.

The nine tabs already exist in the baseline repository; the previous redesign added guidance and clearer presentation, not nine new product capabilities.

Validation for this list update: 20 targeted web unit tests, one PostgreSQL integration scenario (temporary fixtures rolled back), and seven browser scenarios passed, followed by two desktop/mobile pagination capture rechecks. Read-only verification on the isolated Development dataset found 10 selected examples in 5/5 pages, all three question formats, and unchanged storage of 481 versions. Browser fixtures and connected database evidence are separate. Typecheck, lint, API/web production builds and generated-contract/schema checks passed; no migration or persistent Cloud content mutation is required.

## What remains outside this UI update

- Curriculum approval/delivery: final bank and taxonomy, exhaustive PGK rubric, Pretest blueprint and unresolved score precision.
- Data/AI: approved respondent producer/mapping and scientific release/fallback handoff.
- Student domain: complete Pretest lifecycle before production publication.
- Environment/operator/QA: connected sandbox SMTP/R2/pipeline acceptance and independent QA.
- Operations and Super Admin visual redesign: next role-specific iterations, not completed here.

Use the [full-stack acceptance ledger](../development/ADMIN_FULL_STACK_STATUS.md) for backend readiness. A clearer screen does not mark an unresolved milestone complete.
