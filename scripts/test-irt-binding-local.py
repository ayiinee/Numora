"""Binding/pin guards on owned PostgreSQL; no HTTP/R or participant data."""
import importlib.util
import json
import os
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('delivery', ROOT / 'scripts/test-irt-delivery-local.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)
from psycopg.types.json import Jsonb
from psycopg.rows import dict_row
import psycopg


def main():
    profile = json.loads((delivery.AI / 'research/irt/policy-v1.json').read_text())
    with delivery.harness.local_database() as url, psycopg.connect(url, row_factory=dict_row) as db:
        actor = db.execute("INSERT INTO users(auth_user_id,role,admin_role,display_name,email) VALUES(%s,'ADMIN','CONTENT_DATA_MODERATION','SYNTHETIC','binding@example.test') RETURNING id", (uuid4(),)).fetchone()['id']
        package = db.execute("INSERT INTO assessment_packages(family_code,package_version,name,assessment_type) VALUES(%s,1,'SYNTHETIC','TRYOUT') RETURNING id", (uuid4().hex,)).fetchone()['id']
        batch = db.execute("INSERT INTO tryout_batches(package_id,starts_at,closes_at,cutoff_at,result_due_at) VALUES(%s,now(),now()+interval '1 day',now()+interval '1 day',now()+interval '4 days') RETURNING id", (package,)).fetchone()['id']
        context = db.execute("INSERT INTO measurement_contexts(ecosystem,dimension,tryout_batch_id,scale_code) VALUES('TRYOUT','RESEARCH',%s,%s) RETURNING id", (batch, uuid4().hex)).fetchone()['id']
        # Existing simulator, no generated attempts: exercise the real start-table transaction below.
        from research.irt.synthetic import generate
        source = generate(1, arms=2, include_mcma=True)[0]
        source['respondents'] = []
        source['responses'] = []
        value = delivery.build(db, actor, context, batch, 2, source=source)
        db.execute("UPDATE tryout_batches SET status='PLANNED',starts_at=now()+interval '1 hour',closes_at=now()+interval '1 day',cutoff_at=now()+interval '1 day',result_due_at=now()+interval '4 days' WHERE id=%s", (batch,))
        resources = {}
        for key, kind, source_key in [('model','IRT_MODEL','engine'),('quality','QUALITY_GATE','quality'),('eligibility','IRT_ELIGIBILITY','eligibility'),('scoring','IRT_SCORING','scoring'),('scoreMapping','SCORE_MAPPING','mapping')]:
            definition = profile[source_key]
            p = db.execute("INSERT INTO irt_compute.technical_policy_versions(code,version,kind,definition,digest,status) VALUES(%s,1,%s,%s,irt_compute.payload_digest(%s),'SEALED') RETURNING id,digest", (uuid4().hex,kind,Jsonb(definition),Jsonb(definition))).fetchone()
            approval = db.execute('INSERT INTO configuration_approvals(technical_policy_version_id,approved_digest,scope,approved_by_user_id,approved_at) VALUES(%s,%s,%s,%s,now()) RETURNING id',(p['id'],p['digest'],Jsonb({'ecosystem':'TRYOUT','contextId':str(context),'purpose':'RESEARCH_ONLY'}),actor)).fetchone()['id']
            resources[key] = {'kind':kind,'ref':{'id':str(p['id']),'version':1,'digest':p['digest'],'approvalId':str(approval)},'definition':definition}
        release = db.execute("INSERT INTO irt_compute.technical_policy_versions(code,version,kind,definition,digest,status) VALUES(%s,1,'IRT_FALLBACK','{}',irt_compute.payload_digest('{}'),'SEALED') RETURNING id,digest",(uuid4().hex,)).fetchone()
        approval = db.execute('INSERT INTO configuration_approvals(technical_policy_version_id,approved_digest,scope,approved_by_user_id,approved_at) VALUES(%s,%s,%s,%s,now()) RETURNING id',(release['id'],release['digest'],Jsonb({'ecosystem':'TRYOUT','contextId':str(context),'purpose':'RESEARCH_ONLY'}),actor)).fetchone()['id']
        arm_set = db.execute('SELECT set_id FROM assessment_arms WHERE id=%s',(value['packages'][0]['armId'],)).fetchone()['set_id']
        pins = []
        for p in value['packages']:
            r = db.execute('SELECT id,manifest_digest FROM assessment_arm_revisions WHERE package_id=%s',(p['packageId'],)).fetchone()
            pins.append({**p,'revisionId':str(r['id']),'manifestDigest':r['manifest_digest']})
        config = {'contextRevision':1,'anchors':value['anchorQuestionVersionIds'],'packages':pins,'resources':resources,'runtime':json.loads((delivery.AI/'research/irt-runtime-windows-v4.json').read_text()),'releaseApprovalId':str(approval)}
        def insert(c):
            return db.execute("INSERT INTO irt_delivery_bindings_v1(batch_id,context_id,arm_set_id,batch_revision,configuration,digest,actor_user_id) VALUES(%s,%s,%s,1,%s,'',%s) RETURNING digest",(batch,context,arm_set,Jsonb(c),actor)).fetchone()
        failures = 0
        for mutate in [lambda c:c['runtime'].pop('image'),lambda c:c['packages'].append(c['packages'][0]),lambda c:c['anchors'].__setitem__(0,str(uuid4())),lambda c:c['resources']['model']['ref'].__setitem__('digest','0'*64),lambda c:c.__setitem__('contextRevision',99)]:
            c = deepcopy(config); mutate(c)
            try:
                with db.transaction(): insert(c)
            except psycopg.Error: failures += 1
            else: raise AssertionError('Invalid binding accepted')
        assert insert(config)['digest']
        student = db.execute("INSERT INTO users(auth_user_id,role,display_name,email) VALUES(%s,'STUDENT','SYNTHETIC','start@example.test') RETURNING id",(uuid4(),)).fetchone()['id']
        p = pins[0]
        attempt = db.execute("INSERT INTO assessment_attempts(student_id,package_id,assessment_type,tryout_batch_id) VALUES(%s,%s,'TRYOUT',%s) RETURNING id",(student,p['packageId'],batch)).fetchone()['id']
        db.execute('INSERT INTO tryout_student_assignments(attempt_id,batch_id,student_id,package_id) VALUES(%s,%s,%s,%s)',(attempt,batch,student,p['packageId']))
        pin = db.execute('SELECT a.first_valid_evidence,d.delivered_revision_id FROM assessment_attempt_arm_deliveries d JOIN assessment_arm_assignments a ON a.id=d.assignment_id WHERE d.attempt_id=%s',(attempt,)).fetchone()
        assert pin['first_valid_evidence'] is True
        assert str(pin['delivered_revision_id']) == p['revisionId']
        try:
            with db.transaction():
                db.execute("INSERT INTO assessment_attempts(student_id,package_id,assessment_type,tryout_batch_id) VALUES(%s,%s,'TRYOUT',%s)",(student,p['packageId'],batch))
        except psycopg.errors.UniqueViolation: pass
        else: raise AssertionError('Duplicate attempt accepted')
        db.commit()
        print(json.dumps({'invalidBindingsRejected':failures,'deliveryPin':'PASS','firstValidEvidence':True,'duplicateAttempt':'REJECTED','R':'NOT_RUN'}))


if __name__ == '__main__': main()
