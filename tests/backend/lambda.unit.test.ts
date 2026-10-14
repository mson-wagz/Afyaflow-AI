import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SQSEvent } from 'aws-lambda';
import { handleAgentRecords } from '../../src/backend/src/lambda/worker.js';
import { trustedCloudFrontSource } from '../../src/backend/src/auth/ingress.js';

const job={runId:'RUN-12345678-1234-1234-1234-123456789abc',generation:1};
function event(bodies:string[]):SQSEvent {
  return {Records:bodies.map((body,index)=>({messageId:`message-${index}`,body}))} as SQSEvent;
}
test('SQS handler reports only failed records, preserving successful deliveries',async()=>{
  const seen:any[]=[];
  const result=await handleAgentRecords(event([JSON.stringify(job),'not json',JSON.stringify({...job,generation:2})]),async message=>{
    seen.push(message);
    if(message.generation===2)throw new Error('Transient database failure');
  });
  assert.deepEqual(seen,[job,{...job,generation:2}]);
  assert.deepEqual(result,{batchItemFailures:[{itemIdentifier:'message-1'},{itemIdentifier:'message-2'}]});
});
test('SQS handler rejects injected patient data, missing versions and invalid job IDs',async()=>{
  const invalid=[{},null,{...job,generation:0},{...job,generation:'1'},{...job,patientId:'other-patient'},{...job,runId:'invalid'}];
  const result=await handleAgentRecords(event(invalid.map(value=>JSON.stringify(value))),async()=>assert.fail('Invalid job executed'));
  assert.equal(result.batchItemFailures.length,invalid.length);
});
test('SQS handler acknowledges successful deliveries without exposing job content',async()=>{
  assert.deepEqual(await handleAgentRecords(event([JSON.stringify(job)]),async()=>{}),{batchItemFailures:[]});
});
test('viewer addresses require a valid CloudFront origin token',()=>{
  const token='test-only-origin-token-1234567890abcdef';
  const headers={'x-afyaflow-origin-token':token,'cloudfront-viewer-address':'192.0.2.10:45678'};
  assert.equal(trustedCloudFrontSource(headers,token),'192.0.2.10');
  assert.equal(trustedCloudFrontSource({...headers,'cloudfront-viewer-address':'[2001:db8::1]:1234'},token),'2001:db8::1');
  assert.equal(trustedCloudFrontSource({...headers,'x-afyaflow-origin-token':'forged'},token),null);
  assert.equal(trustedCloudFrontSource({...headers,'cloudfront-viewer-address':'invalid'},token),null);
  assert.equal(trustedCloudFrontSource({'x-forwarded-for':'192.0.2.10'},token),null);
});
