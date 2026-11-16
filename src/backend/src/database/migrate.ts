import { readFile } from 'node:fs/promises';
import { Database } from './db.js';
export async function migrate(database: Database) {
  await database.transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(741092)');
    await db.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz DEFAULT now())',
    );
    if (
      !(await db.query("SELECT 1 FROM schema_migrations WHERE version='001'"))
        .rowCount
    ) {
      await db.query(
        await readFile('src/backend/src/database/001_initial.sql', 'utf8'),
      );
      await db.query("INSERT INTO schema_migrations(version) VALUES('001')");
    }
    if (
      !(await db.query("SELECT 1 FROM schema_migrations WHERE version='002'"))
        .rowCount
    ) {
      await db.query(
        await readFile('src/backend/src/database/002_append_only.sql', 'utf8'),
      );
      await db.query("INSERT INTO schema_migrations(version) VALUES('002')");
    }
    if (
      !(await db.query("SELECT 1 FROM schema_migrations WHERE version='003'"))
        .rowCount
    ) {
      await db.query(
        await readFile('src/backend/src/database/003_lambda.sql', 'utf8'),
      );
      await db.query("INSERT INTO schema_migrations(version) VALUES('003')");
    }
    if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='004'")).rowCount) {
      await db.query(await readFile('src/backend/src/database/004_research.sql','utf8'));
      await db.query("INSERT INTO schema_migrations(version) VALUES('004')");
    }
    if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='005'")).rowCount) {
      await db.query(await readFile('src/backend/src/database/005_followups.sql','utf8'));
      await db.query("INSERT INTO schema_migrations(version) VALUES('005')");
    }
    if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='006'")).rowCount) {
      await db.query(await readFile('src/backend/src/database/006_access_log.sql','utf8'));
      await db.query("INSERT INTO schema_migrations(version) VALUES('006')");
    }
    if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='007'")).rowCount) {
      await db.query(await readFile('src/backend/src/database/007_session_activity.sql','utf8'));
      await db.query("INSERT INTO schema_migrations(version) VALUES('007')");
    }
    if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='008'")).rowCount) {
      await db.query(await readFile('src/backend/src/database/008_staff_mfa.sql','utf8'));
      await db.query("INSERT INTO schema_migrations(version) VALUES('008')");
    }
    if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='009'")).rowCount) {
      await db.query(await readFile('src/backend/src/database/009_staff_lifecycle.sql','utf8'));
      await db.query("INSERT INTO schema_migrations(version) VALUES('009')");
    }
    if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='010'")).rowCount) {
      await db.query(await readFile('src/backend/src/database/010_queue_ties.sql','utf8'));
      await db.query("INSERT INTO schema_migrations(version) VALUES('010')");
    }
    if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='011'")).rowCount) {
      await db.query(await readFile('src/backend/src/database/011_visit_outcomes.sql','utf8'));
      await db.query("INSERT INTO schema_migrations(version) VALUES('011')");
    }
  });
}
if (
  process.argv[1]?.endsWith('migrate.ts') ||
  process.argv[1]?.endsWith('migrate.js')
) {
  const database = new Database();

  migrate(database)
    .then(() => {
      console.log('Database migrations applied.');
    })
    .catch((error) => {
      console.error('Database migrations failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await database.onModuleDestroy();
    });
}
