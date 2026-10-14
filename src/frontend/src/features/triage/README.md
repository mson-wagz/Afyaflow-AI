# Triage and Patient Prioritisation feature

Owner: JecintaK (frontend developer).

Follows `specs/frontend/patient-prioritisation/spec.md` and `src/shared/contracts/triage.js`.

## Implementation Details

- **Evidence & Protocol Sourcing (`TriageView.jsx`):**
  - Displays deterministic South African Triage Scale (SATS v2026.1) score calculations, physiological discriminators, and observation citations.
  - Incomplete vital records trigger explicit missing-evidence notices without inventing urgency.
- **Human Clinical Gate & Decision Controls (`useTriage.js`):**
  - Authorised Approve, Reject, and Override controls restricted to verified clinical roles.
  - Mandatory clinical justification reasons recorded for rejections and overrides.
  - Protection against duplicate submissions and unacknowledged changes.
- **Trace & Audit Correlation (`apiAdapter.js`):**
  - Interactive tool trace inspector displaying raw MCP tool inputs, outputs, timestamps, and model identifiers.
  - Chronological decision audit table attributing clinician name, timestamps, decisions, and evidence links.

## Status

Implemented and verified with automated test suite.
