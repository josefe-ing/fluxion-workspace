import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';

/**
 * Infrastructure Stack con Mejoras de Seguridad
 *
 * Cambios principales:
 * 1. EFS con cifrado KMS
 * 2. CloudFront con OAI (Origin Access Identity)
 * 3. S3 sin acceso público
 * 4. KMS key con rotación automática
 */
export class InfrastructureStackEncrypted extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const projectTags = {
      Application: 'fluxion',
      Project: 'fluxion-ai',
      Environment: 'production',
      ManagedBy: 'cdk',
      CostCenter: 'la-granja-mercado',
      Owner: 'josefe-ing',
      SecurityLevel: 'high', // Nueva tag
    };

    Object.entries(projectTags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    // ========================================
    // 1. KMS Key para cifrado
    // ========================================
    const efsEncryptionKey = new kms.Key(this, 'FluxionEFSEncryptionKey', {
      description: 'KMS key for Fluxion EFS encryption (16GB production database)',
      enableKeyRotation: true, // ✅ Rotación automática cada año
      removalPolicy: cdk.RemovalPolicy.RETAIN, // ⚠️ NO eliminar key si se destruye el stack
      alias: 'fluxion/efs-encryption',
    });

    // ========================================
    // 2. VPC (sin cambios)
    // ========================================
    const vpc = new ec2.Vpc(this, 'FluxionVPC', {
      vpcName: 'fluxion-vpc',
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // ========================================
    // 3. EFS CIFRADO con KMS
    // ========================================
    const fileSystem = new efs.FileSystem(this, 'FluxionEFSEncrypted', {
      vpc,
      fileSystemName: 'fluxion-data-encrypted',
      encrypted: true, // ✅ CIFRADO HABILITADO
      kmsKey: efsEncryptionKey, // ✅ KMS key personalizada
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const accessPoint = fileSystem.addAccessPoint('FluxionAccessPoint', {
      path: '/fluxion-data',
      createAcl: {
        ownerGid: '1000',
        ownerUid: '1000',
        permissions: '755',
      },
      posixUser: {
        gid: '1000',
        uid: '1000',
      },
    });

    // ========================================
    // 4. S3 Buckets con Seguridad Mejorada
    // ========================================

    // CloudFront Origin Access Identity
    const cloudfrontOAI = new cloudfront.OriginAccessIdentity(this, 'FluxionCloudFrontOAI', {
      comment: 'OAI for Fluxion Frontend - Restricts S3 access to CloudFront only',
    });

    const frontendBucket = new s3.Bucket(this, 'FluxionFrontendSecure', {
      bucketName: `fluxion-frontend-${cdk.Stack.of(this).account}`,
      publicReadAccess: false, // ✅ Sin acceso público
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // ✅ Bloquear todo acceso público
      encryption: s3.BucketEncryption.S3_MANAGED, // ✅ Cifrado S3
    });

    // Permitir acceso solo desde CloudFront OAI
    frontendBucket.grantRead(cloudfrontOAI);

    const backupBucket = new s3.Bucket(this, 'FluxionBackupsSecure', {
      bucketName: `fluxion-backups-${cdk.Stack.of(this).account}`,
      versioned: true,
      encryption: s3.BucketEncryption.KMS, // ✅ Usar KMS en lugar de S3-managed
      encryptionKey: new kms.Key(this, 'FluxionBackupEncryptionKey', {
        description: 'KMS key for Fluxion backup encryption',
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        alias: 'fluxion/backup-encryption',
      }),
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(90),
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ========================================
    // 5. CloudFront con OAI
    // ========================================
    const distribution = new cloudfront.Distribution(this, 'FluxionCDNSecure', {
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket, {
          originAccessIdentity: cloudfrontOAI, // ✅ Solo CloudFront puede acceder al bucket
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS, // ✅ Forzar HTTPS
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Solo NA/EU
      comment: 'Fluxion AI Frontend CDN with OAI security',
    });

    // ========================================
    // 6. Secrets Manager (sin cambios)
    // ========================================
    const dbCredentials = new secretsmanager.Secret(this, 'FluxionDBCredentials', {
      secretName: 'fluxion/db-credentials',
      description: 'SQL Server credentials for ETL',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'etl_user' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });

    // ========================================
    // 7. ECS Cluster (sin cambios)
    // ========================================
    const cluster = new ecs.Cluster(this, 'FluxionCluster', {
      vpc,
      clusterName: 'fluxion-cluster',
      containerInsights: true,
    });

    // ========================================
    // 8. Backend Task Definition
    // ========================================
    const backendTask = new ecs.FargateTaskDefinition(
      this,
      'FluxionBackendTask',
      {
        memoryLimitMiB: 2048,
        cpu: 1024,
        volumes: [
          {
            name: 'fluxion-data',
            efsVolumeConfiguration: {
              fileSystemId: fileSystem.fileSystemId,
              transitEncryption: 'ENABLED', // ✅ Cifrado en tránsito
              authorizationConfig: {
                accessPointId: accessPoint.accessPointId,
                iam: 'ENABLED', // ✅ Autenticación IAM
              },
            },
          },
        ],
      }
    );

    // Permitir acceso a EFS y KMS
    fileSystem.grantRootAccess(backendTask.taskRole);
    efsEncryptionKey.grantEncryptDecrypt(backendTask.taskRole);

    backupBucket.grantRead(backendTask.taskRole);

    const backendContainer = backendTask.addContainer('backend', {
      image: ecs.ContainerImage.fromAsset('../backend', {
        platform: Platform.LINUX_AMD64,
      }),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'fluxion-backend',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        ENVIRONMENT: 'production',
        DATABASE_PATH: '/data/fluxion_production.db',
        SENTRY_DSN: process.env.SENTRY_DSN || '',
      },
    });

    backendContainer.addPortMappings({ containerPort: 8001 });
    backendContainer.addMountPoints({
      containerPath: '/data',
      sourceVolume: 'fluxion-data',
      readOnly: false,
    });

    // ========================================
    // 9. Backend Service with ALB (sin cambios)
    // ========================================
    const backendService = new ecs.FargateService(this, 'FluxionBackendService', {
      cluster,
      taskDefinition: backendTask,
      desiredCount: 1,
      assignPublicIp: false,
    });

    fileSystem.connections.allowDefaultPortFrom(backendService);

    const alb = new elbv2.ApplicationLoadBalancer(this, 'FluxionALB', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'fluxion-alb',
    });

    const listener = alb.addListener('HttpListener', { port: 80 });

    listener.addTargets('BackendTarget', {
      port: 8001,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [backendService],
      healthCheck: {
        path: '/',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // ========================================
    // 10. Outputs
    // ========================================
    new cdk.CfnOutput(this, 'BackendURL', {
      value: `http://${alb.loadBalancerDnsName}`,
      description: 'Backend API URL',
    });

    new cdk.CfnOutput(this, 'FrontendURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Frontend CloudFront URL',
    });

    new cdk.CfnOutput(this, 'FrontendBucket', {
      value: frontendBucket.bucketName,
      description: 'Frontend S3 bucket name',
      exportName: 'FluxionFrontendBucketName',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront Distribution ID for cache invalidation',
      exportName: 'FluxionCloudFrontDistributionId',
    });

    new cdk.CfnOutput(this, 'BackupBucket', {
      value: backupBucket.bucketName,
      description: 'Backup S3 bucket name',
    });

    new cdk.CfnOutput(this, 'VPCId', {
      value: vpc.vpcId,
      description: 'VPC ID for VPN configuration',
    });

    new cdk.CfnOutput(this, 'EFSFileSystemId', {
      value: fileSystem.fileSystemId,
      description: 'Encrypted EFS File System ID',
      exportName: 'FluxionEFSFileSystemId',
    });

    new cdk.CfnOutput(this, 'EFSEncryptionKeyArn', {
      value: efsEncryptionKey.keyArn,
      description: 'KMS Key ARN for EFS encryption',
      exportName: 'FluxionEFSEncryptionKeyArn',
    });
  }
}
