# Identity diagnostics — PR #49

**ENGINEERING MAINTENANCE — 3 October 2026:** registration diagnostics use the NestJS logger with fixed stage/failure messages. They omit authorization headers, token lengths, auth/internal user IDs, email, display name, inserted rows, and raw database errors. Application exceptions and registration authorization remain unchanged. See the [security logging restrictions](../security/SECURITY.md).

Browser diagnostics run only in development and report configuration/session presence, request path/method, and selected role. They never report token values, token lengths, or profile details. Production builds omit these debug branches.

Next.js loads the workspace-root environment using `@next/env` and the current development mode, while retaining the existing process environment precedence. No environment values are logged or committed.

Verification includes an identity regression test for successful registration and a database failure containing test-only private data; neither diagnostic path may disclose those values. Full CI validates the combined PR against current main, including contracts, integration tests, browser E2E, connected release chain, build, and OpenAPI freshness. Real Google OAuth and deployment acceptance remain separate QA checks.
