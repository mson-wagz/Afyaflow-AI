import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDangerSigns } from '../../src/shared/contracts/danger-signs.js';

test('danger signs are accepted only from the approved list and only with a quote from the complaint',()=>{
  const complaint='Severe chest pain since morning,   short of breath';
  const {accepted,rejected}=validateDangerSigns([
    {sign:'chest_pain',quote:'Chest   pain'},                 // case and spacing ignored
    {sign:'chest_pain',quote:'chest pain'},                   // duplicate kept once
    {sign:'seizure',quote:'fitting'},                         // not in the complaint
    {sign:'stroke',quote:'chest pain'},                       // not on the list
    {sign:'difficulty_breathing',quote:'sh'},                 // too short to be a real quote
  ],complaint);
  assert.deepEqual(accepted,[{sign:'chest_pain',label:'Chest pain',quote:'Chest   pain'}]);
  assert.deepEqual(rejected.map(r=>r.reason),['Quote not found in the complaint','Not on the approved list','Quote missing or too long']);
  assert.deepEqual(validateDangerSigns(undefined,complaint),{accepted:[],rejected:[]});
});
