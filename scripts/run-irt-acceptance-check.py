"""Cumulative 180-minute verification ledger; no credentials or command arguments in evidence."""
import argparse,json,subprocess,time
from datetime import datetime,timezone
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--timeout',type=int,default=1800);p.add_argument('command',nargs=argparse.REMAINDER);a=p.parse_args()
file=Path('.tmp/irt-release-acceptance/ledger.json');file.parent.mkdir(parents=True,exist_ok=True)
data=json.loads(file.read_text()) if file.exists() else {'budgetSeconds':10800,'checks':[],'priorUnmeteredLocalSeconds':25}
spent=sum(c['seconds'] for c in data['checks'])+data['priorUnmeteredLocalSeconds'];remaining=10800-spent
if remaining<=0:raise SystemExit('IRT_ACCEPTANCE_BUDGET_EXHAUSTED')
start=time.monotonic();when=datetime.now(timezone.utc).isoformat();code=124
try:
 command=a.command[1:] if a.command[:1]==['--'] else a.command
 code=subprocess.run(command,timeout=min(a.timeout,remaining),check=False).returncode
finally:
 data['checks'].append({'name':a.name,'startedAt':when,'seconds':round(time.monotonic()-start,3),'exitCode':code})
 file.write_text(json.dumps(data,indent=2)+'\n')
raise SystemExit(code)
