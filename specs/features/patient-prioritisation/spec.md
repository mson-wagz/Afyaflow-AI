# Patient prioritisation specification

Status: draft for review. Priority: P0. Backend owner: Mejja. UI owner: JecintaK. Application/approval collaborator: mson-wagz. Branch: `feature/backend-patient-prioritisation`.

## User outcome and scope

As a triage nurse, I can review a protocol-based proposed priority with its recorded evidence and approve, reject or override it. The agent gathers evidence, calls tools, validates outputs and pauses for review. It does not diagnose, prescribe or approve its own result.

## Requirements and acceptance criteria

- **TRIAGE-01 — Sourced proposal:** sufficient synthetic inputs produce a pending proposal referencing actual observation or symptom records, input version, protocol version and relevant rule. Missing references invalidate the proposal.
- **TRIAGE-02 — Missing evidence:** absent required inputs produce a visible request for staff review without guessed measurements or an invented urgency.
- **TRIAGE-03 — Real agent/tool workflow:** a real open-weights model run retrieves observations and protocol material, calls deterministic scoring and saves a pending proposal. Every tool call has timestamped inputs and outputs.
- **TRIAGE-04 — Human gate:** agent credentials cannot approve a recommendation. Only an authorised clinician's server-acknowledged decision can affect approved priority; rejection and overrides include a recorded reason.
- **TRIAGE-05 — Freshness:** changed observations invalidate the older proposal for approval and require renewed assessment.
- **TRIAGE-06 — Recovery:** failed tool calls receive bounded recovery; exhausted recovery surfaces staff review without fabricated evidence.

## Proposed plan and tasks

- [ ] Select protocol, supported population and synthetic scoring fixtures with clinical review: AGENT-01.
- [ ] Agree proposal, tool, trace and approval contracts with mson-wagz: APP-04 and AGENT-02.
- [ ] Implement deterministic scorer and distinct custom MCP tools; integrate borrowed protocol retrieval: AGENT-01 through AGENT-03.
- [ ] Implement local model execution, LangGraph review pause and recovery: AGENT-04/05.
- [ ] Implement evidence and decision UI in src/frontend/src/features/triage/.
- [ ] Verify TRIAGE-01 through TRIAGE-06 and record actual repeated-run evidence: AGENT-06, with APP-06.

## Review questions and completion gate

Protocol thresholds, source permission, missing-input rules, model version and hardware remain undecided. Do not implement clinical thresholds before review. Completion requires the P0 end-to-end approval journey and real traces; no evaluations have run yet.
