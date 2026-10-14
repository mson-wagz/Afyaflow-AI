# Staff access UI

Owner: JecintaK. Branch: `feature/frontend-app-shell-and-staff-access`.

Follows `specs/frontend/app-shell-and-staff-access/spec.md` and `src/shared/contracts/auth.js`. Backend operations remain owned by the relevant backend collaborator.

## Implementation Details

- **Auth & Session Context (`AuthContext.jsx`, `useAuth.js`):**
  - Manages active staff session, session status (`authenticated`, `locked`, `unauthenticated`, `expired`), shared-device inactivity timer (auto-lock), and local draft retention.
  - Implements contract-aligned synthetic authentication, PIN unlock, and role-based permissions matrix.
- **Sign-In Screen (`SignInScreen.jsx`):**
  - Accessible credentials form with explicit labelling, validation errors, and quick-select synthetic persona buttons for Kenyan healthcare roles (Senior Triage Nurse Jane Mwangi, Medical Officer Dr. Kamau Otieno, Admissions Clerk Faith Achieng, Admin Samuel Kiprop).
- **Shared Terminal Lock Screen (`LockScreen.jsx`):**
  - Obscures all sensitive patient data upon lock or inactivity timeout.
  - Retains local uncommitted drafts (e.g. intake notes) safely in local storage under the active session.
  - 4-digit PIN unlock with validation and account switching options.
- **Role-Aware Controls & Server Denial (`PermissionGate.jsx`, `ClinicalReviewPanel.jsx`):**
  - Gated clinical actions for non-clinical roles.
  - Simulates server-side RBAC validation, returning standard HTTP 403 Forbidden responses with clear rationale when unauthorised roles attempt clinical approvals.
- **Shared UI Components (`src/frontend/src/components/`):**
  - Reusable accessible Button, Input, Card, Badge, Alert, Modal, Header, and Navigation components meeting WCAG touch target and visible focus standards.

## Status

Implemented and verified with automated test suite in `staff-access.test.jsx` (9/9 passing).
