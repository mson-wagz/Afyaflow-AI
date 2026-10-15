import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { performance } from 'node:perf_hooks';

// Live local-model proof in a temporary schema; never process deployed jobs.
process.env.APP_MODE='competition';process.env.AI_PROVIDER='ollama';process.env.AGENT_WORKER_DISABLED='true';
const url=new URL(process.env.DATABASE_URL || '');
if(!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('The smoke proof requires a local database.');
const {Database}=await import('../src/backend/src/database/db.js');
const {migrate}=await import('../src/backend/src/database/migrate.js');
const {seed}=await import('../src/backend/src/database/seed.js');
const {WorkflowService}=await import('../src/backend/src/modules/workflow.service.js');
const {executeAgent}=await import('../services/agents/workflow.js');
const {config}=await import('../src/backend/src/config.js');
const schema=`afyaflow_proof_${randomUUID().replaceAll('-','')}`;
const admin=new Pool({connectionString:process.env.DATABASE_URL});
const database=new Database();await database.pool.end();
await admin.query(`CREATE SCHEMA "${schema}"`);
Object.defineProperty(database,'pool',{value:new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`})});
const started=performance.now();
let proofRunId:string|undefined;
try {
  const tags=await fetch(`${config.ollamaUrl}/api/tags`).then(r=>r.json()) as any;
  const installed=tags.models?.find((m:any)=>m.name===config.ollamaModel);
  if(!installed?.digest)throw new Error('Pull the configured local model before running the proof.');
  await migrate(database);await seed(database);
  const workflow=new WorkflowService(database),staff={id:'STAFF-101',name:'Synthetic nurse',role:'nurse'};
  const result=await workflow.register(staff,{name:'Synthetic local-model proof',age:30,gender:'Female',
    presentingComplaint:'Synthetic headache',heartRate:75,systolicBp:120,respiratoryRate:16,temperature:37,avpu:'Alert',mobility:'Walking normally'},randomUUID());
  const runId=result.data.agentRunId;
  proofRunId=runId;
  await database.pool.query("UPDATE agent_runs SET status='RUNNING',attempts=1,lease_until=now()+interval '5 minutes' WHERE id=$1",[runId]);
  await executeAgent(database,runId); // Real model, LangGraph, own MCP and borrowed filesystem MCP.
  const proposal=(await workflow.pending()).find(p=>p.patientId===result.data.id);
  assert.ok(proposal,'The model must save a reviewable proposal.');
  const before=(await workflow.visits()).find(v=>v.id===result.data.id);
  assert.equal(before?.approvedPriority,null);
  await workflow.decide(staff,{patientId:result.data.id,proposalId:proposal.proposalId,observationVersion:1,
    decision:'APPROVED',reason:'Synthetic proof: nurse reviewed recorded evidence.'},randomUUID());
  assert.ok((await workflow.queue()).queue.find(v=>v.id===result.data.id)?.approvedPriority);
  let followupProof:any=null;
  if(process.env.COMPETITION_PROOF_FOLLOWUP==='true') {
    const {FollowupService}=await import('../src/backend/src/modules/followup.service.js');
    const service=new FollowupService(database);
    const approvedBefore=(await workflow.visits()).find(v=>v.id===result.data.id)!.approvedPriority;
    const vitals={heartRate:125,systolicBp:120,respiratoryRate:16,temperature:37,avpu:'Alert',mobility:'Walking normally'};
    const next=await workflow.observations(staff,result.data.id,{expectedVersion:1,vitals},randomUUID());
    proofRunId=next.data.agentRunId;
    await database.pool.query("UPDATE agent_runs SET status='RUNNING',attempts=1,lease_until=now()+interval '5 minutes' WHERE id=$1",[proofRunId]);
    await executeAgent(database,proofRunId!);
    const task=(await service.list(staff)).tasks.find(t=>t.run_id===proofRunId)!;
    assert.ok(task);assert.equal(task.status,'PROPOSED');assert.equal(task.owner_id,null);assert.equal(task.due_at,null);
    await service.act(staff,task.id,{action:'APPROVE',expectedVersion:1,ownerId:staff.id,
      dueAt:new Date(Date.now()+15*60000).toISOString(),reason:'Synthetic smoke: staff selected an example due time, not a clinical recommendation.'},randomUUID());
    await service.act(staff,task.id,{action:'ACKNOWLEDGE',expectedVersion:2},randomUUID());
    await workflow.observations(staff,result.data.id,{expectedVersion:2,vitals:{...vitals,heartRate:80}},randomUUID());
    await service.act(staff,task.id,{action:'COMPLETE',expectedVersion:3,observationVersion:3,
      reason:'Synthetic smoke: assigned owner reviewed newly recorded observations.'},randomUUID());
    assert.deepEqual((await workflow.visits()).find(v=>v.id===result.data.id)!.approvedPriority,approvedBefore);
    followupProof={status:'passed',priorityUnchanged:true,trace:await workflow.trace(proofRunId!),history:await service.history(staff,task.id)};
  }
  await assert.rejects(workflow.researchCases());await assert.rejects(workflow.researchExport());
  const report={createdAt:new Date().toISOString(),synthetic:true,provider:config.provider,model:config.model,
    modelDigest:installed.digest,elapsedMs:Math.round(performance.now()-started),humanApprovalGate:true,
    researchAccessBlocked:true,trace:await workflow.trace(runId),followupProof};
  await writeFile('.local/competition-model-proof.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:'passed',model:report.model,digest:report.modelDigest,elapsedMs:report.elapsedMs,report:'.local/competition-model-proof.json'}));
} catch(error) {
  const workflow=new WorkflowService(database);
  await writeFile('.local/competition-model-proof-failure.json',JSON.stringify({createdAt:new Date().toISOString(),
    synthetic:true,provider:config.provider,model:config.model,elapsedMs:Math.round(performance.now()-started),
    error:error instanceof Error?error.message:'Proof failed',trace:proofRunId?await workflow.trace(proofRunId):null},null,2));
  throw error;
} finally {
  await database.onModuleDestroy();
  assert.match(schema,/^afyaflow_proof_[a-f0-9]{32}$/);
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();
}
