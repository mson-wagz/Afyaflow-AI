# Offline capture and synchronisation

Owner: JecintaK (frontend developer), with backend developer 1.

Follows `specs/frontend/offline-pwa/spec.md` and `src/shared/contracts/offline.js`.

## Implementation Details

- **PWA Manifest (`manifest.json`):**
  - Defines app shell metadata, theme colors, and standalone mobile configuration.
- **Outbox Sync Lifecycle (`SyncContext.jsx`, `useOfflineSync.js`):**
  - Explicit and distinct sync states: `DRAFT`, `PENDING_SYNC`, `CONFIRMED`, `FAILED_SYNC`.
  - Reconnect retry automatically flushes the outbox once network connectivity is re-established.
  - Interactive offline simulation mode allows immediate testing of intermittent connectivity.
- **Safety Policy:**
  - Clinical triage decisions and shared queue ordering require immediate online server acknowledgement.
  - Drafts captured offline remain in local draft state and are never presented as confirmed queue updates.
- **Retention on shared devices (`browserData.js`):**
  - Queued items record the `staffId` that created them; only that staff member sees and syncs them.
  - Sign-out and lock-screen user switching call `clearPatientDataFor(staffId)`, removing that staff
    member's registration draft, saved draft and queued items, after `confirmDiscardUnsynced` asks
    about any unsynced registrations. Locking and session expiry keep them.
  - Any new browser storage of patient data must use these helpers so sign-out removes it.

## Status

Implemented and verified with automated test suite.
