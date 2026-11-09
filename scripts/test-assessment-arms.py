"""TEST ONLY academic fixtures; never approvals for any shared environment."""
from concurrent.futures import ThreadPoolExecutor
import os
import sys
import unittest
from urllib.parse import urlparse
from uuid import uuid4
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

URL = os.environ['ASSESSMENT_ARMS_LOCAL_URL']
assert urlparse(URL).hostname in ('127.0.0.1', 'localhost') and urlparse(URL).path == '/arms_test'

def db():
    return psycopg.connect(URL, row_factory=dict_row)

def one(c, query, args=()):
    return c.execute(query, args).fetchone()['id']

def actor(c, role='STUDENT'):
    return one(c, "INSERT INTO users(auth_user_id,role,admin_role,display_name,email) VALUES(%s,%s,%s,'TEST ONLY',%s) RETURNING id", (uuid4(),role,'CONTENT_DATA_MODERATION' if role=='ADMIN' else None,str(uuid4())+'@example.test'))

def legacy():
    with db() as c:
        u=actor(c)
        policy=one(c,"INSERT INTO scoring_policy_versions(policy_code,version,configuration) VALUES('TEST LEGACY',1,'{}') RETURNING id")
        p=one(c,"INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,scoring_policy_version_id) VALUES('TEST LEGACY',1,'TEST LEGACY','TRYOUT',%s) RETURNING id",(policy,))
        c.execute("INSERT INTO assessment_attempts(student_id,package_id,assessment_type) VALUES(%s,%s,'TRYOUT')",(u,p))
        c.execute("INSERT INTO tryout_batches(package_id,starts_at,closes_at,cutoff_at,result_due_at) VALUES(%s,now(),now()+interval '1 day',now()+interval '1 day',now()+interval '4 days')",(p,))

