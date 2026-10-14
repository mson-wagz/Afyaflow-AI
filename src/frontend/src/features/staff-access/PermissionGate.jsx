import React from 'react';
import useAuth from './useAuth';
import Alert from '../../components/Alert';
import Badge from '../../components/Badge';

/**
 * PermissionGate component
 * Conditionally renders clinical controls or shows explicit permission notices.
 * 
 * Fulfills FE-APP-SHELL-AND-STAFF-ACCESS-03:
 * "Handle role-aware navigation and server permission errors."
 * "Unauthorised roles cannot use clinical controls; backend denial is shown clearly."
 */
export default function PermissionGate({
  permission,
  children,
  fallback = null,
  showNotice = false,
  noticeTitle = 'Permission Restricted',
}) {
  const { staff, can } = useAuth();

  const isAllowed = can(permission);

  if (isAllowed) {
    return <>{children}</>;
  }

  if (showNotice) {
    return (
      <div style={{ margin: '0.75rem 0' }}>
        <Alert variant="warning" title={noticeTitle}>
          <div>
            Your assigned role (
            <Badge variant="admin" style={{ margin: '0 4px' }}>
              {staff?.role || 'Guest'}
            </Badge>
            ) does not have clinical approval authority.
          </div>
          <div style={{ fontSize: '0.8rem', marginTop: '4px', color: 'var(--color-warning-dark)' }}>
            Hospital policy requires licensed clinical staff (Nurse or Clinician) to approve triage proposals.
          </div>
        </Alert>
      </div>
    );
  }

  return <>{fallback}</>;
}
