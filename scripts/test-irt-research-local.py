"""Disposable loopback PostgreSQL only; no dotenv/shared environment fallback."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
from uuid import uuid4

ROOT=Path(__file__).resolve().parents[1]
AI=Path(os.environ.get('NUMORA_AI_SERVICE_PATH',str(ROOT.parent/'Numora-ai-service')))
BIN=Path(os.environ.get('POSTGRES_BIN','C:/Program Files/PostgreSQL/16/bin'))


@contextmanager
def local_database():
    with tempfile.TemporaryDirectory(prefix='numora-irt-research-') as folder:
        target=Path(folder);cluster=target/'cluster';suffix='.exe' if os.name=='nt' else ''
        ctl=str(BIN/('pg_ctl'+suffix))
        with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
        subprocess.run([str(BIN/('initdb'+suffix)),'-D',str(cluster),'-U','fixture','-A','trust','--no-locale','-E','UTF8'],check=True,stdout=subprocess.DEVNULL)
        subprocess.run([ctl,'-D',str(cluster),'-l',str(target/'postgres.log'),'-o',f'-h 127.0.0.1 -p {port}','-w','start'],check=True,stdout=subprocess.DEVNULL)
        try:
            import psycopg
            name='irt_research_test_'+uuid4().hex
            with psycopg.connect(f'postgresql://fixture@127.0.0.1:{port}/postgres',autocommit=True) as db:
                db.execute(psycopg.sql.SQL('CREATE DATABASE {}').format(psycopg.sql.Identifier(name)))
            url=f'postgresql://fixture@127.0.0.1:{port}/{name}'
            migrate="""import postgres from './packages/database/node_modules/postgres/src/index.js';
import {migrateIntegratedDatabase} from './packages/database/dist/integrated-migrations.js';
const db=postgres(process.argv[1],{max:1,onnotice:()=>{}});
try {await migrateIntegratedDatabase(db,process.argv[2]);} finally {await db.end();}"""
            subprocess.run(['node','--input-type=module','-e',migrate,url,str(ROOT/'packages/database/drizzle')],cwd=ROOT,check=True,timeout=180)
            yield url
        finally:
            subprocess.run([ctl,'-D',str(cluster),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)


if __name__=='__main__':
    with local_database() as url:
        env={**os.environ,'IRT_RESEARCH_LOCAL_URL':url,'NUMORA_REPO_PATH':str(ROOT),'PYTHONIOENCODING':'utf-8'}
        subprocess.run([sys.executable,'-B','-m','unittest','tests.service.test_irt_postgres','-v'],cwd=AI,env=env,check=True,timeout=1800 if env.get('IRT_RESEARCH_TEST_IMAGE') else 300)
