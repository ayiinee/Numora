import { readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
import type { CalibrationInput, CalibrationResult } from '../../contracts/irt-calibration-v1/types.js';
import { decideTryoutReleaseV1,RESEARCH_RELEASE_POLICY_V1 as policy } from './release-decisions-v1.js';
const fixture=(name:string)=>JSON.parse(readFileSync(`packages/contracts/irt-calibration-v1/examples/${name}.json`,'utf8'));
function setup() {
 const input=fixture('tryout-input') as CalibrationInput;
 const output=fixture('tryout-result') as CalibrationResult;
 // Unit arithmetic fixture: expand each delivered row to 30 unique observations, no estimator claims.
 for (const person of input.respondents) {
   const first=input.responses.find(r=>r.attemptId===person.attemptId)!;
   input.responses=input.responses.filter(r=>r.attemptId!==person.attemptId);
   input.responses.push(...Array.from({length:30},()=>({...first,awardedPoints:'1.00',responseState:'RESPONDED' as const})));
   input.items.find(i=>i.questionVersionId===first.questionVersionId)!.maxPoints='1.00';
 }
 return {input,output};
}
describe('per-arm release decisions (arithmetic fixture only)',()=>{
 it('uses IRT only for fully scored calibrated arms',()=>{const {input,output}=setup();expect(decideTryoutReleaseV1(input,output,policy).results.every(r=>r.mode==='IRT')).toBe(true)});
 it('moves whole delivered arm to fallback for one insufficient participant',()=>{const {input,output}=setup(); output.outcome!.respondents[0]!.status='INSUFFICIENT';const d=decideTryoutReleaseV1(input,output,policy);const arm=input.respondents[0]!.deliveredArmId;expect(d.results.filter(r=>r.armId===arm).every(r=>r.mode==='FALLBACK')).toBe(true);expect(d.results.filter(r=>r.mode==='FALLBACK').every(r=>r.theta===null)).toBe(true)});
 it('normalizes points then applies weights once, with half-up decimal rounding',()=>{const {input}=setup();input.responses.forEach(r=>{r.awardedPoints='1.00';input.items.find(i=>i.questionVersionId===r.questionVersionId)!.maxPoints='3.00'});expect(decideTryoutReleaseV1(input,null,policy).results[0]!.score).toBe(33.33)});
 it('retains valid wrong and omitted observations as score zero',()=>{const {input}=setup();input.responses.forEach(r=>{r.awardedPoints='0.00';r.responseState='OMITTED'});expect(decideTryoutReleaseV1(input,null,policy).results.every(r=>r.mode==='FALLBACK'&&r.score===0)).toBe(true)});
 it('zero valid denominator stays null unscorable',()=>{const {input}=setup();input.responses.forEach(r=>r.responseState='INVALID');expect(decideTryoutReleaseV1(input,null,policy).results.every(r=>r.mode==='UNSCORABLE'&&r.score===null)).toBe(true)});
 it('holds nonzero coverage below 24 and rejects bad points/policy',()=>{const {input}=setup(); input.responses[0]!.awardedPoints='NaN';expect(()=>decideTryoutReleaseV1(input,null,policy)).toThrow('POINTS_INVALID');input.responses[0]!.awardedPoints='0.00';input.responses=input.responses.slice(0,23);expect(()=>decideTryoutReleaseV1(input,null,policy)).toThrow('COVERAGE_BELOW_POLICY');expect(()=>decideTryoutReleaseV1(input,null,{...policy,minimumValidItems:1})).toThrow('POLICY_UNSUPPORTED')});
});
