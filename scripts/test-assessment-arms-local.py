"""Disposable PostgreSQL only. Runs canonical upgrade then v2 guard tests."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BIN = Path(os.environ.get('POSTGRES_BIN', 'C:/Program Files/PostgreSQL/16/bin'))

def run(args, **kwargs):
    subprocess.run(args, cwd=ROOT, check=True, timeout=180, **kwargs)

def main():
    with tempfile.TemporaryDirectory(prefix='numora-arms-') as folder:
        target = Path(folder)
        cluster = target / 'cluster'
        suffix = '.exe' if os.name == 'nt' else ''
        ctl = str(BIN / ('pg_ctl' + suffix))
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        run([str(BIN / ('initdb' + suffix)), '-D', str(cluster), '-U', 'fixture', '-A', 'trust', '--no-locale', '-E', 'UTF8'], stdout=subprocess.DEVNULL)
        run([ctl, '-D', str(cluster), '-l', str(target/'postgres.log'), '-o', f'-h 127.0.0.1 -p {port}', '-w', 'start'], stdout=subprocess.DEVNULL)
        try:
            import psycopg
            url = f'postgresql://fixture@127.0.0.1:{port}/arms_test'
            with psycopg.connect(f'postgresql://fixture@127.0.0.1:{port}/postgres', autocommit=True) as db:
                db.execute('CREATE DATABASE arms_test')
            before = target/'before'
            shutil.copytree(ROOT/'packages/database/drizzle', before)
            journal = before/'meta/_journal.json'
            data = json.loads(journal.read_text())
            data['entries'] = [e for e in data['entries'] if e['idx'] < 51]
            journal.write_text(json.dumps(data))
            migrate = """import postgres from './packages/database/node_modules/postgres/src/index.js';
import {migrateIntegratedDatabase} from './packages/database/dist/integrated-migrations.js';
const db=postgres(process.argv[1],{max:1,onnotice:()=>{}});
try {await migrateIntegratedDatabase(db,process.argv[2]);} finally {await db.end();}"""
            run(['node', '--input-type=module', '-e', migrate, url, str(before)])
            env = {**os.environ, 'ASSESSMENT_ARMS_LOCAL_URL': url}
            run([sys.executable, '-B', 'scripts/test-assessment-arms.py', '--legacy-fixture'], env=env)
            run(['node', '--input-type=module', '-e', migrate, url, str(ROOT/'packages/database/drizzle')])
            run([sys.executable, '-B', 'scripts/test-assessment-arms.py'], env=env)
            # An independently empty install exercises the complete stream too.
            with psycopg.connect(f'postgresql://fixture@127.0.0.1:{port}/postgres', autocommit=True) as db:
                db.execute('CREATE DATABASE arms_fresh')
            run(['node', '--input-type=module', '-e', migrate, url.replace('/arms_test','/arms_fresh'), str(ROOT/'packages/database/drizzle')])
            print('PASS: populated upgrade, fresh install, v2 constraints; no shared DB used', flush=True)
        finally:
            run([ctl, '-D', str(cluster), '-m', 'fast', '-w', 'stop'], stdout=subprocess.DEVNULL)

if __name__ == '__main__':
    main()
