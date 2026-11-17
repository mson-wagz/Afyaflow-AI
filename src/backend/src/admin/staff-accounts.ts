import { randomInt } from 'node:crypto';
import { NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { z } from 'zod';
import { Database, audit, hash } from '../database/db.js';
import { pinHash, parse, type Staff } from '../auth/auth.js';
import { PIN_LENGTH } from '../../../shared/contracts/auth.js';
import { accountKey } from '../auth/rate-limit.js';
import { generateTotpSecret, otpauthUri } from '../auth/totp.js';

/* ------------------------------------------------------------------ */
/* Administrator account management (API)                             */
/* ------------------------------------------------------------------ */

const reasonSchema = z.object({ reason: z.string().trim().min(5).max(500) }).strict();

function requireAdmin(actor: Staff) {
  if (actor.role !== 'admin') throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Administrator access required to manage staff accounts.' });
}
function notSelf(actor: Staff, staffId: string, action: string) {
  if (actor.id === staffId) throw new BadRequestException({ code: 'SELF_ACTION', message: `You cannot ${action} your own account. Ask another administrator or the system operator.` });
}

/** Staff accounts with status, for administrators. Never includes PIN hashes or MFA secrets. */
export async function listStaff(database: Database, actor: Staff) {
  requireAdmin(actor);
  const rows = (await database.pool.query(`SELECT s.id,s.staff_number,s.role,s.profile->>'name' name,s.active,s.deactivated_at,
    s.mfa_secret IS NOT NULL mfa_enrolled,(SELECT count(*) FROM sessions x WHERE x.staff_id=s.id AND x.expires_at>now())::int open_sessions
    FROM staff s WHERE NOT coalesce((s.profile->>'systemAccount')::boolean,false) ORDER BY s.id`)).rows;
  return rows.map((r) => ({ id: r.id, staffNumber: r.staff_number, name: r.name, role: r.role, active: r.active,
    deactivatedAt: r.deactivated_at ? new Date(r.deactivated_at).toISOString() : null, mfaEnrolled: r.mfa_enrolled, openSessions: r.open_sessions }));
}

/** Deactivates (ending all sessions) or reactivates an account. The last active administrator cannot be deactivated. */
export async function setStaffActive(database: Database, actor: Staff, staffId: string, active: boolean, body: unknown) {
  requireAdmin(actor); const { reason } = parse(reasonSchema, body);
  notSelf(actor, staffId, active ? 'reactivate' : 'deactivate');
  return database.transaction(async (db) => {
    // Lock all administrator rows so two concurrent deactivations cannot remove the last one.
    await db.query("SELECT id FROM staff WHERE role='admin' FOR UPDATE");
    const target = (await db.query('SELECT id,role,active FROM staff WHERE id=$1 FOR UPDATE', [staffId])).rows[0];
    if (!target) throw new NotFoundException({ code: 'STAFF_NOT_FOUND', message: 'Staff account not found.' });
    if (target.active === active) throw new ConflictException({ code: 'NO_CHANGE', message: `The account is already ${active ? 'active' : 'deactivated'}.` });
    if (!active && target.role === 'admin') {
      const others = (await db.query("SELECT count(*)::int n FROM staff WHERE role='admin' AND active AND id<>$1", [staffId])).rows[0].n;
      if (!others) throw new ConflictException({ code: 'LAST_ADMIN', message: 'The last active administrator cannot be deactivated.' });
    }
    await db.query('UPDATE staff SET active=$2,deactivated_at=CASE WHEN $2 THEN NULL ELSE now() END WHERE id=$1', [staffId, active]);
    const ended = active ? 0 : (await db.query('DELETE FROM sessions WHERE staff_id=$1', [staffId])).rowCount;
    await audit(db, actor.id, active ? 'STAFF_REACTIVATED' : 'STAFF_DEACTIVATED', { staffId, reason, sessionsEnded: ended });
    return { success: true, data: { id: staffId, active, sessionsEnded: ended } };
  });
}

/** Ends every session of a staff member (lost or shared device) without changing their PIN. */
export async function endStaffSessions(database: Database, actor: Staff, staffId: string, body: unknown) {
  requireAdmin(actor); const { reason } = parse(reasonSchema, body);
  notSelf(actor, staffId, 'end sessions for');
  return database.transaction(async (db) => {
    if (!(await db.query('SELECT 1 FROM staff WHERE id=$1', [staffId])).rowCount)
      throw new NotFoundException({ code: 'STAFF_NOT_FOUND', message: 'Staff account not found.' });
    const ended = (await db.query('DELETE FROM sessions WHERE staff_id=$1', [staffId])).rowCount;
    await audit(db, actor.id, 'STAFF_SESSIONS_ENDED', { staffId, reason, sessionsEnded: ended });
    return { success: true, data: { id: staffId, sessionsEnded: ended } };
  });
}

/**
 * Issues a new PIN on an administrator's request and returns it once. Deliberately not wrapped in
 * an idempotency key: stored replay responses would keep the PIN in the database.
 */
export async function adminResetPin(database: Database, actor: Staff, staffId: string, body: unknown) {
  requireAdmin(actor); const { reason } = parse(reasonSchema, body);
  notSelf(actor, staffId, 'reset the PIN of');
  const pin = await issuePin(database, staffId, actor.id, reason);
  return { success: true, data: { id: staffId, pin } };
}

/**
 * Enrols (or re-enrols) an authenticator app: stores a new TOTP secret, ends existing sessions
 * and returns the secret and otpauth URI to show once. Re-enrolling invalidates the old app.
 */
export async function enrolMfa(database: Database, staffId: string, actorId: string | null) {
  const secret = generateTotpSecret();
  const staffNumber = await database.transaction(async (db) => {
    const updated = await db.query('UPDATE staff SET mfa_secret=$2,mfa_enrolled_at=now(),mfa_last_step=NULL WHERE id=$1 RETURNING staff_number', [staffId, secret]);
    if (!updated.rowCount) throw new NotFoundException({ code: 'STAFF_NOT_FOUND', message: 'Staff account not found.' });
    await db.query('DELETE FROM sessions WHERE staff_id=$1', [staffId]);
    await audit(db, actorId, 'STAFF_MFA_ENROLLED', { staffId, via: actorId ? 'admin' : 'operator-cli' });
    return updated.rows[0].staff_number as string;
  });
  return { secret, uri: otpauthUri(secret, staffNumber) };
}

/** Removes an authenticator app (lost phone). Administrators then cannot sign in until re-enrolled. */
export async function removeMfa(database: Database, staffId: string, actorId: string | null) {
  await database.transaction(async (db) => {
    const updated = await db.query('UPDATE staff SET mfa_secret=NULL,mfa_enrolled_at=NULL,mfa_last_step=NULL WHERE id=$1', [staffId]);
    if (!updated.rowCount) throw new NotFoundException({ code: 'STAFF_NOT_FOUND', message: 'Staff account not found.' });
    await db.query('DELETE FROM sessions WHERE staff_id=$1', [staffId]);
    await audit(db, actorId, 'STAFF_MFA_REMOVED', { staffId, via: actorId ? 'admin' : 'operator-cli' });
  });
}

/** Rejects PINs that are trivially guessable: one repeated digit or a straight run. */
export function isWeakPin(pin: string) {
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = [...pin].map(Number);
  const step = digits[1] - digits[0];
  return Math.abs(step) === 1 && digits.every((d, i) => i === 0 || d - digits[i - 1] === step);
}

/** A uniformly random PIN of PIN_LENGTH digits that is not trivially guessable. */
export function generatePin() {
  for (;;) {
    const pin = String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0');
    if (!isWeakPin(pin)) return pin;
  }
}

/**
 * Issues a new random PIN, ends every session of that staff member and clears their failed-PIN
 * count. Returns the PIN, which is shown once and never stored in plain text.
 * `actorId` is the administrator who did it, or null for the operator command line.
 */
export async function issuePin(database: Database, staffId: string, actorId: string | null, reason: string) {
  const pin = generatePin();
  await database.transaction(async (db) => {
    const updated = await db.query('UPDATE staff SET pin_hash=$2 WHERE id=$1', [staffId, pinHash(pin)]);
    if (!updated.rowCount) throw new NotFoundException({ code: 'STAFF_NOT_FOUND', message: 'Staff account not found.' });
    const ended = await db.query('DELETE FROM sessions WHERE staff_id=$1', [staffId]);
    await db.query('DELETE FROM auth_rate_limits WHERE key_hash=$1', [hash(accountKey(staffId))]);
    await audit(db, actorId, 'STAFF_PIN_RESET', { staffId, reason, sessionsEnded: ended.rowCount, via: actorId ? 'admin' : 'operator-cli' });
  });
  return pin;
}
