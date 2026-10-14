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

Agree request/response and error schemas, synthetic fixtures, role permissions and freshness/retry behaviour with the backend collaborator before implementation. Clinical views reuse the reviewed approval contract. P1 features depend on the verified P0 journey; offline work also requires a reviewed retention/conflict policy and target-browser list.

Primary UI location: `src/frontend/src/components/`. Use src/frontend/src/pages for React page components and src/frontend/public for non-sensitive assets. Client routing will be selected during contract review. Import browser-safe schemas from src/shared/contracts; never import backend/database/model credentials into browser code.

Completion requires reviewed contracts, implemented behaviour and recorded passing checks in the feature PR. No test results have been recorded yet.
