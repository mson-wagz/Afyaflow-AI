# AfyaFlow AI architecture

Status: proposed architecture; source directories exist, application services are not implemented.

## Application boundaries

One Next.js application will host React pages and API Route Handlers. src/app contains routing entry points; src/frontend contains UI features and offline draft handling; src/backend contains authenticated domain operations and PostgreSQL access. src/shared/contracts contains browser-safe runtime schemas and types used by both sides.

The frontend developer owns pages and UI. Backend developer 1 owns APIs, persistence, staff access and clinical approvals. Backend developer 2 owns the TypeScript agent workflow and MCP integration. All three review contracts before implementation.

## Agent and MCP boundaries

services/agents will coordinate a LangGraph workflow using a locally served open-weights model. services/mcp will expose custom tools to retrieve observations, deterministically score a versioned protocol and save a pending recommendation. These tools must perform distinct operations rather than proxying one endpoint.

The proposed borrowed server is the official filesystem MCP reference server. It provides protocol-file retrieval without rebuilding generic filesystem access. Run it with approved resources mounted read-only and expose only necessary read tools to the agent. It must not access patient records, credentials or the rest of the repository.

The clinical protocol, supported population, model version, hardware, hosting location and service transport will be chosen during specification. No clinical scoring thresholds are defined by this scaffold.

## Approval and data flow

React interface → authenticated Next.js API → backend modules → PostgreSQL.

Assessment request → agent → custom MCP observation retrieval → borrowed MCP protocol retrieval → deterministic scoring tool → validated pending recommendation → clinician review → server-side approval transaction.

The approval transaction checks the clinician's role and current observation version, records the decision and updates approved queue state atomically. Rejection, override and retry behaviour will be defined in the contracts. Agent credentials must never grant clinical approval authority.

## Connectivity and audit

The PWA will capture local drafts and show pending sync and stale queue indicators. Shared queue updates require server acknowledgement; offline operation retains a staff escalation path. Polling is the initial update mechanism.

Record tool inputs, outputs, timestamps, run IDs and evidence versions, linking them to the clinician's decision. Synthetic data is the development default. The public asset directory contains no patient data.

## Next specification work

Define requirements, entity versions, API/MCP schemas, authentication permissions, offline retention and evaluation fixtures before adding runtime code. This document will be updated to reflect implemented behaviour before submission.
