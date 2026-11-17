import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateSatsScore } from '../../../../shared/contracts/triage.js';

const api = vi.fn();
vi.mock('../../api/client.js', () => ({
  useBackend: true, competitionMode: false,
  api: (...a) => api(...a), mutation: vi.fn(), retryKey: () => 'k', errorResult: (e) => ({ success: false, error: e }),
}));
const { default: TriageView } = await import('./TriageView.jsx');
const { default: RunTrace } = await import('./RunTrace.jsx');

const vitals = { heartRate: 135, systolicBp: 75, respiratoryRate: 32, temperature: 37, avpu: 'Voice' };
const proposal = (summary) => ({
  id: 'SYN-PT-1', patientId: 'SYN-PT-1', proposalId: 'PRO-1', name: 'Synthetic Demo', patientName: 'Synthetic Demo',
  age: 45, gender: 'Female', presentingComplaint: 'Chest pain', arrivalTime: new Date().toISOString(),
  observationVersion: 1, observations: vitals, vitals, proposal: calculateSatsScore(vitals),
  protocol: { name: 'AfyaFlow synthetic adult scoring fixture', version: 'demo-v2' }, runStatus: 'WAITING_FOR_REVIEW',
  ...(summary ? { summary } : {}),
});
const serve = (proposals) => api.mockImplementation(async (path) => {
  if (path === '/triage/proposals') return proposals;
  if (path === '/triage/decisions') return [];
  return [];
});

describe('AI summary on screen', () => {
  beforeEach(() => api.mockReset());

  it('shows the agent summary in the proposal review panel, labelled as AI-drafted', async () => {
    serve([proposal('TEWS 9 from recorded vital signs: heart rate 135, systolic BP 75, respiratory rate 32, responds to voice. Proposed RED; clinician review required.')]);
    render(<TriageView currentStaff={{ id: 'STAFF-101', role: 'nurse' }} isClinical />);
    const box = await screen.findByRole('note', { name: 'AI summary' });
    expect(within(box).getByText(/TEWS 9 from recorded vital signs/)).toBeInTheDocument();
    expect(within(box).getByText(/Check it before deciding/)).toBeInTheDocument();
  });

  it('shows no summary box when the agent saved none', async () => {
    serve([proposal()]);
    render(<TriageView currentStaff={{ id: 'STAFF-101', role: 'nurse' }} isClinical />);
    await screen.findAllByText(/Synthetic Demo/);
    expect(screen.queryByRole('note', { name: 'AI summary' })).toBeNull();
  });

  it('shows the saved summary as a readable line in the run trace', () => {
    render(<RunTrace trace={{ toolCalls: [
      { tool: 'save_pending_proposal', durationMs: 20, inputs: { summary: 'Proposed RED from TEWS 9.' }, outputs: { saved: true } },
    ] }} />);
    expect(screen.getByText('AI summary: “Proposed RED from TEWS 9.”')).toBeInTheDocument();
  });
});
