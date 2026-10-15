import {Injectable,Inject,BadRequestException,ConflictException,NotFoundException,ForbiddenException} from '@nestjs/common';
import {z} from 'zod';
import {Database,audit,idempotent,hash} from '../database/db.js';
import {Staff,requireClinical,parse} from '../auth/auth.js';
import {readProtocol} from '../../../../services/mcp/tools.js';
import {REASSESSMENT_POLICY_VERSION} from '../../../shared/contracts/deterioration.js';

const actionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('APPROVE'),expectedVersion:z.number().int().positive(),ownerId:z.string().min(1),dueAt:z.iso.datetime(),reason:z.string().trim().min(5).max(2000)}).strict(),
  z.object({action:z.literal('ACKNOWLEDGE'),expectedVersion:z.number().int().positive()}).strict(),
  z.object({action:z.literal('COMPLETE'),expectedVersion:z.number().int().positive(),observationVersion:z.number().int().positive(),reason:z.string().trim().min(5).max(2000)}).strict(),
  z.object({action:z.literal('REASSIGN'),expectedVersion:z.number().int().positive(),ownerId:z.string().min(1),reason:z.string().trim().min(5).max(2000)}).strict(),
  z.object({action:z.literal('CANCEL'),expectedVersion:z.number().int().positive(),reason:z.string().trim().min(5).max(2000)}).strict(),
]);
@Injectable()
export class FollowupService {
  constructor(@Inject(Database) readonly database:Database) {}
  // An isolated replay instance can supply scenario time. Worker leases always use real time.
  now=()=>new Date();
  async staff(staff:Staff) {
    requireClinical(staff);
    return (await this.database.pool.query("SELECT id,profile->>'name' name,role FROM staff WHERE role IN ('nurse','clinician','doctor') ORDER BY id")).rows;
  }
  async list(staff:Staff) {
    requireClinical(staff);const now=this.now().getTime();
    const rows=(await this.database.pool.query(`SELECT f.*,v.name patient_name,v.observation_version latest_version,
      o.id latest_observation_id,o.vitals latest_vitals,o.recorded_at latest_recorded_at,
      s.profile->>'name' owner_name,a.profile->>'name' approver_name,r.status run_status
      FROM followups f JOIN visits v ON v.id=f.visit_id JOIN observations o ON o.visit_id=v.id AND o.version=v.observation_version
      JOIN agent_runs r ON r.id=f.run_id LEFT JOIN staff s ON s.id=f.owner_id LEFT JOIN staff a ON a.id=f.approved_by
      WHERE v.data_source='synthetic' ORDER BY CASE WHEN f.status IN ('OPEN','ACKNOWLEDGED') THEN 0 WHEN f.status='PROPOSED' THEN 1 ELSE 2 END,f.due_at NULLS LAST,f.created_at DESC LIMIT 200`)).rows;
    return {snapshotAt:this.now().toISOString(),tasks:rows.map(row=>({...row,
      overdue:['OPEN','ACKNOWLEDGED'].includes(row.status) && new Date(row.due_at).getTime()<=now,
      needsNewObservation:row.latest_version<=row.observation_version}))};
  }
  async history(staff:Staff,taskId:string) {
    requireClinical(staff);
    if(!(await this.database.pool.query('SELECT 1 FROM followups WHERE id=$1',[taskId])).rowCount)throw new NotFoundException('Follow-up not found.');
    return (await this.database.pool.query("SELECT a.id,a.timestamp,a.event_type,a.staff_id,s.profile->>'name' staff_name,a.details FROM audit_events a LEFT JOIN staff s ON s.id=a.staff_id WHERE a.details->>'followupId'=$1 ORDER BY a.timestamp,a.id",[taskId])).rows;
  }
  async act(staff:Staff,taskId:string,body:unknown,key:string) {
    requireClinical(staff);const input=parse(actionSchema,body);
    const checksum=hash(JSON.stringify(await readProtocol()));
    return this.database.transaction(db=>idempotent(db,staff.id,`followup:${taskId}`,key,input,async()=>{
      // Match observation writers' lock order to avoid deadlocks.
      const lookup=(await db.query('SELECT visit_id FROM followups WHERE id=$1',[taskId])).rows[0];
      if(!lookup)throw new NotFoundException('Follow-up not found.');
      const visit=(await db.query('SELECT * FROM visits WHERE id=$1 FOR UPDATE',[lookup.visit_id])).rows[0];
      const task=(await db.query('SELECT * FROM followups WHERE id=$1 FOR UPDATE',[taskId])).rows[0];
      if(visit.data_source!=='synthetic')throw new BadRequestException('Historical cases are read-only.');
      if(task.version!==input.expectedVersion)throw new ConflictException('Follow-up changed. Reload before acting.');
      if(['COMPLETED','CANCELLED','STALE'].includes(task.status))throw new ConflictException('This follow-up is closed.');
      let status=task.status,completion:any=null;
      if(input.action==='APPROVE') {
        if(task.status!=='PROPOSED' || visit.observation_version!==task.observation_version || task.protocol_checksum!==checksum || task.basis.context.policyVersion!==REASSESSMENT_POLICY_VERSION)
          throw new ConflictException('Proposal evidence or protocol changed. Record fresh observations for a new assessment.');
        const run=(await db.query('SELECT status FROM agent_runs WHERE id=$1',[task.run_id])).rows[0];
        if(!['WAITING_FOR_REVIEW','REVIEW_REQUIRED','DECIDED'].includes(run.status))throw new ConflictException('The agent run is not ready for review.');
        const due=new Date(input.dueAt).getTime(),now=this.now().getTime();
        if(due<=now || due>now+24*3600000)throw new BadRequestException('Choose a future due time within 24 hours. This is a prototype scheduling limit, not a clinical interval.');
        await this.requireOwner(db,input.ownerId);
        await db.query("UPDATE followups SET status='OPEN',owner_id=$2,due_at=$3,approved_by=$4,approved_at=now(),reason=$5,version=version+1 WHERE id=$1",[taskId,input.ownerId,input.dueAt,staff.id,input.reason]);
        status='OPEN';
      } else if(input.action==='ACKNOWLEDGE') {
        if(task.status!=='OPEN')throw new ConflictException('Only open tasks can be acknowledged.');
        if(task.owner_id!==staff.id)throw new ForbiddenException('Only the assigned owner can acknowledge this task.');
        await db.query("UPDATE followups SET status='ACKNOWLEDGED',acknowledged_at=now(),version=version+1 WHERE id=$1",[taskId]);status='ACKNOWLEDGED';
      } else if(input.action==='COMPLETE') {
        if(task.status!=='ACKNOWLEDGED')throw new ConflictException('Acknowledge the task before completing it.');
        if(task.owner_id!==staff.id)throw new ForbiddenException('Only the assigned owner can complete this task.');
        if(input.observationVersion!==visit.observation_version || input.observationVersion<=task.observation_version)
          throw new ConflictException('Completion requires the latest observation version, newer than the task evidence.');
        completion=(await db.query('SELECT id,recorded_at FROM observations WHERE visit_id=$1 AND version=$2',[visit.id,input.observationVersion])).rows[0];
        // Approval locks the visit at the basis version; a newer version can only commit afterward.
        if(!completion)throw new ConflictException('Record repeat observations after the task was approved.');
        await db.query("UPDATE followups SET status='COMPLETED',completed_by=$2,completed_at=now(),completion_observation_id=$3,reason=$4,version=version+1 WHERE id=$1",[taskId,staff.id,completion.id,input.reason]);status='COMPLETED';
      } else if(input.action==='REASSIGN') {
        if(!['OPEN','ACKNOWLEDGED'].includes(task.status))throw new ConflictException('Only scheduled tasks can be reassigned.');
        await this.requireOwner(db,input.ownerId);
        await db.query("UPDATE followups SET owner_id=$2,status='OPEN',acknowledged_at=null,reason=$3,version=version+1 WHERE id=$1",[taskId,input.ownerId,input.reason]);status='OPEN';
      } else {
        await db.query("UPDATE followups SET status='CANCELLED',reason=$2,version=version+1 WHERE id=$1",[taskId,input.reason]);status='CANCELLED';
      }
      await audit(db,staff.id,`FOLLOWUP_${input.action}`,{followupId:taskId,runId:task.run_id,basisObservationVersion:task.observation_version,
        ...input,status,completionObservationId:completion?.id || null},visit.id);
      return {success:true,data:{id:taskId,status,version:task.version+1,serverAcknowledged:true}};
    }));
  }
  private async requireOwner(db:any,ownerId:string) {
    const owner=(await db.query("SELECT id FROM staff WHERE id=$1 AND role IN ('nurse','clinician','doctor')",[ownerId])).rows[0];
    if(!owner)throw new BadRequestException('Choose an eligible clinical staff owner.');
  }
}
