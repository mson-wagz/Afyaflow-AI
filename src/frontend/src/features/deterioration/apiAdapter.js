/**
 * @file apiAdapter.js
 * Deterioration monitoring and reassessment review adapter.
 * Compares timestamped observation pairs and handles clinical review actions.
 */

import { compareObservationsForDeterioration, calculateObservationAge } from '../../../../shared/contracts/deterioration.js';
import { TRIAGE_PRIORITY } from '../../../../shared/contracts/triage.js';

let deteriorationCases = [
  {
    patientId: 'SYN-PT-8819',
    patientName: 'Mary Wanjiku',
    age: 62,
    gender: 'Female',
    currentApprovedPriority: TRIAGE_PRIORITY.ORANGE,
    assignedDepartment: 'Emergency Medicine',
    baselineObservation: {
      id: 'OBS-8819-01',
      recordedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      heartRate: '98',
      systolicBp: '110',
      diastolicBp: '70',
      respiratoryRate: '20',
      temperature: '37.8',
      spO2: '97',
      avpu: 'Alert',
    },
    latestObservation: {
      id: 'OBS-8819-02',
      recordedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      heartRate: '124', // +26 bpm tachycardia!
      systolicBp: '88',  // -22 mmHg hypotension!
      diastolicBp: '56',
      respiratoryRate: '28', // +8 /min tachypnoea!
      temperature: '38.5',
      spO2: '91', // Desaturation!
      avpu: 'Voice', // Consciousness drop!
    },
    status: 'PENDING_REASSESSMENT',
  },
  {
    patientId: 'SYN-PT-8805',
    patientName: 'Grace Adhiambo (Stable Case with Stale Observations)',
    age: 45,
    gender: 'Female',
    currentApprovedPriority: TRIAGE_PRIORITY.GREEN,
    assignedDepartment: 'General Outpatient',
    baselineObservation: {
      id: 'OBS-8805-01',
      recordedAt: new Date(Date.now() - 95 * 60 * 1000).toISOString(), // 95 mins ago -> Stale!
      heartRate: '72',
      systolicBp: '126',
      diastolicBp: '82',
      respiratoryRate: '16',
      temperature: '36.6',
      spO2: '99',
      avpu: 'Alert',
    },
    latestObservation: null, // No new observations
    status: 'OBSERVATIONS_STALE',
  },
];

export async function apiFetchDeteriorationCases() {
  await new Promise((resolve) => setTimeout(resolve, 100));

  return deteriorationCases.map((c) => {
    const comparison = c.latestObservation
      ? compareObservationsForDeterioration(c.baselineObservation, c.latestObservation)
      : null;

    const lastObsTime = c.latestObservation?.recordedAt || c.baselineObservation?.recordedAt;
    const ageInfo = calculateObservationAge(lastObsTime);

    return {
      ...c,
      comparison,
      ageInfo,
    };
  });
}

export async function apiCommitReassessmentDecision(staff, { patientId, action, reason, targetPriority }) {
  await new Promise((resolve) => setTimeout(resolve, 120));

  const targetCase = deteriorationCases.find((c) => c.patientId === patientId);
  if (!targetCase) {
    return { success: false, error: 'Patient case not found' };
  }

  // Update case status
  targetCase.status = action === 'ESCALATE' ? 'REASSESSMENT_COMMITTED' : 'ALERT_DISMISSED';
  if (action === 'ESCALATE' && targetPriority) {
    targetCase.currentApprovedPriority = targetPriority;
  }

  return {
    success: true,
    data: {
      patientId,
      patientName: targetCase.patientName,
      action,
      reason,
      newPriority: targetCase.currentApprovedPriority,
      clinicianName: staff?.name || 'Jane Mwangi, RN',
      timestamp: new Date().toISOString(),
    },
  };
}
