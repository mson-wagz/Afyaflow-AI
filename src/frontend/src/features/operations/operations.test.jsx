import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatMinutes, niceTicks, bucketLabel } from './format.js';

const api = vi.fn();
vi.mock('../../api/client.js', () => ({ useBackend: true, competitionMode: false, api: (...args) => api(...args) }));

const { default: OperationsView } = await import('./OperationsView.jsx');
const { default: Navigation } = await import('../../components/Navigation.jsx');

const timing = (count, medianMinutes, p90Minutes) => ({ count, medianMinutes, p90Minutes });
const summary = (overrides = {}) => ({
  period: 'today', timezone: 'Africa/Nairobi', from: '2026-11-15T21:00:00.000Z', to: '2026-11-16T07:30:00.000Z', bucket: 'hour',
  live: {
    openVisits: 9, awaitingAssessment: 2, byPriority: { RED: 1, ORANGE: 2, YELLOW: 3, GREEN: 1, UNPRIORITISED: 2 },
    proposalsAwaitingReview: 3, oldestProposalMinutes: 14.5, needsManualTriage: 1,
    notYetSeen: 6, pastTargetNotSeen: { RED: 0, ORANGE: 2, YELLOW: 0, GREEN: 0 },
    followups: { proposed: 1, open: 2, overdue: 1 },
    departments: [{ id: 'DEPT-1', name: 'Resuscitation', status: 'OPEN', occupiedBeds: 4, totalBeds: 4 }],
  },
  flow: {
    arrivals: 5,
    arrivalsByBucket: Array.from({ length: 11 }, (_, i) => ({ start: new Date(Date.UTC(2026, 10, 15, 21 + i)).toISOString(), arrivals: i === 10 ? 5 : 0 })),
    doorToProposal: timing(5, 1.2, 2.5), doorToDecision: timing(4, 18, 95), proposalToDecision: timing(4, 16.4, 90),
  },
  decisions: { total: 4, approved: 3, overridden: 1, rejected: 0, acceptanceRate: 75, decidedPriority: { RED: 1, ORANGE: 1, YELLOW: 2, GREEN: 0 } },
  agentRuns: { total: 6, medianDurationSeconds: 12.3, byStatus: { DECIDED: 4, FAILED: 1, WAITING_FOR_REVIEW: 1 } },
  transfers: [{ department: 'Resuscitation', count: 2 }],
  outcomes: {
    total: 20, byDisposition: { ADMITTED: 6, DISCHARGED: 10, DIED: 1, LEFT_WITHOUT_BEING_SEEN: 2, LEFT_AGAINST_MEDICAL_ADVICE: 1, TRANSFERRED_OUT: 0 },
    underTriage: { numerator: 1, denominator: 7, percent: 14.3 }, overTriage: { numerator: 4, denominator: 10, percent: 40 },
    leftWithoutBeingSeenPercent: 10, closedWithoutApprovedPriority: 0, lengthOfStay: timing(20, 185, 410),
  },
  escalations: { sent: 3, failed: 1, queued: 0, provider: 'africastalking' },
  aiCost: {
    runs: 6, completedOutcomes: 4, modelCalls: 24, modelCallsPerRun: { average: 4, max: 6 },
    tokensPerAnswer: { input: 1258, output: 83 }, tokens: { input: 30192, output: 1992 }, unmeteredModelCalls: 0, unpricedRuns: 0,
    modelCostUsd: 0.002633, hostingCostUsd: 0.6189, hostingUsdPerMonth: 18.84,
    costPerRunUsd: { average: 0.000439, max: 0.000702 }, modelCostPerOutcomeUsd: 0.000658, hostingPerOutcomeUsd: 0.154729, costPerOutcomeUsd: 0.155387,
    models: [{ model: 'eu.amazon.nova-lite-v1:0', provider: 'bedrock', price: { inputUsdPerMillion: 0.069, outputUsdPerMillion: 0.276, source: 'AWS Price List API' } }],
  },
  seenAgainstTarget: [
    { priority: 'RED', seen: 2, medianMinutes: 1.5, withinTargetPercent: null },
    { priority: 'ORANGE', seen: 4, medianMinutes: 12, withinTargetPercent: 50 },
    { priority: 'YELLOW', seen: 5, medianMinutes: 40, withinTargetPercent: 80 },
    { priority: 'GREEN', seen: 3, medianMinutes: 120, withinTargetPercent: 100 },
  ],
  ...overrides,
});

