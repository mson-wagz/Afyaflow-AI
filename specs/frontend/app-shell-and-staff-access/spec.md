# Frontend app shell and staff access specification

Owner: JecintaK. Branch: `feature/frontend-app-shell-and-staff-access`. Priority: P0. Status: implemented and verified.

Backend collaborator: mson-wagz.

## User outcome

Responsive navigation, staff sign-in and shared-device locking.

## Assigned tasks

- [x] JecintaK — FE-APP-SHELL-AND-STAFF-ACCESS-01: Build responsive layouts and accessible reusable components.
- [x] JecintaK — FE-APP-SHELL-AND-STAFF-ACCESS-02: Build sign-in, session expiry and lock screens from reviewed authentication contracts.
- [x] JecintaK — FE-APP-SHELL-AND-STAFF-ACCESS-03: Handle role-aware navigation and server permission errors.

## Acceptance checks

- Phone and desktop screens support labelled controls, keyboard use and visible focus.
- Locking or session expiry hides patient content and follows the reviewed draft-retention policy.
- Unauthorised roles cannot use clinical controls; backend denial is shown clearly.

## Dependencies and code location

Browser-safe authentication contracts and RBAC schemas in `src/shared/contracts/auth.js`.
Shared accessible UI components in `src/frontend/src/components/`.
Feature implementation in `src/frontend/src/features/staff-access/`.
Automated test suite in `src/frontend/src/features/staff-access/staff-access.test.jsx`.

## Verification results

Automated test run with Vitest (`npm test`):
- `FE-APP-SHELL-AND-STAFF-ACCESS-01`:
  - ✓ Renders labelled controls and accessible input fields on sign-in screen
  - ✓ Renders header with facility branding, staff info, and lock terminal button
- `FE-APP-SHELL-AND-STAFF-ACCESS-02`:
  - ✓ Authenticates valid synthetic staff fixtures
  - ✓ Rejects invalid PIN with descriptive error
  - ✓ Obscures patient data on shared device lock and restores draft upon unlock
- `FE-APP-SHELL-AND-STAFF-ACCESS-03`:
  - ✓ Verifies clinical permissions matrix for roles
  - ✓ Allows clinical staff to commit clinical decisions with server acknowledgement
  - ✓ Strictly denies non-clinical roles from clinical approval with standard 403 Forbidden payload
  - ✓ Displays server permission denial banner when non-clinical user attempts clinical approval in UI

Result: 9 tests passed out of 9.
Production build with Vite (`npm run build`):
- ✓ 38 modules transformed, cleanly bundled without warnings or errors.
