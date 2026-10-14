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

import { readDemoState, updateDemoState, clinicalActionError } from '../../demo/store.js';

/**
 * Retrieves pending triage proposals with calculated SATS protocol citations and tool traces
 */
export async function apiGetPendingTriageProposals() {
  await new Promise((resolve) => setTimeout(resolve, 100));

  return readDemoState().visits.filter(v => v.needsReview).map(v => ({
    ...v, patientId:v.id, patientName:v.name, observations:v.vitals || {}, isStale:false,
  })).map((item) => {
    const scoringResult = calculateSatsScore(item.observations);

    const toolTrace = {
      runId: `run-${item.patientId}-${item.observationVersion}`,
      timestamp: item.observations.recordedAt,
      simulation: true,
      model: 'Simulated trace — no model or MCP server executed',
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
  observationVersion,
}) {
  await new Promise((resolve) => setTimeout(resolve, 150));

  const policyError = clinicalActionError(staff);
  if (policyError) return {success:false,error:policyError};

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

  const patient = readDemoState().visits.find(p => p.id === patientId && p.needsReview);
  const fail = (code,message) => ({success:false,error:{status:409,code,message}});
  if (!patient) return fail('PROPOSAL_NOT_FOUND','This proposal was already decided or does not exist.');
  if (observationVersion !== undefined && observationVersion !== patient.observationVersion)
    return fail('STALE_PROPOSAL','Observations changed. Refresh the proposal before deciding.');
  if (!Object.values(CLINICAL_DECISION_TYPES).includes(decision)) return fail('INVALID_DECISION','Invalid decision.');
  if (decision === CLINICAL_DECISION_TYPES.OVERRIDE && !TRIAGE_PRIORITY[overridePriority?.code])
    return fail('INVALID_PRIORITY','Select a valid override priority.');
  const patientName = patient.name;

  const scoring = calculateSatsScore(patient.vitals || {});
  if (decision === CLINICAL_DECISION_TYPES.APPROVE && !scoring?.isSufficientEvidence)
    return fail('INSUFFICIENT_EVIDENCE','Record missing observations or use a justified manual override.');
  const committedPriority = decision === CLINICAL_DECISION_TYPES.REJECT ? patient.approvedPriority :
    (decision === CLINICAL_DECISION_TYPES.OVERRIDE ? TRIAGE_PRIORITY[overridePriority.code] : scoring.priority);

  const decisionRecord = {
    decisionId: `DEC-${crypto.randomUUID()}`,
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
    serverAcknowledged: false, simulation: true,
  };

  updateDemoState(state => {
    const visit = state.visits.find(v => v.id === patientId);
    visit.approvedPriority = committedPriority;
    visit.needsReview = false;
    visit.assessmentStatus = decision === CLINICAL_DECISION_TYPES.REJECT ? 'REJECTED_REQUIRES_REASSESSMENT' : 'APPROVED';
    visit.clinicianAssigned = staff.name;
    state.decisions.unshift(decisionRecord);
  });

  return {
    success: true,
    data: decisionRecord,
  };
}

/**
 * Retrieves the full authorised decision audit history
 */
export function apiGetTriageDecisionHistory() {
  return readDemoState().decisions;
}
