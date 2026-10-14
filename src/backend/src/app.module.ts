import { Module } from '@nestjs/common';
import { Database } from './database/db.js';
import { AuthService, SessionGuard } from './auth/auth.js';
import { WorkflowService } from './modules/workflow.service.js';
import { AgentWorker } from './modules/agent-worker.js';
import { ApiController } from './api.controller.js';
@Module({controllers:[ApiController],providers:[Database,AuthService,SessionGuard,WorkflowService,AgentWorker]})
export class AppModule {}
