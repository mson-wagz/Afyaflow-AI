/**
 * @file apiAdapter.js
 * Hospital queue and workload query adapter.
 * Handles approved priorities, elapsed wait times, and polling failure simulation.
 */

import { TRIAGE_PRIORITY } from '../../../../shared/contracts/triage.js';
import { sortQueueByApprovedPriority, calculateWorkloadSnapshot } from '../../../../shared/contracts/queue.js';

let queueData = [
  {
    visitId: 'SYN-PT-8819',
    patientName: 'Mary Wanjiku',
    age: 62,
    gender: 'Female',
    arrivalTime: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
    presentingComplaint: 'Severe abdominal pain, persistent vomiting',
    approvedPriority: TRIAGE_PRIORITY.ORANGE,
    assessmentStatus: 'APPROVED',
    pendingProposal: null,
    assignedDepartment: 'Emergency Medicine',
    clinicianAssigned: 'Dr. Kamau Otieno',
  },
  {
    visitId: 'SYN-PT-8812',
    patientName: 'Zuberi Ouma',
    age: 48,
    gender: 'Male',
    arrivalTime: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    presentingComplaint: 'Acute laceration on forearm, bleeding controlled',
    approvedPriority: TRIAGE_PRIORITY.YELLOW,
    assessmentStatus: 'APPROVED',
    pendingProposal: null,
    assignedDepartment: 'Surgical Triage',
    clinicianAssigned: 'Jane Mwangi, RN',
  },
  {
    visitId: 'SYN-PT-8821',
    patientName: 'Kofi Mwangi',
    age: 34,
    gender: 'Male',
    arrivalTime: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    presentingComplaint: 'Acute chest tightness, fever',
    approvedPriority: null, // Unapproved!
    assessmentStatus: 'PENDING_CLINICAL_DECISION',
    pendingProposal: {
      priority: TRIAGE_PRIORITY.ORANGE,
      rule: 'SATS Tachypnoea + Fever',
    },
    assignedDepartment: 'Triage Holding',
    clinicianAssigned: null,
  },
  {
    visitId: 'SYN-PT-8825',
    patientName: 'Halima Hassan (Awaiting Agent Assessment)',
    age: 26,
    gender: 'Female',
    arrivalTime: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    presentingComplaint: 'Mild headache, nausea',
    approvedPriority: null, // No agent result yet
    assessmentStatus: 'AWAITING_ASSESSMENT',
    pendingProposal: null,
    assignedDepartment: 'Admissions Desk',
    clinicianAssigned: null,
  },
  {
    visitId: 'SYN-PT-8805',
    patientName: 'Grace Adhiambo',
    age: 45,
    gender: 'Female',
    arrivalTime: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
    presentingComplaint: 'Routine prescription renewal, stable hypertension',
    approvedPriority: TRIAGE_PRIORITY.GREEN,
    assessmentStatus: 'APPROVED',
    pendingProposal: null,
    assignedDepartment: 'General Outpatient',
    clinicianAssigned: 'Dr. Kamau Otieno',
  },
];

/**
 * Retrieves the hospital queue with approved ordering.
 * Strict: Visits awaiting agent results remain visible (QUEUE-01).
 * Pending proposals do NOT reorder approved entries (QUEUE-02).
 * 
 * @param {boolean} simulateFailure If true, throws network error to test stale snapshot handling
 * @returns {Promise<{ queue: object[], snapshotTimestamp: string, workload: object }>}
 */
export async function apiFetchQueueData(simulateFailure = false) {
  await new Promise((resolve) => setTimeout(resolve, 100));

  if (simulateFailure) {
    throw new Error('Network timeout: Facility API unreachable (simulated polling failure)');
  }

  const sortedQueue = sortQueueByApprovedPriority(queueData);
  const workload = calculateWorkloadSnapshot(sortedQueue, 4);

  return {
    queue: sortedQueue,
    snapshotTimestamp: new Date().toISOString(),
    workload,
  };
}
