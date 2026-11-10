"""Snapshot-only disposable acceptance. No dispatch, worker, R, or shared database."""
import importlib.util
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
AI = Path(os.environ.get('NUMORA_AI_SERVICE_PATH', str(ROOT.parent / 'Numora-ai-service')))
sys.path.insert(0, str(AI))
sys.path.insert(0, str(ROOT / 'scripts'))
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from irt_delivery_seed import build

spec = importlib.util.spec_from_file_location('harness', ROOT / 'scripts/test-irt-research-local.py')
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='Optional synthetic snapshots/evidence; use an ignored or temporary directory')
    args = parser.parse_args()
    profile = json.loads((AI / 'research/irt/policy-v1.json').read_text())
    with harness.local_database() as url:
        with psycopg.connect(url, row_factory=dict_row) as db:
            historical_xp = db.execute('SELECT to_jsonb(x) AS row FROM xp_ledger x ORDER BY id').fetchall()
            results_before = db.execute('SELECT count(*) AS count FROM tryout_attempt_results').fetchone()
            actor = db.execute("INSERT INTO users(auth_user_id,role,admin_role,display_name,email) VALUES(%s,'ADMIN','CONTENT_DATA_MODERATION','SYNTHETIC','delivery@example.test') RETURNING id", (uuid4(),)).fetchone()['id']
            for arms in [2, 3]:
                package = db.execute("INSERT INTO assessment_packages(family_code,package_version,name,assessment_type) VALUES(%s,1,'SYNTHETIC','TRYOUT') RETURNING id", (uuid4().hex,)).fetchone()['id']
                batch = db.execute("INSERT INTO tryout_batches(package_id,starts_at,closes_at,cutoff_at,result_due_at) VALUES(%s,now(),now()+interval '1 day',now()+interval '1 day',now()+interval '4 days') RETURNING id", (package,)).fetchone()['id']
                context = db.execute("INSERT INTO measurement_contexts(ecosystem,dimension,tryout_batch_id,scale_code) VALUES('TRYOUT','RESEARCH',%s,%s) RETURNING id", (batch, uuid4().hex)).fetchone()['id']
                value = build(db, actor, context, batch, arms)
                value.update(requestId=str(uuid4()), snapshotId=str(uuid4()), calibrationId=str(uuid4()))
                resources = {}
                for key, kind, source in [('model', 'IRT_MODEL', 'engine'), ('quality', 'QUALITY_GATE', 'quality'), ('eligibility', 'IRT_ELIGIBILITY', 'eligibility'), ('scoring', 'IRT_SCORING', 'scoring'), ('scoreMapping', 'SCORE_MAPPING', 'mapping')]:
                    definition = profile[source]
                    policy = db.execute("INSERT INTO irt_compute.technical_policy_versions(code,version,kind,definition,digest,status) VALUES(%s,1,%s,%s,irt_compute.payload_digest(%s),'SEALED') RETURNING id,digest", (uuid4().hex, kind, Jsonb(definition), Jsonb(definition))).fetchone()
                    approval = db.execute('INSERT INTO configuration_approvals(technical_policy_version_id,approved_digest,scope,approved_by_user_id,approved_at) VALUES(%s,%s,%s,%s,now()) RETURNING id', (policy['id'], policy['digest'], Jsonb({'ecosystem': 'TRYOUT', 'contextId': str(context), 'purpose': 'RESEARCH_ONLY'}), actor)).fetchone()['id']
                    ref = {'id': str(policy['id']), 'version': 1, 'digest': policy['digest'], 'approvalId': str(approval)}
                    resources[key] = {'kind': kind, 'ref': ref, 'definition': definition}
                    value['policies'][key] = ref
                db.commit()
                bundle = {'value': value, 'resources': resources, 'runtime': json.loads((AI / 'research/irt-runtime-windows-v4.json').read_text())}
                subprocess.run(['node', 'scripts/test-irt-delivery-cases.mjs'], cwd=ROOT, input=json.dumps(bundle), text=True,
                               env={**os.environ, 'IRT_RESEARCH_LOCAL_URL': url, 'NUMORA_IRT_RESEARCH_ENABLED': 'true',
                                    'IRT_DELIVERY_EVIDENCE_DIR': str(args.output.resolve()) if args.output else ''}, check=True, timeout=90)
        with psycopg.connect(url) as db:
            assert db.execute('SELECT count(*) FROM irt_calibration_dispatches_v1').fetchone()[0] == 0
            assert db.execute('SELECT count(*) FROM irt_compute.calibration_jobs_v1').fetchone()[0] == 0
        with psycopg.connect(url, row_factory=dict_row) as db:
            assert db.execute('SELECT to_jsonb(x) AS row FROM xp_ledger x ORDER BY id').fetchall() == historical_xp
            assert db.execute('SELECT count(*) AS count FROM tryout_attempt_results').fetchone() == results_before
            print(json.dumps({'dispatches': 0, 'jobs': 0, 'xpWrites': 0, 'R': 'NOT_RUN'}))


if __name__ == '__main__':
    main()
