#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SamonaServiceStack } from '../lib/service-stack.js';
import { SamonaStagingStack } from '../lib/staging-stack.js';

const app = new cdk.App();

/**
 * Explicit account and region. CDK otherwise resolves them from the ambient
 * credentials, which silently deploys to whichever account happens to be logged
 * in — the failure nobody notices until a resource exists in the wrong place.
 * Both live in cdk.json rather than the environment so a deploy is reproducible
 * from a fresh clone.
 */
const account = (app.node.tryGetContext('samona:account') as string | undefined) ?? '072842665972';
const region = (app.node.tryGetContext('samona:region') as string | undefined) ?? 'us-east-1';
const stage = (app.node.tryGetContext('samona:stage') as string | undefined) ?? 'staging';

/**
 * SUPABASE_URL is not in the template because it lives in .env and is project
 * specific. Pass it at deploy time:
 *
 *   npm run deploy -- --context supabaseUrl=https://<project>.supabase.co
 *
 * It is not secret — it is the public project URL, printed by the auth client
 * itself — so context is the right channel, and it keeps the value out of the
 * template and out of a committed defaults file.
 */
const supabaseUrl = (app.node.tryGetContext('supabaseUrl') as string | undefined) ?? '';
const corsOrigins = (app.node.tryGetContext('corsOrigins') as string | undefined) ?? '';

const env = { account, region };
const tags = { Project: 'samona', Environment: stage, ManagedBy: 'cdk' };

const data = new SamonaStagingStack(app, `Samona${capitalize(stage)}Stack`, {
  env,
  stage,
  description: 'SAMONA staging data plane: VPC, RDS, Redis, S3, ECR, secrets',
  tags,
});

const service = new SamonaServiceStack(app, `Samona${capitalize(stage)}ServiceStack`, {
  env,
  stage,
  supabaseUrl,
  corsOrigins,
  description: 'SAMONA staging service plane: ALB, ECS Fargate, API task',
  tags,
});

// The service stack reads the data stack's SSM parameters. An SSM read does not
// create a CloudFormation dependency on its own, so the ordering is stated here —
// otherwise the service can start deploying before the VPC and database exist.
service.node.addDependency(data);

/**
 * Three warnings that describe artefacts of splitting the stacks, not defects.
 * Acknowledged at app scope because each is raised against a resource rather
 * than against the stack, and `cdk synth --strict` is what keeps new ones from
 * appearing unnoticed.
 */
const acknowledged: Readonly<Record<string, string>> = {
  '@aws-cdk/aws-ec2:noSubnetRouteTableId':
    "Service stack imports subnets from the data stack's VPC, which owns their route tables.",
  '@aws-cdk/aws-ec2:vpcAttributeIsListTokenavailabilityZones':
    'The AZ list is never read: every subnet this stack places is named explicitly.',
  'CloudFormation-Validate::E3680':
    'ALB subnet IDs arrive from SSM as tokens; the data stack provisions two public subnets.',
};

for (const [id, reason] of Object.entries(acknowledged)) {
  cdk.Annotations.of(app).acknowledgeWarning(id, reason);
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}
