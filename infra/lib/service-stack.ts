import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface SamonaServiceStackProps extends StackProps {
  readonly stage: string;
  readonly supabaseUrl: string;
  readonly corsOrigins: string;
}

/**
 * Service plane: the ALB, the ECS cluster, and the API itself.
 *
 * The load balancer lives here rather than in the data stack because attaching
 * an ECS service to a target group needs both constructs in one template. An
 * imported target group cannot register a listener, so splitting them would mean
 * hand-assembling CfnListenerRules — a lot of template surface for no benefit.
 *
 * Deploy order matters: the data stack must exist, the image must then be built
 * and pushed to the ECR repository that stack created, and only then can this
 * stack deploy. A tag that has not been pushed leaves ECS unable to start the
 * task, and CloudFormation rolls the whole stack back waiting for it.
 */
export class SamonaServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: SamonaServiceStackProps) {
    super(scope, id, props);
    const { stage, supabaseUrl, corsOrigins } = props;
    const paramName = (key: string) => `/samona/${stage}/${key}`;
    // The scope is required: each read is an imported-parameter construct, which
    // is what gives CloudFormation a dependency to order on.
    const read = (key: string) => ssm.StringParameter.valueForStringParameter(this, paramName(key));

    if (supabaseUrl.trim().length === 0) {
      throw new Error(
        'SUPABASE_URL is required — deploy with --context supabaseUrl=https://<project>.supabase.co. ' +
          "The API verifies Supabase access tokens against this project's JWKS, so it cannot serve traffic without it.",
      );
    }

    // --- Network, read from the data stack ----------------------------------
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'Vpc', {
      vpcId: read('vpc/id'),
      // Vpc.fromVpcAttributes demands an AZ list, but every subnet this stack
      // places is named explicitly, so nothing ever reads it. The region's AZs
      // are an adequate stand-in for a field that is never consulted; publishing
      // the real list to SSM only to leave it unreferenced is worse.
      availabilityZones: cdk.Fn.getAzs(),
      publicSubnetIds: read('vpc/public-subnets').split(','),
    });

    // An imported VPC carries no route-table IDs, so selecting by subnetType cannot
    // resolve routes. Naming the subnets explicitly is quieter and more precise.
    // The length is asserted at deploy time by the ALB health check rather than
    // here: at synth the SSM value is still an unresolved token, so splitting it
    // yields one element no matter how many subnets the data stack created.
    const subnetIds = read('vpc/public-subnets').split(',');
    const publicSubnets = subnetIds.map((id, index) =>
      ec2.Subnet.fromSubnetId(this, `PublicSubnet${index}`, id),
    );

    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

    const logGroup = new logs.LogGroup(this, 'ApiLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- Task definition ----------------------------------------------------
    // The task and execution roles are created by the task definition itself;
    // aws-cdk-lib no longer exports TaskRole/ExecutionRole classes.
    const repositoryUri = read('ecr/repository-uri');

    const definition = new ecs.FargateTaskDefinition(this, 'ApiTask', {
      cpu: 512,
      memoryLimitMiB: 1024,
      // Graviton. Cheaper than x86 at the same size, and the image is built on an
      // arm64 machine so the layers match. An image pushed from an x86 host would
      // not start here — that is the failure to watch for on the push step.
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    definition.addContainer('Api', {
      image: ecs.ContainerImage.fromRegistry(`${repositoryUri}:latest`),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'api', logGroup }),
      environment: {
        NODE_ENV: 'production',
        PORT: '4000',
        LOG_LEVEL: 'info',
        DB_HOST: read('db/host'),
        DB_PORT: read('db/port'),
        DB_NAME: read('db/name'),
        DB_USER: read('db/username'),
        REDIS_HOST: read('redis/host'),
        REDIS_PORT: read('redis/port'),
        S3_REGION: read('s3/region'),
        S3_BUCKET_SELFIES: read('s3/bucket-selfies'),
        S3_BUCKET_JOB_IMAGES: read('s3/bucket-job-images'),
        S3_BUCKET_AVATARS: read('s3/bucket-avatars'),
        SUPABASE_URL: supabaseUrl,
        CORS_ORIGINS: corsOrigins,
      },
      secrets: {
        // RDS stores its master password as {"username":…,"password":…}. The
        // entrypoint assembles DATABASE_URL from both fields, so the complete
        // connection string never exists anywhere except in a process's memory.
        DB_SECRET: ecs.Secret.fromSecretsManager(
          secretsmanager.Secret.fromSecretNameV2(this, 'DbSecret', read('db/secret-name')),
        ),
        REDIS_AUTH_TOKEN: ecs.Secret.fromSecretsManager(
          secretsmanager.Secret.fromSecretNameV2(this, 'RedisSecret', read('redis/secret-name')),
        ),
        JOB_OFFER_SECRET: ecs.Secret.fromSecretsManager(
          secretsmanager.Secret.fromSecretNameV2(
            this,
            'JobOfferSecret',
            read('job-offer/secret-name'),
          ),
        ),
      },
      healthCheck: {
        command: [
          'CMD',
          'node',
          '-e',
          "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
        ],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        // Long enough for Prisma to connect and the first route to answer; the
        // task would otherwise be killed during a cold start.
        startPeriod: Duration.seconds(40),
      },
      portMappings: [{ containerPort: 4000, protocol: ecs.Protocol.TCP }],
    });

    // The execution role is created lazily, when the container declares its
    // secrets and log driver, so the ECR pull grant has to be added here rather
    // than right after the task definition. The repository URI comes from SSM
    // instead of an imported construct, so the grant is written by hand.
    definition.executionRole!.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'ecr:BatchGetImage',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchCheckLayerAvailability',
        ],
        resources: [`${repositoryUri}/*`],
      }),
    );

    // --- Load balancer ------------------------------------------------------
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnets: publicSubnets },
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'ApiTargets', {
      vpc,
      port: 4000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      deregistrationDelay: Duration.seconds(10),
      healthCheck: {
        path: '/api/v1/health',
        healthyHttpCodes: '200',
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // The listener forwards to the target group, which is what gives the group a
    // load balancer; attaching the service afterwards registers the task's IP.
    alb.addListener('Http', {
      port: 80,
      defaultAction: elbv2.ListenerAction.forward([targetGroup]),
    });

    // --- Service ------------------------------------------------------------
    const service = new ecs.FargateService(this, 'ApiService', {
      cluster,
      taskDefinition: definition,
      // Exactly one task, deliberately. Socket.IO runs the in-memory adapter and
      // several setInterval schedulers: a second task would drop realtime events
      // for clients connected to the first, and double-fire the schedulers.
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [ec2.SecurityGroup.fromSecurityGroupId(this, 'TaskSgRef', read('sg/task'))],
      vpcSubnets: { subnets: publicSubnets },
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      circuitBreaker: { rollback: true },
    });

    service.attachToApplicationTargetGroup(targetGroup);

    new CfnOutput(this, 'AlbDnsName', {
      value: alb.loadBalancerDnsName,
      description: 'ALB endpoint — the HTTP API base URL until the domain is attached',
    });
  }
}
