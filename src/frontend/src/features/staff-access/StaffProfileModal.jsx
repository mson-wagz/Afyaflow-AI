import React from 'react';
import useAuth from './useAuth';
import { Modal, Button, Badge } from '../../components';
import { ROLE_PERMISSIONS } from '../../../../shared/contracts/auth.js';

/**
 * Staff Profile & Terminal Settings Modal
 */
export default function StaffProfileModal({ isOpen, onClose }) {
  const {
    staff,
    signOut,
    lockSession,
    idleTimeoutMinutes,
    setIdleTimeoutMinutes,
  } = useAuth();

  if (!staff) return null;

  const permissions = ROLE_PERMISSIONS[staff.role] || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Staff Profile & Terminal Settings"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              onClose();
              lockSession();
            }}
          >
            🔒 Lock Terminal
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onClose();
              signOut();
            }}
          >
            Sign Out
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Profile Card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1rem',
            backgroundColor: '#f8fafc',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              backgroundColor: staff.isClinical ? 'var(--color-clinical)' : 'var(--color-admin)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              fontWeight: 700,
            }}
          >
            {staff.avatarInitials}
          </div>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{staff.name}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              {staff.title}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
              <Badge variant={staff.isClinical ? 'clinical' : 'admin'}>
                {staff.isClinical ? 'Clinical Role' : 'Administrative Role'}
              </Badge>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)' }}>
                ID: {staff.staffNumber}
              </span>
            </div>
          </div>
        </div>

        {/* Facility & Department */}
        <div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Assigned Facility & Station
          </h3>
          <div
            style={{
              fontSize: '0.875rem',
              color: 'var(--color-text)',
              lineHeight: 1.6,
              padding: '0.75rem',
              backgroundColor: '#fff',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div><strong>Facility:</strong> {staff.facilityName}</div>
            <div><strong>Department:</strong> {staff.department}</div>
          </div>
        </div>

        {/* Assigned RBAC Permissions */}
        <div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Authorised System Capabilities ({permissions.length})
          </h3>
          <ul
            style={{
              listStyle: 'none',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.35rem',
            }}
          >
            {permissions.map((perm) => (
              <li key={perm}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.2rem 0.5rem',
                    backgroundColor: '#e2e8f0',
                    color: '#334155',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                  }}
                >
                  ✓ {perm}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Shared Device Auto-Lock Timeout */}
        <div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.35rem' }}>
            Shared Device Inactivity Auto-Lock
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
            Automatically locks patient data when terminal is inactive.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {[1, 5, 15, 30].map((mins) => (
              <button
                key={mins}
                type="button"
                className={`btn btn-sm ${idleTimeoutMinutes === mins ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setIdleTimeoutMinutes(mins)}
              >
                {mins} min
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
