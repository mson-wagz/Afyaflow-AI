/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Inject, BadRequestException, ConflictException, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { consumeWindow } from '../auth/rate-limit.js';
import { z } from 'zod';
import { Database, audit, id, idempotent, hash } from '../database/db.js';
import { Staff, parse, requireClinical } from '../auth/auth.js';
import { registrationSchema, observationsSchema, decisionSchema, transferSchema } from './patients/schemas.js';
import { config } from '../config.js';
import { TRIAGE_PRIORITY } from '../../../shared/contracts/triage.js';
import { sortQueueByApprovedPriority, calculateWorkloadSnapshot, calculateElapsedWaitingTime } from '../../../shared/contracts/queue.js';
import { generateRoutingProposal } from '../../../shared/contracts/routing.js';
import { compareObservationsForDeterioration, calculateObservationAge } from '../../../shared/contracts/deterioration.js';
import { readProtocol } from '../../../../services/mcp/tools.js';
import type { PoolClient } from 'pg';
import { mimicMetadata } from '../database/mimic-data.js';
import { evidenceChecklist } from '../../../shared/contracts/evidence.js';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * JSON payload stored in the `data` column of the departments table.
 * NOTE: code, targetPriorities, waitEstimateMinutes and specialty are required
 * by generateRoutingProposal. If they are not stored in this JSON column,
 * source them elsewhere and adjust this type.
 */
export interface DepartmentData {
  name: string;
  code: string;
  status: 'OPEN' | 'CLOSED';
  totalBeds: number;
  occupiedBeds: number;
  services: string[];
  targetPriorities: string[];
  waitEstimateMinutes: number;
  specialty: string;
}

/** Raw department row from the database. */
export interface DepartmentRow {
  id: string;
  data: DepartmentData;
  version: number;
  updated_at: string;
}

/** Flattened department shape returned by WorkflowService.departments(). */
export interface Department extends DepartmentData {
  id: string;
  version: number;
  updatedAt: string | null;
}

/** Raw visit row (joined with its current observation) from the database. */
export interface VisitRow {
  id: string;
  name: string;
  age: number;
  gender: string;
  complaint: string;
  arrival_at: string;
  data_source: string;
  approved_priority: string | null;
  assessment_version: number;
  observation_version: number;
  observation_id: string;
  assessment_status: string;
  assigned_department: string | null;
  vitals: Record<string, any>;
  recorded_at: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const priority = (code: string | null): any => (code ? (TRIAGE_PRIORITY as any)[code] : null);

/**
 * Converts a date to an ISO string.
 * @returns ISO string, or null if the value is empty or not a valid date.
 */
const iso = (date: Date | string | null | undefined): string | null => {
  if (!date) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

/** Competition mode disables historical research and restricts traces. Off unless APP_MODE=competition. */
const isCompetitionMode = () => config.mode === 'competition';

/** Historical (MIMIC) cases are read-only in the live workflow. */
function requireWorkflowVisit(visit: any) {
  if (visit.data_source === 'mimic-iv-ed-demo')
    throw new BadRequestException({
      code: 'HISTORICAL_READ_ONLY',
      message: 'Historical research cases cannot be edited, approved, escalated or transferred.',
    });
}

function requireResearch() {
  if (isCompetitionMode()) throw new NotFoundException('Historical research is disabled in competition mode.');
}

/** Validates the Idempotency-Key header (8–150 characters). */
export function requestKey(value: unknown) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 150)
    throw new BadRequestException({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Supply an Idempotency-Key header (8–150 characters).',
    });
  return value;
}

export const AGENT_QUOTA_MESSAGE = 'The hourly AI assessment limit has been reached. Retry the assessment later or make a reasoned manual decision.';

/** Counts one model run against the per-staff and deployment-wide hourly limits. */
async function consumeAgentQuota(db: PoolClient, staffId: string | null) {
  const hour = 3600;
  if (staffId && !(await consumeWindow(db, `agent-runs:staff:${staffId}`, { limit: config.agentRunsPerStaffHour, windowSeconds: hour }))) return false;
  return consumeWindow(db, 'agent-runs:global', { limit: config.agentRunsPerHour, windowSeconds: hour });
}

