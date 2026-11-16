import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.fn();
vi.mock('../../api/client.js', () => ({ useBackend: true, competitionMode: false, api: (...args) => api(...args) }));

const { default: StaffAccountsView } = await import('./StaffAccountsView.jsx');
const { AuthContext } = await import('./AuthContext.jsx');
const { default: Navigation } = await import('../../components/Navigation.jsx');

const accounts = [
  { id: 'STAFF-104', staffNumber: 'KNH-OPS-005', name: 'Samuel Kiprop', role: 'admin', active: true, mfaEnrolled: true, openSessions: 1 },
  { id: 'STAFF-101', staffNumber: 'KNH-NURSE-042', name: 'Jane Mwangi, RN', role: 'nurse', active: true, mfaEnrolled: false, openSessions: 2 },
];
const renderView = () => render(
  <AuthContext.Provider value={{ staff: { id: 'STAFF-104', role: 'admin' } }}><StaffAccountsView /></AuthContext.Provider>,
);

describe('staff account management', () => {
  beforeEach(() => { api.mockReset(); });

  it('lists accounts and offers no actions on the administrator\'s own account', async () => {
    api.mockResolvedValue(accounts);
    renderView();
    const ownRow = (await screen.findByText('Samuel Kiprop')).closest('tr');
    expect(within(ownRow).getByText('Your account')).toBeInTheDocument();
    expect(within(ownRow).queryByRole('button')).toBeNull();
    const nurseRow = screen.getByText('Jane Mwangi, RN').closest('tr');
    expect(within(nurseRow).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
  });

  it('requires a reason, then shows a reset PIN once', async () => {
    api.mockResolvedValueOnce(accounts);
    renderView();
    const nurseRow = (await screen.findByText('Jane Mwangi, RN')).closest('tr');
    fireEvent.click(within(nurseRow).getByRole('button', { name: 'Reset PIN' }));
    expect(screen.getByText(/Enter a reason of at least 5 characters/i)).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);

    api.mockResolvedValueOnce({ success: true, data: { id: 'STAFF-101', pin: '602418' } }).mockResolvedValueOnce(accounts);
    fireEvent.change(screen.getByLabelText(/Reason for the change/i), { target: { value: 'Forgot PIN at shift change' } });
    fireEvent.click(within(nurseRow).getByRole('button', { name: 'Reset PIN' }));
    expect(await screen.findByText('602418')).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/staff/STAFF-101/reset-pin', { method: 'POST', body: { reason: 'Forgot PIN at shift change' } });
    expect(screen.getByText(/It will not be shown again/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Reason for the change/i).value).toBe(''));
  });

  it('shows server refusals', async () => {
    api.mockResolvedValueOnce(accounts).mockRejectedValueOnce(new Error('The last active administrator cannot be deactivated.'));
    renderView();
    const nurseRow = (await screen.findByText('Jane Mwangi, RN')).closest('tr');
    fireEvent.change(screen.getByLabelText(/Reason for the change/i), { target: { value: 'Synthetic refusal check' } });
    fireEvent.click(within(nurseRow).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText(/last active administrator/i)).toBeInTheDocument();
  });

  it('shows the Staff Accounts screen in navigation only to administrators', () => {
    const { rerender } = render(<Navigation currentView="queue" onNavigate={() => {}} isAdmin={false} />);
    expect(screen.queryByText('Staff Accounts')).toBeNull();
    rerender(<Navigation currentView="queue" onNavigate={() => {}} isAdmin />);
    expect(screen.getByText('Staff Accounts')).toBeInTheDocument();
  });
});
