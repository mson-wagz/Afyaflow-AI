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
import { importMimicDemo } from '../../src/backend/src/database/import-mimic.js';
import { openaiModel } from '../../services/agents/openai.js';
import type { Model } from '../../services/agents/bedrock.js';
import { createRunTools } from '../../services/mcp/tools.js';
import { processAgentJob, dispatchAgentOutbox, ActiveAgentLeaseError } from '../../src/backend/src/modules/agent-jobs.js';
import { allowAuthAttempt } from '../../src/backend/src/auth/rate-limit.js';
import { configureApi } from '../../src/backend/src/lambda/api.js';
import type { Context, APIGatewayProxyEventV2 } from 'aws-lambda';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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

async function loginAs(identifier:string,pin:string) {
  const response=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier,pin})});
  assert.equal(response.status,201);
  return response.headers.get('set-cookie')!.split(';')[0];
}
async function post(path:string,session:string,body:unknown,key=randomUUID()) {
  return fetch(`${base}/api${path}`,{method:'POST',headers:{Cookie:session,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
}
async function get(path:string,session:string) {
  const response=await fetch(`${base}/api${path}`,{headers:{Cookie:session}});
  assert.equal(response.status,200);
  return response.json();
}

test('HTTP journey connects registration, MCP evidence, clinician approval, routing and audit',async()=>{
  const session=await loginAs('STAFF-102','2345');
  const key=randomUUID();
  const response=await post('/visits',session,intake,key);
  assert.equal(response.status,201);
  const registered=await response.json(),visitId=registered.data.id;
  const repeated=await post('/visits',session,intake,key);
  assert.equal(repeated.status,201);
  assert.equal((await repeated.json()).data.id,visitId);
  assert.equal((await get('/queue',session)).queue.find((v:any)=>v.visitId===visitId).approvedPriority,null);
  await assess(visitId);
  const proposal=(await get('/triage/proposals',session)).find((p:any)=>p.patientId===visitId);
  assert.ok(proposal.toolTrace.toolCalls.some((call:any)=>call.tool==='score_protocol'));
  const reviewed=await post('/triage/decisions',session,{
    patientId:visitId,proposalId:proposal.proposalId,observationVersion:proposal.observationVersion,
    decision:'APPROVED',reason:'Synthetic evidence reviewed through HTTP.',
  });
  assert.equal(reviewed.status,201);
  const approved=await reviewed.json();
  const candidate=(await get('/routing/candidates',session)).find((v:any)=>v.id===visitId);
  const departments=await get('/departments',session);
  const department=departments.find((d:any)=>d.id==='DEP-GOPD');
  const transfer=await post('/routing/transfers',session,{
    patientId:visitId,departmentId:department.id,assessmentVersion:candidate.assessmentVersion,
    departmentVersion:department.version,rationale:'Synthetic department review through HTTP.',
  });
  assert.equal(transfer.status,201);
  const transferred=await transfer.json();
  const queued=(await get('/queue',session)).queue.find((v:any)=>v.visitId===visitId);
  assert.equal(queued.approvedPriority.code,approved.data.priority.code);
  assert.match(queued.assignedDepartment,/General Outpatient/);
  assert.equal((await get('/triage/proposals',session)).some((p:any)=>p.patientId===visitId),false);
  const audit=await get('/audit',session);
  for(const [eventType,reference] of [
    ['PATIENT_REGISTERED',registered.data.agentRunId],
    ['CLINICAL_DECISION_COMMITTED',approved.data.decisionId],
    ['DEPARTMENT_TRANSFERRED',transferred.data.transferId],
  ]) assert.ok(audit.some((event:any)=>event.eventType===eventType && event.details.includes(reference)));
});

test('HTTP rejects missing retry headers and conflicting retries without duplicate visits',async()=>{
  const session=await loginAs('STAFF-101','1234');
  const before=(await get('/visits',session)).length;
  const missing=await fetch(`${base}/api/visits`,{method:'POST',headers:{Cookie:session,'Content-Type':'application/json'},body:JSON.stringify(intake)});
  assert.equal(missing.status,400);
  assert.equal((await missing.json()).code,'IDEMPOTENCY_KEY_REQUIRED');
  const key=randomUUID();
  assert.equal((await post('/visits',session,intake,key)).status,201);
  const conflict=await post('/visits',session,{...intake,name:'Different Synthetic Patient'},key);
  assert.equal(conflict.status,409);
  assert.equal((await conflict.json()).code,'IDEMPOTENCY_CONFLICT');
  assert.equal((await get('/visits',session)).length,before+1);
});

test('HTTP observation updates invalidate evidence and ignore forged clinical identity',async()=>{
  const session=await loginAs('STAFF-101','1234'),clerkSession=await loginAs('STAFF-103','3456');
  const response=await post('/visits',session,intake);
  assert.equal(response.status,201);
  const visitId=(await response.json()).data.id,proposal=await assess(visitId);
  const body={patientId:visitId,proposalId:proposal.proposalId,observationVersion:1,
    decision:'OVERRIDDEN',overridePriority:'ORANGE',reason:'Synthetic HTTP override.'};
  // An extra header cannot change the role from the authenticated cookie.
  const denied=await fetch(`${base}/api/triage/decisions`,{method:'POST',headers:{Cookie:clerkSession,
    'Content-Type':'application/json','Idempotency-Key':randomUUID(),'X-Staff-Id':'STAFF-101'},body:JSON.stringify(body)});
  assert.equal(denied.status,403);
  assert.equal((await denied.json()).code,'PERMISSION_DENIED');
  const changed=await post(`/visits/${visitId}/observations`,session,{expectedVersion:1,vitals:{heartRate:100}});
  assert.equal(changed.status,201);
  assert.equal((await changed.json()).data.observationVersion,2);
  assert.equal((await post('/triage/decisions',session,body)).status,409);
  assert.equal((await post(`/visits/${visitId}/observations`,session,{expectedVersion:1,vitals:{heartRate:101}})).status,409);
  const visit=(await get('/visits',session)).find((v:any)=>v.id===visitId);
  assert.equal(visit.approvedPriority,null);
  assert.equal(visit.observationVersion,2);
  assert.equal((await database.pool.query('SELECT count(*) FROM decisions WHERE visit_id=$1',[visitId])).rows[0].count,'0');
});

async function jobFor(visitId:string) {
  const run=(await database.pool.query('SELECT * FROM agent_runs WHERE visit_id=$1 ORDER BY observation_version DESC',[visitId])).rows[0];
  return {runId:run.id,generation:run.delivery_generation};
}
const executeTestAgent=(db:Database,runId:string)=>executeAgent(db,runId,fakeModel);

test('outbox delivery survives ambiguous queue failure and only marks committed sends',async()=>{
  // These mutations affect only this isolated test schema.
  await database.pool.query('UPDATE agent_outbox SET sent_at=now()');
  const result=await register(),job=await jobFor(result.data.id),sent:any[]=[];
  await assert.rejects(dispatchAgentOutbox(database,async message=>{sent.push(message);throw new Error('Queue acknowledgement lost');}));
  assert.equal((await database.pool.query('SELECT sent_at FROM agent_outbox WHERE run_id=$1',[job.runId])).rows[0].sent_at,null);
  assert.equal(await dispatchAgentOutbox(database,async message=>{sent.push(message);}),1);
  assert.deepEqual(sent,[job,job]);
  assert.equal(await dispatchAgentOutbox(database,async()=>{throw new Error('Already dispatched');}),0);
});

test('registration and its delivery record roll back together',async()=>{
  const {enqueue}=await import('../../src/backend/src/modules/workflow.service.js');
  const result=await register();
  await assert.rejects(database.transaction(async db=>{
    await db.query('INSERT INTO observations(id,visit_id,version,vitals,recorded_by) VALUES($1,$2,99,$3,$4)',[randomUUID(),result.data.id,'{}',nurse.id]);
    await enqueue(db,result.data.id,99);
    throw new Error('Rollback the queued assessment');
  }));
  assert.equal((await database.pool.query('SELECT count(*) FROM agent_runs WHERE visit_id=$1 AND observation_version=99',[result.data.id])).rows[0].count,'0');
  assert.equal((await database.pool.query('SELECT count(*) FROM agent_outbox o LEFT JOIN agent_runs r ON r.id=o.run_id WHERE r.id IS NULL')).rows[0].count,'0');
});

test('duplicate queue deliveries execute one assessment and keep it pending human approval',async()=>{
  const result=await register(),job=await jobFor(result.data.id);let calls=0;
  const execute=async(db:Database,runId:string)=>{calls++;await executeTestAgent(db,runId);};
  await processAgentJob(database,job,execute);
  await processAgentJob(database,job,execute);
  assert.equal(calls,1);
  assert.equal((await database.pool.query('SELECT count(*) FROM proposals WHERE run_id=$1',[job.runId])).rows[0].count,'1');
  assert.equal((await workflow.visits()).find(v=>v.id===result.data.id)!.approvedPriority,null);
});

test('active leases retry delivery while expired leases allow worker recovery',async()=>{
  const result=await register(),job=await jobFor(result.data.id);
  await database.pool.query("UPDATE agent_runs SET status='RUNNING',attempts=1,lease_until=now()+interval '5 minutes' WHERE id=$1",[job.runId]);
  await assert.rejects(processAgentJob(database,job,executeTestAgent),ActiveAgentLeaseError);
  await database.pool.query("UPDATE agent_runs SET lease_until=now()-interval '1 minute' WHERE id=$1",[job.runId]);
  await processAgentJob(database,job,executeTestAgent);
  const row=(await database.pool.query('SELECT * FROM agent_runs WHERE id=$1',[job.runId])).rows[0];
  assert.equal(row.status,'WAITING_FOR_REVIEW');
  assert.equal(row.attempts,2);
});

test('a saved proposal survives an interrupted final acknowledgement without another model call',async()=>{
  const result=await register(),job=await jobFor(result.data.id);
  await processAgentJob(database,job,executeTestAgent);
  await database.pool.query("UPDATE agent_runs SET status='RUNNING',lease_until=now()-interval '1 minute' WHERE id=$1",[job.runId]);
  await processAgentJob(database,job,async()=>{throw new Error('Must not rerun a saved proposal');});
  assert.equal((await database.pool.query('SELECT status FROM agent_runs WHERE id=$1',[job.runId])).rows[0].status,'WAITING_FOR_REVIEW');
});

test('failed assessments require staff review and explicit retries reject old deliveries',async()=>{
  const result=await register(),oldJob=await jobFor(result.data.id);
  await processAgentJob(database,oldJob,async()=>{throw new Error('Private synthetic complaint must not appear in operational errors');});
  const row=(await database.pool.query('SELECT * FROM agent_runs WHERE id=$1',[oldJob.runId])).rows[0];
  assert.equal(row.status,'FAILED');
  assert.doesNotMatch(row.error,/Private synthetic/);
  assert.equal((await workflow.visits()).find(v=>v.id===result.data.id)!.assessmentStatus,'REVIEW_REQUIRED');
  await workflow.requestAssessment(nurse,result.data.id);
  const newJob=await jobFor(result.data.id);
  assert.equal(newJob.generation,oldJob.generation+1);
  await processAgentJob(database,oldJob,async()=>{assert.fail('Old delivery must be ignored');});
  assert.equal((await database.pool.query('SELECT status FROM agent_runs WHERE id=$1',[oldJob.runId])).rows[0].status,'QUEUED');
  await processAgentJob(database,newJob,executeTestAgent);
});

test('shared auth throttling is atomic and permits a new window after expiry',async()=>{
  const source=randomUUID();
  const results=await Promise.all(Array.from({length:25},()=>allowAuthAttempt(database,source)));
  assert.equal(results.filter(Boolean).length,20);
  const {hash}=await import('../../src/backend/src/database/db.js');
  await database.pool.query("UPDATE auth_rate_limits SET expires_at=now()-interval '1 second' WHERE key_hash=$1",[hash(source)]);
  assert.equal(await allowAuthAttempt(database,source),true);
});

test('worker recovery is bounded after repeated hard interruptions',async()=>{
  const result=await register(),job=await jobFor(result.data.id);
  await database.pool.query("UPDATE agent_runs SET status='RUNNING',attempts=2,lease_until=now()-interval '1 minute' WHERE id=$1",[job.runId]);
  await processAgentJob(database,job,async()=>assert.fail('Exhausted worker must require review'));
  assert.equal((await database.pool.query('SELECT status FROM agent_runs WHERE id=$1',[job.runId])).rows[0].status,'FAILED');
  assert.equal((await workflow.visits()).find(v=>v.id===result.data.id)!.approvedPriority,null);
});

test('MCP proposal saving fences old retry generations even when attempt numbers match',async()=>{
  const result=await register(),job=await jobFor(result.data.id);
  await database.pool.query("UPDATE agent_runs SET status='RUNNING',attempts=1,lease_until=now()+interval '5 minutes' WHERE id=$1",[job.runId]);
  const tools=await createRunTools(database,job.runId);
  try {
    for(const name of ['get_observations','read_protocol','score_protocol'])
      assert.equal((await tools.client.callTool({name,arguments:{}})).isError,false);
    await database.pool.query('UPDATE agent_runs SET delivery_generation=delivery_generation+1 WHERE id=$1',[job.runId]);
    assert.equal((await tools.client.callTool({name:'save_pending_proposal',arguments:{summary:'Old delivery generation'}})).isError,true);
    assert.equal((await database.pool.query('SELECT count(*) FROM proposals WHERE run_id=$1',[job.runId])).rows[0].count,'0');
  } finally {await tools.close();}
});

test('API Gateway v2 adapter preserves session cookies, JSON bodies and clinical routes',async()=>{
  const adapter=configureApi(app.getHttpAdapter().getInstance());
  function event(path:string,method='GET',body?:unknown,cookies?:string[]):APIGatewayProxyEventV2 {
    return {version:'2.0',routeKey:'ANY /api/{proxy+}',rawPath:path,rawQueryString:'',
      headers:{host:'api.example.test','content-type':'application/json'},cookies,
      requestContext:{accountId:'test',apiId:'test',domainName:'api.example.test',domainPrefix:'api',requestId:randomUUID(),
        routeKey:'ANY /api/{proxy+}',stage:'$default',time:'',timeEpoch:Date.now(),
        http:{method,path,protocol:'HTTP/1.1',sourceIp:'192.0.2.10',userAgent:'test'}},
      body:body===undefined?undefined:JSON.stringify(body),isBase64Encoded:false};
  }
  const context={callbackWaitsForEmptyEventLoop:false,getRemainingTimeInMillis:()=>30000} as Context;
  const login:any=await adapter(event('/api/auth/login','POST',{identifier:'STAFF-101',pin:'1234'}),context,()=>{});
  assert.equal(login.statusCode,201);
  assert.match(login.cookies[0],/HttpOnly/i);
  const cookies=[login.cookies[0].split(';')[0]];
  const queue:any=await adapter(event('/api/queue','GET',undefined,cookies),context,()=>{});
  assert.equal(queue.statusCode,200);
  assert.ok(Array.isArray(JSON.parse(queue.body).queue));
  const anonymous:any=await adapter(event('/api/queue'),context,()=>{});
  assert.equal(anonymous.statusCode,401);
  const logout:any=await adapter(event('/api/auth/logout','POST',undefined,cookies),context,()=>{});
  assert.equal(logout.statusCode,201);
  assert.ok(logout.cookies.some((value:string)=>value.includes('afyaflow_session=;')));
  const reused:any=await adapter(event('/api/queue','GET',undefined,cookies),context,()=>{});
  assert.equal(reused.statusCode,401);
});

test('actual Lambda handler bootstraps NestJS and enforces origin protection against the test database',async()=>{
  const connection=new URL(process.env.DATABASE_URL!);
  connection.searchParams.set('options',`-c search_path=${schema}`);
  const script=`
    import assert from 'node:assert/strict';
    import {handler} from './src/backend/src/lambda/api.ts';
    const context={callbackWaitsForEmptyEventLoop:true,getRemainingTimeInMillis:()=>30000};
    const token=process.env.CLOUDFRONT_ORIGIN_TOKEN;
    function event(path,method='GET',body,extra={}) {
      return {version:'2.0',routeKey:'ANY /api/{proxy+}',rawPath:path,rawQueryString:'',
        headers:{host:'api.example.test','content-type':'application/json','x-afyaflow-origin-token':token,
          'cloudfront-viewer-address':'192.0.2.80:12345',...extra},
        requestContext:{http:{method,path,protocol:'HTTP/1.1',sourceIp:'192.0.2.90',userAgent:'test'},
          stage:'$default',requestId:'lambda-test'},
        body:body===undefined?undefined:JSON.stringify(body),isBase64Encoded:false};
    }
    assert.equal((await handler(event('/api/health'),context)).statusCode,200);
    assert.equal(context.callbackWaitsForEmptyEventLoop,false);
    assert.equal((await handler(event('/api/health','GET',undefined,{'x-afyaflow-origin-token':'forged'}),context)).statusCode,403);
    const credentials={identifier:'STAFF-101',pin:'1234'};
    assert.equal((await handler(event('/api/auth/login','POST',credentials,{origin:'https://untrusted.example.test'}),context)).statusCode,403);
    const login=await handler(event('/api/auth/login','POST',credentials,{origin:'https://app.example.test'}),context);
    assert.equal(login.statusCode,201);
    assert.match(login.cookies[0],/Secure/);
    const request=event('/api/queue');request.cookies=[login.cookies[0].split(';')[0]];
    assert.equal((await handler(request,context)).statusCode,200);
    console.log('lambda-handler-ok');
  `;
  const result=await promisify(execFile)(process.execPath,['--import','tsx','--input-type=module','-e',script],{
    env:{...process.env,DATABASE_URL:connection.toString(),DATABASE_SSL:'false',DATABASE_SECRET_ARN:'',
      AWS_LAMBDA_FUNCTION_NAME:'afyaflow-test',NODE_ENV:'production',APP_ORIGIN:'https://app.example.test',
      CLOUDFRONT_ORIGIN_TOKEN:'test-only-token-1234567890abcdefghijkl',REQUIRE_CLOUDFRONT_ORIGIN:'true'},
    timeout:15000,
  });
  assert.match(result.stdout,/lambda-handler-ok/);
});


test('OpenAI Responses adapter drives real MCP tools and preserves the human approval gate',async()=>{
  const registered=await register(),visitId=registered.data.id;
  const run=(await database.pool.query('SELECT * FROM agent_runs WHERE visit_id=$1',[visitId])).rows[0];
  await database.pool.query("UPDATE agent_runs SET status='RUNNING',provider='openai',model='mock-openai',lease_until=now()+interval '5 minutes' WHERE id=$1",[run.id]);
  let step=0;
  const model=openaiModel('mock-openai',{apiKey:'test-key',fetch:async(_url,init)=>{
    const body=JSON.parse(init?.body as string);
    assert.equal(body.model,'mock-openai');
    const name=['get_observations','read_protocol','score_protocol','save_pending_proposal'][step++];
    assert.ok(body.tools.some((tool:any)=>tool.name===name && tool.strict));
    return Response.json({status:'completed',output:[{type:'function_call',call_id:`openai-${step}`,name,
      arguments:JSON.stringify(name==='save_pending_proposal'?{summary:'Synthetic evidence recorded; clinician review required.'}:{})}]});
  }});
  await executeAgent(database,run.id,model);
  const proposal=(await workflow.pending()).find(p=>p.patientId===visitId)!;
  assert.ok(proposal);assert.equal(step,4);
  assert.equal(proposal.toolTrace.provider,'openai');assert.equal(proposal.toolTrace.model,'mock-openai');
  assert.equal(proposal.toolTrace.toolCalls.filter(t=>t.tool==='openai_responses').length,4);
  assert.equal((await workflow.queue()).queue.find(v=>v.visitId===visitId)?.approvedPriority,null);
  assert.equal((await database.pool.query('SELECT count(*) FROM decisions WHERE visit_id=$1',[visitId])).rows[0].count,'0');
});


test('Historical import is repeatable, source-labelled, isolated and read-only through API and database',async()=>{
  const login=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'STAFF-102',pin:'2345'})});
  assert.equal(login.status,201);const researchCookie=login.headers.get('set-cookie')!.split(';')[0];
  const beforeQueue=(await workflow.queue()).queue.length;
  const first=await importMimicDemo(database),second=await importMimicDemo(database);
  assert.equal(first.inserted,222);assert.equal(second.inserted,0);assert.equal(first.subjects,64);
  assert.equal((await workflow.queue()).queue.length,beforeQueue);
  const library=await workflow.researchCases();assert.equal(library.total,222);assert.equal(library.subjects,64);
  const caseId=library.cases[0].id;
  const source=await workflow.researchCase(caseId);
  assert.equal(source.age,null);assert.equal(source.run,null);assert.equal(source.researchOnly,true);
  assert.equal(source.vitals.avpu,undefined);assert.equal(source.source.dataset,'mimic-iv-ed-demo');
  assert.ok(!(await workflow.visits()).some(item=>item.id===caseId));
  assert.equal((await fetch(`${base}/api/research/cases`)).status,401);
  assert.equal((await fetch(`${base}/api/research/cases`,{headers:{Cookie:researchCookie}})).status,200);
  await assert.rejects(workflow.requestAssessment(clerk,caseId),error=>(error as any).getStatus()===403);
  const requested=await workflow.requestAssessment(nurse,caseId);
  await database.pool.query("UPDATE agent_runs SET status='RUNNING',lease_until=now()+interval '5 minutes' WHERE id=$1",[requested.data.runId]);
  await executeAgent(database,requested.data.runId,fakeModel);
  const reviewed=await workflow.researchCase(caseId);
  assert.equal(reviewed.run.status,'REVIEW_REQUIRED');assert.equal(reviewed.proposal.proposal.priority,null);
  assert.equal(reviewed.proposal.proposal.score,null);assert.ok(reviewed.proposal.proposal.missingEvidence.includes('age'));
  const evidence=reviewed.trace.toolCalls.find(call=>call.tool==='get_observations')!.outputs;
  assert.equal(evidence.age,null);assert.equal(evidence.researchOnly,true);
  for(const key of ['sourceAcuity','sourcePain','raw','subjectId','stayId','disposition'])assert.equal(evidence[key],undefined);
  assert.ok(!(await workflow.pending()).some(item=>item.patientId===caseId));
  assert.ok(!(await workflow.runs()).some(item=>item.patientId===caseId));
  assert.ok(!(await workflow.routing()).some(item=>item.id===caseId));
  assert.ok(!(await workflow.deterioration()).some(item=>item.patientId===caseId));
  const mutationCases=[
    [`/visits/${caseId}/observations`,{vitals:{heartRate:90},expectedVersion:1}],
    ['/triage/decisions',{patientId:caseId,proposalId:reviewed.proposal.id,observationVersion:1,decision:'OVERRIDDEN',overridePriority:'RED',reason:'Research override must be rejected.'}],
    ['/deterioration/decisions',{patientId:caseId,observationVersion:1,action:'ESCALATE',targetPriority:'RED',reason:'Research escalation must be rejected.'}],
    ['/routing/transfers',{patientId:caseId,departmentId:'DEP-GOPD',assessmentVersion:0,departmentVersion:1,rationale:'Research transfer must be rejected.'}],
  ] as const;
  for(const [path,body] of mutationCases) {
    const response=await fetch(`${base}/api${path}`,{method:'POST',headers:{Cookie:researchCookie,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify(body)});
    assert.equal(response.status,400);assert.equal((await response.json()).code,'HISTORICAL_READ_ONLY');
  }
  await assert.rejects(database.pool.query("UPDATE visits SET approved_priority='RED' WHERE id=$1",[caseId]),/research_not_clinical/);
  await assert.rejects(database.pool.query("UPDATE visits SET source_data='{}' WHERE id=$1",[caseId]),/read-only/);
  const downloaded=await fetch(`${base}/api/research/export`,{headers:{Cookie:researchCookie}});
  assert.equal(downloaded.status,200);assert.match(downloaded.headers.get('content-disposition') || '',/attachment/);
  assert.equal((await downloaded.json()).cases.length,222);
  const exported=await workflow.researchExport();assert.equal(exported.cases.length,222);
  assert.ok(exported.cases.every(item=>item.id.startsWith('MIMIC-ED-')));
  assert.equal(exported.metadata.version,'2.2');assert.ok(exported.cases[0].source.raw.triage);
  assert.equal((await workflow.queue()).queue.length,beforeQueue);
  assert.equal((await importMimicDemo(database)).inserted,0);
  assert.equal((await workflow.researchCase(caseId)).run.id,requested.data.runId);
});
