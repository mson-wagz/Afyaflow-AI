# Implemented development API contract

The API runs under `/api` on the same origin as the frontend. All patient, queue,
agent, routing and audit endpoints require a valid server session. Login issues an
HttpOnly, SameSite=Strict cookie; sessions expire after eight hours. The database's
staff role is authoritative. A supplied `staffId`, role or browser persona cannot
grant clinical authority. Locked sessions cannot access patient endpoints.

## Authentication

- `POST /auth/login`: `{ identifier, pin }`; seeded identifiers and PINs are synthetic.
- `GET /auth/me`: current staff and lock status.
- `POST /auth/lock`, `/auth/unlock` (`{ pin }`), `/auth/logout`.

## Patient and observation workflow

- `GET /visits`: saved visits with current observation and assessment versions.
- `POST /visits`: patient name, age, gender, presenting complaint and optional vital
  fields. `Idempotency-Key` is required. A visit, its first observation version,
  queued assessment and audit event are committed in one transaction. Numeric fields
  have unit-specific bounds; missing values remain missing. Clerks can register
  intake; only clinical roles may attribute measured observations.
- `POST /visits/:id/observations`: `{ expectedVersion, vitals }` with a retry key.
  It appends an immutable observation snapshot, invalidates pending proposals and
  queues a new assessment without silently changing approved priority.
- `GET /queue`: approved priority ordering, arrival timestamps, pending proposals,
  assessment state and workload. Model failure does not hide waiting patients.

## Agent and human decisions

- `POST /visits/:id/assessment`: queues or retries assessment of the current version.
- `GET /agents/runs`, `GET /agents/runs/:id`: persistent run status and actual traces.
- `GET /triage/proposals`, `GET /triage/decisions`.
- `POST /triage/decisions`: `{ patientId, proposalId, observationVersion, decision,
  reason, overridePriority? }` plus retry key. Decision is APPROVED, REJECTED or
  OVERRIDDEN; overridePriority is RED, ORANGE, YELLOW or GREEN. Reasons require at
  least five characters. Only a clinical session can commit. The transaction locks
  the visit and proposal, checks freshness, writes decision/audit history, marks the
  proposal decided and changes approved priority together. Rejection preserves the
  previous approved priority and records reassessment required.

Jobs are QUEUED → RUNNING → WAITING_FOR_REVIEW or REVIEW_REQUIRED → DECIDED. Tool or
model failure gives FAILED and visible staff review. New observation versions can
supersede earlier jobs. Worker leases and SKIP LOCKED permit multiple workers to
claim distinct jobs; inference/tool steps have deadlines and finite budgets.

The model sees only four run-scoped MCP tools: get_observations, read_protocol,
score_protocol and save_pending_proposal. It cannot choose another patient's ID,
inject vital measurements, supply a priority, approve or transfer a patient.
The protocol reader calls only read_text_file on a fixed resource through the
official filesystem MCP server. General filesystem tools are not exposed to the model.

## Routing and reassessment

- `GET /departments`, `GET /routing/candidates`.
- `POST /routing/transfers`: `{ patientId, departmentId, assessmentVersion,
  departmentVersion, rationale }` plus retry key. Clinical role, current approved
  assessment, current department version and available capacity are required.
  Transfers preserve priority and write their audit event atomically.
- `GET /deterioration`: comparisons of the latest two actual observation snapshots.
- `POST /deterioration/decisions`: `{ patientId, observationVersion, action, reason,
  targetPriority? }` plus retry key. A clinician may ESCALATE (manual priority) or
  DISMISS an alert. This is a manual clinical decision, not model approval.
- `GET /audit`: own staff events, or wider history for clinician/admin roles.

Errors carry a status plus `code`/`message` where applicable. Invalid input is 400,
missing/expired session is 401, non-clinical or locked access is 403 and stale
versions/idempotency conflicts are 409. An idempotency key reused for changed input
fails rather than creating a second write. PostgreSQL advisory locks serialize
concurrent retries. Domain actions and audit events commit in the same transaction.

## Scope

This is synthetic development functionality. The scorer is a named unvalidated
fixture, not a verified SATS implementation. Bedrock model IDs and region are
configuration; the tested hosted model is Nova Lite, not an open-weights competition
run. Production clinical validation, real staff provisioning, protocol licensing,
retention/residency review and deployment hardening remain separate work.
