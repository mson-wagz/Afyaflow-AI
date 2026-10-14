# Frontend deterioration monitoring specification

Owner: JecintaK. Branch: `feature/frontend-deterioration-monitoring`. Priority: P1. Status: implemented and verified.

Backend collaborator: Mejja for proposals; mson-wagz for decisions.

## User outcome

Recorded changes and pending reassessment review.

## Assigned tasks

- [x] JecintaK — FE-DETERIORATION-MONITORING-01: Build reassessment inbox and before/after observation evidence.
- [x] JecintaK — FE-DETERIORATION-MONITORING-02: Reuse clinical review controls and handle invalidated or duplicate proposals.
- [x] JecintaK — FE-DETERIORATION-MONITORING-03: Show last observation age, missing evidence and staff review paths.

## Acceptance checks

- WATCH-01 through WATCH-05 remain the shared product requirements.
- Pending flags never imply approved priority or queue changes.
- Without new observations, the UI shows the last recorded time and makes no claim of continuous monitoring.

## Dependencies and code location

Deterioration observation contracts and delta comparison logic in `src/shared/contracts/deterioration.js`.
Primary UI location: `src/frontend/src/features/deterioration/`.

Primary UI location: `src/frontend/src/features/deterioration/`. Use src/frontend/src/pages for React page components and src/frontend/public for non-sensitive assets. Client routing will be selected during contract review. Import browser-safe schemas from src/shared/contracts; never import backend/database/model credentials into browser code.

Automated test verification:
- `FE-DETERIORATION-MONITORING-01`: Verified side-by-side Before/After vital sign comparison with physiological delta indicators.
- `FE-DETERIORATION-MONITORING-02`: Verified clinical escalation and dismissal controls requiring clinical rationale.
- `FE-DETERIORATION-MONITORING-03`: Verified observation age calculation, flagging stale records (> 60m) without claiming continuous telemetry coverage.
