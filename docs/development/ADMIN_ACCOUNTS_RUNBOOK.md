# Admin accounts: provisioning and operator recovery

**ENGINEERING DECISION:** account endpoints are restricted to current ACTIVE SUPER_ADMIN profiles. Assignment is fixed to the three v0.6 roles. Pending profiles are DISABLED and unassigned until their verified Auth identity accepts the durable server invitation. Replaying acceptance never re-enables an account. One global transaction advisory lock serializes account changes, acceptance and operator recovery; the last active Super cannot be disabled or demoted.

## Enable in an isolated Development sandbox

Commit and rehearse migrations 0028/0029 before applying with the operator migration URL. Runtime has only server-role table grants; browser and compute roles receive no access. Configure server-only `SUPABASE_SECRET_KEY`, `ADMIN_ACCOUNT_INVITES_ENABLED=true`, and exact `ADMIN_AUTH_REDIRECT_ORIGIN`. Verify the intended Auth project and database first. Never use real-user staging for development.

Configure SMTP, provider password policy, email invitation and recovery templates, and redirect allowlist for `/admin/auth/confirm`. Preferred template links use the application's confirmation path with `token_hash={{ .TokenHash }}` and `type=invite` or `type=recovery`. The confirmation screen also accepts provider implicit session fragments; recovery supports PKCE code on the same browser. Invite does not reuse the Google OAuth PKCE callback. Secret URL parameters/fragments are removed immediately and are never displayed by the portal. No password or generated Auth link is returned by admin APIs.

The provider's default email service is for nonproduction and restricts recipients. Test a real sandbox email delivery before enabling operational use; see [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Partial failure and recovery

The invitation record is reserved and audited before the provider is contacted. `SENDING` has a ten-minute lease. Retry the same operation after failure or expired lease. Provider reconciliation only accepts the exact normalized email and invitation operation marker; role always comes from the server record. Existing Auth identities from another operation and existing Student/Teacher profiles are rejected. `INVITED` means Auth and disabled profile are provisioned, not proof of email delivery or login acceptance.

If the email is lost/expired after provisioning, Super Admin can send password recovery from the account list. Recovery requests have their own durable operation, idempotency key and lease. A retry after an ambiguous send may send another recovery email; it cannot create another account or assignment. A pending recipient using recovery can complete password setup and accept only the server-pinned INVITED operation. Cancellation revokes the invitation; accepted accounts are disabled through account management. Provider sessions can remain valid, but the database assignment/status is checked on every privileged request.

Self-service `/admin/recovery` uses Supabase Auth and returns a generic response regardless of account existence. It does not provision profiles or assign roles. Super-initiated recovery is recorded in the application audit; provider audit records cover self-service requests. Disabled accepted accounts require reactivation by a Super or operator before portal recovery.

## Restricted bootstrap/emergency operator

`apps/api/scripts/recover-super-admin.mjs` is separate from QA provisioning. Use a database-owner connection with TLS, exact `ADMIN_OPERATOR_DATABASE_HOST`, matching `SUPABASE_PROJECT_REF`, and server-only Auth credentials. The operator must first identify an existing verified Auth account. The command never creates Auth users, passwords, or links.

Run from `apps/api`: `node scripts/recover-super-admin.mjs --auth-user-id UUID --mode bootstrap --reason "approved bootstrap reason"`. Bootstrap refuses when an active Super already exists. Emergency uses `--mode emergency --actor-id UUID` and an explicit incident reason. The target must be an Admin or an identity without a product profile; Student/Teacher conversion is refused. Recovery activates Super access transactionally, cancels pending invitations that could overwrite it, and records operator, actor, target, time and reason. Use normal account management after recovery and review its audit. This procedure requires operator authorization and must not be exposed as a web endpoint.

## Acceptance evidence still required

Automated PostgreSQL tests cover replay, partial database failure, identity conflict, acceptance revocation and concurrent last-Super changes. Fixture Auth/UI tests cannot establish SMTP delivery, expiry behavior of a deployed template, provider password policy, production redirect setup, or independent QA. Record the exact SHA and sandbox project for those checks before treating M2 as accepted.
