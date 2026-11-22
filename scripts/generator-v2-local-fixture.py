"""TEST ONLY canonical sources and approvals in a verified disposable database."""
import importlib.util
import json
import os
from pathlib import Path
from uuid import uuid4
from psycopg.types.json import Jsonb

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('base_fixture',ROOT/'scripts/generator-local-fixture.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
from numora_service.bridge import original_record
from numora_service.content import fingerprint, record_content
from numora_service.v2_content import local_record
from numora_service.v2_generate import media_profile, stocks, stock_manifest
from numora_service.v2_register import register

class Fixtures(base.Fixtures):
    def all(self,qids=None,drill_variant=False):
        qids=qids or self.bank.ids()
        assert '127.0.0.1' in self.owner_url and '/generator_test_' in self.owner_url
        scopes={};items=[];manifest=[];stock=stocks(self.bank)
        def one(c,sql,args=()):return c.execute(sql,args).fetchone()['id']
        with self.db() as db:
            for qid in qids:
                original=self.bank.get(qid);content=record_content(local_record(original_record(original)))
                usage='TRYOUT' if qid.startswith('tryout') else 'DRILL'
                scope_key='TRYOUT' if usage=='TRYOUT' else 'DRILL_VARIANT' if drill_variant else '-'.join(qid.split('-')[1:3])
                key='test-v2-'+qid+'-'+uuid4().hex[:8]
                if scope_key not in scopes:
                    if usage=='DRILL':
                        chapter=one(db,"INSERT INTO chapters(code,slug,name,display_order) VALUES(%s,%s,'TEST ONLY',%s) RETURNING id",(key,key,len(scopes)+1))
                        sub=one(db,"INSERT INTO subchapters(chapter_id,code,slug,name,display_order) VALUES(%s,%s,%s,'TEST ONLY',1) RETURNING id",(chapter,key,key))
                        level=one(db,'INSERT INTO levels(subchapter_id,level_number) VALUES(%s,%s) RETURNING id',(sub,int(qid.split('-')[2])))
                        context=one(db,"INSERT INTO measurement_contexts(ecosystem,dimension,level_id,scale_code) VALUES('DRILL',%s,%s,%s) RETURNING id",('LEVEL' if drill_variant else 'TEST',level,key))
                    else:
                        chapter=one(db,"INSERT INTO chapters(code,slug,name,display_order) VALUES(%s,%s,'TEST ONLY TRYOUT',%s) RETURNING id",(key,key,len(scopes)+1))
                        sub=one(db,"INSERT INTO subchapters(chapter_id,code,slug,name,display_order) VALUES(%s,%s,%s,'TEST ONLY',1) RETURNING id",(chapter,key,key))
                        level=None
                        parent=one(db,"INSERT INTO assessment_packages(family_code,package_version,name,assessment_type) VALUES(%s,1,'SHAFWAN MAU TRY OUT [LOCAL TEST]','TRYOUT') RETURNING id",(key,))
                        context=one(db,"INSERT INTO measurement_contexts(ecosystem,dimension,generation_package_id,scale_code) VALUES('TRYOUT','PACKAGE_GENERATION',%s,%s) RETURNING id",(parent,key))
                    comp=one(db,"INSERT INTO competencies(subchapter_id,code,description) VALUES(%s,%s,'TEST ONLY') RETURNING id",(sub,key))
                    scopes[scope_key]=(chapter,sub,level,context,comp)
                chapter,sub,level,context,comp=scopes[scope_key]
                family=one(db,'INSERT INTO questions(primary_competency_id,usage_type,chapter_id,subchapter_id) VALUES(%s,%s,%s,%s) RETURNING id',(comp,usage,chapter,sub))
                variant=one(db,"INSERT INTO question_variants(question_id,variant_code,kind,origin) VALUES(%s,'O','ORIGINAL','TEST ONLY') RETURNING id",(family,))
                rubric=one(db,"INSERT INTO scoring_rubric_versions(code,version,question_type,maximum_score_category,definition,digest,status,approved_by_user_id,approved_at) VALUES(%s,1,%s,1,'{\"testOnly\":true}','TEST','SEALED',%s,now()) RETURNING id",(key,content['questionType'],self.actor))
                version=one(db,"""INSERT INTO question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,media,difficulty,level_id,scoring_rubric_version_id,content_status,reviewed_by_user_id,reviewed_at)
                 VALUES(%s,1,%s,%s,%s,%s,'{"text":"TEST ONLY approved original explanation"}','[]','MEDIUM',%s,%s,'READY',%s,now()) RETURNING id""",
                 (variant,content['questionType'],Jsonb(content['stem']),Jsonb(content['optionsOrStatements']),Jsonb(content['answerKey']),level,rubric,self.actor))
                if drill_variant and usage == 'DRILL':
                    db.execute("UPDATE question_versions SET content_fingerprint=%s WHERE id=%s",(fingerprint(content),version))
                    db.execute("UPDATE questions SET status='READY',curriculum_level_number=(SELECT level_number FROM levels WHERE id=%s) WHERE id=%s",(level,family))
                if usage=='TRYOUT':
                    db.execute('INSERT INTO package_items(package_id,question_version_id,display_order,rubric_version_id,maximum_score_category,max_points) VALUES(%s,%s,%s,%s,1,1)',(parent,version,1+sum(i['usage']=='TRYOUT' for i in items),rubric))
                item={'questionExternalId':qid,'parentQuestionVersionId':str(version),'familyId':str(family),
                      'rubricVersionId':str(rubric),'contextId':str(context),'mediaProfile':media_profile(qid)}
                if qid in stock:
                    definition=stock_manifest(stock[qid])
                    stockset=one(db,"INSERT INTO generator_stock_sets(family_id,original_question_version_id,version,definition,item_count,digest) VALUES(%s,%s,1,%s,%s,irt_compute.payload_digest(%s)) RETURNING id",(family,version,Jsonb(definition),len(stock[qid]),Jsonb(definition)))
                    item.update(mode='CONCEPTUAL_STOCK',stockSetId=str(stockset))
                else:item.update(mode='NUMERIC',configVersion=self.configs.load(qid)[0]['config_version'])
                manifest.append(item)
                items.append({'qid':qid,'version':str(version),'family':str(family),'rubric':str(rubric),'chapter':str(chapter),'level':str(level) if level else None,'usage':usage,'scope':scope_key})
            if sum(i['usage']=='TRYOUT' for i in items)==30:
                policy=one(db,"INSERT INTO scoring_policy_versions(policy_code,version,configuration,status) VALUES(%s,1,'{\"testOnly\":true}','PUBLISHED') RETURNING id",(key,))
                db.execute("UPDATE assessment_packages SET status='PUBLISHED',scoring_policy_version_id=%s,release_at=now() WHERE id=%s",(policy,parent))
        m={'serviceContract':'generator-service-v2','items':manifest}
        dry=register(self.repository,self.bank,self.configs,m)
        assert all(i['generatorConfigId'] is None for i in dry['items'])
        registered=register(self.repository,self.bank,self.configs,m,apply=True)
        # Sealing is an operator step: the shared guard reads protected attempt data.
        # Compute must never gain participant-table access to prepare a test fixture.
        with self.db() as db:
            for reg in registered['items']:
                db.execute("UPDATE irt_compute.generator_configs SET status='SEALED' WHERE id=%s AND status='DRAFT' AND digest=%s",(reg['generatorConfigId'],reg['digest']))
        registered=register(self.repository,self.bank,self.configs,m,apply=True)
        assert all(i['status']=='SEALED' for i in registered['items'])
        assert register(self.repository,self.bank,self.configs,m,apply=True)==registered
        with self.db('main') as db:
            for item,mapping,reg in zip(items,manifest,registered['items']):
                item['approval']=str(one(db,"INSERT INTO configuration_approvals(generator_config_id,approved_digest,scope,approved_by_user_id,approved_at) VALUES(%s,%s,%s,%s,now()) RETURNING id",(reg['generatorConfigId'],reg['digest'],Jsonb({'ecosystem':item['usage'],'contextId':mapping['contextId'],'testOnly':True}),self.actor)))
        return items

    def drill_variant_package(self,items):
        assert '127.0.0.1' in self.owner_url and '/generator_test_' in self.owner_url
        originals=[i for i in items if i['usage']=='DRILL']
        assert len(originals)==10
        first=originals[0]
        version_ids=[i['version'] for i in originals]
        anchors=[version_ids[index] for index in (1,4,8)]
        with self.db() as db:
            def one(query,*args): return db.execute(query,args).fetchone()['id']
            context=one("SELECT id FROM measurement_contexts WHERE level_id=%s AND dimension='LEVEL'",first['level'])
            for table, condition, value in (
                ('levels','id',first['level']), ('chapters','id',first['chapter']),
                ('subchapters','chapter_id',first['chapter']),
                ('competencies','subchapter_id',db.execute("SELECT subchapter_id FROM levels WHERE id=%s",(first['level'],)).fetchone()['subchapter_id']),
            ):
                db.execute(f"UPDATE {table} SET status='READY' WHERE {condition}=%s",(value,))
            scoring=one("""INSERT INTO scoring_policy_versions(policy_code,version,configuration,status,approved_by_user_id,approved_at,approval_reference)
                VALUES('DRILL_GENERATOR_TEST',1,%s,'PUBLISHED',%s,now(),'TEST ONLY') RETURNING id""",
                Jsonb({'contractVersion':'NUMORA_ASSESSMENT_V1','assessmentType':'DRILL',
                       'scoreRounding':'HALF_UP','xpRounding':'HALF_UP','itemPointRounding':'HALF_UP',
                       'drillXpBasis':'EQUIVALENT_CORRECT','lowPartialStars':1,'itemWeights':{'SINGLE_CHOICE':1}}),self.actor)
            blueprint=one("""INSERT INTO assessment_blueprint_versions(code,version,definition,digest,status,approved_by_user_id,approved_at,approval_reference)
                VALUES('DRILL_GENERATOR_TEST',1,%s,'TEST','SEALED',%s,now(),'TEST ONLY') RETURNING id""",
                Jsonb({'anchorQuestionVersionIds':anchors,'familyIds':sorted(i['family'] for i in originals)}),self.actor)
            policy=one("""INSERT INTO assessment_distribution_policies(code,version,definition,digest,approved_by_user_id,approved_at)
                VALUES('DRILL_GENERATOR_TEST',1,%s,'',%s,now()) RETURNING id""",
                Jsonb({'regularRewards':True,'preserveHistory':True,'allowOriginalFallback':True,
                       'ecosystem':'DRILL','contextId':str(context)}),self.actor)
            armset=one("INSERT INTO assessment_arm_sets(context_id,blueprint_version_id,policy_id) VALUES(%s,%s,%s) RETURNING id",context,blueprint,policy)
            a,b=[one("INSERT INTO assessment_arms(set_id,code,kind) VALUES(%s,%s,%s) RETURNING id",armset,kind,kind)
                 for kind in ('ORIGINAL','VARIANT')]
            source=one("""INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,chapter_id,level_id,variant_index,
                scoring_policy_version_id,blueprint_version_id,distribution_arm_id)
                VALUES('DRILL_GENERATOR_TEST',1,'TEST ONLY Drill original','DRILL',%s,%s,1,%s,%s,%s) RETURNING id""",
                first['chapter'],first['level'],scoring,blueprint,a)
            for order,item in enumerate(originals,1):
                db.execute("""INSERT INTO package_items(package_id,question_version_id,display_order,
                    max_points,rubric_version_id,maximum_score_category,item_role) VALUES(%s,%s,%s,1,%s,1,%s)""",
                    (source,item['version'],order,item['rubric'],'REFERENCE' if item['version'] in anchors else 'ORIGINAL'))
            db.execute("""UPDATE assessment_packages SET status='PUBLISHED',curriculum_approval=jsonb_build_object(
                'reference','TEST ONLY','approvedAt',now(),'manifestDigest',irt_compute.payload_digest(
                jsonb_build_object('packageId',id,'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY display_order,i.id)
                    FROM package_items i WHERE package_id=%s)))) WHERE id=%s""",(source,source))
            revision=one("""INSERT INTO assessment_arm_revisions(arm_id,package_id,revision,anchor_question_version_ids,manifest_digest)
                VALUES(%s,%s,1,%s::uuid[],'') RETURNING id""",a,source,anchors)
            db.execute("UPDATE assessment_arms SET current_revision_id=%s WHERE id=%s",(revision,a))
        return {'source':str(source),'context':str(context),'variantArm':str(b),'scoringPolicy':str(scoring),'anchors':anchors}
