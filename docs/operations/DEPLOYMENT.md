# Deployment

## Preferred production topology

```text
Cloudflare DNS/CDN
      │
      ▼
VPS application layer
  - Next.js
  - NestJS API/WebSocket
  - Worker/Scheduler
      │
      ▼
Supabase cloud PostgreSQL + Auth; Redis cloud

Cloudflare R2 is used for owned object media.
```

## Managed dependencies

Supabase and Redis cloud reduce local infrastructure work and keep the same service types across environments. Use an isolated development Supabase branch/project; staging contains real-user data. If Redis is shared, isolate BullMQ keys with distinct prefixes and credentials where available.

A full self-hosted fallback needs a separate operational review. The choice of a deployment container is independent of the no-Docker development setup.

## Environments

Deployment must separate Development, Staging, and Production configuration/secrets.

## Deployment flow target

```text
merge to main
→ CI build/test
→ build immutable application artifact/container
→ deploy staging
→ migration rehearsal + smoke/E2E
→ approved production deployment
→ health/smoke checks
```

## Database migrations

- run controlled migration before/with deployment;
- use a direct `DATABASE_MIGRATION_URL` only in the designated migration runner, separate from runtime `DATABASE_URL`;
- keep Drizzle migrations canonical; do not enable another automatic Supabase migration path without coordinating it;
- avoid destructive incompatible changes without phased rollout;
- back up before high-risk migrations;
- verify rollback/forward-fix approach.

## Health endpoints

Recommended:

- `/health/live` — process alive, minimal dependencies;
- `/health/ready` — ready to serve, key dependencies healthy within reasonable checks.

## Rollback

Application rollback must not blindly roll database schema backward if new writes have occurred. Prefer backward-compatible migrations and forward fixes when possible.

## Domain/OAuth

Stable staging/production domain is required to finalize OAuth redirect URIs and public routing but is not a development blocker.

### Redirect allowlist

Google login is a three-party redirect chain, and each hop has its own allowlist. A mismatch or an unreviewed consent screen is what produces the browser/Google "not secure" or "unverified app" interstitial at login; the application code cannot fix it.

| Hop                 | Setting to keep in sync                                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser → app       | App is served only over HTTPS on the canonical domain. The login button uses `window.location.origin`, so the operator must never serve the app from an ad-hoc host or port. |
| App → Supabase Auth | Supabase **Site URL** equals the canonical app origin, and **Redirect URLs** contain exactly `<site url>/auth/callback` for every environment.                               |
| Supabase → Google   | The Google OAuth client's **Authorized redirect URIs** contain Supabase's `/auth/v1/callback` for the same Supabase project.                                                 |

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_API_URL` baked into the web bundle must be HTTPS origins; a relative or `http://localhost` fallback in a production build sends the login redirect to an origin the allowlists do not cover.

### Google OAuth consent screen

- Publishing status must be **In production**. A screen left in **Testing** shows Google a red "Google hasn't verified this app" warning to every student and caps the invite list to test users.
- Verification requires the app to be reachable, the domain to be owned by the project, and the declared scopes to be limited to `openid email profile`. Homepage, application, and privacy-policy links must point at the deployed site.
- Both the staging and production Supabase project callbacks must be authorized on the client before verification is submitted, otherwise re-verification is needed later.

### Transport security and response headers

`apps/web/next.config.ts` emits the baseline response headers for every route it serves:

```text
Strict-Transport-Security: max-age=31536000        (production build only)
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

`X-Powered-By` is suppressed on both Next.js (`poweredByHeader: false`) and NestJS (`app.disable('x-powered-by')`).

The reverse proxy terminates TLS and must send the same `Strict-Transport-Security` header for `api.<production domain>`, because the header applies per host and the API/WebSocket origin is contacted directly by the browser. Any additional subdomain added later must have a valid certificate before HSTS `includeSubDomains` or preload is considered.

A full `Content-Security-Policy` with `script-src`/`connect-src` is not yet enforced: the app loads Socket.IO over WebSocket from the API origin and renders server components with inline bootstrap scripts, so a nonce-based policy needs a per-request generator and live browser verification first.