/**
 * Queues an agent run for a visit's observation version (re-queues failed runs).
 * A new or retried run consumes model quota. When quota is exhausted, `reject` throws 429;
 * `record` keeps the caller's clinical write and stores a FAILED run that requires staff review.
 */
export async function enqueue(db: PoolClient, visitId: string, version: number, staffId: string | null = null, onQuota: 'record' | 'reject' = 'record') {
  const existing = (await db.query('SELECT status FROM agent_runs WHERE visit_id=$1 AND observation_version=$2', [visitId, version])).rows[0];
  if ((!existing || existing.status === 'FAILED') && !(await consumeAgentQuota(db, staffId))) {
    if (onQuota === 'reject') throw new HttpException({ code: 'AGENT_QUOTA_EXCEEDED', message: AGENT_QUOTA_MESSAGE }, HttpStatus.TOO_MANY_REQUESTS);
    const failed = (await db.query(`INSERT INTO agent_runs(id,visit_id,observation_version,model,provider,status,error,finished_at) VALUES($1,$2,$3,$4,$5,'FAILED',$6,now())
      ON CONFLICT(visit_id,observation_version) DO UPDATE SET status='FAILED',error=EXCLUDED.error,finished_at=now(),lease_until=null RETURNING *`,
      [id('RUN'), visitId, version, config.model, config.provider, AGENT_QUOTA_MESSAGE])).rows[0];
    await db.query("UPDATE visits SET assessment_status='REVIEW_REQUIRED' WHERE id=$1 AND observation_version=$2", [visitId, version]);
    await audit(db, staffId, 'AGENT_QUOTA_EXCEEDED', { runId: failed.id, observationVersion: version }, visitId);
    return failed;
  }
  const run = (await db.query(`INSERT INTO agent_runs(id,visit_id,observation_version,model,provider,status) VALUES($1,$2,$3,$4,$5,'QUEUED')
    ON CONFLICT(visit_id,observation_version) DO UPDATE SET status=CASE WHEN agent_runs.status='FAILED' THEN 'QUEUED' ELSE agent_runs.status END,
    error=CASE WHEN agent_runs.status='FAILED' THEN null ELSE agent_runs.error END,
    attempts=CASE WHEN agent_runs.status='FAILED' THEN 0 ELSE agent_runs.attempts END,
    delivery_generation=CASE WHEN agent_runs.status='FAILED' THEN agent_runs.delivery_generation+1 ELSE agent_runs.delivery_generation END,
    provider=CASE WHEN agent_runs.status='FAILED' THEN EXCLUDED.provider ELSE agent_runs.provider END,
    model=CASE WHEN agent_runs.status='FAILED' THEN EXCLUDED.model ELSE agent_runs.model END RETURNING *`, [id('RUN'), visitId, version, config.model, config.provider])).rows[0];
  if (run.status === 'QUEUED') await db.query('INSERT INTO agent_outbox(run_id,generation) VALUES($1,$2) ON CONFLICT DO NOTHING', [run.id, run.delivery_generation]);
  return run;
}

/* ------------------------------------------------------------------ */
/* Service                                                            */
/* ------------------------------------------------------------------ */

@Injectable()
export class WorkflowService {
  constructor(@Inject(Database) readonly database: Database) {}

  /** All synthetic (live workflow) visits with their latest observation. */
  async visits() {
    const rows = (await this.database.pool.query<VisitRow>(`SELECT v.*,o.id observation_id,o.vitals,o.recorded_at FROM visits v
      JOIN observations o ON o.visit_id=v.id AND o.version=v.observation_version WHERE v.data_source='synthetic' ORDER BY v.arrival_at`)).rows;
    const protocol = await readProtocol();
    return rows.map((v) => {
      // Invalid or missing arrival time falls back to "now" (0 min wait).
      const arrivalTime = iso(v.arrival_at) ?? new Date().toISOString();
      return {
        id: v.id, patientId: v.id, visitId: v.id, name: v.name, patientName: v.name, age: v.age, gender: v.gender,
        waitingTime: calculateElapsedWaitingTime(arrivalTime),
        presentingComplaint: v.complaint, arrivalTime, approvedPriority: priority(v.approved_priority),
        assessmentVersion: v.assessment_version, observationVersion: v.observation_version, observationId: v.observation_id,
        assessmentStatus: v.assessment_status, assignedDepartment: v.assigned_department,
        evidenceChecklist: evidenceChecklist({ age: v.age, vitals: v.vitals, version: v.observation_version, observationId: v.observation_id }, protocol),
        vitals: { ...v.vitals, recordedAt: iso(v.recorded_at) },
      };
    });
  }

