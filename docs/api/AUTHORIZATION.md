# Current authorization — PRD v0.6

**PRD RULE:** NestJS verifies Auth identity and checks current database role/status/subrole on every privileged request. Fixed subrole assignment determines capabilities. Browser fields, JWT metadata and hidden menus never grant product privileges.

| Domain/action                    | Super Admin  | Operations          | Content/Data/Moderation               |
| -------------------------------- | ------------ | ------------------- | ------------------------------------- |
| Admin accounts/assignment/status | Full         | Denied              | Denied                                |
| School/teacher credentials       | Full         | Full                | Separate limited read; no credentials |
| Operational individuals/roster   | Full         | Read                | Denied                                |
| School/class structures          | Full         | Read                | Limited summaries/counts              |
| Content/media/assessment         | Full         | Denied              | Full                                  |
| Reports/IRT operations           | Full         | Denied              | Full                                  |
| Analytics                        | Both domains | Operational         | Content/aggregated                    |
| Audit                            | All          | Operations entities | Content/moderation/IRT entities       |
| Student ban/unban                | Denied       | Denied              | Denied                                |

**ENGINEERING DECISION:** unassigned Admin fails closed for privileged endpoints. Student/Teacher use Google; Admin uses internal Supabase Auth invitation/password, without public signup. All DTOs are generated from OpenAPI; least-data responses are enforced server-side. Assignment/status changes take effect even with an existing Auth token. Auth access and academic/result release are separate gates.

Class/Teacher checks still enforce resource relationships. Five memberships and nullable active Teacher are current product rules; main PR #77 supplies the membership/ownership domain implementation; Admin reader integration and its acceptance remain required. See [acceptance ledger](../development/ADMIN_FULL_STACK_STATUS.md).

<details><summary>Historical authorization baseline — superseded where v0.6 differs</summary>

# Authorization Model

Authentication answers **who the user is**. Authorization answers **what this user may do to this resource**.

## Identity baseline

- Student/Teacher: Google OAuth through Supabase Auth.
- Admin: internally provisioned/seeder identity; no public Admin registration.
- NestJS maps external auth identity to internal `users` record.

**ENGINEERING DECISION (Cloud Development, 29 September 2026):** Next.js uses a Supabase Auth cookie session. It sends the Supabase access token as a Bearer token to NestJS. `GET /api/v1/identity/me` returns the internal profile or 404 until registration; `POST /api/v1/identity/me` accepts a one-time `STUDENT`/`TEACHER` role choice from a Google-authenticated account. Email and Auth user ID come only from the verified Supabase user. The API returns role, status, Teacher verification, and Student affiliation from PostgreSQL; no browser Data API access is part of this flow. Admin identity remains internally provisioned.

## Authorization dimensions

Evaluate as needed:

1. authenticated identity;
2. role;
3. account active/restriction status;
4. Teacher school verification;
5. Class membership/ownership;
6. resource relationship;
7. product-specific eligibility (level unlocked, eligible TryOut package and attempt state, one attempt/package, etc.).

## Matrix baseline

| Resource/action                           | Student                                                                           | Teacher                          | Admin                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| Own profile read/update display name      | Yes                                                                               | Yes                              | operational read where authorized                                       |
| Choose/change own role after registration | No                                                                                | No                               | internal process only if ever approved                                  |
| List schools for verification             | No need                                                                           | Yes                              | Yes                                                                     |
| Consume teacher token                     | No                                                                                | Yes                              | No                                                                      |
| Generate/revoke teacher token             | No                                                                                | No                               | Yes                                                                     |
| Create class                              | No                                                                                | Verified Teacher                 | operational/admin management                                            |
| Join class                                | Yes if no existing class                                                          | No                               | correction policy OPEN-08                                               |
| View own assessment results               | Yes                                                                               | own students only                | authorized operational access                                           |
| View another Student detail               | No                                                                                | only own class                   | authorized                                                              |
| Manage question bank                      | No                                                                                | No                               | Existing operational capability; outside new Drill/TryOut feature scope |
| Send feedback                             | No                                                                                | own Student only                 | not standard user flow                                                  |
| Read feedback                             | own only                                                                          | sent/own-class context as needed | operational only                                                        |
| Start Drill without Class                 | Yes, Mandiri                                                                      | n/a                              | n/a                                                                     |
| Start Pretest without Class               | Baseline v0.5 No; affiliation reconciliation remains OPEN                         | n/a                              | n/a                                                                     |
| Start TryOut without Class                | Yes, free MVP for Mandiri and School Students; package eligibility still enforced | n/a                              | n/a                                                                     |
| Create/share PvP room without Class       | Yes, Mandiri                                                                      | n/a                              | n/a                                                                     |
| Invite classmate to PvP                   | School Student only                                                               | n/a                              | n/a                                                                     |
| View IRT                                  | No                                                                                | No                               | Yes                                                                     |

## Server enforcement

Do not rely on hidden menus. All sensitive endpoints and WebSocket actions must enforce policy server-side.

**ENGINEERING DECISION:** creating a Class and joining an existing Class both require an active School and an active Teacher-School membership for that Class's Teacher at the time of the database transaction. A standalone foreign key from `classes` to `users` cannot prove this cross-table condition. Identity reports a Teacher as verified only while a membership in an active School exists.

Example Teacher check:

```text
authenticated
AND role == TEACHER
AND verified school membership exists
AND class.teacher_id == current_user.id
AND account not restricted
```

## WebSocket

WebSocket connection must authenticate before joining protected rooms. Every state-changing event still validates match membership/state; connection authentication alone is insufficient.

## Least data principle

Global PvP leaderboard should return only minimum display fields required by PRD, not email or private learning history.

## Latest Core Learning source — 2 October 2026

**PRD RULE — TryOut v1.1:** no class/payment prerequisite for MVP Students. Validate account role/status, package availability, existing attempt, ownership and result release server-side. Past never-attempted package eligibility is TRY-TBC-05; no second attempt for an already-attempted package. Existing class-required implementation must be aligned, not preserved as a current product rule. Teacher monitoring remains scoped to owned Classes. See [source reconciliation](../product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md).

</details>
