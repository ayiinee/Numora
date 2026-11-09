# Contracts Package

Machine-readable contracts shared by Software, QA, and Data/AI.

The [IRT calibration v1 contract](irt-calibration-v1/README.md) adds frozen calibration input, item/participant output, execution/scientific failure states, generated TypeScript types, JavaScript/Python validation, and shared conformance fixtures. This is an opt-in payload contract for the approved v2 design, not a change to the v3 notification or legacy item-only artifact. Generator-service-v1 is unchanged; adoption/publication runtime remains a separate implementation.

Current bootstrap contents:

- `openapi/openapi.json` — committed REST contract; regenerate from NestJS after API changes.
- `questions/question.schema.json` — draft Data/AI question ingestion envelope.
- `questions/question-variant.schema.json` — draft equivalent-variant envelope.
- `events/analytics-event.schema.json` — versioned analytics event envelope.
- `websocket/pvp-events.schema.json` — initial PvP event-name/envelope contract.

These schemas intentionally define transport/envelope shape without inventing unresolved PRD academic rules. Human-readable semantics live under `docs/api/` and `docs/data/`.

The question schemas are **for Data/AI import**, not Student-facing responses. `scripts/validate-contracts.mjs` compiles JSON Schema with formats/references; IRT cross-field and input/output matching rules are tested separately with `pnpm contracts:irt:test`. Schema compilation alone is not payload or scientific acceptance.
