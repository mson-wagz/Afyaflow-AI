import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Database } from '../database/db.js';
import { processAgentJob, ActiveAgentLeaseError } from './agent-jobs.js';

@Injectable()
export class AgentWorker implements OnModuleInit,OnModuleDestroy {
  private timer?:ReturnType<typeof setInterval>;
  private running=false;
  private active:Promise<void>|null=null;
  constructor(@Inject(Database) private readonly database:Database) {}
  onModuleInit() {
    if (process.env.AGENT_WORKER_DISABLED==='true' || process.env.AWS_LAMBDA_FUNCTION_NAME) return;
    this.timer=setInterval(()=>{if(!this.running)this.active=this.tick();},1500);
  }
  async tick() {
    if (this.running) return;
    this.running=true;
    try {
      const run=(await this.database.pool.query(`SELECT id,delivery_generation FROM agent_runs
        WHERE status='QUEUED' OR (status='RUNNING' AND lease_until<now()) ORDER BY created_at LIMIT 1`)).rows[0];
      if(run)await processAgentJob(this.database,{runId:run.id,generation:run.delivery_generation});
    } catch(error) {if(!(error instanceof ActiveAgentLeaseError))console.error('Agent worker unavailable.');}
    finally {this.running=false;}
  }
  async onModuleDestroy() {if(this.timer)clearInterval(this.timer);await this.active;}
}
