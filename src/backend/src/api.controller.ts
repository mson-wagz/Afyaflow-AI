import { Controller, Get, Post, Body, Param, Req, Res, Headers, Inject, UseGuards, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, SessionGuard, StaffRequest } from './auth/auth.js';
import { WorkflowService, requestKey } from './modules/workflow.service.js';
import { Database, audit } from './database/db.js';
import { config } from './config.js';

@Controller('api')
export class ApiController {
  constructor(@Inject(AuthService) private readonly auth:AuthService,
    @Inject(WorkflowService) private readonly workflow:WorkflowService,
    @Inject(Database) private readonly database:Database) {}
  @Get('health') async health() {await this.database.pool.query('SELECT 1');return {status:'ok',database:'postgresql',agentProvider:config.provider,clinicalValidated:false};}
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
  @Get('visits') @UseGuards(SessionGuard) visits() {return this.workflow.visits();}
  @Get('research/cases') @UseGuards(SessionGuard) researchCases() {return this.workflow.researchCases();}
  @Get('research/export') @UseGuards(SessionGuard) async researchExport(@Res({passthrough:true})res:Response) {
    res.attachment('afyaflow-mimic-iv-ed-demo-2.2.json');return this.workflow.researchExport();
  }
  @Get('research/cases/:id') @UseGuards(SessionGuard) researchCase(@Param('id')id:string) {return this.workflow.researchCase(id);}
  @Post('visits') @UseGuards(SessionGuard) register(@Req()req:StaffRequest,@Body()body:unknown,@Headers('idempotency-key')key:string) {return this.workflow.register(req.staff,body,requestKey(key));}
  @Post('visits/:id/observations') @UseGuards(SessionGuard) observations(@Req()req:StaffRequest,@Param('id')visitId:string,@Body()body:unknown,@Headers('idempotency-key')key:string) {return this.workflow.observations(req.staff,visitId,body,requestKey(key));}
  @Get('queue') @UseGuards(SessionGuard) queue() {return this.workflow.queue();}
  @Get('triage/proposals') @UseGuards(SessionGuard) proposals() {return this.workflow.pending();}
  @Get('triage/decisions') @UseGuards(SessionGuard) decisions() {return this.workflow.decisions();}
  @Post('triage/decisions') @UseGuards(SessionGuard) decide(@Req()req:StaffRequest,@Body()body:unknown,@Headers('idempotency-key')key:string) {return this.workflow.decide(req.staff,body,requestKey(key));}
  @Get('agents/runs') @UseGuards(SessionGuard) runs() {return this.workflow.runs();}
  @Get('agents/runs/:id') @UseGuards(SessionGuard) trace(@Param('id')runId:string) {return this.workflow.trace(runId);}
  @Post('visits/:id/assessment') @UseGuards(SessionGuard) assess(@Req()req:StaffRequest,@Param('id')visitId:string) {return this.workflow.requestAssessment(req.staff,visitId);}
  @Get('departments') @UseGuards(SessionGuard) departments() {return this.workflow.departments();}
  @Get('routing/candidates') @UseGuards(SessionGuard) routing() {return this.workflow.routing();}
  @Post('routing/transfers') @UseGuards(SessionGuard) transfer(@Req()req:StaffRequest,@Body()body:unknown,@Headers('idempotency-key')key:string) {return this.workflow.transfer(req.staff,body,requestKey(key));}
  @Get('deterioration') @UseGuards(SessionGuard) deterioration() {return this.workflow.deterioration();}
  @Post('deterioration/decisions') @UseGuards(SessionGuard) reassess(@Req()req:StaffRequest,@Body()body:unknown,@Headers('idempotency-key')key:string) {return this.workflow.reassess(req.staff,body,requestKey(key));}
  @Get('audit') @UseGuards(SessionGuard) audit(@Req()req:StaffRequest) {return this.workflow.audit(req.staff);}
}
