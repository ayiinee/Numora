**ENGINEERING DECISION - owner instruction, 26 November 2026:** New Tryout attempts receive 75 minutes (4,500 seconds), capped by batch/package close. Existing attempt deadlines stay pinned. Batch package selection/publication no longer requires matching parent/family codes or generator lineage. Content, distribution, scoring policy, wave pair identity, school access and balanced allocation gates remain. Pair selection does not certify IRT linking. Supersedes the 25 November duration and previous parent restrictions.

# Tryout runtime controls — 17 November 2026

**ENGINEERING DECISION - owner instruction, updated 26 November 2026:** New Tryout attempts receive up to 75 minutes (4,500 seconds), capped at batch or legacy package close. This applies to managed batches, legacy packages and demos. Existing attempts keep their pinned deadlines; historical package metadata is not rewritten.

The deprecated publication field accepts 1,800 or 4,500 seconds for legacy clients. New publication records 4,500 seconds.

**ENGINEERING DECISION — owner instruction:** Multiple published Tryout batches may overlap and remain open at the same time. Student assignment remains unique per student and batch.

**ENGINEERING DECISION — owner instruction:** Content Admin may stop an `OPEN` batch with a required reason. New starts stop immediately; in-progress attempts are marked `CANCELLED` in the same transaction. This is separate from pre-start cancellation.

**ENGINEERING DECISION — owner instruction:** Tryout packages retain existing archive flow. A package used by an open batch remains protected; stopping or closing that batch allows archival while preserving attempts and history.
