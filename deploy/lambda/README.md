# Lambda staging deployment

The refactor keeps the existing patient workflows, PostgreSQL schema, Bedrock orchestration, MCP tools, and human review. It adds Lambda entry points and a SAM template. Building and testing do not create AWS resources. This is a synthetic-data staging setup, not a clinically validated production deployment.

## Runtime

- React assets live in a private S3 bucket behind CloudFront origin access control.
- CloudFront forwards `/api/*` to API Gateway HTTP API and the NestJS API Lambda. API caching is disabled; cookies, Origin, Content-Type, and Idempotency-Key are forwarded.
- Registration, observation updates, and explicit assessment retries write an agent run and delivery outbox in the same PostgreSQL transaction.
- EventBridge invokes the dispatcher every minute to send up to 10 pending jobs to SQS. At light load this adds up to about a minute of dispatch latency; tune throughput if a backlog develops.
- SQS invokes the worker for one run at a time. Database leases and delivery generations protect against duplicate execution and messages from an earlier explicit retry.
- The migration Lambda has no HTTP route and is invoked explicitly by an operator. Synthetic seeding is disabled by default.

The API and worker reuse small PostgreSQL pools across warm invocations. The database secret is fetched at cold start before configuration modules load. After rotating database credentials or the CloudFront origin token, update/recycle functions to refresh cached values and coordinate the CloudFront configuration update.

## Prerequisites

Install Node dependencies, Docker, AWS CLI, and AWS SAM CLI. Docker must be running for the image build:

```sh
npm ci
npm ci --prefix src/frontend
npm test
npm run build:backend
npm run build --prefix src/frontend
```

The SAM template uses existing network and database resources; it does not provision RDS, networking, or VPC endpoints:

1. A VPC, at least two subnets in different availability zones, and a private RDS PostgreSQL database or proxy. Disable database public access.
2. A Lambda security group. Permit database port 5432 only from that group, and HTTPS to the interface endpoints.
3. Connectivity to Secrets Manager, SQS, and Bedrock Runtime. Without NAT, use interface VPC endpoints with private DNS enabled for these services. Endpoints have hourly and data charges. A public subnet alone does not give standard Lambda functions internet access.
4. Deployment permissions for CloudFormation, ECR, and the resources in this template. Runtime function roles are scoped separately; the API has no Bedrock or queue-publishing permission.
5. Access to the selected Bedrock model/profile. For the default European Nova Lite profile, supply the relevant profile and destination-region model ARNs in `BedrockResourceArns`. IAM, endpoint policies, and SCPs must permit the profile's destination regions.

Create a Secrets Manager JSON secret using the console or a protected local file. Do not put credentials in Git or shell history:

```json
{
  "host": "your-private-rds-endpoint",
  "port": 5432,
  "dbname": "afyaflow",
  "username": "your-database-user",
  "password": "your-generated-password",
  "cloudfrontOriginToken": "a-random-token-of-at-least-32-ASCII-characters"
}
```

Generate the origin token cryptographically. CloudFront injects it into API origin requests; the API validates it before trusting CloudFront's viewer address for shared login rate limiting. Direct API Gateway requests without it receive 403. Restrict access to both the secret and CloudFront configuration.

Alternatively, the secret can contain `DATABASE_URL` and `cloudfrontOriginToken`. `DatabaseHost` overrides `host` only in the structured format, useful with RDS Proxy. Supply `SecretKmsKeyArn` if the secret uses a customer-managed KMS key. The image includes the RDS global CA bundle and enables TLS certificate verification.

## Build and deploy

From the repository root:

```sh
sam validate --lint --template-file deploy/lambda/template.yaml
sam build --template-file deploy/lambda/template.yaml
sam deploy --guided --resolve-image-repos
```

Use a staging stack such as `afyaflow-staging`. Enter the subnet IDs, security group IDs, secret ARN, model resource ARNs, and browser origin. Keep concurrency low and size it against the database connection limit. SAM requests IAM capability acknowledgement because it creates execution roles. Review the change set before deployment.

