# Frontend queue management specification

Owner: JecintaK. Branch: `feature/frontend-queue-management`. Priority: P0. Status: draft for review; not implemented.

Backend collaborator: mson-wagz.

## User outcome

Mobile and desktop approved queue views.

## Assigned tasks

- [ ] JecintaK — FE-QUEUE-MANAGEMENT-01: Build patient lists, department views and elapsed waiting times.
- [ ] JecintaK — FE-QUEUE-MANAGEMENT-02: Distinguish approved state, pending proposals and last refresh time.
- [ ] JecintaK — FE-QUEUE-MANAGEMENT-03: Handle polling failures with a visibly stale last-confirmed snapshot.

## Acceptance checks

- QUEUE-01 through QUEUE-05 remain the shared product requirements.
- Pending proposals never appear as approved reorderings.
- Visits without agent results remain visible; stale information has text and a timestamp.

## Dependencies and code location

Agree request/response and error schemas, synthetic fixtures, role permissions and freshness/retry behaviour with the backend collaborator before implementation. Clinical views reuse the reviewed approval contract. P1 features depend on the verified P0 journey; offline work also requires a reviewed retention/conflict policy and target-browser list.

Primary UI location: `src/frontend/features/queue/`. Use src/app for page entry points and public for non-sensitive assets. Import browser-safe schemas from src/shared/contracts; never import backend/database/model credentials into browser code.

Completion requires reviewed contracts, implemented behaviour and recorded passing checks in the feature PR. No test results have been recorded yet.
