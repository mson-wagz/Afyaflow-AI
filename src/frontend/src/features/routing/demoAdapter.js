/**
 * @file apiAdapter.js
 * Department routing and facility service snapshot API adapter.
 */

import { HOSPITAL_DEPARTMENTS, generateRoutingProposal } from '../../../../shared/contracts/routing.js';

let departmentStatusList = [...HOSPITAL_DEPARTMENTS];

import { readDemoState, updateDemoState, clinicalActionError } from '../../demo/store.js';

export async function apiFetchDepartmentSnapshot() {
  await new Promise((resolve) => setTimeout(resolve, 80));
  return [...departmentStatusList];
}

export async function apiFetchRoutingCandidates() {
  await new Promise((resolve) => setTimeout(resolve, 100));

  return readDemoState().visits.filter(v => v.approvedPriority).map(v => ({...v,currentLocation:v.assignedDepartment})).map((pt) => {
    const proposal = generateRoutingProposal(pt, pt.approvedPriority, departmentStatusList);
    return {
      ...pt,
      proposal,
    };
  });
}

export async function apiCommitDepartmentTransfer(staff, { patientId, departmentId, rationale }) {
  await new Promise((resolve) => setTimeout(resolve, 150));

  const policyError = clinicalActionError(staff);
  if (policyError) return {success:false,error:policyError.message};
  const candidate = readDemoState().visits.find(c => c.id === patientId && c.approvedPriority);
  const department = departmentStatusList.find((d) => d.id === departmentId);

  if (!candidate || !department) {
    return { success: false, error: 'Patient or department not found.' };
  }

  const transferId = `TRF-${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  updateDemoState(state => {
    const visit = state.visits.find(v => v.id === patientId);
    visit.assignedDepartment = department.name;
    state.transfers.unshift({transferId, patientId, departmentId, clinicianId:staff.id, rationale, timestamp});
  });

  return {
    success: true,
    data: {
      transferId,
      patientId: candidate.id,
      patientName: candidate.name,
      department: department.name,
      approvedPriority: candidate.approvedPriority,
      clinicianName: staff?.name || 'Staff Clinician',
      timestamp: new Date().toISOString(),
      rationale: rationale || 'Transfer confirmed based on approved triage assessment.',
      serverAcknowledged: false, simulation: true,
    },
  };
}
