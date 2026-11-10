"""Synthetic operator authorization checks, invoked only inside the owned disposable harness."""
from copy import deepcopy
from uuid import uuid4
from urllib.parse import urlparse,urlunparse
import psycopg
import json,os,subprocess
from pathlib import Path
from psycopg.types.json import Jsonb
from psycopg.rows import dict_row


def verify(owner,url,actor,batch,context,config,value):
    assert urlparse(url).hostname=='127.0.0.1' and urlparse(url).path.startswith('/irt_research_test_')
    config=deepcopy(config);config['runtime']['purpose']='PRODUCTION'
    main='irt_prod_main_'+uuid4().hex;compute='irt_prod_compute_'+uuid4().hex;api='irt_prod_api_'+uuid4().hex
    for login,role in [(main,'numora_main_runtime'),(compute,'numora_irt_runtime'),(api,'numora_main_runtime')]:
        owner.execute(psycopg.sql.SQL('CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT').format(psycopg.sql.Identifier(login)))
        owner.execute(psycopg.sql.SQL('GRANT {} TO {}').format(psycopg.sql.Identifier(role),psycopg.sql.Identifier(login)))
    for resource in config['resources'].values():
        definition=deepcopy(resource['definition'])
        if 'purpose' in definition:definition['purpose']='PRODUCTION'
        policy=owner.execute("INSERT INTO irt_compute.technical_policy_versions(code,version,kind,definition,digest,status) VALUES(%s,1,%s,%s,irt_compute.payload_digest(%s),'SEALED') RETURNING id,digest",(uuid4().hex,resource['kind'],Jsonb(definition),Jsonb(definition))).fetchone()
        approval=owner.execute("INSERT INTO configuration_approvals(technical_policy_version_id,approved_digest,scope,approved_by_user_id,approved_at) VALUES(%s,%s,%s,%s,now()) RETURNING id",(policy['id'],policy['digest'],Jsonb({'purpose':'PRODUCTION','ecosystem':'TRYOUT','contextId':str(context)}),actor)).fetchone()['id']
        resource.update(ref={'id':str(policy['id']),'version':1,'digest':policy['digest'],'approvalId':str(approval)},definition=definition)
    definition=owner.execute('SELECT p.definition FROM configuration_approvals a JOIN irt_compute.technical_policy_versions p ON p.id=a.technical_policy_version_id WHERE a.id=%s',(config['releaseApprovalId'],)).fetchone()['definition']
    definition['purpose']='PRODUCTION'
    release=owner.execute("INSERT INTO irt_compute.technical_policy_versions(code,version,kind,definition,digest,status) VALUES(%s,1,'IRT_FALLBACK',%s,irt_compute.payload_digest(%s),'SEALED') RETURNING id,digest",(uuid4().hex,Jsonb(definition),Jsonb(definition))).fetchone()
    config['releaseApprovalId']=str(owner.execute("INSERT INTO configuration_approvals(technical_policy_version_id,approved_digest,scope,approved_by_user_id,approved_at) VALUES(%s,%s,%s,%s,now()) RETURNING id",(release['id'],release['digest'],Jsonb({'purpose':'PRODUCTION','ecosystem':'TRYOUT','contextId':str(context)}),actor)).fetchone()['id'])
    principal=owner.execute('INSERT INTO service_principals(code,enabled) VALUES(%s,true) RETURNING id',(uuid4().hex,)).fetchone()['id']
    owner.commit()
    p=urlparse(url);mainurl=urlunparse(p._replace(netloc=f'{main}@{p.hostname}:{p.port}'))
    def authorized(connection,c=config):
        return connection.execute('SELECT public.irt_production_authorized_v1(%s,%s,%s) AS valid',(context,Jsonb(c['runtime']),Jsonb(c['resources']))).fetchone()['valid']
    with psycopg.connect(mainurl,row_factory=dict_row) as db:
        assert not authorized(db),'Production accepted without operator enrollment'
        try:
            with db.transaction():db.execute('INSERT INTO irt_production_authorizations_v1(context_id) VALUES(%s)',(context,))
        except psycopg.errors.InsufficientPrivilege:pass
        else:raise AssertionError('Main can provision its own production authorization')
    owner.execute("INSERT INTO irt_production_authorizations_v1(context_id,batch_id,database_oid,database_name,main_login,compute_login,service_principal_id,runtime_profile,resources,release_approval_id,scientific_acceptance_digest,approved_by_user_id,approved_at,expires_at) SELECT %s,%s,oid,datname,%s,%s,%s,%s,%s,%s,%s,%s,now(),now()+interval '1 day' FROM pg_database WHERE datname=current_database()",(context,batch,main,compute,principal,Jsonb(config['runtime']),Jsonb(config['resources']),config['releaseApprovalId'],'a'*64,actor))
    owner.commit()
    with psycopg.connect(mainurl,row_factory=dict_row) as db:
        assert authorized(db)
        changed=deepcopy(config);changed['runtime']['image']='sha256:'+'0'*64;assert not authorized(db,changed)
        changed=deepcopy(config);changed['resources']['model']['ref']['digest']='0'*64;assert not authorized(db,changed)
        db.execute('SELECT public.irt_assert_production_v1(%s,%s,%s)',(context,Jsonb(config['runtime']),Jsonb(config['resources'])))
    with psycopg.connect(mainurl,row_factory=dict_row) as db:
        # Binding uses the same manifest guard, with a real restricted Main login.
        arm=owner.execute('SELECT set_id FROM assessment_arms WHERE id=%s',(config['packages'][0]['armId'],)).fetchone()['set_id']
        with db.transaction(force_rollback=True):
            db.execute("INSERT INTO irt_delivery_bindings_v1(batch_id,context_id,arm_set_id,batch_revision,configuration,digest,actor_user_id) VALUES(%s,%s,%s,1,%s,'',%s)",(batch,context,arm,Jsonb(config),actor))
        body=deepcopy(value);body.pop('inputDigest',None)
        body.update(requestId=str(uuid4()),snapshotId=str(uuid4()),calibrationId=str(uuid4()))
        body['policies']={**{k:v['ref'] for k,v in config['resources'].items()},'comparison':None}
        row=db.execute("INSERT INTO irt_calibration_requests_v1(id,snapshot_id,context_id,body,resources,runtime_profile,input_digest) VALUES(%s,%s,%s,%s,%s,%s,'') RETURNING input_digest",(body['requestId'],body['snapshotId'],context,Jsonb(body),Jsonb(config['resources']),Jsonb(config['runtime']))).fetchone()
        assert row['input_digest']
        db.execute('INSERT INTO irt_calibration_dispatches_v1(request_id,generation,actor_user_id) VALUES(%s,1,%s)',(body['requestId'],actor))
    computeurl=urlunparse(p._replace(netloc=f'{compute}@{p.hostname}:{p.port}'))
    with psycopg.connect(computeurl,row_factory=dict_row) as db:
        assert not db.execute("SELECT has_function_privilege(current_user,'public.irt_assert_production_delivery_v1(uuid,jsonb,jsonb)','EXECUTE') AS valid").fetchone()['valid']
        assert db.execute('SELECT approvals_valid FROM irt_calibration_inputs_v1 WHERE id=%s',(body['requestId'],)).fetchone()['approvals_valid']
        assert db.execute('SELECT irt_compute_principal_authorized_v1(%s,%s) AS valid',(context,principal)).fetchone()['valid']
        assert not db.execute('SELECT irt_compute_principal_authorized_v1(%s,%s) AS valid',(context,uuid4())).fetchone()['valid']
        db.execute('INSERT INTO irt_compute.calibration_jobs_v1(request_id,generation) VALUES(%s,1)',(body['requestId'],))
        for query in ['SELECT email FROM users','UPDATE assessment_attempts SET score_0_100=0','SELECT * FROM irt_production_authorizations_v1']:
            try:
                with db.transaction():db.execute(query)
            except psycopg.errors.InsufficientPrivilege:pass
            else:raise AssertionError('Compute crossed canonical/PII/operator boundary')
    stranger='irt_prod_stranger_'+uuid4().hex
    owner.execute(psycopg.sql.SQL('CREATE ROLE {} LOGIN INHERIT').format(psycopg.sql.Identifier(stranger)))
    owner.execute(psycopg.sql.SQL('GRANT numora_irt_runtime TO {}').format(psycopg.sql.Identifier(stranger)));owner.commit()
    with psycopg.connect(urlunparse(p._replace(netloc=f'{stranger}@{p.hostname}:{p.port}')),row_factory=dict_row) as db:
        assert db.execute('SELECT count(*) AS n FROM irt_calibration_inputs_v1 WHERE id=%s',(body['requestId'],)).fetchone()['n']==0
        assert db.execute('SELECT count(*) AS n FROM irt_compute.calibration_jobs_v1 WHERE request_id=%s',(body['requestId'],)).fetchone()['n']==0
    # Ordinary student API login is deliberately NOT enrolled for IRT compute.
    apiurl=urlunparse(p._replace(netloc=f'{api}@{p.hostname}:{p.port}'))
    students=[owner.execute("INSERT INTO users(auth_user_id,role,display_name,email) VALUES(%s,'STUDENT','SYNTHETIC',%s) RETURNING id",(uuid4(),uuid4().hex+'@example.test')).fetchone()['id'] for _ in range(2)]
    package=config['packages'][0]
    owner.execute("UPDATE tryout_batches SET admin_title='SYNTHETIC',admin_published_at=statement_timestamp(),mandiri_package_id=%s WHERE id=%s",(package['packageId'],batch))
    owner.commit()
    with psycopg.connect(mainurl,row_factory=dict_row) as db:
        db.execute("INSERT INTO irt_delivery_bindings_v1(batch_id,context_id,arm_set_id,batch_revision,configuration,digest,actor_user_id) VALUES(%s,%s,%s,1,%s,'',%s)",(batch,context,arm,Jsonb(config),actor))
    owner.execute("UPDATE tryout_batches SET starts_at=statement_timestamp()-interval '1 minute' WHERE id=%s",(batch,));owner.commit()
    with psycopg.connect(apiurl,row_factory=dict_row) as db:
        assert not db.execute('SELECT irt_production_visible_v1(%s) AS valid',(context,)).fetchone()['valid']
        changed=deepcopy(config['runtime']);changed['image']='sha256:'+'0'*64
        try:
            with db.transaction():db.execute('SELECT irt_assert_production_delivery_v1(%s,%s,%s)',(context,Jsonb(changed),Jsonb(config['resources'])))
        except psycopg.errors.CheckViolation:pass
        else:raise AssertionError('Delivery accepted mismatched runtime')
        try:
            with db.transaction():db.execute('SELECT irt_assert_production_v1(%s,%s,%s)',(context,Jsonb(config['runtime']),Jsonb(config['resources'])))
        except psycopg.errors.CheckViolation:pass
        else:raise AssertionError('API login acquired private IRT authorization')
    env={**os.environ,'DATABASE_URL':apiurl+'?sslmode=disable','NUMORA_IRT_DATABASE_URL':mainurl+'?sslmode=disable','NODE_ENV':'test','ALLOW_SYNTHETIC_CONTENT':'false'}
    subprocess.run(['node','scripts/test-irt-production-start.mjs'],cwd=Path(__file__).resolve().parents[1],env=env,input=json.dumps({'batchId':str(batch),'students':list(map(str,students)),'revisionId':package['revisionId'],'armId':package['armId']}),text=True,check=True,timeout=90)
    # A database-name pin alone and an expired approval cannot authorize production.
    for query in ["UPDATE irt_production_authorizations_v1 SET database_name='wrong' WHERE context_id=%s",
                  "UPDATE irt_production_authorizations_v1 SET expires_at=now()-interval '1 second',approved_at=now()-interval '2 seconds' WHERE context_id=%s"]:
        with owner.transaction(force_rollback=True):
            owner.execute(query,(context,))
            assert not authorized(owner)
    # Revocation affects the read-only projection/heartbeat predicate immediately.
    owner.execute('UPDATE irt_production_authorizations_v1 SET revoked_at=clock_timestamp() WHERE context_id=%s',(context,));owner.commit()
    with psycopg.connect(mainurl,row_factory=dict_row) as db:assert not authorized(db)
    fresh=owner.execute("INSERT INTO users(auth_user_id,role,display_name,email) VALUES(%s,'STUDENT','SYNTHETIC',%s) RETURNING id",(uuid4(),uuid4().hex+'@example.test')).fetchone()['id'];owner.commit()
    with psycopg.connect(apiurl,row_factory=dict_row) as db:
        try:
            with db.transaction():db.execute("INSERT INTO assessment_attempts(student_id,package_id,assessment_type,tryout_batch_id) VALUES(%s,%s,'TRYOUT',%s)",(fresh,package['packageId'],batch))
        except psycopg.errors.CheckViolation as error:assert 'IRT_PRODUCTION_NOT_AUTHORIZED' in str(error)
        else:raise AssertionError('Revoked enrollment accepted student start')
        assert db.execute('SELECT count(*) AS n FROM assessment_attempts WHERE student_id=%s',(fresh,)).fetchone()['n']==0
        assert db.execute('SELECT count(*) AS n FROM assessment_arm_assignments WHERE student_id=%s',(fresh,)).fetchone()['n']==0
    print('Production authorization: missing enrollment, self-provision, runtime/policy mismatch and revocation checks passed',flush=True)
