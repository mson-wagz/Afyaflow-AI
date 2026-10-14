# NestJS backend

Owner: mson-wagz (backend developer 1), responsible for `feature/backend-queue-management`, `feature/backend-department-routing` and shared application foundations. Collaborate on approval and persistence interfaces used by the other features.

Use TypeScript and NestJS. Source code belongs in src/backend/src: feature modules contain HTTP controllers and injectable services; auth contains staff-session and authorisation logic; database contains persistence providers and migration guidance. Planned bootstrap files are src/main.ts and src/app.module.ts relative to this project directory, not repository-root React routes.

Own server-side operations, role checks and persistence. Agent proposals enter through controlled interfaces; clinical approval remains server-enforced. Browser code must not import this directory. The NestJS package and bootstrap are not initialised yet; add them after specification review without generating a nested backend project.

Status: directory scaffold only; implementation follows specification review.
