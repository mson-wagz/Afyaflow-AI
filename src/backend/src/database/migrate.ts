import { readFile } from 'node:fs/promises';
import { Database } from './db.js';
export async function migrate(database:Database) {
  await database.transaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(741092)');
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
    if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='001'")).rowCount) {
      // SQL is retained in the source tree in both development and the container image.
      await db.query(await readFile('src/backend/src/database/001_initial.sql','utf8'));
      await db.query("INSERT INTO schema_migrations(version) VALUES('001')");
    }
    if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='002'")).rowCount) {
      await db.query(await readFile('src/backend/src/database/002_append_only.sql','utf8'));
      await db.query("INSERT INTO schema_migrations(version) VALUES('002')");
    }
    if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='003'")).rowCount) {
      await db.query(await readFile('src/backend/src/database/003_lambda.sql','utf8'));
      await db.query("INSERT INTO schema_migrations(version) VALUES('003')");
    }
    if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='004'")).rowCount) {
      await db.query(await readFile('src/backend/src/database/004_research.sql','utf8'));
      await db.query("INSERT INTO schema_migrations(version) VALUES('004')");
    }
  });
}
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  const database=new Database();
  try {await migrate(database);console.log('Database migrations applied.');} finally {await database.onModuleDestroy();}
}
