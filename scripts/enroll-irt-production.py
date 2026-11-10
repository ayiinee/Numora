"""Operator-owned enrollment. Dry-run by default; never creates policy approval or runtime logins."""
import argparse,hashlib,json,os,re
from datetime import datetime,timezone
from pathlib import Path
from uuid import UUID
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--manifest',type=Path,required=True);p.add_argument('--expected-database',required=True);p.add_argument('--apply',action='store_true');a=p.parse_args()
    value=json.loads(a.manifest.read_text());base=a.manifest.resolve().parent
    for key in ['contextId','batchId','servicePrincipalId','releaseApprovalId','approvedByUserId']:UUID(value[key])
    runtime=json.loads((base/value['runtimeProfile']).read_text());resources=json.loads((base/value['resources']).read_text())
    if runtime.get('purpose')!='PRODUCTION' or set(resources)!={'model','quality','eligibility','scoring','scoreMapping'}:raise ValueError('IRT_ENROLLMENT_PINS_INVALID')
    evidence=(base/value['scientificAcceptance']).read_bytes();acceptance=json.loads(evidence)
    if acceptance.get('decision')!='APPROVED_FOR_PRODUCTION' or acceptance.get('contextId')!=value['contextId'] or not re.fullmatch(r'[0-9a-f]{64}',acceptance.get('pinsDigest','')):raise ValueError('IRT_SCIENTIFIC_APPROVAL_REQUIRED')
    digest=hashlib.sha256(evidence).hexdigest()
    expires=datetime.fromisoformat(value['expiresAt'].replace('Z','+00:00'))
    if expires.tzinfo is None or expires<=datetime.now(timezone.utc):raise ValueError('IRT_ENROLLMENT_EXPIRY_INVALID')
    url=os.environ.get('IRT_OPERATOR_DATABASE_URL','')
    if not url or psycopg.conninfo.conninfo_to_dict(url).get('sslmode')!='verify-full':raise ValueError('IRT_OPERATOR_TLS_REQUIRED')
    with psycopg.connect(url,connect_timeout=10,row_factory=dict_row) as db:
        if not a.apply:db.execute('SET TRANSACTION READ ONLY')
        target=db.execute('SELECT oid,datname FROM pg_database WHERE datname=current_database()').fetchone()
        if target['datname']!=a.expected_database:raise ValueError('IRT_ENROLLMENT_DATABASE_MISMATCH')
        context=db.execute("SELECT c.id FROM measurement_contexts c JOIN tryout_batches b ON b.id=c.tryout_batch_id WHERE c.id=%s AND b.id=%s AND c.ecosystem='TRYOUT' AND b.starts_at>clock_timestamp() AND b.cancelled_at IS NULL",(value['contextId'],value['batchId'])).fetchone()
        if not context:raise ValueError('IRT_ENROLLMENT_CONTEXT_INVALID')
        for key,role,other in [('mainLogin','numora_main_runtime','numora_irt_runtime'),('computeLogin','numora_irt_runtime','numora_main_runtime')]:
            row=db.execute("SELECT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND pg_has_role(oid,%s,'MEMBER') AND NOT pg_has_role(oid,%s,'MEMBER') AS valid FROM pg_roles WHERE rolname=%s",(role,other,value[key])).fetchone()
            if not row or not row['valid']:raise ValueError('IRT_ENROLLMENT_ROLE_INVALID')
        principal=db.execute('SELECT enabled FROM service_principals WHERE id=%s',(value['servicePrincipalId'],)).fetchone()
        if not principal or not principal['enabled']:raise ValueError('IRT_ENROLLMENT_PRINCIPAL_REQUIRED')
        for resource in resources.values():
            ref=resource['ref']
            row=db.execute("SELECT p.definition,p.digest,p.digest=irt_compute.payload_digest(p.definition) AS digest_valid,p.version,p.kind,a.scope,a.revoked_at,a.approved_digest,p.status FROM configuration_approvals a JOIN irt_compute.technical_policy_versions p ON p.id=a.technical_policy_version_id WHERE a.id=%s AND p.id=%s",(ref['approvalId'],ref['id'])).fetchone()
            if not row or not row['digest_valid'] or row['status']!='SEALED' or row['revoked_at'] or row['definition']!=resource['definition'] or row['kind']!=resource['kind'] or row['version']!=ref['version'] or row['digest']!=ref['digest'] or row['approved_digest']!=ref['digest'] or row['scope'].get('purpose')!='PRODUCTION' or row['scope'].get('contextId')!=value['contextId'] or row['scope'].get('ecosystem')!='TRYOUT':raise ValueError('IRT_ENROLLMENT_POLICY_NOT_APPROVED')
        release=db.execute("SELECT a.id FROM configuration_approvals a JOIN irt_compute.technical_policy_versions p ON p.id=a.technical_policy_version_id WHERE a.id=%s AND a.revoked_at IS NULL AND a.scope->>'contextId'=%s AND a.scope->>'ecosystem'='TRYOUT' AND a.scope->>'purpose'='PRODUCTION' AND p.kind='IRT_FALLBACK' AND p.status='SEALED' AND p.definition->>'purpose'='PRODUCTION' AND a.approved_digest=p.digest AND p.digest=irt_compute.payload_digest(p.definition)",(value['releaseApprovalId'],value['contextId'])).fetchone()
        actor=db.execute("SELECT id FROM users WHERE id=%s AND status='ACTIVE' AND role='ADMIN' AND admin_role IN ('SUPER_ADMIN','CONTENT_DATA_MODERATION')",(value['approvedByUserId'],)).fetchone()
        if not release or not actor:raise ValueError('IRT_ENROLLMENT_APPROVAL_REQUIRED')
        pins={'context':value['contextId'],'batch':value['batchId'],'runtime':runtime,'resources':resources,'releaseApprovalId':value['releaseApprovalId']}
        frozen_digest=db.execute('SELECT irt_compute.payload_digest(%s) AS digest',(Jsonb(pins),)).fetchone()['digest']
        if acceptance.get('pinsDigest')!=frozen_digest:raise ValueError('IRT_SCIENTIFIC_APPROVAL_PIN_MISMATCH')
        if a.apply:
            db.execute("INSERT INTO irt_production_authorizations_v1(context_id,batch_id,database_oid,database_name,main_login,compute_login,service_principal_id,runtime_profile,resources,release_approval_id,scientific_acceptance_digest,approved_by_user_id,approved_at,expires_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,clock_timestamp(),%s)",(value['contextId'],value['batchId'],target['oid'],target['datname'],value['mainLogin'],value['computeLogin'],value['servicePrincipalId'],Jsonb(runtime),Jsonb(resources),value['releaseApprovalId'],digest,value['approvedByUserId'],expires))
        print(json.dumps({'status':'ENROLLED' if a.apply else 'DRY_RUN_READY','contextId':value['contextId'],'pinsDigest':frozen_digest,'scientificAcceptanceDigest':digest,'runtimeEnabled':False}))


if __name__=='__main__':
    try:main()
    except Exception as e:
        # Raw driver exceptions can contain secrets or participant identifiers.
        code=str(e) if isinstance(e,ValueError) and re.fullmatch(r'IRT_[A-Z0-9_]+',str(e)) else 'IRT_ENROLLMENT_FAILED'
        raise SystemExit(code) from None
