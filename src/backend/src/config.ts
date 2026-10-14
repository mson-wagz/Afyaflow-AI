import 'dotenv/config';
import { readFileSync } from 'node:fs';
export const config = {
  databaseUrl:process.env.DATABASE_URL || '',
  host:process.env.HOST || '127.0.0.1',port:Number(process.env.PORT || 3000),
  origins:(process.env.APP_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(','),
  region:process.env.AWS_REGION || 'eu-west-1',model:process.env.BEDROCK_MODEL_ID || 'eu.amazon.nova-lite-v1:0',
  agentTimeout:Number(process.env.AGENT_TIMEOUT_MS || 90000),maxSteps:Number(process.env.AGENT_MAX_STEPS || 8),
  secureCookies:process.env.NODE_ENV === 'production',
};
export const databaseSsl = process.env.DATABASE_SSL === 'true'
  ? {rejectUnauthorized:true, ...(process.env.DATABASE_CA_FILE ? {ca:readFileSync(process.env.DATABASE_CA_FILE,'utf8')} : {})}
  : undefined;
if (!Number.isInteger(config.maxSteps) || config.maxSteps<1 || config.maxSteps>16)
  throw new Error('AGENT_MAX_STEPS must be between 1 and 16.');
if (!Number.isFinite(config.agentTimeout) || config.agentTimeout<1000 || config.agentTimeout>240000)
  throw new Error('AGENT_TIMEOUT_MS must be between 1000 and 240000 (below the worker lease).');
