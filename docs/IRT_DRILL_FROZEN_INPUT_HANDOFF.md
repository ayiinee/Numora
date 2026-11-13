# Drill LEVEL frozen input handoff

Status: `RESEARCH_ONLY`, input ready for engine step 5. No dispatch, scoring, fallback, API, or production approval.

- Manifest pins `DRILL/LEVEL`, context revision, two arms, 10 items per arm, 3 shared anchors and 7 focal items.
- Recipe uses existing simulator, seed `20261121`, 500 participants per arm. Small fixture uses 2 per arm.
- Eligibility is authoritative assignment/delivery/grading input. First-valid evidence is pinned per student/LEVEL; retries remain audit-only. Exposure provenance is recorded; crossover and missing pins are blockers.
- Policy `irt-drill-research-policy-v1` is `RESEARCH_ONLY`; `comparisons: []`, no participant score mapping and no Drill fallback.
- Runtime/engine support remains deferred to sprint step 5. Request/status API and LEVEL capability remain closed.

Commands:

```powershell
python scripts/build-irt-drill-fixtures.py --ai-repo ..\\.worktrees\\irt-release-ai --output .tmp\\irt-drill-small --small
python scripts/build-irt-drill-fixtures.py --ai-repo ..\\.worktrees\\irt-release-ai --output .tmp\\irt-drill-large
python scripts/validate-irt-drill-frozen.py .tmp\\irt-drill-small .tmp\\irt-drill-large
```
