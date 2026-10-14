import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { Context } from 'aws-lambda';
import { lambdaDatabase } from './bootstrap.js';
const sqs=new SQSClient({maxAttempts:2});

export async function handler(_event:unknown,context:Context) {
  context.callbackWaitsForEmptyEventLoop=false;
  const queueUrl=process.env.AGENT_QUEUE_URL;
  if(!queueUrl) throw new Error('AGENT_QUEUE_URL is required.');
  const database=await lambdaDatabase();
  const {dispatchAgentOutbox}=await import('../modules/agent-jobs.js');
  const sent=await dispatchAgentOutbox(database,async job=>{
    await sqs.send(new SendMessageCommand({QueueUrl:queueUrl,MessageBody:JSON.stringify(job)}));
  });
  console.log(JSON.stringify({event:'agent_jobs_dispatched',count:sent}));
  return {sent};
}
