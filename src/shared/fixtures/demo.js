import { TRIAGE_PRIORITY } from '../contracts/triage.js';
// Synthetic fixtures only; these are not clinical records or model outputs.
export function createDemoState() {
const queue = [
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
const registrations = [
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
const proposals = [
  {
    patientId: 'SYN-PT-8821',
    patientName: 'Kofi Mwangi',
    age: 34,
    gender: 'Male',
    arrivalTime: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    presentingComplaint: 'Acute chest tightness, fever, difficulty breathing',
    observationVersion: 1,
    observations: {
      systolicBp: '142',
      diastolicBp: '88',
      heartRate: '108',
      respiratoryRate: '24',
      temperature: '38.6',
      spO2: '94',
      avpu: 'Alert',
      recordedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    },
    isStale: false,
    toolFailureSimulated: false,
  },
  {
    patientId: 'SYN-PT-8830',
    patientName: 'Baraka Mutua (Incomplete Vitals Case)',
    age: 28,
    gender: 'Male',
    arrivalTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    presentingComplaint: 'Dizziness, general malaise',
    observationVersion: 1,
    observations: {
      systolicBp: '', // Missing
      diastolicBp: '',
      heartRate: '82',
      respiratoryRate: '', // Missing
      temperature: '36.9',
      spO2: '98',
      avpu: 'Alert',
      recordedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    },
    isStale: false,
    toolFailureSimulated: false,
  },
];
const routing = [
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
const cases = [
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
const decisions = [
  {
    decisionId: 'DEC-7701',
    patientId: 'SYN-PT-8819',
    patientName: 'Mary Wanjiku',
    decision: 'APPROVED',
    priority: TRIAGE_PRIORITY.ORANGE,
    reason: 'Verified high SATS score with acute abdominal presentation.',
    clinicianId: 'STAFF-101',
    clinicianName: 'Jane Mwangi, RN',
    clinicianRole: 'nurse',
    timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    protocolReference: 'Synthetic demo protocol',
    toolTraceId: 'trace-run-8819-01',
    serverAcknowledged: false, simulation: true,
  },
];
const visits = queue.map(q => ({...q, id:q.visitId, name:q.patientName,
  observationVersion:1, vitals:registrations.find(r => r.id === q.visitId)?.vitals || null,
  needsReview:!q.approvedPriority}));
for (const p of proposals) {
  let visit = visits.find(v => v.id === p.patientId);
  if (!visit) { visit = {id:p.patientId, visitId:p.patientId, name:p.patientName,
    patientName:p.patientName, age:p.age, gender:p.gender, arrivalTime:p.arrivalTime,
    presentingComplaint:p.presentingComplaint, approvedPriority:null,
    assignedDepartment:'Triage Holding', assessmentStatus:'AWAITING_ASSESSMENT'}; visits.push(visit); }
  Object.assign(visit,{vitals:p.observations, observationVersion:p.observationVersion, needsReview:true});
}
for (const r of routing) {
  if (!visits.some(v => v.id === r.id)) visits.push({...r, visitId:r.id, patientName:r.name,
    arrivalTime:new Date().toISOString(), assignedDepartment:r.currentLocation,
    assessmentStatus:'APPROVED', needsReview:false, observationVersion:1});
}
for (const c of cases) {
  const visit = visits.find(v => v.id === c.patientId);
  if (visit) {
    visit.vitals = c.latestObservation || c.baselineObservation;
    visit.observationVersion = c.latestObservation ? 2 : 1;
  }
}
return {visits, cases, decisions, transfers:[], reassessments:[], registrationKeys:{}};
}
