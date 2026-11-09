# IRT calibration transport v1

Research only; disabled unless `NUMORA_IRT_RESEARCH_ENABLED=true`. Scientific
payload remains `irt-calibration-v1`; this transport never carries raw answers,
participant identities, or full calibration input.

- `POST /api/v1/irt/compute/execute`: authenticated compute notification v3.
  Returns HTTP 202 for ACCEPTED/RUNNING, 200 for terminal replay.
- `GET /api/v1/irt/compute/requests/{requestId}?inputDigest=...&dispatchGeneration=...`:
  status pinned to the authorized input and generation.
- `GET /api/v1/irt/capabilities`: TRYOUT, 2PL/GPCM; comparison/publication false.

Bearer authentication is independent of generator credentials. HTTP acknowledgement
timeout is 10 seconds; POST never waits for R. Duplicate notifications retain the
same durable job. Lost acknowledgements may be retried unchanged. New execution
generations require explicit main authorization; maximum three per request.

Wrong digest/stale generation/revoked approval return 409. Unsupported scientific
operations are rejected; they are never fabricated as insufficient data or PASS.
Errors use `application/problem+json`, without secrets or database diagnostics.

Status references an immutable compute artifact, not an adopted student result.
FAILED is a technical outcome; SUCCEEDED may contain INSUFFICIENT. Only main owns
any future publication, fallback, or canonical adoption.
