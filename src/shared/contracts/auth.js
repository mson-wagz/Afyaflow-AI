/**
 * @file auth.js
 * Browser-safe contracts and schemas for Staff Authentication, Role-Based Access Control (RBAC),
 * and Shared-Device Session Management.
 * 
 * Follows specs/frontend/app-shell-and-staff-access/spec.md
 */

export const ROLES = {
  NURSE: 'nurse',
  CLINICIAN: 'clinician',
  DOCTOR: 'doctor',
  CLERK: 'clerk',
  ADMIN: 'admin',
};

export const CLINICAL_ROLES = [ROLES.NURSE, ROLES.CLINICIAN, ROLES.DOCTOR];
export const NON_CLINICAL_ROLES = [ROLES.CLERK, ROLES.ADMIN];

export const PERMISSIONS = {
  // Clinical capabilities
  CLINICAL_APPROVAL: 'clinical:approval',
  CLINICAL_OVERRIDE: 'clinical:override',
  CLINICAL_TRIAGE_SCORING: 'clinical:triage_scoring',
  OBSERVATION_RECORD: 'observation:record',

  // Administrative / front-desk capabilities
  PATIENT_REGISTER: 'patient:register',
  QUEUE_VIEW: 'queue:view',
  AUDIT_VIEW: 'audit:view',
  SYSTEM_CONFIG: 'system:config',
};

/**
 * Role-to-permission mapping
 */
export const ROLE_PERMISSIONS = {
  [ROLES.NURSE]: [
    PERMISSIONS.CLINICAL_APPROVAL,
    PERMISSIONS.CLINICAL_OVERRIDE,
    PERMISSIONS.CLINICAL_TRIAGE_SCORING,
    PERMISSIONS.OBSERVATION_RECORD,
    PERMISSIONS.PATIENT_REGISTER,
    PERMISSIONS.QUEUE_VIEW,
  ],
  [ROLES.CLINICIAN]: [
    PERMISSIONS.CLINICAL_APPROVAL,
    PERMISSIONS.CLINICAL_OVERRIDE,
    PERMISSIONS.CLINICAL_TRIAGE_SCORING,
    PERMISSIONS.OBSERVATION_RECORD,
    PERMISSIONS.PATIENT_REGISTER,
    PERMISSIONS.QUEUE_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
  [ROLES.DOCTOR]: [
    PERMISSIONS.CLINICAL_APPROVAL,
    PERMISSIONS.CLINICAL_OVERRIDE,
    PERMISSIONS.CLINICAL_TRIAGE_SCORING,
    PERMISSIONS.OBSERVATION_RECORD,
    PERMISSIONS.PATIENT_REGISTER,
    PERMISSIONS.QUEUE_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
  [ROLES.CLERK]: [
    PERMISSIONS.PATIENT_REGISTER,
    PERMISSIONS.QUEUE_VIEW,
  ],
  [ROLES.ADMIN]: [
    PERMISSIONS.QUEUE_VIEW,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.SYSTEM_CONFIG,
  ],
};

export const SESSION_STATUS = {
  UNAUTHENTICATED: 'unauthenticated',
  AUTHENTICATED: 'authenticated',
  LOCKED: 'locked',
  EXPIRED: 'expired',
};

/**
 * Synthetic staff fixtures for development, testing, and evaluation
 */
export const SYNTHETIC_STAFF_FIXTURES = [
  {
    id: 'STAFF-101',
    staffNumber: 'KNH-NURSE-042',
    name: 'Jane Mwangi, RN',
    role: ROLES.NURSE,
    title: 'Senior Triage Nurse',
    isClinical: true,
    facilityId: 'FAC-KEN-01',
    facilityName: 'Kenyatta National Hospital',
    department: 'Emergency & Triage',
    pin: '1234',
    avatarInitials: 'JM',
  },
  {
    id: 'STAFF-102',
    staffNumber: 'KNH-MED-019',
    name: 'Dr. Kamau Otieno',
    role: ROLES.CLINICIAN,
    title: 'Medical Officer / Clinician',
    isClinical: true,
    facilityId: 'FAC-KEN-01',
    facilityName: 'Kenyatta National Hospital',
    department: 'Emergency Medicine',
    pin: '2345',
    avatarInitials: 'KO',
  },
  {
    id: 'STAFF-103',
    staffNumber: 'KNH-ADM-088',
    name: 'Faith Achieng',
    role: ROLES.CLERK,
    title: 'Admissions & Registration Officer',
    isClinical: false,
    facilityId: 'FAC-KEN-01',
    facilityName: 'Kenyatta National Hospital',
    department: 'Front Desk & Patient Admissions',
    pin: '3456',
    avatarInitials: 'FA',
  },
  {
    id: 'STAFF-104',
    staffNumber: 'KNH-OPS-005',
    name: 'Samuel Kiprop',
    role: ROLES.ADMIN,
    title: 'Facility IT & Operations Admin',
    isClinical: false,
    facilityId: 'FAC-KEN-01',
    facilityName: 'Kenyatta National Hospital',
    department: 'Hospital Administration',
    pin: '4567',
    avatarInitials: 'SK',
  },
];

/**
 * Checks if a given role has a specific permission
 * @param {string} role
 * @param {string} permission
 * @returns {boolean}
 */
export function hasPermission(role, permission) {
  if (!role || !permission) return false;
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

/**
 * Checks whether a given role is clinical (authorized for clinical decisions)
 * @param {string} role
 * @returns {boolean}
 */
export function isClinicalRole(role) {
  return CLINICAL_ROLES.includes(role);
}

/**
 * Validates sign-in credentials input
 * @param {string} identifier Staff ID or Staff Number
 * @param {string} pin 4-digit numeric PIN
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateSignInCredentials(identifier, pin) {
  if (!identifier || identifier.trim().length === 0) {
    return { valid: false, error: 'Staff identifier is required' };
  }
  if (!pin || pin.trim().length === 0) {
    return { valid: false, error: 'Staff PIN is required' };
  }
  if (!/^\d{4}$/.test(pin.trim())) {
    return { valid: false, error: 'PIN must be exactly 4 digits' };
  }
  return { valid: true };
}

/**
 * Creates a standardized 403 Forbidden permission denied error object
 * @param {string} action
 * @param {string} userRole
 * @param {string} [customMessage]
 * @returns {{ status: number, code: string, message: string, details: object }}
 */
export function createPermissionDeniedError(action, userRole, customMessage) {
  const isClinicalAction = action.startsWith('clinical:');
  const defaultMessage = isClinicalAction
    ? `Access Denied: Clinical approval authority required. Staff role "${userRole}" does not have clinical approval rights.`
    : `Access Denied: Unauthorised action "${action}" for role "${userRole}".`;

  return {
    status: 403,
    code: 'PERMISSION_DENIED',
    message: customMessage || defaultMessage,
    details: {
      action,
      userRole,
      requiredRoleType: isClinicalAction ? 'clinical' : 'administrative',
      timestamp: new Date().toISOString(),
    },
  };
}
