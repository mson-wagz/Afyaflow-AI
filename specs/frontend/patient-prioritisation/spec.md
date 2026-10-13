# Frontend patient prioritisation specification

Owner: JecintaK. Branch: `feature/frontend-patient-prioritisation`. Priority: P0. Status: draft for review; not implemented.

Backend collaborator: Mejja for evidence; mson-wagz for approval APIs.

## User outcome

Sourced recommendation review and clinical decisions.

## Assigned tasks

- [ ] JecintaK — FE-PATIENT-PRIORITISATION-01: Show recorded evidence, protocol/rule references and observation versions.
- [ ] JecintaK — FE-PATIENT-PRIORITISATION-02: Build approve, reject and override controls with decision reasons.
- [ ] JecintaK — FE-PATIENT-PRIORITISATION-03: Handle missing evidence, stale proposals, pending decisions and tool failures.
- [ ] JecintaK — FE-PATIENT-PRIORITISATION-04: Build the authorised visit decision/audit history view with clinician identity, timestamps and reasons, linked to proposal evidence and tool traces.

## Acceptance checks

- TRIAGE-01 through TRIAGE-06 remain the shared product requirements.
- Only server-acknowledged decisions appear committed; duplicate clicks are handled.
- Staff can inspect evidence and tool history without interpreting proposals as diagnoses.

## Dependencies and code location

Agree request/response and error schemas, synthetic fixtures, role permissions and freshness/retry behaviour with the backend collaborator before implementation. Clinical views reuse the reviewed approval contract. P1 features depend on the verified P0 journey; offline work also requires a reviewed retention/conflict policy and target-browser list.

Primary UI location: `src/frontend/features/triage/`. Use src/app for page entry points and public for non-sensitive assets. Import browser-safe schemas from src/shared/contracts; never import backend/database/model credentials into browser code.

Completion requires reviewed contracts, implemented behaviour and recorded passing checks in the feature PR. No test results have been recorded yet.
