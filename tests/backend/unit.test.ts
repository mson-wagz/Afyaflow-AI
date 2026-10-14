import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinHash, pinMatches, requireClinical, parse } from '../../src/backend/src/auth/auth.js';
import { requestKey } from '../../src/backend/src/modules/workflow.service.js';
import { registrationSchema, observationsSchema, decisionSchema } from '../../src/backend/src/modules/patients/schemas.js';

const intake = { name: 'Synthetic Patient', age: '30', gender: 'Female', presentingComplaint: 'Synthetic headache' };

test('PIN hashes use independent salts and reject the wrong PIN', () => {
  const first = pinHash('1234'), second = pinHash('1234');
  assert.notEqual(first, second);
  assert.equal(pinMatches('1234', first), true);
  assert.equal(pinMatches('4321', first), false);
});

test('clinical roles are allowed while clerk, admin and unknown roles are denied', () => {
  for (const role of ['nurse', 'clinician', 'doctor'])
    assert.doesNotThrow(() => requireClinical({ id: 'unit-staff', name: 'Test', role }));
  for (const role of ['clerk', 'admin', 'unknown', ''])
    assert.throws(() => requireClinical({ id: 'unit-staff', name: 'Test', role }), (error: any) =>
      error.getStatus() === 403 && error.getResponse().code === 'PERMISSION_DENIED');
});

test('retry keys enforce length and type at the HTTP boundary', () => {
  for (const key of [undefined, null, 123, '', 'a'.repeat(7), 'a'.repeat(151)])
    assert.throws(() => requestKey(key), (error: any) => error.getResponse().code === 'IDEMPOTENCY_KEY_REQUIRED');
  assert.equal(requestKey('a'.repeat(8)), 'a'.repeat(8));
  assert.equal(requestKey('a'.repeat(150)), 'a'.repeat(150));
});

test('registration normalizes numeric entries and leaves unrecorded observations absent', () => {
  const result = parse(registrationSchema, { ...intake, name: '  Synthetic Patient  ', heartRate: '78', spO2: '', avpu: null });
  assert.equal(result.name, 'Synthetic Patient');
  assert.equal(result.age, 30);
  assert.equal(result.heartRate, 78);
  assert.equal(result.spO2, undefined);
  assert.equal(result.avpu, undefined);
});

test('registration rejects invalid demographics and injected authority fields', () => {
  for (const patch of [{ age: '' }, { age: -1 }, { age: 131 }, { age: 1.5 }, { name: ' ' },
    { gender: 'invalid' }, { presentingComplaint: '' }, { role: 'doctor' }, { approvedPriority: 'RED' }])
    assert.equal(registrationSchema.safeParse({ ...intake, ...patch }).success, false);
});

test('observations accept entry boundaries and reject out-of-range or nonfinite readings', () => {
  for (const temperature of [28, 45])
    assert.equal(observationsSchema.safeParse({ expectedVersion: 1, vitals: { temperature } }).success, true);
  for (const heartRate of [19, 261, Infinity, NaN, 'invalid', true])
    assert.equal(observationsSchema.safeParse({ expectedVersion: 1, vitals: { heartRate } }).success, false);
});

test('observations require an integer version and reject demographic injection', () => {
  for (const expectedVersion of [0, -1, 1.5, '1'])
    assert.equal(observationsSchema.safeParse({ expectedVersion, vitals: {} }).success, false);
  assert.equal(observationsSchema.safeParse({ expectedVersion: 1, vitals: { name: 'Injected' } }).success, false);
});

test('decisions require evidence references and a meaningful reason', () => {
  const valid = { patientId: 'patient', proposalId: 'proposal', observationVersion: 1, decision: 'APPROVED', reason: 'Reviewed evidence' };
  assert.equal(decisionSchema.safeParse(valid).success, true);
  for (const patch of [{ proposalId: '' }, { observationVersion: 0 }, { reason: '   ' },
    { decision: 'AUTO_APPROVED' }, { overridePriority: 'BLUE' }])
    assert.equal(decisionSchema.safeParse({ ...valid, ...patch }).success, false);
});

test('schema failures expose structured validation errors', () => {
  assert.throws(() => parse(registrationSchema, {}), (error: any) => {
    assert.equal(error.getStatus(), 400);
    assert.equal(error.getResponse().code, 'VALIDATION_ERROR');
    assert.ok(error.getResponse().errors.fieldErrors.name);
    return true;
  });
});
