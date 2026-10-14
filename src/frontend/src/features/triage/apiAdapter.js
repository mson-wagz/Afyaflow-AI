/**
 * @file apiAdapter.js
 * Sourced triage proposal and clinical decision review API adapter.
 * Supports MCP tool traces, deterministic protocol scoring, and audit logging.
 */

import {
  TRIAGE_PRIORITY,
  PROTOCOL_METADATA,
  calculateSatsScore,
  CLINICAL_DECISION_TYPES,
} from '../../../../shared/contracts/triage.js';
import { isClinicalRole } from '../../../../shared/contracts/auth.js';

let triageDecisionHistory = [
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
    protocolReference: `${PROTOCOL_METADATA.name} v${PROTOCOL_METADATA.version}`,
    toolTraceId: 'trace-run-8819-01',
    serverAcknowledged: true,
  },
];

// Active synthetic proposals pending clinical review
let pendingProposals = [
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

/**
 * Retrieves pending triage proposals with calculated SATS protocol citations and tool traces
 */
export async function apiGetPendingTriageProposals() {
  await new Promise((resolve) => setTimeout(resolve, 100));

  return pendingProposals.map((item) => {
    const scoringResult = calculateSatsScore(item.observations);

    const toolTrace = {
      runId: `run-${item.patientId}-${item.observationVersion}`,
      timestamp: item.observations.recordedAt,
      model: 'qwen-2.5-7b-instruct (local open-weights)',
      toolCalls: [
        {
          tool: 'custom_mcp_get_observations',
          inputs: { patientId: item.patientId, version: item.observationVersion },
          outputs: item.observations,
          durationMs: 42,
        },
        {
          tool: 'borrowed_mcp_read_protocol_resource',
          inputs: { path: '/protocols/sats/adult_discriminators_v2026.1.json' },
          outputs: { protocol: PROTOCOL_METADATA.name, version: PROTOCOL_METADATA.version, authority: PROTOCOL_METADATA.authority },
          durationMs: 18,
        },
        {
          tool: 'custom_mcp_calculate_sats_score',
          inputs: { vitals: item.observations },
          outputs: scoringResult,
          durationMs: 12,
        },
      ],
    };

    return {
      ...item,
      proposal: scoringResult,
      protocol: PROTOCOL_METADATA,
      toolTrace,
    };
  });
}

/**
 * Submits an authorised clinical decision on a triage proposal
 * 
 * Strict: Only clinical roles can approve (TRIAGE-04).
 * Rejection / overrides require a recorded reason.
 */
export async function apiSubmitClinicalDecision(staff, {
  patientId,
  decision,
  overridePriority = null,
  reason,
  toolTraceId,
}) {
  await new Promise((resolve) => setTimeout(resolve, 150));

  if (!staff || !isClinicalRole(staff.role)) {
    return {
      success: false,
      error: {
        status: 403,
        code: 'PERMISSION_DENIED',
        message: `Clinical approval authority required. Role "${staff?.role || 'Guest'}" cannot commit triage decisions.`,
      },
    };
  }

  if ((decision === CLINICAL_DECISION_TYPES.OVERRIDE || decision === CLINICAL_DECISION_TYPES.REJECT) && (!reason || reason.trim().length < 5)) {
    return {
      success: false,
      error: {
        status: 400,
        code: 'REASON_REQUIRED',
        message: 'A clinical justification reason (minimum 5 characters) is required for overrides and rejections.',
      },
    };
  }

  const patient = pendingProposals.find((p) => p.patientId === patientId);
  const patientName = patient ? patient.patientName : 'Unknown Patient';

  const scoring = patient ? calculateSatsScore(patient.observations) : null;
  const committedPriority = overridePriority || (scoring ? scoring.priority : TRIAGE_PRIORITY.YELLOW);

  const decisionRecord = {
    decisionId: `DEC-${Date.now()}`,
    patientId,
    patientName,
    decision,
    priority: committedPriority,
    reason: reason || 'Confirmed SATS deterministic protocol calculations and clinical discriminators.',
    clinicianId: staff.id,
    clinicianName: staff.name,
    clinicianRole: staff.role,
    timestamp: new Date().toISOString(),
    protocolReference: `${PROTOCOL_METADATA.name} v${PROTOCOL_METADATA.version}`,
    toolTraceId: toolTraceId || `trace-${patientId}`,
    serverAcknowledged: true,
  };

  triageDecisionHistory.unshift(decisionRecord);

  // Remove or update pending proposal
  pendingProposals = pendingProposals.filter((p) => p.patientId !== patientId);

  return {
    success: true,
    data: decisionRecord,
  };
}

/**
 * Retrieves the full authorised decision audit history
 */
export function apiGetTriageDecisionHistory() {
  return [...triageDecisionHistory];
}
