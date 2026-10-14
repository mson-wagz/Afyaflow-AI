/**
 * @file apiAdapter.js
 * Synthetic patient registration and timestamped observation persistence adapter.
 * Supports retry-safe idempotent submissions.
 */

import { generateSubmissionIdempotencyKey } from '../../../../shared/contracts/patient.js';

// Internal synthetic patient visit database
let registeredVisits = [
  {
    id: 'SYN-PT-8821',
    name: 'Kofi Mwangi',
    age: 34,
    gender: 'Male',
    arrivalTime: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    presentingComplaint: 'Acute chest tightness, fever, difficulty breathing',
    vitals: {
      systolicBp: '142',
      diastolicBp: '88',
      heartRate: '108',
      respiratoryRate: '24',
      temperature: '38.6',
      spO2: '94',
      avpu: 'Alert',
      mobility: 'Walking normally',
      recordedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    },
    status: 'AWAITING_TRIAGE_APPROVAL',
  },
  {
    id: 'SYN-PT-8819',
    name: 'Mary Wanjiku',
    age: 62,
    gender: 'Female',
    arrivalTime: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
    presentingComplaint: 'Severe abdominal pain, persistent vomiting',
    vitals: {
      systolicBp: '110',
      diastolicBp: '70',
      heartRate: '98',
      respiratoryRate: '20',
      temperature: '37.8',
      spO2: '97',
      avpu: 'Alert',
      mobility: 'Needs assistance to walk',
      recordedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    status: 'TRIAGED_APPROVED',
  },
];

// Track submitted idempotency keys to guarantee retry safety
const processedIdempotencyKeys = new Map();

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

  if (idempotencyKey && processedIdempotencyKeys.has(idempotencyKey)) {
    return {
      success: true,
      data: processedIdempotencyKeys.get(idempotencyKey),
      isDuplicate: true,
    };
  }

  const visitId = `SYN-PT-${Math.floor(1000 + Math.random() * 9000)}`;
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
      avpu: registrationData.avpu || 'Alert',
      mobility: registrationData.mobility || 'Walking normally',
      recordedAt: now,
    },
    registeredByStaff: registrationData.staffId || 'STAFF-101',
    status: 'AWAITING_TRIAGE_APPROVAL',
    serverConfirmedAt: now,
  };

  registeredVisits.unshift(record);

  if (idempotencyKey) {
    processedIdempotencyKeys.set(idempotencyKey, record);
  }

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
  return [...registeredVisits];
}
