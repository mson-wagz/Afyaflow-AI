import { Database, audit } from '../database/db.js';
import { executeAgent } from '../../../../services/agents/workflow.js';

export type AgentJob={runId:string;generation:number};
export class ActiveAgentLeaseError extends Error {}

async function markFailed(database:Database,run:any,message:string) {
  await database.transaction(async db=>{
    const changed=await db.query(`UPDATE agent_runs SET status='FAILED',error=$2,lease_until=null,finished_at=now()
      WHERE id=$1 AND status='RUNNING' AND attempts=$3 AND delivery_generation=$4`,
      [run.id,message,run.attempts,run.delivery_generation]);
    if(changed.rowCount) {
      await db.query("UPDATE visits SET assessment_status='REVIEW_REQUIRED' WHERE id=$1 AND observation_version=$2",[run.visit_id,run.observation_version]);
      await audit(db,null,'AGENT_FAILED',{runId:run.id,error:message},run.visit_id);
    }
  });
}

export async function processAgentJob(database:Database,job:AgentJob,execute=executeAgent) {
  const run=await database.transaction(async db=>{
    const row=(await db.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE',[job.runId])).rows[0];
    if(!row) throw new Error('Agent job does not exist.');
    // Completed deliveries and messages from a previous explicit retry are safe to acknowledge.
    if(row.delivery_generation!==job.generation || !['QUEUED','RUNNING'].includes(row.status)) return null;
    if(row.status==='RUNNING' && new Date(row.lease_until).getTime()>Date.now())
      throw new ActiveAgentLeaseError('Agent run is already leased; retry this delivery later.');
    const visit=(await db.query('SELECT observation_version FROM visits WHERE id=$1',[row.visit_id])).rows[0];
    if(visit.observation_version!==row.observation_version) {
      await db.query("UPDATE agent_runs SET status='SUPERSEDED',lease_until=null WHERE id=$1",[row.id]);
      return null;
    }
    // Recover a crash between saving the proposal and completing the run without another model call.
    const proposal=(await db.query("SELECT data FROM proposals WHERE run_id=$1 AND status='PENDING'",[row.id])).rows[0];
    if(proposal) {
      await db.query("UPDATE agent_runs SET status=$2,finished_at=now(),lease_until=null WHERE id=$1",
        [row.id,proposal.data.proposal.isSufficientEvidence?'WAITING_FOR_REVIEW':'REVIEW_REQUIRED']);
      return null;
    }
    return (await db.query(`UPDATE agent_runs SET status='RUNNING',attempts=attempts+1,
      lease_until=now()+interval '5 minutes' WHERE id=$1 RETURNING *`,[row.id])).rows[0];
  });
  if(!run) return;
  if(run.attempts>2) {await markFailed(database,run,'Worker lease expired repeatedly; request a new assessment.');return;}
  try {await execute(database,run.id);}
  catch {
    // Never log model or tool text as an operational error: it may contain patient information.
    // Detailed run-scoped evidence remains available through authenticated trace endpoints.
    await markFailed(database,run,'Agent execution failed. Clinical staff review is required; retry assessment if appropriate.');
  }
}

export async function dispatchAgentOutbox(database:Database,send:(job:AgentJob)=>Promise<void>,limit=10) {
  return database.transaction(async db=>{
    const rows=(await db.query(`SELECT o.run_id,o.generation FROM agent_outbox o JOIN agent_runs r ON r.id=o.run_id
      WHERE o.sent_at IS NULL AND r.status='QUEUED' AND r.delivery_generation=o.generation
      ORDER BY o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT $1`,[limit])).rows;
    for(const row of rows) {
      // If send succeeds but COMMIT fails, the next attempt sends a duplicate. Worker leases handle it.
      await send({runId:row.run_id,generation:row.generation});
      await db.query('UPDATE agent_outbox SET sent_at=now() WHERE run_id=$1 AND generation=$2',[row.run_id,row.generation]);
    }
    await db.query('DELETE FROM auth_rate_limits WHERE expires_at<now()');
    return rows.length;
  });
}
