# NestJS recommendation controller guidance

Owner: Backend developer 1.

Implement recommendation HTTP endpoints in this NestJS module. Delegate decisions to the approvals service. Validate observation versions and commit approval, audit history and queue changes atomically.

Status: development HTTP behavior is implemented through src/backend/src/api.controller.ts, modules/workflow.service.ts, auth/auth.ts and database/. See src/backend/README.md and specs/contracts.md for runnable setup and scope. Dedicated per-feature NestJS modules remain a later refactor.
