#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
 * SUPABASE_URL is what the API verifies access tokens against, so the service
 * stack cannot be synthesised without it. It is resolved in order:
 *
 *   1. --context supabaseUrl=… (highest precedence, for CI or an override)
 *   2. SUPABASE_URL from the environment
 *   3. the repo's own .env, which is where the server reads it from
 *
 * Reading .env rather than demanding a flag is deliberate: requiring a context
 * value for every command would make `cdk list`, `diff` and even `bootstrap`
 * fail, which is exactly the friction that gets routed around. The value is not
 * secret — it is the public project URL the auth client itself prints — but it
 * is not committed either; it belongs to the local .env like the rest.
 */
const supabaseUrl =
  firstString([
    app.node.tryGetContext('supabaseUrl') as string | undefined,
    process.env.SUPABASE_URL,
    dotenvValue('SUPABASE_URL'),
  ]) ?? '';
const corsOrigins =
  firstString([
    app.node.tryGetContext('corsOrigins') as string | undefined,
    process.env.CORS_ORIGINS,
    dotenvValue('CORS_ORIGINS'),
  ]) ?? '';

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

/** First candidate that is a non-empty string, or undefined. */
function firstString(candidates: readonly (string | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate.trim().length > 0) return candidate.trim();
  }
  return undefined;
}

/**
 * Minimal `.env` reader — deliberately not a dependency. It exists so the
 * infra app reads SUPABASE_URL from the same file the server does, rather than
 * asking the operator to type it twice. Only the simple `KEY=value` and
 * `KEY="value"` forms are supported; that is all this repo's .env uses.
 */
function dotenvValue(key: string): string | undefined {
  let contents: string;
  try {
    contents = readFileSync(join(__dirname, '..', '..', '.env'), 'utf8');
  } catch {
    return undefined;
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match === null) continue;
    if (match[1] !== key) continue;
    const value = match[2]!.trim().replace(/^(["'])(.*)\1$/, '$2');
    return value.trim().length > 0 ? value : undefined;
  }
  return undefined;
}
