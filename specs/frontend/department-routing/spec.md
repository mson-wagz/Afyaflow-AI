# Frontend department routing specification

Owner: JecintaK. Branch: `feature/frontend-department-routing`. Priority: P1. Status: draft for review; not implemented.

Backend collaborator: mson-wagz, with Mejja for agent evidence.

## User outcome

Department proposals and clinician routing decisions.

## Assigned tasks

- [ ] JecintaK — FE-DEPARTMENT-ROUTING-01: Show department evidence and service snapshot freshness.
- [ ] JecintaK — FE-DEPARTMENT-ROUTING-02: Build approval/rejection flow and handle stale assessments or availability.
- [ ] JecintaK — FE-DEPARTMENT-ROUTING-03: Show unavailable services and manual escalation paths.

## Acceptance checks

- ROUTE-01 through ROUTE-05 remain the shared product requirements.
- Department and queue display changes require server-confirmed approval.
- Service capacity never implies a downgrade in clinical urgency.

## Dependencies and code location

Agree request/response and error schemas, synthetic fixtures, role permissions and freshness/retry behaviour with the backend collaborator before implementation. Clinical views reuse the reviewed approval contract. P1 features depend on the verified P0 journey; offline work also requires a reviewed retention/conflict policy and target-browser list.

Primary UI location: `src/frontend/features/routing/`. Use src/app for page entry points and public for non-sensitive assets. Import browser-safe schemas from src/shared/contracts; never import backend/database/model credentials into browser code.

Completion requires reviewed contracts, implemented behaviour and recorded passing checks in the feature PR. No test results have been recorded yet.
