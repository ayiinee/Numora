# Tryout runtime controls — 17 November 2026

**ENGINEERING DECISION — owner instruction:** Tryout attempt duration is 75 minutes (`4,500` seconds) for new starts. Existing attempt deadlines remain pinned.

**ENGINEERING DECISION — owner instruction:** Multiple published Tryout batches may overlap and remain open at the same time. Student assignment remains unique per student and batch.

**ENGINEERING DECISION — owner instruction:** Content Admin may stop an `OPEN` batch with a required reason. New starts stop immediately; in-progress attempts are marked `CANCELLED` in the same transaction. This is separate from pre-start cancellation.

**ENGINEERING DECISION — owner instruction:** Tryout packages retain existing archive flow. A package used by an open batch remains protected; stopping or closing that batch allows archival while preserving attempts and history.
