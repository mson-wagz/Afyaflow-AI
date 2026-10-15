# Running the app tests

Install dependencies from the repository root:

```sh
npm ci
npm ci --prefix src/frontend
```

Run focused unit tests without starting PostgreSQL, the backend, or AWS services:

```sh
npm run test:unit
```

These cover PIN hashing, role checks, request schemas, provider tool mapping and errors, MIMIC checksum/cohort verification, unit conversion, missing-value handling and source joins, plus the browser API client. Provider tests stub network requests and do not use paid inference.

For integration tests, set `DATABASE_URL` in the root `.env` to a local development PostgreSQL database. The database user needs permission to create and drop schemas. Start PostgreSQL in another terminal if it is not already running:

```sh
npm run dev:db
```

Then run:

```sh
npm run test:integration
```

Backend integration tests create a randomly named `afyaflow_test_<UUID>` schema, apply the actual migrations and synthetic seed data there, launch NestJS on a temporary loopback port, and drop that schema after the suite. They exercise real PostgreSQL transactions, session cookies, HTTP endpoints, and MCP tool dispatch. The agent model is a deterministic test double; these tests make no Bedrock calls and do not validate the clinical protocol.

The HTTP journey registers a visit, verifies retry safety, generates pending evidence, approves it as a clinician, routes the visit, and checks the queue and linked audit events. Additional cases cover conflicting retry payloads, missing retry headers, forged staff identity, stale observations, and rejected clinical mutations. Existing service integration cases also cover concurrency, rollback, missing evidence, forbidden model tools, worker fencing, and append-only history.

The historical research integration imports the real public demo into the
isolated schema, verifies repeat imports and the 222-stay/64-patient cohort,
uses real MCP tools with a mocked model, and checks that source ESI/outcomes are
absent from model evidence. Historical cases must stay out of synthetic lists,
queues, clinical approvals and routing. Direct HTTP edit/override/escalation/
transfer attempts and prohibited database updates must fail. Frontend research
tests check source/missing-value disclosure, licence/export links, explicit
inference requests, saved reviews and role restrictions.

Frontend integration and component tests run in jsdom. They cover registration feedback, clinical decisions and notifications, queue and routing views, staff access, deterioration, and offline outbox replay. Existing feature files include some contract unit assertions alongside component tests. These are automated DOM tests, not full browser automation against a live server.

Run every backend and frontend test:

```sh
npm test
```

Run one side independently:

```sh
npm run test:backend
npm run test:frontend
```

Check production compilation separately:

Lambda cases cover API Gateway v2 cookies, partial SQS batch failures, outbox rollback and duplicate delivery, lease recovery, old retry generations, shared auth throttling, and trusted CloudFront viewer addresses. These run locally; actual AWS networking and Lambda container execution require staging verification described in [the Lambda deployment guide](deploy/lambda/README.md).

```sh
npm run build:backend
npm run build --prefix src/frontend
```

Use synthetic test records. A passing suite establishes the tested software behavior; it does not establish clinical validity, AWS deployment readiness, or live model reliability.