For the first deploy use `https://pending.invalid` for `AppOrigin`. Read the `WebsiteUrl` output, then deploy again with `AppOrigin` set to that exact HTTPS URL without a trailing slash. This avoids a dependency cycle between CloudFront and the API configuration. Browser mutations intentionally fail until the actual origin is configured.

Read stack outputs without exposing credentials:

```sh
aws cloudformation describe-stacks --stack-name afyaflow-staging --query 'Stacks[0].Outputs'
```

Invoke `MigrationFunctionName` before using the app:

```sh
aws lambda invoke --function-name YOUR_MIGRATION_FUNCTION --payload '{}' --cli-binary-format raw-in-base64-out migration-result.json
```

Check the invocation metadata for `FunctionError` and inspect the result file: the CLI can succeed even when the function fails.

For a synthetic demo only, deploy with `AllowSyntheticSeed=true`, then invoke:

```sh
aws lambda invoke --function-name YOUR_MIGRATION_FUNCTION --payload '{"seedSynthetic":true}' --cli-binary-format raw-in-base64-out migration-result.json
```

Disable that parameter afterward. Demo PINs are documented in the backend guide and must not protect real patient data. For a non-demo environment, provision staff and departments through an approved process instead of synthetic seeding.

Upload the frontend using the bucket and distribution IDs from the outputs:

```sh
npm run build --prefix src/frontend
aws s3 sync src/frontend/dist s3://YOUR_FRONTEND_BUCKET
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths '/*'
```

The browser continues using same-origin `/api`, with no AWS keys or new API URL. Keep API Gateway request body logging disabled and restrict trace/log access.

## Verification and failure handling

Visit `WebsiteUrl/api/health`, sign in, register a synthetic patient, wait for dispatch, inspect the actual agent trace, approve as a clinician, and route the visit. Check clerk denial, session locking/logout, measurement validation, and offline registration replay. Confirm the direct API URL cannot bypass the origin check.

Automated tests use real PostgreSQL and MCP with a model test double. They verify API Gateway v2 cookie translation, shared throttling, partial SQS failures, outbox rollback, duplicate delivery, old retry generations, lease expiry, and saved-proposal recovery. They do not establish working AWS networking, IAM, or Lambda container execution; verify those in staging.

- Queue send or transaction failures leave the outbox available for retry. If SQS accepts a message but the database acknowledgement fails, duplicate delivery is safe.
- An active lease causes the SQS record to be retried. The queue visibility timeout is 1080 seconds, six times the worker's 180-second timeout.
- A crash after proposal persistence is recovered without another model call. Human approval remains separate.
- Caught model/tool failures mark the run failed for staff review. Explicit retry increments its delivery generation; old messages are ignored.
- Initialization/database failures and invalid messages retry through SQS and eventually reach the DLQ. After fixing their cause, redrive messages through SQS.
- The template creates DLQ and dispatcher-error alarms but no email/SNS subscription. Connect these alarm states to your operations notification channel.

Outbox and clinical history are retained; define a retention/archive policy before production. Do not log secrets, cookies, request bodies, or patient evidence as general operational errors.

## Local development

Apply the new migration before restarting the updated backend:

```sh
npm run db:migrate
npm run dev:backend
npm run dev --prefix src/frontend
```

The local polling worker uses the same leased job processor. Lambda disables that timer automatically. Do not run a local polling worker against the deployed database.

Before production, strengthen development PIN authentication, scope database roles, configure credential rotation and alarm notifications, test backups/restores, and measure availability, capacity, and costs. RDS Proxy and Step Functions are optional further choices, not automatic dependencies of this bounded staging workflow.

## AWS references

- [Lambda container images](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html)
- [SQS event configuration](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html)
- [Bedrock interface endpoints](https://docs.aws.amazon.com/bedrock/latest/userguide/vpc-interface-endpoints.html)
- [Lambda VPC internet access](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html)
- [CloudFront custom origin headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html)
- [CloudFront viewer address headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-cloudfront-headers.html)
