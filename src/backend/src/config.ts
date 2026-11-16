import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { runtimePolicy } from './runtime-policy.js';
const policy=runtimePolicy(process.env);
const {provider}=policy;
const bedrockModel=process.env.BEDROCK_MODEL_ID || 'eu.amazon.nova-lite-v1:0';
const openaiModel=process.env.OPENAI_MODEL || 'gpt-4.1-mini';
export const config = {
  ...policy,
  databaseUrl:process.env.DATABASE_URL || '',
  databasePoolMax:Number(process.env.DATABASE_POOL_MAX || (process.env.AWS_LAMBDA_FUNCTION_NAME ? 2 : 10)),
  cloudfrontOriginToken:process.env.CLOUDFRONT_ORIGIN_TOKEN || '',
  // Set only where a reverse proxy overwrites the client-IP header and the app port is not public.
  trustProxyClientIp:process.env.TRUST_PROXY_CLIENT_IP === 'true',
  host:process.env.HOST || '127.0.0.1',port:Number(process.env.PORT || 3000),
  origins:(process.env.APP_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(','),
  region:process.env.AWS_REGION || 'eu-west-1',provider,bedrockModel,openaiModel,model:provider==='ollama'?policy.ollamaModel:provider==='openai'?openaiModel:bedrockModel,
  agentTimeout:Number(process.env.AGENT_TIMEOUT_MS || 90000),maxSteps:Number(process.env.AGENT_MAX_STEPS || 8),
  secureCookies:process.env.NODE_ENV === 'production',
  // Sessions with no authenticated request for this long are locked server-side (PIN required).
  sessionIdleMinutes:Number(process.env.SESSION_IDLE_MINUTES || 15),
  // Content-Security-Policy is report-only until the deployed site is confirmed violation-free.
  cspMode:process.env.CSP_MODE || 'report-only',
  // Bounds paid model calls: each new or retried assessment counts once.
  agentRunsPerStaffHour:Number(process.env.AGENT_RUNS_PER_STAFF_HOUR || 20),
  agentRunsPerHour:Number(process.env.AGENT_RUNS_PER_HOUR || 100),
};
for (const [name,value] of [['AGENT_RUNS_PER_STAFF_HOUR',config.agentRunsPerStaffHour],['AGENT_RUNS_PER_HOUR',config.agentRunsPerHour]] as const)
  if(!Number.isInteger(value) || value<1 || value>100000) throw new Error(`${name} must be an integer between 1 and 100000.`);
if(!['report-only','enforce'].includes(config.cspMode)) throw new Error('CSP_MODE must be report-only or enforce.');
if(!Number.isInteger(config.sessionIdleMinutes) || config.sessionIdleMinutes<1 || config.sessionIdleMinutes>480)
  throw new Error('SESSION_IDLE_MINUTES must be an integer between 1 and 480.');
if(!Number.isInteger(config.databasePoolMax) || config.databasePoolMax<1 || config.databasePoolMax>20)
  throw new Error('DATABASE_POOL_MAX must be between 1 and 20.');
export const databaseSsl = process.env.DATABASE_SSL === 'true'
  ? {rejectUnauthorized:true, ...(process.env.DATABASE_CA_FILE ? {ca:readFileSync(process.env.DATABASE_CA_FILE,'utf8')} : {})}
  : undefined;
if (!Number.isInteger(config.maxSteps) || config.maxSteps<1 || config.maxSteps>16)
  throw new Error('AGENT_MAX_STEPS must be between 1 and 16.');
if (!Number.isFinite(config.agentTimeout) || config.agentTimeout<1000 || config.agentTimeout>240000)
  throw new Error('AGENT_TIMEOUT_MS must be between 1000 and 240000 (below the worker lease).');
