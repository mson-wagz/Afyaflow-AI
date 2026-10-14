import React from 'react';
import Badge from './Badge';
import Button from './Button';

/**
 * Responsive Application Header
 * Displays branding, facility info, current staff identity, role badge,
 * device lock button for shared terminals, and sign-out control.
 */
export default function Header({
  staff,
  onLock,
  onSignOut,
  onOpenProfile,
  isOnline = true,
  hasDraft = false,
}) {
  return (
    <header className="app-header" role="banner">
      <div className="header-brand">
        <div>
          <div className="brand-title">
            <span>AfyaFlow AI</span>
            <span className="brand-badge">PWA</span>
          </div>
          <div className="facility-label">
            {staff?.facilityName || 'Kenyan Healthcare Facility'}
          </div>
        </div>
      </div>

      <div className="header-actions">
        {/* Connectivity status */}
        <Badge
          variant={isOnline ? 'online' : 'locked'}
          icon={isOnline ? '● ' : '○ '}
          aria-label={isOnline ? 'Network status: Online' : 'Network status: Offline'}
        >
          {isOnline ? 'Online' : 'Offline'}
        </Badge>

        {/* Draft indicator if present */}
        {hasDraft && (
          <Badge variant="draft" icon="📝 ">
            Draft Preserved
          </Badge>
        )}

        {/* Current staff info & profile button */}
        {staff && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={onOpenProfile}
              className="btn btn-outline btn-sm"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.35rem 0.65rem',
                borderRadius: 'var(--radius-md)',
              }}
              aria-label={`View profile for ${staff.name}, ${staff.title}`}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: staff.isClinical ? 'var(--color-clinical)' : 'var(--color-admin)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                {staff.avatarInitials || 'ST'}
              </div>
              <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.2 }}>
                  {staff.name}
                </span>
                <span style={{ fontSize: '0.725rem', color: 'var(--color-text-subtle)' }}>
                  {staff.title}
                </span>
              </div>
            </button>

            <Badge variant={staff.isClinical ? 'clinical' : 'admin'}>
              {staff.isClinical ? 'Clinical Staff' : 'Administrative'}
            </Badge>

            {/* Shared Device Quick Lock Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={onLock}
              aria-label="Lock shared device terminal"
              title="Lock shared terminal to protect patient confidentiality"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <span aria-hidden="true">🔒</span>
              <span>Lock Terminal</span>
            </Button>

            {/* Sign Out Button */}
            <Button
              variant="secondary"
              size="sm"
              onClick={onSignOut}
              aria-label="Sign out of AfyaFlow AI"
              title="Sign out"
            >
              Sign Out
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
