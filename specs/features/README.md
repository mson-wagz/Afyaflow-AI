# Feature specifications and branch workflow

Status: draft specifications for team review. No implementation or verification results yet.

Each product feature has one specification directory and one implementation branch. Keep its specification, plan, acceptance checks and code changes together in the feature pull request. Contributor names describe ownership; branch names describe capability.

## Feature ownership

- [Queue management](queue-management/spec.md): `feature/backend-queue-management`, owned by mson-wagz. P0.
- [Patient prioritisation](patient-prioritisation/spec.md): `feature/backend-patient-prioritisation`, owned by Mejja. P0.
- [Deterioration monitoring](deterioration-monitoring/spec.md): `feature/backend-deterioration-monitoring`, owned by Mejja. P1.
- [Department routing](department-routing/spec.md): `feature/backend-department-routing`, owned by mson-wagz. P1.

JecintaK owns all UI tasks across the four product features and shared frontend foundations, working with the backend owner on each end-to-end slice. See [frontend specs and dedicated branches](../frontend/README.md). Two features per backend contributor establishes responsibility, not an equal-hours estimate. Review actual remaining effort at each milestone and pair where needed. Build the P0 journey before starting P1 implementation.

## Specification lifecycle

1. **Specify:** describe the user outcome, scope, stable requirement IDs and observable acceptance checks in spec.md. Mark unanswered contract or clinical questions.
2. **Review:** all three agree the feature boundary. Clinical protocol choices and threshold changes require clinical review before implementation.
3. **Plan:** resolve shared schema, API/MCP and data dependencies; refine the ordered tasks in the feature specification. Link foundational APP/AGENT tasks from specs/tasks.md.
4. **Implement:** update the feature branch from main and deliver a small complete slice. The frontend can use agreed synthetic mocks while APIs are pending.
5. **Verify:** record actual acceptance results and agent runs. Planned tests are not passing results.
6. **Merge:** another contributor reviews the PR into main. Merge only after the agreed checks pass and the specification matches implemented behaviour. Remove completed feature branches when they are no longer needed.

Feature specs currently combine requirements, a proposed plan and a task checklist in one file. Split a large feature into plan.md and tasks.md within its directory when detail warrants it.

## Shared foundations and dependency order

Define requirements.md, data-model.md and contracts.md under specs/ before runtime work. Review shared contracts with all contributors and merge their initial agreed version to main before feature implementation diverges. A temporary `feature/shared-contracts` branch may be created when that work begins; it is not created by this scaffold.

Authentication, registration, observation persistence, proposal state, approval transactions and audit correlation serve multiple features. APP-01 through APP-04 and AGENT-01 through AGENT-05 retain their technical owners in specs/tasks.md. A feature owner coordinates dependencies rather than duplicating foundational logic.

Queue management and prioritisation can proceed together against shared contracts. Deterioration monitoring depends on observation history, prioritisation and the established approval flow. Routing depends on an approved assessment, configured departments and the same approval flow. No feature branch may independently redefine those interfaces.

## Branch and PR conventions

Use `feature/backend-<capability>` for backend work and `feature/frontend-<capability>` for frontend work. Use `fix/<problem>` and `docs/<document>` for fixes and documentation. Choose lowercase hyphenated words, without personal names or the codex prefix. Refresh reserved P1 branches from main before their first implementation commit.

Each PR must state:

- Feature specification and requirement IDs covered.
- User-visible behaviour delivered and any remaining scope.
- Contract, migration or protocol changes.
- Actual verification evidence, including failure behaviour.
- Dependencies on other PRs.

Each developer opens PRs for their own commits. Backend feature branches hold backend changes; JecintaK uses the dedicated `feature/frontend-*` branches documented in specs/frontend/README.md. Review shared contract changes together, merge them first and update dependent branches. Do not force-push shared branches.
