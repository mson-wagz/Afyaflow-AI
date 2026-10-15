import { Module } from '@nestjs/common';
import { Database } from './database/db.js';
import { AuthService, SessionGuard } from './auth/auth.js';
import { WorkflowService } from './modules/workflow.service.js';
import { AgentWorker } from './modules/agent-worker.js';
import { ApiController } from './api.controller.js';
import { FollowupService } from './modules/followup.service.js';
@Module({controllers:[ApiController],providers:[Database,AuthService,SessionGuard,WorkflowService,FollowupService,AgentWorker]})
export class AppModule {}
