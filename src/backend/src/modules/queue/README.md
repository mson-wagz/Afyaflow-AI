# Queue module

Owner: Backend developer 1.

Calculate waiting-time views and apply approved queue decisions. Keep patients awaiting assessment visible. Pending agent proposals must not alter approved ordering.

Status: development HTTP behavior is implemented through src/backend/src/api.controller.ts, modules/workflow.service.ts, auth/auth.ts and database/. See src/backend/README.md and specs/contracts.md for runnable setup and scope. Dedicated per-feature NestJS modules remain a later refactor.
