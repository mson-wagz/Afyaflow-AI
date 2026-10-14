/**
 * @file apiAdapter.js
 * Deterioration monitoring and reassessment review adapter.
 * Compares timestamped observation pairs and handles clinical review actions.
 */

import { compareObservationsForDeterioration, calculateObservationAge } from '../../../../shared/contracts/deterioration.js';
import { TRIAGE_PRIORITY } from '../../../../shared/contracts/triage.js';

import { readDemoState, updateDemoState, clinicalActionError } from '../../demo/store.js';

export async function apiFetchDeteriorationCases() {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const state = readDemoState();
  return state.cases.map(original => { const visit = state.visits.find(v => v.id === original.patientId);
    const c = {...original,currentApprovedPriority:visit?.approvedPriority,assignedDepartment:visit?.assignedDepartment};
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

  const policyError = clinicalActionError(staff);
  if (policyError) return {success:false,error:policyError.message};
  if (!['ESCALATE','DISMISS'].includes(action) || !reason?.trim()) return {success:false,error:'A valid action and reason are required.'};
  if (action === 'ESCALATE' && !TRIAGE_PRIORITY[targetPriority?.code]) return {success:false,error:'Invalid target priority.'};
  const targetCase = readDemoState().cases.find(c => c.patientId === patientId);
  if (!targetCase) {
    return { success: false, error: 'Patient case not found' };
  }

  const newPriority = updateDemoState(state => {
    const visit = state.visits.find(v => v.id === patientId);
    state.cases.find(c => c.patientId === patientId).status = action === 'ESCALATE' ? 'REASSESSMENT_COMMITTED' : 'ALERT_DISMISSED';
    if (action === 'ESCALATE') {
      visit.approvedPriority = TRIAGE_PRIORITY[targetPriority.code];
      visit.needsReview = false;
      visit.assessmentStatus = 'APPROVED';
      visit.clinicianAssigned = staff.name;
    }
    state.reassessments.unshift({patientId,action,reason,clinicianId:staff.id,timestamp:new Date().toISOString()});
    return visit.approvedPriority;
  });

  return {
    success: true,
    data: {
      patientId,
      patientName: targetCase.patientName,
      action,
      reason,
      newPriority, simulation:true,
      clinicianName: staff?.name || 'Jane Mwangi, RN',
      timestamp: new Date().toISOString(),
    },
  };
}
