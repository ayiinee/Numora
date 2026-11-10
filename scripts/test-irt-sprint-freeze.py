"""Canonical full-size snapshot regression on owned native PostgreSQL; no R."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
AI = Path(os.environ["NUMORA_AI_SERVICE_PATH"]).resolve()
sys.path.insert(0, str(AI))

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    import psycopg
    harness = load("native_harness", ROOT / "scripts/test-irt-research-local.py")
    recipe = load("delivery_recipe", ROOT / "scripts/build-irt-delivery-fixtures.py")
    verifier = load("linux_verifier", AI / "tools/verify_irt_linux.py")
    files = recipe.build(AI)
    profile = json.loads((AI / "research/irt-runtime-linux-v3.json").read_text())
    output = ROOT / ".tmp/irt-sprint-step3/native-freeze.json"
    report = {"purpose": "RESEARCH_ONLY", "R": "NOT_RUN", "cases": []}
    with harness.local_database() as url:
        from tests.service import test_irt_postgres as fixtures
        fixtures.URL = url
        fixtures.IrtPostgresTests.setUpClass()
        fixture = fixtures.IrtPostgresTests(methodName="runTest")
        for name, count in [("two-arm", 2000), ("three-arm-partial", 2100)]:
            started = time.monotonic()
            print("Canonical native freeze: " + name, flush=True)
            value = json.loads(files[name + ".input.json"])
            try:
                notification, frozen = verifier.canonical_fixture(ROOT, fixture, url, value, profile)
                assert len(frozen["respondents"]) == count
                assert len(frozen["responses"]) == 30 * count
                with psycopg.connect(url) as db:
                    row = db.execute("SELECT octet_length(body::text), (SELECT count(*) FROM irt_calibration_dispatches_v1 WHERE request_id=r.id), input_digest=irt_compute.payload_digest(jsonb_build_object('recipe','PG_JSONB_IRT_RESEARCH_V1','body',body,'resources',resources,'runtime',runtime_profile)) FROM irt_calibration_requests_v1 r WHERE id=%s", (notification["requestId"],)).fetchone()
                assert row[1:] == (1, True)
                report["cases"].append({"case": name, "status": "PASS", "respondents": count, "responses": 30 * count, "bodyBytes": row[0], "inputDigest": notification["inputDigest"], "dispatches": row[1], "digestVerified": row[2], "seconds": round(time.monotonic() - started, 3)})
            except Exception as error:
                report["cases"].append({"case": name, "status": "FAIL", "failureType": type(error).__name__, "sqlstate": getattr(error, "sqlstate", None), "seconds": round(time.monotonic() - started, 3)})
                raise
            finally:
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_text(json.dumps(report, indent=2) + "\n")
            print(json.dumps(report["cases"][-1]), flush=True)

if __name__ == "__main__":
    main()
