# Database layer

Owner: Backend developer 1.

Store the PostgreSQL schema, migrations, repositories and synthetic seeds after data-model review. Keep credentials out of source control and frontend imports.

Status: development HTTP behavior is implemented through src/backend/src/api.controller.ts, modules/workflow.service.ts, auth/auth.ts and database/. See src/backend/README.md and specs/contracts.md for runnable setup and scope. Dedicated per-feature NestJS modules remain a later refactor.
