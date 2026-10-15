# AfyaFlow AI

**A hospital triage and patient flow prototype for Kenyan healthcare facilities.**

AfyaFlow connects registration, recorded observations, agent-assisted priority proposals, staff decisions, waiting queues, deterioration review, and department routing. The agent gathers evidence through MCP tools; an authenticated nurse or clinician makes the consequential decision.

**Current status:** the React/NestJS/PostgreSQL app works locally, a real Amazon Bedrock assessment has been verified, and the backend is refactored for AWS Lambda. The SAM template passes validation. No AWS hosting resources have been deployed; the Lambda image still needs a Docker build and staging verification.

The app uses synthetic patients and an **unvalidated scoring fixture**. It is a development demonstration, not a clinically validated triage system. The project is being prepared for the African Agentic AI Design Challenge, Health & Wellbeing track; hosted Nova Lite does not itself satisfy an open-weights evaluation requirement.

## Documentation

- [Application user guide](docs/USER_GUIDE.md): sign-in, registration, assessments, decisions, queues, routing, and offline drafts.
- [Backend setup](src/backend/README.md): local PostgreSQL, Bedrock configuration, and development accounts.
- [Lambda deployment guide](deploy/lambda/README.md): AWS prerequisites, SAM deployment, migrations, and staging checks.
- [Low-cost EC2 deployment](deploy/ec2/README.md): single-server staging, HTTPS, PostgreSQL, and OIDC deployments.
- [Testing guide](TESTING.md), [architecture](ARCHITECTURE.md), [API/MCP contracts](specs/contracts.md), and [evaluation evidence](EVALS.md).
- [CI/CD setup](docs/CI_CD.md): GitHub Actions checks and staging deployment prerequisites.
- [Feature specifications](specs/features/README.md), [frontend specifications](specs/frontend/README.md), and [development tasks](specs/tasks.md).

## Implemented features

- **Staff access:** server-backed sign-in, HttpOnly cookie sessions, locking, logout, role checks, and shared authentication throttling.
- **Registration:** demographic and complaint validation, timestamped observations, staff attribution, draft retention, and retry-safe submission.
- **Measurement feedback:** visible success, missing-value warnings, and range errors. Passing entry checks does not establish clinical normality or save a visit.
- **Agent assessments:** durable jobs, versioned evidence, bounded execution, actual model/tool traces, and persisted proposals for human review.
- **Clinical review:** approve, reject, or override proposals; record reasons; show success or permission errors; reject stale evidence.
- **Hospital queue:** approved priorities, waiting times, department filtering, workload snapshots, and visible stale-data states.
- **Deterioration review:** compare observation versions and support authorised, reasoned reassessment. The app does not measure vital signs itself.
- **Routing:** review synthetic department availability/capacity and explicitly commit a transfer with version checks.
- **Offline intake:** browser-local registration drafts and reconnect replay. Clinical decisions require online server acknowledgement.
- **Audit history:** persisted staff decisions and workflow events, with append-only database protection for observations, decisions, transfers, and audit records.

Capacity and staffing figures are synthetic, not live hospital telemetry. The frontend is responsive and includes a web manifest; service-worker caching, reliable offline app loading, and installability across target devices remain to be implemented or verified.

## Technologies used

### Application and data

- **React, JavaScript/JSX, CSS:** responsive interface and reusable components.
- **Vite:** frontend development server, API proxy, and production build.
- **Node.js 24, TypeScript, NestJS, Express:** backend runtime, controllers, dependency injection, and services.
- **dotenv, reflect-metadata, RxJS:** environment configuration and supporting NestJS runtime libraries.
- **PostgreSQL and `pg`:** records, transactions, row/advisory locks, job leases, retry keys, sessions, and audit events.
- **Zod:** request validation and MCP tool schemas.
- **Node.js crypto:** salted scrypt PIN hashes, secure session tokens, and SHA-256 fingerprints.
- **Browser localStorage:** drafts, registration outbox, and the separate browser-only demonstration store.
- **embedded-postgres:** portable local PostgreSQL; Docker Compose provides another local database option.

### Agents and MCP

