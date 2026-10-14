# React frontend

Owner: JecintaK (frontend developer).

This is the React + Vite project initialised by the frontend contributor. App.jsx and main.jsx are in src/frontend/src. Organise page components under src/pages and UI features under src/features relative to this project; public assets belong in public. Client routing is still to be specified.

Call the NestJS backend through reviewed HTTP contracts. Never import backend modules, database clients or model credentials into browser code.

Status: React + Vite synthetic workflow demo. Registration, triage decisions, queue state,
department transfers and reassessments share a browser-local demo store. NestJS,
PostgreSQL, model inference and MCP execution are not implemented by these adapters.
Protocol metadata and tool traces are simulated; clinical scoring remains unvalidated.

Run `npm ci`, then `npm run dev` from this directory. Verify changes with `npm test`
and `npm run build`.

Demo visits, decision history, transfers, reassessments and registration retry keys
are saved together under `afyaflow_demo_workflow_v1` in localStorage. Reloading keeps
them; tabs on the same browser origin can read the saved state. Separate devices,
browser profiles and origins do not share records. Concurrent multi-tab writes are
not a substitute for backend transactions. Use synthetic data only.

Registration while offline saves a pending intake in `afyaflow_sync_outbox_v1`.
Reconnect invokes the registration adapter with the draft's stable retry key before
marking it saved. Invalid drafts remain failed for retry; unsupported draft types
are not silently confirmed. Clinical decisions, reassessments and transfers require
online connectivity and a clinical demo role at the adapter boundary. Client checks
are for evaluating the prototype; production authorization and acknowledgement must
be implemented on the backend.

Workflow regression tests cover registration through approval and transfer, persistent
queue consistency, stale/incomplete proposals, rejected visits, reassessment priority
changes, clinical role checks, the actual offline approval form and reconnect replay.

## Connected backend mode

Backend mode is now the default. The Vite proxy forwards /api to NestJS on port 3000.
Staff sign-in uses a server cookie, and all patient/workflow adapters call PostgreSQL-backed
HTTP endpoints. No frontend AWS keys are needed. Set VITE_API_MODE=demo only to review
the isolated browser-local prototype described above. Existing frontend unit tests use
that isolated mode; backend integration tests and the live Bedrock evidence are separate.
See ../backend/README.md for startup and deployment preparation.
