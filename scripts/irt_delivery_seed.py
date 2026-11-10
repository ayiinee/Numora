"""Synthetic Curriculum approvals and grades, only inside the disposable harness."""
from copy import deepcopy
from datetime import datetime,timedelta,timezone
from uuid import uuid4
from psycopg.types.json import Jsonb
from research.irt.synthetic import generate


def build(db,admin,context,batch,arm_count=2, source=None):
    def one(query,args=()):return db.execute(query,args).fetchone()['id']
    def user():return one("INSERT INTO users(auth_user_id,role,display_name,email) VALUES(%s,'STUDENT','SYNTHETIC',%s) RETURNING id",(uuid4(),str(uuid4())+'@example.test'))
    key=uuid4().hex
    chapter=one("INSERT INTO chapters(code,slug,name,display_order) VALUES(%s,%s,'SYNTHETIC',(SELECT coalesce(max(display_order),0)+1 FROM chapters)) RETURNING id",(key,key))
    sub=one("INSERT INTO subchapters(chapter_id,code,slug,name,display_order) VALUES(%s,%s,%s,'SYNTHETIC',1) RETURNING id",(chapter,key,key))
    competence=one("INSERT INTO competencies(subchapter_id,code,description) VALUES(%s,%s,'SYNTHETIC') RETURNING id",(sub,key))
    scoring=one("INSERT INTO scoring_policy_versions(policy_code,version,configuration) VALUES(%s,1,'{}') RETURNING id",(key,))
    bp=one("INSERT INTO assessment_blueprint_versions(code,version,definition,digest,status,approved_by_user_id,approved_at,approval_reference) VALUES(%s,1,'{}','SYNTHETIC','DRAFT',%s,now(),'SYNTHETIC ONLY') RETURNING id",(key,admin))
    policy=one("INSERT INTO assessment_distribution_policies(code,version,definition,digest,approved_by_user_id,approved_at) VALUES(%s,1,jsonb_build_object('regularRewards',true,'preserveHistory',true,'allowOriginalFallback',true,'ecosystem','TRYOUT','contextId',%s::text),'',%s,now()) RETURNING id",(key,str(context),admin))
    arm_set=one('INSERT INTO assessment_arm_sets(context_id,blueprint_version_id,policy_id) VALUES(%s,%s,%s) RETURNING id',(context,bp,policy))
    arms=[one('INSERT INTO assessment_arms(set_id,code,kind) VALUES(%s,%s,%s) RETURNING id',(arm_set,str(uuid4()),kind)) for kind in ['ORIGINAL']+['VARIANT']*(arm_count-1)]
    value=deepcopy(source) if source is not None else generate(1,arms=arm_count,include_mcma=True)[0]
    assert len(value['packages']) == arm_count
    simulated_people = value['respondents']
    simulated_responses = {(r['attemptId'], r['questionVersionId']): r for r in value['responses']}
    simulated_packages = deepcopy(value['packages'])
    value['context'].update(contextId=str(context),batchId=str(batch),scaleId='T:'+str(batch))
    originals=[];variants=[[] for _ in range(arm_count-1)];families=[];new_items=[]
    sources={item['questionVersionId']:item for item in value['items']}
    rubrics={}
    for index,old_original in enumerate(value['packages'][0]['questionVersionIds']):
        template=sources[old_original];qtype=template['questionType'];maximum=template['maximumScoreCategory']
        if qtype not in rubrics:
            rubrics[qtype]=one("INSERT INTO scoring_rubric_versions(code,version,question_type,maximum_score_category,definition,digest,status,approved_by_user_id,approved_at) VALUES(%s,1,%s,%s,'{}','SYNTHETIC','SEALED',%s,now()) RETURNING id",(uuid4().hex,qtype,maximum,admin))
        rubric=rubrics[qtype]
        choices=[{'id':letter,'content':{'text':letter}} for letter in 'ABCD']
        content=choices if qtype=='SINGLE_CHOICE' else {'options':choices,'categories':[{'id':'Y','label':'Ya'},{'id':'N','label':'Tidak'}] if qtype=='CATEGORY' else []}
        answer={'optionId':'A'} if qtype=='SINGLE_CHOICE' else {'optionIds':['A','C']} if qtype=='MULTIPLE_CHOICE_MULTIPLE_ANSWER' else {'categoryByStatementId':{'A':'Y','B':'N','C':'Y','D':'N'}}
        family=one('INSERT INTO questions(primary_competency_id) VALUES(%s) RETURNING id',(competence,));families.append(family)
        original_variant=None;original=None
        for arm_index,kind in enumerate(['ORIGINAL']+['VARIANT']*(arm_count-1)):
            variant=one("INSERT INTO question_variants(question_id,variant_code,kind,origin,original_variant_id) VALUES(%s,%s,%s,'SYNTHETIC',%s) RETURNING id",(family,kind+str(arm_index),kind,original_variant))
            if kind=='ORIGINAL':original_variant=variant
            fingerprint=uuid4().hex+uuid4().hex
            q=one("""INSERT INTO question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,
                difficulty,scoring_rubric_version_id,content_fingerprint,content_status,reviewed_by_user_id,reviewed_at,parent_original_question_version_id)
                VALUES(%s,1,%s,'{"text":"SYNTHETIC"}',%s,%s,
                '{"text":"SYNTHETIC"}','MEDIUM',%s,%s,'READY',%s,now(),%s) RETURNING id""",(variant,qtype,Jsonb(content),Jsonb(answer),rubric,fingerprint,admin,original))
            if kind=='ORIGINAL':original=q;originals.append(q)
            elif index>=5:variants[arm_index-1].append(q)
            if kind=='ORIGINAL' or index>=5:
                new_items.append({'questionVersionId':str(q),'familyId':str(family),'originalQuestionVersionId':str(original),
                    'rubricVersionId':str(rubric),'contentDigest':fingerprint,'questionType':qtype,'modelFamily':template['modelFamily'],
                    'maximumScoreCategory':maximum,'maxPoints':template['maxPoints'],'contentState':'CONTENT_VALID'})
    by_id={item['questionVersionId']:item for item in new_items}
    anchors=originals[:5];variant_packages=[anchors+questions for questions in variants]
    db.execute("UPDATE assessment_blueprint_versions SET status='SEALED',definition=%s WHERE id=%s",(Jsonb({'anchorQuestionVersionIds':list(map(str,anchors)),'familyIds':sorted(map(str,families))}),bp))
    packages=[];revisions=[]
    for arm,questions in zip(arms,[originals]+variant_packages):
        package=one("INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,scoring_policy_version_id,distribution_arm_id) VALUES(%s,1,'SYNTHETIC','TRYOUT',%s,%s) RETURNING id",(uuid4().hex,scoring,arm))
        for index,qid in enumerate(questions):
            db.execute('INSERT INTO package_items(package_id,question_version_id,display_order,max_points) VALUES(%s,%s,%s,%s)',(package,qid,index+1,by_id[str(qid)]['maxPoints']))
        db.execute("UPDATE assessment_packages SET status='PUBLISHED',frozen_at=now()-interval '2 hours',release_at=now()-interval '1 hour',curriculum_approval=jsonb_build_object('reference','SYNTHETIC ONLY','approvedAt',now(),'manifestDigest',irt_compute.payload_digest(jsonb_build_object('packageId',id,'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY display_order,i.id) FROM package_items i WHERE package_id=%s)))) WHERE id=%s",(package,package))
        revision=one("INSERT INTO assessment_arm_revisions(arm_id,package_id,revision,anchor_question_version_ids,manifest_digest) VALUES(%s,%s,1,%s,'') RETURNING id",(arm,package,anchors))
        db.execute('UPDATE assessment_arms SET current_revision_id=%s WHERE id=%s',(revision,arm))
        db.execute('INSERT INTO tryout_batch_packages(batch_id,package_id,arm_id) VALUES(%s,%s,%s)',(batch,package,arm))
        db.execute("INSERT INTO assessment_arm_distribution_events(revision_id,state,reason,actor_user_id) VALUES(%s,'PROVISIONAL','SYNTHETIC ONLY',%s)",(revision,admin))
        packages.append(package);revisions.append(revision)
    db.execute("UPDATE assessment_arm_sets SET status='OPEN' WHERE id=%s",(arm_set,))
    now=datetime.now(timezone.utc).replace(microsecond=0)
    iso=lambda dt:dt.isoformat().replace('+00:00','Z')
    value['window']={'startsAt':iso(now-timedelta(hours=1)),'collectionCutoffAt':iso(now),
        'gradingCutoffAt':iso(now),'resultDueAt':iso(now+timedelta(days=3))}
    db.execute('UPDATE tryout_batches SET starts_at=%s,closes_at=%s,cutoff_at=%s,result_due_at=%s WHERE id=%s',
        (now-timedelta(hours=1),now,now,now+timedelta(days=3),batch))
    value['items']=new_items;value['anchorQuestionVersionIds']=list(map(str,anchors))
    value['referenceQuestionVersionIds']=list(map(str,originals));value['referencePackage']={'packageId':str(packages[0]),'packageVersion':1}
    value['respondents']=[];value['responses']=[];value['packages']=[]
    for index,(arm,package,revision,questions) in enumerate(zip(arms,packages,revisions,[originals]+variant_packages)):
        package_items=db.execute('SELECT * FROM package_items WHERE package_id=%s ORDER BY display_order',(package,)).fetchall()
        for simulated in [p for p in simulated_people if p['packageId']==simulated_packages[index]['packageId']]:
            student=user()
            assignment=one('INSERT INTO assessment_arm_assignments(set_id,student_id,assigned_arm_id) VALUES(%s,%s,%s) RETURNING id',(arm_set,student,arm))
            attempt=one("INSERT INTO assessment_attempts(student_id,package_id,assessment_type,tryout_batch_id,started_at) VALUES(%s,%s,'TRYOUT',%s,%s) RETURNING id",(student,package,batch,now-timedelta(minutes=2)))
            db.execute("INSERT INTO assessment_attempt_arm_deliveries(attempt_id,assignment_id,delivered_revision_id,delivery_mode) VALUES(%s,%s,%s,'ASSIGNED')",(attempt,assignment,revision))
            manifest=one("INSERT INTO content_delivery_manifests(student_id,module,kind,idempotency_key,issued_at) VALUES(%s,'TRYOUT','ITEM_PAYLOAD_ISSUED',%s,%s) RETURNING id",(student,uuid4().hex,now-timedelta(minutes=2)))
            respondent=str(uuid4())
            with db.pipeline():
                for pi in package_items:
                    simulated_response = simulated_responses[(simulated['attemptId'], simulated_packages[index]['questionVersionIds'][pi['display_order']-1])]
                    item=uuid4()
                    db.execute('INSERT INTO attempt_items(id,attempt_id,package_id,package_item_id,question_version_id,display_order,max_points) VALUES(%s,%s,%s,%s,%s,%s,%s)',(item,attempt,package,pi['id'],pi['question_version_id'],pi['display_order'],pi['max_points']))
                    if (source is not None and simulated_response['responseState']!='NOT_PRESENTED') or (source is None and pi['display_order']!=2): db.execute('INSERT INTO content_delivery_items(manifest_id,question_version_id,family_id,attempt_item_id) VALUES(%s,%s,%s,%s)',(manifest,pi['question_version_id'],families[pi['display_order']-1],item))
                    meta=by_id[str(pi['question_version_id'])];special=pi['display_order'] in (1,6)
                    answer={} if pi['display_order']==1 else {'optionId':'A'} if meta['questionType']=='SINGLE_CHOICE' else {'optionIds':['A','C']} if meta['questionType']=='MULTIPLE_CHOICE_MULTIPLE_ANSWER' else {'categoryByStatementId':{'A':'Y','B':'N','C':'Y','D':'N'}}
                    state = simulated_response['responseState'] if source is not None else 'OMITTED' if pi['display_order']==1 else 'INVALID' if pi['display_order']==6 else 'RESPONDED'
                    points = simulated_response['awardedPoints'] if source is not None else 0 if special else pi['max_points']
                    category = simulated_response['scoreCategory'] if source is not None else 0 if special else meta['maximumScoreCategory']
                    db.execute("INSERT INTO attempt_answers(attempt_item_id,answer,awarded_points,score_category,fully_correct,response_state,graded_at) VALUES(%s,%s,%s,%s,%s,%s,%s)",(item,Jsonb(answer),points,category,category==meta['maximumScoreCategory'],state,now))
                    value['responses'].append({'respondentId':respondent,'attemptId':str(attempt),'attemptItemId':str(item),'questionVersionId':str(pi['question_version_id']),
                        'rubricVersionId':by_id[str(pi['question_version_id'])]['rubricVersionId'],'responseState':'RESPONDED','scoreCategory':0,'awardedPoints':'0.00',
                        'exposureState':'FRESH','priorExposureSources':[],'includedInCalibration':True,'eligibilityReasons':['FIRST_VALID_ATTEMPT']})
            db.execute("UPDATE assessment_attempts SET status='SUBMITTED',finished_at=%s WHERE id=%s",(now-timedelta(minutes=1),attempt))
            value['respondents'].append({'respondentId':respondent,'attemptId':str(attempt),'packageId':str(package),'packageVersion':1,'batchId':str(batch),
                'assignedArmId':str(arm),'deliveredArmId':str(arm),'deliveryMode':'ASSIGNED','attemptIndex':1,'firstValidAttempt':True,
                'submittedAt':iso(now-timedelta(minutes=1)),'gradedAt':iso(now)})
        value['packages'].append({'packageId':str(package),'packageVersion':1,'armId':str(arm),'armKind':'ORIGINAL' if index==0 else 'VARIANT','questionVersionIds':list(map(str,questions))})
    db.execute("UPDATE tryout_batches SET status='CLOSED' WHERE id=%s",(batch,))
    return value
