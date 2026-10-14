import type { Context, SQSEvent } from 'aws-lambda';
import { lambdaDatabase } from './bootstrap.js';

export async function handleAgentRecords(event:SQSEvent,process:(job:{runId:string;generation:number})=>Promise<void>) {
  const batchItemFailures:{itemIdentifier:string}[]=[];
  for(const record of event.Records) {
    try {
      const body=JSON.parse(record.body);
      if(!body || Object.keys(body).some(key=>!['runId','generation'].includes(key)) ||
        typeof body.runId!=='string' || !/^RUN-[a-f0-9-]{36}$/.test(body.runId) ||
        !Number.isSafeInteger(body.generation) || body.generation<1) throw new Error('Invalid agent delivery.');
      await process(body);
    } catch {batchItemFailures.push({itemIdentifier:record.messageId});}
  }
  return {batchItemFailures};
}
export async function handler(event:SQSEvent,context:Context) {
  context.callbackWaitsForEmptyEventLoop=false;
  const database=await lambdaDatabase();
  const {processAgentJob}=await import('../modules/agent-jobs.js');
  return handleAgentRecords(event,job=>processAgentJob(database,job));
}
