# Low-cost EC2 staging

This option runs the existing app, local polling agent worker, PostgreSQL, and
Caddy HTTPS proxy on one `t4g.small` ARM instance in `eu-west-1`. It uses the
existing multi-stage `Dockerfile`; the frontend is served by NestJS. PostgreSQL
and port 3000 have no public listeners. Only HTTP/HTTPS are open; administration
and deployment use Systems Manager, with no public SSH.

This is for light synthetic demonstrations. Updates briefly interrupt requests.
One server is a single point of failure, and PostgreSQL is self-managed.
The Lambda/SAM option remains available under `deploy/lambda`.

The image also bundles the open MIMIC-IV-ED Demo v2.2 research data and licence.
Each release runs the idempotent historical import after the new API is healthy, without
queuing AI calls. It preserves existing synthetic records and saved reviews.
Historical cases are visible in their own read-only research area. See
[data sources and transformations](../../docs/DATA_SOURCES.md) and the
[user guide](../../docs/USER_GUIDE.md#historical-research-cases).

## Cost basis

On 15 October 2026 the AWS Price List API returned `$0.0184/hour` for a Linux
`t4g.small` in Ireland, or approximately `$13.43` for 730 hours. Allow roughly
another `$6/month` for a public IPv4 address and 20 GB gp3 disk, then Bedrock,
image storage, any excess data transfer, and tax. Budget approximately `$20/month`
before inference rather than assuming free-tier eligibility.

AWS advertises a t4g.small trial of up to 750 hours/month through 31 December 2026:
https://aws.amazon.com/ec2/instance-types/t4/
If applicable to the account, compute could be covered temporarily, leaving
approximately `$6/month` plus the variable items above. The free-tier usage API
did not establish this account's trial entitlement. CPU credits use standard mode
to avoid surplus CPU-credit charges. Sustained load can therefore be throttled.

## Provisioning

Review `template.yaml`. It creates a dedicated VPC/subnet, internet gateway,
security group, encrypted root disk, automatically assigned public IP, ECR repository, EC2 runtime
role, GitHub OIDC provider, and a deployment role. It creates no NAT gateway,
load balancer, RDS database, or interface endpoints.

If the account already has `token.actions.githubusercontent.com`, pass its ARN
using `ExistingGithubOidcProviderArn`; do not create another provider.

```sh
aws cloudformation deploy --region eu-west-1 --stack-name afyaflow-staging \
  --template-file deploy/ec2/template.yaml --capabilities CAPABILITY_IAM
aws cloudformation describe-stacks --region eu-west-1 --stack-name afyaflow-staging \
  --query 'Stacks[0].Outputs'
```

CloudFormation success does not establish bootstrap success. User data installs
Docker/Compose, verifies the Compose binary checksum, configures encrypted-disk
swap, and writes a readiness marker. The deployment command waits for this marker.
Check cloud-init and SSM if initial provisioning fails. Allow several minutes for
SSM registration before starting the first deployment.

## GitHub setup

Use repository Actions **variables**, not AWS key secrets:

- `AWS_DEPLOY_ROLE_ARN`: the `GithubDeployRoleArn` stack output. Setting this enables
  the staging deployment job for subsequent pushes to `main`.
- `AWS_STACK_NAME`: `afyaflow-staging` (the default).
- `APP_DOMAIN`: an optional hostname whose A record points to the `PublicIp` output.
  When omitted, deployment uses `<PublicIp>.sslip.io`, a third-party temporary demo
  DNS name. HTTPS certificate issuance and public DNS must succeed.

The trust policy accepts only `mson-wagz/Afyaflow-AI` on `refs/heads/main`, using
the repository's immutable subject prefix
`repo:mson-wagz@168073760/Afyaflow-AI@1416879118`. Verify the exact prefix with
GitHub's `GET /repos/mson-wagz/Afyaflow-AI/actions/oidc/customization/sub` API;
newer repositories include permanent owner/repository IDs in OIDC subjects.
Protect that branch and require both CI checks. Do not add a GitHub `environment`
to the deployment job without updating its OIDC subject and protection settings.
No personal AWS access keys are stored in GitHub or on the server. The instance
role allows Nova Lite inference and read access to this repository's images;
the deployment role can publish images and run commands on this instance only.
Administrators can manage the host through its standard SSM role.

## Release and verification

After tests, builds, SAM validation, and EC2 template validation pass, a push to
`main` builds the complete app on an ARM GitHub runner and publishes an immutable
commit/run tag. `scripts/deploy-ec2.py` transfers only the three reviewed deployment
files through SSM and invokes `release.sh`. That script:

1. Locks releases and creates or reuses a root-only random database password.
2. Pulls images, starts PostgreSQL, and writes a local database dump.
3. Applies transactional migrations, then replaces the app/proxy containers.
4. Waits for container health and attempts the previous app image on health failure.
5. Keeps the successful configuration and removes old local images/backups.

Sign-in throttling needs each visitor's real address. Caddy overwrites the
`X-AfyaFlow-Client-IP` header with the connecting address, and `TRUST_PROXY_CLIENT_IP=true`
tells the app to throttle by it instead of Caddy's container address. Keep the app
container's port unpublished: if port 3000 were reachable directly, a client could set
that header itself. Sign-in and unlock requests without a valid header are rejected.

The app sets browser security headers on every response
(`src/backend/src/security-headers.ts`): HSTS for one year (production only),
`X-Frame-Options: DENY`, `nosniff`, a strict referrer policy, a
`Permissions-Policy` that allows only the microphone on this origin, and
`Cache-Control: no-store` on all API responses so patient data is not cached. The
Content-Security-Policy is sent as `Content-Security-Policy-Report-Only` until
enforcement is confirmed safe: open the site, sign in, use registration including
voice intake, and check the browser console for CSP violation reports. If there are
none, add `CSP_MODE: enforce` to the app's `environment` in `compose.yaml` and release.

The pipeline separately verifies the HTTPS API health endpoint. Certificate or
external-network failures fail the job even if the containers are healthy; inspect
the current deployment before retrying. Database migrations are never automatically
reversed. Manual recovery may require the pre-migration dump.

Synthetic seeding is disabled by default. To create the synthetic staff accounts and
records, an operator must explicitly invoke the release with `SEED_SYNTHETIC=true` or
run the existing seed command with its production override. Seeded accounts cannot
sign in until an operator issues PINs (below). Never seed real data. Then verify
sign-in, registration, a real Bedrock proposal, human approval, queue, and routing.
Health checks alone do not verify these workflows.

## Staff accounts and PINs

No PINs are published. Staff PINs are six digits; accounts created by the production
seed, and any account whose PIN predates six-digit PINs, cannot sign in until a PIN
is issued. Issue PINs on the host through Systems Manager Session Manager (AWS
Console → EC2 → the instance → Connect → Session Manager):

```sh
sudo -i
cd /opt/afyaflow
admin() { docker compose --env-file .env --project-name afyaflow exec -T app \
  node dist/src/backend/src/admin/staff-admin.js "$@"; }
admin list                    # staff IDs, numbers, roles, names
admin reset-pin STAFF-102     # prints a new PIN once and ends that person's sessions
```

Give each PIN to its owner privately (not by email or chat history). The PIN is stored
only as a salted hash and the `STAFF_PIN_RESET` audit event never contains it. Close
the session window afterwards so the PIN is not left on screen.

## Persistence and cleanup

Database and TLS state use named Docker volumes on the encrypted root disk.
Releases never run `docker compose down --volumes`. Backups are local dumps retained
for seven days; they do not protect against loss of the disk or server account.
Add off-host backups before keeping valuable data. No production recovery promise
is implied by this demo configuration.

The root disk, ECR repository, and OIDC provider are deliberately retained when
the stack/instance is deleted or replaced. Retained disks/images still incur
charges; review and remove them explicitly when no longer needed. Replacing the
instance does not automatically attach or restore the old database disk. Stopping
the instance stops compute billing, but its disk and allocated public IP remain
billable if retained separately. This template uses an automatic public IP, which
is released on stop/termination and changes on stop/start; update the domain A
record after restarting a stopped instance. Routine application releases do not
change the IP. The OIDC provider can be shared, so do not delete it without checking
other repositories.

## Bedrock inference

Staging inference is pinned to Amazon Bedrock in `compose.yaml`
(`AI_PROVIDER: bedrock`, `BEDROCK_MODEL_ID: eu.amazon.nova-lite-v1:0`). Changing the
provider therefore requires a reviewed commit; the host's
`/opt/afyaflow/provider.env` is ignored. The app container uses the EC2 instance
role through IMDSv2 (hop limit 2), whose `bedrock:InvokeModel` grant covers only
Nova Lite and its EU inference profile. No API key is fetched, stored or mounted.

Every release checks that `/api/health` reports `"agentProvider":"bedrock"`, so a
release on any other provider fails the pipeline. To confirm actual use, check
CloudWatch metrics under `AWS/Bedrock` (`Invocations` for the model ID) after an
assessment, and the provider and model recorded on each agent run. Bedrock usage
is billed to the AWS account. This remains a synthetic demonstration with an
unvalidated protocol and human approval gate.

The application code still supports OpenAI and local Ollama for development and
competition runs; only this EC2 deployment is pinned. Releases remove the host
copy of the previously used OpenAI key. Delete the SSM parameter
`/afyaflow/staging/openai-api-key` and revoke the key at OpenAI once no longer needed.
