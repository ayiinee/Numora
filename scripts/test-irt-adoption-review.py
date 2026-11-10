"""Canonical HTTP/worker artifact adoption and receipt guards in owned local PostgreSQL."""
import importlib.util,json,os,runpy,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
AI=Path(os.environ['NUMORA_AI_SERVICE_PATH']).resolve();sys.path.insert(0,str(AI))
from fastapi.testclient import TestClient
from numora_service.irt.api import create_app
from numora_service.irt.daemon import execute_once
from numora_service.irt.runtime import profile
from research.irt.synthetic import generate
local_database=runpy.run_path(str(ROOT/'scripts/test-irt-research-local.py'))['local_database']
with local_database() as url:
 from tests.service import test_irt_postgres as fixtures
 fixtures.URL=url;cls=fixtures.IrtPostgresTests;cls.setUpClass();fixture=cls(methodName='runTest')
 spec=importlib.util.spec_from_file_location('verify',AI/'tools/verify_irt_linux.py');verifier=importlib.util.module_from_spec(spec);spec.loader.exec_module(verifier)
 client=TestClient(create_app(fixture.settings,fixture.repo),raise_server_exceptions=False)
 cases=[]
 for block in ('','REVOKE'):
  value=generate(2,20261119,arms=2,include_mcma=True)[0]
  notification,_=verifier.canonical_fixture(ROOT,fixture,url,value,profile())
  assert client.post('/api/v1/irt/compute/execute',headers={'Authorization':'Bearer '+fixture.settings.token},json=notification).status_code==202
  assert execute_once(fixture.repo)
  result=subprocess.run(['node','scripts/test-irt-adoption-review.mjs',notification['requestId']],cwd=ROOT,
   env={**os.environ,'IRT_VERIFY_URL':cls.urls['main'],'IRT_FIXTURE_URL':url,'IRT_ADOPTION_BLOCK':block},capture_output=True,text=True,timeout=60)
  if result.returncode:raise RuntimeError(result.stderr[-3000:])
  case=json.loads(result.stdout);cases.append(case);print(json.dumps(case),flush=True)
 output=ROOT/'.tmp/irt-adoption-review.json';output.parent.mkdir(exist_ok=True);output.write_text(json.dumps({'syntheticOnly':True,'cases':cases},indent=2)+'\n')
