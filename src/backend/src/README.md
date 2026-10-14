# NestJS source code

Owner: Backend developer 1.

After reviewing shared contracts, add the NestJS bootstrap and root module here. Group controllers and injectable services in feature modules. Use guards and input validation for protected endpoints and return contract-defined errors. Keep controllers thin; clinical scoring and database operations belong in the relevant services.

Status: development HTTP behavior is implemented through src/backend/src/api.controller.ts, modules/workflow.service.ts, auth/auth.ts and database/. See src/backend/README.md and specs/contracts.md for runnable setup and scope. Dedicated per-feature NestJS modules remain a later refactor.
