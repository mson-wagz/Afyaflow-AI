import 'reflect-metadata';
import 'dotenv/config';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Database } from '../../src/backend/src/database/db.js';
import { migrate } from '../../src/backend/src/database/migrate.js';
import { seed } from '../../src/backend/src/database/seed.js';
import { WorkflowService } from '../../src/backend/src/modules/workflow.service.js';
import { AppModule } from '../../src/backend/src/app.module.js';
import { executeAgent } from '../../services/agents/workflow.js';
import type { Model } from '../../services/agents/bedrock.js';
import { createRunTools } from '../../services/mcp/tools.js';

const schema=`afyaflow_test_${randomUUID().replaceAll('-','')}`;
const database=new Database();
const workflow=new WorkflowService(database);
const nurse={id:'STAFF-101',name:'Jane Mwangi, RN',role:'nurse'};
const clerk={id:'STAFF-103',name:'Faith Achieng',role:'clerk'};
const intake={name:'Synthetic API Journey',age:30,gender:'Female',presentingComplaint:'Synthetic headache',
  heartRate:75,systolicBp:120,diastolicBp:80,respiratoryRate:16,temperature:37,spO2:98,avpu:'Alert',mobility:'Walking normally'};
let app:any,base:string,cookie:string;
const fakeModel:Model=async messages => {
  const step=messages.filter(m=>m.role==='assistant').length;
  const name=['get_observations','read_protocol','score_protocol','save_pending_proposal'][step];
  return {content:[{toolUse:{toolUseId:`test-call-${step}`,name,input:name==='save_pending_proposal'?{summary:'Synthetic test harness: recorded observations require clinician review.'}:{}}}]};
};
async function assess(visitId:string,version:number=1,model=fakeModel) {
  const run=(await database.pool.query('SELECT * FROM agent_runs WHERE visit_id=$1 AND observation_version=$2',[visitId,version])).rows[0];
  await database.pool.query("UPDATE agent_runs SET status='RUNNING',provider='test-double',lease_until=now()+interval '5 minutes' WHERE id=$1",[run.id]);
  await executeAgent(database,run.id,model);
  return (await workflow.pending()).find(p=>p.patientId===visitId)!;
}
async function register() {return workflow.register(nurse,intake,randomUUID());}
async function decision(proposal:any,key=randomUUID()) {
  return workflow.decide(nurse,{patientId:proposal.patientId,proposalId:proposal.proposalId,
    observationVersion:proposal.observationVersion,decision:'APPROVED',reason:'Synthetic clinician reviewed evidence.'},key);
}
before(async () => {
  process.env.AGENT_WORKER_DISABLED='true';
  await database.pool.query(`CREATE SCHEMA "${schema}"`);
  await database.pool.end();
  Object.defineProperty(database,'pool',{value:new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`})});
  await migrate(database);await seed(database);
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(Database).useValue(database).compile();
  app=module.createNestApplication({logger:false});await app.listen(0,'127.0.0.1');base=await app.getUrl();
  const login=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'STAFF-101',pin:'1234'})});
  assert.equal(login.status,201);cookie=login.headers.get('set-cookie')!.split(';')[0];
});
after(async () => {
  if(app)await app.close();else await database.pool.end();
  const cleanup=new Pool({connectionString:process.env.DATABASE_URL});
  try {assert.match(schema,/^afyaflow_test_[a-f0-9]{32}$/);await cleanup.query(`DROP SCHEMA "${schema}" CASCADE`);} finally {await cleanup.end();}
});

test('registration → real MCP tools → human review → consistent PostgreSQL queue',async () => {
  const result=await register();const visitId=result.data.id;
  assert.equal((await workflow.queue()).queue.find(v=>v.visitId===visitId)?.approvedPriority,null);
  const proposal=await assess(visitId);assert.ok(proposal);
  assert.equal(proposal.proposal.isSufficientEvidence,true);
  assert.equal(proposal.toolTrace.toolCalls.filter(t=>t.tool!=='bedrock_converse').length,4);
  assert.equal(proposal.toolTrace.provider,'test-double');
  const approved=await decision(proposal);
  assert.equal(approved.data.serverAcknowledged,true);
  assert.equal((await workflow.queue()).queue.find(v=>v.visitId===visitId)?.approvedPriority?.code,approved.data.priority.code);
  assert.equal((await workflow.routing()).find(v=>v.id===visitId)?.approvedPriority.code,approved.data.priority.code);
});
test('parallel retries create one registration and one decision',async () => {
  const key=randomUUID();const [a,b]=await Promise.all([workflow.register(nurse,intake,key),workflow.register(nurse,intake,key)]);
  assert.equal(a.data.id,b.data.id);
  const proposal=await assess(a.data.id),decisionKey=randomUUID();
  const [d1,d2]=await Promise.all([decision(proposal,decisionKey),decision(proposal,decisionKey)]);
  assert.equal(d1.data.decisionId,d2.data.decisionId);
  assert.equal((await database.pool.query('SELECT count(*) FROM decisions WHERE visit_id=$1',[a.data.id])).rows[0].count,'1');
});
test('server rejects clerk approval and stale evidence without changing approved priority',async () => {
  const result=await register(),proposal=await assess(result.data.id);
  const body={patientId:proposal.patientId,proposalId:proposal.proposalId,observationVersion:1,decision:'APPROVED',reason:'Synthetic test review'};
  await assert.rejects(workflow.decide(clerk,body,randomUUID()),error=> (error as any).getStatus()===403);
  await workflow.observations(nurse,result.data.id,{expectedVersion:1,vitals:{...intake,heartRate:100}},randomUUID()).catch(async error => {
    // Only the vitals schema is accepted; demographics cannot be injected into an observation.
    assert.equal(error.getStatus(),400);
    const {name,age,gender,presentingComplaint,...vitals}=intake;
    await workflow.observations(nurse,result.data.id,{expectedVersion:1,vitals:{...vitals,heartRate:100}},randomUUID());
  });
  await assert.rejects(workflow.decide(nurse,body,randomUUID()),error=>(error as any).getStatus()===409);
  assert.equal((await workflow.visits()).find(v=>v.id===result.data.id)?.approvedPriority,null);
});
test('missing measurements yield staff review, never a fabricated priority',async () => {
  const result=await workflow.register(nurse,{name:'Synthetic Missing Evidence',age:29,gender:'Male',presentingComplaint:'Synthetic dizziness'},randomUUID());
  const proposal=await assess(result.data.id);
  assert.equal(proposal.proposal.priority,null);assert.equal(proposal.runStatus,'REVIEW_REQUIRED');
  await assert.rejects(decision(proposal),error=>(error as any).getStatus()===400);
});
test('routing enforces clinical permission and assessment/department versions',async () => {
  const result=await register();await decision(await assess(result.data.id));
  const visit=(await workflow.visits()).find(v=>v.id===result.data.id)!;
  const body={patientId:visit.id,departmentId:'DEP-GOPD',assessmentVersion:visit.assessmentVersion,departmentVersion:1,rationale:'Synthetic clinician confirmed transfer.'};
  await assert.rejects(workflow.transfer(clerk,body,randomUUID()),error=>(error as any).getStatus()===403);
  await assert.rejects(workflow.transfer(nurse,{...body,assessmentVersion:0},randomUUID()),error=>(error as any).getStatus()===409);
  const key=randomUUID();const a=await workflow.transfer(nurse,body,key),b=await workflow.transfer(nurse,body,key);
  assert.equal(a.data.transferId,b.data.transferId);
  assert.match((await workflow.queue()).queue.find(v=>v.visitId===visit.id)!.assignedDepartment,/General Outpatient/);
});
test('PostgreSQL transaction rollback leaves neither visit change nor audit event',async () => {
  const before=(await workflow.visits()).find(v=>v.id==='SYN-PT-8821');
  await assert.rejects(database.transaction(async db=>{await db.query("UPDATE visits SET approved_priority='RED' WHERE id='SYN-PT-8821'");throw new Error('intentional rollback');}));
  assert.deepEqual((await workflow.visits()).find(v=>v.id==='SYN-PT-8821'),before);
});
test('HTTP sessions reject anonymous access, PIN failure, locked access and logout reuse',async () => {
  assert.equal((await fetch(`${base}/api/queue`)).status,401);
  assert.equal((await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'STAFF-101',pin:'0000'})})).status,401);
  assert.equal((await fetch(`${base}/api/queue`,{headers:{Cookie:cookie}})).status,200);
  await fetch(`${base}/api/auth/lock`,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'});
  assert.equal((await fetch(`${base}/api/queue`,{headers:{Cookie:cookie}})).status,403);
  await fetch(`${base}/api/auth/unlock`,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({pin:'1234'})});
  assert.equal((await fetch(`${base}/api/queue`,{headers:{Cookie:cookie}})).status,200);
  await fetch(`${base}/api/auth/logout`,{method:'POST',headers:{Cookie:cookie}});
  assert.equal((await fetch(`${base}/api/queue`,{headers:{Cookie:cookie}})).status,401);
});
test('model failure and forbidden tool requests cannot approve a visit',async () => {
  const result=await register();
  const badModel:Model=async()=>({content:[{toolUse:{toolUseId:'bad',name:'approve_priority',input:{priority:'RED'}}}]});
  await assert.rejects(assess(result.data.id,1,badModel),/allowlist/);
  assert.equal((await workflow.visits()).find(v=>v.id===result.data.id)?.approvedPriority,null);
});
test('server accepts justified overrides only for clinical sessions',async()=>{
  const result=await register(),proposal=await assess(result.data.id);
  const body={patientId:proposal.patientId,proposalId:proposal.proposalId,observationVersion:1,
    decision:'OVERRIDDEN',overridePriority:'ORANGE',reason:'Synthetic manual review of changed findings.'};
  await assert.rejects(workflow.decide(clerk,body,randomUUID()),error=>(error as any).getStatus()===403);
  const overridden=await workflow.decide(nurse,body,randomUUID());
  assert.equal(overridden.data.priority.code,'ORANGE');
  assert.equal(overridden.data.serverAcknowledged,true);
});
test('changed protocol fingerprints prevent approval of an obsolete proposal',async()=>{
  const result=await register(),proposal=await assess(result.data.id);
  await database.pool.query("UPDATE proposals SET data=jsonb_set(data,'{protocolChecksum}','\"tampered\"') WHERE id=$1",[proposal.proposalId]);
  await assert.rejects(decision(proposal),error=>(error as any).getStatus()===409);
  assert.equal((await workflow.visits()).find(v=>v.id===result.data.id)?.approvedPriority,null);
});
test('a replaced worker lease cannot persist a proposal',async()=>{
  const result=await register();
  const run=(await database.pool.query('SELECT * FROM agent_runs WHERE visit_id=$1',[result.data.id])).rows[0];
  await database.pool.query("UPDATE agent_runs SET status='RUNNING',attempts=1,lease_until=now()+interval '5 minutes' WHERE id=$1",[run.id]);
  const tools=await createRunTools(database,run.id);
  try {
    for(const name of ['get_observations','read_protocol','score_protocol'])
      assert.equal((await tools.client.callTool({name,arguments:{}})).isError,false);
    await database.pool.query('UPDATE agent_runs SET attempts=2 WHERE id=$1',[run.id]);
    const response=await tools.client.callTool({name:'save_pending_proposal',arguments:{summary:'Stale worker output'}});
    assert.equal(response.isError,true);
    assert.equal((await database.pool.query('SELECT count(*) FROM proposals WHERE run_id=$1',[run.id])).rows[0].count,'0');
  } finally {await tools.close();}
});
test('database prevents edits to observation and audit history',async()=>{
  await assert.rejects(database.pool.query("UPDATE observations SET vitals='{}' WHERE visit_id='SYN-PT-8821'"),/append-only/);
  await assert.rejects(database.pool.query("DELETE FROM audit_events WHERE visit_id='SYN-PT-8821'"),/append-only/);
});
