# Frontend patient registration specification

Owner: JecintaK. Branch: `feature/frontend-patient-registration`. Priority: P0. Status: draft for review; not implemented.

Backend collaborator: mson-wagz.

## User outcome

Synthetic visit registration and timestamped observations.

## Assigned tasks

- [ ] JecintaK — FE-PATIENT-REGISTRATION-01: Build registration fields with explicit missing-information validation.
- [ ] JecintaK — FE-PATIENT-REGISTRATION-02: Build observation entry with units, timestamps and schema-based field errors.
- [ ] JecintaK — FE-PATIENT-REGISTRATION-03: Integrate retry-safe submission and explicit draft, pending and confirmed status.

## Acceptance checks

- Invalid input produces actionable errors without losing valid entries.
- Repeated submissions do not create duplicate confirmed records.
- Missing measurements are never guessed; units, times and status match the contract.

## Dependencies and code location

Agree request/response and error schemas, synthetic fixtures, role permissions and freshness/retry behaviour with the backend collaborator before implementation. Clinical views reuse the reviewed approval contract. P1 features depend on the verified P0 journey; offline work also requires a reviewed retention/conflict policy and target-browser list.

Primary UI location: `src/frontend/src/features/registration/`. Use src/frontend/src/pages for React page components and src/frontend/public for non-sensitive assets. Client routing will be selected during contract review. Import browser-safe schemas from src/shared/contracts; never import backend/database/model credentials into browser code.

Completion requires reviewed contracts, implemented behaviour and recorded passing checks in the feature PR. No test results have been recorded yet.
