# PostgreSQL + NestJS backend

Run commands from the repository root. Node 24 is the tested runtime.

See [data-source documentation](../../docs/DATA_SOURCES.md) for MIMIC provenance,
ODbL licensing, mappings, missing values and export instructions. Historical
research records are read-only and excluded from the synthetic clinical queue.

## Local setup

1. Run `npm ci` at the root and `npm ci --prefix src/frontend`.
2. Copy `.env.example` to `.env`. Set a local `DATABASE_URL` with your own password.
3. Choose a PostgreSQL installation, `docker compose up -d postgres` (requires
   `POSTGRES_PASSWORD`), or `npm run dev:db`. The latter starts a real PostgreSQL 18.4
   cluster through the pinned embedded-postgres development dependency; its data is
   retained in ignored `.local/postgres`. It binds only to 127.0.0.1. Do not run two
   database options on the same port.
4. Run `npm run db:migrate`, then `npm run db:seed` for synthetic staff/workflow
   fixtures. Separately run `npm run db:import:mimic` to load historical research
   cases from the checked-in, checksum-verified public MIMIC-IV-ED Demo files.
   Importing does not queue inference or overwrite synthetic data.
5. Choose `AI_PROVIDER=openai` with `OPENAI_MODEL` and a backend-only
   `OPENAI_API_KEY` in the ignored `.env`, or keep `AI_PROVIDER=bedrock` and
   configure an AWS profile, `AWS_REGION` and `BEDROCK_MODEL_ID` with model
   invocation permissions and capacity. Staging currently uses OpenAI.
6. Run `npm run dev:backend` and, in another terminal,
   `npm run dev --prefix src/frontend`. Open http://localhost:5173.

**Local development accounts.** Outside production, the seed creates the fixtures in
`src/shared/contracts/auth.js` with their six-digit development PINs, two per role
for simulating handovers and reassignment: STAFF-101 and STAFF-105 (nurses), STAFF-102
and STAFF-106 (clinicians), STAFF-107 (doctor), STAFF-103 and STAFF-108 (clerks), and
STAFF-104 and STAFF-109 (admins; each needs `staff:admin enroll-mfa` before signing in).
Read the PINs from that file. They are public in this repository, so in production
(`NODE_ENV=production`) the seed instead gives each account a random 64-character
secret that no PIN can match. PINs are hashed with salted scrypt. Synthetic seeding
retains existing records and is disabled in production unless
`ALLOW_SYNTHETIC_SEED=true` is explicitly set.

**Issuing PINs.** `npm run staff:admin -- list` lists accounts and
`npm run staff:admin -- reset-pin <staffId>` issues a random six-digit PIN (never a
repeated digit or straight run), prints it once, ends that person's sessions and
records a `STAFF_PIN_RESET` audit event without the PIN. `enroll-mfa <staffId>`
prints an authenticator setup key for an administrator (required for admin sign-in;
TOTP in `auth/totp.js`) and `remove-mfa <staffId>` removes it. Deployed servers run the
compiled `dist/src/backend/src/admin/staff-admin.js`; see deploy/ec2/README.md.

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

Reads of patient records are logged by `audit/access-log.ts`: routes marked
`@AccessLogged()` record the staff member, route and returned patient IDs in the
append-only `access_log` table (migration 006) before responding, once per view
per 5 minutes, and withhold the data if the record cannot be written. Mark any new
route that returns patient data with `@AccessLogged()`.

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

For Lambda, use [the SAM deployment guide](../../deploy/lambda/README.md). It provides separate API, SQS worker, transactional outbox dispatcher, and migration functions, plus private S3/CloudFront frontend hosting. Run migration 003 before starting this refactored backend locally.

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
database row locks and leases. Load tests, backup/restore exercises and
production staff provisioning are not yet covered.

The protocol is an unvalidated synthetic scoring fixture. Bedrock inference is
real, but this is not a clinical deployment. Nova Lite is a hosted model, not an
open-weights competition evaluation. A clinically reviewed and source-versioned
protocol and the challenge's model/residency requirements remain separate gates.

References: [Bedrock Converse](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html),
[RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_GettingStarted.CreatingConnecting.PostgreSQL.html).
