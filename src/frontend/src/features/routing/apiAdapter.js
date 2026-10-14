/**
 * @file apiAdapter.js
 * Department routing and facility service snapshot API adapter.
 */

import { HOSPITAL_DEPARTMENTS, generateRoutingProposal } from '../../../../shared/contracts/routing.js';
import { TRIAGE_PRIORITY } from '../../../../shared/contracts/triage.js';

let departmentStatusList = [...HOSPITAL_DEPARTMENTS];

let routingCandidates = [
  {
    id: 'SYN-PT-8821',
    name: 'Kofi Mwangi',
    age: 34,
    gender: 'Male',
    presentingComplaint: 'Acute chest tightness, fever, difficulty breathing',
    approvedPriority: TRIAGE_PRIORITY.ORANGE,
    currentLocation: 'Triage Holding Area',
    targetDepartment: null,
  },
  {
    id: 'SYN-PT-8812',
    name: 'Zuberi Ouma',
    age: 48,
    gender: 'Male',
    presentingComplaint: 'Acute laceration on forearm, bleeding controlled',
    approvedPriority: TRIAGE_PRIORITY.YELLOW,
    currentLocation: 'Admissions Waiting Area',
    targetDepartment: null,
  },
  {
    id: 'SYN-PT-8840',
    name: 'Zawadi Wanjala (Paediatric)',
    age: 4,
    gender: 'Female',
    presentingComplaint: 'Persistent cough, high fever, lethargy',
    approvedPriority: TRIAGE_PRIORITY.ORANGE,
    currentLocation: 'Triage Desk',
    targetDepartment: null,
  },
];

export async function apiFetchDepartmentSnapshot() {
  await new Promise((resolve) => setTimeout(resolve, 80));
  return [...departmentStatusList];
}

export async function apiFetchRoutingCandidates() {
  await new Promise((resolve) => setTimeout(resolve, 100));

  return routingCandidates.map((pt) => {
    const proposal = generateRoutingProposal(pt, pt.approvedPriority, departmentStatusList);
    return {
      ...pt,
      proposal,
    };
  });
}

export async function apiCommitDepartmentTransfer(staff, { patientId, departmentId, rationale }) {
  await new Promise((resolve) => setTimeout(resolve, 150));

  const candidate = routingCandidates.find((c) => c.id === patientId);
  const department = departmentStatusList.find((d) => d.id === departmentId);

  if (!candidate || !department) {
    return { success: false, error: 'Patient or department not found.' };
  }

  candidate.targetDepartment = department.name;
  candidate.currentLocation = `${department.name} (Transferred)`;

  return {
    success: true,
    data: {
      transferId: `TRF-${Date.now()}`,
      patientId: candidate.id,
      patientName: candidate.name,
      department: department.name,
      approvedPriority: candidate.approvedPriority,
      clinicianName: staff?.name || 'Staff Clinician',
      timestamp: new Date().toISOString(),
      rationale: rationale || 'Transfer confirmed based on approved triage assessment.',
      serverAcknowledged: true,
    },
  };
}