- **Amazon Bedrock Converse and Amazon Nova Lite:** hosted inference. The verified configuration uses `eu-west-1` and `eu.amazon.nova-lite-v1:0`.
- **LangGraph:** model/tool orchestration and bounded workflow control. Human-review state is persisted in PostgreSQL.
- **Official MCP TypeScript client/server SDKs:** real tool discovery and dispatch through run-scoped in-memory transports, plus an optional stdio entry point.
- **Custom MCP tools:** `get_observations`, `read_protocol`, `score_protocol`, and `save_pending_proposal`.
- **Official filesystem MCP reference server:** a borrowed subprocess retrieves the fixed protocol file. The agent-facing wrapper exposes only that read; deployment protocol files are read-only.
- **Versioned synthetic protocol JSON:** deterministic scoring and missing-evidence checks. The model cannot invent measurements, choose clinical thresholds, approve a proposal, or update the approved queue.

### Testing and deployment tooling

- **Vitest, React Testing Library, jest-dom, jsdom:** browser API, component, and connected frontend workflow tests.
- **Node.js test runner and `@nestjs/testing`:** backend units and PostgreSQL/HTTP/MCP/Lambda integration tests.
- **tsx and the TypeScript compiler:** local TypeScript execution and compiled backend builds.
- **`@codegenie/serverless-express`:** NestJS/Express adaptation to API Gateway events.
- **AWS SDK for JavaScript:** Bedrock, SQS, and Secrets Manager clients.
- **Docker, AWS SAM, CloudFormation, AWS CLI:** packaging and deployment configuration.
- **Git/GitHub Actions:** CI checks on pushes and pull requests, with optional OIDC staging deployment from `main` after AWS provisioning and repository variable setup.

Dependency versions are recorded in the root and frontend manifests and lockfiles.

## AWS services and their roles

**Already used and verified:** Amazon Bedrock hosted inference. The hosting services below are represented in deployment configuration or required as existing resources; they are not yet deployed for this app.

### Resources described by the SAM template

- **AWS Lambda:** separate API, agent worker, scheduled dispatcher, and operator-invoked migration functions.
- **Amazon API Gateway HTTP API:** routes HTTP requests to the API Lambda.
- **Amazon SQS:** assessment deliveries, retries, and a dead-letter queue.
- **Amazon EventBridge:** invokes the outbox dispatcher every minute.
- **Amazon S3:** private frontend bucket with encryption and versioning.
- **Amazon CloudFront:** HTTPS frontend delivery, S3 origin access control, and same-origin API forwarding with caching disabled for `/api/*`.
- **AWS IAM:** scoped execution roles and model, queue, and secret permissions.
- **Amazon CloudWatch Logs and Alarms:** function logs with retention, dispatcher-error monitoring, and dead-letter queue monitoring. Notification subscriptions need configuration.
- **AWS CloudFormation:** provisions the infrastructure described through AWS SAM.

### Existing resources and deployment prerequisites

- **Amazon RDS for PostgreSQL:** intended private hosted database. The template consumes an existing database; development currently uses local PostgreSQL.
- **AWS Secrets Manager:** existing database credentials and CloudFront origin token, read at Lambda cold start.
- **Amazon VPC:** existing subnets, security groups, and private database connectivity.
- **AWS PrivateLink/interface VPC endpoints:** a no-NAT option for Bedrock Runtime, SQS, and Secrets Manager connectivity. Endpoints are prerequisites for that design and have their own charges.
- **Amazon ECR:** stores container images published during SAM deployment.
- **AWS KMS:** optional customer-managed encryption key for the database secret; the template accepts its ARN and grants scoped decryption.

**Optional:** RDS Proxy can help manage database connections, but is not provisioned or required by this template. ECS/Fargate and EC2 are alternative hosts, not components of the selected Lambda deployment. AgentCore Gateway is not required for the current MCP transport.

## Assessment workflow

1. Staff register a synthetic visit or save new observations.
2. A transaction records the assessment job and delivery intent.
3. Locally a polling worker claims the job. On Lambda the scheduled dispatcher sends it through SQS.
4. LangGraph calls Bedrock, which selects permitted MCP tools to retrieve observations and the protocol, calculate a deterministic score, and save a pending proposal.
5. Missing evidence or an unsupported population requires staff review instead of a guessed priority.
6. A nurse or clinician reviews the patient, observation version, protocol, recommendation, and tool trace.
7. The server checks authority and freshness, then atomically records a separate decision and any approved queue update.

Retry keys, database leases, and delivery generations protect repeated submissions and deliveries. A saved proposal can survive an interrupted worker acknowledgement without repeating inference. Failures remain visible and support explicit retry or a reasoned manual clinical decision.

