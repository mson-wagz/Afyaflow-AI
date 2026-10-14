# Backend domain modules

Owner: Backend developer 1.

Group domain operations into NestJS feature modules for patients, observations, triage, queue and approvals. Each module registers its controllers and injectable services; colocate DTOs and checks with the feature. Reuse business logic from controllers and authorised tool adapters without duplicating validation rules.

Status: development HTTP behavior is implemented through src/backend/src/api.controller.ts, modules/workflow.service.ts, auth/auth.ts and database/. See src/backend/README.md and specs/contracts.md for runnable setup and scope. Dedicated per-feature NestJS modules remain a later refactor.
