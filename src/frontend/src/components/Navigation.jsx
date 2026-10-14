import React from 'react';
import Badge from './Badge';

/**
 * Role-aware responsive navigation sidebar / navigation bar
 */
export default function Navigation({
  currentView,
  onNavigate,
  isClinical = false,
  pendingSyncCount = 0,
}) {
  const navItems = [
    {
      id: 'registration',
      label: 'Patient Registration',
      icon: '📝',
      requiresClinical: false,
      description: 'Intake and timestamped vital observations',
    },
    {
      id: 'triage',
      label: 'Triage & Prioritisation',
      icon: '🩺',
      requiresClinical: true,
      description: 'SATS protocol scoring and clinical decisions',
    },
    {
      id: 'queue',
      label: 'Hospital Queue',
      icon: '📋',
      requiresClinical: false,
      description: 'Approved ordering and waiting times',
    },
    {
      id: 'deterioration',
      label: 'Deterioration Review',
      icon: '📈',
      requiresClinical: true,
      description: 'Surveillance of recorded vitals deltas',
    },
    {
      id: 'routing',
      label: 'Department Routing',
      icon: '🏥',
      requiresClinical: true,
      description: 'Facility capacity snapshots and patient transfers',
    },
    {
      id: 'offline-sync',
      label: 'Offline Sync & Outbox',
      icon: '📡',
      requiresClinical: false,
      description: 'PWA outbox, retry triggers and sync state',
      badge: pendingSyncCount > 0 ? `${pendingSyncCount} pending` : null,
    },
    {
      id: 'security-audit',
      label: 'Staff Access & Audit',
      icon: '🛡️',
      requiresClinical: false,
      description: 'Active sessions, locks, and permission logs',
    },
  ];

  return (
    <nav aria-label="Main application navigation">
      <ul className="nav-list">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const isRestrictedForUser = item.requiresClinical && !isClinical;

          return (
            <li key={item.id}>
              <button
                type="button"
                className={`nav-link ${isActive ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  opacity: isRestrictedForUser ? 0.8 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  {item.badge && (
                    <Badge variant="draft" style={{ fontSize: '0.65rem' }}>
                      {item.badge}
                    </Badge>
                  )}
                  {item.requiresClinical && (
                    <Badge
                      variant={isClinical ? 'clinical' : 'locked'}
                      style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}
                    >
                      {isClinical ? 'Clinical' : 'Restricted'}
                    </Badge>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
