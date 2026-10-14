# NestJS observations module

Owner: Backend developer 1.

Register an observations controller and injectable service in this NestJS feature module after contract review. Accept timestamped observations with units and staff attribution, preserve observation history and advance the version used for recommendation approval checks. Coordinate persistence with the patients module.

Status: development HTTP behavior is implemented through src/backend/src/api.controller.ts, modules/workflow.service.ts, auth/auth.ts and database/. See src/backend/README.md and specs/contracts.md for runnable setup and scope. Dedicated per-feature NestJS modules remain a later refactor.
