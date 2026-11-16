import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { config, databaseSsl } from '../config.js';
import { createHash, randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';

export const id = (prefix:string) => `${prefix}-${randomUUID()}`;
export const hash = (value:string) => createHash('sha256').update(value).digest('hex');
@Injectable()
export class Database implements OnModuleDestroy {
  readonly pool:Pool;
  constructor() {
    if (!config.databaseUrl) throw new Error('DATABASE_URL is required. See .env.example.');
    this.pool = new Pool({connectionString:config.databaseUrl,ssl:databaseSsl,max:config.databasePoolMax,
      connectionTimeoutMillis:5000,idleTimeoutMillis:30000,allowExitOnIdle:true});
    this.pool.on('error',()=>console.error('An idle database connection failed.'));
  }
  async transaction<T>(operation:(db:PoolClient)=>Promise<T>):Promise<T> {
    const db=await this.pool.connect();
    try {await db.query('BEGIN');const result=await operation(db);await db.query('COMMIT');return result;}
    catch(error) {await db.query('ROLLBACK');throw error;}
    finally {db.release();}
  }
  async onModuleDestroy() {await this.pool.end();}
}

export async function audit(db:PoolClient,staffId:string|null,event:string,details:object,visitId:string|null=null) {
  await db.query('INSERT INTO audit_events(id,staff_id,visit_id,event_type,details) VALUES($1,$2,$3,$4,$5)',
    [id('AUD'),staffId,visitId,event,JSON.stringify(details)]);
}
// Advisory transaction lock serializes retries before any side effects are written.
export async function idempotent<T>(db:PoolClient,staffId:string,operation:string,key:string,input:object,write:()=>Promise<T>):Promise<T> {
  const requestHash=hash(JSON.stringify(input));
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${staffId}:${operation}:${key}`]);
  const previous=(await db.query('SELECT * FROM request_keys WHERE staff_id=$1 AND operation=$2 AND key=$3',[staffId,operation,key])).rows[0];
  if (previous) {
    if (previous.request_hash !== requestHash) throw new ConflictException({code:'IDEMPOTENCY_CONFLICT',message:'This retry key was used for different input.'});
    return previous.response;
  }
  const response=await write();
  await db.query('INSERT INTO request_keys(staff_id,operation,key,request_hash,response) VALUES($1,$2,$3,$4,$5)',
    [staffId,operation,key,requestHash,JSON.stringify(response)]);
  return response;
}
