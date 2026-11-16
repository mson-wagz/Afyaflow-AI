import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException, ForbiddenException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { allowAuthAttempt, clearAuthAttempts, ACCOUNT_LIMIT, accountKey, unknownAccountKey } from './rate-limit.js';
import { config } from '../config.js';
import { verifyTotp } from './totp.js';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Request } from 'express';
import { Database, audit, hash } from '../database/db.js';
import { isClinicalRole, PIN_PATTERN } from '../../../shared/contracts/auth.js';

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
const credentials=z.object({identifier:z.string().trim().min(1).max(100),pin:z.string().regex(PIN_PATTERN),
  otp:z.string().regex(/^\d{6}$/).optional()}).strict();
/** Roles that must also present an authenticator-app code at sign-in. */
export const MFA_REQUIRED_ROLES=['admin'];

@Injectable()
export class AuthService {
  constructor(@Inject(Database) private readonly database:Database) {}
  async signIn(body:unknown) {
    const {identifier,pin,otp}=parse(credentials,body);
    const matches=(await this.database.pool.query('SELECT * FROM staff WHERE lower(id)=lower($1) OR lower(staff_number)=lower($1) OR lower(profile->>\'name\')=lower($1)',[identifier])).rows;
    // IDs and staff numbers are unique; a display name is accepted only when exactly one account has it.
    const exact=matches.filter(s=>[s.id,s.staff_number].some(v=>v.toLowerCase()===identifier.toLowerCase()));
    const staff=exact.length===1 ? exact[0] : exact.length===0 && matches.length===1 ? matches[0] : undefined;
    // Unknown identifiers are throttled the same way, so the response does not reveal which accounts exist.
    const attemptKey=staff ? accountKey(staff.id) : unknownAccountKey(identifier);
    await this.requireAccountAttempt(attemptKey);
    if (!staff || !pinMatches(pin,staff.pin_hash)) throw new UnauthorizedException({code:'INVALID_CREDENTIALS',message:'Invalid staff identifier or PIN.'});
    if (MFA_REQUIRED_ROLES.includes(staff.role)) await this.requireSecondFactor(staff,otp);
    await clearAuthAttempts(this.database,attemptKey);
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
    const row=(await this.database.pool.query(`SELECT s.*,t.role,t.profile,
      s.last_seen_at<now()-make_interval(mins=>$2) AS idle, s.last_seen_at<now()-interval '60 seconds' AS touch_due
      FROM sessions s JOIN staff t ON t.id=s.staff_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(token),config.sessionIdleMinutes])).rows[0];
    if (!row) throw new UnauthorizedException({code:'SESSION_EXPIRED',message:'Session expired. Sign in again.'});
    // Server-side automatic lock: a session with no authenticated request for SESSION_IDLE_MINUTES
    // (closed tab, crashed device, bypassed client timer) needs the PIN again.
    if (!row.locked && row.idle) {
      await this.database.transaction(async db => {
        const locked=await db.query('UPDATE sessions SET locked=true WHERE token_hash=$1 AND NOT locked RETURNING staff_id',[row.token_hash]);
        if (locked.rowCount) await audit(db,row.staff_id,'SESSION_IDLE_LOCK',{idleMinutes:config.sessionIdleMinutes});
      });
      row.locked=true;
    }
    if (row.locked && !allowLocked) throw new ForbiddenException({code:'SESSION_LOCKED',message:'Unlock the terminal before accessing patient data.'});
    // Activity refresh is written at most once a minute per session to keep polling cheap.
    if (!row.locked && row.touch_due) await this.database.pool.query('UPDATE sessions SET last_seen_at=now() WHERE token_hash=$1',[row.token_hash]);
    return {staff:{...row.profile,id:row.staff_id,role:row.role} as Staff,sessionHash:row.token_hash,locked:row.locked};
  }
  async unlock(req:Request,body:unknown) {
    const {pin}=parse(z.object({pin:z.string().regex(PIN_PATTERN)}).strict(),body);
    const session=await this.session(req,true);
    const row=(await this.database.pool.query('SELECT pin_hash FROM staff WHERE id=$1',[session.staff.id])).rows[0];
    // Shares the sign-in budget: a locked terminal must not become a way to guess the account PIN.
    await this.requireAccountAttempt(accountKey(session.staff.id));
    if (!pinMatches(pin,row.pin_hash)) throw new UnauthorizedException({code:'INVALID_PIN',message:'Incorrect PIN.'});
    await clearAuthAttempts(this.database,accountKey(session.staff.id));
    await this.database.transaction(async db => {
      await db.query('UPDATE sessions SET locked=false,last_seen_at=now() WHERE token_hash=$1',[session.sessionHash]);
      await audit(db,session.staff.id,'SESSION_UNLOCK',{});
    });
    return {success:true,staff:session.staff};
  }
  /**
   * Administrator sign-in also needs a code from an authenticator app. Wrong codes count toward
   * the same per-account limit as wrong PINs (the attempt was already charged), and each code is
   * accepted once: the step is recorded with a conditional update, so concurrent reuse fails.
   */
  private async requireSecondFactor(staff:{id:string;mfa_secret:string|null;mfa_last_step:string|null},otp?:string) {
    if (!staff.mfa_secret) throw new ForbiddenException({code:'MFA_NOT_ENROLLED',
      message:'Administrator accounts need an authenticator app. Ask the system operator to enrol yours.'});
    if (!otp) throw new UnauthorizedException({code:'MFA_REQUIRED',message:'Enter the 6-digit code from your authenticator app.'});
    const step=verifyTotp(staff.mfa_secret,otp,staff.mfa_last_step===null?null:Number(staff.mfa_last_step));
    const recorded=step!==null && (await this.database.pool.query(
      'UPDATE staff SET mfa_last_step=$2 WHERE id=$1 AND (mfa_last_step IS NULL OR mfa_last_step<$2)',[staff.id,step])).rowCount;
    if (!recorded) throw new UnauthorizedException({code:'INVALID_MFA_CODE',message:'That authenticator code is incorrect or already used.'});
  }
  private async requireAccountAttempt(key:string) {
    if (!await allowAuthAttempt(this.database,key,ACCOUNT_LIMIT))
      throw new HttpException({code:'ACCOUNT_RATE_LIMITED',message:'Too many incorrect PIN attempts for this account. Wait 15 minutes or ask an administrator.'},HttpStatus.TOO_MANY_REQUESTS);
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
