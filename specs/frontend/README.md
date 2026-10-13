# Frontend ownership and feature specifications

Owner: JecintaK. Status: draft specifications; UI implementation has not started.

All frontend tasks, including shared components, authentication screens, PWA behaviour, feature views, accessibility, UI checks and demo presentation, belong to JecintaK. Backend collaborators own server operations. This records repository responsibility, not GitHub issue assignees or repository permissions.

## Feature branches and specifications

- [app shell and staff access](app-shell-and-staff-access/spec.md): `feature/frontend-app-shell-and-staff-access`. Owner: JecintaK. Priority: P0.
- [patient registration](patient-registration/spec.md): `feature/frontend-patient-registration`. Owner: JecintaK. Priority: P0.
- [queue management](queue-management/spec.md): `feature/frontend-queue-management`. Owner: JecintaK. Priority: P0.
- [patient prioritisation](patient-prioritisation/spec.md): `feature/frontend-patient-prioritisation`. Owner: JecintaK. Priority: P0.
- [deterioration monitoring](deterioration-monitoring/spec.md): `feature/frontend-deterioration-monitoring`. Owner: JecintaK. Priority: P1.
- [department routing](department-routing/spec.md): `feature/frontend-department-routing`. Owner: JecintaK. Priority: P1.
- [offline pwa](offline-pwa/spec.md): `feature/frontend-offline-pwa`. Owner: JecintaK. Priority: P0 basic draft capture; advanced behaviour after the verified P0 slice.

## Delivery order and review

Review shared API schemas with both backend contributors first. Build the shell and registration against agreed synthetic mocks, then integrate queue and prioritisation into one P0 workflow. Add basic offline capture without representing unsynchronised records as committed. Begin deterioration and routing after P0 verification.

All seven branches are reserved from the planning commit, not evidence of seven implementations. Update each branch from current main before beginning work. Keep specification changes, scoped UI code and actual acceptance evidence in the same PR. Review with the backend collaborator named in its spec before merging into main.

JecintaK owns frontend verification across all features: phone/desktop layout, keyboard access, validation, loading/error states, role-sensitive UI, shared-device privacy and reconnect behaviour. Record actual browser checks; mocked screens are not proof of working agent execution or successful approval.

Detailed shared contracts remain pending. None of these drafts defines clinical thresholds or authorises runtime implementation before specification review.
