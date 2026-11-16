import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sortQueueByApprovedPriority } from '../../../../shared/contracts/queue.js';
import { TRIAGE_PRIORITY } from '../../../../shared/contracts/triage.js';

const api = vi.fn(), mutation = vi.fn();
vi.mock('../../api/client.js', () => ({ useBackend: true, competitionMode: false, api: (...a) => api(...a), mutation: (...a) => mutation(...a) }));
const { default: QueueView } = await import('./QueueView.jsx');

const visit = (id, extra = {}) => ({
  id, visitId: id, patientName: `Synthetic ${id}`, age: 40, gender: 'Female', presentingComplaint: 'Synthetic', vitals: {},
  arrivalTime: '2026-11-16T08:00:00.000Z', approvedPriority: TRIAGE_PRIORITY.YELLOW, registrationSeq: Number(id.slice(-1)),
  observationVersion: 1, assessmentVersion: 1, assessmentStatus: 'APPROVED', assignedDepartment: 'Triage Holding', seenAt: null, ...extra,
});
const served = (items) => ({ queue: sortQueueByApprovedPriority(items), snapshotTimestamp: new Date().toISOString(), workload: null });
const row = async (name) => (await screen.findByText(name)).closest('tr');
const options = () => within(screen.getByLabelText('Outcome')).getAllByRole('option').map((o) => o.textContent);

describe('seeing patients and recording outcomes', () => {
  beforeEach(() => { api.mockReset(); mutation.mockReset(); mutation.mockResolvedValue({ success: true }); });

  it('lets clinical staff mark a patient seen and close the visit with an outcome', async () => {
    api.mockResolvedValue(served([visit('SYN-1')]));
    render(<QueueView isClinical staffRole="nurse" />);
    const r = await row('Synthetic SYN-1');
    expect(within(r).getByText('Not yet seen')).toBeInTheDocument();
    fireEvent.click(within(r).getByRole('button', { name: 'Mark seen' }));
    await waitFor(() => expect(mutation).toHaveBeenCalledWith('/visits/SYN-1/seen', {}));

    fireEvent.click(within(r).getByRole('button', { name: 'Record outcome' }));
    expect(options()).toContain('Admitted');
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'ADMITTED' } });
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'Medical ward' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close visit' }));
    await waitFor(() => expect(mutation).toHaveBeenCalledWith('/visits/SYN-1/outcome', { disposition: 'ADMITTED', note: 'Medical ward' }));
  });

  it('offers front-desk staff only "left without being seen", and no Mark seen', async () => {
    api.mockResolvedValue(served([visit('SYN-2')]));
    render(<QueueView staffRole="clerk" />);
    const r = await row('Synthetic SYN-2');
    expect(within(r).queryByRole('button', { name: 'Mark seen' })).toBeNull();
    fireEvent.click(within(r).getByRole('button', { name: 'Record outcome' }));
    expect(options()).toEqual(['Choose an outcome…', 'Left without being seen']);
  });

  it('does not offer "left without being seen" once a patient has been seen', async () => {
    api.mockResolvedValue(served([visit('SYN-3', { seenAt: '2026-11-16T08:05:00.000Z', seenByName: 'Jane Mwangi, RN' })]));
    render(<QueueView isClinical staffRole="doctor" />);
    const r = await row('Synthetic SYN-3');
    expect(within(r).getByText(/Seen .* by Jane Mwangi, RN/)).toBeInTheDocument();
    fireEvent.click(within(r).getByRole('button', { name: 'Record outcome' }));
    expect(options()).not.toContain('Left without being seen');
    expect(options()).toContain('Left against medical advice');
  });

  it('shows no outcome actions to administrators', async () => {
    api.mockResolvedValue(served([visit('SYN-4')]));
    render(<QueueView staffRole="admin" />);
    const r = await row('Synthetic SYN-4');
    expect(within(r).queryByRole('button')).toBeNull();
  });
});
