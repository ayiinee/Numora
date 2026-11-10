"""Canonical synthetic freeze -> HTTP -> daemon -> artifact -> release, disposable only."""
import importlib.util
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
        for failure,block in ((False,''),(True,''),(False,'CANCEL'),(False,'REVOKE')):
            notification,_=verifier.canonical_fixture(ROOT,fixture,url,generate(2,20261119,arms=2,include_mcma=True)[0],profile())
            response=client.post('/api/v1/irt/compute/execute',headers=headers,json=notification)
            assert response.status_code==202,response.text
            if failure:
                with patch('numora_service.irt.daemon.run',side_effect=ValueError('TIMEOUT')):
                    assert execute_once(fixture.repo)
            else:assert execute_once(fixture.repo)
            result=subprocess.run(['node','scripts/test-irt-release-cases.mjs',notification['requestId']],cwd=ROOT,
                env={**os.environ,'IRT_VERIFY_URL':cls.urls['main'],'IRT_FIXTURE_URL':url,'IRT_RELEASE_EXPECT_FAILURE':str(failure).lower(),'IRT_RELEASE_BLOCK':block},check=True,timeout=120)
            assert result.returncode==0

if __name__=='__main__':main()
