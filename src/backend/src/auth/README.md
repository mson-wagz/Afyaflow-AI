# Authentication and authorisation

Owner: Backend developer 1.

Define staff identity, session handling and server-side permissions after specification review. Administrator access must not automatically grant clinical approval rights.

Status: development HTTP behavior is implemented through src/backend/src/api.controller.ts, modules/workflow.service.ts, auth/auth.ts and database/. See src/backend/README.md and specs/contracts.md for runnable setup and scope. Dedicated per-feature NestJS modules remain a later refactor.
