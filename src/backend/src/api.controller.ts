import { Controller, Get, Post, Body, Param, Query, Req, Res, Headers, Inject, UseGuards, UseInterceptors, UnauthorizedException } from '@nestjs/common';
import { AccessLogged, AccessLogInterceptor, listAccess } from './audit/access-log.js';
import { listStaff, setStaffActive, endStaffSessions, adminResetPin } from './admin/staff-accounts.js';
import type { Request, Response } from 'express';
import { AuthService, SessionGuard, StaffRequest } from './auth/auth.js';
import { WorkflowService, requestKey } from './modules/workflow.service.js';
import { Database, audit } from './database/db.js';
import { config } from './config.js';
import { FollowupService } from './modules/followup.service.js';
import { OperationsService } from './modules/operations.service.js';
import { ReportService } from './modules/reports.service.js';
import { visitBundle } from './modules/fhir.js';
import { escalationSettings } from './modules/escalation.js';
const smsStatus=()=>{const s=escalationSettings();return {provider:s.provider,environment:s.provider==='none'?null:s.environment};};

@Controller('api')
@UseInterceptors(AccessLogInterceptor)
export class ApiController {
  constructor(@Inject(AuthService) private readonly auth:AuthService,
    @Inject(WorkflowService) private readonly workflow:WorkflowService,
    @Inject(Database) private readonly database:Database,
    @Inject(FollowupService) private readonly followups:FollowupService,
    @Inject(OperationsService) private readonly operations:OperationsService,
    @Inject(ReportService) private readonly reports:ReportService) {}
  @Get('health') async health() {await this.database.pool.query('SELECT 1');return {status:'ok',database:'postgresql',mode:config.mode,agentProvider:config.provider,dataResidency:config.dataResidency,sms:smsStatus(),clinicalValidated:false};}
  @Post('auth/login') async login(@Body()body:unknown,@Res({passthrough:true})res:Response) {
    const result=await this.auth.signIn(body);
    res.cookie('afyaflow_session',result.token,{httpOnly:true,sameSite:'strict',secure:config.secureCookies,maxAge:8*3600000,path:'/api'});
    const {token:_token,...data}=result;return {success:true,...data};
  }
  @Get('auth/me') async me(@Req()req:Request) {
    const session=await this.auth.session(req,true);return {staff:session.staff,locked:session.locked};
  }
  @Post('auth/unlock') async unlock(@Req()req:Request,@Body()body:unknown) {return this.auth.unlock(req,body);}
  @Post('auth/lock') @UseGuards(SessionGuard) async lock(@Req()req:StaffRequest) {
    await this.database.transaction(async db => {await db.query('UPDATE sessions SET locked=true WHERE token_hash=$1',[req.sessionHash]);await audit(db,req.staff.id,'SESSION_LOCK',{});});
    return {success:true};
  }
  @Post('auth/logout') async logout(@Req()req:Request,@Res({passthrough:true})res:Response) {
    const session=await this.auth.session(req,true).catch(error=>{if(error instanceof UnauthorizedException)return null;throw error;});
    if(session)await this.database.transaction(async db=>{
      await db.query('DELETE FROM sessions WHERE token_hash=$1',[session.sessionHash]);
      await audit(db,session.staff.id,'SIGN_OUT',{});
    });
    res.clearCookie('afyaflow_session',{path:'/api'});return {success:true};
  }
  @Get('visits') @UseGuards(SessionGuard) @AccessLogged() visits() {return this.workflow.visits();}
  @Get('visits/:id/evidence') @UseGuards(SessionGuard) @AccessLogged() evidence(@Param('id')id:string) {return this.workflow.evidence(id);}
  @Get('research/cases') @UseGuards(SessionGuard) @AccessLogged() researchCases() {return this.workflow.researchCases();}
  @Get('research/export') @UseGuards(SessionGuard) @AccessLogged() async researchExport(@Res({passthrough:true})res:Response) {
    res.attachment('afyaflow-mimic-iv-ed-demo-2.2.json');return this.workflow.researchExport();
  }
  @Get('research/cases/:id') @UseGuards(SessionGuard) @AccessLogged() researchCase(@Param('id')id:string) {return this.workflow.researchCase(id);}
  @Post('visits') @UseGuards(SessionGuard) register(@Req()req:StaffRequest,@Body()body:unknown,@Headers('idempotency-key')key:string) {return this.workflow.register(req.staff,body,requestKey(key));}
  @Post('visits/:id/observations') @UseGuards(SessionGuard) observations(@Req()req:StaffRequest,@Param('id')visitId:string,@Body()body:unknown,@Headers('idempotency-key')key:string) {return this.workflow.observations(req.staff,visitId,body,requestKey(key));}
  @Get('queue') @UseGuards(SessionGuard) @AccessLogged() queue() {return this.workflow.queue();}
  // FHIR R4 export of one visit (open or closed) for hospital systems; a record read, so access-logged.
  @Get('visits/:id/fhir') @UseGuards(SessionGuard) @AccessLogged() fhir(@Req()req:StaffRequest,@Param('id')visitId:string,@Res({passthrough:true})res:Response) {
    res.type('application/fhir+json');return visitBundle(this.database,req.staff,visitId);
  }
  @Post('visits/:id/seen') @UseGuards(SessionGuard) seen(@Req()req:StaffRequest,@Param('id')visitId:string,@Headers('idempotency-key')key:string) {return this.workflow.markSeen(req.staff,visitId,requestKey(key));}
  @Post('visits/:id/outcome') @UseGuards(SessionGuard) outcome(@Req()req:StaffRequest,@Param('id')visitId:string,@Body()body:unknown,@Headers('idempotency-key')key:string) {return this.workflow.recordOutcome(req.staff,visitId,body,requestKey(key));}
  // AI reports (shift handover, quality review): drafts for people to acknowledge; access-logged.
  @Get('reports/:kind/latest') @UseGuards(SessionGuard) @AccessLogged() latestReport(@Req()req:StaffRequest,@Param('kind')kind:string) {return this.reports.latest(req.staff,kind);}
  @Post('reports/:kind') @UseGuards(SessionGuard) @AccessLogged() generateReport(@Req()req:StaffRequest,@Param('kind')kind:string) {return this.reports.generate(req.staff,kind);}
  @Post('reports/:id/acknowledge') @UseGuards(SessionGuard) @AccessLogged() acknowledgeReport(@Req()req:StaffRequest,@Param('id')reportId:string,@Body()body:unknown) {return this.reports.acknowledge(req.staff,reportId,body);}
  @Post('queue/precedence') @UseGuards(SessionGuard) precedence(@Req()req:StaffRequest,@Body()body:unknown,@Headers('idempotency-key')key:string) {return this.workflow.precedence(req.staff,body,requestKey(key));}
  @Get('triage/proposals') @UseGuards(SessionGuard) @AccessLogged() proposals() {return this.workflow.pending();}
  @Get('triage/decisions') @UseGuards(SessionGuard) @AccessLogged() decisions() {return this.workflow.decisions();}
  @Post('triage/decisions') @UseGuards(SessionGuard) decide(@Req()req:StaffRequest,@Body()body:unknown,@Headers('idempotency-key')key:string) {return this.workflow.decide(req.staff,body,requestKey(key));}
  @Get('agents/runs') @UseGuards(SessionGuard) @AccessLogged() runs() {return this.workflow.runs();}
  @Get('agents/runs/:id') @UseGuards(SessionGuard) @AccessLogged() trace(@Param('id')runId:string) {return this.workflow.trace(runId);}
  @Post('visits/:id/assessment') @UseGuards(SessionGuard) assess(@Req()req:StaffRequest,@Param('id')visitId:string) {return this.workflow.requestAssessment(req.staff,visitId);}
  @Get('departments') @UseGuards(SessionGuard) departments() {return this.workflow.departments();}
  @Get('routing/candidates') @UseGuards(SessionGuard) @AccessLogged() routing() {return this.workflow.routing();}
  @Post('routing/transfers') @UseGuards(SessionGuard) transfer(@Req()req:StaffRequest,@Body()body:unknown,@Headers('idempotency-key')key:string) {return this.workflow.transfer(req.staff,body,requestKey(key));}
  @Get('deterioration') @UseGuards(SessionGuard) @AccessLogged() deterioration() {return this.workflow.deterioration();}
  @Post('deterioration/decisions') @UseGuards(SessionGuard) reassess(@Req()req:StaffRequest,@Body()body:unknown,@Headers('idempotency-key')key:string) {return this.workflow.reassess(req.staff,body,requestKey(key));}
  // Aggregate counts and durations only (no patient identifiers), so not access-logged.
  @Get('operations/summary') @UseGuards(SessionGuard) operationsSummary(@Req()req:StaffRequest,@Query('period')period?:string) {return this.operations.summary(req.staff,period);}
  @Get('audit') @UseGuards(SessionGuard) @AccessLogged() audit(@Req()req:StaffRequest) {return this.workflow.audit(req.staff);}
  @Get('audit/access') @UseGuards(SessionGuard) @AccessLogged() accessLog(@Req()req:StaffRequest,@Query('patientId')patientId?:string) {return listAccess(this.database,req.staff,patientId);}
  // Staff account management (administrators only; each change needs a reason and is audited).
  @Get('staff') @UseGuards(SessionGuard) staffList(@Req()req:StaffRequest) {return listStaff(this.database,req.staff);}
  @Post('staff/:id/deactivate') @UseGuards(SessionGuard) deactivate(@Req()req:StaffRequest,@Param('id')staffId:string,@Body()body:unknown) {return setStaffActive(this.database,req.staff,staffId,false,body);}
  @Post('staff/:id/reactivate') @UseGuards(SessionGuard) reactivate(@Req()req:StaffRequest,@Param('id')staffId:string,@Body()body:unknown) {return setStaffActive(this.database,req.staff,staffId,true,body);}
  @Post('staff/:id/end-sessions') @UseGuards(SessionGuard) endSessions(@Req()req:StaffRequest,@Param('id')staffId:string,@Body()body:unknown) {return endStaffSessions(this.database,req.staff,staffId,body);}
  @Post('staff/:id/reset-pin') @UseGuards(SessionGuard) resetPin(@Req()req:StaffRequest,@Param('id')staffId:string,@Body()body:unknown) {return adminResetPin(this.database,req.staff,staffId,body);}
  @Get('followups') @UseGuards(SessionGuard) @AccessLogged() followupList(@Req()req:StaffRequest) {return this.followups.list(req.staff);}
  @Get('followups/staff') @UseGuards(SessionGuard) followupStaff(@Req()req:StaffRequest) {return this.followups.staff(req.staff);}
  @Get('followups/:id/history') @UseGuards(SessionGuard) @AccessLogged() followupHistory(@Req()req:StaffRequest,@Param('id')taskId:string) {return this.followups.history(req.staff,taskId);}
  @Post('followups/:id/actions') @UseGuards(SessionGuard) followupAction(@Req()req:StaffRequest,@Param('id')taskId:string,@Body()body:unknown,@Headers('idempotency-key')key:string) {return this.followups.act(req.staff,taskId,body,requestKey(key));}
}
