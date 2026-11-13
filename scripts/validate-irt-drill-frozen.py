"""Read-only checks for Drill LEVEL frozen input."""
import argparse,json,hashlib
from pathlib import Path

def digest(v): return hashlib.sha256((json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode()).hexdigest()
def check(folder):
 p=json.loads((folder/'drill-level-input.json').read_text(encoding='utf-8')); m=p['manifest']; policy=p['policy']
 assert m['ecosystem']=='DRILL' and m['dimension']=='LEVEL' and not m['productionApproved']
 assert policy['purpose']=='RESEARCH_ONLY' and not policy['productionApproved'] and policy['comparisons']==[] and policy['fallback'] is None
 packages=m['packages']; assert len(packages)==2 and all(len(x['questionVersionIds'])==10 for x in packages)
 anchors=[x['anchorQuestionVersionIds'] for x in packages]; assert anchors[0]==anchors[1] and len(set(anchors[0]))==3
 assert all(len(x['focalQuestionVersionIds'])==7 and not set(x['focalQuestionVersionIds'])&set(anchors[0]) for x in packages)
 for x in packages: assert len(x['questionVersionIds'])==len(set(x['questionVersionIds']))
 assert len(p['items'])==len(set(i['questionVersionId'] for i in p['items']))
 assert all('studentId' not in r and 'email' not in r for r in p['respondents'])
 return digest(p)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('folders',nargs='+');a=ap.parse_args(); values=[check(Path(x)) for x in a.folders]; assert values[0]==check(Path(a.folders[0])); print(json.dumps({'status':'PASS','digests':values}))
if __name__=='__main__':main()
