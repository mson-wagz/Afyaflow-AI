import { randomInt } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { Database, audit, hash } from '../database/db.js';
import { pinHash } from '../auth/auth.js';
import { PIN_LENGTH } from '../../../shared/contracts/auth.js';
import { accountKey } from '../auth/rate-limit.js';

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
