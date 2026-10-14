/**
 * @file apiAdapter.js
 * Synthetic patient registration and timestamped observation persistence adapter.
 * Supports retry-safe idempotent submissions.
 */

import { readDemoState, updateDemoState, isDemoOnline } from '../../demo/store.js';
import { validatePatientRegistration, validateObservationData } from '../../../../shared/contracts/patient.js';

/**
 * Submits a new patient registration and observation record.
 * Idempotent: repeated clicks with the same idempotency key return the existing record.
 * 
 * @param {object} registrationData
 * @param {string} idempotencyKey
 * @returns {Promise<{ success: boolean, data?: object, isDuplicate?: boolean, error?: string }>}
 */
export async function apiRegisterPatient(registrationData, idempotencyKey) {
  await new Promise((resolve) => setTimeout(resolve, 150));

  if (!isDemoOnline()) return { success:false, error:'Registration must be saved as an offline draft.' };
  const state = readDemoState();
  const validation = validatePatientRegistration(registrationData);
  const observations = validateObservationData(registrationData);
  if (!validation.valid || !observations.valid) return {success:false,error:'Invalid registration or observations.'};
  if (idempotencyKey && state.registrationKeys[idempotencyKey]) {
    return {
      success: true,
      data: state.registrationKeys[idempotencyKey],
      isDuplicate: true,
    };
  }

  const visitId = `SYN-PT-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  const record = {
    id: visitId,
    name: registrationData.name.trim(),
    age: Number(registrationData.age),
    gender: registrationData.gender,
    arrivalTime: registrationData.arrivalTime || now,
    presentingComplaint: registrationData.presentingComplaint.trim(),
    vitals: {
      systolicBp: registrationData.systolicBp || null,
      diastolicBp: registrationData.diastolicBp || null,
      heartRate: registrationData.heartRate || null,
      respiratoryRate: registrationData.respiratoryRate || null,
      temperature: registrationData.temperature || null,
      spO2: registrationData.spO2 || null,
      avpu: registrationData.avpu || null,
      mobility: registrationData.mobility || null,
      recordedAt: now,
    },
    registeredByStaff: registrationData.staffId || 'STAFF-101',
    status: 'AWAITING_TRIAGE_APPROVAL',
    serverConfirmedAt: now,
    simulation: true,
  };

  updateDemoState(state => {
    state.visits.unshift({...record, visitId:record.id, patientName:record.name,
      observationVersion:1, approvedPriority:null, needsReview:true,
      assessmentStatus:'AWAITING_ASSESSMENT', assignedDepartment:'Triage Holding'});
    if (idempotencyKey) state.registrationKeys[idempotencyKey] = record;
  });
  return {
    success: true,
    data: record,
    isDuplicate: false,
  };
}

/**
 * Returns all synthetic visits
 */
export function apiGetRegisteredVisits() {
  return readDemoState().visits;
}
