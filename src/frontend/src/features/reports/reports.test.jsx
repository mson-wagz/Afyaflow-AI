import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.fn();
vi.mock('../../api/client.js', () => ({ useBackend: true, competitionMode: false, api: (...a) => api(...a) }));
const { default: AgentReportCard } = await import('./AgentReportCard.jsx');

const report = (extra = {}) => ({
  id: 'REPORT-1', kind: 'HANDOVER', status: 'READY', content: 'Handover: Amina Wekesa is Level 1 and unseen for 12 min.',
  requestedBy: { id: 'STAFF-101', name: 'Jane Mwangi, RN' }, createdAt: '2026-11-17T08:00:00.000Z', model: 'eu.amazon.nova-lite-v1:0',
  steps: [{ tool: 'bedrock_converse' }, { tool: 'get_unseen_patients' }, { tool: 'get_rechecks' }, { tool: 'save_handover' }],
  usage: { modelCalls: 2, toolCalls: 3, inputTokens: 3100, outputTokens: 240, costUsd: 0.00028 }, acknowledgedBy: null, ...extra,
});
const card = (staffId) => render(<AgentReportCard kind="handover" title="Shift handover (AI draft)" staffId={staffId} otherAcknowledger
  generateLabel="Prepare handover" acknowledgeLabel="Acknowledge handover" />);

describe('AI report card', () => {
  beforeEach(() => api.mockReset());

  it('shows the latest draft with its tools, tokens and cost, labelled as AI', async () => {
    api.mockResolvedValue(report());
    card('STAFF-102');
    expect(await screen.findByText(/Amina Wekesa is Level 1/)).toBeInTheDocument();
    expect(screen.getByText(/2 model calls · 3 tool calls \(get_unseen_patients, get_rechecks, save_handover\)/)).toBeInTheDocument();
    expect(screen.getByText(/3,100 \+ 240 tokens · \$0\.000280/)).toBeInTheDocument();
    expect(screen.getByText(/Drafted by AI/)).toBeInTheDocument();
    expect(screen.getByText(/changes no patient, priority or queue/)).toBeInTheDocument();
  });

  it('prepares a new handover through the agent', async () => {
    api.mockResolvedValueOnce(null).mockResolvedValueOnce(report());
    card('STAFF-101');
    expect(await screen.findByText('No report yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare handover' }));
    await waitFor(() => expect(api).toHaveBeenLastCalledWith('/reports/handover', { method: 'POST' }));
    expect(await screen.findByText(/Amina Wekesa is Level 1/)).toBeInTheDocument();
  });

  it('asks the incoming staff member, not the preparer, to acknowledge a handover', async () => {
    api.mockResolvedValue(report());
    card('STAFF-101');
    expect(await screen.findByText(/The incoming staff member must acknowledge it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acknowledge handover' })).toBeNull();
  });

  it('records an acknowledgement with an optional note', async () => {
    api.mockResolvedValueOnce(report()).mockResolvedValueOnce(report({ status: 'ACKNOWLEDGED', acknowledgedBy: { name: 'Dr. Kamau Otieno' }, acknowledgedAt: '2026-11-17T08:05:00.000Z', acknowledgementNote: 'Seen.' }));
    card('STAFF-102');
    fireEvent.change(await screen.findByLabelText('Note (optional)'), { target: { value: 'Seen.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge handover' }));
    await waitFor(() => expect(api).toHaveBeenLastCalledWith('/reports/REPORT-1/acknowledge', { method: 'POST', body: { note: 'Seen.' } }));
    expect(await screen.findByText(/Acknowledged by Dr\. Kamau Otieno/)).toBeInTheDocument();
  });

  it('shows a failed run honestly, with no report text', async () => {
    api.mockResolvedValue(report({ status: 'FAILED', content: null, error: 'The agent finished without saving the report.' }));
    card('STAFF-102');
    expect(await screen.findByText(/did not produce a report: The agent finished without saving/)).toBeInTheDocument();
  });
});
