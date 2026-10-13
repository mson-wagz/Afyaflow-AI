# Department routing specification

Status: draft for review. Priority: P1. Backend owner: mson-wagz. UI owner: JecintaK. Agent collaborator: Mejja. Branch: `feature/department-routing`.

## User outcome and scope

As a nurse, I can review a proposed department using an approved clinical assessment and current facility service information. Routing assists the nurse's decision and never delays immediate clinical escalation while waiting for a model or a department capacity response.

## Requirements and acceptance criteria

- **ROUTE-01 — Evidence and availability:** a routing proposal cites the approved assessment and the department/service snapshot used, including their versions and timestamps.
- **ROUTE-02 — Clinician decision:** a pending route leaves the visit's department and approved queues unchanged. An authorised approval commits the department change and audit event atomically.
- **ROUTE-03 — Invalidated proposal:** changed assessment or relevant department availability prevents approval of the stale proposal and requires another review.
- **ROUTE-04 — No suitable service:** missing or unavailable services surface an explicit staff-review state. Capacity alone must not downgrade a clinically approved urgency.
- **ROUTE-05 — Retry safety:** retries of the same routing decision create one logical transfer with no duplicate visit or queue entry.

## Proposed plan and tasks

- [ ] Complete the P0 assessment and approved queue journey before implementation.
- [ ] Define facility department configuration, service availability and routing contracts with the team.
- [ ] Add department snapshot queries and a versioned routing-proposal persistence interface to backend modules.
- [ ] Pair with Mejja on an agent/MCP operation that proposes a route using approved assessment and facility evidence.
- [ ] Extend approval transactions to commit a route safely, preserving approved urgency and queue history.
- [ ] Add routing evidence and clinical decision UI; verify ROUTE-01 through ROUTE-05 and record actual results.

## Review questions and completion gate

Agree which departments are represented, capacity freshness, allowable transfers and the manual escalation path. Facility configuration is synthetic until reviewed with staff. Completion requires verified stale-proposal, atomic-transfer and approval behaviour; no evaluations have run yet.
