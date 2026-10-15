# Low-cost EC2 staging

This option runs the existing app, local polling agent worker, PostgreSQL, and
Caddy HTTPS proxy on one `t4g.small` ARM instance in `eu-west-1`. It uses the
existing multi-stage `Dockerfile`; the frontend is served by NestJS. PostgreSQL
and port 3000 have no public listeners. Only HTTP/HTTPS are open; administration
and deployment use Systems Manager, with no public SSH.

This is for light synthetic demonstrations. Updates briefly interrupt requests.
One server is a single point of failure, and PostgreSQL is self-managed.
The Lambda/SAM option remains available under `deploy/lambda`.

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

The pipeline separately verifies the HTTPS API health endpoint. Certificate or
external-network failures fail the job even if the containers are healthy; inspect
the current deployment before retrying. Database migrations are never automatically
reversed. Manual recovery may require the pre-migration dump.

Synthetic seeding is disabled by default. To create public demonstration accounts,
an operator must explicitly invoke the release with `SEED_SYNTHETIC=true` or run
the existing seed command with its production override. Never seed real data.
Then verify sign-in, registration, a real Bedrock proposal, human approval, queue,
and routing. Health checks alone do not verify these workflows.

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

## OpenAI inference (optional)

Set `AI_PROVIDER=openai` and `OPENAI_MODEL=gpt-4.1-mini` in the host's
root-owned `/opt/afyaflow/provider.env`. Default is Bedrock; there is no automatic
fallback. Store the OpenAI key as a Standard SSM SecureString parameter named
`/afyaflow/staging/openai-api-key` in the deployment region. Supply it through a
private local file or the AWS console, never a command argument, GitHub variable,
or SSM Run Command payload. The existing managed SSM instance policy allows
parameter retrieval. The default AWS-managed SSM KMS key is used.

On each release, the host fetches the key into a file readable only by the
container's Node user (UID 1000), then mounts the directory read-only. No key is
included in the image or browser bundle. The successful release configuration is
restored if application startup fails. Rotating the SSM value takes effect on
the next release. The key is never required for Bedrock runs.

New runs persist provider and model; already queued runs keep their selection.
Responses API requests use `store:false`; tool context is retained only within
the active run. OpenAI inference is billed separately from AWS. This remains a
synthetic demonstration with an unvalidated protocol and human approval gate.
The Lambda template retains its Bedrock defaults; this secret mount is EC2-only.
