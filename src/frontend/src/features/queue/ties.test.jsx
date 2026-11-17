import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sortQueueByApprovedPriority } from '../../../../shared/contracts/queue.js';
import { TRIAGE_PRIORITY } from '../../../../shared/contracts/triage.js';

const api = vi.fn(), mutation = vi.fn();
vi.mock('../../api/client.js', () => ({ useBackend: true, competitionMode: false, api: (...a) => api(...a), mutation: (...a) => mutation(...a) }));
const { default: QueueView } = await import('./QueueView.jsx');

const vitals = { heartRate: 135, systolicBp: 75, respiratoryRate: 32, temperature: 37, avpu: 'Voice' }; // TEWS 9
const red = (id, seq) => ({
  id, visitId: id, patientName: `Synthetic ${id}`, age: 40, gender: 'Female', presentingComplaint: 'Synthetic', vitals,
  arrivalTime: '2026-11-16T08:00:00.000Z', approvedPriority: TRIAGE_PRIORITY.RED, registrationSeq: seq,
  observationVersion: 2, assessmentVersion: 1, assessmentStatus: 'APPROVED', assignedDepartment: 'Triage Holding',
});
const served = () => ({ queue: sortQueueByApprovedPriority([red('SYN-B', 2), red('SYN-A', 1)]), snapshotTimestamp: new Date().toISOString(), workload: null });

describe('clinically tied patients on the queue screen', () => {
  beforeEach(() => { api.mockReset(); mutation.mockReset(); api.mockResolvedValue(served()); });

  it('warns that tied Level 1 patients all need immediate care and marks each tie', async () => {
    render(<QueueView />);
    expect(await screen.findByText('2 Level 1 patients are clinically tied')).toBeInTheDocument();
    expect(screen.getByText('Tied 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Tied 2 of 2')).toBeInTheDocument();
    expect(screen.getByText(/clinically tied; registered later/)).toBeInTheDocument();
    // Non-clinical staff cannot choose an order.
    expect(screen.queryByRole('button', { name: 'See first' })).toBeNull();
  });

  it('lets clinical staff choose who is seen first with a reason', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Airway concern on reassessment');
    mutation.mockResolvedValue({ success: true });
    render(<QueueView isClinical />);
    const row = (await screen.findByText('Synthetic SYN-B')).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'See first' }));
    await waitFor(() => expect(mutation).toHaveBeenCalledWith('/queue/precedence',
      { patientId: 'SYN-B', observationVersion: 2, assessmentVersion: 1, reason: 'Airway concern on reassessment' }));
    // Only the patient not already first in the group gets the button.
    const first = screen.getByText('Synthetic SYN-A').closest('tr');
    expect(within(first).queryByRole('button', { name: 'See first' })).toBeNull();
  });

  it('refuses a reason that is too short without calling the server', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('no');
    render(<QueueView isClinical />);
    fireEvent.click(await screen.findByRole('button', { name: 'See first' }));
    expect(await screen.findByText('Enter a reason of at least 5 characters.')).toBeInTheDocument();
    expect(mutation).not.toHaveBeenCalled();
  });
});
