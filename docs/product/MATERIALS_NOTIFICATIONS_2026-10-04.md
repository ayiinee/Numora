# Materi and in-app notifications — approved extension

**ENGINEERING DECISION — 4 October 2026:** the owner approved the implementation plan supplied in chat. Materi uses an inline Chapter → Subchapter accordion, explicit optional chapter categories, existing roadmap and server progress. Add a durable Student notification inbox for feedback, classmate PvP invites, current Tryout opening, actual released Tryout results and first Drill level unlock. Archive from the active inbox after 30 days without deletion; notification reads do not mark feedback read. No email/push, rank reward, Pretest implementation, policy activation or historical bulk backfill.

Notifications use a separate transactional outbox and retrying five-second worker, independent of analytics gates. PostgreSQL owns persistence/time; NestJS owns recipients/actions/authorization. Browser only calls authenticated APIs. Migrations follow the existing Drizzle stream, not manual shared Supabase edits. Existing academic OPEN decisions remain unresolved.

Contract: GET students/me/materials; GET students/me/notifications with filter/cursor; GET summary; POST :id/read and read-all, under /api/v1. Material category is nullable on existing chapters. Dates group in Asia/Jakarta. UI polls visible tabs every 15 seconds.

**ENGINEERING MAINTENANCE — 5 October 2026:** the UI branch merge preserves remote migrations 0018–0021 and appends notification/category SQL as `0022_amusing_quasar`. Its SQL hash and timestamp remain unchanged from local `0018_amusing_quasar`. The integrated migrator recognizes that exact fork and transactionally applies its missing remote migrations while retaining existing history and data. Unknown histories remain rejected. No shared database migration is performed by this merge resolution.
