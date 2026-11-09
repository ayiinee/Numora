import test from 'node:test';
import assert from 'node:assert/strict';
import {respondentUuid,freezeCalibrationResearch,notifyCalibrationResearch} from './calibration-research.mjs';

test('pseudonyms are stable and separated by context and key version',()=>{
  const secret='private-test-only'.repeat(3);
  const base=respondentUuid(secret,'v1','context-a','student-a');
  assert.match(base,/^[0-9a-f-]{36}$/);
  assert.equal(base,respondentUuid(secret,'v1','context-a','student-a'));
  assert.notEqual(base,respondentUuid(secret,'v2','context-a','student-a'));
  assert.notEqual(base,respondentUuid(secret,'v1','context-b','student-a'));
  assert.throws(()=>respondentUuid('short','v1','a','b'),/NOT_CONFIGURED/);
});

test('canonical adapter and HTTP remain disabled by default',async()=>{
  const previous=process.env.NUMORA_IRT_RESEARCH_ENABLED;
  delete process.env.NUMORA_IRT_RESEARCH_ENABLED;
  try {
    await assert.rejects(freezeCalibrationResearch(null,null,null,null,{}),/IRT_RESEARCH_DISABLED/);
    await assert.rejects(notifyCalibrationResearch({},{}),/IRT_RESEARCH_DISABLED/);
  } finally {
    if(previous===undefined)delete process.env.NUMORA_IRT_RESEARCH_ENABLED;
    else process.env.NUMORA_IRT_RESEARCH_ENABLED=previous;
  }
});

test('canonical adapter rejects an unregistered package before reading grades',async()=>{
  const previous=process.env.NUMORA_IRT_RESEARCH_ENABLED;
  process.env.NUMORA_IRT_RESEARCH_ENABLED='true';
  try {
    let query=0;
    const sql={begin:async fn=>fn(async()=>query++===0?[{ecosystem:'TRYOUT',tryout_batch_id:'batch',revision:1}]:[])};
    await assert.rejects(freezeCalibrationResearch(sql,{ecosystem:'TRYOUT',comparisons:[],respondents:[],
      context:{batchId:'batch',revision:1},packages:[{packageId:'unknown'}]},null,null,{}),/IRT_CANONICAL_MANIFEST_MISMATCH/);
  } finally {
    if(previous===undefined)delete process.env.NUMORA_IRT_RESEARCH_ENABLED;
    else process.env.NUMORA_IRT_RESEARCH_ENABLED=previous;
  }
});
