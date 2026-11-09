// Local opt-in outbox transport only. Never adopts/publishes canonical results.
import postgres from '../packages/database/node_modules/postgres/src/index.js';
import {deliverPendingCalibrationResearch} from '../packages/irt-orchestration/src/calibration-research.mjs';
import {setTimeout as delay} from 'node:timers/promises';

if(process.env.NUMORA_IRT_RESEARCH_ENABLED!=='true')throw new Error('IRT_RESEARCH_DISABLED');
const databaseUrl=new URL(process.env.IRT_RESEARCH_MAIN_DATABASE_URL??'invalid:');
const endpoint=new URL(process.env.NUMORA_IRT_RESEARCH_URL??'invalid:');
if(!['127.0.0.1','localhost'].includes(databaseUrl.hostname)||!databaseUrl.pathname.startsWith('/irt_research_test_'))throw new Error('DISPOSABLE_LOCAL_DATABASE_REQUIRED');
if(!['127.0.0.1','localhost'].includes(endpoint.hostname)||endpoint.protocol!=='http:')throw new Error('LOCAL_COMPUTE_ENDPOINT_REQUIRED');
const token=process.env.NUMORA_IRT_RESEARCH_TOKEN;
if(!token||token.length<32)throw new Error('IRT_RESEARCH_TOKEN_REQUIRED');
const sql=postgres(databaseUrl.toString(),{max:1,onnotice:()=>{}});
let stopped=false;
process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
try {
  do {
    const result=await deliverPendingCalibrationResearch(sql,{url:endpoint.toString(),token});
    if(result.acknowledged||result.failed)console.log(JSON.stringify(result));
    if(process.argv.includes('--once'))break;
    await delay(1000);
  } while(!stopped);
} finally {await sql.end();}
