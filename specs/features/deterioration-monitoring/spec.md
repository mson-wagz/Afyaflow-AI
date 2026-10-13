# Deterioration monitoring specification

Status: draft for review. Priority: P1. Backend owner: Mejja. UI owner: frontend contributor. Application collaborator: mson-wagz. Branch: `feature/deterioration-monitoring`.

## User outcome and scope

As a nurse, I can review a proposed reassessment when newly recorded observations or a reported symptom change meet reviewed criteria. This feature consumes new entries; it does not continuously measure a patient's condition. Monitoring equipment integration is outside this slice.

## Requirements and acceptance criteria

- **WATCH-01 — New evidence:** a configured synthetic change produces a pending reassessment proposal citing both relevant observation entries, timestamps and a versioned rule.
- **WATCH-02 — Approval boundary:** a pending watch proposal can appear in a staff review inbox but cannot change approved priority, routing or queue position. Consequential action requires a named clinician's decision.
- **WATCH-03 — No false coverage:** without new observations, display the last recorded observation time. The interface must not claim the patient is continuously monitored or stable.
- **WATCH-04 — Deduplication:** repeated processing of the same observation pair creates one logical proposal. Additional evidence is handled according to the reviewed proposal lifecycle.
- **WATCH-05 — Missing or invalid inputs:** incomplete units, incomparable measurements or stale evidence request staff review without a fabricated deterioration result.

## Proposed plan and tasks

- [ ] Complete the P0 prioritisation and approval journey before implementation.
- [ ] Review reassessment rules with a clinical adviser; define deduplication, freshness and invalid-input behaviour in shared contracts.
- [ ] Extend services/mcp/ with a typed reassessment-proposal operation; reuse APP-04 persistence and authorisation.
- [ ] Extend services/agents/ to compare eligible records, validate citations and persist a pending proposal.
- [ ] Add reassessment review and observation-age display to frontend features; create dedicated feature folders when implementation starts.
- [ ] Verify WATCH-01 through WATCH-05 with simulated changes and record actual results in EVALS.md.

## Review questions and completion gate

Observation cadence, escalation path, reassessment criteria and stale-data rules require review. No universal thresholds are defined here. Completion requires approved rules, sourced proposals and verified approval/deduplication behaviour; no checks have run yet.
