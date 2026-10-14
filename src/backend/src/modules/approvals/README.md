# Clinical approval module

Owner: Backend developer 1.

Verify the authenticated clinician's role, recommendation state and current observation version. Record actor, reason and decision with queue changes in a single transaction. Make retries idempotent.

Status: development HTTP behavior is implemented through src/backend/src/api.controller.ts, modules/workflow.service.ts, auth/auth.ts and database/. See src/backend/README.md and specs/contracts.md for runnable setup and scope. Dedicated per-feature NestJS modules remain a later refactor.
