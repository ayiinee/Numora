"""Disposable loopback PostgreSQL + real Python service + real Nest/Admin UI.
Never uses a shared DB or replaces/disables migration guards.
Run with the service repo's venv Python after building database/API/orchestration.
"""
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
SERVICE = Path(os.environ.get('NUMORA_AI_SERVICE_PATH', 'D:/Dev/numora-ai-service'))
BIN = Path(os.environ.get('POSTGRES_BIN', str(ROOT / '.tmp/pg-runtime/node_modules/@embedded-postgres/windows-x64/native/bin')))
def port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]
def run(args, env=None, cwd=ROOT):
    result=subprocess.run(args,cwd=cwd,env=env,timeout=None if os.environ.get('GENERATOR_DEMO')=='true' else 600)
    if result.returncode: raise RuntimeError('Local generator verification failed')
def main():
    suffix='.exe' if os.name=='nt' else ''
    with tempfile.TemporaryDirectory(prefix='numora-generator-') as folder:
        target=Path(folder); cluster=target/'cluster'; pgport=port(); serviceport=port()
        pgctl=str(BIN/('pg_ctl'+suffix))
        run([str(BIN/('initdb'+suffix)),'-D',str(cluster),'-U','fixture','-A','trust','--no-locale','-E','UTF8'])
        run([pgctl,'-D',str(cluster),'-l',str(target/'postgres.log'),'-o',f'-h 127.0.0.1 -p {pgport}','-w','start'])
        service=None
        try:
            import psycopg
            database='generator_test_'+uuid4().hex
            with psycopg.connect(f'postgresql://fixture@127.0.0.1:{pgport}/postgres',autocommit=True) as db:
                db.execute(psycopg.sql.SQL('CREATE DATABASE {}').format(psycopg.sql.Identifier(database)))
            url=f'postgresql://fixture@127.0.0.1:{pgport}/{database}'
            env={**os.environ,'NODE_ENV':'test','ALLOW_SYNTHETIC_CONTENT':'false','TEST_COMPUTE_OWNER_URL':url,'NUMORA_REPO_PATH':str(ROOT)}
            run(['node',str(SERVICE/'tests/service/migrate_local.mjs')],env,SERVICE)
            spec=importlib.util.spec_from_file_location('generator_fixture',ROOT/'scripts/generator-local-fixture.py')
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            fixtures=module.Fixtures(url)
            qids=['pg-6-1-1','mcma-16-1-7','kategori-16-1-10']
            if os.environ.get('GENERATOR_DEMO')=='true' or os.environ.get('GENERATOR_PACKAGE_TEST')=='true':
                items=[]
                for usage,count in [('DRILL',10),('PRETEST',20),('TRYOUT',30)]:
                    scope=None
                    for i in range(count):
                        item=fixtures.fixture(qids[i%3],dispatch=False,usage=usage,scope=scope)
                        scope=item;items.append(item)
            else:
                items=[fixtures.fixture(qid,dispatch=False) for qid in qids]
            data={'actor':str(fixtures.actor),'items':items}
            if os.environ.get('GENERATOR_DEMO')=='true' and os.environ.get('GENERATOR_REAL_QA_EMAIL'):
                result=subprocess.run(['node','--env-file='+str(ROOT/'.env'),'apps/api/scripts/read-generator-qa-profile.mjs'],cwd=ROOT,env=env,capture_output=True,text=True,check=True)
                data['realQa']=json.loads(result.stdout)
            file=target/'fixture.json';file.write_text(json.dumps(data,default=str))
            serviceenv={**env,'NUMORA_GENERATOR_ENABLED':'true','NUMORA_GENERATOR_TOKEN':fixtures.settings.token,'COMPUTE_DATABASE_URL':fixtures.compute_url,'COMPUTE_SERVICE_PRINCIPAL_ID':str(fixtures.principal)}
            log=(target/'service.log').open('w',encoding='utf8')
            service=subprocess.Popen([sys.executable,'-B','-m','numora_service','--port',str(serviceport)],cwd=SERVICE,env=serviceenv,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            import httpx
            for _ in range(100):
                try:
                    if httpx.get(f'http://127.0.0.1:{serviceport}/health/live',timeout=1).status_code==200:break
                except httpx.HTTPError:pass
                if service.poll() is not None:raise RuntimeError((target/'service.log').read_text())
                time.sleep(.1)
            else:raise RuntimeError('Local service startup timed out')
            env={**serviceenv,'DATABASE_URL':fixtures.main_url+'?sslmode=disable','TEST_COMPUTE_OWNER_URL':url,'GENERATOR_FIXTURE_FILE':str(file),'NUMORA_GENERATOR_URL':f'http://127.0.0.1:{serviceport}'}
            if os.environ.get('GENERATOR_DEMO')=='true':
                run(['node','apps/api/scripts/serve-generator-local.mjs'],env)
            elif os.environ.get('GENERATOR_PACKAGE_TEST')=='true':
                run(['node','apps/api/scripts/test-generator-packages.mjs'],env)
            else:
                run(['node','apps/api/scripts/test-generator-chain.mjs'],env)
                run([sys.executable,'-B','scripts/test-generator-service-regression.py'],env)
        finally:
            if service:
                service.terminate()
                try:service.wait(timeout=10)
                except subprocess.TimeoutExpired:service.kill();service.wait()
            if service: log.close()
            run([pgctl,'-D',str(cluster),'-m','fast','-w','stop'])
if __name__=='__main__':main()
