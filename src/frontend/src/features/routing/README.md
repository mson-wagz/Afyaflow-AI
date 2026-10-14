# Department routing UI

Owner: JecintaK. Branch: `feature/frontend-department-routing`.

Follows `specs/frontend/department-routing/spec.md` and `src/shared/contracts/routing.js`.

## Implementation Details

- **Service Snapshot & Evidence (`RoutingView.jsx`):**
  - Displays real-time capacity, occupancy, and status for facility departments (Emergency, Acute Med, Paediatrics, Surgical, General Outpatient).
  - Routing proposals cite approved triage priority and presenting complaint.
- **Urgency Preservation Policy (ROUTE-04):**
  - Department capacity never implies a downgrade in clinical urgency.
  - Manual escalation paths surfaced when departments are congested.
- **Clinician Transfer Gate:**
  - Requires clinical authorisation to execute patient transfers, updating queues atomically.

## Status

Implemented and verified with automated test suite.
