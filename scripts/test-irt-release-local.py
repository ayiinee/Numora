"""Canonical synthetic freeze -> HTTP -> daemon -> artifact -> release, disposable only."""
import importlib.util
import argparse
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
AI=Path(os.environ['NUMORA_AI_SERVICE_PATH']).resolve()
sys.path.insert(0,str(AI))
from fastapi.testclient import TestClient
from numora_service.irt.api import create_app
from numora_service.irt.daemon import execute_once
from numora_service.irt.runtime import profile
from research.irt.synthetic import generate

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--engine-double',action='store_true');args=parser.parse_args()
    local_database=runpy.run_path(str(ROOT/'scripts/test-irt-research-local.py'))['local_database']
    with local_database() as url:
        from tests.service import test_irt_postgres as fixtures
        fixtures.URL=url
        cls=fixtures.IrtPostgresTests
        cls.setUpClass()
        fixture=cls(methodName='runTest')
        spec=importlib.util.spec_from_file_location('linux_verify',AI/'tools/verify_irt_linux.py')
        verifier=importlib.util.module_from_spec(spec);spec.loader.exec_module(verifier)
        client=TestClient(create_app(fixture.settings,fixture.repo),raise_server_exceptions=False)
        headers={'Authorization':'Bearer '+fixture.settings.token}
        scenarios=((False,''),) if args.engine_double else ((False,''),(True,''),(False,'CANCEL'),(False,'REVOKE'),(False,'ZERO'),(False,'COVERAGE'))
        for failure,block in scenarios:
            value=generate(500 if args.engine_double else 2,20261119,arms=2,include_mcma=True)[0]
            if block in ('ZERO','COVERAGE'):
                for person in value['respondents']:
                    rows=[r for r in value['responses'] if r['attemptId']==person['attemptId']]
                    for row in rows[:30 if block=='ZERO' else 7]:
                        row.update(responseState='NOT_PRESENTED',scoreCategory=0,awardedPoints='0.00',includedInCalibration=False,eligibilityReasons=['NOT_PRESENTED'])
            notification,_=verifier.canonical_fixture(ROOT,fixture,url,value,profile())
            response=client.post('/api/v1/irt/compute/execute',headers=headers,json=notification)
            assert response.status_code==202,response.text
            if failure:
                with patch('numora_service.irt.daemon.run',side_effect=ValueError('TIMEOUT')):
                    assert execute_once(fixture.repo)
            elif args.engine_double:
                from tests.service.irt_scientific_fixture import scientific_fixture
                assert execute_once(fixture.repo,lambda work,**kwargs:scientific_fixture(work))
            else:assert execute_once(fixture.repo)
            result=subprocess.run(['node','scripts/test-irt-release-cases.mjs',notification['requestId']],cwd=ROOT,
                env={**os.environ,'IRT_VERIFY_URL':cls.urls['main'],'IRT_FIXTURE_URL':url,'IRT_RELEASE_EXPECT_FAILURE':str(failure).lower(),'IRT_RELEASE_BLOCK':block},check=True,timeout=120)
            assert result.returncode==0

if __name__=='__main__':main()
