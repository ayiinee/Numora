"""Create and validate deterministic Drill LEVEL frozen-input fixtures."""
import argparse, hashlib, json, sys
from pathlib import Path
from uuid import UUID, uuid5
ROOT=Path(__file__).resolve().parents[1]
FIX=ROOT/'packages/testing/fixtures/irt-drill-v1'
NAMESPACE=UUID('cdf3ce53-66fe-4e61-ab6e-b2c0cbb69fb1')

def digest(v): return hashlib.sha256((json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode()).hexdigest()
def build(ai, small=False):
 sys.path.insert(0,str(ai)); from research.irt.synthetic import generate
 recipe=json.loads((FIX/'recipe.json').read_text(encoding='utf-8-sig'))\n for name,pin in recipe['sourceSha256'].items():\n  if hashlib.sha256((ai/name).read_bytes().replace(b'\\r\\n',b'\\n')).hexdigest()!=pin: raise ValueError('DRILL_SOURCE_PIN_MISMATCH: '+name)
 value, truth=generate(recipe['perArm'][0],recipe['seed'],'MIXED',2,include_mcma=True)
 packages=[]; allowed=set()
 common=value['packages'][0]['questionVersionIds'][:recipe['anchors']]
 for arm,p in enumerate(value['packages']):
  focal=[q for q in p['questionVersionIds'] if q not in common][:recipe['focal']]
  ids=common+focal; allowed.update(ids)
  packages.append({'armId':p['armId'],'packageVersion':p.get('packageVersion',1),'questionVersionIds':ids,'anchorQuestionVersionIds':common,'focalQuestionVersionIds':focal})
 respondents=[r for r in value['respondents'] if r['deliveredArmId'] in {p['armId'] for p in packages}]
 byarm={p['armId']:[] for p in packages}
 for r in respondents: byarm[r['deliveredArmId']].append(r)
 counts=[2,2] if small else recipe['perArm']
 selected=[]
 for p,n in zip(packages,counts): selected += byarm[p['armId']][:n]
 ids={r['attemptId'] for r in selected}
 responses=[r for r in value['responses'] if r['attemptId'] in ids and r['questionVersionId'] in allowed]
 items=[i for i in value['items'] if i['questionVersionId'] in allowed]
 manifest={'version':'irt-drill-frozen-input-v1','purpose':'SYNTHETIC_ONLY','ecosystem':'DRILL','dimension':'LEVEL','contextId':str(uuid5(NAMESPACE,'drill:context')),'contextRevision':1,'levelId':'LEVEL-1','seed':recipe['seed'],'packages':packages,'respondentCount':[len([r for r in selected if r['deliveredArmId']==p['armId']]) for p in packages],'firstValidEvidence':'PINNED_PER_STUDENT_LEVEL','eligibility':'AUTHORITATIVE_ASSIGNMENT_AND_GRADING','exposure':'RECORDED_WITH_PROVENANCE','productionApproved':False}
 payload={'manifest':manifest,'items':items,'respondents':selected,'responses':responses,'policy':json.loads((FIX/'policy.json').read_text(encoding='utf-8-sig'))}
 return payload

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--ai-repo',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);ap.add_argument('--small',action='store_true');a=ap.parse_args(); payload=build(a.ai_repo.resolve(),a.small); a.output.mkdir(parents=True,exist_ok=True); (a.output/'drill-level-input.json').write_text(json.dumps(payload,ensure_ascii=False,sort_keys=True,indent=2)+'\n'); (a.output/'manifest.json').write_text(json.dumps({'version':'irt-drill-frozen-input-v1','sha256':digest(payload),'respondents':payload['manifest']['respondentCount'],'itemsPerArm':10,'anchorsPerArm':3,'focalPerArm':7,'productionApproved':False},indent=2)+'\n'); print(json.dumps({'sha256':digest(payload),'respondents':payload['manifest']['respondentCount'],'small':a.small}))
if __name__=='__main__': main()



