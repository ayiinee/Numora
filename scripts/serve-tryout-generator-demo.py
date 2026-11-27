"""Local demo only: reuse the real generator with a Tryout-scoped catalog."""
import os
from pathlib import Path
import sys
from urllib.parse import urlparse

target = urlparse(os.environ['COMPUTE_DATABASE_URL'])
if (os.environ.get('NODE_ENV') != 'test' or target.hostname != '127.0.0.1'
        or not target.path.startswith('/generator_test_')):
    raise RuntimeError('Isolated demo database required')

sys.path.insert(0, str(Path(os.environ['NUMORA_AI_SERVICE_PATH']).resolve()))
import uvicorn
from numora_service import api
from numora_service.bridge import workspace

bank, configs = workspace()


class TryoutBank:
    # ponytail: one Tryout bank; expand only after other renderer profiles are verified locally.
    def ids(self):
        return [qid for qid in bank.ids() if qid.startswith('tryout-1-')]

    def get(self, qid):
        return bank.get(qid)


# Scope discovery only. Execution, approvals, fingerprints and artifact checks stay real.
api.workspace = lambda: (TryoutBank(), configs)
if __name__ == '__main__':
    uvicorn.run(api.create_app(), host='127.0.0.1', port=int(sys.argv[1]),
                access_log=False, log_level='warning')
