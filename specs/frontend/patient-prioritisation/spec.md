# Frontend patient prioritisation specification

Owner: JecintaK. Branch: `feature/frontend-patient-prioritisation`. Priority: P0. Status: implemented and verified.

Backend collaborator: Mejja for evidence; mson-wagz for approval APIs.

## User outcome

Sourced recommendation review and clinical decisions.

## Assigned tasks

- [x] JecintaK — FE-PATIENT-PRIORITISATION-01: Show recorded evidence, protocol/rule references and observation versions.
- [x] JecintaK — FE-PATIENT-PRIORITISATION-02: Build approve, reject and override controls with decision reasons.
- [x] JecintaK — FE-PATIENT-PRIORITISATION-03: Handle missing evidence, stale proposals, pending decisions and tool failures.
- [x] JecintaK — FE-PATIENT-PRIORITISATION-04: Build the authorised visit decision/audit history view with clinician identity, timestamps and reasons, linked to proposal evidence and tool traces.

## Acceptance checks

- TRIAGE-01 through TRIAGE-06 remain the shared product requirements.
- Only server-acknowledged decisions appear committed; duplicate clicks are handled.
- Staff can inspect evidence and tool history without interpreting proposals as diagnoses.

## Dependencies and code location

Protocol scoring and decision contracts in `src/shared/contracts/triage.js`.
Primary UI location: `src/frontend/src/features/triage/`.

## Verification results

Automated test verification:
- `FE-PATIENT-PRIORITISATION-01`: Verified SATS v2026.1 protocol citations and discriminator rule display.
- `FE-PATIENT-PRIORITISATION-02`: Verified Approve, Reject, and Override controls, enforcing mandatory clinical reason strings.
- `FE-PATIENT-PRIORITISATION-03`: Verified missing vital observations suppress automated urgency scores and prompt clinical staff review.
- `FE-PATIENT-PRIORITISATION-04`: Verified audit history log linking clinician identity, timestamps, decisions, and inspectable tool traces.
