import React, { useState } from 'react';
import './index.css';
import {
  AuthProvider,
  useAuth,
  SignInScreen,
  LockScreen,
  StaffProfileModal,
  SecurityAuditView,
} from './features/staff-access';
import { RegistrationView } from './features/registration';
import { TriageView } from './features/triage';
import { QueueView } from './features/queue';
import { DeteriorationView } from './features/deterioration';
import { RoutingView } from './features/routing';
import { SyncProvider, useOfflineSync, OfflineSyncView } from './offline';
import { Header, Navigation } from './components';
import { SESSION_STATUS, SYNTHETIC_STAFF_FIXTURES } from '../../shared/contracts/auth.js';

import { useBackend } from './api/client.js';
import ResearchView from './features/research/ResearchView.jsx';

function AppShell() {
  const {
    staff,
    restoring,authError,
    sessionStatus,
    lockSession,
    signOut,
    signIn,
    hasDraft,
    isClinical,
  } = useAuth();

  const { isOnline, pendingCount } = useOfflineSync();

  const [currentView, setCurrentView] = useState(useBackend?'research':'registration');
  const [profileOpen, setProfileOpen] = useState(false);

  if(restoring)return <div role="status">Restoring staff session…</div>;
  // If unauthenticated, show the Sign-In screen
  if (sessionStatus === SESSION_STATUS.UNAUTHENTICATED || !staff) {
    return <><div role="note" style={{padding:'0.75rem',backgroundColor:'#fff7ed',color:'#7c2d12'}}>Research demonstration: de-identified MIMIC-IV-ED Demo records and separate synthetic workflows. No live hospital connection.</div><div role="alert">{authError}</div><SignInScreen /></>;
  }

  // Quick switcher handler for evaluators/demos
  const handleQuickSwitchRole = async (targetStaff) => {
    await signIn(targetStaff.staffNumber, targetStaff.pin);
  };

  return (
    <div className="app-container">
      <div role="note" style={{padding:'0.6rem 1rem',backgroundColor:'#fff7ed',color:'#7c2d12'}}>
        {useBackend ? 'Research demonstration • MIMIC historical cases and separate synthetic workflows • Scoring is not clinically validated. No live hospital admissions.'
          : 'Synthetic demo — browser-local data and simulated tools. Clinical scoring is not validated.'}
      </div>
      {/* Shared-device lock screen overlay if locked */}
      {sessionStatus === SESSION_STATUS.LOCKED && <LockScreen />}

      {/* Top Application Header */}
      <Header
        staff={staff}
        onLock={lockSession}
        onSignOut={signOut}
        onOpenProfile={() => setProfileOpen(true)}
        hasDraft={hasDraft}
        isOnline={isOnline}
      />

      {/* Quick Evaluator Role Switcher Strip */}
      <aside
        style={{
          backgroundColor: '#0f172a',
          color: '#e2e8f0',
          padding: '0.45rem 1rem',
          fontSize: '0.8rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
          borderBottom: '1px solid #1e293b',
        }}
        aria-label="Evaluation persona switcher"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: '#38bdf8', fontWeight: 600 }}>Persona Switcher:</span>
          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
            Current: <strong>{staff.name}</strong> ({staff.role})
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {SYNTHETIC_STAFF_FIXTURES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => handleQuickSwitchRole(f)}
              style={{
                background: staff.id === f.id ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                border: '1px solid',
                borderColor: staff.id === f.id ? 'var(--color-primary-hover)' : 'rgba(255, 255, 255, 0.2)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.2rem 0.5rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: staff.id === f.id ? 700 : 500,
              }}
            >
              {f.name.split(' ')[0]} ({f.role})
            </button>
          ))}
        </div>
      </aside>

      {/* Responsive Shell: Navigation + Main Content */}
      <div className="app-shell">
        <aside className="app-sidebar">
          <Navigation
            currentView={currentView}
            onNavigate={setCurrentView}
            isClinical={isClinical}
            pendingSyncCount={pendingCount}
          />

          <div
            style={{
              marginTop: 'auto',
              padding: '0.85rem',
              backgroundColor: '#f8fafc',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              fontSize: '0.775rem',
              color: 'var(--color-text-muted)',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: '4px' }}>
              {useBackend?"Connected Workflow":"Demo Workflow"}
            </div>
            <div>• Synthetic protocol fixture</div>
            <div>• Human clinician review gate</div>
            <div>• Zero guessed measurements</div>
            <div>• Offline safe outbox retention</div>
          </div>
        </aside>

        <main hidden={sessionStatus === SESSION_STATUS.LOCKED} className="app-main" id="main-content" tabIndex={-1}>
          {currentView === 'research' && sessionStatus !== SESSION_STATUS.LOCKED && <ResearchView isClinical={isClinical} />}
          {currentView === 'registration' && <RegistrationView key={staff.id} currentStaff={staff} />}
          {currentView === 'triage' && <TriageView currentStaff={staff} isClinical={isClinical} />}
          {currentView === 'queue' && <QueueView />}
          {currentView === 'deterioration' && <DeteriorationView currentStaff={staff} isClinical={isClinical} />}
          {currentView === 'routing' && <RoutingView currentStaff={staff} isClinical={isClinical} />}
          {currentView === 'offline-sync' && <OfflineSyncView />}
          {currentView === 'security-audit' && <SecurityAuditView />}
        </main>
      </div>

      {/* Staff Profile & Settings Modal */}
      <StaffProfileModal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SyncProvider>
        <AppShell />
      </SyncProvider>
    </AuthProvider>
  );
}
