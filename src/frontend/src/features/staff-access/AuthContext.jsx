import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  SESSION_STATUS,
  SYNTHETIC_STAFF_FIXTURES,
  hasPermission,
  isClinicalRole,
  PERMISSIONS,
} from '../../../../shared/contracts/auth.js';
import {
  apiSignIn,
  apiUnlockSession,
  apiExecuteClinicalAction,
  apiGetAuditLogs,
} from './apiAdapter.js';

export const AuthContext = createContext(null);

const DRAFT_STORAGE_KEY = 'afyaflow_local_draft_v1';
const SESSION_STORAGE_KEY = 'afyaflow_session_v1';

export function AuthProvider({ children }) {
  // Initialize with the senior triage nurse fixture for convenient development/demo
  const [staff, setStaff] = useState(() => {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    // Default to Nurse Jane Mwangi
    return SYNTHETIC_STAFF_FIXTURES[0];
  });

  const [sessionStatus, setSessionStatus] = useState(
    staff ? SESSION_STATUS.AUTHENTICATED : SESSION_STATUS.UNAUTHENTICATED
  );
  const [lockTimestamp, setLockTimestamp] = useState(null);
  const [lastPermissionError, setLastPermissionError] = useState(null);
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(5);
  const [auditLogs, setAuditLogs] = useState(apiGetAuditLogs);

  // Draft retention policy implementation
  // "Locking or session expiry hides patient content and follows the reviewed draft-retention policy."
  const [localDraft, setLocalDraft] = useState(() => {
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const inactivityTimerRef = useRef(null);

  const refreshLogs = useCallback(() => {
    setAuditLogs(apiGetAuditLogs());
  }, []);

  // Save session state to localStorage
  const updateStaff = useCallback((newStaff) => {
    setStaff(newStaff);
    if (newStaff) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newStaff));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, []);

  // Locking function
  const lockSession = useCallback(() => {
    setSessionStatus(SESSION_STATUS.LOCKED);
    setLockTimestamp(new Date().toLocaleTimeString());
    setLastPermissionError(null);
  }, []);

  // Reset inactivity timer
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    if (sessionStatus === SESSION_STATUS.AUTHENTICATED && idleTimeoutMinutes > 0) {
      // Timeout in ms
      const timeoutMs = idleTimeoutMinutes * 60 * 1000;
      inactivityTimerRef.current = setTimeout(() => {
        // Auto-lock on inactivity
        lockSession();
      }, timeoutMs);
    }
  }, [sessionStatus, idleTimeoutMinutes, lockSession]);

  // Set up activity listeners
  useEffect(() => {
    if (sessionStatus !== SESSION_STATUS.AUTHENTICATED) return;

    const handleUserActivity = () => {
      resetInactivityTimer();
    };

    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('click', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);

    resetInactivityTimer();

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [sessionStatus, resetInactivityTimer]);

  // Sign In handler
  const signIn = async (identifier, pin) => {
    setLastPermissionError(null);
    const result = await apiSignIn(identifier, pin);
    if (result.success) {
      updateStaff(result.staff);
      setSessionStatus(SESSION_STATUS.AUTHENTICATED);
      setLockTimestamp(null);
      refreshLogs();
    }
    return result;
  };

  // Sign Out handler
  const signOut = () => {
    updateStaff(null);
    setSessionStatus(SESSION_STATUS.UNAUTHENTICATED);
    setLockTimestamp(null);
    setLastPermissionError(null);
  };

  // Unlock session with PIN
  const unlockSession = async (pin) => {
    if (!staff) return { success: false, error: 'No active session' };
    const result = await apiUnlockSession(staff.id, pin);
    if (result.success) {
      setSessionStatus(SESSION_STATUS.AUTHENTICATED);
      setLockTimestamp(null);
      refreshLogs();
    }
    return result;
  };

  // Switch account from lock screen
  const switchAccount = () => {
    // Preserve local drafts or notify user
    setSessionStatus(SESSION_STATUS.UNAUTHENTICATED);
    updateStaff(null);
    setLockTimestamp(null);
  };

  // Draft operations
  const saveDraft = useCallback((draftData) => {
    const payload = {
      ...draftData,
      savedAt: new Date().toISOString(),
      savedBy: staff?.id,
    };
    setLocalDraft(payload);
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [staff]);

  const clearDraft = useCallback(() => {
    setLocalDraft(null);
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // Permission checking
  const can = useCallback(
    (permission) => {
      if (!staff) return false;
      return hasPermission(staff.role, permission);
    },
    [staff]
  );

  const isClinical = staff ? isClinicalRole(staff.role) : false;

  // Execute clinical action through server API with simulated denial for non-clinical
  const performClinicalAction = async (action, payload) => {
    setLastPermissionError(null);
    const result = await apiExecuteClinicalAction(staff, action, payload);
    refreshLogs();
    if (!result.success) {
      setLastPermissionError(result.error);
    }
    return result;
  };

  const clearPermissionError = () => {
    setLastPermissionError(null);
  };

  const value = {
    staff,
    sessionStatus,
    lockTimestamp,
    isClinical,
    localDraft,
    hasDraft: Boolean(localDraft),
    lastPermissionError,
    idleTimeoutMinutes,
    auditLogs,
    signIn,
    signOut,
    lockSession,
    unlockSession,
    switchAccount,
    saveDraft,
    clearDraft,
    can,
    performClinicalAction,
    clearPermissionError,
    setIdleTimeoutMinutes,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
