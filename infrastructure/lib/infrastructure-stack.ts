import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // TAGS - Multi-project support
    // ========================================
    const projectTags = {
      Application: 'fluxion',
      Project: 'fluxion-ai',
      Environment: 'production',
      ManagedBy: 'cdk',
      CostCenter: 'la-granja-mercado',
      Owner: 'josefe-ing',
    };

    // Apply tags to all resources in this stack
    Object.entries(projectTags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    // ========================================
    // 1. VPC with VPN Gateway
    // ========================================
    const vpc = new ec2.Vpc(this, 'FluxionVPC', {
      vpcName: 'fluxion-vpc',
      maxAzs: 2,
      natGateways: 1, // Save costs - use 1 NAT Gateway
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
    // 1b. WireGuard VPN Bridge (EC2)
    // ========================================

    // Security Group for WireGuard EC2
    const wireguardSG = new ec2.SecurityGroup(this, 'WireGuardBridgeSG', {
      vpc,
      description: 'Security group for WireGuard VPN bridge to La Granja',
      allowAllOutbound: true,
    });

    // Allow UDP 51820 outbound for WireGuard (already allowed by allowAllOutbound)
    // Allow inbound from ECS tasks on private subnets
    wireguardSG.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.allTraffic(),
      'Allow traffic from VPC to route through WireGuard'
    );

    // Store WireGuard config in Secrets Manager
    const wireguardConfig = new secretsmanager.Secret(this, 'WireGuardConfig', {
      secretName: 'fluxion/wireguard-config',
      description: 'WireGuard configuration for La Granja VPN',
      secretStringValue: cdk.SecretValue.unsafePlainText(`[Interface]
PrivateKey = oBXfWH5DbhcU9N57/iqFYarozxc/mUiVSH2h5nc8+1w=
Address = 10.32.0.24/32

[Peer]
PublicKey = j6ioRetJeMVbO4oipmcTiEGT4mUCXLlS0iIpQ8d8F0Y=
AllowedIPs = 192.168.0.0/16
Endpoint = f0270ee31a20.sn.mynetname.net:51820
PersistentKeepalive = 25`),
    });

    // IAM Role for WireGuard EC2
    const wireguardRole = new iam.Role(this, 'WireGuardInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    // EC2 Instance for WireGuard Bridge
    const wireguardInstance = new ec2.Instance(this, 'WireGuardBridge', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: wireguardSG,
      sourceDestCheck: false, // Required for routing/NAT functionality
      role: wireguardRole,
    });

    // Grant access to read WireGuard config
    wireguardConfig.grantRead(wireguardInstance.role);

    // UserData script to install and configure WireGuard
    wireguardInstance.addUserData(
      '#!/bin/bash',
      'set -e',
      '',
      '# Update system',
      'dnf update -y',
      '',
      '# Install WireGuard',
      'dnf install -y wireguard-tools',
      '',
      '# Enable IP forwarding',
      'echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf',
      'sysctl -p',
      '',
      '# Retrieve WireGuard config from Secrets Manager',
      `aws secretsmanager get-secret-value --secret-id ${wireguardConfig.secretName} --region ${this.region} --query SecretString --output text > /etc/wireguard/wg0.conf`,
      'chmod 600 /etc/wireguard/wg0.conf',
      '',
      '# Start WireGuard',
      'systemctl enable wg-quick@wg0',
      'systemctl start wg-quick@wg0',
      '',
      '# Configure iptables for NAT',
      'iptables -t nat -A POSTROUTING -o wg0 -j MASQUERADE',
      'iptables -A FORWARD -i eth0 -o wg0 -j ACCEPT',
      'iptables -A FORWARD -i wg0 -o eth0 -m state --state RELATED,ESTABLISHED -j ACCEPT',
      '',
      '# Save iptables rules',
      'dnf install -y iptables-services',
      'service iptables save',
      '',
      'echo "WireGuard bridge setup complete"'
    );

    // Add routes to La Granja network through WireGuard instance
    vpc.privateSubnets.forEach((subnet, index) => {
      new ec2.CfnRoute(this, `LaGranjaRoute${index}`, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: '192.168.0.0/16',
        instanceId: wireguardInstance.instanceId,
      });
    });

    // ========================================
    // 2. EFS for DuckDB Persistence
    // ========================================
    const fileSystem = new efs.FileSystem(this, 'FluxionEFS', {
      vpc,
      fileSystemName: 'fluxion-data',
      encrypted: false, // Disabled for now - can enable later with specific KMS key
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Don't delete DB on stack destroy
    });

    // EFS Access Point
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
    // 3. S3 for Frontend + Backups
    // ========================================
    const frontendBucket = new s3.Bucket(this, 'FluxionFrontend', {
      bucketName: `fluxion-frontend-${cdk.Stack.of(this).account}`,
      publicReadAccess: true,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
    });

    const backupBucket = new s3.Bucket(this, 'FluxionBackups', {
      bucketName: `fluxion-backups-v2-${cdk.Stack.of(this).account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
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

    // CloudFront Distribution for Frontend
    const distribution = new cloudfront.Distribution(this, 'FluxionCDN', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
      },
      comment: 'Fluxion AI Frontend CDN',
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(300),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(300),
        },
      ],
    });

    // ========================================
    // 4. Secrets Manager for Credentials
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
    // 5. ECS Cluster with EC2 Capacity
    // ========================================
    const cluster = new ecs.Cluster(this, 'FluxionCluster', {
      vpc,
      clusterName: 'fluxion-cluster',
      containerInsightsV2: ecs.ContainerInsights.ENHANCED,
    });

    // Create Auto Scaling Group for ECS with EBS-optimized instances
    const asg = new autoscaling.AutoScalingGroup(this, 'FluxionASG', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: new ec2.InstanceType('t3.small'), // 2 vCPU, 2GB RAM
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      minCapacity: 1,
      maxCapacity: 1, // Keep at 1 since we only need 1 backend task
      desiredCapacity: 1,
      blockDevices: [
        {
          deviceName: '/dev/xvda', // Root volume
          volume: autoscaling.BlockDeviceVolume.ebs(30, {
            volumeType: autoscaling.EbsDeviceVolumeType.GP3,
            deleteOnTermination: true,
          }),
        },
        {
          deviceName: '/dev/xvdf', // Data volume for DuckDB
          volume: autoscaling.BlockDeviceVolume.ebs(25, {
            volumeType: autoscaling.EbsDeviceVolumeType.GP3,
            iops: 3000,
            throughput: 125,
            deleteOnTermination: false, // Preserve data on instance termination
          }),
        },
      ],
      userData: ec2.UserData.forLinux(),
    });

    // Add tags to ASG for identification
    cdk.Tags.of(asg).add('Name', 'fluxion-ecs-instance');
    cdk.Tags.of(asg).add('Purpose', 'backend-database');

    // Add user data to format, mount EBS volume, and download database
    asg.addUserData(
      '#!/bin/bash',
      'set -e',
      '',
      'echo "=== Fluxion EC2 Instance Initialization ==="',
      '',
      '# Wait for EBS volume to be attached',
      'echo "Waiting for EBS volume /dev/xvdf..."',
      'while [ ! -e /dev/xvdf ]; do sleep 1; done',
      'echo "✅ EBS volume detected"',
      '',
      '# Check if filesystem exists, if not create it',
      'if ! file -s /dev/xvdf | grep -q ext4; then',
      '  echo "Creating ext4 filesystem on /dev/xvdf"',
      '  mkfs -t ext4 /dev/xvdf',
      'else',
      '  echo "✅ Filesystem already exists"',
      'fi',
      '',
      '# Create mount point and mount',
      'mkdir -p /mnt/data',
      'mount /dev/xvdf /mnt/data',
      'echo "✅ Volume mounted at /mnt/data"',
      '',
      '# Add to fstab for persistence',
      'if ! grep -q "/dev/xvdf" /etc/fstab; then',
      '  echo "/dev/xvdf /mnt/data ext4 defaults,nofail 0 2" >> /etc/fstab',
      'fi',
      '',
      '# Set permissions',
      'chmod 755 /mnt/data',
      'chown 1000:1000 /mnt/data',
      '',
      '# Download database from S3 if not exists',
      'echo "Checking for database..."',
      'if [ ! -f /mnt/data/fluxion_production.db ]; then',
      '  echo "📦 Downloading database from S3 (15GB, will take 3-5 minutes)..."',
      '  aws s3 cp s3://fluxion-backups-v2-611395766952/production_db_uncompressed_20251011.db \\',
      '    /mnt/data/fluxion_production.db \\',
      '    --region us-east-1',
      '  ',
      '  if [ -f /mnt/data/fluxion_production.db ]; then',
      '    echo "✅ Database downloaded successfully"',
      '    chown 1000:1000 /mnt/data/fluxion_production.db',
      '    chmod 644 /mnt/data/fluxion_production.db',
      '    echo "Size: $(du -h /mnt/data/fluxion_production.db | cut -f1)"',
      '  else',
      '    echo "❌ Failed to download database"',
      '  fi',
      'else',
      '  echo "✅ Database already exists ($(du -h /mnt/data/fluxion_production.db | cut -f1))"',
      'fi',
      '',
      'echo "=== Initialization complete ==="'
    );

    // Create ECS Capacity Provider
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'FluxionCapacityProvider', {
      autoScalingGroup: asg,
      enableManagedScaling: true,
      enableManagedTerminationProtection: false,
    });

    cluster.addAsgCapacityProvider(capacityProvider);

    // ========================================
    // 6. Backend Task Definition (EC2 with host volume)
    // ========================================
    const backendTask = new ecs.Ec2TaskDefinition(
      this,
      'FluxionBackendTask',
      {
        networkMode: ecs.NetworkMode.AWS_VPC,
        volumes: [
          {
            name: 'fluxion-data',
            host: {
              sourcePath: '/mnt/data', // EBS mount point from EC2 user data
            },
          },
        ],
      }
    );

    // Grant S3 read access to download database from old backup bucket
    const oldBackupBucket = s3.Bucket.fromBucketName(
      this,
      'OldFluxionBackups',
      'fluxion-backups-611395766952'
    );
    oldBackupBucket.grantRead(backendTask.taskRole);

    // Also grant access to new backup bucket
    backupBucket.grantRead(backendTask.taskRole);

    const backendContainer = backendTask.addContainer('backend', {
      image: ecs.ContainerImage.fromAsset('../backend', {
        platform: Platform.LINUX_AMD64,
      }),
      memoryReservationMiB: 1024, // Soft limit for EC2
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
    // 7. Backend Service with ALB (EC2)
    // ========================================
    const backendService = new ecs.Ec2Service(this, 'FluxionBackendService', {
      cluster,
      taskDefinition: backendTask,
      desiredCount: 1,
      capacityProviderStrategies: [
        {
          capacityProvider: capacityProvider.capacityProviderName,
          weight: 1,
        },
      ],
      minHealthyPercent: 0, // Allow stopping old task before starting new one (only 1 task)
      maxHealthyPercent: 100, // Only 1 task at a time
    });

    // Allow ECS tasks to access EFS (keep for ETL compatibility)
    fileSystem.connections.allowDefaultPortFrom(backendService);

    const alb = new elbv2.ApplicationLoadBalancer(this, 'FluxionALB', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'fluxion-alb',
      idleTimeout: cdk.Duration.seconds(120), // Increased for forecast endpoint
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
    // 7b. CloudFront Distribution for Backend API (HTTPS)
    // ========================================
    const backendDistribution = new cloudfront.Distribution(
      this,
      'FluxionBackendCDN',
      {
        defaultBehavior: {
          origin: new origins.HttpOrigin(alb.loadBalancerDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          // Use managed CachingDisabled policy instead of custom policy
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // Use managed AllViewer origin request policy to forward all headers, query strings, and cookies
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        comment: 'Fluxion AI Backend API CDN (HTTPS)',
      }
    );

    // ========================================
    // 8. ETL Task Definition
    // ========================================
    const etlTask = new ecs.FargateTaskDefinition(this, 'FluxionETLTask', {
      memoryLimitMiB: 4096,
      cpu: 2048,
      volumes: [
        {
          name: 'fluxion-data',
          efsVolumeConfiguration: {
            fileSystemId: fileSystem.fileSystemId,
            transitEncryption: 'ENABLED',
            authorizationConfig: {
              accessPointId: accessPoint.accessPointId,
              iam: 'ENABLED',
            },
          },
        },
      ],
    });

    fileSystem.grantRootAccess(etlTask.taskRole);

    const etlContainer = etlTask.addContainer('etl', {
      image: ecs.ContainerImage.fromAsset('../etl'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'fluxion-etl',
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
      command: ['python3', 'etl_inventario.py'],
      environment: {
        DATABASE_PATH: '/data/fluxion_production.db',
        SENTRY_DSN: process.env.SENTRY_DSN || '',
      },
      secrets: {
        SQL_SERVER_PASSWORD: ecs.Secret.fromSecretsManager(dbCredentials, 'password'),
      },
    });

    etlContainer.addMountPoints({
      containerPath: '/data',
      sourceVolume: 'fluxion-data',
      readOnly: false,
    });

    // ========================================
    // 9. ETL Scheduled Rule (Daily at 2am UTC)
    // ========================================
    const etlRule = new events.Rule(this, 'FluxionETLSchedule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '2',
        weekDay: '*',
      }),
      description: 'Run Fluxion ETL daily at 2am UTC',
      ruleName: 'fluxion-etl-daily',
    });

    etlRule.addTarget(
      new targets.EcsTask({
        cluster,
        taskDefinition: etlTask,
        subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        taskCount: 1,
      })
    );

    // ========================================
    // 10. Backup Task Definition (TEMPORARILY DISABLED)
    // ========================================
    /* COMMENTED OUT - Will enable after initial deployment
    const backupTask = new ecs.FargateTaskDefinition(
      this,
      'FluxionBackupTask',
      {
        memoryLimitMiB: 2048,
        cpu: 1024,
        volumes: [
          {
            name: 'fluxion-data',
            efsVolumeConfiguration: {
              fileSystemId: fileSystem.fileSystemId,
              transitEncryption: 'ENABLED',
              authorizationConfig: {
                accessPointId: accessPoint.accessPointId,
                iam: 'ENABLED',
              },
            },
          },
        ],
      }
    );

    fileSystem.grantRootAccess(backupTask.taskRole);
    backupBucket.grantWrite(backupTask.taskRole);

    const backupContainer = backupTask.addContainer('backup', {
      image: ecs.ContainerImage.fromRegistry('amazon/aws-cli'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'fluxion-backup',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      command: [
        's3',
        'cp',
        '/data/fluxion_production.db',
        `s3://${backupBucket.bucketName}/backups/fluxion_production_$(date +%Y%m%d_%H%M%S).db`,
      ],
    });

    backupContainer.addMountPoints({
      containerPath: '/data',
      sourceVolume: 'fluxion-data',
      readOnly: true,
    });

    // Backup Schedule (Daily at 3am UTC)
    const backupRule = new events.Rule(this, 'FluxionBackupSchedule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '3',
        weekDay: '*',
      }),
      description: 'Backup Fluxion database daily at 3am UTC',
      ruleName: 'fluxion-backup-daily',
    });

    backupRule.addTarget(
      new targets.EcsTask({
        cluster,
        taskDefinition: backupTask,
        subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        taskCount: 1,
      })
    );
    */ // END BACKUP COMMENT

    // ========================================
    // 11. Outputs
    // ========================================
    new cdk.CfnOutput(this, 'BackendURL', {
      value: `http://${alb.loadBalancerDnsName}`,
      description: 'Backend API URL (HTTP - Direct ALB)',
    });

    new cdk.CfnOutput(this, 'BackendURLSecure', {
      value: `https://${backendDistribution.distributionDomainName}`,
      description: 'Backend API URL (HTTPS - via CloudFront)',
      exportName: 'FluxionBackendAPIURL',
    });

    new cdk.CfnOutput(this, 'BackendCloudFrontDistributionId', {
      value: backendDistribution.distributionId,
      description: 'Backend CloudFront Distribution ID',
      exportName: 'FluxionBackendCloudFrontDistributionId',
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
      description: 'VPC ID',
    });

    new cdk.CfnOutput(this, 'WireGuardInstanceId', {
      value: wireguardInstance.instanceId,
      description: 'WireGuard Bridge EC2 Instance ID',
    });

    new cdk.CfnOutput(this, 'WireGuardInstancePrivateIP', {
      value: wireguardInstance.instancePrivateIp,
      description: 'WireGuard Bridge Private IP',
    });

    new cdk.CfnOutput(this, 'WireGuardSSMCommand', {
      value: `aws ssm start-session --target ${wireguardInstance.instanceId}`,
      description: 'Command to connect to WireGuard instance via SSM',
    });

    new cdk.CfnOutput(this, 'ETLTaskDefinition', {
      value: etlTask.taskDefinitionArn,
      description: 'ETL Task Definition ARN',
    });

    new cdk.CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
      description: 'ECS Cluster Name',
    });
  }
}
