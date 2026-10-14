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

## Status

Implemented and verified with automated test suite.
