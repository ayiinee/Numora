# Materi and notification rollout

**ENGINEERING DECISION — 4 October 2026:** implementation follows the [owner-approved scope](../product/MATERIALS_NOTIFICATIONS_2026-10-04.md). No academic OPEN decision is activated. Browser business data continues to use NestJS; Supabase in the browser remains authentication only.

## Deploy in order

1. Review and apply the committed Drizzle migration `0027_materials_notifications.sql` through the team's migration workflow, using the migration credential. PR #77 integration preserves already-applied XP migrations 0024/0025 and appends PR #71 data alignment as 0026 before this migration. It adds nullable chapter category metadata, the notification inbox/outbox, indexes, RLS and the `SYSTEM_STARTED` activation marker. Existing categories stay null. Do not manually reproduce the schema in a Supabase dashboard.
2. Build/deploy database, API and worker together; then deploy the web app. The normal `db:check` detects missing new tables/columns before development starts. The worker requires this migration before notification discovery can run.
3. Keep the existing Redis/worker configuration. The notification poll executes every five seconds independently of analytics feature flags; it does not require enabling analytics or a PvP product policy.
4. Set chapter categories explicitly through Admin → taxonomy. `algebra`, `geometry`, `numbers`, `statistics`, or null are supported. The existing guarded redesign seed only maps its own `DEMO-UI-ALJABAR` chapter to algebra. It does not infer categories for real content or create demo inbox messages.

## API contract

The generated [OpenAPI](../../packages/contracts/openapi/openapi.json) is authoritative for wire types. All routes require an active Student and use `/api/v1`:

| Method and path | Behavior |
| --- | --- |
| `GET /students/me/materials` | READY chapters/subchapters/levels only; explicit category, own completed/available level counts, latest/best scores, recent chapter and continuation subchapter |
| `GET /students/me/notifications?filter=all&cursor=UUID` | 20 items, newest occurredAt then UUID; nextCursor when more exist |
| `GET /students/me/notifications/summary` | Active total and unread counts; archived items excluded |
| `POST /students/me/notifications/:id/read` | HTTP 200; idempotent read for the owning Student, cross-account ID returns 404 |
| `POST /students/me/notifications/read-all` | HTTP 200; reads unread active rows visible to that statement; later inserted rows remain unread |

Filters are `all`, `unread`, `class`, `tryout`, `learning`, `archive`. Archive means occurredAt at least 30 days old, calculated by PostgreSQL; rows are retained. Notification reading never changes feedback.readAt. Action identifiers map to known frontend routes/commands, never arbitrary URLs. Feedback links locate their item across inbox pagination without marking it read.

## Delivery and recovery

Feedback, PvP invitation and first Drill unlock insert source-keyed notification outbox rows in their domain transaction. Rollback removes both source mutation and event. Duplicate domain commands do not create another event. Unlock uses the student's durable level-progress ID, not a shared level ID.

The worker discovers the currently available Tryout using the same distribution/publication/Jakarta release predicate as the Student API. Result discovery shares the API's complete-package IRT sample/release check. It handles both newly released results and new submissions to an already released package; historical completed attempts from before activation are not backfilled just because a newer incomplete IRT batch exists.

Delivery locks each event using `FOR UPDATE SKIP LOCKED`, inserts with recipient/source deduplication and commits the broadcast UUID cursor in the same transaction. Student audience membership is bounded by event creation time. Broadcasts include Mandiri; later registrations are excluded. A crash before commit rolls back delivery/cursor together; replay after commit is safe. Source failures retry after 30 seconds. The poll itself does not overlap in one worker, and multiple workers can process separate locked events.

Worker logs contain delivery/failure counts, not bodies, student identifiers or credentials. With an authorized backend/migration connection, inspect backlog without exposing notification content:

```sql
SELECT kind, count(*) AS pending, min(occurred_at) AS oldest,
       count(*) FILTER (WHERE failed_at IS NOT NULL) AS retrying
FROM notification_outbox WHERE processed_at IS NULL GROUP BY kind;
```

If source rows are unavailable, investigate the producer transaction/source ID and worker deployment version; do not delete historical notification data or reset the activation marker. Restarting the worker resumes durable cursors. Expired/declined/accepted invitations refresh their action status through the API; commands still enforce the existing PvP authority and gate.

## Local verification

Use an isolated local test database and the repository's Node 24 / pnpm 12 toolchain. Never point integration tests at a shared Supabase project. Run migration, schema check, upgrade check, contracts validation/freshness, lint/typecheck, API/database/worker tests, web tests, production build and browser regression.

On memory-constrained Windows machines the optional `NUMORA_LOW_MEMORY=true` build mode limits webpack build/prerender workers without changing product behavior. Build the `.next-e2e` artifact with the public fixture API/auth settings from `apps/web/playwright.config.ts`; set `NUMORA_E2E_PRODUCTION=true` to run browser tests against that production build. `NUMORA_E2E_WEBPACK=true` optionally selects webpack for development browser runs. None of these modes grants access, seeds a shared database or activates production PvP.

Connected Google OAuth, shared-database deployment and real IRT operations remain team release checks. The local HTTP tests substitute the identity-provider boundary; browser test data and Socket.IO fixtures are synthetic.
