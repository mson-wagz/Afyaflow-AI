import React, { useCallback, useEffect, useState } from 'react';
import useAuth from './useAuth';
import { Card, Badge, Button, Input, Alert } from '../../components';
import { api, useBackend } from '../../api/client.js';

/**
 * Staff account management for administrators: deactivate or reactivate accounts, end a
 * person's sessions (lost or shared device) and issue a new PIN. Every change needs a reason
 * and is recorded in the audit trail. New PINs are shown once.
 */
export default function StaffAccountsView() {
  const { staff: currentStaff } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setAccounts(await api('/staff')); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { if (useBackend) load(); }, [load]);

  if (!useBackend) {
    return <Card title="Staff Accounts"><p>Staff account management requires the AfyaFlow server.</p></Card>;
  }

  const perform = async (account, action, label) => {
    setError(''); setNotice(''); setIssued(null);
    if (reason.trim().length < 5) { setError('Enter a reason of at least 5 characters before changing an account.'); return; }
    setBusy(true);
    try {
      const result = await api(`/staff/${encodeURIComponent(account.id)}/${action}`, { method: 'POST', body: { reason: reason.trim() } });
      if (action === 'reset-pin') setIssued({ name: account.name, id: account.id, pin: result.data.pin });
      else setNotice(`${label}: ${account.name}.`);
      setReason('');
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Card title="Staff Accounts" subtitle="Administrator account management. Every change is recorded in the audit trail.">
      {issued && (
        <Alert variant="warning" title={`New PIN for ${issued.name} (${issued.id})`} onClose={() => setIssued(null)}>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.3em', margin: '0.5rem 0' }}>{issued.pin}</p>
          <p>Give this PIN to {issued.name} privately. It will not be shown again. Their other sessions have been ended.</p>
        </Alert>
      )}
      {notice && <Alert variant="success" onClose={() => setNotice('')}>{notice}</Alert>}
      {error && <Alert variant="danger" onClose={() => setError('')}>{error}</Alert>}

      <Input id="staff-change-reason" label="Reason for the change" value={reason}
        onChange={(e) => setReason(e.target.value)} placeholder="e.g. Left the facility; Phone lost; Forgot PIN"
        hint="Required for every account change (at least 5 characters)" />

      <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
              <th style={{ padding: '0.5rem' }}>Staff</th>
              <th style={{ padding: '0.5rem' }}>Role</th>
              <th style={{ padding: '0.5rem' }}>Status</th>
              <th style={{ padding: '0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const self = account.id === currentStaff?.id;
              return (
                <tr key={account.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '0.5rem' }}>
                    <strong>{account.name}</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{account.id} · {account.staffNumber}</div>
                  </td>
                  <td style={{ padding: '0.5rem' }}>{account.role}{account.role === 'admin' && !account.mfaEnrolled ? ' (no authenticator)' : ''}</td>
                  <td style={{ padding: '0.5rem' }}>
                    <Badge variant={account.active ? 'online' : 'locked'}>{account.active ? 'Active' : 'Deactivated'}</Badge>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{account.openSessions} open session{account.openSessions === 1 ? '' : 's'}</div>
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    {self ? <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Your account</span> : (
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {account.active
                          ? <Button size="sm" variant="danger" disabled={busy} onClick={() => perform(account, 'deactivate', 'Deactivated')}>Deactivate</Button>
                          : <Button size="sm" variant="outline" disabled={busy} onClick={() => perform(account, 'reactivate', 'Reactivated')}>Reactivate</Button>}
                        <Button size="sm" variant="outline" disabled={busy || !account.active} onClick={() => perform(account, 'reset-pin')}>Reset PIN</Button>
                        <Button size="sm" variant="outline" disabled={busy || !account.openSessions} onClick={() => perform(account, 'end-sessions', 'Signed out everywhere')}>End sessions</Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.75rem' }}>
        Authenticator apps for administrators are enrolled by the system operator.
      </p>
    </Card>
  );
}
