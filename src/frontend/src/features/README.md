# Frontend features

Owner: JecintaK (frontend developer).

Keep each feature's components, hooks and API adapters together. Reuse general UI from src/frontend/src/components. Use contract-aligned synthetic mocks while the NestJS backend work is pending.

- **Staff Access (`staff-access/`):** RBAC, shared terminal session locking, draft retention, and server permission denial.
- **Patient Registration (`registration/`):** Demographics and timestamped vitals capture, schema validation, missing-field alerts without guessing, and idempotency protection.
- **Queue Management (`queue/`):** Approved priority queue ordering, arrival tie-breaking, separate pending proposals, workload snapshots, and stale-data indicators.
- **Triage & Prioritisation (`triage/`):** SATS v2026.1 protocol citations, physiological discriminators, human-in-the-loop decisions (approve/reject/override), and inspectable MCP tool traces.
- **Deterioration Monitoring (`deterioration/`):** Side-by-side Before/After observation delta analysis, observation age calculation (> 60m stale flag), and reassessment escalation.
- **Department Routing (`routing/`):** Real-time service capacity snapshots, urgency preservation policy (ROUTE-04), and clinician transfer execution.
- **Offline PWA (`src/frontend/src/offline/`):** Outbox queue management, sync state lifecycles (`DRAFT`, `PENDING_SYNC`, `CONFIRMED`, `FAILED_SYNC`), and reconnect retry.

## Status

Fully implemented and verified with comprehensive automated test suite.
