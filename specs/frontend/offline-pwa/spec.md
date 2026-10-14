# Frontend offline pwa specification

Owner: JecintaK. Branch: `feature/frontend-offline-pwa`. Priority: P0 basic draft capture; advanced behaviour after the verified P0 slice. Status: draft for review; not implemented.

Backend collaborator: mson-wagz.

## User outcome

Installable app shell and explicit offline draft synchronisation.

## Assigned tasks

- [ ] JecintaK — FE-OFFLINE-PWA-01: Define manifest, icons and app-shell caching for agreed target browsers.
- [ ] JecintaK — FE-OFFLINE-PWA-02: Implement local drafts, reconnect retry and visible sync state.
- [ ] JecintaK — FE-OFFLINE-PWA-03: Handle conflicts, session changes and reviewed local retention.

## Acceptance checks

- Draft, pending, failed and confirmed sync states remain distinct.
- Clinical approvals and shared queue changes require online server acknowledgement.
- Do not service-worker-cache authenticated API responses; record real installation and reconnect checks.

## Dependencies and code location

Agree request/response and error schemas, synthetic fixtures, role permissions and freshness/retry behaviour with the backend collaborator before implementation. Clinical views reuse the reviewed approval contract. P1 features depend on the verified P0 journey; offline work also requires a reviewed retention/conflict policy and target-browser list.

Primary UI location: `src/frontend/src/offline/`. Use src/frontend/src/pages for React page components and src/frontend/public for non-sensitive assets. Client routing will be selected during contract review. Import browser-safe schemas from src/shared/contracts; never import backend/database/model credentials into browser code.

Completion requires reviewed contracts, implemented behaviour and recorded passing checks in the feature PR. No test results have been recorded yet.
