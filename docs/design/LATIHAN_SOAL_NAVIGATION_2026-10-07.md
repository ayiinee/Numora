# Latihan Soal — Student navigation revision

**ENGINEERING DECISION — owner UI request, 7 October 2026:** the Tryout catalogue and PvP lobby reuse the same centered, patterned mobile header as Latihan Soal. The Tryout catalogue removes its header shortcut to history; its tabs read Berlangsung, Terlewat, and Riwayat. These are presentation labels only and do not alter package eligibility, history, or PvP rules.

**ENGINEERING DECISION — owner instruction, 7 October 2026:** `/student/learn` is the Latihan Soal chapter list. Student navigation uses “Latihan”, and the page uses the Notifications-style contextual mobile header without a back button. This supersedes the Materi screen layout in the [5 October handoff](MATERIALS_NOTIFICATIONS_REDESIGN_2026-10-05.md), not its backend or academic rules.

Recent activity precedes chapter discovery. The category cards/filter, generic Pretest card, grade label, and “Daftar Bab TKA” heading/count are removed. Each chapter opens `/student/learn/[chapterId]`, where its own Pretest state, progress, and subchapters appear. Existing `?chapter=` bookmarks redirect to the chapter route. Search still matches chapter and subchapter titles. Mobile spacing and decorative sizing are reduced while controls retain at least 44 px interaction targets.

The existing materials and Pretest APIs remain authoritative. Pretest eligibility, Skip, resume, completion, and Drill unlock rules do not change. No PRD or OPEN academic decision is resolved by this presentation change.

**ENGINEERING DECISION — owner refinement, 7 October 2026:** the Latihan Soal header reuses the Student Home geometric pattern, centers the title, and removes the profile icon. This applies to the chapter list and chapter detail header; the Student navigation still provides Profile access.
