# CI and deployment setup

## Continuous integration

`.github/workflows/ci.yml` runs on every push, pull request, and manual dispatch.
It uses Node.js 24 and an isolated PostgreSQL 18 service to run the complete
backend/frontend test suite and both production builds. A separate job validates
the SAM template and builds the Lambda container image using Docker on the runner.
Tests use synthetic data and a model test double; no AWS keys or paid Bedrock
requests are required. Action dependencies are pinned to commit hashes.

The workflow must be pushed to GitHub before it can run. In repository branch
protection or a ruleset for `main`, require these checks after their first run:

- `Application tests and builds`
- `Validate infrastructure and build Lambda image`

Repository administrators manage protection settings. Enable Actions if repository
policy currently disables it. CI has read-only repository permissions.

## Low-cost staging deployment

The workflow includes an EC2 deployment job, disabled until the repository variable
`AWS_DEPLOY_ROLE_ARN` is configured. It runs only for successful pushes to `main`.
Other branches, pull requests, and manual CI dispatches run checks without deploying.
See `deploy/ec2/README.md` for the low-cost architecture, cost basis, provisioning,
variables, migration/backup behavior, and recovery limits.

The deployment runs on an ARM runner, builds an immutable app image, publishes it
to ECR, deploys through Systems Manager, and verifies HTTPS. Its OIDC trust is
restricted to this repository's `main` branch. The workflow and deployment job
serialize `main` runs without cancelling an active deployment. No GitHub deployment
environment is configured; adding one requires changing the OIDC trust subject.

## Alternative Lambda deployment

The existing SAM option remains available. Before enabling Lambda deployment:

1. Confirm the staging budget and synthetic-data scope.
2. Provision or select private PostgreSQL, subnets, security groups, service
   connectivity, and the database/origin-token secret described in
   `deploy/lambda/README.md`.
3. Create or reuse the AWS GitHub OIDC provider and create a deployment role with
   scoped permissions. Restrict its trust to `mson-wagz/Afyaflow-AI` and the selected
   branch or protected GitHub environment. Personal contributor account names do
   not replace the repository owner in this trust policy.
4. Configure a `staging` GitHub environment, restricted to `main`, and its deployment
   variables, including the AWS region, role ARN, stack name, and SAM parameters.
   Keep database passwords in Secrets Manager. Do not upload AWS access keys.
5. Run and verify the first staging deployment, including migrations, exact browser
   origin configuration, frontend upload, and the end-to-end synthetic workflow.

Any Lambda deployment workflow should run only after successful CI for a push to `main`
(including a merged PR), and support manual dispatch. Pull requests and other
branches should run CI only. Deployment jobs need `id-token: write` for OIDC,
serialized deployment concurrency, and explicit migration error checks. Do not
cancel an active infrastructure deployment when a newer commit arrives.

Production promotion, if added, should use a separate environment and approval
policy. See `deploy/lambda/README.md` for the current staging architecture and
verification steps.
