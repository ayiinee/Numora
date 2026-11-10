"""TEST ONLY bounded generator acceptance; uses existing disposable harness."""
﻿import os,runpy,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1];ai=Path(os.environ['NUMORA_AI_SERVICE_PATH']);sys.path.insert(0,str(ai))
from numora_service.bridge import workspace
bank,_=workspace()
selected=sorted({qid for qid in bank.ids() if '-'.join(qid.split('-')[1:3]) in ('16-4','16-5') or qid.startswith('tryout')}|{'pg-6-1-1','mcma-16-1-7','kategori-16-1-10'})
assert len(selected)==53, len(selected)
os.environ.update(GENERATOR_V2_TEST='true',GENERATOR_V2_IDS=','.join(selected),GENERATOR_EXPECTED_PACKAGE_COUNT='3')
print('Frozen selected sources:',len(selected),flush=True)
runpy.run_path(str(root/'scripts/test-generator-local.py'),run_name='__main__')
