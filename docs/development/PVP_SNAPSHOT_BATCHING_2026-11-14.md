# PvP snapshot batching

**ENGINEERING DECISION** — batch the shared locked snapshot read per match/broadcast. Authenticate socket recipients as before, validate every requested membership before delivery, and generate a separate DTO containing only that student's answer. Multiple tabs reuse that student's view. A failed batch falls back to isolated recipient reads so one stale recipient does not block others.

The match lock, pinned question decoder, delivery manifest and exposure recording remain in the same transaction. Delivery calls batch distinct active student IDs in sorted order and remain idempotent. Former members retain the previous snapshot behavior; foreign/nonexistent membership is rejected before match lookup. No private answer is stored as a shared match cache entry.

Scheduler notifications return the creator's prepared snapshot when Redis scheduling needs it; deadline scheduling reuses it. Committed command replies can also be reused by scheduling after acknowledgement. Missing/failed notifications fall back to the previous durable reschedule read. PostgreSQL tick still validates all deadline jobs. The one-second recovery sweep, timers and 20-second reconnect policy are unchanged.

## Local validation

On a warmed isolated PostgreSQL connection, two separate personalized snapshots transfer 6,229 protocol bytes in 18 statements; one shared read transfers 3,263 bytes in 9 statements. The same read produces exactly equal personalized views, including one answered and one unanswered player. This is a synthetic comparison, not Supabase billed egress.

28 tests across seven files cover real Socket.IO/Redis transport, ACK-before-transient-work, multiple tabs, privacy, fallback, delivery idempotency, scoring/deadlines, reconnect/forfeit and restart recovery. Membership prechecking was subsequently verified in the focused three-test integration suite. Typecheck/lint/build are required before release. No migration or env change.

Stacked after runtime payload PR #184. Merge its parent first, then retarget this PR to main.
