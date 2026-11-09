"""Disposable loopback PostgreSQL only; no dotenv/shared environment fallback."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import socket
import shutil
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
            canonical=ROOT/'packages/database/drizzle'
            history=None
            if os.environ.get('IRT_RESEARCH_UPGRADE_TEST')=='true':
                prefix=target/'migrations';shutil.copytree(canonical,prefix)
                journal=prefix/'meta/_journal.json';value=json.loads(journal.read_text())
                value['entries']=[entry for entry in value['entries'] if entry['idx']<54]
                journal.write_text(json.dumps(value))
                subprocess.run(['node','--input-type=module','-e',migrate,url,str(prefix)],cwd=ROOT,check=True,timeout=180)
                with psycopg.connect(url) as db:
                    student=db.execute("INSERT INTO users(auth_user_id,role,display_name,email) VALUES(%s,'STUDENT','SYNTHETIC HISTORY','history@example.test') RETURNING id",(uuid4(),)).fetchone()[0]
                    policy=db.execute("INSERT INTO scoring_policy_versions(policy_code,version,configuration) VALUES('SYNTHETIC_LEGACY',1,'{}') RETURNING id").fetchone()[0]
                    package=db.execute("INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,scoring_policy_version_id) VALUES('SYNTHETIC_LEGACY',1,'SYNTHETIC HISTORY','TRYOUT',%s) RETURNING id",(policy,)).fetchone()[0]
                    attempt=db.execute("INSERT INTO assessment_attempts(student_id,package_id,assessment_type,status,started_at,finished_at,raw_points,score_0_100) VALUES(%s,%s,'TRYOUT','GRADED',now()-interval '2 minutes',now()-interval '1 minute',3,10) RETURNING id",(student,package)).fetchone()[0]
                    db.execute("INSERT INTO xp_ledger(student_id,attempt_id,source_type,xp_amount) VALUES(%s,%s,'TRYOUT',30)",(student,attempt))
                    history=db.execute('SELECT to_jsonb(a),to_jsonb(x) FROM assessment_attempts a JOIN xp_ledger x ON x.attempt_id=a.id WHERE a.id=%s',(attempt,)).fetchone()
            subprocess.run(['node','--input-type=module','-e',migrate,url,str(canonical)],cwd=ROOT,check=True,timeout=180)
            yield url
            if history is not None:
                with psycopg.connect(url) as db:
                    after=db.execute('SELECT to_jsonb(a),to_jsonb(x) FROM assessment_attempts a JOIN xp_ledger x ON x.attempt_id=a.id WHERE a.id=%s',(attempt,)).fetchone()
                    assert history==after,'Historical attempt/score/XP changed during migration or compute'
                print('Upgrade: historical attempt, score and nonempty XP ledger preserved',flush=True)
        finally:
            subprocess.run([ctl,'-D',str(cluster),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)


if __name__=='__main__':
    with local_database() as url:
        env={**os.environ,'IRT_RESEARCH_LOCAL_URL':url,'NUMORA_REPO_PATH':str(ROOT),'PYTHONIOENCODING':'utf-8'}
        subprocess.run([sys.executable,'-B','-m','unittest','tests.service.test_irt_postgres','-v'],cwd=AI,env=env,check=True,timeout=1800 if env.get('IRT_RESEARCH_TEST_IMAGE') else 300)
