# AfyaFlow AI

**A mobile-first hospital triage and patient flow assistant for Kenyan healthcare facilities.**

AfyaFlow AI helps staff review patient priority, manage waiting queues, identify changes in recorded observations and recommend appropriate departments. AI agents gather evidence and propose actions; a named nurse or clinician reviews consequential decisions before they affect patient flow.

The project is being prepared for the **African Agentic AI Design Challenge**, in the Health & Wellbeing track. The proposed primary theme is **symptom-based priority scoring**, supported by queue management. Deterioration monitoring and department routing are planned extensions of the same patient journey.

## Project status

**Specification phase — application implementation has not started.**

This repository currently contains this README. The team will define requirements, architecture, contracts and acceptance criteria before writing application code. Features, infrastructure and commands described as planned are not yet implemented or verified.

The competition prototype will use synthetic patient data. It is not a clinical deployment or a validated triage product.

## The problem

A triage desk needs to coordinate arriving patients, incomplete observations, changing symptoms and available staff. A queue ordered only by arrival time can obscure who needs a prompt assessment. AfyaFlow AI aims to give nurses an evidence-backed review workflow and hospital staff a shared view of approved priorities and waiting times.

The design will account for differences between Kenyan facilities in connectivity, available devices, staffing and budgets. Facility assumptions will be checked with healthcare staff rather than treated as universal.

## Product approach

One responsive **Progressive Web App (PWA)** will support both mobile and desktop access.

- **Phones:** patient registration, observation capture, recommendation review and reassessment.
- **Tablets and computers:** department queues, staffing and workload views, approvals and audit history.
- **Intermittent connectivity:** local draft capture, visible pending synchronisation and explicit stale-data indicators.
- **Shared devices:** individual staff accounts, role-based access and session locking.

Offline capture must not imply that other devices have received an update. Clinical approvals and shared queue changes require a successful server acknowledgement. The design must provide a manual escalation workflow when connectivity or the model is unavailable. PWA installation and background capabilities will be tested on the team's target browsers and devices.

## Planned MVP

### 1. Patient registration and observations

Capture a synthetic patient identifier, presenting complaint, arrival time and timestamped observations with units and staff attribution. Missing required information must be shown explicitly.

### 2. Evidence-backed patient prioritisation

Generate a proposed priority using a documented, pre-existing triage protocol. Each recommendation must reference the observations or symptom entries that support it, together with the protocol version and relevant rule.

A nurse or clinician can approve, reject or override a proposal. The server records the decision and reason. Unapproved recommendations cannot change the approved queue.

The protocol and supported patient population remain to be selected during specification. The South African Triage Scale is a candidate; its clinical suitability, source version and resource licence must be reviewed before implementation. The model must not invent thresholds or fill missing measurements with guesses.

### 3. Hospital queue management

Display waiting times, assessment status and approved priorities. Recommend changes based on workload and available staff without applying them automatically. Patients awaiting assessment remain visible even when a recommendation cannot be generated.

### Planned extensions

- **Deterioration monitoring:** compare newly recorded observations or reported symptom changes and propose a reassessment. Software does not measure vital signs by itself.
- **Department routing:** propose a department using clinical assessment and configured service availability, subject to clinical approval.

The first complete demonstration will cover registration, agent tool use, a sourced recommendation, nurse approval and an approved queue update. Extensions follow after that journey works reliably.

## Technology decisions

**Confirmed by the team:** React frontend and Next.js backend.

Proposed implementation:

- **Frontend:** React with TypeScript, responsive layouts and PWA support.
- **Backend:** Next.js Route Handlers for authenticated APIs and server-side approval checks.
- **Application structure:** one Next.js project hosting the React interface and backend API, with separate Node.js processes for agent execution and MCP tools where needed.
- **Agent orchestration:** LangGraph for JavaScript/TypeScript.
- **Model:** a locally served open-weights model, with Qwen as a candidate pending hardware and evaluation checks.
- **Custom MCP server:** TypeScript tools for retrieving observations, calculating a protocol-based proposal and saving a pending recommendation.
- **Borrowed MCP server:** the official filesystem reference server, provisionally used to retrieve locally stored protocol resources. Expose only necessary read tools and mount approved resources read-only; directory restrictions alone do not disable its write capabilities.
- **Database:** PostgreSQL for patient visits, observations, recommendations, approvals and audit events.
- **Updates:** polling initially; a persistent event transport can follow if justified by deployment constraints.

Hosting remains undecided. The competition design must keep patient health data in-country. Synthetic-only development does not establish that a future deployment meets clinical or data-protection requirements.

## Proposed agent workflow

