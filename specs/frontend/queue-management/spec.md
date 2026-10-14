# Frontend queue management specification

Owner: JecintaK. Branch: `feature/frontend-queue-management`. Priority: P0. Status: implemented and verified.

Backend collaborator: mson-wagz.

## User outcome

Mobile and desktop approved queue views.

## Assigned tasks

- [x] JecintaK — FE-QUEUE-MANAGEMENT-01: Build patient lists, department views and elapsed waiting times.
- [x] JecintaK — FE-QUEUE-MANAGEMENT-02: Distinguish approved state, pending proposals and last refresh time.
- [x] JecintaK — FE-QUEUE-MANAGEMENT-03: Handle polling failures with a visibly stale last-confirmed snapshot.

## Acceptance checks

- QUEUE-01 through QUEUE-05 remain the shared product requirements.
- Pending proposals never appear as approved reorderings.
- Visits without agent results remain visible; stale information has text and a timestamp.

## Dependencies and code location

Queue contracts, sorting algorithms and workload calculations in `src/shared/contracts/queue.js`.
Primary UI location: `src/frontend/src/features/queue/`.

Primary UI location: `src/frontend/src/features/queue/`. Use src/frontend/src/pages for React page components and src/frontend/public for non-sensitive assets. Client routing will be selected during contract review. Import browser-safe schemas from src/shared/contracts; never import backend/database/model credentials into browser code.

Automated test verification:
- `FE-QUEUE-MANAGEMENT-01`: Displays waiting patient list with calculated elapsed wait times and department filtering.
- `FE-QUEUE-MANAGEMENT-02`: Strictly orders queue by approved priority; pending AI proposals are visually distinguished and cannot leap approved patients.
- `FE-QUEUE-MANAGEMENT-03`: Polling failure preserves last confirmed snapshot and visibly presents timestamped stale alert banner.
