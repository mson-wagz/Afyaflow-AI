import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Request } from 'express';
import { Database, audit, hash } from '../database/db.js';
import { isClinicalRole } from '../../../shared/contracts/auth.js';

export type Staff = {id:string;name:string;role:string;[key:string]:unknown};
export type StaffRequest = Request & {staff:Staff;sessionHash:string};
export function pinHash(pin:string) {
  const salt=randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pin,salt,32).toString('hex')}`;
}
export function pinMatches(pin:string,stored:string) {
  const [salt,key]=stored.split(':');
  return timingSafeEqual(scryptSync(pin,salt,32),Buffer.from(key,'hex'));
}
export function requireClinical(staff:Staff) {
  if (!isClinicalRole(staff.role)) throw new ForbiddenException({code:'PERMISSION_DENIED',message:'Clinical approval authority required.'});
}
export function parse<T>(schema:z.ZodType<T>,body:unknown):T {
  const result=schema.safeParse(body);
  if (!result.success) throw new BadRequestException({code:'VALIDATION_ERROR',message:'Invalid request fields.',errors:result.error.flatten()});
  return result.data;
}
const credentials=z.object({identifier:z.string().trim().min(1).max(100),pin:z.string().regex(/^\d{4}$/)}).strict();

@Injectable()
export class AuthService {
  constructor(@Inject(Database) private readonly database:Database) {}
  async signIn(body:unknown) {
    const {identifier,pin}=parse(credentials,body);
    const staff=(await this.database.pool.query('SELECT * FROM staff WHERE lower(id)=lower($1) OR lower(staff_number)=lower($1) OR lower(profile->>\'name\')=lower($1)',[identifier])).rows[0];
    if (!staff || !pinMatches(pin,staff.pin_hash)) throw new UnauthorizedException({code:'INVALID_CREDENTIALS',message:'Invalid staff identifier or PIN.'});
    const token=randomBytes(32).toString('hex');
    await this.database.transaction(async db => {
      await db.query("INSERT INTO sessions(token_hash,staff_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",[hash(token),staff.id]);
      await audit(db,staff.id,'SIGN_IN',{role:staff.role});
    });
    return {token,staff:{...staff.profile,id:staff.id,role:staff.role},sessionExpiresAt:new Date(Date.now()+8*3600000).toISOString()};
  }
  async session(req:Request,allowLocked=false) {
    const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('afyaflow_session='))?.slice('afyaflow_session='.length);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException({code:'UNAUTHENTICATED',message:'Sign in to continue.'});
    const row=(await this.database.pool.query(`SELECT s.*,t.role,t.profile FROM sessions s JOIN staff t ON t.id=s.staff_id
      WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(token)])).rows[0];
    if (!row) throw new UnauthorizedException({code:'SESSION_EXPIRED',message:'Session expired. Sign in again.'});
    if (row.locked && !allowLocked) throw new ForbiddenException({code:'SESSION_LOCKED',message:'Unlock the terminal before accessing patient data.'});
    return {staff:{...row.profile,id:row.staff_id,role:row.role} as Staff,sessionHash:row.token_hash,locked:row.locked};
  }
  async unlock(req:Request,body:unknown) {
    const {pin}=parse(z.object({pin:z.string().regex(/^\d{4}$/)}).strict(),body);
    const session=await this.session(req,true);
    const row=(await this.database.pool.query('SELECT pin_hash FROM staff WHERE id=$1',[session.staff.id])).rows[0];
    if (!pinMatches(pin,row.pin_hash)) throw new UnauthorizedException({code:'INVALID_PIN',message:'Incorrect PIN.'});
    await this.database.transaction(async db => {
      await db.query('UPDATE sessions SET locked=false WHERE token_hash=$1',[session.sessionHash]);
      await audit(db,session.staff.id,'SESSION_UNLOCK',{});
    });
    return {success:true,staff:session.staff};
  }
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth:AuthService) {}
  async canActivate(context:ExecutionContext) {
    const req=context.switchToHttp().getRequest<StaffRequest>();
    Object.assign(req,await this.auth.session(req));
    return true;
  }
}