1. Receive a request for a patient's assessment.
2. Retrieve the current observation version through the custom MCP server.
3. Retrieve the selected protocol resource through the borrowed MCP server.
4. Check whether the evidence is sufficient; request staff review when it is not.
5. Call the deterministic protocol-scoring tool and check its evidence references.
6. Save a pending recommendation and display the tool trace.
7. Pause for a named nurse or clinician's decision.
8. Validate that observations have not changed, then atomically record approval and update the approved queue.

The agent may choose tools, check outputs and recover from a bounded tool failure. Clinical scoring belongs in versioned, testable protocol logic. The model explains and coordinates the workflow; it cannot approve its own proposal.

## Team ownership

### Backend developer 1 — application and data

Own the Next.js APIs, database schema, authentication, role checks, approval transactions, queue state and synchronisation behaviour. Coordinate shared API types with the frontend developer.

### Backend developer 2 — agents and MCP

Own LangGraph orchestration, the custom MCP server, borrowed-server integration, local model connection, protocol implementation, tool traces and agent evaluations.

### Frontend developer — React PWA

Own mobile and desktop layouts, registration and observations, queue views, evidence and approval screens, PWA installation, local drafts and connectivity indicators. Use contract-aligned mocks while APIs are being implemented.

All three developers review the shared contracts and demonstrate the complete workflow. Each developer should be able to explain their code during the challenge's live technical review.

## Spec-driven development

**Workflow: specify → review → plan → implement → verify.**

The next deliverables are planned repository documents:

- `specs/requirements.md`: users, scope, requirement IDs and acceptance criteria.
- `ARCHITECTURE.md`: concise architecture, trust boundaries and built-versus-borrowed MCP decisions.
- `specs/data-model.md`: entities, timestamps, observation versions and decision history.
- `specs/contracts.md`: API routes, request and response shapes, MCP schemas and errors.
- `specs/tasks.md`: dependency-ordered work assigned to the three developers.
- `EVALS.md`: repeatable test tasks, recorded results and unresolved failures.

These files do not exist yet. The team will review the specifications before application implementation begins.

For each feature:

1. Write a user story, requirement ID and observable acceptance criteria.
2. Agree the data and API/MCP contract before frontend and backend work diverge.
3. Assign an owner and identify dependencies.
4. Implement a small end-to-end slice using synthetic fixtures.
5. Verify behaviour against the acceptance criteria and attach evidence to the pull request.
6. Update the specification when a product decision changes; do not silently change the contract in code.

An AI coding request should identify the relevant requirements, contracts and bounded task. Generated code receives the same review and verification as manually written code.

## Acceptance gates for the first slice

- An unauthorised user cannot approve a recommendation.
- A recommendation cites actual input records and an identified protocol rule.
- A pending recommendation leaves the approved queue unchanged.
- Changed observations invalidate an earlier proposal before approval.
- Retrying a submission or approval does not create duplicate records or queue changes.
- A failed approval transaction leaves no partial queue update.
- Offline drafts and stale queue data are visibly distinguished from confirmed server state.
- Tool failure produces a visible staff-review path, not a fabricated priority.
- The audit trail connects agent inputs, outputs, timestamps and the clinician's decision.

These are planned checks, not claims of passing tests.

## Competition preparation

According to the healthcare brief, the submission needs custom MCP tools, a borrowed MCP server, open-source orchestration, an open-weights task run, logged actions and human approval. Deliverables include a public repository with an OSI-approved licence, runnable setup, a short public demo, a project description, `ARCHITECTURE.md` and `EVALS.md` with at least eight tasks and honest results.

The main portal states **15 October 2026** as the final deadline. Its FAQ restricts evaluated implementation to the official build window, while the healthcare rules leave the exact submission-period timestamps unresolved. Confirm the window and cutoff with the organisers before scheduling implementation. The poster says teams of up to six; the healthcare brief says up to three. This project's three-person team fits both published limits.

No application or external submission has been made from this repository.

## Development setup

There is no runnable application or setup command yet. After implementation, this section will document prerequisites, pinned versions, environment variables, synthetic seed data and a tested one-command startup. It will distinguish real model runs from mocked UI demonstrations and include the hardware used.

## Sources

- [Challenge portal and FAQ](https://agentic-africa-challenge.lovable.app/)
- [Healthcare track brief](https://agentic-africa-challenge.lovable.app/tracks/healthcare)
- [EMSSA South African Triage Scale resources](https://emssa.org.za/special-interest-groups/the-south-african-triage-scale-sats/)
- [LangGraph JavaScript documentation](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [Official filesystem MCP reference server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- [Kenya ODPC guidance on processing health data](https://www.odpc.go.ke/wp-content/uploads/2024/02/ODPC-Guidance-Note-on-Processing-of-Health-Data.pdf)
