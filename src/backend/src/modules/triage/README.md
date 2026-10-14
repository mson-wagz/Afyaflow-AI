# Triage application module

Owner: Backend developer 1, with backend developer 2.

Manage recommendation requests, evidence references and proposal state. Coordinate with the versioned deterministic scorer owned by backend developer 2. Reject unsourced proposals.

Status: development HTTP behavior is implemented through src/backend/src/api.controller.ts, modules/workflow.service.ts, auth/auth.ts and database/. See src/backend/README.md and specs/contracts.md for runnable setup and scope. Dedicated per-feature NestJS modules remain a later refactor.
