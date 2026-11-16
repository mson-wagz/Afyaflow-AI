import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokensFrom, runUsage, priceFor, costUsd, hostingUsdPerMonth } from '../../src/backend/src/modules/usage.js';

test('token usage is read from every provider shape and never invented',()=>{
  assert.deepEqual(tokensFrom({inputTokens:10,outputTokens:2,totalTokens:12}),{input:10,output:2});   // Bedrock / Ollama adapter
  assert.deepEqual(tokensFrom({input_tokens:7,output_tokens:3}),{input:7,output:3});                   // OpenAI Responses
  assert.equal(tokensFrom(undefined),null);assert.equal(tokensFrom({inputTokens:5}),null);
});

test('cost uses the official Nova Lite eu-west-1 price and reproduces the recorded live run',()=>{
  const price=priceFor('bedrock','eu.amazon.nova-lite-v1:0')!;
  assert.equal(price.inputUsdPerMillion,0.069);assert.equal(price.outputUsdPerMillion,0.276);
  // EVALS.md live run: 4 model calls, 5,034 input + 331 output tokens.
  const calls=[1300,1250,1260,1224].map((input,i)=>({tool:'bedrock_converse',outputs:{usage:{inputTokens:input,outputTokens:[80,90,81,80][i]}}}));
  const usage=runUsage('bedrock','eu.amazon.nova-lite-v1:0',[...calls,{tool:'score_protocol',outputs:{}}]);
  assert.equal(usage.modelCalls,4);assert.equal(usage.toolCalls,1);
  assert.equal(usage.inputTokens,5034);assert.equal(usage.outputTokens,331);
  assert.equal(usage.costUsd,0.0004387);            // 5,034 × 0.069/1M + 331 × 0.276/1M = $0.000438702
  assert.equal(costUsd(1_000_000,1_000_000,price),0.345);
});

test('local models cost nothing per token, unknown models stay unpriced, calls without usage are flagged',()=>{
  assert.equal(runUsage('ollama','qwen3:0.6b',[{tool:'ollama_chat',outputs:{usage:{inputTokens:900,outputTokens:60}}}]).costUsd,0);
  const unknown=runUsage('openai','some-model',[{tool:'openai_responses',outputs:{usage:{input_tokens:5,output_tokens:5}}}]);
  assert.equal(unknown.costUsd,null);assert.equal(unknown.price,null);
  assert.equal(runUsage('bedrock','eu.amazon.nova-lite-v1:0',[{tool:'bedrock_converse',outputs:{}}]).unmeteredModelCalls,1);
  assert.equal(hostingUsdPerMonth(),18.84);
});

test('an operator price applies only to the model it names',()=>{
  process.env.MODEL_INPUT_USD_PER_MILLION='1';process.env.MODEL_OUTPUT_USD_PER_MILLION='2';process.env.PRICED_MODEL='gpt-4.1-mini';
  try {
    assert.equal(priceFor('openai','gpt-4.1-mini')!.inputUsdPerMillion,1);
    assert.equal(priceFor('ollama','qwen3:0.6b')!.inputUsdPerMillion,0);
    assert.equal(priceFor('bedrock','eu.amazon.nova-lite-v1:0')!.inputUsdPerMillion,0.069);
  } finally {delete process.env.MODEL_INPUT_USD_PER_MILLION;delete process.env.MODEL_OUTPUT_USD_PER_MILLION;delete process.env.PRICED_MODEL;}
});
