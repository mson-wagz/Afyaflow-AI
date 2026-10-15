/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Database, audit, id } from './db.js';
import { pinHash } from '../auth/auth.js';
import { SYNTHETIC_STAFF_FIXTURES } from '../../../shared/contracts/auth.js';
import { HOSPITAL_DEPARTMENTS } from '../../../shared/contracts/routing.js';
import { createDemoState } from '../../../shared/fixtures/demo.js';

export async function seed(database: Database) {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_SYNTHETIC_SEED !== 'true'
  )
    throw new Error(
      'Synthetic seeding is disabled in production unless ALLOW_SYNTHETIC_SEED=true.',
    );
  await database.transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(741093)');
    for (const staff of SYNTHETIC_STAFF_FIXTURES) {
      const { pin, ...profile } = staff;
      await db.query(
        'INSERT INTO staff(id,staff_number,role,pin_hash,profile) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',
        [
          staff.id,
          staff.staffNumber,
          staff.role,
          pinHash(pin),
          JSON.stringify(profile),
        ],
      );
    }
    for (const department of HOSPITAL_DEPARTMENTS)
      await db.query(
        'INSERT INTO departments(id,data) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',
        [department.id, JSON.stringify(department)],
      );
    const fixtures = createDemoState();
    for (const visit of fixtures.visits as any[]) {
      const exists = (
        await db.query('SELECT 1 FROM visits WHERE id=$1', [visit.id])
      ).rowCount;
      if (exists) continue;
      await db.query(
        `INSERT INTO visits(id,name,age,gender,complaint,registered_by,arrival_at,approved_priority,assessment_version,
        assessment_status,assigned_department,observation_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          visit.id,
          visit.name,
          visit.age,
          visit.gender,
          visit.presentingComplaint,
          'STAFF-101',
          visit.arrivalTime,
          visit.approvedPriority?.code || null,
          visit.approvedPriority ? 1 : 0,
          visit.approvedPriority ? 'APPROVED' : 'AWAITING_ASSESSMENT',
          visit.assignedDepartment,
          visit.observationVersion,
        ],
      );
      const pair = fixtures.cases.find((c) => c.patientId === visit.id);
      const observations = pair?.latestObservation
        ? [pair.baselineObservation, pair.latestObservation]
        : [visit.vitals || {}];
      for (let index = 0; index < observations.length; index++) {
        const { recordedAt: time, ...vitals } = observations[index] as any;
        await db.query(
          'INSERT INTO observations(id,visit_id,version,vitals,recorded_by,recorded_at) VALUES($1,$2,$3,$4,$5,$6)',
          [
            id('OBS'),
            visit.id,
            index + 1,
            JSON.stringify(vitals),
            'STAFF-101',
            time || new Date().toISOString(),
          ],
        );
      }
      await audit(
        db,
        'STAFF-101',
        'SYNTHETIC_FIXTURE_SEEDED',
        {
          synthetic: true,
          approvedPriority: visit.approvedPriority?.code || null,
        },
        visit.id,
      );
    }
  });
}
if (
  process.argv[1]?.endsWith('seed.ts') ||
  process.argv[1]?.endsWith('seed.js')
) {
  const database = new Database();

  seed(database)
    .then(() => {
      console.log(
        'Synthetic staff, departments and visits seeded (existing records retained).',
      );
    })
    .catch((error) => {
      console.error('Database seeding failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await database.onModuleDestroy();
    });
}
