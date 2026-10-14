# Queue management feature

Owner: JecintaK (frontend developer).

Follows `specs/frontend/queue-management/spec.md` and `src/shared/contracts/queue.js`.

## Implementation Details

- **Approved Ordering & Visibility (`QueueView.jsx`):**
  - Visits are ordered strictly by approved priority (Red > Orange > Yellow > Green) with arrival-time tie breaking.
  - Pending AI proposals are labeled as pending clinician review and never alter approved queue position.
  - Registered visits awaiting agent scoring remain fully visible in the queue.
- **Workload Snapshot & Advisory Staffing:**
  - Displays patient counts, emergency cases, nurse-to-patient ratio, and non-automatic staffing recommendations.
- **Connectivity & Stale Data Snapshots (`useQueue.js`):**
  - Catches polling or network outages and visibly renders a stale snapshot banner with timestamped status.

## Status

Implemented and verified with automated test suite.
