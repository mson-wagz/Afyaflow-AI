# Queue management specification

Status: draft for review. Priority: P0. Backend owner: mson-wagz. UI owner: JecintaK. Branch: `feature/backend-queue-management`.

## User outcome and scope

As a nurse or operations staff member, I can see who is waiting, how long each visit has waited and which priorities have been approved, so I can coordinate assessment. This slice covers approved queue views and pending workload proposals. Registration, authentication and clinical approval are shared foundations.

Staffing recommendations do not move staff or patients automatically. Department routing and deterioration detection belong to their own specifications.

## Requirements and acceptance criteria

- **QUEUE-01 — Visible visits:** given a registered waiting visit, the queue displays it with arrival time, assessment status and elapsed waiting time. Visits without an AI result remain visible.
- **QUEUE-02 — Approved ordering:** given a pending priority proposal, approved ordering stays unchanged. After an authorised decision commits, the queue reflects the resulting approved state. Ordering and ties must follow the reviewed contract.
- **QUEUE-03 — Pending proposals:** given a workload recommendation, display its supporting counts and staffing snapshot separately from committed operations. No capacity adjustment is applied automatically.
- **QUEUE-04 — Connectivity:** when a refresh fails, keep the last confirmed snapshot visibly stale with its last-updated time. Never describe a local draft as a shared queue update.
- **QUEUE-05 — Retry and transaction safety:** duplicate approval retries create one decision and queue change; a failed approval transaction leaves both unchanged.

## Proposed plan and tasks

- [ ] Complete shared patient, authentication and approval foundations: APP-01 through APP-04.
- [ ] Agree queue response schema, ordering, waiting-time semantics and workload snapshot fields in specs/contracts.md.
- [ ] Implement queue queries and approved changes in src/backend/src/modules/queue/ with corresponding API handlers: APP-05.
- [ ] Implement the queue UI in src/frontend/src/features/queue/ and src/frontend/src/pages/queue/.
- [ ] Verify QUEUE-01 through QUEUE-05 using synthetic fixtures and record evidence: APP-06.

## Review questions and completion gate

Agree supported departments, tie-breaking, staff capacity units and the data freshness policy before implementation. Clinical priority ordering must derive from the selected reviewed protocol. Completion requires a reviewed contract and actual passing acceptance checks; no results are recorded yet.
