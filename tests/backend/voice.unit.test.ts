import test from 'node:test';
import assert from 'node:assert/strict';
import {speechCandidates,validateSpeechSamples} from '../../src/shared/contracts/voice.js';

test('explicit measurements with units become reviewable candidates',() => {
  const r=speechCandidates('Pulse 110 bpm, temperature 38.5 degrees celsius','Pulse 110 bpm, temperature 38.5 degrees celsius');
  assert.equal(r.numberMismatch,false);
  assert.deepEqual(r.candidates.map(c=>[c.key,c.value,c.blocked]),[['heartRate',110,false],['temperature',38.5,false]]);
});

test('negated or hedged measurements stay blocked for manual entry',() => {
  for (const text of ['Pulse is not 110 bpm','Pulse was not 110 bpm','Temperature maybe 39 degrees celsius','Yesterday the pulse was 120 bpm']) {
    const r=speechCandidates(text,text);
    // Safe outcomes: nothing extracted, or every extracted value requires manual entry.
    assert.ok(r.candidates.every(c=>c.blocked),text);
  }
});

test('numbers changed by translation block every candidate',() => {
  const r=speechCandidates('Mapigo ya moyo 110','Pulse 120 bpm');
  assert.equal(r.numberMismatch,true);
  assert.ok(r.candidates.every(c=>c.blocked));
});

test('numbers without units are never extracted',() => {
  assert.equal(speechCandidates('fever 39','fever 39').candidates.length,0);
});

test('conflicting values for one field are blocked',() => {
  const t='Pulse 100 bpm then pulse 130 bpm';
  assert.ok(speechCandidates(t,t).candidates.every(c=>c.blocked));
});

test('implausible values are blocked',() => {
  const t='Oxygen saturation 140 percent';
  assert.ok(speechCandidates(t,t).candidates.every(c=>c.blocked));
});

test('audio sample validation rejects silence, short and oversized clips',() => {
  assert.throws(() => validateSpeechSamples(new Float32Array(100)));
  assert.throws(() => validateSpeechSamples(new Float32Array(16000)));
  assert.throws(() => validateSpeechSamples(new Float32Array(16000*21).fill(0.1)));
  assert.doesNotThrow(() => validateSpeechSamples(new Float32Array(16000).fill(0.1)));
});
