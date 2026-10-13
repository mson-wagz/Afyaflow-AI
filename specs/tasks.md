# Backend ownership and implementation plan

Status: work assigned for planning; implementation starts after requirements and contract review. Neither backend track is implemented yet.

## Contributors and branches

- **mson-wagz — backend developer 1:** `codex/backend-mson-wagz`, covering application APIs, persistence and clinical approvals.
- **Mejja — backend developer 2:** `codex/backend-mejja`, covering agent execution, protocol scoring and MCP integration.
- **Frontend contributor:** React pages, frontend features and PWA behaviour. Their GitHub username has not been provided.

Mejja is a contributor label supplied by the team, not a verified GitHub username. This document assigns work within the repository; it does not create GitHub issue assignees or change repository permissions.

The split balances two substantial workstreams rather than counting files. Application transactions and offline synchronisation sit with mson-wagz; model execution, protocol logic and agent recovery sit with Mejja. Reassess remaining effort at each shared milestone and pair on whichever integration task is blocking progress.

## Shared specification milestone

Before either contributor writes application code:

1. All three review `specs/requirements.md`, including scope, roles, acceptance criteria and clinical approval boundaries. This document still needs to be written.
2. mson-wagz drafts `specs/data-model.md`; Mejja reviews evidence versions, recommendation state and trace references.
3. mson-wagz drafts HTTP request/response contracts; Mejja drafts MCP and agent-job contracts. Combine them in `specs/contracts.md` and review with the frontend contributor.
4. Mejja leads selection of the protocol, supported population and model/hardware. The team verifies source permissions and reviews the protocol with a clinical adviser before defining clinical thresholds.
5. Agree shared schemas in `src/shared/contracts/`, synthetic fixtures and error semantics before parallel implementation.

The detailed requirement, data-model and contract documents are pending. Task IDs below identify assignments, not completed specifications.

## mson-wagz tasks

### APP-01 — Database and synthetic fixtures

Own `src/backend/database/` and patient persistence in `src/backend/modules/patients/`.

Deliver reviewed schema, migrations and synthetic seed data for visits, observations, pending recommendations, decisions and audit references. Preserve timestamped observation history and version each assessment input. Verify fixtures load reproducibly and versions advance correctly.

### APP-02 — Staff access and permissions

Own `src/backend/auth/`.

Implement authenticated staff identity, session locking support and role checks. Separate administrative permissions from clinical approval permissions. Verify anonymous and unauthorised approval attempts fail without state changes.

### APP-03 — Patient and observation APIs

Own `src/app/api/patients/`, `src/app/api/observations/` and associated backend operations.

Implement contract-defined validation, units, staff attribution and retry-safe writes. Verify duplicate submissions create one logical observation and missing or invalid fields produce documented errors. Coordinate offline draft sync with the frontend contributor.

### APP-04 — Recommendation and approval APIs

Own `src/app/api/recommendations/`, `src/backend/modules/triage/` and `src/backend/modules/approvals/`.

Expose recommendation status and a controlled agent-to-application interface for persisting proposals. Enforce clinician identity, current observation version and decision reason. Commit decision history and approved queue updates atomically. Verify stale proposals and duplicate decisions cannot change the queue incorrectly.

### APP-05 — Approved queue and waiting times

Own `src/backend/modules/queue/` and its API entry points when specified.

Expose approved queue state, arrival-based waiting times and assessment status. Pending recommendations remain separate from approved ordering. Verify patients stay visible when agent execution fails. Review response shapes with the frontend contributor.

### APP-06 — Application integration and setup

Own database/application startup instructions and application-side integration checks in `tests/`.

Verify the registration → observations → pending proposal → clinician decision → queue journey against agreed contracts. Exercise transaction rollback, access denial and retry safety. Pair with Mejja on reproducible full-system startup; pair with the frontend contributor on server acknowledgement and stale-data display.

## Mejja tasks

### AGENT-01 — Protocol specification and scorer

Own deterministic protocol-scoring logic under `services/mcp/` once its internal structure is specified.

Implement only reviewed, source-versioned rules for the agreed population. Include observation IDs and exact rule references in results. Reject insufficient evidence rather than inventing values. Verify boundary cases using reviewed synthetic fixtures.

### AGENT-02 — Custom MCP server

Own `services/mcp/`.

Implement distinct tools for observation retrieval, deterministic scoring and pending-proposal persistence using the controlled application interface from APP-04. Validate schemas, authorise calls and log inputs, outputs and timestamps. Agent credentials cannot approve proposals or mutate approved queue state.

### AGENT-03 — Borrowed MCP integration

Own the borrowed-server adapter and configuration in `services/agents/`.

Integrate protocol retrieval through the filesystem reference server with approved resources mounted read-only and only necessary read tools exposed. Pin the selected version and document its purpose. Verify writes and access outside approved resources fail.

### AGENT-04 — Local model and orchestration

Own model configuration and the LangGraph workflow in `services/agents/`.

Implement an open-weights model run that selects tools, validates evidence, saves a pending proposal and pauses for human review. Keep long-running work outside short request lifetimes. Record model version, hardware and actual tool traces. Verify a complete real model run rather than only a mocked response.

### AGENT-05 — Recovery and trace integration

Own agent retries, failure states and trace correlation.

Handle missing evidence, invalid model outputs, tool outages and expired work with bounded recovery. Surface a staff-review state without a fabricated priority. Link runs and tool calls to the persisted recommendation and decision history designed with mson-wagz.

### AGENT-06 — Evaluations and demo evidence

Own agent evaluation fixtures, repeated runs and result recording in `EVALS.md`.

Run the planned evaluations after implementation and record actual pass/fail outcomes, latency, variation and an observed unresolved failure. Pair with mson-wagz for approval and rollback checks. Prepare real on-screen agent/tool evidence for the frontend contributor's demo recording.

## Integration milestones and dependencies

- **M0 — Contract agreement:** reviewed requirements, data model, HTTP/MCP schemas and synthetic fixtures. Both tracks and frontend work depend on this.
- **M1 — Independent foundations:** APP-01/02 and AGENT-01/03. Use agreed fixtures while runtime integration is pending.
- **M2 — Proposal flow:** APP-03/04 plus AGENT-02/04; the frontend can display a sourced pending proposal. Neither track changes approved ordering before a clinician decision.
- **M3 — Complete clinical review workflow:** APP-05/06 plus AGENT-05; demonstrate authorised approval, stale-proposal rejection and visible failure recovery.
- **M4 — Evidence and packaging:** AGENT-06 plus shared documentation, setup verification and demo recording. Both backend contributors review the actual evaluation results.

Deterioration monitoring and department routing follow the first verified slice. Assign their tasks after estimating the remaining workload; they must retain the same approval and evidence boundaries.

## Branch workflow

Both contributor branches start from the same main commit containing this plan. Each developer checks out their branch after cloning or fetching the repository:

```sh
git fetch origin
git switch --track origin/codex/backend-mson-wagz
```

Mejja uses `origin/codex/backend-mejja` instead. If the branch already exists locally, use `git switch` with its local name.

Commit small reviewed slices and open pull requests into `main`. Include task IDs, relevant acceptance criteria and verification evidence in the PR description. Keep generated files and secrets out of commits. Incorporate latest `main` into the contributor branch after each integration merge; do not force-push shared branches or overwrite the other contributor's work.

Shared contracts require review by the other backend contributor and the frontend contributor before incompatible changes. Each contributor owns their directories but can pair on changes across boundaries. A task is complete when its agreed checks pass and its PR is merged, not when a folder contains code.
