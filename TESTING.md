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

These cover PIN hashing and verification, clinical role checks, retry keys, registration and observation schemas, decision evidence requirements, and the browser API client's JSON requests, errors, session expiry, and mutation notifications. Browser unit tests stub `fetch`; they do not contact a running server.

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
