# Deterioration review UI

Owner: JecintaK. Branch: `feature/frontend-deterioration-monitoring`.

Follows `specs/frontend/deterioration-monitoring/spec.md` and `src/shared/contracts/deterioration.js`.

## Implementation Details

- **Surveillance Inbox & Evidence (`DeteriorationView.jsx`):**
  - Side-by-side Before/After observation delta analysis (HR, BP, RR, SpO2, AVPU).
  - Explicit notification that the system is observation-driven and does not claim continuous telemetry coverage (WATCH-03).
- **Observation Age & Staleness:**
  - Displays age in minutes and marks visits with observations older than 60 minutes as stale, requesting routine re-measurement.
- **Clinical Review Controls:**
  - Clinician-gated escalation to Resuscitation (Red) or dismissal with mandatory clinical justification.

## Status

Implemented and verified with automated test suite.