  /** Versioned missing-evidence checklist for one workflow visit. */
  async evidence(visitId: string) {
    const visit = (await this.visits()).find((v) => v.id === visitId);
    if (!visit) throw new NotFoundException('Workflow visit not found.');
    return visit.evidenceChecklist;
  }

  /** Register a new visit and queue its first assessment. */
  async register(staff: Staff, body: unknown, key: string) {
    const input = parse(registrationSchema, body);
    if (staff.role === 'admin') throw new BadRequestException('Administrative accounts cannot register visits.');
    const { name, age, gender, presentingComplaint, arrivalTime, staffId: _ignored, voiceReview, ...vitals } = input;
    if (staff.role === 'clerk' && Object.values(vitals).some((v) => v !== undefined)) requireClinical(staff);
    return this.database.transaction((db) => idempotent(db, staff.id, 'registration', key, input, async () => {
      const visitId = id('SYN-PT'), recordedAt = new Date().toISOString();
      await db.query('INSERT INTO visits(id,name,age,gender,complaint,registered_by,arrival_at,source_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [visitId, name, age, gender, presentingComplaint, staff.id, arrivalTime || recordedAt, JSON.stringify(voiceReview ? { intake: { ...voiceReview, reviewedBy: staff.id } } : {})]);
      await db.query('INSERT INTO observations(id,visit_id,version,vitals,recorded_by) VALUES($1,$2,1,$3,$4)', [id('OBS'), visitId, JSON.stringify(vitals), staff.id]);
      const run = await enqueue(db, visitId, 1, staff.id);
      await audit(db, staff.id, 'PATIENT_REGISTERED', { observationVersion: 1, runId: run.id, ...(voiceReview ? { voiceReview } : {}) }, visitId);
      return {
        success: true, isDuplicate: false, data: {
          id: visitId, name, age, gender, presentingComplaint,
          arrivalTime: arrivalTime || recordedAt, vitals: { ...vitals, recordedAt }, serverConfirmedAt: recordedAt, agentRunId: run.id,
        },
      };
    }));
  }

  /** Record a new observation set; supersedes pending proposals/runs and queues a new assessment. */
  async observations(staff: Staff, visitId: string, body: unknown, key: string) {
    requireClinical(staff); const input = parse(observationsSchema, body);
    return this.database.transaction((db) => idempotent(db, staff.id, `observations:${visitId}`, key, input, async () => {
      const visit = (await db.query('SELECT * FROM visits WHERE id=$1 FOR UPDATE', [visitId])).rows[0];
      if (!visit) throw new NotFoundException('Visit not found.');
      requireWorkflowVisit(visit);
      if (visit.observation_version !== input.expectedVersion) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Observations changed. Reload before submitting.' });
      const version = visit.observation_version + 1;
      await db.query('INSERT INTO observations(id,visit_id,version,vitals,recorded_by) VALUES($1,$2,$3,$4,$5)', [id('OBS'), visitId, version, JSON.stringify(input.vitals), staff.id]);
      await db.query("UPDATE proposals SET status='STALE' WHERE visit_id=$1 AND status='PENDING'", [visitId]);
      const staleFollowups = await db.query("UPDATE followups SET status='STALE',version=version+1 WHERE visit_id=$1 AND status='PROPOSED' RETURNING id", [visitId]);
      for (const task of staleFollowups.rows) await audit(db, staff.id, 'FOLLOWUP_STALE', { followupId: task.id, newObservationVersion: version }, visitId);
      await db.query("UPDATE agent_runs SET status='SUPERSEDED' WHERE visit_id=$1 AND status IN ('QUEUED','WAITING_FOR_REVIEW','REVIEW_REQUIRED')", [visitId]);
      await db.query("UPDATE visits SET observation_version=$2,assessment_status='AWAITING_ASSESSMENT',updated_at=now() WHERE id=$1", [visitId, version]);
      const run = await enqueue(db, visitId, version, staff.id);
      await audit(db, staff.id, 'OBSERVATIONS_RECORDED', { version, runId: run.id }, visitId);
      return { success: true, data: { visitId, observationVersion: version, agentRunId: run.id } };
    }));
  }

  /** Priority-sorted queue with pending proposals and a workload snapshot. */
  async queue() {
    const visits = await this.visits();
    const proposals = (await this.database.pool.query("SELECT visit_id,data FROM proposals WHERE status='PENDING'")).rows;
    // The shared sort/workload helpers read approvedPriority.code, so keep the priority object here.
    const queue = sortQueueByApprovedPriority(visits.map((v) => ({ ...v, pendingProposal: proposals.find((p) => p.visit_id === v.id)?.data.proposal || null })));
    return { queue, snapshotTimestamp: new Date().toISOString(), workload: calculateWorkloadSnapshot(queue, 4) };
  }

  /** Proposals awaiting clinician review. */
  async pending() {
    const visits = await this.visits(); const protocol = await readProtocol();
    const rows = (await this.database.pool.query(`SELECT p.*,r.model,r.status run_status FROM proposals p JOIN agent_runs r ON r.id=p.run_id
      JOIN visits v ON v.id=p.visit_id WHERE v.data_source='synthetic' AND p.status='PENDING'
      AND r.status IN ('WAITING_FOR_REVIEW','REVIEW_REQUIRED') ORDER BY p.created_at`)).rows;
    const visitsById = new Map(visits.map((v) => [v.id, v]));
    const traces = await this.traces(rows.map((p) => p.run_id));
    return rows.map((p) => {
      const visit = visitsById.get(p.visit_id)!;
      return {
        ...visit, patientId: visit.id, proposalId: p.id, patientName: visit.name, observations: visit.vitals,
        observationVersion: p.observation_version, isStale: p.observation_version !== visit.observationVersion,
        proposal: p.data.proposal, protocol: p.data.protocol || protocol, summary: p.data.summary,
        toolTrace: traces.get(p.run_id), runStatus: p.run_status,
      };
    });
  }

  /** Tool-call trace for an agent run. */
  async trace(runId: string) {
    return (await this.traces([runId])).get(runId);
  }

  /** Tool-call traces for several runs in two queries; every requested run must exist and be visible. */
  private async traces(runIds: string[]) {
    const result = new Map<string, any>();
    if (!runIds.length) return result;
    const runs = (await this.database.pool.query(`SELECT r.*,v.data_source FROM agent_runs r LEFT JOIN visits v ON v.id=r.visit_id
      WHERE r.id=ANY($1)`, [runIds])).rows;
    const visible = runs.filter((run) => !isCompetitionMode() || (run.data_source === 'synthetic' && run.provider === 'ollama'));
    if (visible.length !== new Set(runIds).size) throw new NotFoundException('Agent run not found.');
    const calls = new Map<string, any[]>(visible.map((run) => [run.id, []]));
    for (const c of (await this.database.pool.query('SELECT * FROM tool_traces WHERE run_id=ANY($1) ORDER BY timestamp,step', [runIds])).rows)
      calls.get(c.run_id)!.push({ tool: c.tool, inputs: c.inputs, outputs: c.outputs, durationMs: c.duration_ms, timestamp: iso(c.timestamp) });
    for (const run of visible) result.set(run.id, {
      runId: run.id, model: run.model, provider: run.provider, status: run.status, error: run.error,
      timestamp: iso(run.created_at), toolCalls: calls.get(run.id),
    });
    return result;
  }

  /** Latest 100 agent runs for workflow visits. */
  async runs() {
    return (await this.database.pool.query(`SELECT r.id,r.visit_id "patientId",r.observation_version "observationVersion",r.status,r.provider,r.model,r.error,r.created_at "createdAt",r.finished_at "finishedAt"
    FROM agent_runs r JOIN visits v ON v.id=r.visit_id WHERE v.data_source='synthetic' ORDER BY r.created_at DESC LIMIT 100`)).rows;
  }

  /** List historical research cases (disabled in competition mode). */
  async researchCases() {
    requireResearch();
    const rows = (await this.database.pool.query(`SELECT v.id,v.name,v.gender,v.complaint,v.source_data,v.assessment_status,
      r.status run_status FROM visits v LEFT JOIN agent_runs r ON r.visit_id=v.id AND r.observation_version=v.observation_version
      WHERE v.data_source='mimic-iv-ed-demo' ORDER BY v.id`)).rows;
    return {
      metadata: mimicMetadata, total: rows.length, subjects: new Set(rows.map((row) => row.source_data.subjectId)).size,
      cases: rows.map((row) => ({
        id: row.id, name: row.name, gender: row.gender, presentingComplaint: row.complaint,
        sourceAcuity: row.source_data.sourceAcuity, originalArrival: row.source_data.originalArrival,
        status: row.run_status || row.assessment_status,
      })),
    };
  }

  /** A single historical research case with its run, proposal and trace. */
  async researchCase(visitId: string) {
    requireResearch();
    const row = (await this.database.pool.query(`SELECT v.*,o.vitals FROM visits v JOIN observations o ON o.visit_id=v.id AND o.version=v.observation_version
      WHERE v.id=$1 AND v.data_source='mimic-iv-ed-demo'`, [visitId])).rows[0];
    if (!row) throw new NotFoundException('Historical research case not found.');
    const run = (await this.database.pool.query('SELECT * FROM agent_runs WHERE visit_id=$1 AND observation_version=$2', [visitId, row.observation_version])).rows[0];
    const proposal = run ? (await this.database.pool.query('SELECT id,data FROM proposals WHERE run_id=$1', [run.id])).rows[0] : null;
    return {
      id: row.id, name: row.name, age: row.age, gender: row.gender, presentingComplaint: row.complaint,
      vitals: row.vitals, source: row.source_data, researchOnly: true, clinicalValidated: false,
      run: run ? { id: run.id, status: run.status, provider: run.provider, model: run.model, error: run.error } : null,
      proposal: proposal ? { id: proposal.id, ...proposal.data } : null, trace: run ? await this.trace(run.id) : null,
    };
  }

  /** Export all historical research cases. */
  async researchExport() {
    requireResearch();
    const rows = (await this.database.pool.query(`SELECT v.id,v.age,v.gender,v.complaint,v.source_data,o.vitals FROM visits v JOIN observations o
      ON o.visit_id=v.id AND o.version=v.observation_version WHERE v.data_source='mimic-iv-ed-demo' ORDER BY v.id`)).rows;
    return {
      metadata: mimicMetadata, cases: rows.map((row) => ({
        id: row.id, age: row.age, gender: row.gender,
        presentingComplaint: row.complaint, vitals: row.vitals, source: row.source_data,
      })),
    };
  }

  /** Request (or re-queue) an agent assessment for a visit's current observations. */
  async requestAssessment(staff: Staff, visitId: string) {
    requireClinical(staff);
    return this.database.transaction(async (db) => {
      const visit = (await db.query('SELECT * FROM visits WHERE id=$1 FOR UPDATE', [visitId])).rows[0];
      if (!visit) throw new NotFoundException('Visit not found.');
      if (isCompetitionMode()) requireWorkflowVisit(visit);
      const run = await enqueue(db, visitId, visit.observation_version, staff.id, 'reject');
      await audit(db, staff.id, 'ASSESSMENT_REQUESTED', { runId: run.id }, visitId);
      return { success: true, data: { runId: run.id, status: run.status } };
    });
  }

  /** Commit a clinician decision (approve / reject / override) on a pending proposal. */
  async decide(staff: Staff, body: unknown, key: string) {
    requireClinical(staff); const input = parse(decisionSchema, body);
    const currentProtocolChecksum = hash(JSON.stringify(await readProtocol()));
    return this.database.transaction((db) => idempotent(db, staff.id, 'triage-decision', key, input, async () => {
      const visit = (await db.query('SELECT * FROM visits WHERE id=$1 FOR UPDATE', [input.patientId])).rows[0];
      const proposal = (await db.query('SELECT p.*,r.status run_status FROM proposals p JOIN agent_runs r ON r.id=p.run_id WHERE p.id=$1 FOR UPDATE OF p', [input.proposalId])).rows[0];
      if (!visit || !proposal || proposal.visit_id !== visit.id) throw new NotFoundException('Proposal not found.');
      requireWorkflowVisit(visit);
      if (proposal.status !== 'PENDING' || !['WAITING_FOR_REVIEW', 'REVIEW_REQUIRED'].includes(proposal.run_status)) throw new ConflictException({ code: 'PROPOSAL_NOT_PENDING', message: 'This proposal has already been decided or is not ready.' });
      if (proposal.observation_version !== visit.observation_version || input.observationVersion !== visit.observation_version)
        throw new ConflictException({ code: 'STALE_PROPOSAL', message: 'Observations changed. Request a new assessment.' });
      if (proposal.data.protocolChecksum !== currentProtocolChecksum)
        throw new ConflictException({ code: 'STALE_PROTOCOL', message: 'Protocol resource changed. Request a new assessment.' });
      if (input.decision === 'APPROVED' && !proposal.data.proposal?.isSufficientEvidence) throw new BadRequestException({ code: 'INSUFFICIENT_EVIDENCE', message: 'Record missing observations or use a justified manual override.' });
      if (input.decision === 'OVERRIDDEN' && !input.overridePriority) throw new BadRequestException('Override priority is required.');
      const code = input.decision === 'REJECTED' ? visit.approved_priority : input.decision === 'OVERRIDDEN' ? input.overridePriority : proposal.data.proposal.priority.code;
      const record = {
        decisionId: id('DEC'), patientId: visit.id, patientName: visit.name, decision: input.decision, priority: priority(code), reason: input.reason,
        clinicianId: staff.id, clinicianName: staff.name, clinicianRole: staff.role, timestamp: new Date().toISOString(),
        protocolReference: proposal.data.protocol.id, toolTraceId: proposal.run_id, serverAcknowledged: true,
      };
      await db.query('INSERT INTO decisions(id,proposal_id,visit_id,staff_id,decision,priority,reason,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [record.decisionId, proposal.id, visit.id, staff.id, input.decision, code, input.reason, JSON.stringify(record)]);
      await db.query("UPDATE proposals SET status='DECIDED' WHERE id=$1", [proposal.id]);
      await db.query("UPDATE agent_runs SET status='DECIDED' WHERE id=$1", [proposal.run_id]);
      await db.query('UPDATE visits SET approved_priority=$2,assessment_status=$3,assessment_version=assessment_version+1,updated_at=now() WHERE id=$1',
        [visit.id, code, input.decision === 'REJECTED' ? 'REJECTED_REQUIRES_REASSESSMENT' : 'APPROVED']);
      await audit(db, staff.id, 'CLINICAL_DECISION_COMMITTED', { decisionId: record.decisionId, proposalId: proposal.id, reason: input.reason }, visit.id);
      return { success: true, data: record };
    }));
  }

  /** All committed clinical decisions, newest first. */
  async decisions() {
    // Display history only; the full record stays in the append-only decisions table.
    return (await this.database.pool.query('SELECT data FROM decisions ORDER BY timestamp DESC LIMIT 200')).rows.map((r) => r.data);
  }

  /** All departments, flattened for API/routing use. */
  async departments(): Promise<Department[]> {
    const rows = await this.database.pool.query<DepartmentRow>('SELECT * FROM departments ORDER BY id');
    return rows.rows.map((r) => ({
      ...r.data,
      id: r.id,
      version: r.version,
      updatedAt: iso(r.updated_at),
    }));
  }

  /** Routing proposals for visits that have an approved priority. */
  async routing() {
    const departments = await this.departments();
    return (await this.visits()).filter((v) => v.approvedPriority).map((v) => ({
      ...v, currentLocation: v.assignedDepartment,
      proposal: generateRoutingProposal(v, v.approvedPriority, departments),
    }));
  }

  /**
   * Transfer a patient to a department with clinician approval.
   * Occupies a bed in the target department and releases the bed held in the previous one,
   * bumping both department versions so stale routing views are refused.
   */
  async transfer(staff: Staff, body: unknown, key: string) {
    requireClinical(staff); const input = parse(transferSchema, body);
    return this.database.transaction((db) => idempotent(db, staff.id, 'transfer', key, input, async () => {
      const visit = (await db.query('SELECT * FROM visits WHERE id=$1 FOR UPDATE', [input.patientId])).rows[0];
      if (!visit) throw new NotFoundException('Visit or department not found.');
      // Lock target and previous departments in id order so concurrent opposite transfers cannot deadlock.
      const ids = [...new Set([input.departmentId, visit.department_id].filter(Boolean))];
      const locked = (await db.query('SELECT * FROM departments WHERE id=ANY($1) ORDER BY id FOR UPDATE', [ids])).rows;
      const department = locked.find((d) => d.id === input.departmentId);
      if (!department) throw new NotFoundException('Visit or department not found.');
      requireWorkflowVisit(visit);
      if (!visit.approved_priority || visit.assessment_version !== input.assessmentVersion || department.version !== input.departmentVersion)
        throw new ConflictException({ code: 'STALE_ROUTE', message: 'Approved assessment or department availability changed. Refresh routing.' });
      if (visit.department_id === department.id)
        throw new ConflictException({ code: 'ALREADY_IN_DEPARTMENT', message: `The patient is already assigned to ${department.data.name}.` });
      if (department.data.status === 'CLOSED' || department.data.occupiedBeds >= department.data.totalBeds)
        throw new ConflictException({ code: 'DEPARTMENT_UNAVAILABLE', message: 'No available capacity. Escalate for manual routing; urgency is unchanged.' });
      const previous = locked.find((d) => d.id === visit.department_id) || null;
      const record = {
        transferId: id('TRF'), patientId: visit.id, patientName: visit.name, department: department.data.name,
        previousDepartment: previous?.data.name ?? visit.assigned_department,
        approvedPriority: priority(visit.approved_priority), clinicianName: staff.name, timestamp: new Date().toISOString(), rationale: input.rationale, serverAcknowledged: true,
      };
      await db.query('INSERT INTO transfers(id,visit_id,staff_id,department_id,data) VALUES($1,$2,$3,$4,$5)', [record.transferId, visit.id, staff.id, department.id, JSON.stringify(record)]);
      await db.query('UPDATE visits SET department_id=$2,assigned_department=$3,updated_at=now() WHERE id=$1', [visit.id, department.id, department.data.name]);
      await db.query(`UPDATE departments SET data=jsonb_set(data,'{occupiedBeds}',to_jsonb((data->>'occupiedBeds')::int+$2)),
        version=version+1,updated_at=now() WHERE id=$1`, [department.id, 1]);
      if (previous)
        await db.query(`UPDATE departments SET data=jsonb_set(data,'{occupiedBeds}',to_jsonb(greatest((data->>'occupiedBeds')::int-1,0))),
          version=version+1,updated_at=now() WHERE id=$1`, [previous.id]);
      await audit(db, staff.id, 'DEPARTMENT_TRANSFERRED', { transferId: record.transferId, departmentId: department.id, previousDepartmentId: previous?.id ?? null }, visit.id);
      return { success: true, data: record };
    }));
  }

  /** Compare each visit's latest two observations to flag deterioration. */
  async deterioration() {
    // Visits first: observations are append-only, so every listed visit has its rows in the second query.
    const visits = await this.visits();
    // The latest two observation versions of every workflow visit, in one query.
    const recent = new Map<string, any[]>();
    for (const row of (await this.database.pool.query(`SELECT * FROM (SELECT o.*,row_number() OVER (PARTITION BY o.visit_id ORDER BY o.version DESC) recency
      FROM observations o JOIN visits v ON v.id=o.visit_id WHERE v.data_source='synthetic') ranked WHERE recency<=2 ORDER BY visit_id,version DESC`)).rows)
      recent.set(row.visit_id, [...(recent.get(row.visit_id) || []), row]);
    return visits.map((visit) => {
      const observations = recent.get(visit.id)!;
      const latest = { ...observations[0].vitals, id: observations[0].id, recordedAt: iso(observations[0].recorded_at) };
      const baseline = observations[1] ? { ...observations[1].vitals, id: observations[1].id, recordedAt: iso(observations[1].recorded_at) } : latest;
      return {
        patientId: visit.id, patientName: visit.name, age: visit.age, gender: visit.gender, currentApprovedPriority: visit.approvedPriority,
        assignedDepartment: visit.assignedDepartment, baselineObservation: baseline, latestObservation: observations[1] ? latest : null,
        observationVersion: visit.observationVersion, comparison: observations[1] ? compareObservationsForDeterioration(baseline, latest) : null,
        ageInfo: calculateObservationAge(latest.recordedAt), status: visit.assessmentStatus,
      };
    });
  }

  /** Clinician reassessment: manually escalate priority or dismiss a deterioration alert. */
  async reassess(staff: Staff, body: unknown, key: string) {
    requireClinical(staff); const input = parse(z.object({
      patientId: z.string(), observationVersion: z.number().int(), action: z.enum(['ESCALATE', 'DISMISS']),
      reason: z.string().trim().min(5), targetPriority: z.enum(['RED', 'ORANGE', 'YELLOW', 'GREEN']).nullable().optional(),
    }).strict(), body);
    return this.database.transaction((db) => idempotent(db, staff.id, 'reassessment', key, input, async () => {
      const visit = (await db.query('SELECT * FROM visits WHERE id=$1 FOR UPDATE', [input.patientId])).rows[0];
      if (!visit) throw new NotFoundException('Visit not found.');
      requireWorkflowVisit(visit);
      if (visit.observation_version !== input.observationVersion) throw new ConflictException('Observation version changed.');
      if (input.action === 'ESCALATE' && !input.targetPriority) throw new BadRequestException('A manual escalation priority is required.');
      // Escalation only raises urgency; lowering a priority must go through a reviewed triage decision.
      const urgency = { RED: 1, ORANGE: 2, YELLOW: 3, GREEN: 4 } as const;
      if (input.action === 'ESCALATE' && visit.approved_priority &&
        urgency[input.targetPriority as keyof typeof urgency] >= urgency[visit.approved_priority as keyof typeof urgency])
        throw new BadRequestException({ code: 'NOT_AN_ESCALATION', message: `Escalation must be more urgent than the current ${visit.approved_priority} priority. Use a triage review to lower or keep a priority.` });
      const code = input.action === 'ESCALATE' ? input.targetPriority : visit.approved_priority;
      if (input.action === 'ESCALATE') {
        await db.query("UPDATE visits SET approved_priority=$2,assessment_version=assessment_version+1,assessment_status='APPROVED',updated_at=now() WHERE id=$1", [visit.id, code]);
        await db.query("UPDATE proposals SET status='STALE' WHERE visit_id=$1 AND status='PENDING'", [visit.id]);
      }
      await audit(db, staff.id, 'REASSESSMENT_' + input.action, { reason: input.reason, newPriority: code, observationVersion: input.observationVersion }, visit.id);
      return { success: true, data: { patientId: visit.id, patientName: visit.name, action: input.action, reason: input.reason, newPriority: priority(code), clinicianName: staff.name, timestamp: new Date().toISOString(), serverAcknowledged: true } };
    }));
  }

  /** Recent audit events (own events for staff; all events for admin/clinician/doctor). */
  async audit(staff: Staff) {
    const rows = (await this.database.pool.query(`SELECT a.*,s.profile->>'name' staff_name FROM audit_events a LEFT JOIN staff s ON s.id=a.staff_id
      WHERE a.staff_id=$1 OR $2 ORDER BY timestamp DESC LIMIT 200`, [staff.id, ['admin', 'clinician', 'doctor'].includes(staff.role)])).rows;
    return rows.map((r) => ({ id: r.id, timestamp: iso(r.timestamp), staffId: r.staff_id, staffName: r.staff_name, eventType: r.event_type, details: JSON.stringify(r.details) }));
  }
}