## Run locally

Use Node.js 24. From the repository root:

```sh
npm ci
npm ci --prefix src/frontend
cp .env.example .env
```

PowerShell also supports `Copy-Item .env.example .env`. Configure your own database password in `DATABASE_URL`. Choose PostgreSQL installed locally, Docker Compose, or the portable helper; start only one on the chosen port.

Keep the portable database running in its own terminal:

```sh
npm run dev:db
```

Apply migrations and seed synthetic records:

```sh
npm run db:migrate
npm run db:seed
```

Configure AWS credentials through an AWS CLI profile or the SDK credential chain, and set `AWS_REGION` and `BEDROCK_MODEL_ID` in `.env`. Agent runs require Bedrock invocation permissions. Other server workflows can be tested without model access; agent failures then require review.

Start these in separate terminals:

```sh
npm run dev:backend
```

```sh
npm run dev --prefix src/frontend
```

Open **http://localhost:5173**. The backend listens on port 3000 by default, and Vite proxies `/api` to it. See [backend setup](src/backend/README.md) for details.

### Synthetic development accounts

- **Nurse:** `STAFF-101`, PIN `1234` — Jane Mwangi.
- **Clinician:** `STAFF-102`, PIN `2345` — Kamau Otieno.
- **Clerk:** `STAFF-103`, PIN `3456` — Faith Achieng.
- **Administrator:** `STAFF-104`, PIN `4567` — Samuel Mutua.

These public fixture credentials are for synthetic demonstrations only. Clerks can register demographics and complaints; recording measurements and clinical decisions requires a clinical role. Administrative accounts cannot register visits.

### Browser-only demonstration mode

Create `src/frontend/.env.local` containing `VITE_API_MODE=demo` and restart Vite to use simulated adapters without a backend. Remove that override and restart Vite to return to the connected app. This mode uses browser-local records and simulated agent evidence. Frontend tests also use these adapters unless explicitly testing the API client.

## Tests and verification

```sh
npm run test:unit
npm run test:integration
npm test
npm run build:backend
npm run build --prefix src/frontend
```

The latest verified suite has **97 passing tests: 39 backend and 58 frontend**. Both builds pass. Integration tests require local PostgreSQL, create an isolated temporary schema, and use a model test double with real MCP tools. They make no paid Bedrock calls. [TESTING.md](TESTING.md) describes scope; [EVALS.md](EVALS.md) separately records the hosted-model run.

## Deploy to AWS Lambda

Follow [the deployment guide](deploy/lambda/README.md) for private RDS/VPC prerequisites, secret format, IAM resources, migrations, frontend upload, and verification. The template does not provision the database or VPC endpoints.

```sh
sam validate --lint --template-file deploy/lambda/template.yaml
sam build --template-file deploy/lambda/template.yaml
sam deploy --guided --resolve-image-repos
```

Docker and SAM CLI are required. SAM lint has passed; container execution and actual deployment remain unverified. Public subnets alone do not provide standard VPC-connected Lambda functions internet access. The documented no-NAT design uses suitable service connectivity, such as interface endpoints.

The configuration includes selected Well-Architected practices: repeatable infrastructure, restricted permissions, private database access, TLS, retry-safe jobs, failure alarms, bounded execution, and configurable concurrency. A full assessment, stronger authentication, restore drills, operational notifications, availability targets, and measured costs remain production preparation work.

## Repository layout

```text
src/frontend/       React application and frontend tests
src/backend/src/    NestJS API, data, authentication, and Lambda handlers
src/shared/         Browser-safe contracts and synthetic fixtures
services/agents/    Bedrock and LangGraph workflow
services/mcp/       Tools, borrowed server integration, and protocol fixture
tests/backend/      Backend unit and integration tests
scripts/            Local PostgreSQL helper
deploy/lambda/      SAM template and deployment guide
docs/               Application user guide
specs/              Requirements, contracts, and feature specifications
```

`.env`, `.local/`, dependencies, and generated builds are ignored. Never commit the local PostgreSQL cluster or credentials.

## Team and licence

- **mson-wagz:** backend application and data workflows.
- **Mejja:** agent orchestration and MCP.
- **JecintaK:** frontend workflows and responsive interface.

Shared ownership and milestones are tracked in [specs/tasks.md](specs/tasks.md). The project uses the [MIT licence](LICENSE).
