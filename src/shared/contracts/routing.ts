/**
 * @file routing.js
 * Browser-safe contracts and department service models for Hospital Department Routing.
 * 
 * Follows specs/frontend/department-routing/spec.md & specs/features/department-routing/spec.md
 */

export const HOSPITAL_DEPARTMENTS = [
  {
    id: 'DEP-EMERGENCY',
    name: 'Emergency & Resuscitation (Resus 1/2)',
    code: 'RESUS',
    targetPriorities: ['RED', 'ORANGE'],
    totalBeds: 8,
    occupiedBeds: 6,
    status: 'OPEN',
    waitEstimateMinutes: 0,
    specialty: 'Immediate life support and acute stabilization',
  },
  {
    id: 'DEP-ACUTE-MED',
    name: 'Acute Medical Unit',
    code: 'ACUTE-MED',
    targetPriorities: ['ORANGE', 'YELLOW'],
    totalBeds: 16,
    occupiedBeds: 14,
    status: 'CONGESTED',
    waitEstimateMinutes: 25,
    specialty: 'Adult acute illnesses, severe infection, decompensation',
  },
  {
    id: 'DEP-PAEDS',
    name: 'Paediatric Outpatient & Triage',
    code: 'PAEDS',
    targetPriorities: ['RED', 'ORANGE', 'YELLOW', 'GREEN'],
    totalBeds: 12,
    occupiedBeds: 5,
    status: 'OPEN',
    waitEstimateMinutes: 15,
    specialty: 'Children under 12 years of age',
  },
  {
    id: 'DEP-SURGERY',
    name: 'Surgical Triage & Minor Theatre',
    code: 'SURG-MIN',
    targetPriorities: ['ORANGE', 'YELLOW'],
    totalBeds: 10,
    occupiedBeds: 7,
    status: 'OPEN',
    waitEstimateMinutes: 30,
    specialty: 'Acute trauma, lacerations, burns, fractures',
  },
  {
    id: 'DEP-GOPD',
    name: 'General Outpatient Clinic',
    code: 'GOPD',
    targetPriorities: ['GREEN'],
    totalBeds: 24,
    occupiedBeds: 20,
    status: 'OPEN',
    waitEstimateMinutes: 45,
    specialty: 'Stable and non-acute outpatient consultations',
  },
];

/**
 * Generates an automated department routing proposal based on approved priority and complaint.
 * 
 * Strict: ROUTE-04. Service capacity NEVER implies a downgrade in clinical urgency.
 * 
 * @param {object} patient
 * @param {object} approvedPriority
 * @param {Array<object>} departmentList
 * @returns {object} Routing proposal
 */
export function generateRoutingProposal(patient, approvedPriority, departmentList = HOSPITAL_DEPARTMENTS) {
  if (!patient || !approvedPriority) {
    return {
      recommendedDepartment: null,
      serviceSnapshot: null,
      evidenceRationale: 'Requires completed and approved clinical triage assessment before routing.',
      isEligible: false,
    };
  }

  const prioCode = approvedPriority.code;
  const age = Number(patient.age) || 30;
  const complaint = (patient.presentingComplaint || '').toLowerCase();

  let targetDepId = 'DEP-GOPD';
  let rationale = '';

  if (prioCode === 'RED') {
    targetDepId = 'DEP-EMERGENCY';
    rationale = 'Immediate Resuscitation required based on approved RED priority.';
  } else if (age < 12) {
    targetDepId = 'DEP-PAEDS';
    rationale = `Paediatric patient (${age}y) meets age criteria for Paediatric Emergency Triage.`;
  } else if (complaint.includes('trauma') || complaint.includes('wound') || complaint.includes('fracture') || complaint.includes('burn')) {
    targetDepId = 'DEP-SURGERY';
    rationale = 'Surgical/trauma presentation indicated in chief complaint.';
  } else if (prioCode === 'ORANGE') {
    targetDepId = 'DEP-EMERGENCY';
    rationale = 'Very Urgent (Orange) presentation requires monitored Emergency department bay.';
  } else if (prioCode === 'YELLOW') {
    targetDepId = 'DEP-ACUTE-MED';
    rationale = 'Urgent (Yellow) medical assessment assigned to Acute Medical Unit.';
  } else {
    targetDepId = 'DEP-GOPD';
    rationale = 'Routine (Green) priority routed to General Outpatient consultation.';
  }

  const selectedDepartment = departmentList.find((d) => d.id === targetDepId) || departmentList[0];
  const isCongested = selectedDepartment.status === 'CONGESTED';

  return {
    isEligible: true,
    patientId: patient.id,
    approvedPriority: prioCode,
    recommendedDepartment: selectedDepartment,
    evidenceRationale: rationale,
    capacityWarning: isCongested ? `Warning: ${selectedDepartment.name} is currently congested (${selectedDepartment.occupiedBeds}/${selectedDepartment.totalBeds} beds). Urgency remains intact.` : null,
    generatedAt: new Date().toISOString(),
    protocolVersion: 'AfyaFlow-Routing-Engine-v2026.1',
  };
}

export interface Department {
  id: string;
  name: string;
  status: 'OPEN' | 'CLOSED';
  totalBeds: number;
  occupiedBeds: number;
  services: string[];
  version: number;
  updatedAt: string;
}

export interface RoutingProposal {
  patientId: string;
  patientName: string;
  approvedPriority: string;
  currentDepartment: string | null;
  proposedDepartment: string;
  rationale: string;
  timestamp: string;
}

export interface GetDepartmentsResponse {
  departments: Department[];
}

export interface GetRoutingProposalsResponse {
  proposals: RoutingProposal[];
}

export interface UpdateRoutingRequest {
  patientId: string;
  departmentId: string;
  rationale: string;
  assessmentVersion: number;
  departmentVersion: number;
}

export interface UpdateRoutingResponse {
  success: boolean;
  transferId: string;
}