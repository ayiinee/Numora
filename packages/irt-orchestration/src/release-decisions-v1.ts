import type { CalibrationInput, CalibrationResult } from '../../contracts/irt-calibration-v1/types.js';

export interface ResearchReleasePolicy {
  purpose: 'RESEARCH_ONLY'; minimumValidItems: number; rounding: 'HALF_UP_2';
  weights: { SINGLE_CHOICE: 2; MULTIPLE_CHOICE_MULTIPLE_ANSWER: 3; CATEGORY: 3 };
  partialArm: 'FALLBACK_WHOLE_ARM';
}
export const RESEARCH_RELEASE_POLICY_V1: ResearchReleasePolicy = {
  purpose: 'RESEARCH_ONLY', minimumValidItems: 24, rounding: 'HALF_UP_2',
  weights: { SINGLE_CHOICE: 2, MULTIPLE_CHOICE_MULTIPLE_ANSWER: 3, CATEGORY: 3 }, partialArm: 'FALLBACK_WHOLE_ARM',
};
const error = (code: string): never => { throw new Error(code); };
const cents = (v: string) => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(v)) throw new Error('IRT_RELEASE_POINTS_INVALID');
  const [a,b=''] = v.split('.'); return BigInt(a!) * 100n + BigInt(b.padEnd(2,'0'));
};
const rounded = (n: bigint, d: bigint, places: number) => {
  const scale = 10n ** BigInt(places); const v = (2n*n*scale+d)/(2n*d);
  return `${v/scale}.${String(v%scale).padStart(places,'0')}`;
};
export function decideTryoutReleaseV1(input: CalibrationInput, output: CalibrationResult | null, policy: ResearchReleasePolicy) {
  if (policy.purpose !== 'RESEARCH_ONLY' || policy.minimumValidItems !== 24 || policy.rounding !== 'HALF_UP_2' || policy.partialArm !== 'FALLBACK_WHOLE_ARM'
    || JSON.stringify(policy.weights) !== JSON.stringify(RESEARCH_RELEASE_POLICY_V1.weights)) error('IRT_RELEASE_POLICY_UNSUPPORTED');
  if (!input.respondents.length) error('IRT_RELEASE_EMPTY_BATCH');
  const itemMap = new Map(input.items.map(i => [i.questionVersionId,i]));
  const byAttempt = new Map<string, CalibrationInput['responses']>();
  for (const r of input.responses) { const rows=byAttempt.get(r.attemptId) ?? []; rows.push(r); byAttempt.set(r.attemptId,rows); }
  const respondentResults = new Map(output?.outcome?.respondents.map(r => [r.attemptId,r]) ?? []);
  const packageResults = new Map(output?.outcome?.packages.map(p => [`${p.packageId}:${p.packageVersion}`,p]) ?? []);
  const arms = input.packages.map(pkg => {
    const people = input.respondents.filter(r => r.deliveredArmId === pkg.armId);
    const valid = people.map(person => {
      let n=0n,d=1n,max=0n,count=0;
      for (const r of byAttempt.get(person.attemptId) ?? []) {
        const item=itemMap.get(r.questionVersionId)!;
        if (item.contentState !== 'CONTENT_VALID' || !['RESPONDED','OMITTED'].includes(r.responseState)) continue;
        if (r.awardedPoints === null) error('IRT_RELEASE_FINAL_GRADE_REQUIRED');
        const p=cents(r.awardedPoints!), m=cents(item.maxPoints), w=BigInt(policy.weights[item.questionType]);
        if (m<=0n || p>m) error('IRT_RELEASE_POINTS_INVALID');
        // Normalize authoritative points first; apply product weight exactly once.
        n=n*m+p*w*d; d*=m; max+=w; count++;
      }
      if (max>0n && count<policy.minimumValidItems) error('IRT_RELEASE_COVERAGE_BELOW_POLICY');
      return {person,n,d,max,count};
    });
    const calibrated=packageResults.get(`${pkg.packageId}:${pkg.packageVersion}`)?.measurementState === 'CALIBRATED';
    const useIrt=calibrated && valid.every(v => v.max===0n || respondentResults.get(v.person.attemptId)?.status==='SCORED');
    const reason=useIrt ? null : output?.executionStatus==='FAILED' ? 'IRT_FAILED' : output ? 'IRT_NOT_SCORABLE_FOR_ARM' : 'IRT_UNAVAILABLE';
    const results=valid.map(v => {
      const r=respondentResults.get(v.person.attemptId);
      if (v.max===0n) return { attemptId:v.person.attemptId,armId:pkg.armId,mode:'UNSCORABLE' as const,score:null,theta:null,standardError:null,rawPoints:'0.00000000',maximumPoints:'0',reason:'NO_VALID_ITEMS',validItemCount:0 };
      if (useIrt && r?.status==='SCORED') return { attemptId:v.person.attemptId,armId:pkg.armId,mode:'IRT' as const,score:r.score,theta:r.theta,standardError:r.standardError,rawPoints:rounded(v.n,v.d,8),maximumPoints:String(v.max),reason:null,validItemCount:v.count };
      return { attemptId:v.person.attemptId,armId:pkg.armId,mode:'FALLBACK' as const,score:Number(rounded(v.n*100n,v.d*v.max,2)),theta:null,standardError:null,rawPoints:rounded(v.n,v.d,8),maximumPoints:String(v.max),reason,validItemCount:v.count };
    });
    return {armId:pkg.armId,packageId:pkg.packageId,packageVersion:pkg.packageVersion,mode:useIrt?'IRT':'FALLBACK',reason,results};
  });
  return {arms,results:arms.flatMap(a=>a.results)};
}
