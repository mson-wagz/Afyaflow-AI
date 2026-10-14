import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  SYNC_STATUS,
  SYNC_ITEM_TYPES,
  checkOfflineActionPolicy,
} from '../../../shared/contracts/offline.js';

const SYNC_STORAGE_KEY = 'afyaflow_sync_outbox_v1';

export const SyncContext = createContext(null);

export function SyncProvider({ children }) {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [outbox, setOutbox] = useState(() => {
    try {
      const stored = localStorage.getItem(SYNC_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [
        {
          syncId: 'SYNC-001',
          type: SYNC_ITEM_TYPES.REGISTRATION_DRAFT,
          title: 'Patient Intake: Juma Kiprono',
          payload: { name: 'Juma Kiprono', age: 39, complaint: 'Acute sprained ankle' },
          status: SYNC_STATUS.DRAFT,
          createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          retryCount: 0,
        },
      ];
    } catch {
      return [];
    }
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);

  const effectiveOnline = isOnline && !simulatedOffline;

  // Listen for browser online/offline events
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Save outbox to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(outbox));
    } catch {
      // ignore
    }
  }, [outbox]);

  // Synchronize outbox items
  const syncOutbox = useCallback(async () => {
    if (!effectiveOnline || isSyncing) return;
    setIsSyncing(true);

    await new Promise((resolve) => setTimeout(resolve, 300));

    let processedCount = 0;
    setOutbox((prev) =>
      prev.map((item) => {
        if (item.status === SYNC_STATUS.PENDING_SYNC || item.status === SYNC_STATUS.DRAFT) {
          processedCount++;
          return {
            ...item,
            status: SYNC_STATUS.CONFIRMED,
            syncedAt: new Date().toISOString(),
          };
        }
        return item;
      })
    );

    setLastSyncResult({
      timestamp: new Date().toISOString(),
      itemsSynced: processedCount,
    });
    setIsSyncing(false);
  }, [effectiveOnline, isSyncing]);

  // Auto retry when returning online
  useEffect(() => {
    if (effectiveOnline) {
      syncOutbox();
    }
  }, [effectiveOnline, syncOutbox]);

  const queueItem = useCallback((type, title, payload) => {
    const policy = checkOfflineActionPolicy(type, effectiveOnline);
    if (!policy.allowedOffline) {
      throw new Error(policy.reason);
    }

    const newItem = {
      syncId: `SYNC-${Date.now()}`,
      type,
      title,
      payload,
      status: effectiveOnline ? SYNC_STATUS.CONFIRMED : SYNC_STATUS.PENDING_SYNC,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    setOutbox((prev) => [newItem, ...prev]);
    return newItem;
  }, [effectiveOnline]);

  const clearConfirmed = useCallback(() => {
    setOutbox((prev) => prev.filter((item) => item.status !== SYNC_STATUS.CONFIRMED));
  }, []);

  const value = {
    isOnline: effectiveOnline,
    rawBrowserOnline: isOnline,
    simulatedOffline,
    setSimulatedOffline,
    outbox,
    isSyncing,
    lastSyncResult,
    pendingCount: outbox.filter((i) => i.status === SYNC_STATUS.PENDING_SYNC || i.status === SYNC_STATUS.DRAFT).length,
    syncOutbox,
    queueItem,
    clearConfirmed,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useOfflineSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useOfflineSync must be used within a SyncProvider');
  }
  return context;
}
