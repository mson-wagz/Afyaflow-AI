# Frontend patient registration specification

Owner: JecintaK. Branch: `feature/frontend-patient-registration`. Priority: P0. Status: implemented and verified.

Backend collaborator: mson-wagz.

## User outcome

Synthetic visit registration and timestamped observations.

## Assigned tasks

- [x] JecintaK — FE-PATIENT-REGISTRATION-01: Build registration fields with explicit missing-information validation.
- [x] JecintaK — FE-PATIENT-REGISTRATION-02: Build observation entry with units, timestamps and schema-based field errors.
- [x] JecintaK — FE-PATIENT-REGISTRATION-03: Integrate retry-safe submission and explicit draft, pending and confirmed status.

## Acceptance checks

- Invalid input produces actionable errors without losing valid entries.
- Repeated submissions do not create duplicate confirmed records.
- Missing measurements are never guessed; units, times and status match the contract.

## Dependencies and code location

Agreed validation schemas, units and idempotency contracts in `src/shared/contracts/patient.js`.
Primary UI location: `src/frontend/src/features/registration/`.

## Verification results

Automated test verification:
- `FE-PATIENT-REGISTRATION-01`: Validates required name, age range (0-130), gender and complaint; rejects invalid formats with actionable messages.
- `FE-PATIENT-REGISTRATION-02`: Captures vitals with strict units (`mmHg`, `bpm`, `/min`, `°C`, `%`); identifies unrecorded measurements without inventing numbers.
- `FE-PATIENT-REGISTRATION-03`: Verifies idempotency keys prevent duplicate confirmed records upon repeated submissions.
