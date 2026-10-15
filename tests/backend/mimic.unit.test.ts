import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMimicDemo, transformMimic, mimicFiles } from '../../src/backend/src/database/mimic-data.js';
import { scoreEvidence, readProtocol } from '../../services/mcp/tools.js';
const stay={stay_id:'123',subject_id:'456',gender:'F',intime:'2150-01-01 12:00:00',disposition:'HOME'};
const triage={stay_id:'123',subject_id:'456',temperature:'98.6',heartrate:'75',resprate:'16',sbp:'120',dbp:'80',o2sat:'98',acuity:'3',pain:'2',chiefcomplaint:'Example source complaint'};
test('MIMIC mapping preserves provenance, converts Fahrenheit and leaves age/AVPU/mobility absent',async()=>{
  const [record]=transformMimic([stay],[triage]);
  assert.equal(record.vitals.temperature,37);assert.equal(record.vitals.heartRate,75);
  assert.equal(record.age,null);assert.equal(record.vitals.avpu,undefined);assert.equal(record.vitals.mobility,undefined);
  assert.equal(record.sourceData.sourceAcuity,3);assert.deepEqual(record.sourceData.raw.triage,triage);
  assert.equal(record.sourceData.originalArrival,stay.intime);assert.equal(record.sourceData.raw.edstay.disposition,'HOME');
  assert.equal(record.id,transformMimic([stay],[triage])[0].id);
  const score=scoreEvidence({...record,observationId:'obs',version:1},await readProtocol());
  assert.equal(score.priority,null);assert.equal(score.score,null);assert.equal(score.isSufficientEvidence,false);
  assert.ok(score.missingEvidence.includes('age'));assert.ok(score.missingEvidence.includes('avpu'));
});
test('MIMIC mapping flags unsupported values and never guesses Celsius or missing observations',()=>{
  const [record]=transformMimic([stay],[{...triage,temperature:'37',heartrate:'not numeric',o2sat:'',acuity:'8'}]);
  assert.equal(record.vitals.temperature,undefined);assert.equal(record.vitals.heartRate,undefined);
  assert.equal(record.vitals.spO2,undefined);assert.equal(record.sourceData.sourceAcuity,null);
  assert.equal(record.sourceData.warnings.length,3);assert.equal(record.sourceData.raw.triage?.temperature,'37');
  const [absent]=transformMimic([stay],[]);assert.deepEqual(absent.vitals,{});
  assert.equal(absent.complaint,'Not recorded in source');assert.ok(absent.sourceData.warnings.length);
});
test('MIMIC mapping rejects duplicate, orphaned and mismatched source identifiers',()=>{
  assert.throws(()=>transformMimic([stay,stay],[triage]));
  assert.throws(()=>transformMimic([stay],[triage,triage]));
  assert.throws(()=>transformMimic([stay],[{...triage,subject_id:'999'}]));
  assert.throws(()=>transformMimic([], [triage]));
});
test('Bundled public demo verifies checksums and has 222 stays, 64 patients and 15 absent ESI labels',async()=>{
  const cases=await loadMimicDemo();
  assert.equal(cases.length,222);assert.equal(new Set(cases.map(item=>item.sourceData.subjectId)).size,64);
  assert.equal(cases.filter(item=>item.sourceData.sourceAcuity===null).length,15);
  assert.equal(cases.filter(item=>item.sourceData.warnings.length).length,2);
  assert.ok(cases.every(item=>item.age===null && item.vitals.avpu===undefined && item.vitals.mobility===undefined));
  const directory=await mkdtemp(join(tmpdir(),'afyaflow-mimic-'));
  try {
    await mkdir(join(directory,'ed'));
    for(const name of Object.keys(mimicFiles))await writeFile(join(directory,name),await readFile(`data/mimic-iv-ed-demo-2.2/${name}`));
    await writeFile(join(directory,'ed/triage.csv.gz'),'corrupt');
    await assert.rejects(loadMimicDemo(directory),/checksum mismatch/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
