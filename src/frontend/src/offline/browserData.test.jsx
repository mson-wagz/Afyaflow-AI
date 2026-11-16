import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clearPatientDataFor, confirmDiscardUnsynced, registrationDraftKey,
  LOCAL_DRAFT_KEY, SYNC_OUTBOX_KEY, SIGNED_OUT_EVENT,
} from './browserData.js';
import { SyncProvider, useOfflineSync } from './SyncContext.jsx';
import { AuthContext } from '../features/staff-access/AuthContext.jsx';
import { SYNC_ITEM_TYPES } from '../../../shared/contracts/offline.js';

const store = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const read = (key) => JSON.parse(localStorage.getItem(key) || 'null');

describe('patient data in browser storage', () => {
  beforeEach(() => localStorage.clear());

  it('removes only the signed-out staff member\'s drafts and queued registrations', () => {
    store(registrationDraftKey('STAFF-A'), { name: 'Patient of A' });
    store(registrationDraftKey('STAFF-B'), { name: 'Patient of B' });
    store(LOCAL_DRAFT_KEY, { name: 'Saved by A', savedBy: 'STAFF-A' });
    store(SYNC_OUTBOX_KEY, [
      { syncId: '1', staffId: 'STAFF-A' }, { syncId: '2', staffId: 'STAFF-B' }, { syncId: '3' },
    ]);
    const signedOut = vi.fn();
    window.addEventListener(SIGNED_OUT_EVENT, signedOut);

    clearPatientDataFor('STAFF-A');

    expect(read(registrationDraftKey('STAFF-A'))).toBeNull();
    expect(read(LOCAL_DRAFT_KEY)).toBeNull();
    expect(read(registrationDraftKey('STAFF-B'))).toEqual({ name: 'Patient of B' });
    // Items queued before ownership was recorded are removed with the departing user.
    expect(read(SYNC_OUTBOX_KEY)).toEqual([{ syncId: '2', staffId: 'STAFF-B' }]);
    expect(signedOut).toHaveBeenCalledTimes(1);
    window.removeEventListener(SIGNED_OUT_EVENT, signedOut);
  });

  it('keeps another staff member\'s saved draft', () => {
    store(LOCAL_DRAFT_KEY, { name: 'Saved by B', savedBy: 'STAFF-B' });
    clearPatientDataFor('STAFF-A');
    expect(read(LOCAL_DRAFT_KEY)).toEqual({ name: 'Saved by B', savedBy: 'STAFF-B' });
  });

  it('asks before discarding unsynced registrations, and only then', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(confirmDiscardUnsynced(0)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(confirmDiscardUnsynced(2)).toBe(false);
    expect(confirm.mock.calls[0][0]).toMatch(/2 registrations have not reached the server/);
    confirm.mockRestore();
  });
});

function Outbox() {
  const { outbox, queueItem, setSimulatedOffline } = useOfflineSync();
  return (
    <div>
      <button onClick={() => setSimulatedOffline(true)}>offline</button>
      <button onClick={() => queueItem(SYNC_ITEM_TYPES.REGISTRATION_DRAFT, 'Draft', { name: 'Offline Patient' })}>queue</button>
      <span data-testid="count">{outbox.length}</span>
    </div>
  );
}
const asStaff = (id) => (
  <AuthContext.Provider value={{ staff: { id } }}>
    <SyncProvider><Outbox /></SyncProvider>
  </AuthContext.Provider>
);

describe('offline outbox ownership', () => {
  beforeEach(() => localStorage.clear());

  it('shows queued registrations only to the staff member who queued them', () => {
    const { rerender } = render(asStaff('STAFF-A'));
    fireEvent.click(screen.getByText('offline'));
    fireEvent.click(screen.getByText('queue'));
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(read(SYNC_OUTBOX_KEY)[0].staffId).toBe('STAFF-A');

    rerender(asStaff('STAFF-B'));
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(read(SYNC_OUTBOX_KEY)).toHaveLength(1);
  });

  it('drops the departing user\'s items from the outbox at sign-out', () => {
    render(asStaff('STAFF-A'));
    fireEvent.click(screen.getByText('offline'));
    fireEvent.click(screen.getByText('queue'));
    act(() => clearPatientDataFor('STAFF-A'));
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(read(SYNC_OUTBOX_KEY)).toBeNull();
  });
});
