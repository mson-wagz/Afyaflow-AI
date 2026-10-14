# PostgreSQL + NestJS backend

Run commands from the repository root. Node 24 is the tested runtime.

## Local setup

1. Run `npm ci` at the root and `npm ci --prefix src/frontend`.
2. Copy `.env.example` to `.env`. Set a local `DATABASE_URL` with your own password.
3. Choose a PostgreSQL installation, `docker compose up -d postgres` (requires
   `POSTGRES_PASSWORD`), or `npm run dev:db`. The latter starts a real PostgreSQL 18.4
   cluster through the pinned embedded-postgres development dependency; its data is
   retained in ignored `.local/postgres`. It binds only to 127.0.0.1. Do not run two
   database options on the same port.
4. Run `npm run db:migrate`, then `npm run db:seed`.
5. Configure an AWS profile using the AWS CLI or environment credential chain. Set
   `AWS_REGION` and `BEDROCK_MODEL_ID`. The verified configuration is `eu-west-1`
   with `eu.amazon.nova-lite-v1:0`. The account must permit Bedrock InvokeModel for
   that inference profile and its underlying model resources.
6. Run `npm run dev:backend` and, in another terminal,
   `npm run dev --prefix src/frontend`. Open http://localhost:5173.

Seed accounts are Jane/nurse (STAFF-101, PIN 1234), Kamau/clinician (STAFF-102, 2345),
Faith/clerk (STAFF-103, 3456) and Samuel/admin (STAFF-104, 4567). These are publicly
known development fixtures, not production staff accounts. Their PINs are hashed
with salted scrypt in the database. Synthetic seeding retains existing records and
is disabled in production unless `ALLOW_SYNTHETIC_SEED=true` is explicitly set.

## What works

Server-backed sign-in, session restore/expiry, terminal locking, logout, role checks,
patient registration, retry-safe observation versioning, persisted agent jobs,
actual MCP/model traces, clinician decisions, approved queue ordering, department
transfers, observation comparisons, manual assessments and audit history.

Registration queues an assessment. In Triage & Prioritisation, the agent panel can
request/retry assessments, record a new observation snapshot and inspect runs.
The model retrieves evidence and saves a pending recommendation. The separate
proposal controls approve, reject or override it. An agent failure leaves the
patient visible and supports a reasoned manual clinician assessment.

PostgreSQL transactions combine domain changes and audit events. Version checks
prevent stale approvals/transfers. Retry keys serialize concurrent submissions.
Agent leases, run-scoped tools and finite deadlines prevent unbounded execution;
the tool surface contains no clinical approval operation.

## Verification

- `npm run build:backend`
- `npm run test:backend` — requires the configured PostgreSQL instance; uses an
  isolated temporary schema, cleans up only that schema and does not call Bedrock.
- `npm test --prefix src/frontend`
- `npm run build --prefix src/frontend`

Backend tests use a labelled model test double while invoking real MCP tools and
real PostgreSQL transactions. `EVALS.md` separately records the actual hosted model
run, its token usage and browser approval verification.

## AWS deployment preparation

The Dockerfile builds and serves the frontend and NestJS app on one origin. It has
not been executed here because Docker is not installed. For ECS/Fargate or another
container host, provide `DATABASE_URL` for RDS PostgreSQL, `DATABASE_SSL=true`, the
RDS CA bundle through `DATABASE_CA_FILE`, `APP_ORIGIN` equal to the HTTPS app origin,
and a Bedrock-enabled task IAM role. Never put AWS credentials or database secrets
in Vite environment variables. Run the migration before starting the application;
SQL and migration output are included in the image. Do not run development seed
accounts on a public deployment.

No AWS hosting resources have been created. Local PostgreSQL is independent of
RDS, so the connection URL can change without replacing application logic. Worker
jobs are durable across app restarts; multiple app instances claim jobs using
SKIP LOCKED. Load tests, operational monitoring, backup/restore exercises and
production staff provisioning are not yet covered.

The protocol is an unvalidated synthetic scoring fixture. Bedrock inference is
real, but this is not a clinical deployment. Nova Lite is a hosted model, not an
open-weights competition evaluation. A clinically reviewed and source-versioned
protocol and the challenge's model/residency requirements remain separate gates.

References: [Bedrock Converse](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html),
[RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_GettingStarted.CreatingConnecting.PostgreSQL.html).
