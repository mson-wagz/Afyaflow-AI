import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Database, audit } from '../database/db.js';
import { executeAgent } from '../../../../services/agents/workflow.js';

@Injectable()
export class AgentWorker implements OnModuleInit,OnModuleDestroy {
  private timer?:ReturnType<typeof setInterval>;
  private running=false;
  private active:Promise<void>|null=null;
  constructor(@Inject(Database) private readonly database:Database) {}
  onModuleInit() {
    if (process.env.AGENT_WORKER_DISABLED==='true') return;
    this.timer=setInterval(()=>{if(!this.running)this.active=this.tick();},1500);
  }
  async tick() {
    if (this.running) return;
    this.running=true;
    try {
      const job=await this.database.transaction(async db => {
        await db.query("UPDATE agent_runs SET status='FAILED',error='Worker lease expired; retry assessment.',finished_at=now() WHERE status='RUNNING' AND lease_until<now() AND attempts>=2");
        const run=(await db.query(`SELECT * FROM agent_runs WHERE (status='QUEUED' OR (status='RUNNING' AND lease_until<now()))
          AND attempts<2 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
        if (!run) return null;
        await db.query("UPDATE agent_runs SET status='RUNNING',attempts=attempts+1,lease_until=now()+interval '5 minutes' WHERE id=$1",[run.id]);
        return run;
      });
      if (job) {
        try {await executeAgent(this.database,job.id);}
        catch(error) {
          const message=(error instanceof Error?error.message:'Agent execution failed').slice(0,1000);
          await this.database.transaction(async db => {
            const changed=await db.query("UPDATE agent_runs SET status='FAILED',error=$2,lease_until=null,finished_at=now() WHERE id=$1 AND status='RUNNING' AND attempts=$3",[job.id,message,job.attempts+1]);
            if(changed.rowCount) {
              await db.query("UPDATE visits SET assessment_status='REVIEW_REQUIRED' WHERE id=$1 AND observation_version=$2",[job.visit_id,job.observation_version]);
              await audit(db,null,'AGENT_FAILED',{runId:job.id,error:message},job.visit_id);
            }
          });
        }
      }
    } catch(error) {console.error('Agent worker unavailable:',error instanceof Error?error.message:'Database error');}
    finally {this.running=false;}
  }
  async onModuleDestroy() {if(this.timer)clearInterval(this.timer);await this.active;}
}
