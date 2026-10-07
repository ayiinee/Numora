"""Run the service's real fault/role tests using the central forward migration.
Only fixture setup is adapted; no historical or runtime guard is replaced.
"""
import importlib.util
import os
from pathlib import Path
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1]
SERVICE=Path(os.environ.get('NUMORA_AI_SERVICE_PATH','D:/Dev/numora-ai-service'))
sys.path.insert(0,str(SERVICE))
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module
fixtures=load('central_fixture',ROOT/'scripts/generator-local-fixture.py')
service=load('service_regression',SERVICE/'tests/service/test_postgres.py')
class CentralServiceRegression(service.PostgresTests):
    @classmethod
    def setUpClass(cls):
        fixture=fixtures.Fixtures(os.environ['TEST_COMPUTE_OWNER_URL'])
        for key,value in fixture.__dict__.items():setattr(cls,key,value)
    fixture=fixtures.Fixtures.fixture
    def test_00_central_dispatch_migration_required(self):
        f=self.fixture()
        with self.db() as db:
            definition=db.execute("SELECT pg_get_functiondef('public.measurement_dispatch_guard()'::regprocedure) AS body").fetchone()['body']
            self.assertIn('GENERATE_VARIANTS',definition)
            self.assertIn('CONTENT_DATA_MODERATION',definition)
            self.assertEqual(db.execute('SELECT count(*) AS n FROM analysis_request_dispatches WHERE request_id=%s',(f['notification']['requestId'],)).fetchone()['n'],1)
if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(CentralServiceRegression)
    sys.exit(0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1)
