import { Database, hash } from '../database/db.js';

// Shared across processes and Lambda execution environments, never keyed by an untrusted header.
export async function allowAuthAttempt(database:Database,source:string) {
  const result=await database.pool.query(`INSERT INTO auth_rate_limits(key_hash,attempts,expires_at)
    VALUES($1,1,now()+interval '1 minute') ON CONFLICT(key_hash) DO UPDATE SET
    attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE auth_rate_limits.attempts+1 END,
    expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN now()+interval '1 minute' ELSE auth_rate_limits.expires_at END
    RETURNING attempts`,[hash(source)]);
  return result.rows[0].attempts<=20;
}
