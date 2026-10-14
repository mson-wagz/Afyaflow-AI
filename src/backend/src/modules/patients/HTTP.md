# NestJS patient controller guidance

Owner: Backend developer 1.

Implement a patient controller in this module after contract review. Delegate synthetic patient and visit operations to injectable services, enforcing role checks, input validation and retry-safe writes.

Status: development HTTP behavior is implemented through src/backend/src/api.controller.ts, modules/workflow.service.ts, auth/auth.ts and database/. See src/backend/README.md and specs/contracts.md for runnable setup and scope. Dedicated per-feature NestJS modules remain a later refactor.
