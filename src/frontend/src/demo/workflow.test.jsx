import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { apiRegisterPatient } from '../features/registration/apiAdapter.js';
import { apiFetchQueueData } from '../features/queue/apiAdapter.js';
import { apiGetPendingTriageProposals, apiSubmitClinicalDecision } from '../features/triage/apiAdapter.js';
import { apiFetchRoutingCandidates, apiCommitDepartmentTransfer } from '../features/routing/apiAdapter.js';
import { apiCommitReassessmentDecision } from '../features/deterioration/apiAdapter.js';
import { readDemoState, updateDemoState, setDemoOffline } from './store.js';
import { TRIAGE_PRIORITY } from '../../../shared/contracts/triage.js';

const nurse = {id:'STAFF-101', name:'Jane Mwangi, RN', role:'nurse'};
const intake = {name:'Synthetic Journey',age:30,gender:'Female',presentingComplaint:'Synthetic headache',
  systolicBp:'120',diastolicBp:'80',heartRate:'75',respiratoryRate:'16',temperature:'37',spO2:'98',avpu:'Alert'};

describe('Connected local demo workflow', () => {
  it('registers, reviews, approves, routes and persists the same visit without duplicates', async () => {
    const registered = await apiRegisterPatient(intake,'journey-key');
    const id = registered.data.id;
    const proposal = (await apiGetPendingTriageProposals()).find(p => p.patientId === id);
    expect(proposal.observations.heartRate).toBe('75');
    expect((await apiFetchQueueData()).queue.find(v => v.visitId === id).approvedPriority).toBeNull();
    const result = await apiSubmitClinicalDecision(nurse,{patientId:id,decision:'APPROVED',observationVersion:1});
    expect(result.success).toBe(true);
    expect(result.data.serverAcknowledged).toBe(false);
    const routed = (await apiFetchRoutingCandidates()).find(v => v.id === id);
    expect(routed.approvedPriority.code).toBe(result.data.priority.code);
    expect((await apiCommitDepartmentTransfer(nurse,{patientId:id,departmentId:'DEP-EMERGENCY'})).success).toBe(true);
    const queued = (await apiFetchQueueData()).queue.find(v => v.visitId === id);
    expect(queued.assignedDepartment).toMatch(/Emergency/);
    expect(queued.approvedPriority.code).toBe(result.data.priority.code);
    expect((await apiRegisterPatient(intake,'journey-key')).data.id).toBe(id);
    expect(readDemoState().visits.filter(v => v.id === id)).toHaveLength(1);
    expect(readDemoState().decisions.filter(d => d.patientId === id)).toHaveLength(1);
    expect((await apiSubmitClinicalDecision(nurse,{patientId:id,decision:'APPROVED'})).error.code).toBe('PROPOSAL_NOT_FOUND');
    // Fresh reads use browser storage, rather than a feature's in-memory array.
    expect(JSON.parse(localStorage.getItem('afyaflow_demo_workflow_v1')).visits.find(v => v.id === id).assignedDepartment).toMatch(/Emergency/);
  });

  it('refuses every clinical mutation while offline and leaves state unchanged', async () => {
    const before = readDemoState();
    setDemoOffline(true);
    expect((await apiSubmitClinicalDecision(nurse,{patientId:'SYN-PT-8821',decision:'OVERRIDDEN',overridePriority:TRIAGE_PRIORITY.RED,reason:'Synthetic test'})).error.code).toBe('OFFLINE_ACTION_BLOCKED');
    expect((await apiCommitDepartmentTransfer(nurse,{patientId:'SYN-PT-8812',departmentId:'DEP-EMERGENCY'})).success).toBe(false);
    expect((await apiCommitReassessmentDecision(nurse,{patientId:'SYN-PT-8819',action:'ESCALATE',reason:'Synthetic test',targetPriority:TRIAGE_PRIORITY.RED})).success).toBe(false);
    expect(readDemoState()).toEqual(before);
  });

  it('requires a clinical role for routing and reassessment, not just a visible UI gate', async () => {
    const clerk = {...nurse,role:'clerk'};
    expect((await apiCommitDepartmentTransfer(clerk,{patientId:'SYN-PT-8812',departmentId:'DEP-EMERGENCY'})).success).toBe(false);
    expect((await apiCommitReassessmentDecision(clerk,{patientId:'SYN-PT-8819',action:'ESCALATE',reason:'Test',targetPriority:TRIAGE_PRIORITY.RED})).success).toBe(false);
  });

  it('rejects stale, missing and incomplete proposals without guessing a priority', async () => {
    updateDemoState(s => {s.visits.find(v => v.id === 'SYN-PT-8821').observationVersion=2;});
    expect((await apiSubmitClinicalDecision(nurse,{patientId:'SYN-PT-8821',decision:'APPROVED',observationVersion:1})).error.code).toBe('STALE_PROPOSAL');
    expect((await apiSubmitClinicalDecision(nurse,{patientId:'missing',decision:'APPROVED'})).error.code).toBe('PROPOSAL_NOT_FOUND');
    expect((await apiSubmitClinicalDecision(nurse,{patientId:'SYN-PT-8830',decision:'APPROVED'})).error.code).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('keeps rejected visits visible for reassessment and does not approve them', async () => {
    await apiSubmitClinicalDecision(nurse,{patientId:'SYN-PT-8821',decision:'REJECTED',reason:'Record additional evidence'});
    const visit = (await apiFetchQueueData()).queue.find(v => v.visitId === 'SYN-PT-8821');
    expect(visit.approvedPriority).toBeNull();
    expect(visit.assessmentStatus).toBe('REJECTED_REQUIRES_REASSESSMENT');
    expect((await apiFetchRoutingCandidates()).some(v => v.id === visit.visitId)).toBe(false);
  });

  it('updates approved queue priority after a justified reassessment', async () => {
    await apiCommitReassessmentDecision(nurse,{patientId:'SYN-PT-8819',action:'ESCALATE',reason:'Synthetic reassessment',targetPriority:TRIAGE_PRIORITY.RED});
    expect((await apiFetchQueueData()).queue[0].approvedPriority.code).toBe('RED');
    expect(readDemoState().reassessments).toHaveLength(1);
  });

  it('blocks the actual approval form when offline simulation is active', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button',{name:/Offline Sync & Outbox/i}));
    fireEvent.click(screen.getByRole('button',{name:/Simulate Offline Network/i}));
    fireEvent.click(screen.getByRole('button',{name:/Triage & Prioritisation/i}));
    fireEvent.click(await screen.findByRole('button',{name:/Approve Proposed Priority/i}));
    expect(await screen.findByText(/Clinical Decision Error \(OFFLINE_ACTION_BLOCKED\)/i)).toBeInTheDocument();
    expect(readDemoState().decisions).toHaveLength(1);
  });

  it('captures registration offline and creates one shared visit only after reconnect', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button',{name:/Offline Sync & Outbox/i}));
    fireEvent.click(screen.getByRole('button',{name:/Simulate Offline Network/i}));
    fireEvent.click(screen.getByRole('button',{name:/Patient Registration/i}));
    fireEvent.change(screen.getByLabelText(/Patient Full Name/i),{target:{value:intake.name}});
    fireEvent.change(screen.getByLabelText(/Age \(Years\)/i),{target:{value:'30'}});
    fireEvent.change(screen.getByLabelText(/Presenting Complaint/i),{target:{value:intake.presentingComplaint}});
    fireEvent.click(screen.getByRole('button',{name:/Confirm & Register Visit/i}));
    expect(await screen.findByText(/Offline Draft Saved/i)).toBeInTheDocument();
    expect(readDemoState().visits.some(v => v.name === intake.name)).toBe(false);
    fireEvent.click(screen.getByRole('button',{name:/Offline Sync & Outbox/i}));
    fireEvent.click(screen.getByRole('button',{name:/Disable Offline Simulation/i}));
    await waitFor(() => expect(readDemoState().visits.filter(v => v.name === intake.name)).toHaveLength(1));
    expect(await screen.findByText(/Saved Demo State/i)).toBeInTheDocument();
  });
  it('does not label invalid outbox payloads as saved or discard them', async () => {
    localStorage.setItem('afyaflow_sync_outbox_v1',JSON.stringify([{
      syncId:'invalid-draft',type:'REGISTRATION_DRAFT',payload:{name:''},status:'PENDING_SYNC',retryCount:0,
    }]));
    render(<App />);
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('afyaflow_sync_outbox_v1'))[0].status).toBe('FAILED_SYNC');
    });
    expect(readDemoState().visits.some(v => v.name === '')).toBe(false);
  });
});