class Guards(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with db() as c:
            cls.admin=actor(c,'ADMIN')
            key=str(uuid4())
            chapter=one(c,"INSERT INTO chapters(code,slug,name,display_order) VALUES(%s,%s,'TEST',1) RETURNING id",(key,key))
            sub=one(c,"INSERT INTO subchapters(chapter_id,code,slug,name,display_order) VALUES(%s,%s,%s,'TEST',1) RETURNING id",(chapter,key,key))
            cls.level=one(c,"INSERT INTO levels(subchapter_id,level_number) VALUES(%s,1) RETURNING id",(sub,))
            comp=one(c,"INSERT INTO competencies(subchapter_id,code,description) VALUES(%s,%s,'TEST') RETURNING id",(sub,key))
            cls.context=one(c,"INSERT INTO measurement_contexts(ecosystem,dimension,level_id,scale_code) VALUES('DRILL','TEST',%s,'TEST') RETURNING id",(cls.level,))
            cls.bp=one(c,"INSERT INTO assessment_blueprint_versions(code,version,definition,digest,status,approved_by_user_id,approved_at,approval_reference) VALUES(%s,1,'{\"testOnly\":true}','TEST','DRAFT',%s,now(),'TEST ONLY') RETURNING id",(key,cls.admin))
            policy=one(c,"INSERT INTO assessment_distribution_policies(code,version,definition,digest,approved_by_user_id,approved_at) VALUES(%s,1,jsonb_build_object('regularRewards',true,'preserveHistory',true,'allowOriginalFallback',true,'ecosystem','DRILL','contextId',%s::text),'',%s,now()) RETURNING id",(key,str(cls.context),cls.admin))
            cls.scoring=one(c,"INSERT INTO scoring_policy_versions(policy_code,version,configuration) VALUES(%s,1,'{\"testOnly\":true}') RETURNING id",(key,))
            rubric=one(c,"INSERT INTO scoring_rubric_versions(code,version,question_type,maximum_score_category,definition,digest,status,approved_by_user_id,approved_at) VALUES(%s,1,'SINGLE_CHOICE',1,'{}','TEST','SEALED',%s,now()) RETURNING id",(key,cls.admin))
            cls.set=one(c,"INSERT INTO assessment_arm_sets(context_id,blueprint_version_id,policy_id) VALUES(%s,%s,%s) RETURNING id",(cls.context,cls.bp,policy))
            cls.arms=[one(c,"INSERT INTO assessment_arms(set_id,code,kind) VALUES(%s,%s,%s) RETURNING id",(cls.set,kind,kind)) for kind in ['ORIGINAL','VARIANT']]
            originals=[]; variants=[]
            for i in range(10):
                f=one(c,"INSERT INTO questions(primary_competency_id) VALUES(%s) RETURNING id",(comp,))
                versions=[];original_variant=None
                for kind in ['ORIGINAL','VARIANT']:
                    v=one(c,"INSERT INTO question_variants(question_id,variant_code,kind,origin,original_variant_id) VALUES(%s,%s,%s,'TEST',%s) RETURNING id",(f,kind,kind,original_variant))
                    if kind=='ORIGINAL':original_variant=v
                    q=one(c,"""INSERT INTO question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,media,difficulty,level_id,scoring_rubric_version_id,content_status,reviewed_by_user_id,reviewed_at,parent_original_question_version_id)
                    VALUES(%s,1,'SINGLE_CHOICE','{"text":"TEST"}','[{"id":"A","text":"1"},{"id":"B","text":"2"}]','{"optionId":"A"}','{"text":"TEST"}','[]','MEDIUM',%s,%s,'READY',%s,now(),%s) RETURNING id""",(v,cls.level,rubric,cls.admin,versions[0] if kind=='VARIANT' else None))
                    versions.append(q)
                originals.append(versions[0]);variants.append(versions[0] if i<3 else versions[1])
            cls.anchors=originals[:3]
            cls.originals=originals;cls.variants=variants
            c.execute("UPDATE assessment_blueprint_versions SET status='SEALED',definition=jsonb_build_object('testOnly',true,'anchorQuestionVersionIds',%s::uuid[],'familyIds',(SELECT jsonb_agg(v.question_id ORDER BY v.question_id) FROM question_versions q JOIN question_variants v ON v.id=q.variant_id WHERE q.id=ANY(%s::uuid[]))) WHERE id=%s",(cls.anchors,originals,cls.bp))
            cls.packages=[];cls.revisions=[]
            for arm,items in zip(cls.arms,[originals,variants]):
                p,r=cls.package(c,arm,items)
                cls.packages.append(p);cls.revisions.append(r)
                c.execute('UPDATE assessment_arms SET current_revision_id=%s WHERE id=%s',(r,arm))
                c.execute("INSERT INTO assessment_arm_distribution_events(revision_id,state,reason,actor_user_id) VALUES(%s,'PROVISIONAL','TEST ONLY',%s)",(r,cls.admin))
            c.execute("UPDATE assessment_arm_sets SET status='OPEN' WHERE id=%s",(cls.set,))

    @classmethod
    def package(cls,c,arm,items,revision=1):
        p=one(c,"""INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,level_id,scoring_policy_version_id,distribution_arm_id)
        VALUES(%s,%s,'TEST ONLY','DRILL',%s,%s,%s) RETURNING id""",(str(uuid4()),revision,cls.level,cls.scoring,arm))
        for i,q in enumerate(items):
            c.execute('INSERT INTO package_items(package_id,question_version_id,display_order,max_points) VALUES(%s,%s,%s,1)',(p,q,i+1))
        c.execute("""UPDATE assessment_packages SET status='PUBLISHED',curriculum_approval=jsonb_build_object('reference','TEST ONLY','approvedAt',now(),'manifestDigest',irt_compute.payload_digest(jsonb_build_object('packageId',id,'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY display_order,i.id) FROM package_items i WHERE package_id=%s)))) WHERE id=%s""",(p,p))
        r=one(c,"INSERT INTO assessment_arm_revisions(arm_id,package_id,revision,anchor_question_version_ids,manifest_digest) VALUES(%s,%s,%s,%s,'') RETURNING id",(arm,p,revision,cls.anchors))
        return p,r

    def reject(self,query,args=()):
        c=db()
        try:
            with self.assertRaises(psycopg.Error):
                with c:c.execute(query,args)
        finally:c.close()

    def test_01_upgrade_preserves_legacy(self):
        with db() as c:
            self.assertEqual(c.execute("SELECT count(*) AS n FROM assessment_attempts a JOIN assessment_packages p ON p.id=a.package_id WHERE p.family_code='TEST LEGACY'").fetchone()['n'],1)
            self.assertEqual(c.execute('SELECT count(*) AS n FROM tryout_batch_packages').fetchone()['n'],1)
            self.assertEqual(c.execute("SELECT count(*) AS n FROM xp_ledger").fetchone()['n'],0)

    def test_02_provisional_without_compare(self):
        with db() as c:
            self.assertTrue(all(c.execute('SELECT package_can_distribute(%s) AS ok',(p,)).fetchone()['ok'] for p in self.packages))
        self.reject("INSERT INTO assessment_arm_distribution_events(revision_id,state,reason,actor_user_id) VALUES(%s,'READY','TEST',%s)",(self.revisions[1],self.admin))

    def test_03_pins_immutable(self):
        self.reject("UPDATE assessment_packages SET name='tampered' WHERE id=%s",(self.packages[0],))
        self.reject('DELETE FROM package_items WHERE package_id=%s',(self.packages[0],))
        self.reject('UPDATE assessment_arm_revisions SET revision=5 WHERE id=%s',(self.revisions[0],))
        self.reject("INSERT INTO assessment_arms(set_id,code,kind) VALUES(%s,'C','VARIANT')",(self.set,))

    def test_04_parallel_assignment(self):
        with db() as c:u=actor(c)
        def assign(arm):
            with db() as c:
                c.execute('INSERT INTO assessment_arm_assignments(set_id,student_id,assigned_arm_id) VALUES(%s,%s,%s) ON CONFLICT(set_id,student_id) DO NOTHING',(self.set,u,arm))
                return one(c,'SELECT id FROM assessment_arm_assignments WHERE set_id=%s AND student_id=%s',(self.set,u))
        with ThreadPoolExecutor(max_workers=2) as pool:ids=list(pool.map(assign,self.arms))
        self.assertEqual(ids[0],ids[1])

    def test_05_missing_delivery_rejected(self):
        with db() as c:u=actor(c)
        self.reject("INSERT INTO assessment_attempts(student_id,package_id,assessment_type,level_id_at_start) VALUES(%s,%s,'DRILL',%s)",(u,self.packages[0],self.level))

    def test_06_compute_cannot_write(self):
        with self.assertRaises(psycopg.errors.InsufficientPrivilege):
            with db() as c:
                c.execute('SET LOCAL ROLE numora_irt_runtime')
                c.execute("INSERT INTO assessment_arm_sets(context_id,blueprint_version_id,policy_id) SELECT context_id,blueprint_version_id,policy_id FROM assessment_arm_sets LIMIT 1")

    def test_07_delivery_and_replacement(self):
        with db() as c:
            u=actor(c)
            ass=one(c,'INSERT INTO assessment_arm_assignments(set_id,student_id,assigned_arm_id) VALUES(%s,%s,%s) RETURNING id',(self.set,u,self.arms[1]))
            a=one(c,"INSERT INTO assessment_attempts(student_id,package_id,assessment_type,level_id_at_start) VALUES(%s,%s,'DRILL',%s) RETURNING id",(u,self.packages[1],self.level))
            c.execute("INSERT INTO assessment_attempt_arm_deliveries(attempt_id,assignment_id,delivered_revision_id,delivery_mode) VALUES(%s,%s,%s,'ASSIGNED')",(a,ass,self.revisions[1]))
            p,r=self.package(c,self.arms[1],self.variants,2)
            c.execute('UPDATE assessment_arms SET current_revision_id=%s WHERE id=%s',(r,self.arms[1]))
            c.execute("INSERT INTO assessment_arm_distribution_events(revision_id,state,reason,actor_user_id) VALUES(%s,'PROVISIONAL','TEST replacement',%s)",(r,self.admin))
            pin=c.execute('SELECT delivered_revision_id FROM assessment_attempt_arm_deliveries WHERE attempt_id=%s',(a,)).fetchone()
            self.assertEqual(pin['delivered_revision_id'],self.revisions[1])
            c.execute("UPDATE assessment_attempts SET status='CANCELLED' WHERE id=%s",(a,))
            retry=one(c,"INSERT INTO assessment_attempts(student_id,package_id,assessment_type,level_id_at_start) VALUES(%s,%s,'DRILL',%s) RETURNING id",(u,p,self.level))
            c.execute("INSERT INTO assessment_attempt_arm_deliveries(attempt_id,assignment_id,delivered_revision_id,delivery_mode) VALUES(%s,%s,%s,'ASSIGNED')",(retry,ass,r))
            # Roll back so other scenarios retain their initial active revision.
            c.rollback()

    def test_08_fallback_preserves_assignment(self):
        with db() as c:
            u=actor(c)
            ass=one(c,'INSERT INTO assessment_arm_assignments(set_id,student_id,assigned_arm_id) VALUES(%s,%s,%s) RETURNING id',(self.set,u,self.arms[1]))
            c.execute("INSERT INTO assessment_arm_distribution_events(revision_id,state,reason,actor_user_id) VALUES(%s,'HOLD','TEST ONLY stopped',%s)",(self.revisions[1],self.admin))
            a=one(c,"INSERT INTO assessment_attempts(student_id,package_id,assessment_type,level_id_at_start) VALUES(%s,%s,'DRILL',%s) RETURNING id",(u,self.packages[0],self.level))
            c.execute("INSERT INTO assessment_attempt_arm_deliveries(attempt_id,assignment_id,delivered_revision_id,delivery_mode,fallback_reason) VALUES(%s,%s,%s,'ORIGINAL_FALLBACK','TEST ONLY unavailable')",(a,ass,self.revisions[0]))
            self.assertEqual(c.execute('SELECT assigned_arm_id FROM assessment_arm_assignments WHERE id=%s',(ass,)).fetchone()['assigned_arm_id'],self.arms[1])
            c.rollback()

    def test_09_existing_student_not_fresh(self):
        with db() as c:
            u=actor(c)
            p=one(c,"INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,level_id) VALUES(%s,1,'TEST previous experiment','DRILL',%s) RETURNING id",(str(uuid4()),self.level))
            c.execute("INSERT INTO assessment_attempts(student_id,package_id,assessment_type,level_id_at_start,status) VALUES(%s,%s,'DRILL',%s,'CANCELLED')",(u,p,self.level))
            ass=c.execute('INSERT INTO assessment_arm_assignments(set_id,student_id,assigned_arm_id) VALUES(%s,%s,%s) RETURNING first_valid_evidence,exposure_facts',(self.set,u,self.arms[1])).fetchone()
            self.assertFalse(ass['first_valid_evidence'])
            self.assertTrue(ass['exposure_facts']['hasPriorContextAttempt'])

    def test_10_tryout_multi_package_and_once_per_batch(self):
        with db() as c:
            # TEST ONLY independent 30-family bank; exact five common versions.
            parent=one(c,"INSERT INTO assessment_packages(family_code,package_version,name,assessment_type) VALUES(%s,1,'TEST batch','TRYOUT') RETURNING id",(str(uuid4()),))
            batch=one(c,"INSERT INTO tryout_batches(package_id,starts_at,closes_at,cutoff_at,result_due_at) VALUES(%s,now(),now()+interval '1 day',now()+interval '1 day',now()+interval '4 days') RETURNING id",(parent,))
            context=one(c,"INSERT INTO measurement_contexts(ecosystem,dimension,tryout_batch_id,scale_code) VALUES('TRYOUT','TEST',%s,'TEST TRYOUT') RETURNING id",(batch,))
            originals=[];variants=[]
            for i in range(30):
                f=one(c,'INSERT INTO questions(primary_competency_id) SELECT primary_competency_id FROM questions LIMIT 1 RETURNING id')
                ov=None
                for kind in ['ORIGINAL','VARIANT']:
                    v=one(c,"INSERT INTO question_variants(question_id,variant_code,kind,origin,original_variant_id) VALUES(%s,%s,%s,'TEST',%s) RETURNING id",(f,kind,kind,ov))
                    if kind=='ORIGINAL':ov=v
                    q=one(c,"""INSERT INTO question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,media,difficulty,scoring_rubric_version_id,content_status,reviewed_by_user_id,reviewed_at,parent_original_question_version_id)
                    SELECT %s,1,question_type,stem,options_or_statements,answer_key,explanation,media,difficulty,scoring_rubric_version_id,'READY',%s,now(),%s::uuid FROM question_versions WHERE id=%s RETURNING id""",(v,self.admin,originals[-1] if kind=='VARIANT' else None,self.originals[0]))
                    if kind=='ORIGINAL':originals.append(q)
                    else:variants.append(originals[-1] if i<5 else q)
            bp=one(c,"""INSERT INTO assessment_blueprint_versions(code,version,definition,digest,status,approved_by_user_id,approved_at,approval_reference)
            VALUES(%s,1,jsonb_build_object('anchorQuestionVersionIds',%s::uuid[],'familyIds',(SELECT jsonb_agg(v.question_id ORDER BY v.question_id) FROM question_versions q JOIN question_variants v ON v.id=q.variant_id WHERE q.id=ANY(%s::uuid[]))),'TEST','SEALED',%s,now(),'TEST ONLY') RETURNING id""",(str(uuid4()),originals[:5],originals,self.admin))
            policy=one(c,"INSERT INTO assessment_distribution_policies(code,version,definition,digest,approved_by_user_id,approved_at) VALUES(%s,1,jsonb_build_object('regularRewards',true,'preserveHistory',true,'ecosystem','TRYOUT','contextId',%s::text),'',%s,now()) RETURNING id",(str(uuid4()),str(context),self.admin))
            armset=one(c,'INSERT INTO assessment_arm_sets(context_id,blueprint_version_id,policy_id) VALUES(%s,%s,%s) RETURNING id',(context,bp,policy))
            arms=[];packages=[];revisions=[]
            for kind,items in zip(['ORIGINAL','VARIANT','VARIANT'],[originals,variants,variants]):
                arm=one(c,'INSERT INTO assessment_arms(set_id,code,kind) VALUES(%s,%s,%s) RETURNING id',(armset,str(uuid4()),kind));arms.append(arm)
                p=one(c,"INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,scoring_policy_version_id,distribution_arm_id,release_at) VALUES(%s,1,'TEST ONLY','TRYOUT',%s,%s,now()) RETURNING id",(str(uuid4()),self.scoring,arm));packages.append(p)
                for i,q in enumerate(items):c.execute('INSERT INTO package_items(package_id,question_version_id,display_order,max_points) VALUES(%s,%s,%s,1)',(p,q,i+1))
                c.execute("UPDATE assessment_packages SET status='PUBLISHED',curriculum_approval=jsonb_build_object('reference','TEST ONLY','approvedAt',now(),'manifestDigest',irt_compute.payload_digest(jsonb_build_object('packageId',id,'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY display_order,i.id) FROM package_items i WHERE package_id=%s)))) WHERE id=%s",(p,p))
                r=one(c,"INSERT INTO assessment_arm_revisions(arm_id,package_id,revision,anchor_question_version_ids,manifest_digest) VALUES(%s,%s,1,%s,'') RETURNING id",(arm,p,originals[:5]));revisions.append(r)
                c.execute('UPDATE assessment_arms SET current_revision_id=%s WHERE id=%s',(r,arm))
                c.execute('INSERT INTO tryout_batch_packages(batch_id,package_id,arm_id) VALUES(%s,%s,%s)',(batch,p,arm))
                c.execute("INSERT INTO assessment_arm_distribution_events(revision_id,state,reason,actor_user_id) VALUES(%s,'PROVISIONAL','TEST ONLY',%s)",(r,self.admin))
            c.execute("UPDATE assessment_arm_sets SET status='OPEN' WHERE id=%s",(armset,))
            c.execute("UPDATE tryout_batches SET status='OPEN' WHERE id=%s",(batch,))
            u=actor(c)
            ass=one(c,'INSERT INTO assessment_arm_assignments(set_id,student_id,assigned_arm_id) VALUES(%s,%s,%s) RETURNING id',(armset,u,arms[1]))
            a=one(c,"INSERT INTO assessment_attempts(student_id,package_id,assessment_type,tryout_batch_id) VALUES(%s,%s,'TRYOUT',%s) RETURNING id",(u,packages[1],batch))
            c.execute("INSERT INTO assessment_attempt_arm_deliveries(attempt_id,assignment_id,delivered_revision_id,delivery_mode) VALUES(%s,%s,%s,'ASSIGNED')",(a,ass,revisions[1]))
            with self.assertRaises(psycopg.errors.UniqueViolation):
                with c.transaction():c.execute("INSERT INTO assessment_attempts(student_id,package_id,assessment_type,tryout_batch_id) VALUES(%s,%s,'TRYOUT',%s)",(u,packages[2],batch))
            with self.assertRaises(psycopg.errors.CheckViolation):
                with c.transaction():c.execute('DELETE FROM tryout_batch_packages WHERE batch_id=%s',(batch,))
            with self.assertRaises(psycopg.errors.CheckViolation):
                with c.transaction():c.execute('UPDATE assessment_arms SET current_revision_id=NULL WHERE id=%s',(arms[1],))

    def test_11_main_role_can_assign_and_deliver(self):
        with db() as c:
            u=actor(c)
            c.execute('SET LOCAL ROLE numora_main_runtime')
            ass=one(c,'INSERT INTO assessment_arm_assignments(set_id,student_id,assigned_arm_id) VALUES(%s,%s,%s) RETURNING id',(self.set,u,self.arms[0]))
            a=one(c,"INSERT INTO assessment_attempts(student_id,package_id,assessment_type,level_id_at_start) VALUES(%s,%s,'DRILL',%s) RETURNING id",(u,self.packages[0],self.level))
            c.execute("INSERT INTO assessment_attempt_arm_deliveries(attempt_id,assignment_id,delivered_revision_id,delivery_mode) VALUES(%s,%s,%s,'ASSIGNED')",(a,ass,self.revisions[0]))

    def test_12_unapproved_anchors_and_policy_rejected(self):
        with self.assertRaises(psycopg.errors.CheckViolation):
            with db() as c:
                # Correct count alone cannot replace Curriculum's anchor pins.
                original_anchors=Guards.anchors
                try:
                    Guards.anchors=self.originals[1:4]
                    self.package(c,self.arms[1],self.variants,3)
                finally:Guards.anchors=original_anchors
        with db() as c:u=actor(c)
        self.reject("INSERT INTO assessment_distribution_policies(code,version,definition,digest,approved_by_user_id,approved_at) VALUES(%s,1,'{\"regularRewards\":true,\"preserveHistory\":true}','',%s,now())",(str(uuid4()),u))

if __name__=='__main__':
    if '--legacy-fixture' in sys.argv:legacy()
    else:unittest.main(verbosity=2)
