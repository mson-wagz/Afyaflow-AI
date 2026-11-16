# Implemented development API contract

The API runs under `/api` on the same origin as the frontend. All patient, queue,
agent, routing and audit endpoints require a valid server session. Login issues an
HttpOnly, SameSite=Strict cookie; sessions expire after eight hours. The database's
staff role is authoritative. A supplied `staffId`, role or browser persona cannot
grant clinical authority. Locked sessions cannot access patient endpoints.

All API responses carry `Cache-Control: no-store`, and every response carries the
security headers described in deploy/ec2/README.md (HSTS in production, framing,
sniffing, referrer and permissions policies, and a Content-Security-Policy that is
report-only unless `CSP_MODE=enforce`).

Sessions are also locked server-side after `SESSION_IDLE_MINUTES` (default 15) with no
authenticated request, which covers closed tabs, crashed devices and bypassed client
timers. The next request returns 403 `SESSION_LOCKED` (the frontend shows its lock
screen), a `SESSION_IDLE_LOCK` audit event is written, and `POST /auth/unlock` with the
PIN resumes the session. Activity is recorded at most once a minute per session. The
eight-hour absolute expiry still applies.

## Authentication

- `POST /auth/login`: `{ identifier, pin, otp? }`. PINs are exactly six digits (400
  otherwise). Administrators must also send `otp`, the current 6-digit code from their
  enrolled authenticator app (RFC 6238 TOTP, 30-second steps, one step of drift). After
  a correct PIN: 403 `MFA_NOT_ENROLLED` if no authenticator is enrolled, 401
  `MFA_REQUIRED` if `otp` is missing, 401 `INVALID_MFA_CODE` if it is wrong or was
  already used. Wrong codes count toward the per-account limit. A wrong PIN is always
  401 `INVALID_CREDENTIALS`, whatever the role.
- `GET /auth/me`: current staff and lock status.
- `POST /auth/lock`, `/auth/unlock` (`{ pin }`, PIN only), `/auth/logout`.

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
  Ordering is `queue-order-v3` (docs/QUEUE_ORDERING.md): approved SATS level; for Level 1
  higher TEWS (unscored first) then arrival minute; for Levels 2-4 arrival minute then TEWS.
  Patients equal on those are clinically tied and ordered by a current clinician choice, then
  registration sequence, then visit ID: a strict total order. Each entry has
  `queueOrder { rank, level, severity, version }`, `clinicalTie { size, position }` or null,
  `queuePrecedence { at, byName, reason }` or null, and `tieBreak`. Priority objects carry
  `level` (1-5) and `category`.
- `POST /queue/precedence`: `{ patientId, observationVersion, assessmentVersion, reason }`
  plus retry key. Clinical roles only (403). Orders a clinically tied patient first within its
  tie group; refuses a stale version (409 `VERSION_CONFLICT`), an unapproved patient
  (409 `NOT_APPROVED`) or one not tied (409 `NOT_TIED`). Append-only, audited
  `QUEUE_PRECEDENCE_SET`; lapses when observations or assessment change.

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
- `GET /audit/access?patientId=`: administrators only. The newest 200 read-access
  records, optionally for one patient: who viewed which records, through which route
  and when. Other roles receive 403; a malformed `patientId` is 400.

## Operations summary

- `GET /operations/summary?period=today|7d|30d` (default `today`): nurses, clinicians,
  doctors and administrators; clerks receive 403 and any other period is 400 `INVALID_PERIOD`.
  Periods are calendar days ending today in `FACILITY_TIMEZONE` (default `Africa/Nairobi`).
  Returns aggregates over workflow (synthetic) visits only, never research records:
  `live` (open visits by approved priority, awaiting assessment, proposals awaiting review
  and the oldest one's age, assessments that ended without a proposal, follow-up counts,
  department bed occupancy), `flow` (arrivals with hourly or daily buckets, and median /
  90th-percentile minutes from arrival to first proposal, arrival to first decision and
  proposal to decision, each with the number of visits measured), `decisions` (approved /
  overridden / rejected, acceptance rate) and `agentRuns` (count by status, median run time)
  plus `transfers` per department. The response contains no names, visit IDs or free
  text, so it is not a patient-record read and is not written to the access log.

## Staff accounts (administrators only)

Other roles receive 403. Every change takes `{ reason }` (5-500 characters, else 400),
writes an audit event naming the administrator, and refuses the administrator's own
account (400 `SELF_ACTION`).

- `GET /staff`: accounts with role, `active`, `mfaEnrolled` and open session count.
  Never includes PIN hashes or authenticator secrets; system accounts are omitted.
- `POST /staff/:id/deactivate`: blocks sign-in (403 `ACCOUNT_DEACTIVATED` after a
  correct PIN), ends all sessions and removes the person from follow-up owners. The
  last active administrator cannot be deactivated (409 `LAST_ADMIN`); repeating the
  current state is 409 `NO_CHANGE`. Audit: `STAFF_DEACTIVATED`.
- `POST /staff/:id/reactivate`: restores sign-in. Audit: `STAFF_REACTIVATED`.
- `POST /staff/:id/end-sessions`: signs the person out everywhere without changing
  their PIN (lost or shared device). Audit: `STAFF_SESSIONS_ENDED`.
- `POST /staff/:id/reset-pin`: returns `{ data: { pin } }` once: a random six-digit
  PIN that is not a repeated digit or straight run. Ends the person's sessions.
  Not idempotency-stored, so the PIN is never saved in plain text. Audit:
  `STAFF_PIN_RESET` (without the PIN).

Authenticator enrolment for administrators is operator-only (`staff-admin enroll-mfa`).

Read access is audited. Every route that returns patient records (visits, evidence,
queue, proposals, decisions, agent runs and traces, routing, deterioration,
follow-ups, research cases and export, and the audit views) appends an `access_log`
row with the staff member, route, route parameters and the patient IDs returned. The
same staff member viewing the same records through the same route is recorded once
per 5 minutes, so polling does not flood the log; any change is recorded at once.
If access cannot be recorded, the response is withheld with 503
`ACCESS_NOT_RECORDED`. `access_log` is append-only in the database.

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
