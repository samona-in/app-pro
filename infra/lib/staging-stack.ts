import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface SamonaStagingStackProps extends StackProps {
  readonly stage: string;
}

/**
 * Data plane: everything that outlives a deploy of the service.
 *
 * Deliberately no ECS and no ALB here. The service cannot start until its image
 * is in ECR, and the ECR repository cannot exist until this stack is deployed —
 * so the image is built and pushed between the two stacks. Splitting here also
 * keeps VPC, database and cache replacements out of the blast radius of a
 * routine service deploy.
 *
 * Nothing is handed to the service stack as a CloudFormation export. Exports
 * become the cross-stack references that make a later refactor undeployable:
 * removing one deadlocks the stack in UPDATE_ROLLBACK_FAILED because the
 * consumer still imports it. The service stack reads SSM instead, which costs
 * nothing at runtime and gives an operator a readable config surface via
 * `aws ssm get-parameters-by-path`.
 */
export class SamonaStagingStack extends Stack {
  constructor(scope: Construct, id: string, props: SamonaStagingStackProps) {
    super(scope, id, props);
    const { stage } = props;
    const paramName = (key: string) => `/samona/${stage}/${key}`;

    const publish = (key: string, value: string): ssm.StringParameter =>
      new ssm.StringParameter(this, `Param${key.replace(/[^A-Za-z0-9]/g, '')}`, {
        parameterName: paramName(key),
        stringValue: value,
      });

    // --- Network ------------------------------------------------------------
    // No NAT Gateway, deliberately: it is ~$33/month plus data charges to give
    // private subnets outbound internet, and nothing here needs one. RDS and
    // Redis sit in isolated subnets with no route anywhere.
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // The task lives in public subnets with a public IP and reaches the internet
    // through the IGW. Its security group admits nothing from the internet — only
    // the ALB — so the public address buys egress (ECR, S3, Supabase JWKS, push)
    // without exposing the container. The alternative is private subnets plus
    // NAT or interface endpoints, and endpoints for ECR alone run ~$15/month
    // each. Staging pays $0 for the public-subnet approach; production should
    // move the task private and pay for NAT.
    const taskSg = new ec2.SecurityGroup(this, 'TaskSg', {
      vpc,
      description: 'ECS task: admits the ALB only',
      allowAllOutbound: true,
    });

    const dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc,
      description: 'RDS: admits the ECS task only',
      allowAllOutbound: false,
    });
    dbSg.addIngressRule(taskSg, ec2.Port.tcp(5432), 'PostgreSQL from task');

    const cacheSg = new ec2.SecurityGroup(this, 'CacheSg', {
      vpc,
      description: 'Redis: admits the ECS task only',
      allowAllOutbound: false,
    });
    cacheSg.addIngressRule(taskSg, ec2.Port.tcp(6379), 'Redis TLS from task');

    // --- Secrets ------------------------------------------------------------
    // RDS owns its master password (Credentials.fromGeneratedSecret), so no
    // password is ever written into the template, a state file, or a variable.
    const redisAuth = new secretsmanager.Secret(this, 'RedisAuth', {
      secretName: `samona/${stage}/redis/auth`,
      // excludePunctuation keeps the token URL-safe, so the entrypoint can put it
      // in a rediss:// URL without escaping. The RDS password has no such
      // guarantee and is escaped properly instead.
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const jobOfferSecret = new secretsmanager.Secret(this, 'JobOfferSecret', {
      secretName: `samona/${stage}/job-offer`,
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- Database -----------------------------------------------------------
    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_4,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      credentials: rds.Credentials.fromGeneratedSecret('samona_admin'),
      databaseName: 'samona',
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      multiAz: false,
      publiclyAccessible: false,
      autoMinorVersionUpgrade: true,
      cloudwatchLogsExports: ['postgresql', 'upgrade'],
      // Staging data is disposable and `cdk destroy` has to actually stop
      // billing. Production must switch this to RETAIN — a stack delete that
      // silently drops the database is not a rollback plan.
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- Cache --------------------------------------------------------------
    // L1 because the L2 cluster does not expose transit encryption or an auth
    // token, and this Redis holds Socket.IO adapter state and job-offer data.
    const cache = new elasticache.CfnReplicationGroup(this, 'Cache', {
      replicationGroupId: `samona-${stage}-redis`,
      replicationGroupDescription: 'SAMONA Redis: Socket.IO adapter, rate limits, job offers',
      engine: 'redis',
      engineVersion: '7.1',
      cacheNodeType: 'cache.t4g.micro',
      numCacheClusters: 1,
      automaticFailoverEnabled: false,
      multiAzEnabled: false,
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      transitEncryptionMode: 'required',
      authToken: redisAuth.secretValue.unsafeUnwrap(),
      port: 6379,
      cacheSubnetGroupName: new elasticache.CfnSubnetGroup(this, 'CacheSubnets', {
        description: 'SAMONA Redis subnets',
        subnetIds: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
      }).ref,
      securityGroupIds: [cacheSg.securityGroupId],
    });

    // The auth token is a CloudFormation dynamic reference, which does not imply
    // a resource dependency. Without this the replication group can be created
    // before the secret exists and the deploy fails on an unresolvable reference.
    cache.node.addDependency(redisAuth);

    // --- Object storage -----------------------------------------------------
    // Public base URLs per bucket are configured independently on the service
    // (S3_PUBLIC_URL_*) so one bucket can move behind CloudFront alone.
    const bucket = (id: string, suffix: string) =>
      new s3.Bucket(this, `Bucket${id}`, {
        bucketName: `samona-${stage}-${suffix}-072842665972`,
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        enforceSSL: true,
        versioned: false,
        removalPolicy: RemovalPolicy.DESTROY,
        // Non-empty buckets survive `cdk destroy` unless objects are deleted
        // first; this makes teardown actually complete.
        autoDeleteObjects: true,
      });

    const selfies = bucket('Selfies', 'selfies');
    const jobImages = bucket('JobImages', 'job-images');
    const avatars = bucket('Avatars', 'avatars');
    // Private by design: documents carry identity and bank details, so no
    // public base URL is ever configured for this bucket and reads go through
    // short-lived presigned URLs minted by the API. BLOCK_ALL (above) is what
    // makes that a guarantee rather than a convention.
    const documents = bucket('Documents', 'documents');

    // --- Image registry -----------------------------------------------------
    const repository = new ecr.Repository(this, 'Repository', {
      // Slashes are not legal in ECR repository names.
      repositoryName: `samona-${stage}-server`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      encryption: ecr.RepositoryEncryption.AES_256,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    // --- Hand-off to the service stack -------------------------------------
    publish('vpc/id', vpc.vpcId);
    // One parameter per subnet, not one comma-joined value. The SSM read is an
    // unresolved token inside the service stack, so splitting a joined value
    // there yields a single element holding the whole list — which is how the
    // ALB once received "subnet-a,subnet-b" and CloudFormation rejected it.
    // Each subnet as its own parameter resolves to a real ID instead.
    const publicSubnetIds = vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }).subnetIds;
    publicSubnetIds.forEach((subnetId, index) =>
      publish(`vpc/public-subnet-${index + 1}`, subnetId),
    );
    publish('sg/task', taskSg.securityGroupId);

    publish('db/host', database.dbInstanceEndpointAddress);
    publish('db/port', `${database.dbInstanceEndpointPort}`);
    publish('db/name', 'samona');
    publish('db/username', 'samona_admin');
    publish('db/secret-name', database.secret!.secretName);

    // Primary end point addresses are a single string. The read-endpoints
    // attribute is a CloudFormation list, which resolves with literal square
    // brackets around the host — `[host]` is not a host to `new URL()`, and
    // ioredis throws before it can connect.
    publish('redis/host', cache.attrPrimaryEndPointAddress);
    publish('redis/port', '6379');
    publish('redis/secret-name', redisAuth.secretName);

    publish('job-offer/secret-name', jobOfferSecret.secretName);

    // The Supabase service-role key administers identities through the Auth
    // Admin API; it is seeded out of band from the repo `.env` and never enters
    // a template, so only its secret name is published here. The service stack
    // reads it back and injects the value as SUPABASE_SERVICE_ROLE_KEY, which
    // the FULL_ACCOUNT deletion DELETE_AUTH step needs.
    publish('supabase/secret-name', `samona/${stage}/supabase-service-role`);

    publish('s3/region', this.region);
    publish('s3/bucket-selfies', selfies.bucketName);
    publish('s3/bucket-job-images', jobImages.bucketName);
    publish('s3/bucket-avatars', avatars.bucketName);
    publish('s3/bucket-documents', documents.bucketName);

    publish('ecr/repository-uri', repository.repositoryUri);
    // The name as its own parameter, not derived from the URI by splitting it:
    // an SSM read is an unresolved token at synth, so a string operation on it
    // yields the whole value, not the part after the slash. IAM grants need the
    // repository ARN, which is only safe to build from the literal name.
    publish('ecr/repository-name', repository.repositoryName);

    new CfnOutput(this, 'EcrRepositoryUri', {
      value: repository.repositoryUri,
      description:
        'docker login target; tag and push samona-server before deploying the service stack',
    });
    for (const [key, bucketResource] of [
      ['selfies', selfies],
      ['job-images', jobImages],
      ['avatars', avatars],
    ] as const) {
      new CfnOutput(this, `Bucket${key.replace(/[^A-Za-z0-9]/g, '')}`, {
        value: bucketResource.bucketName,
      });
    }
  }
}
