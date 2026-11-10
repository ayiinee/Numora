"""No credential or database is used: unapproved manifests must fail before connecting."""
import importlib.util,json,sys,tempfile,unittest
from datetime import datetime,timedelta,timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
spec=importlib.util.spec_from_file_location('enroll',Path(__file__).with_name('enroll-irt-production.py'))
enroll=importlib.util.module_from_spec(spec);spec.loader.exec_module(enroll)


class EnrollmentBoundaryTests(unittest.TestCase):
    def test_unapproved_wrong_context_missing_pins_and_expired_never_connect(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);context=str(uuid4());manifest={key:str(uuid4()) for key in ['contextId','batchId','servicePrincipalId','releaseApprovalId','approvedByUserId']}
            manifest.update(contextId=context,runtimeProfile='runtime.json',resources='resources.json',scientificAcceptance='acceptance.json',expiresAt=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat())
            (root/'runtime.json').write_text(json.dumps({'purpose':'PRODUCTION'}))
            (root/'resources.json').write_text(json.dumps({key:{} for key in ['model','quality','eligibility','scoring','scoreMapping']}))
            cases=[({'decision':'RESEARCH_ONLY','contextId':context,'pinsDigest':'a'*64},False),({'decision':'APPROVED_FOR_PRODUCTION','contextId':str(uuid4()),'pinsDigest':'a'*64},False),({'decision':'APPROVED_FOR_PRODUCTION','contextId':context},False),({'decision':'APPROVED_FOR_PRODUCTION','contextId':context,'pinsDigest':'a'*64},True)]
            for acceptance,expired in cases:
                with self.subTest(acceptance=acceptance,expired=expired):
                    (root/'acceptance.json').write_text(json.dumps(acceptance))
                    candidate={**manifest}
                    if expired:candidate['expiresAt']=(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()
                    (root/'manifest.json').write_text(json.dumps(candidate))
                    with patch.object(sys,'argv',['enroll','--manifest',str(root/'manifest.json'),'--expected-database','operator-approved']),patch.object(enroll.psycopg,'connect') as connect:
                        with self.assertRaisesRegex(ValueError,'IRT_(SCIENTIFIC_APPROVAL_REQUIRED|ENROLLMENT_EXPIRY_INVALID)'):enroll.main()
                        connect.assert_not_called()


if __name__=='__main__':unittest.main()
