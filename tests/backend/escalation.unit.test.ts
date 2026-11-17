import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escalationSettings, africasTalkingSender, snsSender, smsSender } from '../../src/backend/src/modules/escalation.js';

const env={SMS_PROVIDER:'africastalking',AT_USERNAME:'sandbox',AT_API_KEY:'test-key',ONCALL_PHONE:'+254700000001'};

test('SMS escalation is off by default and validated when enabled',()=>{
  assert.equal(escalationSettings({}).provider,'none');
  assert.equal(escalationSettings(env).environment,'sandbox');
  assert.throws(()=>escalationSettings({...env,ONCALL_PHONE:'0700000001'}),/international number/);
  assert.throws(()=>escalationSettings({...env,AT_API_KEY:''}),/AT_API_KEY/);
  assert.throws(()=>escalationSettings({SMS_PROVIDER:'twilio'}),/none, africastalking or sns/);
  assert.throws(()=>escalationSettings({ESCALATION_GRACE_MINUTES:'0'}),/between 1 and 120/);
  assert.equal(escalationSettings({}).checkSeconds,60);
  assert.equal(escalationSettings({ESCALATION_CHECK_SECONDS:'15'}).checkSeconds,15);
  assert.throws(()=>escalationSettings({ESCALATION_CHECK_SECONDS:'5'}),/between 15 and 300/);
});

test("Africa's Talking request goes to the sandbox with the key in a header, and statuses are read per recipient",async()=>{
  const requests:any[]=[];
  const reply=(statusCode:number)=>async(url:any,init:any)=>{requests.push({url,init});
    return new Response(JSON.stringify({SMSMessageData:{Message:'Sent to 1/1',Recipients:[{status:statusCode===101?'Success':'InvalidPhoneNumber',statusCode,messageId:'ATXid_1',cost:'KES 0.8000'}]}}),{status:201});};
  const ok=await africasTalkingSender(env,reply(101) as any).send('+254700000001','Test alert');
  assert.equal(ok.ok,true);assert.equal((ok.response as any).messageId,'ATXid_1');
  assert.equal(requests[0].url,'https://api.sandbox.africastalking.com/version1/messaging');
  assert.equal(requests[0].init.headers.apiKey,'test-key');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(requests[0].init.body)),{username:'sandbox',to:'+254700000001',message:'Test alert'});
  assert.equal((await africasTalkingSender(env,reply(403) as any).send('+254700000001','x')).ok,false);
  assert.equal(africasTalkingSender({...env,AT_ENVIRONMENT:'production'}).provider,'africastalking');
});

test('Amazon SNS needs no API key and sends a transactional SMS to the on-call number',async()=>{
  // No Africa's Talking credentials are required for SNS; the number is still validated.
  const settings=escalationSettings({SMS_PROVIDER:'sns',ONCALL_PHONE:'+254700000001'});
  assert.equal(settings.provider,'sns');assert.equal(settings.environment,'aws');
  assert.throws(()=>escalationSettings({SMS_PROVIDER:'sns',ONCALL_PHONE:'0700000001'}),/international number/);
  const sent:any[]=[];
  const ok=await snsSender({},{send:async(command:any)=>{sent.push(command.input);return {MessageId:'sns-msg-1'};}}).send('+254700000001','Test alert');
  assert.equal(ok.ok,true);assert.deepEqual(ok.response,{messageId:'sns-msg-1'});
  assert.equal(sent[0].PhoneNumber,'+254700000001');assert.equal(sent[0].Message,'Test alert');
  assert.equal(sent[0].MessageAttributes['AWS.SNS.SMS.SMSType'].StringValue,'Transactional');
  assert.equal((await snsSender({},{send:async()=>({})}).send('+254700000001','x')).ok,false);
  assert.equal(smsSender('sns').provider,'aws-sns');
  assert.equal(smsSender('africastalking').provider,'africastalking-sandbox');
});
