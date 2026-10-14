import 'dotenv/config';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let initialization:Promise<void>|undefined;
export function initializeLambda() {
  if(!initialization) initialization=loadConfiguration().catch(error=>{initialization=undefined;throw error;});
  return initialization;
}
async function loadConfiguration() {
  if(!process.env.DATABASE_URL && process.env.DATABASE_SECRET_ARN) {
    const client=new SecretsManagerClient({});
    try {
      const response=await client.send(new GetSecretValueCommand({SecretId:process.env.DATABASE_SECRET_ARN}));
      const secret=JSON.parse(response.SecretString || '{}');
      if(typeof secret.cloudfrontOriginToken==='string') process.env.CLOUDFRONT_ORIGIN_TOKEN=secret.cloudfrontOriginToken;
      if(typeof secret.DATABASE_URL==='string') process.env.DATABASE_URL=secret.DATABASE_URL;
      else {
        const host=process.env.DATABASE_HOST || secret.host;
        const name=process.env.DATABASE_NAME || secret.dbname;
        if(!host || !name || !secret.username || !secret.password) throw new Error('Database secret is missing required fields.');
        process.env.DATABASE_URL=`postgresql://${encodeURIComponent(secret.username)}:${encodeURIComponent(secret.password)}@${host}:${secret.port || 5432}/${encodeURIComponent(name)}`;
      }
    } finally {client.destroy();}
  }
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL or DATABASE_SECRET_ARN is required.');
  if(process.env.REQUIRE_CLOUDFRONT_ORIGIN==='true' && (!process.env.CLOUDFRONT_ORIGIN_TOKEN || process.env.CLOUDFRONT_ORIGIN_TOKEN.length<32))
    throw new Error('A cloudfrontOriginToken of at least 32 characters is required in the database secret.');
  // Set these before dynamically importing modules that evaluate configuration.
  process.env.AGENT_WORKER_DISABLED='true';
  process.env.DATABASE_POOL_MAX ||= '2';
}

let databasePromise:Promise<import('../database/db.js').Database>|undefined;
export function lambdaDatabase() {
  if(!databasePromise) databasePromise=(async()=>{
    await initializeLambda();
    const {Database}=await import('../database/db.js');
    return new Database();
  })().catch(error=>{databasePromise=undefined;throw error;});
  return databasePromise;
}
