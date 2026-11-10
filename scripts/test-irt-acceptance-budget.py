"""Runnable stdlib check: separate ledgers cannot reset or extend an existing budget."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time

runner = Path(__file__).with_name('run-irt-acceptance-check.py')
with tempfile.TemporaryDirectory() as folder:
    ledger = Path(folder) / 'ledger.json'
    command = [sys.executable, str(runner), '--ledger', str(ledger), '--name', 'probe']
    payload = ['--', sys.executable, '-c', 'pass']
    first = subprocess.run(command + ['--budget-seconds', '5'] + payload, capture_output=True)
    assert first.returncode == 0, first.stderr
    before = ledger.read_bytes()
    mismatch = subprocess.run(command + ['--budget-seconds', '6'] + payload, capture_output=True)
    assert mismatch.returncode != 0 and b'IRT_ACCEPTANCE_BUDGET_MISMATCH' in mismatch.stderr
    assert ledger.read_bytes() == before
    value = json.loads(before)
    value['priorUnmeteredLocalSeconds'] = 6
    ledger.write_text(json.dumps(value))
    before = ledger.read_bytes()
    exhausted = subprocess.run(command + ['--budget-seconds', '5'] + payload, capture_output=True)
    assert exhausted.returncode != 0 and b'IRT_ACCEPTANCE_BUDGET_EXHAUSTED' in exhausted.stderr
    assert ledger.read_bytes() == before
print('Separate ledger, immutable budget and exhausted-budget checks PASS')

with tempfile.TemporaryDirectory() as folder:
    marker = Path(folder) / 'orphan.txt'
    child = "import time;from pathlib import Path;time.sleep(3);Path(" + repr(str(marker)) + ").touch()"
    parent = "import subprocess,sys,time;subprocess.Popen([sys.executable,'-c'," + repr(child) + "]);time.sleep(30)"
    ledger = Path(folder) / 'timeout.json'
    result = subprocess.run([sys.executable, str(runner), '--ledger', str(ledger), '--budget-seconds', '10', '--name', 'descendant', '--timeout', '1', '--', sys.executable, '-c', parent], capture_output=True)
    assert result.returncode == 124, result.stderr
    time.sleep(3)
    assert not marker.exists(), 'Timed-out descendant survived and continued work'
    assert json.loads(ledger.read_text())['checks'][0]['exitCode'] == 124
print('Timeout kills owned descendants and preserves timeout evidence PASS')
