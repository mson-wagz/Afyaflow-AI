import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openaiModel } from '../../services/agents/openai.js';
import type { Message, Tool } from '@aws-sdk/client-bedrock-runtime';
const tools:Tool[]=[{toolSpec:{name:'get_observations',inputSchema:{json:{type:'object',properties:{},required:[],additionalProperties:false}}}}];
const signal=AbortSignal.timeout(10000);
const initial:Message={role:'user',content:[{text:'Synthetic assessment'}]};
test('Responses maps strict tools, retains reasoning and pairs tool outputs without remote storage',async()=>{
  const bodies:any[]=[];
  const output=[{type:'reasoning',id:'rs_1',encrypted_content:'opaque',summary:[]},
    {type:'function_call',call_id:'call_1',name:'get_observations',arguments:'{}'}];
  const transport:typeof fetch=async(url,init)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init?.signal,signal);
    bodies.push(JSON.parse(init?.body as string));
    return Response.json({status:'completed',output:bodies.length===1?output:[{type:'message',content:[{type:'output_text',text:'Done'}]}],usage:{input_tokens:10}});
  };
  const model=openaiModel('test-model',{apiKey:'test-key',fetch:transport});
  const first=await model([initial],tools,signal);
  assert.deepEqual(first.content,[{toolUse:{toolUseId:'call_1',name:'get_observations',input:{}}}]);
  await model([initial,{role:'assistant',content:first.content},{role:'user',content:[{toolResult:{toolUseId:'call_1',content:[{text:'synthetic evidence'}]}}]}],tools,signal);
  assert.equal(bodies[0].store,false);assert.equal(bodies[0].parallel_tool_calls,false);
  assert.equal(bodies[0].tools[0].strict,true);
  assert.deepEqual(bodies[1].input.slice(1,3),output);
  assert.deepEqual(bodies[1].input[3],{type:'function_call_output',call_id:'call_1',output:'synthetic evidence'});
  assert.equal(bodies[1].input.length,4);
});
test('Responses fails closed on incomplete, refused, unapproved and malformed outputs',async()=>{
  for(const response of [
    {status:'incomplete',output:[]},
    {status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]},
    ...[['approve','{}'],['get_observations','[]'],['get_observations','bad json']].map(([name,args])=>({status:'completed',output:[{type:'function_call',call_id:'x',name,arguments:args}]})),
  ]) {
    const model=openaiModel('test',{apiKey:'test-key',fetch:async()=>Response.json(response)});
    await assert.rejects(model([initial],tools,signal));
  }
});
test('Responses excludes provider error bodies and honors cancellation',async()=>{
  const model=openaiModel('test',{apiKey:'secret',fetch:async()=>new Response('sensitive provider body',{status:429})});
  await assert.rejects(model([initial],tools,signal),{message:'OpenAI request failed (HTTP 429).'});
  const cancelled=AbortSignal.abort();
  const abortModel=openaiModel('test',{apiKey:'secret',fetch:async(_url,init)=>{init?.signal?.throwIfAborted();throw new Error('unexpected');}});
  await assert.rejects(abortModel([initial],tools,cancelled),{name:'AbortError'});
});
