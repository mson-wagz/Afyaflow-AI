import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimePolicy, assertCompetitionRun } from '../../src/backend/src/runtime-policy.js';

test('competition rejects hosted providers, remote endpoints and cloud model tags',()=>{
  for(const env of [
    {APP_MODE:'competition',AI_PROVIDER:'openai'},
    {APP_MODE:'competition',AI_PROVIDER:'bedrock'},
    {APP_MODE:'competition',OLLAMA_URL:'https://example.com'},
    {APP_MODE:'competition',OLLAMA_URL:'http://127.0.0.1:11434/path'},
    {APP_MODE:'competition',OLLAMA_MODEL:'qwen3:cloud'},
    {APP_MODE:'unknown'},
  ])assert.throws(()=>runtimePolicy(env));
  assert.equal(runtimePolicy({APP_MODE:'competition'}).provider,'ollama');
  assert.throws(()=>assertCompetitionRun('competition','mimic-iv-ed-demo','ollama'));
  assert.throws(()=>assertCompetitionRun('competition','synthetic','openai'));
  assert.doesNotThrow(()=>assertCompetitionRun('competition','synthetic','ollama'));
});

test('Kenyan data residency requires local inference and a declared Kenyan host',()=>{
  // Hosted inference would send assessment inputs abroad.
  for(const AI_PROVIDER of ['bedrock','openai'])
    assert.throws(()=>runtimePolicy({DATA_RESIDENCY:'kenya',HOSTING_COUNTRY:'KE',AI_PROVIDER}),/AI_PROVIDER=ollama/);
  // The operator must declare the host country.
  for(const HOSTING_COUNTRY of [undefined,'','IE','ZA'])
    assert.throws(()=>runtimePolicy({DATA_RESIDENCY:'kenya',AI_PROVIDER:'ollama',HOSTING_COUNTRY}),/HOSTING_COUNTRY=KE/);
  assert.throws(()=>runtimePolicy({DATA_RESIDENCY:'nairobi'}),/unrestricted or kenya/);
  assert.deepEqual(runtimePolicy({DATA_RESIDENCY:'kenya',AI_PROVIDER:'ollama',HOSTING_COUNTRY:'ke'}).dataResidency,
    {policy:'kenya',inference:'local',hostingCountry:'KE'});
  // The default is unchanged, and reports hosted inference honestly.
  assert.deepEqual(runtimePolicy({}).dataResidency,{policy:'unrestricted',inference:'hosted',hostingCountry:null});
});
