/**
 * Operator command line for staff accounts, run on the server with database access:
 *
 *   node dist/src/backend/src/admin/staff-admin.js list
 *   node dist/src/backend/src/admin/staff-admin.js reset-pin <staffId>
 *
 * Locally: npm run staff:admin -- <command> [args]
 * On EC2 (from /opt/afyaflow, as root):
 *   docker compose --env-file .env --project-name afyaflow exec app \
 *     node dist/src/backend/src/admin/staff-admin.js reset-pin STAFF-104
 *
 * A new PIN is printed once. Give it to the staff member privately; it is stored only as a hash.
 */
import { Database } from '../database/db.js';
import { issuePin } from './staff-accounts.js';

const usage = 'Usage: staff-admin <list | reset-pin <staffId>>';

export async function run(database: Database, [command, staffId]: string[], print: (line: string) => void) {
  if (command === 'list') {
    const rows = (await database.pool.query("SELECT id,staff_number,role,profile->>'name' name FROM staff ORDER BY id")).rows;
    for (const r of rows) print(`${r.id}\t${r.staff_number}\t${r.role}\t${r.name ?? ''}`);
    return;
  }
  if (command === 'reset-pin' && staffId) {
    const pin = await issuePin(database, staffId, null, 'Operator command line reset');
    print(`New PIN for ${staffId}: ${pin}`);
    print('All of this staff member\'s sessions were ended. Share the PIN privately.');
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
