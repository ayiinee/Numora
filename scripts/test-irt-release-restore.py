"""Resume a synthetic sealed checkpoint in a new owned loopback cluster; never shared DBs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import subprocess
from uuid import uuid4
import psycopg

ROOT=Path(__file__).resolve().parents[1]
BIN=Path(os.environ.get('POSTGRES_BIN','C:/Program Files/PostgreSQL/16/bin'))
def main():
    p=argparse.ArgumentParser();p.add_argument('folder',type=Path);a=p.parse_args()
    folder=a.folder.resolve()
    assert folder.is_relative_to((ROOT/'.tmp/irt-release-acceptance').resolve())
    roles=(folder/'synthetic-roles.sql').read_text()
    local_database=runpy.run_path(str(ROOT/'scripts/test-irt-research-local.py'))['local_database']
    with local_database() as url:
        # Restore only synthetic restricted logins, not cluster-wide settings from a dump.
        with psycopg.connect(url) as db:
            for login in re.findall(r'CREATE ROLE (irt_test_(?:main|compute)_[a-f0-9]+);',roles):
                db.execute(psycopg.sql.SQL('CREATE ROLE {} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS').format(psycopg.sql.Identifier(login)))
                parent='numora_main_runtime' if login.startswith('irt_test_main_') else 'numora_irt_runtime'
                db.execute(psycopg.sql.SQL('GRANT {} TO {}').format(psycopg.sql.Identifier(parent),psycopg.sql.Identifier(login)))
        name='irt_research_test_restore_'+uuid4().hex
        with psycopg.connect(url,autocommit=True) as db:db.execute(psycopg.sql.SQL('CREATE DATABASE {}').format(psycopg.sql.Identifier(name)))
        restored=url.rsplit('/',1)[0]+'/'+name
        result=subprocess.run([str(BIN/'pg_restore.exe'),'--no-owner','--exit-on-error','-d',restored,str(folder/'synthetic-sealed.dump')],capture_output=True,text=True,timeout=120)
        if result.returncode:raise RuntimeError('Synthetic checkpoint restoration failed: '+result.stderr[-1200:])
        with psycopg.connect(restored) as db:
            valid=db.execute("SELECT bool_and(input_digest=irt_compute.payload_digest(jsonb_build_object('recipe','PG_JSONB_IRT_RESEARCH_V1','body',body,'resources',resources,'runtime',runtime_profile))) FROM irt_calibration_requests_v1").fetchone()[0]
            assert valid,'Restored frozen input commitment mismatch'
            request=db.execute("SELECT id::text FROM irt_calibration_requests_v1 ORDER BY jsonb_array_length(body->'respondents') DESC LIMIT 1").fetchone()[0]
        login=re.search(r'CREATE ROLE (irt_test_main_[a-f0-9]+);',roles).group(1)
        restricted=restored.replace('fixture@',login+'@')
        result=subprocess.run(['node','scripts/test-irt-release-cases.mjs',request],cwd=ROOT,
            env={**os.environ,'IRT_VERIFY_URL':restricted,'IRT_FIXTURE_URL':restored},capture_output=True,text=True,timeout=180)
        if result.returncode:
            (folder/'restored-release-failure.log').write_text(result.stderr)
            raise RuntimeError('Restored release failed: '+result.stderr[:1800])
        report={'purpose':'RESEARCH_ONLY','source':'RESTORED_IMMUTABLE_SYNTHETIC_CHECKPOINT','checkpointSha256':hashlib.sha256((folder/'synthetic-sealed.dump').read_bytes()).hexdigest(),'inputCommitmentsVerified':True,'release':json.loads(result.stdout)}
        (folder/'restored-release.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':main()
