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
from numora_service.content import record_content
from numora_service.v2_content import local_record
from numora_service.v2_generate import media_profile, stocks, stock_manifest
from numora_service.v2_register import register

class Fixtures(base.Fixtures):
    def all(self,qids=None):
        qids=qids or self.bank.ids()
        assert '127.0.0.1' in self.owner_url and '/generator_test_' in self.owner_url
        scopes={};items=[];manifest=[];stock=stocks(self.bank)
        def one(c,sql,args=()):return c.execute(sql,args).fetchone()['id']
        with self.db() as db:
            for qid in qids:
                original=self.bank.get(qid);content=record_content(local_record(original_record(original)))
                usage='TRYOUT' if qid.startswith('tryout') else 'DRILL'
                scope_key='TRYOUT' if usage=='TRYOUT' else '-'.join(qid.split('-')[1:3])
                key='test-v2-'+qid+'-'+uuid4().hex[:8]
                if scope_key not in scopes:
                    if usage=='DRILL':
                        chapter=one(db,"INSERT INTO chapters(code,slug,name,display_order) VALUES(%s,%s,'TEST ONLY',%s) RETURNING id",(key,key,len(scopes)+1))
                        sub=one(db,"INSERT INTO subchapters(chapter_id,code,slug,name,display_order) VALUES(%s,%s,%s,'TEST ONLY',1) RETURNING id",(chapter,key,key))
                        level=one(db,'INSERT INTO levels(subchapter_id,level_number) VALUES(%s,%s) RETURNING id',(sub,int(qid.split('-')[2])))
                        context=one(db,"INSERT INTO measurement_contexts(ecosystem,dimension,level_id,scale_code) VALUES('DRILL','TEST',%s,%s) RETURNING id",(level,key))
                    else:
                        chapter=one(db,"INSERT INTO chapters(code,slug,name,display_order) VALUES(%s,%s,'TEST ONLY TRYOUT',%s) RETURNING id",(key,key,len(scopes)+1))
                        sub=one(db,"INSERT INTO subchapters(chapter_id,code,slug,name,display_order) VALUES(%s,%s,%s,'TEST ONLY',1) RETURNING id",(chapter,key,key))
                        level=None
                        parent=one(db,"INSERT INTO assessment_packages(family_code,package_version,name,assessment_type) VALUES(%s,1,'TEST ONLY batch','TRYOUT') RETURNING id",(key,))
                        batch=one(db,"INSERT INTO tryout_batches(package_id,starts_at,closes_at,cutoff_at,result_due_at) VALUES(%s,now(),now()+interval '1 day',now()+interval '1 day',now()+interval '4 days') RETURNING id",(parent,))
                        context=one(db,"INSERT INTO measurement_contexts(ecosystem,dimension,tryout_batch_id,scale_code) VALUES('TRYOUT','TEST',%s,%s) RETURNING id",(batch,key))
                    comp=one(db,"INSERT INTO competencies(subchapter_id,code,description) VALUES(%s,%s,'TEST ONLY') RETURNING id",(sub,key))
                    scopes[scope_key]=(chapter,sub,level,context,comp)
                chapter,sub,level,context,comp=scopes[scope_key]
                family=one(db,'INSERT INTO questions(primary_competency_id,usage_type,chapter_id,subchapter_id) VALUES(%s,%s,%s,%s) RETURNING id',(comp,usage,chapter,sub))
                variant=one(db,"INSERT INTO question_variants(question_id,variant_code,kind,origin) VALUES(%s,'O','ORIGINAL','TEST ONLY') RETURNING id",(family,))
                rubric=one(db,"INSERT INTO scoring_rubric_versions(code,version,question_type,maximum_score_category,definition,digest,status,approved_by_user_id,approved_at) VALUES(%s,1,%s,1,'{\"testOnly\":true}','TEST','SEALED',%s,now()) RETURNING id",(key,content['questionType'],self.actor))
                version=one(db,"""INSERT INTO question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,media,difficulty,level_id,scoring_rubric_version_id,content_status,reviewed_by_user_id,reviewed_at)
                 VALUES(%s,1,%s,%s,%s,%s,'{"text":"TEST ONLY approved original explanation"}','[]','MEDIUM',%s,%s,'READY',%s,now()) RETURNING id""",
                 (variant,content['questionType'],Jsonb(content['stem']),Jsonb(content['optionsOrStatements']),Jsonb(content['answerKey']),level,rubric,self.actor))
                item={'questionExternalId':qid,'parentQuestionVersionId':str(version),'familyId':str(family),
                      'rubricVersionId':str(rubric),'contextId':str(context),'mediaProfile':media_profile(qid)}
                if qid in stock:
                    definition=stock_manifest(stock[qid])
                    stockset=one(db,"INSERT INTO generator_stock_sets(family_id,original_question_version_id,version,definition,item_count,digest) VALUES(%s,%s,1,%s,%s,irt_compute.payload_digest(%s)) RETURNING id",(family,version,Jsonb(definition),len(stock[qid]),Jsonb(definition)))
                    item.update(mode='CONCEPTUAL_STOCK',stockSetId=str(stockset))
                else:item.update(mode='NUMERIC',configVersion=self.configs.load(qid)[0]['config_version'])
                manifest.append(item)
                items.append({'qid':qid,'version':str(version),'family':str(family),'rubric':str(rubric),'chapter':str(chapter),'level':str(level) if level else None,'usage':usage,'scope':scope_key})
        m={'serviceContract':'generator-service-v2','items':manifest}
        dry=register(self.repository,self.bank,self.configs,m)
        assert all(i['generatorConfigId'] is None for i in dry['items'])
        registered=register(self.repository,self.bank,self.configs,m,apply=True,seal=True)
        assert register(self.repository,self.bank,self.configs,m,apply=True,seal=True)==registered
        with self.db('main') as db:
            for item,mapping,reg in zip(items,manifest,registered['items']):
                item['approval']=str(one(db,"INSERT INTO configuration_approvals(generator_config_id,approved_digest,scope,approved_by_user_id,approved_at) VALUES(%s,%s,%s,%s,now()) RETURNING id",(reg['generatorConfigId'],reg['digest'],Jsonb({'ecosystem':item['usage'],'contextId':mapping['contextId'],'testOnly':True}),self.actor)))
        return items
