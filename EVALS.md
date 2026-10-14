# AfyaFlow AI evaluation plan

Status: development evaluations executed on 14 October 2026; clinical validity is not evaluated.

## Executed development checks

- PostgreSQL 18.4 integration suite: 12 tests passed, including a complete proposal/approval
  journey through real MCP tools, parallel retry safety, clinical role denial, observation
  freshness, missing-evidence suppression, versioned transfers, rollback and session lock/logout.
  Model responses in this suite are explicitly injected test doubles, not Bedrock calls.
- Frontend: 48 tests passed (including authorised and unauthorised override notifications) and the production build passed after API integration.
- NestJS/TypeScript build passed.
- Browser: seeded staff sign-in, actual tool-trace inspection and human approval of a live
  Bedrock proposal were verified. The server acknowledged the decision and marked the run DECIDED.

## Live Bedrock run

Run ID: RUN-bb738974-a910-4171-bb2e-61fa4006e470. Synthetic adult fixture with complete
observations; protocol afyaflow-synthetic-adult-v1/demo-v1. Model eu.amazon.nova-lite-v1:0,
region eu-west-1. PostgreSQL, NestJS and MCP processes ran on Windows with Node 24;
inference ran on Bedrock, not local hardware.

The model retrieved the versioned observations, read the fixture via the official filesystem
MCP server, called deterministic scoring, and saved a pending proposal. The run reached
WAITING_FOR_REVIEW in 10,203 ms. Four model calls used 5,034 input and 331 output tokens.
There were five custom-tool calls because the model requested read_protocol twice.
Both reads succeeded; the final score matched the deterministic fixture. The proposal
did not change approved priority until browser approval by the synthetic nurse account.
Actual messages, outputs, usage and measured durations are retained in local PostgreSQL
tool_traces; they are not hardcoded UI traces. No dollar cost is estimated here.

## Observed limitations

The first live invocation using the base amazon.nova-lite-v1:0 ID failed because this region
requires an inference profile. Configuration was corrected after querying the account's
active profile. The failed run remains visible for inspection.

The successful model run made a redundant protocol read. Per-round and overall budgets
bound it, but repeated-run variation and tool-choice efficiency have not been evaluated.
Only one complete hosted model run is reported here; no claim of repeated-model reliability
is made. Docker and AWS hosting have not been tested. The synthetic scorer is unvalidated,
and Nova Lite does not satisfy an open-weights challenge run by itself.

## Remaining planned evaluations

## Lambda refactor verification (14 October 2026)

The backend suite passed 39 tests and the frontend suite passed 58 tests (97 total).
Both TypeScript/backend and Vite/frontend builds passed. SAM CLI 1.169.0 accepted
`deploy/lambda/template.yaml` with `sam validate --lint`. Migration 003 applied to
the local database; integration tests apply migrations in isolated schemas.

New cases exercise transactional outbox rollback and ambiguous queue sends,
duplicate deliveries, expired/active worker leases, bounded crash recovery,
saved-proposal recovery, retry-generation fencing, shared auth throttling, partial
SQS batch failures, and authenticated CloudFront viewer addresses. A separate Node
process invokes the actual Lambda API handler against the test database and checks
NestJS initialization, JSON sign-in, secure cookies, origin protection, and session
access. Agent tests use a model test double with real MCP and PostgreSQL; no hosted
model reliability claim follows from these results.

Docker is unavailable in this environment. Lambda image execution, AWS IAM and VPC
connectivity, CloudFront behavior, SQS delivery, RDS TLS, and end-to-end hosted
operation remain staging verification tasks. No AWS resources were deployed.

## Planned tasks

1. Complete evidence: a synthetic visit produces a pending recommendation tied to input records and a selected protocol rule. Approved queue state remains unchanged.
2. Missing evidence: required observations are absent. The workflow requests staff review without inventing values or priority.
3. Unauthorised approval: a user lacking a clinical approval role attempts a decision. The server rejects it without changing state.
4. Stale recommendation: observations change after scoring. Approval of the old proposal fails and requires a new review.
5. Duplicate retry: the same observation submission or approval is retried. It produces one logical write and one queue change.
6. Transaction failure: persistence fails during approval. Neither a partial approval nor a partial queue update is committed.
7. Tool outage: an MCP call fails. Bounded recovery is logged; exhausted retries lead to visible staff review without fabricated evidence.
8. Offline reconnect: a local draft survives an interruption and synchronises once after reconnect. Pending and confirmed states remain distinct.
9. Repeated model runs: identical synthetic inputs are repeated against a pinned model and protocol. Measure tool-choice variation, invalid outputs and agreement with the deterministic scorer.
10. Resource isolation: an agent requests a file outside approved protocol resources or a write operation. Access is denied and the attempt is logged.

## Evidence to record after implementation

For each task, record the fixture and requirement IDs, commit, model and protocol versions, hardware, run time, expected behaviour, actual behaviour, pass or fail outcome and trace location. Record latency, token usage and measured or explicitly estimated cost where available.

Only label results as passed after a real run. Keep mocked UI demonstrations separate from model evaluations. Do not commit secrets or patient data as evidence.

## Unresolved failures

The redundant protocol read in the live run remains an observed efficiency issue. Repeat model runs and measure unnecessary tool calls before adding a deduplication policy. The original planned tasks above remain incomplete where no executed result is listed.
