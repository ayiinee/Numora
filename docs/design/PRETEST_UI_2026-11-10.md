# Pretest presentation fixes — 10 November 2026

**ENGINEERING DECISION — owner-requested UI revision:** the chapter invitation uses the existing placement mascot, a primary “Cek kemampuanmu” action and a compact introduction with expandable placement/skip details. The session's redundant informational banner is removed. Optional participation, one completion, no XP and server-persisted resume semantics remain unchanged.

Pretest uses the existing authenticated GET assessment-items/{instanceId}/media?phase=WORK endpoint. The attempt-scoped POST endpoint accepts only Drill/Tryout and must not be used for Pretest. Question navigation scrolls horizontally to keep the active number visible without moving the document vertically. The shared text renderer also accepts consecutive imported pipe rows with matching column counts (at least three columns), retaining Markdown table support and inert text rendering.

Validation: 3 focused test files / 17 tests passed (pretest, rich-session and content renderer); frontend typecheck, production build (47 static pages) and scoped ESLint passed. Follow-up with Product Design installed: browser verified live signed media delivery on the active Aljabar pretest, removed session banner, active-number scrolling to question 15, invitation states and expandable introduction on Geometri. Captured mobile evidence under ignored .tmp/pretest-ui/. At 451 x 589 the initial dialog left too little room for actions; the illustration now reduces to 100px on short viewports and both actions are fully visible. Desktop dialog inspected at 1280 x 800. The original Bilangan attempt is completed; its question/table state cannot be reopened, so exact live table verification remains pending (renderer regression passes). No answers, skips or submissions were changed.

**ENGINEERING DECISION — tampilan penempatan, 10 November 2026:** hasil pretest menjelaskan penanda "Mulai di sini" pada peta subbab. Peta mencocokkan ID level dalam hasil pretest tersimpan dengan level dan progres subbab saat ini. Level yang disarankan mendapat balon berikon dan penjelasan di dialog. Animasi CSS bergerak 4 px sebanyak dua kali per kemunculan dan menghormati preferensi pengurangan gerakan. Latihan aktif tetap diprioritaskan. Balon berhenti tampil saat siswa menguasai level yang disarankan atau sudah membuka level lebih tinggi. Status level yang lebih rendah tetap mengikuti akses dan progres yang diberikan server.

## Visual QA evidence

Source visual truth: user-supplied annotated screenshots, Comments 1–6 in this chat (892px source captures; viewport described as 714 x 615). These are defect references, not a selected redesign mock.

Implementation evidence: `.tmp/pretest-ui/card-mobile.png`, `.tmp/pretest-ui/dialog-final.png`, `.tmp/pretest-ui/media-mobile.png` (ignored, local). Mobile captures: 451 x 589 CSS px, source density not established. Desktop inspected at 1280 x 800 CSS px; dialog bounds 480 x 564.5, centered and inside viewport. No pixel-fidelity pass is claimed across different viewport/chapter/state.

Findings and fixes:
- Initial mobile dialog had insufficient action space. Reduced mascot width to 100px when viewport height is <=700px. Revised `dialog-final.png` shows both actions fully visible.
- Pretest media used a Drill/Tryout-only POST endpoint. Switched to the existing authorized per-item GET endpoint. `media-mobile.png` shows the actual balance diagram in Aljabar question 1. No content, authorization or grading rules changed.
- Active question 15 was visibly centered in the horizontal navigator. Redundant pretest session banner is absent.

Required surfaces: existing Plus Jakarta Sans hierarchy retained; mobile spacing and desktop dialog bounds checked; purple/lavender tokens retained; existing placement mascot renders sharply without stretching; participation/placement/skip/no-XP copy retained with expandable secondary details.

Primary interactions tested: open/close introduction, expand placement details, resume existing session, navigate to question 15. No answer, flag, skip, start or submit action was performed. Logged earlier transient UTF-8 compilation errors were from the prior edit period; current pages render successfully. No clean-console claim is made.

Remaining evidence gap: source Bilangan attempt is already completed and cannot be reopened. The exact live table/question states from Comments 4 and 6 were unavailable. A combined same-state source/implementation comparison was not possible. Table-renderer regression passed; this does not substitute for the missing visual comparison.

final result: blocked
Blocker: exact Bilangan question states and same-state comparison remain unavailable on the current completed attempt. Invitation/dialog/mobile media/navigation were inspected successfully.
