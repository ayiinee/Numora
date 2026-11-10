# IRT artifact adoption v1

Main accepts research artifacts through `POST /admin/irt/research/requests/{requestId}/adopt`.
The endpoint is separate from legacy `analysis_requests`/compute v3 adoption.

Adoption checks the frozen `irt_calibration_inputs_v1` identity and digest, the
latest successful fenced calibration job, artifact provenance, and exact
attempt coverage from `response_snapshot_items`. Duplicate attempts,
respondents, packages, or conflicting artifact digests are rejected.

Successful adoption writes an immutable receipt, package/arm metadata, attempt
coverage rows, and item parameters into `irt_batches`/`irt_item_results`.
The receipt keeps source request, execution, artifact digest, and batch IDs.
GPCM steps remain absolute step difficulties. `SUCCEEDED` artifacts with
`INSUFFICIENT`, `NOT_COMPARABLE`, `ANOMALY`, or `UNSCORABLE` participant rows
are retained as evidence; they do not publish results.

Technical or identity failure writes a `FAILED` receipt without item results.
Replay of the same artifact returns the existing receipt. A different artifact
for the same request is an adoption conflict.

This stage does not create `tryout_result_finalizations` or
`tryout_attempt_results`, publish scores/explanations, write XP, alter attempts,
or activate parameter bindings. Those remain Prioritas 4.
