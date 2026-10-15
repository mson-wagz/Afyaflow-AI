import { Injectable, Inject, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Database, audit, id, idempotent, hash } from '../database/db.js';
import { Staff, parse, requireClinical } from '../auth/auth.js';
import { registrationSchema, observationsSchema, decisionSchema, transferSchema } from './patients/schemas.js';
import { config } from '../config.js';
import { TRIAGE_PRIORITY } from '../../../shared/contracts/triage.js';
import { sortQueueByApprovedPriority, calculateWorkloadSnapshot } from '../../../shared/contracts/queue.js';
import { generateRoutingProposal } from '../../../shared/contracts/routing.js';
import { compareObservationsForDeterioration, calculateObservationAge } from '../../../shared/contracts/deterioration.js';
import { readProtocol } from '../../../../services/mcp/tools.js';
import type { PoolClient } from 'pg';

const priority=(code:string|null):any => code ? (TRIAGE_PRIORITY as any)[code]:null;
const iso=(date:any) => date instanceof Date?date.toISOString():date;
export function requestKey(value:unknown) {
  if (typeof value !== 'string' || value.length<8 || value.length>150) throw new BadRequestException({code:'IDEMPOTENCY_KEY_REQUIRED',message:'Supply an Idempotency-Key header (8–150 characters).'});
  return value;
}
export async function enqueue(db:PoolClient,visitId:string,version:number) {
  const run=(await db.query(`INSERT INTO agent_runs(id,visit_id,observation_version,model,provider,status) VALUES($1,$2,$3,$4,$5,'QUEUED')
    ON CONFLICT(visit_id,observation_version) DO UPDATE SET status=CASE WHEN agent_runs.status='FAILED' THEN 'QUEUED' ELSE agent_runs.status END,
    error=CASE WHEN agent_runs.status='FAILED' THEN null ELSE agent_runs.error END,
    attempts=CASE WHEN agent_runs.status='FAILED' THEN 0 ELSE agent_runs.attempts END,
    delivery_generation=CASE WHEN agent_runs.status='FAILED' THEN agent_runs.delivery_generation+1 ELSE agent_runs.delivery_generation END,
    provider=CASE WHEN agent_runs.status='FAILED' THEN EXCLUDED.provider ELSE agent_runs.provider END,
    model=CASE WHEN agent_runs.status='FAILED' THEN EXCLUDED.model ELSE agent_runs.model END RETURNING *`,[id('RUN'),visitId,version,config.model,config.provider])).rows[0];
  if(run.status==='QUEUED') await db.query('INSERT INTO agent_outbox(run_id,generation) VALUES($1,$2) ON CONFLICT DO NOTHING',[run.id,run.delivery_generation]);
  return run;
}
@Injectable()
export class WorkflowService {
  constructor(@Inject(Database) readonly database:Database) {}
  async visits() {
    const rows=(await this.database.pool.query(`SELECT v.*,o.id observation_id,o.vitals,o.recorded_at FROM visits v
      JOIN observations o ON o.visit_id=v.id AND o.version=v.observation_version ORDER BY v.arrival_at`)).rows;
    return rows.map(v => ({id:v.id,visitId:v.id,name:v.name,patientName:v.name,age:v.age,gender:v.gender,
      presentingComplaint:v.complaint,arrivalTime:iso(v.arrival_at),approvedPriority:priority(v.approved_priority),
      assessmentVersion:v.assessment_version,observationVersion:v.observation_version,observationId:v.observation_id,
      assessmentStatus:v.assessment_status,assignedDepartment:v.assigned_department,
      vitals:{...v.vitals,recordedAt:iso(v.recorded_at)}}));
  }
  async register(staff:Staff,body:unknown,key:string) {
    const input=parse(registrationSchema,body);
    if (staff.role==='admin') throw new BadRequestException('Administrative accounts cannot register visits.');
    const {name,age,gender,presentingComplaint,arrivalTime,staffId:_ignored,...vitals}=input;
    if (staff.role==='clerk' && Object.values(vitals).some(v=>v!==undefined)) requireClinical(staff);
    return this.database.transaction(db => idempotent(db,staff.id,'registration',key,input,async () => {
      const visitId=id('SYN-PT'),recordedAt=new Date().toISOString();
      await db.query('INSERT INTO visits(id,name,age,gender,complaint,registered_by,arrival_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [visitId,name,age,gender,presentingComplaint,staff.id,arrivalTime || recordedAt]);
      await db.query('INSERT INTO observations(id,visit_id,version,vitals,recorded_by) VALUES($1,$2,1,$3,$4)',[id('OBS'),visitId,JSON.stringify(vitals),staff.id]);
      const run=await enqueue(db,visitId,1);
      await audit(db,staff.id,'PATIENT_REGISTERED',{observationVersion:1,runId:run.id},visitId);
      return {success:true,isDuplicate:false,data:{id:visitId,name,age,gender,presentingComplaint,
        arrivalTime:arrivalTime || recordedAt,vitals:{...vitals,recordedAt},serverConfirmedAt:recordedAt,agentRunId:run.id}};
    }));
  }
  async observations(staff:Staff,visitId:string,body:unknown,key:string) {
    requireClinical(staff);const input=parse(observationsSchema,body);
    return this.database.transaction(db => idempotent(db,staff.id,`observations:${visitId}`,key,input,async () => {
      const visit=(await db.query('SELECT * FROM visits WHERE id=$1 FOR UPDATE',[visitId])).rows[0];
      if (!visit) throw new NotFoundException('Visit not found.');
      if (visit.observation_version!==input.expectedVersion) throw new ConflictException({code:'VERSION_CONFLICT',message:'Observations changed. Reload before submitting.'});
      const version=visit.observation_version+1;
      await db.query('INSERT INTO observations(id,visit_id,version,vitals,recorded_by) VALUES($1,$2,$3,$4,$5)',[id('OBS'),visitId,version,JSON.stringify(input.vitals),staff.id]);
      await db.query("UPDATE proposals SET status='STALE' WHERE visit_id=$1 AND status='PENDING'",[visitId]);
      await db.query("UPDATE agent_runs SET status='SUPERSEDED' WHERE visit_id=$1 AND status IN ('QUEUED','WAITING_FOR_REVIEW','REVIEW_REQUIRED')",[visitId]);
      await db.query("UPDATE visits SET observation_version=$2,assessment_status='AWAITING_ASSESSMENT',updated_at=now() WHERE id=$1",[visitId,version]);
      const run=await enqueue(db,visitId,version);
      await audit(db,staff.id,'OBSERVATIONS_RECORDED',{version,runId:run.id},visitId);
      return {success:true,data:{visitId,observationVersion:version,agentRunId:run.id}};
    }));
  }
  async queue() {
    const visits=await this.visits();
    const proposals=(await this.database.pool.query("SELECT visit_id,data FROM proposals WHERE status='PENDING'")).rows;
    const queue=sortQueueByApprovedPriority(visits.map(v=>({...v,pendingProposal:proposals.find(p=>p.visit_id===v.id)?.data.proposal || null})));
    return {queue,snapshotTimestamp:new Date().toISOString(),workload:calculateWorkloadSnapshot(queue,4)};
  }
  async pending() {
    const visits=await this.visits();const protocol=await readProtocol();
    const rows=(await this.database.pool.query(`SELECT p.*,r.model,r.status run_status FROM proposals p JOIN agent_runs r ON r.id=p.run_id
      WHERE p.status='PENDING' AND r.status IN ('WAITING_FOR_REVIEW','REVIEW_REQUIRED') ORDER BY p.created_at`)).rows;
    return Promise.all(rows.map(async p => {
      const visit=visits.find(v=>v.id===p.visit_id)!;
      return {...visit,patientId:visit.id,proposalId:p.id,patientName:visit.name,observations:visit.vitals,
        observationVersion:p.observation_version,isStale:p.observation_version!==visit.observationVersion,
        proposal:p.data.proposal,protocol:p.data.protocol || protocol,summary:p.data.summary,
        toolTrace:await this.trace(p.run_id),runStatus:p.run_status};
    }));
  }
  async trace(runId:string) {
    const run=(await this.database.pool.query('SELECT * FROM agent_runs WHERE id=$1',[runId])).rows[0];
    if (!run) throw new NotFoundException('Agent run not found.');
    const calls=(await this.database.pool.query('SELECT * FROM tool_traces WHERE run_id=$1 ORDER BY timestamp,step',[runId])).rows;
    return {runId,model:run.model,provider:run.provider,status:run.status,error:run.error,
      timestamp:iso(run.created_at),toolCalls:calls.map(c=>({tool:c.tool,inputs:c.inputs,outputs:c.outputs,durationMs:c.duration_ms,timestamp:iso(c.timestamp)}))};
  }
  async runs() {return (await this.database.pool.query('SELECT id,visit_id "patientId",observation_version "observationVersion",status,provider,model,error,created_at "createdAt",finished_at "finishedAt" FROM agent_runs ORDER BY created_at DESC LIMIT 100')).rows;}
  async requestAssessment(staff:Staff,visitId:string) {
    requireClinical(staff);
    return this.database.transaction(async db => {
      const visit=(await db.query('SELECT * FROM visits WHERE id=$1 FOR UPDATE',[visitId])).rows[0];
      if (!visit) throw new NotFoundException('Visit not found.');
      const run=await enqueue(db,visitId,visit.observation_version);
      await audit(db,staff.id,'ASSESSMENT_REQUESTED',{runId:run.id},visitId);
      return {success:true,data:{runId:run.id,status:run.status}};
    });
  }
  async decide(staff:Staff,body:unknown,key:string) {
    requireClinical(staff);const input=parse(decisionSchema,body);
    const currentProtocolChecksum=hash(JSON.stringify(await readProtocol()));
    return this.database.transaction(db => idempotent(db,staff.id,'triage-decision',key,input,async () => {
      const visit=(await db.query('SELECT * FROM visits WHERE id=$1 FOR UPDATE',[input.patientId])).rows[0];
      const proposal=(await db.query('SELECT p.*,r.status run_status FROM proposals p JOIN agent_runs r ON r.id=p.run_id WHERE p.id=$1 FOR UPDATE OF p',[input.proposalId])).rows[0];
      if (!visit || !proposal || proposal.visit_id!==visit.id) throw new NotFoundException('Proposal not found.');
      if (proposal.status!=='PENDING' || !['WAITING_FOR_REVIEW','REVIEW_REQUIRED'].includes(proposal.run_status)) throw new ConflictException({code:'PROPOSAL_NOT_PENDING',message:'This proposal has already been decided or is not ready.'});
      if (proposal.observation_version!==visit.observation_version || input.observationVersion!==visit.observation_version)
        throw new ConflictException({code:'STALE_PROPOSAL',message:'Observations changed. Request a new assessment.'});
      if(proposal.data.protocolChecksum!==currentProtocolChecksum)
        throw new ConflictException({code:'STALE_PROTOCOL',message:'Protocol resource changed. Request a new assessment.'});
      if (input.decision==='APPROVED' && !proposal.data.proposal?.isSufficientEvidence) throw new BadRequestException({code:'INSUFFICIENT_EVIDENCE',message:'Record missing observations or use a justified manual override.'});
      if (input.decision==='OVERRIDDEN' && !input.overridePriority) throw new BadRequestException('Override priority is required.');
      const code=input.decision==='REJECTED'?visit.approved_priority:input.decision==='OVERRIDDEN'?input.overridePriority:proposal.data.proposal.priority.code;
      const record={decisionId:id('DEC'),patientId:visit.id,patientName:visit.name,decision:input.decision,priority:priority(code),reason:input.reason,
        clinicianId:staff.id,clinicianName:staff.name,clinicianRole:staff.role,timestamp:new Date().toISOString(),
        protocolReference:proposal.data.protocol.id,toolTraceId:proposal.run_id,serverAcknowledged:true};
      await db.query('INSERT INTO decisions(id,proposal_id,visit_id,staff_id,decision,priority,reason,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [record.decisionId,proposal.id,visit.id,staff.id,input.decision,code,input.reason,JSON.stringify(record)]);
      await db.query("UPDATE proposals SET status='DECIDED' WHERE id=$1",[proposal.id]);
      await db.query("UPDATE agent_runs SET status='DECIDED' WHERE id=$1",[proposal.run_id]);
      await db.query('UPDATE visits SET approved_priority=$2,assessment_status=$3,assessment_version=assessment_version+1,updated_at=now() WHERE id=$1',
        [visit.id,code,input.decision==='REJECTED'?'REJECTED_REQUIRES_REASSESSMENT':'APPROVED']);
      await audit(db,staff.id,'CLINICAL_DECISION_COMMITTED',{decisionId:record.decisionId,proposalId:proposal.id,reason:input.reason},visit.id);
      return {success:true,data:record};
    }));
  }
  async decisions() {return (await this.database.pool.query('SELECT data FROM decisions ORDER BY timestamp DESC')).rows.map(r=>r.data);}
  async departments() {return (await this.database.pool.query('SELECT * FROM departments ORDER BY id')).rows.map(r=>({...r.data,version:r.version,updatedAt:iso(r.updated_at)}));}
  async routing() {
    const departments=await this.departments();
    return (await this.visits()).filter(v=>v.approvedPriority).map(v=>({...v,currentLocation:v.assignedDepartment,
      proposal:generateRoutingProposal(v,v.approvedPriority,departments)}));
  }
  async transfer(staff:Staff,body:unknown,key:string) {
    requireClinical(staff);const input=parse(transferSchema,body);
    return this.database.transaction(db => idempotent(db,staff.id,'transfer',key,input,async () => {
      const visit=(await db.query('SELECT * FROM visits WHERE id=$1 FOR UPDATE',[input.patientId])).rows[0];
      const department=(await db.query('SELECT * FROM departments WHERE id=$1 FOR UPDATE',[input.departmentId])).rows[0];
      if (!visit || !department) throw new NotFoundException('Visit or department not found.');
      if (!visit.approved_priority || visit.assessment_version!==input.assessmentVersion || department.version!==input.departmentVersion)
        throw new ConflictException({code:'STALE_ROUTE',message:'Approved assessment or department availability changed. Refresh routing.'});
      if (department.data.status==='CLOSED' || department.data.occupiedBeds>=department.data.totalBeds)
        throw new ConflictException({code:'DEPARTMENT_UNAVAILABLE',message:'No available capacity. Escalate for manual routing; urgency is unchanged.'});
      const record={transferId:id('TRF'),patientId:visit.id,patientName:visit.name,department:department.data.name,
        approvedPriority:priority(visit.approved_priority),clinicianName:staff.name,timestamp:new Date().toISOString(),rationale:input.rationale,serverAcknowledged:true};
      await db.query('INSERT INTO transfers(id,visit_id,staff_id,department_id,data) VALUES($1,$2,$3,$4,$5)',[record.transferId,visit.id,staff.id,department.id,JSON.stringify(record)]);
      await db.query('UPDATE visits SET department_id=$2,assigned_department=$3,updated_at=now() WHERE id=$1',[visit.id,department.id,department.data.name]);
      await audit(db,staff.id,'DEPARTMENT_TRANSFERRED',{transferId:record.transferId,departmentId:department.id},visit.id);
      return {success:true,data:record};
    }));
  }
  async deterioration() {
    return Promise.all((await this.visits()).map(async visit => {
      const observations=(await this.database.pool.query('SELECT * FROM observations WHERE visit_id=$1 ORDER BY version DESC LIMIT 2',[visit.id])).rows;
      const latest={...observations[0].vitals,id:observations[0].id,recordedAt:iso(observations[0].recorded_at)};
      const baseline=observations[1]?{...observations[1].vitals,id:observations[1].id,recordedAt:iso(observations[1].recorded_at)}:latest;
      return {patientId:visit.id,patientName:visit.name,age:visit.age,gender:visit.gender,currentApprovedPriority:visit.approvedPriority,
        assignedDepartment:visit.assignedDepartment,baselineObservation:baseline,latestObservation:observations[1]?latest:null,
        observationVersion:visit.observationVersion,comparison:observations[1]?compareObservationsForDeterioration(baseline,latest):null,
        ageInfo:calculateObservationAge(latest.recordedAt),status:visit.assessmentStatus};
    }));
  }
  async reassess(staff:Staff,body:unknown,key:string) {
    requireClinical(staff);const input=parse(z.object({patientId:z.string(),observationVersion:z.number().int(),action:z.enum(['ESCALATE','DISMISS']),
      reason:z.string().trim().min(5),targetPriority:z.enum(['RED','ORANGE','YELLOW','GREEN']).nullable().optional()}).strict(),body);
    return this.database.transaction(db => idempotent(db,staff.id,'reassessment',key,input,async () => {
      const visit=(await db.query('SELECT * FROM visits WHERE id=$1 FOR UPDATE',[input.patientId])).rows[0];
      if (!visit) throw new NotFoundException('Visit not found.');
      if (visit.observation_version!==input.observationVersion) throw new ConflictException('Observation version changed.');
      if (input.action==='ESCALATE' && !input.targetPriority) throw new BadRequestException('A manual escalation priority is required.');
      const code=input.action==='ESCALATE'?input.targetPriority:visit.approved_priority;
      if (input.action==='ESCALATE') {
        await db.query("UPDATE visits SET approved_priority=$2,assessment_version=assessment_version+1,assessment_status='APPROVED',updated_at=now() WHERE id=$1",[visit.id,code]);
        await db.query("UPDATE proposals SET status='STALE' WHERE visit_id=$1 AND status='PENDING'",[visit.id]);
      }
      await audit(db,staff.id,'REASSESSMENT_'+input.action,{reason:input.reason,newPriority:code,observationVersion:input.observationVersion},visit.id);
      return {success:true,data:{patientId:visit.id,patientName:visit.name,action:input.action,reason:input.reason,newPriority:priority(code),clinicianName:staff.name,timestamp:new Date().toISOString(),serverAcknowledged:true}};
    }));
  }
  async audit(staff:Staff) {
    const rows=(await this.database.pool.query(`SELECT a.*,s.profile->>'name' staff_name FROM audit_events a LEFT JOIN staff s ON s.id=a.staff_id
      WHERE a.staff_id=$1 OR $2 ORDER BY timestamp DESC LIMIT 200`,[staff.id,['admin','clinician','doctor'].includes(staff.role)])).rows;
    return rows.map(r=>({id:r.id,timestamp:iso(r.timestamp),staffId:r.staff_id,staffName:r.staff_name,eventType:r.event_type,details:JSON.stringify(r.details)}));
  }
}
