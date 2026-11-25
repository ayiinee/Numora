# Tryout runtime controls — 17 November 2026

**ENGINEERING DECISION — owner instruction, updated 25 November 2026:** New Tryout attempts receive up to 30 minutes (1,800 seconds), capped at the batch or legacy package closing time. This supersedes the 75-minute rule and the earlier 10-minute demo duration. The server applies the rule to managed batches, legacy packages, and demos. The duration recorded on a published package is historical metadata, and existing attempts keep their pinned deadlines.

**ENGINEERING DECISION — owner instruction:** Multiple published Tryout batches may overlap and remain open at the same time. Student assignment remains unique per student and batch.

**ENGINEERING DECISION — owner instruction:** Content Admin may stop an `OPEN` batch with a required reason. New starts stop immediately; in-progress attempts are marked `CANCELLED` in the same transaction. This is separate from pre-start cancellation.

**ENGINEERING DECISION — owner instruction:** Tryout packages retain existing archive flow. A package used by an open batch remains protected; stopping or closing that batch allows archival while preserving attempts and history.
