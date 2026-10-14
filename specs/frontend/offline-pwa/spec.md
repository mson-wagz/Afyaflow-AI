# Frontend offline pwa specification

Owner: JecintaK. Branch: `feature/frontend-offline-pwa`. Priority: P0 basic draft capture; advanced behaviour after the verified P0 slice. Status: implemented and verified.

Backend collaborator: mson-wagz.

## User outcome

Installable app shell and explicit offline draft synchronisation.

## Assigned tasks

- [x] JecintaK — FE-OFFLINE-PWA-01: Define manifest, icons and app-shell caching for agreed target browsers.
- [x] JecintaK — FE-OFFLINE-PWA-02: Implement local drafts, reconnect retry and visible sync state.
- [x] JecintaK — FE-OFFLINE-PWA-03: Handle conflicts, session changes and reviewed local retention.

## Acceptance checks

- Draft, pending, failed and confirmed sync states remain distinct.
- Clinical approvals and shared queue changes require online server acknowledgement.
- Do not service-worker-cache authenticated API responses; record real installation and reconnect checks.

## Dependencies and code location

Offline sync state and policy contracts in `src/shared/contracts/offline.js`.
Web app manifest in `public/manifest.json`.
Primary UI location: `src/frontend/src/offline/`.

## Verification results

Automated test verification:
- `FE-OFFLINE-PWA-01`: PWA manifest defined with standalone display mode, theme colors, and mobile shell configuration.
- `FE-OFFLINE-PWA-02`: Verified outbox transitions (`DRAFT` -> `PENDING_SYNC` -> `CONFIRMED`) and reconnect flush triggers.
- `FE-OFFLINE-PWA-03`: Verified clinical approvals are blocked from offline commit, enforcing online server acknowledgement.
