"""Cumulative wall-time budget, including overlapping checks once; no command/credential logging."""
import argparse,json,os,subprocess,time
from contextlib import contextmanager
from datetime import datetime,timezone
from pathlib import Path
from uuid import uuid4
p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--timeout',type=int,default=1800);p.add_argument('command',nargs=argparse.REMAINDER);a=p.parse_args()
file=Path('.tmp/irt-release-acceptance/ledger.json');file.parent.mkdir(parents=True,exist_ok=True)
@contextmanager
def ledger():
 lock=file.with_suffix('.lock');deadline=time.monotonic()+30
 while True:
  try:fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY);break
  except FileExistsError:
   if time.monotonic()>deadline:raise RuntimeError('IRT_LEDGER_LOCK_TIMEOUT')
   time.sleep(.1)
 try:
  data=json.loads(file.read_text()) if file.exists() else {'budgetSeconds':10800,'checks':[],'priorUnmeteredLocalSeconds':25}
  yield data
  temporary=file.with_suffix('.new');temporary.write_text(json.dumps(data,indent=2)+'\n');os.replace(temporary,file)
 finally:os.close(fd);lock.unlink()
def spent(data):
 now=datetime.now(timezone.utc).timestamp();intervals=[]
 for c in data['checks']:
  start=datetime.fromisoformat(c['startedAt']).timestamp()
  intervals.append((start,start+c['seconds'] if c.get('seconds') is not None else now))
 total=0;end=0
 for start,stop in sorted(intervals):total+=max(0,stop-max(start,end));end=max(end,stop)
 return total+data.get('priorUnmeteredLocalSeconds',0)
key=uuid4().hex;when=datetime.now(timezone.utc).isoformat()
with ledger() as data:
 remaining=data['budgetSeconds']-spent(data)
 if remaining<=0:raise SystemExit('IRT_ACCEPTANCE_BUDGET_EXHAUSTED')
 data['checks'].append({'id':key,'name':a.name,'startedAt':when,'seconds':None,'exitCode':None})
start=time.monotonic();code=124
try:
 command=a.command[1:] if a.command[:1]==['--'] else a.command
 code=subprocess.run(command,timeout=min(a.timeout,remaining),check=False).returncode
finally:
 with ledger() as data:
  row=next(c for c in data['checks'] if c.get('id')==key)
  row.update(seconds=round(time.monotonic()-start,3),exitCode=code)
  data['consumedWallSeconds']=round(spent(data),3)
raise SystemExit(code)
