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
import { ReportService } from '../../src/backend/src/modules/reports.service.js';
import { AppModule } from '../../src/backend/src/app.module.js';
import { executeAgent } from '../../services/agents/workflow.js';
import type { Model } from '../../services/agents/model.js';
import { config } from '../../src/backend/src/config.js';

// AI reports (shift handover, quality review) against a real PostgreSQL schema, with
// deterministic test models: no hosted inference.
const schema=`afyaflow_test_${randomUUID().replaceAll('-','')}`;
const database=new Database();
const workflow=new WorkflowService(database);
const reports=new ReportService(database);
const nurse={id:'STAFF-101',name:'Jane Mwangi, RN',role:'nurse'};
const clinician={id:'STAFF-102',name:'Dr. Kamau Otieno',role:'clinician'};
const normal={gender:'Female',presentingComplaint:'Synthetic report case',heartRate:75,systolicBp:120,diastolicBp:80,respiratoryRate:16,temperature:37,spO2:98,avpu:'Alert',mobility:'Walking normally'};
const red={...normal,heartRate:135,systolicBp:75,respiratoryRate:32,avpu:'Voice'};
let app:any,base:string;

const triageModel:Model=async messages=>{
  const step=messages.filter(m=>m.role==='assistant').length;
  const name=['get_observations','read_protocol','score_protocol','save_pending_proposal'][step];
  return {content:[{toolUse:{toolUseId:`t-${step}`,name,input:name==='save_pending_proposal'?{summary:'Synthetic test harness summary for review.'}:{}}}]};
};
// One turn gathers with several tools at once, the next saves the draft (usage reported like Bedrock).
const reportModel=(tools:string[],save:string,text:string):Model=>async messages=>{
  const round=messages.filter(m=>m.role==='assistant').length;
  const usage={inputTokens:900,outputTokens:120};
  if(round===0)return {content:tools.map((name,i)=>({toolUse:{toolUseId:`r-${i}`,name,input:{}}})),usage};
  return {content:[{toolUse:{toolUseId:'r-save',name:save,input:{text}}}],usage};
};
async function decided(name:string,vitals:object) {
  const visitId=(await workflow.register(nurse,{...vitals,name,age:40},randomUUID())).data.id;
  const run=(await database.pool.query('SELECT * FROM agent_runs WHERE visit_id=$1',[visitId])).rows[0];
  await database.pool.query("UPDATE agent_runs SET status='RUNNING',provider='test-double',lease_until=now()+interval '5 minutes' WHERE id=$1",[run.id]);
  await executeAgent(database,run.id,triageModel);
  const p=(await workflow.pending()).find(x=>x.patientId===visitId)!;
  await workflow.decide(nurse,{patientId:visitId,proposalId:p.proposalId,observationVersion:p.observationVersion,decision:'APPROVED',reason:'Synthetic clinician reviewed evidence.'},randomUUID());
  return visitId;
}
async function login(identifier:string,pin:string) {
  const r=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier,pin})});
  assert.equal(r.status,201);return r.headers.get('set-cookie')!.split(';')[0];
}

