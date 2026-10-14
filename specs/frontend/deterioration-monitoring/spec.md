# Frontend deterioration monitoring specification

Owner: JecintaK. Branch: `feature/frontend-deterioration-monitoring`. Priority: P1. Status: draft for review; not implemented.

Backend collaborator: Mejja for proposals; mson-wagz for decisions.

## User outcome

Recorded changes and pending reassessment review.

## Assigned tasks

- [ ] JecintaK — FE-DETERIORATION-MONITORING-01: Build reassessment inbox and before/after observation evidence.
- [ ] JecintaK — FE-DETERIORATION-MONITORING-02: Reuse clinical review controls and handle invalidated or duplicate proposals.
- [ ] JecintaK — FE-DETERIORATION-MONITORING-03: Show last observation age, missing evidence and staff review paths.

## Acceptance checks

- WATCH-01 through WATCH-05 remain the shared product requirements.
- Pending flags never imply approved priority or queue changes.
- Without new observations, the UI shows the last recorded time and makes no claim of continuous monitoring.

## Dependencies and code location

Agree request/response and error schemas, synthetic fixtures, role permissions and freshness/retry behaviour with the backend collaborator before implementation. Clinical views reuse the reviewed approval contract. P1 features depend on the verified P0 journey; offline work also requires a reviewed retention/conflict policy and target-browser list.

Primary UI location: `src/frontend/src/features/deterioration/`. Use src/frontend/src/pages for React page components and src/frontend/public for non-sensitive assets. Client routing will be selected during contract review. Import browser-safe schemas from src/shared/contracts; never import backend/database/model credentials into browser code.

Completion requires reviewed contracts, implemented behaviour and recorded passing checks in the feature PR. No test results have been recorded yet.
