# Patients and visits module

Owner: Backend developer 1.

Manage synthetic patients, visits and append-only observation history with explicit versions. Use database transactions for related writes.

Status: development HTTP behavior is implemented through src/backend/src/api.controller.ts, modules/workflow.service.ts, auth/auth.ts and database/. See src/backend/README.md and specs/contracts.md for runnable setup and scope. Dedicated per-feature NestJS modules remain a later refactor.
