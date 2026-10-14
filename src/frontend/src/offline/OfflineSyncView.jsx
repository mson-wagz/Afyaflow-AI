import React, { useState } from 'react';
import { useOfflineSync } from './SyncContext';
import { Card, Button, Badge, Alert } from '../components';
import { SYNC_ITEM_TYPES, SYNC_STATUS } from '../../../shared/contracts/offline.js';

/**
 * Offline PWA Synchronization & Outbox View
 * 
 * Fulfills FE-OFFLINE-PWA-01 through 03:
 * - App-shell status, local drafts, and reconnect retry.
 * - Distinct draft, pending, failed, and confirmed sync states.
 * - Enforces that clinical approvals require online server acknowledgement.
 */
export default function OfflineSyncView() {
  const {
    isOnline,
    simulatedOffline,
    setSimulatedOffline,
    outbox,
    isSyncing,
    lastSyncResult,
    pendingCount,
    syncOutbox,
    queueItem,
    clearConfirmed,
  } = useOfflineSync();

  const [notification, setNotification] = useState('');

  const handleAddTestDraft = () => {
    try {
      queueItem(
        SYNC_ITEM_TYPES.REGISTRATION_DRAFT,
        `Offline Patient Registration #${Math.floor(100 + Math.random() * 900)}`,
        { name: 'Simulated Offline Patient', complaint: 'Fever' }
      );
      setNotification('Offline draft queued into local sync outbox.');
      setTimeout(() => setNotification(''), 3000);
    } catch (err) {
      setNotification(`Error: ${err.message}`);
    }
  };

  const handleAttemptOfflineApproval = () => {
    try {
      // Trying to queue clinical decision offline should throw per safety contract!
      queueItem(
        SYNC_ITEM_TYPES.CLINICAL_DECISION,
        'Clinical Decision for Patient 8821',
        { decision: 'APPROVED' }
      );
    } catch (err) {
      setNotification(`Safety Blocked: ${err.message}`);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case SYNC_STATUS.CONFIRMED:
        return <Badge variant="online">Confirmed Server State</Badge>;
      case SYNC_STATUS.PENDING_SYNC:
        return <Badge variant="draft">Pending Reconnect Sync</Badge>;
      case SYNC_STATUS.FAILED_SYNC:
        return <Badge variant="danger">Sync Failed</Badge>;
      default:
        return <Badge variant="warning">Local Draft</Badge>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Network Status Banner */}
      <Card
        title="Network Status & PWA Outbox Synchronization"
        subtitle="Manage offline draft capture, reconnect retries, and shared-terminal retention"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Badge variant={isOnline ? 'online' : 'danger'}>
              {isOnline ? 'Online (Connected)' : 'Offline (Intermittent)'}
            </Badge>
            <Button
              variant={simulatedOffline ? 'danger' : 'outline'}
              size="sm"
              onClick={() => setSimulatedOffline(!simulatedOffline)}
              title="Toggle offline simulation mode"
            >
              {simulatedOffline ? '⚡ Disable Offline Simulation' : '🔌 Simulate Offline Network'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
          <div>
            <strong>Active Outbox Items:</strong> {outbox.length} total ({pendingCount} pending upload)
          </div>
          {lastSyncResult && (
            <div style={{ color: 'var(--color-success-dark)', fontSize: '0.8rem' }}>
              ✓ Last sync at {new Date(lastSyncResult.timestamp).toLocaleTimeString()} ({lastSyncResult.itemsSynced} records confirmed)
            </div>
          )}

          {/* Offline Policy Warning */}
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: 'var(--color-primary-light)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(2, 132, 199, 0.3)',
              fontSize: '0.825rem',
            }}
          >
            <strong>Hospital Offline Safety Policy:</strong>
            <ul style={{ paddingLeft: '1.25rem', marginTop: '4px' }}>
              <li>Patient intake and observation drafts can be captured offline and will auto-sync on reconnect.</li>
              <li>Clinical triage decisions and shared queue ordering strictly require online server acknowledgement.</li>
              <li>Offline drafts are never presented to other terminals as confirmed queue state.</li>
            </ul>
          </div>
        </div>

        {/* Quick Testing Controls */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <Button
            variant="primary"
            size="sm"
            loading={isSyncing}
            disabled={!isOnline || isSyncing || pendingCount === 0}
            onClick={syncOutbox}
          >
            ↻ Retry / Flush Sync Outbox
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleAddTestDraft}
          >
            + Add Test Offline Draft
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleAttemptOfflineApproval}
          >
            Test Blocked Offline Approval
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={clearConfirmed}
          >
            Clear Confirmed Records
          </Button>
        </div>
      </Card>

      {notification && (
        <Alert variant={notification.startsWith('Safety Blocked') ? 'warning' : 'info'} onClose={() => setNotification('')}>
          {notification}
        </Alert>
      )}

      {/* Outbox Records Table */}
      <Card
        title="Sync Outbox & Local Queue"
        subtitle="Chronological list of local drafts and server transmission states"
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '0.65rem 0.5rem' }}>Sync ID</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Record Title & Type</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Created Time</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Synchronization Status</th>
              </tr>
            </thead>
            <tbody>
              {outbox.map((item) => (
                <tr key={item.syncId} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '0.65rem 0.5rem', fontFamily: 'monospace' }}>
                    {item.syncId}
                  </td>
                  <td style={{ padding: '0.65rem 0.5rem' }}>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                      Type: {item.type}
                    </div>
                  </td>
                  <td style={{ padding: '0.65rem 0.5rem', color: 'var(--color-text-muted)' }}>
                    {new Date(item.createdAt).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: '0.65rem 0.5rem' }}>
                    {getStatusBadge(item.status)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
