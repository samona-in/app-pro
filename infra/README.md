# SAMONA AWS infrastructure

CDK app for the staging environment in `us-east-1` (account `072842665972`).

Supabase remains the identity provider: it issues and verifies phone OTPs and
signs access tokens. Everything else — the database, file storage, the API itself
— runs on AWS.

## Two stacks, and why the order matters

The ECS service cannot pull an image that does not exist, and the ECR repository
cannot exist until the first stack is deployed. That dependency is real, so it
is resolved by splitting the app in two rather than by hiding it.

| Stack | Contents |
| --- | --- |
| `SamonaStagingStack` | VPC, subnets, security groups, RDS, Redis, three S3 buckets, ECR, Secrets Manager, SSM parameters |
| `SamonaStagingServiceStack` | ALB, target group, ECS cluster, task definition, Fargate service, CloudWatch log group |

The split is also useful on its own: replacing the database is not entangled with
a routine service deploy.

Handoffs between them go through SSM, not CloudFormation exports. Exports are
cross-stack references, and removing one later deadlocks a deployment in
`UPDATE_ROLLBACK_FAILED` because the consumer still imports it. Reading a
parameter instead has no such coupling, and leaves the configuration readable:

```
aws ssm get-parameters-by-path --path /samona/staging --recursive
```

### Deploy sequence

```bash
cd infra
npm ci

# 1. Data plane. Creates the VPC, RDS, Redis, buckets and ECR repository.
npx cdk deploy SamonaStagingStack

# 2. Build and push the image to the ECR repository created in step 1.
#    This must be an arm64 image: the task definition targets Graviton.
#    repo=072842665972.dkr.ecr.us-east-1.amazonaws.com/samona-staging-server
#    docker build --platform linux/arm64 --target runtime -t "$repo:latest" \
#      -f ../server/Dockerfile ..
#    docker build --platform linux/arm64 --target migrate -t "$repo:migrate" ..
#    docker push "$repo:latest" && docker push "$repo:migrate"
#    (Braces are deliberate: zsh parses `$repo:tag` as a history expansion.)

# 3. Apply migrations as a one-off ECS task (see below).

# 4. Service plane.
npx cdk deploy SamonaStagingServiceStack
```

`SUPABASE_URL` is read from the repo's `.env` (the same file the server uses),
or overridden with `--context supabaseUrl=…` / the `SUPABASE_URL` environment
variable. It is not secret — it is the public project URL the auth client
itself uses — but it is not committed either.

Push-delivery credentials (`samona/staging/fcm` -> `FCM_PROJECT_ID` /
`FCM_CLIENT_EMAIL` / `FCM_PRIVATE_KEY`, `samona/staging/expo-token` ->
`EXPO_ACCESS_TOKEN`) live only in Secrets Manager, seeded once from the repo's
`.env`; the task definition references them by name so no value ever appears in
a template. `.env` itself stays local and gitignored.

### Migrations

Migrations are not run by the service. The `:migrate` image is the same
application plus the Prisma CLI, and its task definition is registered by the
service stack as an output. Run it once after each fresh database:

```bash
cd infra
npx cdk deploy SamonaStagingServiceStack | grep -o 'MigrateTaskDefinition = .*'   # the ARN

TASK=$(aws cloudformation describe-stacks --stack-name SamonaStagingServiceStack \
  --query "Stacks[0].Outputs[?OutputKey=='MigrateTaskDefinition'].OutputValue" \
  --output text --region us-east-1)
CLUSTER=$(aws ecs list-clusters --region us-east-1 --query 'clusterArns[]' --output text | tr '\t' '\n' | grep SamonaStagingServiceStack | head -1)
SG=$(aws ssm get-parameter --name /samona/staging/sg/task --query 'Parameter.Value' --output text --region us-east-1)
SUBNETS=$(aws ssm get-parameter --name /samona/staging/vpc/public-subnet-1 --query 'Parameter.Value' --output text --region us-east-1),$(aws ssm get-parameter --name /samona/staging/vpc/public-subnet-2 --query 'Parameter.Value' --output text --region us-east-1)
aws ecs run-task --cluster "$CLUSTER" --task-definition "$TASK" --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=ENABLED}" \
  --region us-east-1
```

The task composes `DATABASE_URL` the same way the service does, applies the
baseline, and stops. The service and the migration task trust the AWS RDS CA via
`NODE_EXTRA_CA_CERTS`, so a Node driver can verify RDS TLS where the built-in CA
list would not — the Prisma CLI connects either way because its native engine
does not go through Node's trust store.

## Decisions worth knowing before you edit this

**One ECS task, no autoscaling.** Socket.IO runs the in-memory adapter and
several `setInterval` schedulers. A second task would drop realtime events for
clients connected to the first and double-fire the schedulers. Scaling out
requires a Redis-backed Socket.IO adapter and an external scheduler first.

`minHealthyPercent: 0` is set so a rolling deploy never runs two tasks at once.
That trades a few seconds of downtime for the single-task invariant.

**The circuit breaker is not optional.** Without it, an image tag that was never
pushed leaves ECS retrying for up to three hours before the deployment fails.

**Public subnets for the task, no NAT.** The task gets a public IP and reaches
ECR, S3, Supabase and push providers through the internet gateway, while its
security group admits traffic only from the ALB. A NAT Gateway is ~$33/month plus
data charges, and ECR interface endpoints run ~$15/month each. Production should
move the task to private subnets and pay for NAT.

**The ALB serves HTTP.** No domain is attached yet, so there is no certificate to
issue. Nothing else about the stack depends on that; adding Route 53 and ACM is a
separate change.

**`RemovalPolicy.DESTROY` on stateful resources.** Staging data is disposable and
`cdk destroy` has to actually stop billing. Production must switch the database
and buckets to `RETAIN` — a stack delete that silently drops a database is not a
rollback plan.

## Known synth warning

`Application load balancer requires at least 2 subnets` is a false positive. The
subnet IDs come from SSM as an unresolved token, so CloudFormation's static
validator cannot count them. The data stack does create two public subnets;
confirm in the synthesised template:

```
node -e "const t=require('./cdk.out/SamonaStagingStack.template.json');
  console.log(Object.values(t.Resources).filter(r=>r.Type==='AWS::EC2::Subnet').length)"
```

For the same reason `cdk synth` does not run with `--strict`: that one warning
would fail the build permanently, and gating on it would train everyone to
ignore the check.