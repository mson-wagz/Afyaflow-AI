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
import { confirmDiscardUnsynced } from './offline/browserData.js';
import { Header, Navigation } from './components';
import { SESSION_STATUS } from '../../shared/contracts/auth.js';

import { useBackend, competitionMode } from './api/client.js';
import ResearchView from './features/research/ResearchView.jsx';

function AppShell() {
  const {
    staff,
    restoring,authError,
    sessionStatus,
    lockSession,
    signOut,
    hasDraft,
    isClinical,
  } = useAuth();

  const { isOnline, pendingCount } = useOfflineSync();

  const [currentView, setCurrentView] = useState(useBackend && !competitionMode?'research':'registration');
  const [profileOpen, setProfileOpen] = useState(false);

  if(restoring)return <div role="status">Restoring staff session…</div>;
  // If unauthenticated, show the Sign-In screen
  if (sessionStatus === SESSION_STATUS.UNAUTHENTICATED || !staff) {
    return <><div role="alert">{authError}</div><SignInScreen /></>;
  }

  return (
    <div className="app-container">
      {/* Shared-device lock screen overlay if locked */}
      {sessionStatus === SESSION_STATUS.LOCKED && <LockScreen />}

      {/* Top Application Header */}
      <Header
        staff={staff}
        onLock={lockSession}
        onSignOut={() => { if (confirmDiscardUnsynced(pendingCount)) signOut(); }}
        onOpenProfile={() => setProfileOpen(true)}
        hasDraft={hasDraft}
        isOnline={isOnline}
      />

      {/* Responsive Shell: Navigation + Main Content */}
      <div className="app-shell">
        <aside className="app-sidebar">
          <Navigation
            currentView={currentView}
            onNavigate={setCurrentView}
            isClinical={isClinical}
            pendingSyncCount={pendingCount}
            competitionMode={competitionMode}
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
