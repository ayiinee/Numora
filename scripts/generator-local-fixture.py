# TEST ONLY fixtures adapted from generator-service-v1; uses the real central guard.
import os,sys
from pathlib import Path
from uuid import uuid4
SERVICE=Path(os.environ.get('NUMORA_AI_SERVICE_PATH','D:/Dev/numora-ai-service'))
sys.path.insert(0,str(SERVICE))
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from numora_service.bridge import workspace,original_record
from numora_service.content import record_content
from numora_service.register import register
from numora_service.repository import Repository
from numora_service.settings import Settings
class Fixtures:
    def __init__(self,url):
        from urllib.parse import urlparse,urlunparse
        self.owner_url=url
        self.bank,self.configs=workspace()
        parsed=urlparse(url)
        with self.db() as db:
            main_login='generator_main_'+uuid4().hex
            self.main_login=main_login
            compute_login='generator_compute_'+uuid4().hex
            self.compute_login=compute_login
            for login,role in [(main_login,'numora_main_runtime'),(compute_login,'numora_irt_runtime')]:
                db.execute(psycopg.sql.SQL('CREATE ROLE {} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS').format(psycopg.sql.Identifier(login)))
                db.execute(psycopg.sql.SQL('GRANT {} TO {}').format(psycopg.sql.Identifier(role),psycopg.sql.Identifier(login)))
            self.main_url=urlunparse(parsed._replace(netloc=f'{main_login}@{parsed.hostname}:{parsed.port}'))
            self.compute_url=urlunparse(parsed._replace(netloc=f'{compute_login}@{parsed.hostname}:{parsed.port}'))
            self.actor=db.execute("INSERT INTO users(auth_user_id,role,admin_role,display_name,email) VALUES(%s,'ADMIN','CONTENT_DATA_MODERATION','TEST generator reviewer',%s) RETURNING id",(uuid4(),str(uuid4())+'@example.test')).fetchone()['id']
            self.principal=db.execute('INSERT INTO service_principals(code,enabled) VALUES(%s,true) RETURNING id',(str(uuid4()),)).fetchone()['id']
        self.settings=Settings(True,'TEST_ONLY_'+ 't'*32,self.compute_url,str(self.principal))
        self.repository=Repository(self.settings,self.bank)
    def db(self,role='owner'):
        return psycopg.connect(self.owner_url if role=='owner' else self.main_url if role=='main' else self.compute_url,row_factory=dict_row)
    def assertIsNone(self,v):
        assert v is None
    def assertEqual(self,a,b):
        assert a==b
    def fixture(self, qid="pg-6-1-1", seed=5, dispatch=True, usage=None, scope=None):
        orig = self.bank.get(qid)
        content = record_content(original_record(orig))
        key = "test-" + uuid4().hex
        with self.db() as db:
            if scope:
                chapter,sub,level,comp=scope['chapter'],scope['subchapter'],scope['level'],scope['competency']
            else:
                chapter = db.execute("INSERT INTO chapters(code,slug,name,display_order) VALUES(%s,%s,'TEST chapter',%s) RETURNING id", (key,key, int(uuid4().hex[:7],16))).fetchone()["id"]
                sub = db.execute("INSERT INTO subchapters(chapter_id,code,slug,name,display_order) VALUES(%s,%s,%s,'TEST subchapter',1) RETURNING id", (chapter,key,key)).fetchone()["id"]
                level = db.execute("INSERT INTO levels(subchapter_id,level_number) VALUES(%s,1) RETURNING id", (sub,)).fetchone()["id"]
                comp = db.execute("INSERT INTO competencies(subchapter_id,code,description) VALUES(%s,%s,'TEST competency') RETURNING id", (sub,key)).fetchone()["id"]
            family = db.execute("INSERT INTO questions(primary_competency_id,usage_type,chapter_id,subchapter_id) VALUES(%s,%s,%s,%s) RETURNING id", (comp,usage,chapter,sub)).fetchone()["id"]
            variant = db.execute("INSERT INTO question_variants(question_id,variant_code,kind,origin) VALUES(%s,'O','ORIGINAL','TEST') RETURNING id", (family,)).fetchone()["id"]
            rubric = db.execute("""INSERT INTO scoring_rubric_versions(code,version,question_type,maximum_score_category,definition,digest,status,approved_by_user_id,approved_at)
                VALUES(%s,1,%s,1,'{"testOnly":true}','TEST-rubric','SEALED',%s,now()) RETURNING id""", (key,content["questionType"],self.actor)).fetchone()["id"]
            version = db.execute("""INSERT INTO question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,media,difficulty,level_id,scoring_rubric_version_id)
                VALUES(%s,1,%s,%s,%s,%s,%s,'[]','MEDIUM',%s,%s) RETURNING id""",
                (variant,content["questionType"],Jsonb(content["stem"]),Jsonb(content["optionsOrStatements"]),Jsonb(content["answerKey"]),Jsonb({"text":"TEST original explanation"}),level,rubric)).fetchone()["id"]
            context = db.execute("INSERT INTO measurement_contexts(ecosystem,dimension,level_id,scale_code) VALUES('DRILL','TEST',%s,%s) RETURNING id", (level,key)).fetchone()["id"]
        manifest = {"serviceContract": "generator-service-v1", "items": [{"questionExternalId": qid, "configVersion": self.configs.load(qid)[0]["config_version"],
            "parentQuestionVersionId": str(version), "familyId": str(family), "rubricVersionId": str(rubric), "contextId": str(context)}]}
        dry = register(self.repository, self.bank, self.configs, manifest)
        self.assertIsNone(dry["items"][0]["generatorConfigId"])
        registered = register(self.repository, self.bank, self.configs, manifest, apply=True, seal=True)["items"][0]
        self.assertEqual(register(self.repository, self.bank, self.configs, manifest, apply=True, seal=True)["items"][0], registered)
        with self.db("main") as db:
            approval = db.execute("""INSERT INTO configuration_approvals(generator_config_id,approved_digest,scope,approved_by_user_id,approved_at)
                VALUES(%s,%s,%s,%s,now()) RETURNING id""", (registered["generatorConfigId"],registered["digest"],Jsonb({"ecosystem":"DRILL","contextId":str(context)}),self.actor)).fetchone()["id"]
            wave = db.execute("INSERT INTO generation_waves(code,status,created_by_user_id,approved_at,constraints) VALUES(%s,'APPROVED',%s,now(),'{}') RETURNING id", (key,self.actor)).fetchone()["id"]
            item = db.execute("""INSERT INTO generation_wave_items(wave_id,original_question_version_id,context_id,generator_config_id,configuration_approval_id,target_count,max_regenerate_attempts,constraints)
                VALUES(%s,%s,%s,%s,%s,1,0,%s) RETURNING id""", (wave,version,context,registered["generatorConfigId"],approval,Jsonb({"serviceContract":"generator-service-v1","seed":seed}))).fetchone()["id"]
            req = db.execute("""INSERT INTO analysis_requests(idempotency_key,request_type,context_id,wave_item_id,configuration_pins,input_digest)
                VALUES(%s,'GENERATE_VARIANTS',%s,%s,%s,'') RETURNING id,input_digest""", (key,context,item,Jsonb([{"approvalId":str(approval),"digest":registered["digest"]}]))).fetchone()
        if dispatch:
            self.dispatch(req["id"], 1)
        return {"notification": {"contractVersion":3,"requestId":str(req["id"]),"inputDigest":req["input_digest"],"dispatchGeneration":1},
                "version":version,"family":family,"variant":variant,"rubric":rubric,"chapter":chapter,"subchapter":sub,"competency":comp,"level":level,"approval":approval,"manifest":manifest}

    def dispatch(self,request,generation):
        with self.db('main') as db:
            db.execute("INSERT INTO analysis_request_dispatches(request_id,generation,operation_key,operation_fingerprint,actor_user_id) VALUES(%s,%s,%s,'TEST',%s)",(request,generation,str(uuid4()),self.actor))
