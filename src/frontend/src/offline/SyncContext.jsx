import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { SYNC_STATUS, SYNC_ITEM_TYPES } from '../../../shared/contracts/offline.js';
import { setDemoOffline, isDemoOnline } from '../demo/store.js';
import { apiRegisterPatient } from '../features/registration/apiAdapter.js';

const SYNC_STORAGE_KEY = 'afyaflow_sync_outbox_v1';
export const SyncContext = createContext(null);

export function SyncProvider({ children }) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [simulatedOffline, setOffline] = useState(false);
  const [outbox, setOutbox] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SYNC_STORAGE_KEY) || '[]'); }
    catch { return []; }
  });
  const outboxRef = useRef(outbox);
  const syncingRef = useRef(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const effectiveOnline = isOnline && !simulatedOffline;

  const saveOutbox = useCallback(next => {
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(next));
    outboxRef.current = next;
    setOutbox(next);
  }, []);

  const setSimulatedOffline = useCallback(value => {
    setDemoOffline(value);
    setOffline(value);
  }, []);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      setDemoOffline(false);
    };
  }, []);

  const syncOutbox = useCallback(async () => {
    if (!isDemoOnline() || syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    let processedCount = 0;
    try {
      for (const item of [...outboxRef.current]) {
        if (!isDemoOnline()) break;
        if (item.status === SYNC_STATUS.CONFIRMED) continue;
        let result;
        try {
          result = item.type === SYNC_ITEM_TYPES.REGISTRATION_DRAFT
            ? await apiRegisterPatient(item.payload, item.syncId)
            : {success:false,error:'This draft type has no demo sync adapter.'};
        } catch (error) { result = {success:false,error:error.message}; }
        if (result.success) processedCount++;
        saveOutbox(outboxRef.current.map(current => current.syncId !== item.syncId ? current : {
          ...current, status:result.success ? SYNC_STATUS.CONFIRMED : SYNC_STATUS.FAILED_SYNC,
          retryCount:(current.retryCount || 0)+1, error:result.error,
          syncedAt:result.success ? new Date().toISOString() : undefined,
          visitId:result.data?.id,
        }));
      }
      setLastSyncResult({timestamp:new Date().toISOString(),itemsSynced:processedCount});
    } catch (error) {
      setLastSyncResult({timestamp:new Date().toISOString(),itemsSynced:processedCount,error:error.message});
    } finally { syncingRef.current = false; setIsSyncing(false); }
  }, [saveOutbox]);

  useEffect(() => { if (effectiveOnline) syncOutbox(); }, [effectiveOnline, syncOutbox]);

  const queueItem = useCallback((type, title, payload, idempotencyKey) => {
    if (type === SYNC_ITEM_TYPES.CLINICAL_DECISION)
      throw new Error('Clinical triage approval requires active online connectivity and cannot be deferred to the draft outbox.');
    const syncId = idempotencyKey || `SYNC-${crypto.randomUUID()}`;
    const existing = outboxRef.current.find(item => item.syncId === syncId);
    if (existing) return existing;
    const item = {syncId,type,title,payload,status:SYNC_STATUS.PENDING_SYNC,
      createdAt:new Date().toISOString(),retryCount:0};
    saveOutbox([item,...outboxRef.current]);
    if (isDemoOnline()) syncOutbox();
    return item;
  }, [saveOutbox, syncOutbox]);

  const clearConfirmed = useCallback(() => {
    saveOutbox(outboxRef.current.filter(item => item.status !== SYNC_STATUS.CONFIRMED));
  }, [saveOutbox]);

  return <SyncContext.Provider value={{isOnline:effectiveOnline,rawBrowserOnline:isOnline,
    simulatedOffline,setSimulatedOffline,outbox,isSyncing,lastSyncResult,
    pendingCount:outbox.filter(item => item.status !== SYNC_STATUS.CONFIRMED).length,
    syncOutbox,queueItem,clearConfirmed}}>{children}</SyncContext.Provider>;
}

export function useOfflineSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useOfflineSync must be used within a SyncProvider');
  return context;
}
