import { Database, hash } from '../database/db.js';

export type AttemptLimit = {limit:number;windowSeconds:number};
// Per network source: every sign-in and unlock request counts.
export const SOURCE_LIMIT:AttemptLimit = {limit:20,windowSeconds:60};
// Per staff account: only failed PIN checks count, and a successful sign-in or unlock clears them.
export const ACCOUNT_LIMIT:AttemptLimit = {limit:10,windowSeconds:15*60};

// Shared across processes and Lambda execution environments, never keyed by an untrusted header.
export async function allowAuthAttempt(database:Database,source:string,{limit,windowSeconds}:AttemptLimit=SOURCE_LIMIT) {
  const result=await database.pool.query(`INSERT INTO auth_rate_limits(key_hash,attempts,expires_at)
    VALUES($1,1,now()+make_interval(secs=>$2)) ON CONFLICT(key_hash) DO UPDATE SET
    attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE auth_rate_limits.attempts+1 END,
    expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN now()+make_interval(secs=>$2) ELSE auth_rate_limits.expires_at END
    RETURNING attempts`,[hash(source),windowSeconds]);
  return result.rows[0].attempts<=limit;
}

export async function clearAuthAttempts(database:Database,source:string) {
  await database.pool.query('DELETE FROM auth_rate_limits WHERE key_hash=$1',[hash(source)]);
}

// Accounts are keyed by staff ID, so switching between ID, staff number and name shares one budget.
export const accountKey=(staffId:string)=>`account:${staffId}`;
export const unknownAccountKey=(identifier:string)=>`unknown-account:${identifier.toLowerCase()}`;
