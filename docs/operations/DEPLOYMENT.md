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

For manual Redis switching and optional quota-triggered failover on the existing Ubuntu/systemd VPS, see
[Mengganti Redis Production melalui PuTTY](REDIS_SWITCH.md).

A full self-hosted fallback needs a separate operational review. The choice of a deployment container is independent of the no-Docker development setup.

## Environments

Deployment must separate Development, Staging, and Production configuration/secrets.

Each production web build embeds a release identifier. Tabs that already run the release check
compare their identifier with `/release-version` every 30 seconds while visible and when returning
to the foreground. Keep that endpoint uncached. The banner requests a manual reload and waits for
unacknowledged assessment answers, assessment submission and active PvP participation. Tabs opened
before the first deployment of this feature need one manual refresh to start checking.

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

## VPS Next.js frontend deployment checklist

Production `numora-web` reads `NUMORA_WEB_DIST_DIR` from
`/etc/numora/production.env`. The build directory must match that value. The
production env file is also the source of public Supabase/API values baked into
the browser bundle. Never run a production build with an empty shell env or a
developer `.env`.

Run as `admin-numora` on VPS:

```bash
cd /opt/numora
export PATH=/home/admin-numora/.nvm/versions/node/v24.22.1/bin:$PATH
set -a
. /etc/numora/production.env
set +a
test "$NUMORA_WEB_DIST_DIR" = ".next-db-switch"
pnpm install --frozen-lockfile
rm -rf "apps/web/$NUMORA_WEB_DIST_DIR"
pnpm --filter @tka/web build
sudo systemctl restart numora-web
systemctl is-active numora-web
```

Before declaring success:

1. Check `systemctl is-active numora-web numora-api`.
2. Open an authenticated admin page in a fresh browser reload.
3. Verify existing login/session, API identity loading, and one read-only admin page.
4. Verify the changed UI behavior.
5. Check `sudo journalctl -u numora-web -n 80 --no-pager` for startup or auth errors.

If users suddenly appear logged out or passwords appear invalid after a web
deploy, stop further changes. Do not reset passwords or touch Auth rows. First
rebuild using the exact procedure above; a missing production Supabase public
key can make the client reject otherwise valid sessions.

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