describe('operations dashboard', () => {
  beforeEach(() => { api.mockReset(); });

  it('shows live workload, timings and decision figures from the summary', async () => {
    api.mockResolvedValue(summary());
    render(<OperationsView />);
    expect(await screen.findByText('Open visits')).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/operations/summary?period=today');
    expect(screen.getByText('Oldest waiting 15 min')).toBeInTheDocument();
    expect(screen.getByText('Need manual triage').closest('.ops-tile')).toHaveClass('ops-tile-attention');
    expect(screen.getByText('90% within 1 h 35 min · 4 visits')).toBeInTheDocument();
    expect(screen.getByText('Accepted unchanged: 75% of 4')).toBeInTheDocument();
    expect(screen.getByLabelText('Red: 1 (11%)')).toBeInTheDocument();
    expect(screen.getByText(/Full/)).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('shows measured AI cost per completed triage, tokens per answer and model calls', async () => {
    api.mockResolvedValue(summary());
    render(<OperationsView />);
    const tile = (await screen.findByText('Cost per completed triage')).closest('.ops-tile');
    expect(tile).toHaveTextContent('$0.1554');
    expect(tile).toHaveTextContent('AI $0.000658 + hosting $0.1547 · 4 completed');
    expect(screen.getByText('Tokens per answer').closest('.ops-tile')).toHaveTextContent('1,341');
    expect(screen.getByText('Model calls per assessment').closest('.ops-tile')).toHaveTextContent('Worst case 6');
    expect(screen.getByText(/\$0\.069 \/ \$0\.276 per 1M input \/ output tokens/)).toBeInTheDocument();
  });

  it('shows outcome-based triage accuracy against the KNH baseline and SATS target compliance', async () => {
    api.mockResolvedValue(summary());
    render(<OperationsView />);
    expect(await screen.findByText('Outcomes: 20')).toBeInTheDocument();
    expect(screen.getByText('4 of 10 discharged were Red, Orange or Yellow · KNH 62.3%')).toBeInTheDocument();
    expect(screen.getByText('1 of 7 admitted or died were Green · KNH 7.8%')).toBeInTheDocument();
    expect(screen.getByText('Past SATS target, not yet seen').closest('.ops-tile')).toHaveClass('ops-tile-attention');
    const orange = screen.getByText('Level 2 · Very urgent').closest('tr');
    expect(within(orange).getByText('50%')).toBeInTheDocument();
    expect(within(orange).getByText('⚠ 2')).toBeInTheDocument();
    expect(within(screen.getByText('Level 1 · Emergency').closest('tr')).getByText('Immediate')).toBeInTheDocument();
    expect(screen.getByText(/SMS escalations to the on-call clinician/)).toHaveTextContent('3 sent, ⚠ 1 failed');
  });

  it('switches period and offers a table view of arrivals', async () => {
    api.mockResolvedValue(summary());
    render(<OperationsView />);
    await screen.findByText('Open visits');
    fireEvent.click(screen.getByRole('button', { name: 'Show table' }));
    const table = screen.getByRole('columnheader', { name: 'Arrivals' }).closest('table');
    expect(within(table).getByText('07:00')).toBeInTheDocument();
    expect(within(table).getByText('5')).toBeInTheDocument();
    api.mockResolvedValue(summary({ period: '7d', bucket: 'day' }));
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(api).toHaveBeenLastCalledWith('/operations/summary?period=7d');
    expect(await screen.findByText(/flow for 7 days/)).toBeInTheDocument();
  });

  it('shows server refusals', async () => {
    api.mockRejectedValue(new Error('Clinical or administrator access required to view operations figures.'));
    render(<OperationsView />);
    expect(await screen.findByText(/administrator access required/i)).toBeInTheDocument();
  });

  it('lists Operations in navigation for clinical staff and administrators, not front-desk staff', () => {
    const { rerender } = render(<Navigation currentView="queue" onNavigate={() => {}} staffRole="clerk" />);
    expect(screen.queryByText('Operations')).toBeNull();
    for (const role of ['nurse', 'clinician', 'doctor', 'admin']) {
      rerender(<Navigation currentView="queue" onNavigate={() => {}} staffRole={role} />);
      expect(screen.getByText('Operations')).toBeInTheDocument();
    }
  });
});

describe('operations formatting', () => {
  it('formats durations, axis ticks and local bucket labels', () => {
    expect(formatMinutes(null)).toBe('—');
    expect(formatMinutes(4.25)).toBe('4.3 min');
    expect(formatMinutes(42.4)).toBe('42 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(niceTicks(0)).toEqual({ top: 1, ticks: [0, 1] });
    expect(niceTicks(7)).toEqual({ top: 8, ticks: [0, 2, 4, 6, 8] });
    expect(bucketLabel('2026-11-15T21:00:00.000Z', 'hour', 'Africa/Nairobi')).toBe('00:00');
    expect(bucketLabel('2026-11-15T21:00:00.000Z', 'day', 'Africa/Nairobi')).toBe('16 Nov');
  });
});
