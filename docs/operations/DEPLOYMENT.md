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

Google login is a three-party redirect chain, and each hop has its own allowlist. An allowlist mismatch can cause a redirect error. Diagnose browser HTTP/TLS warnings separately from Google's testing or unverified-app warnings; they have different causes and fixes. Check the exact error and the affected hop before changing configuration.

| Hop                 | Setting to keep in sync                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser → app       | App is served only over HTTPS on the canonical domain. The login button uses `window.location.origin`, so the operator must never serve the app from an ad-hoc host or port.     |
| App → Supabase Auth | Each environment's Supabase **Site URL** equals its canonical app origin, and **Redirect URLs** allow that environment's exact `/auth/callback` URL.                             |
| Supabase → Google   | That environment's Google OAuth client authorizes the callback URL shown by its Supabase project (`/auth/v1/callback`). Keep testing and production in separate Google projects. |

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_API_URL` baked into the production web bundle must point to the intended environment over HTTPS. Preserve the API base path `/api/v1`. The app callback uses `window.location.origin`; a wrong API URL instead breaks API access, including identity loading. Use exact production redirect URLs rather than broad preview wildcards. Local development origins belong only in the separate testing configuration. See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

### Google OAuth consent screen

- Set the public production app to **In production**. For an External app in **Testing**, access normally uses a test-user allowlist capped at 100. Google makes an exception when only the basic identity scopes `openid`, `email`, and `profile` are requested: users need not be on that allowlist. A testing warning is distinct from the standard unverified-app warning; Testing alone does not imply every student sees the latter.
- Request only the scopes needed for sign-in. Sensitive or restricted scopes can require additional scope verification and show an unverified-app warning until approved. Publishing alone does not complete verification. Brand verification governs display of the production app's name/logo. Keep the homepage and privacy-policy links reachable and the domain ownership verified for the applicable verification process. See [Google OAuth app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).
- Use separate Google Cloud projects and OAuth clients for testing/staging and production. Authorize each Supabase callback only in the corresponding environment's client; do not add staging callbacks or development origins to the production client. Review the production project's actual branding, scopes and redirect URIs before submitting it for the required verification. See [Google production OAuth policy](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance).

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
