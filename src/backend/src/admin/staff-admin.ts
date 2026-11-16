/**
 * Operator command line for staff accounts, run on the server with database access:
 *
 *   node dist/src/backend/src/admin/staff-admin.js list
 *   node dist/src/backend/src/admin/staff-admin.js reset-pin <staffId>
 *   node dist/src/backend/src/admin/staff-admin.js enroll-mfa <staffId>   (administrators)
 *   node dist/src/backend/src/admin/staff-admin.js remove-mfa <staffId>   (lost phone)
 *
 * Locally: npm run staff:admin -- <command> [args]
 * On EC2 (from /opt/afyaflow, as root):
 *   docker compose --env-file .env --project-name afyaflow exec app \
 *     node dist/src/backend/src/admin/staff-admin.js reset-pin STAFF-104
 *
 * A new PIN is printed once. Give it to the staff member privately; it is stored only as a hash.
 */
import { Database } from '../database/db.js';
import { issuePin, enrolMfa, removeMfa } from './staff-accounts.js';

const usage = 'Usage: staff-admin <list | reset-pin <staffId> | enroll-mfa <staffId> | remove-mfa <staffId>>';

export async function run(database: Database, [command, staffId]: string[], print: (line: string) => void) {
  if (command === 'list') {
    const rows = (await database.pool.query("SELECT id,staff_number,role,profile->>'name' name,mfa_secret IS NOT NULL mfa FROM staff ORDER BY id")).rows;
    for (const r of rows) print(`${r.id}\t${r.staff_number}\t${r.role}\t${r.name ?? ''}${r.mfa ? '\tMFA' : ''}`);
    return;
  }
  if (command === 'reset-pin' && staffId) {
    const pin = await issuePin(database, staffId, null, 'Operator command line reset');
    print(`New PIN for ${staffId}: ${pin}`);
    print('All of this staff member\'s sessions were ended. Share the PIN privately.');
    return;
  }
  if (command === 'enroll-mfa' && staffId) {
    const { secret, uri } = await enrolMfa(database, staffId, null);
    print(`Authenticator setup key for ${staffId}: ${secret}`);
    print(`otpauth URI (for QR code tools): ${uri}`);
    print('In the authenticator app choose "Enter a setup key", type the key, time-based. Any previous app no longer works.');
    return;
  }
  if (command === 'remove-mfa' && staffId) {
    await removeMfa(database, staffId, null);
    print(`Authenticator removed for ${staffId}; administrators cannot sign in until re-enrolled.`);
    return;
  }
  throw new Error(usage);
}

if (process.argv[1]?.endsWith('staff-admin.ts') || process.argv[1]?.endsWith('staff-admin.js')) {
  const database = new Database();
  run(database, process.argv.slice(2), (line) => console.log(line))
    .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
    .finally(() => database.onModuleDestroy());
}
