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
  host:process.env.HOST || '127.0.0.1',port:Number(process.env.PORT || 3000),
  origins:(process.env.APP_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(','),
  region:process.env.AWS_REGION || 'eu-west-1',provider,bedrockModel,openaiModel,model:provider==='ollama'?policy.ollamaModel:provider==='openai'?openaiModel:bedrockModel,
  agentTimeout:Number(process.env.AGENT_TIMEOUT_MS || 90000),maxSteps:Number(process.env.AGENT_MAX_STEPS || 8),
  secureCookies:process.env.NODE_ENV === 'production',
};
if(!Number.isInteger(config.databasePoolMax) || config.databasePoolMax<1 || config.databasePoolMax>20)
  throw new Error('DATABASE_POOL_MAX must be between 1 and 20.');
export const databaseSsl = process.env.DATABASE_SSL === 'true'
  ? {rejectUnauthorized:true, ...(process.env.DATABASE_CA_FILE ? {ca:readFileSync(process.env.DATABASE_CA_FILE,'utf8')} : {})}
  : undefined;
if (!Number.isInteger(config.maxSteps) || config.maxSteps<1 || config.maxSteps>16)
  throw new Error('AGENT_MAX_STEPS must be between 1 and 16.');
if (!Number.isFinite(config.agentTimeout) || config.agentTimeout<1000 || config.agentTimeout>240000)
  throw new Error('AGENT_TIMEOUT_MS must be between 1000 and 240000 (below the worker lease).');
