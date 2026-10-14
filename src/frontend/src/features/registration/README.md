# Patient Registration feature

Owner: JecintaK (frontend developer).

Follows `specs/frontend/patient-registration/spec.md` and `src/shared/contracts/patient.js`.

## Implementation Details

- **Validation & Missing Data (`useRegistration.js`):**
  - Schema-based validation for patient demographics and physiological observations.
  - Standardized units (`mmHg`, `bpm`, `/min`, `°C`, `%`).
  - Strict missing measurement detection: never guesses or fills unmeasured vitals.
- **Idempotency & Retry Safety (`apiAdapter.js`):**
  - Generates unique client-side idempotency keys per submission to prevent duplicate patient records on repeated clicks or network retries.
- **Draft Retention:**
  - Persists partial patient entries into local storage, surviving refreshes or terminal locking.

## Status

Implemented and verified with automated test suite.
