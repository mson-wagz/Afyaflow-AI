import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readProtocol,scoreEvidence} from '../../services/mcp/tools.js';
import {evidenceChecklist} from '../../src/shared/contracts/evidence.js';

test('evidence checklist cites the actual fixture and never fills absent measurements',async()=>{
  const protocol=await readProtocol(),vitals={heartRate:75};
  const report=evidenceChecklist({age:30,vitals,version:4,observationId:'OBS-test'},protocol);
  assert.equal(report.observationVersion,4);assert.equal(report.items.find(i=>i.key==='heartRate')?.value,75);
  const missing=report.items.find(i=>i.key==='avpu')!;
  assert.equal(missing.value,null);assert.equal(missing.status,'MISSING');
  assert.equal(missing.citation.pointer,'#/requiredFields/4');
  assert.match(missing.action!,/do not infer/);assert.deepEqual(vitals,{heartRate:75});
  assert.equal(report.items.find(i=>i.key==='spO2')?.required,false);
  assert.equal(scoreEvidence({age:30,vitals,version:4,observationId:'OBS-test'},protocol).priority,null);
});

test('population evidence distinguishes missing age from a recorded unsupported population',async()=>{
  const protocol=await readProtocol();
  for(const age of [undefined,null]) {
    const report=evidenceChecklist({age,vitals:{},version:1,observationId:'OBS-test'},protocol);
    assert.ok(report.missingRequired.includes('age'));assert.equal(report.supportedPopulation,false);
  }
  const child=evidenceChecklist({age:0,vitals:{},version:1,observationId:'OBS-test'},protocol);
  assert.equal(child.items[0].status,'UNSUPPORTED');assert.equal(child.items[0].value,0);
  assert.equal(child.missingRequired.includes('age'),false);
});

test('the adult chart starts at 13, matching KNH routing of patients over 12 to the adult A&E',async()=>{
  const protocol=await readProtocol();
  const vitals={heartRate:80,systolicBp:120,respiratoryRate:16,temperature:37,avpu:'Alert'};
  assert.equal(protocol.version,'demo-v2');
  const adolescent=scoreEvidence({age:13,vitals,version:1,observationId:'OBS-test'},protocol);
  assert.equal(adolescent.isSufficientEvidence,true);assert.equal(adolescent.priority.code,'GREEN');
  assert.equal(evidenceChecklist({age:13,vitals,version:1,observationId:'OBS-test'},protocol).supportedPopulation,true);
  const child=scoreEvidence({age:12,vitals,version:1,observationId:'OBS-test'},protocol);
  assert.equal(child.priority,null);assert.match(child.ruleTriggered,/paediatric emergency pathway/);
  assert.equal(evidenceChecklist({age:12,vitals,version:1,observationId:'OBS-test'},protocol).supportedPopulation,false);
});
