import type { Context } from 'aws-lambda';
import { lambdaDatabase } from './bootstrap.js';

export async function handler(event:{seedSynthetic?:boolean},context:Context) {
  context.callbackWaitsForEmptyEventLoop=false;
  const database=await lambdaDatabase();
  const {migrate}=await import('../database/migrate.js');
  await migrate(database);
  if(event.seedSynthetic) {
    if(process.env.ALLOW_SYNTHETIC_SEED!=='true') throw new Error('Synthetic seeding is disabled.');
    const {seed}=await import('../database/seed.js');
    await seed(database);
  }
  return {migrated:true};
}
