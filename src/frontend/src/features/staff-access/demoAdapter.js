/**
 * @file apiAdapter.js
 * Contract-aligned synthetic authentication and authorization API adapter.
 * Simulates server-side responses, network latency, credential checks,
 * and strict server-side RBAC enforcement.
 */

import {
  SYNTHETIC_STAFF_FIXTURES,
  hasPermission,
  isClinicalRole,
  validateSignInCredentials,
  createPermissionDeniedError,
  PERMISSIONS,
} from '../../../../shared/contracts/auth.js';

// Internal simulated audit log for access events
let mockAuditLogs = [
  {
    id: 'LOG-001',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    staffId: 'STAFF-101',
    staffName: 'Jane Mwangi, RN',
    eventType: 'SIGN_IN',
    details: 'Initial system login from Triage Station 1',
  },
];

/**
 * Simulates server-side sign-in
 * @param {string} identifier Staff ID, Staff Number, or Name
 * @param {string} pin 4-digit PIN
 * @returns {Promise<{ success: boolean, staff?: object, token?: string, error?: string }>}
 */
export async function apiSignIn(identifier, pin) {
  // Simulate network delay (100ms)
  await new Promise((resolve) => setTimeout(resolve, 100));

  const validation = validateSignInCredentials(identifier, pin);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const cleanId = identifier.trim().toLowerCase();
  const staff = SYNTHETIC_STAFF_FIXTURES.find(
    (s) =>
      s.id.toLowerCase() === cleanId ||
      s.staffNumber.toLowerCase() === cleanId ||
      s.name.toLowerCase().includes(cleanId)
  );

  if (!staff) {
    return {
      success: false,
      error: 'Staff identifier not found. Please verify your staff ID or number.',
    };
  }

  if (staff.pin !== pin.trim()) {
    return {
      success: false,
      error: 'Invalid 4-digit security PIN. Please try again.',
    };
  }

  // Create audit log entry
  const logEntry = {
    id: `LOG-${Date.now()}`,
    timestamp: new Date().toISOString(),
    staffId: staff.id,
    staffName: staff.name,
    eventType: 'SIGN_IN',
    details: `Successful sign-in as ${staff.role} (${staff.title})`,
  };
  mockAuditLogs.unshift(logEntry);

  const token = `afya_tok_${staff.id}_${Date.now()}`;
  return {
    success: true,
    staff: {
      id: staff.id,
      staffNumber: staff.staffNumber,
      name: staff.name,
      role: staff.role,
      title: staff.title,
      isClinical: staff.isClinical,
      facilityId: staff.facilityId,
      facilityName: staff.facilityName,
      department: staff.department,
      avatarInitials: staff.avatarInitials,
    },
    token,
    sessionExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8 hour shift
  };
}

/**
 * Simulates terminal PIN verification for unlocking a locked shared-device session
 * @param {string} staffId
 * @param {string} pin
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function apiUnlockSession(staffId, pin) {
  await new Promise((resolve) => setTimeout(resolve, 80));

  const staff = SYNTHETIC_STAFF_FIXTURES.find((s) => s.id === staffId);
  if (!staff) {
    return { success: false, error: 'Staff record not found' };
  }

  if (staff.pin !== pin.trim()) {
    return { success: false, error: 'Incorrect PIN. Unable to unlock terminal.' };
  }

  mockAuditLogs.unshift({
    id: `LOG-${Date.now()}`,
    timestamp: new Date().toISOString(),
    staffId: staff.id,
    staffName: staff.name,
    eventType: 'SESSION_UNLOCK',
    details: 'Terminal unlocked with valid staff PIN',
  });

  return { success: true };
}

/**
 * Simulates server-side clinical action execution with strict RBAC enforcement.
 * As per acceptance check:
 * "Unauthorised roles cannot use clinical controls; backend denial is shown clearly."
 *
 * @param {object} currentStaff Current logged-in staff
 * @param {string} action Requested action (e.g. PERMISSIONS.CLINICAL_APPROVAL)
 * @param {object} payload Action parameters (e.g. patientId, priority, rationale)
 * @returns {Promise<{ success: boolean, data?: object, error?: object }>}
 */
export async function apiExecuteClinicalAction(currentStaff, action, payload = {}) {
  await new Promise((resolve) => setTimeout(resolve, 150));

  if (!currentStaff) {
    return {
      success: false,
      error: {
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Authentication required. Please sign in to perform clinical actions.',
      },
    };
  }

  // Strict server-side permission verification
  const isAuthorized = hasPermission(currentStaff.role, action);
  if (!isAuthorized) {
    const error = createPermissionDeniedError(action, currentStaff.role);

    mockAuditLogs.unshift({
      id: `LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      staffId: currentStaff.id,
      staffName: currentStaff.name,
      eventType: 'PERMISSION_DENIED',
      details: `Denied attempt to perform "${action}". Role "${currentStaff.role}" lacks clinical approval authority.`,
    });

    return {
      success: false,
      error,
    };
  }

  // Server-acknowledged approval record
  const approvalRecord = {
    approvalId: `APR-${Date.now()}`,
    patientId: payload.patientId || 'SYN-PT-001',
    decision: payload.decision || 'APPROVED',
    clinicianId: currentStaff.id,
    clinicianName: currentStaff.name,
    clinicianRole: currentStaff.role,
    timestamp: new Date().toISOString(),
    reason: payload.reason || 'Reviewed evidence and confirmed SATS priority score.',
    serverAcknowledged: true,
  };

  mockAuditLogs.unshift({
    id: `LOG-${Date.now()}`,
    timestamp: new Date().toISOString(),
    staffId: currentStaff.id,
    staffName: currentStaff.name,
    eventType: 'CLINICAL_DECISION_COMMITTED',
    details: `Committed ${payload.decision || 'approval'} for Patient ${approvalRecord.patientId}. Decision reason recorded.`,
  });

  return {
    success: true,
    data: approvalRecord,
  };
}

/**
 * Retrieves the simulated security audit log
 * @returns {Array<object>}
 */
export function apiGetAuditLogs() {
  return [...mockAuditLogs];
}