before(async()=>{
  process.env.AGENT_WORKER_DISABLED='true';
  config.agentRunsPerStaffHour=100000;config.agentRunsPerHour=100000;
  await database.pool.query(`CREATE SCHEMA "${schema}"`);
  await database.pool.end();
  Object.defineProperty(database,'pool',{value:new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`})});
  await migrate(database);await seed(database);
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(Database).useValue(database).compile();
  app=module.createNestApplication({logger:false});await app.listen(0,'127.0.0.1');base=await app.getUrl();
});
after(async()=>{
  if(app)await app.close();else await database.pool.end();
  const cleanup=new Pool({connectionString:process.env.DATABASE_URL});
  try {assert.match(schema,/^afyaflow_test_[a-f0-9]{32}$/);await cleanup.query(`DROP SCHEMA "${schema}" CASCADE`);} finally {await cleanup.end();}
});

test('the handover agent gathers through read-only tools, saves a draft, and another nurse acknowledges it',async()=>{
  const unseen=await decided('Synthetic Handover Red',red);
  const handoverTools=['get_unseen_patients','get_pending_decisions','get_rechecks','get_shift_activity'];
  const report=await reports.generate(nurse,'handover',reportModel(handoverTools,'save_handover','Handover: Synthetic Handover Red is Level 1 and unseen. No decisions pending.'));
  assert.equal(report.status,'READY');assert.equal(report.kind,'HANDOVER');
  assert.match(report.content!,/Synthetic Handover Red is Level 1/);
  assert.deepEqual(report.steps.filter(s=>!s.tool.includes('converse')).map(s=>s.tool),[...handoverTools,'save_handover']);
  assert.equal(report.usage.modelCalls,2);assert.equal(report.usage.inputTokens,1800);
  assert.ok(report.patients.some(p=>p.visitId===unseen));
  // The unseen-patients tool really returned the patient, with its level.
  const tool=(await database.pool.query("SELECT outputs FROM report_traces WHERE report_id=$1 AND tool='get_unseen_patients'",[report.id])).rows[0].outputs;
  assert.ok(tool.some((p:any)=>p.visitId===unseen && p.level===1 && p.priority==='RED'));
  // Over HTTP: clerks are refused; reading is access-logged; the preparer cannot acknowledge.
  const jane=await login('STAFF-101','123456'),clerk=await login('STAFF-103','345678'),kamau=await login('STAFF-102','234567');
  assert.equal((await fetch(`${base}/api/reports/handover/latest`,{headers:{Cookie:clerk}})).status,403);
  const latest=await (await fetch(`${base}/api/reports/handover/latest`,{headers:{Cookie:jane}})).json();
  assert.equal(latest.id,report.id);
  const logged=(await database.pool.query("SELECT patient_ids FROM access_log WHERE route='GET /api/reports/:kind/latest'")).rows;
  assert.ok(logged.some((r:any)=>r.patient_ids.includes(unseen)));
  const ack=(cookie:string)=>fetch(`${base}/api/reports/${report.id}/acknowledge`,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({note:'Received at shift change.'})});
  const self=await ack(jane);assert.equal(self.status,409);assert.equal((await self.json()).code,'SAME_STAFF');
  const done=await ack(kamau);assert.equal(done.status,201);
  const acknowledged=await done.json();
  assert.equal(acknowledged.status,'ACKNOWLEDGED');assert.equal(acknowledged.acknowledgedBy.name,'Dr. Kamau Otieno');
  // The draft text is immutable, and the steps are append-only.
  await assert.rejects(database.pool.query("UPDATE agent_reports SET content='edited' WHERE id=$1",[report.id]),/cannot be edited/);
  await assert.rejects(database.pool.query('DELETE FROM report_traces WHERE report_id=$1',[report.id]),/append-only/);
});

test('the quality review agent sees de-identified mis-triaged cases and only supervisors can run it',async()=>{
  const visitId=await decided('Synthetic Quality Green',normal);
  await workflow.recordOutcome(nurse,visitId,{disposition:'ADMITTED'},randomUUID());   // Green admitted: under-triage
  await assert.rejects(reports.generate(nurse,'quality-review',reportModel([],'save_quality_review','x'.repeat(30))),(e:any)=>e.getStatus()===403);
  const report=await reports.generate(clinician,'quality-review',reportModel(['get_triage_metrics','get_mistriage_cases'],'save_quality_review',
    'Quality review: one under-triage case; the committee may ask which signs the score did not capture.'));
  assert.equal(report.status,'READY');
  const cases=(await database.pool.query("SELECT outputs FROM report_traces WHERE report_id=$1 AND tool='get_mistriage_cases'",[report.id])).rows[0].outputs;
  const found=cases.find((c:any)=>c.visitId===visitId);
  assert.equal(found.type,'UNDER_TRIAGE');assert.equal(found.approvedLevel,'GREEN');assert.equal(found.outcome,'ADMITTED');
  assert.ok(!JSON.stringify(cases).includes('Synthetic Quality Green'));   // visit IDs only, no names
  const metrics=(await database.pool.query("SELECT outputs FROM report_traces WHERE report_id=$1 AND tool='get_triage_metrics'",[report.id])).rows[0].outputs;
  assert.ok(metrics.underTriage.cases>=1);assert.equal(metrics.knhBaseline.underTriagePercent,7.8);
});

test('a report fails safely when the agent skips saving or asks for a tool outside its allowlist',async()=>{
  const silent:Model=async()=>({content:[{text:'Here is a summary without tools.'}]});
  const failed=await reports.generate(nurse,'handover',silent);
  assert.equal(failed.status,'FAILED');assert.match(failed.error!,/without saving/);assert.equal(failed.content,null);
  const rogue:Model=async()=>({content:[{toolUse:{toolUseId:'x',name:'save_pending_proposal',input:{summary:'approve'}}}]});
  const blocked=await reports.generate(nurse,'handover',rogue);
  assert.equal(blocked.status,'FAILED');assert.match(blocked.error!,/allowlist/);
  await assert.rejects(reports.generate(nurse,'payroll',silent),/Unknown report type/);
});
