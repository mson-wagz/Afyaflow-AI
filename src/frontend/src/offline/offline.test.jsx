import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { SyncProvider, useOfflineSync } from './SyncContext';
import OfflineSyncView from './OfflineSyncView';
import {
  SYNC_STATUS,
  SYNC_ITEM_TYPES,
  checkOfflineActionPolicy,
} from '../../shared/contracts/offline.js';

function TestConsumer() {
  const { isOnline, setSimulatedOffline, queueItem, outbox } = useOfflineSync();

  return (
    <div>
      <span data-testid="online-status">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
      <button onClick={() => setSimulatedOffline(true)}>Go Offline</button>
      <button
        onClick={() =>
          queueItem(SYNC_ITEM_TYPES.REGISTRATION_DRAFT, 'Draft 1', { name: 'Offline Patient' })
        }
      >
        Queue Intake Draft
      </button>
      <div data-testid="outbox-count">{outbox.length}</div>
    </div>
  );
}

describe('Offline PWA & Sync Feature Specification Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('FE-OFFLINE-PWA-02 & 03: Outbox Queue & Offline Action Policy', () => {
    it('blocks clinical decisions when offline, requiring online server acknowledgement', () => {
      // Online: clinical decision is allowed
      const onlinePolicy = checkOfflineActionPolicy(SYNC_ITEM_TYPES.CLINICAL_DECISION, true);
      expect(onlinePolicy.allowedOffline).toBe(true);

      // Offline: clinical decision MUST be blocked
      const offlinePolicy = checkOfflineActionPolicy(SYNC_ITEM_TYPES.CLINICAL_DECISION, false);
      expect(offlinePolicy.allowedOffline).toBe(false);
      expect(offlinePolicy.reason).toMatch(/requires active online connectivity/i);
    });

    it('permits registration drafts to be captured offline into local sync outbox', () => {
      const offlineDraftPolicy = checkOfflineActionPolicy(SYNC_ITEM_TYPES.REGISTRATION_DRAFT, false);
      expect(offlineDraftPolicy.allowedOffline).toBe(true);
    });

    it('queues offline draft into local storage and displays distinct sync state', () => {
      render(
        <SyncProvider>
          <OfflineSyncView />
        </SyncProvider>
      );

      expect(screen.getByText(/Network Status & PWA Outbox Synchronization/i)).toBeInTheDocument();
      expect(screen.getByText(/Hospital Offline Safety Policy/i)).toBeInTheDocument();

      const addDraftBtn = screen.getByRole('button', { name: /\+ Add Test Offline Draft/i });
      fireEvent.click(addDraftBtn);

      expect(screen.getByText(/Offline draft queued into local sync outbox/i)).toBeInTheDocument();
    });
  });
});
