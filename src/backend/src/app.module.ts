import { Module } from '@nestjs/common';
import { Database } from './database/db.js';
import { AuthService, SessionGuard } from './auth/auth.js';
import { WorkflowService } from './modules/workflow.service.js';
import { AgentWorker } from './modules/agent-worker.js';
import { ApiController } from './api.controller.js';
import { FollowupService } from './modules/followup.service.js';
import { AccessLogInterceptor } from './audit/access-log.js';
import { OperationsService } from './modules/operations.service.js';
import { EscalationWorker } from './modules/escalation.js';
import { ReportService } from './modules/reports.service.js';
@Module({controllers:[ApiController],providers:[Database,AuthService,SessionGuard,WorkflowService,FollowupService,OperationsService,ReportService,AgentWorker,EscalationWorker,AccessLogInterceptor]})
export class AppModule {}
