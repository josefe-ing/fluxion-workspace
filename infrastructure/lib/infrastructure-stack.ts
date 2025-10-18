import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
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
        permissions: '777', // Full read-write-execute for all (required for DuckDB write access)
      },
      posixUser: {
        gid: '1000',
        uid: '1000',
      },
    });

    // ========================================
    // 3. S3 for Frontend + Backups (Import existing buckets)
    // ========================================
    const frontendBucket = s3.Bucket.fromBucketName(
      this,
      'FluxionFrontend',
      `fluxion-frontend-v4-${cdk.Stack.of(this).account}`
    );

    const backupBucket = s3.Bucket.fromBucketName(
      this,
      'FluxionBackups',
      `fluxion-backups-v4-${cdk.Stack.of(this).account}`
    );

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

    // SQL Server credentials for La Granja (ETL) - Import existing secret
    const sqlCredentials = secretsmanager.Secret.fromSecretNameV2(
      this,
      'SQLServerCredentials',
      'fluxion/sql-credentials'
    );

    // ========================================
    // 5. ECS Cluster (Fargate only - no EC2 capacity needed)
    // ========================================
    const cluster = new ecs.Cluster(this, 'FluxionCluster', {
      vpc,
      clusterName: 'fluxion-cluster',
      containerInsightsV2: ecs.ContainerInsights.ENHANCED,
    });

    /*
    ========================================
    EC2 CAPACITY REMOVED - USING FARGATE
    ========================================
    The following EC2/AutoScaling configuration has been commented out.
    We're now using Fargate which is serverless and doesn't require EC2 management.
    */

    /*
    ========================================
    EC2/AutoScaling/CapacityProvider COMMENTED OUT
    Using Fargate instead - no EC2 management needed
    ========================================
/*
    // Create IAM Role for EC2 instances in ECS
    // This is CRITICAL - without this role, EC2 cannot register with ECS cluster
    const ecsInstanceRole = new iam.Role(this, 'EcsInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        // Required for ECS agent to register and communicate with ECS
        iam.ManagedPolicy.fromManagedPolicyArn(
          this,
          'ECSforEC2Policy',
          'arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role'
        ),
        // Required for Systems Manager (for debugging if needed)
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    // Create Auto Scaling Group for ECS with EBS-optimized instances
    const asg = new autoscaling.AutoScalingGroup(this, 'FluxionASG', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: new ec2.InstanceType('t3.small'), // 2 vCPU, 2GB RAM
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      role: ecsInstanceRole, // THIS IS THE KEY FIX!
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
*/

//     // Add tags to ASG for identification
//     cdk.Tags.of(asg).add('Name', 'fluxion-ecs-instance');
//     cdk.Tags.of(asg).add('Purpose', 'backend-database');
// 
//     // Add user data to format, mount EBS volume, and download database
//     // NOTE: All output goes to /var/log/cloud-init-output.log
//     asg.addUserData(
//       '#!/bin/bash',
//       'set -x', // Debug logging only, do NOT exit on error (ECS agent must configure!)
//       '',
//       'echo "=== Fluxion EC2 Instance Initialization ==="',
//       'echo "Timestamp: $(date)"',
//       'echo "Instance ID: $(ec2-metadata --instance-id | cut -d\" \" -f2)"',
//       '',
//       '# Wait for EBS volume to be attached',
//       'echo "Waiting for EBS volume /dev/xvdf..."',
//       'while [ ! -e /dev/xvdf ]; do sleep 1; done',
//       'echo "✅ EBS volume detected"',
//       '',
//       '# Check if filesystem exists, if not create it',
//       'if ! file -s /dev/xvdf | grep -q ext4; then',
//       '  echo "Creating ext4 filesystem on /dev/xvdf"',
//       '  mkfs -t ext4 /dev/xvdf',
//       'else',
//       '  echo "✅ Filesystem already exists"',
//       'fi',
//       '',
//       '# Create mount point and mount',
//       'mkdir -p /mnt/data',
//       'mount /dev/xvdf /mnt/data',
//       'echo "✅ Volume mounted at /mnt/data"',
//       '',
//       '# Add to fstab for persistence',
//       'if ! grep -q "/dev/xvdf" /etc/fstab; then',
//       '  echo "/dev/xvdf /mnt/data ext4 defaults,nofail 0 2" >> /etc/fstab',
//       'fi',
//       '',
//       '# Set permissions',
//       'chmod 755 /mnt/data',
//       'chown 1000:1000 /mnt/data',
//       '',
//       '# NOTE: Database will be downloaded by Docker container on first run',
//       '# using awscli installed in the container image',
//       '',
//       '# Configure ECS agent to join cluster',
//       'echo "========================================="',
//       'echo "CRITICAL: Configuring ECS agent..."',
//       'echo "========================================="',
//       `echo "ECS_CLUSTER=${cluster.clusterName}" >> /etc/ecs/ecs.config`,
//       'echo "ECS_ENABLE_TASK_IAM_ROLE=true" >> /etc/ecs/ecs.config',
//       'echo "ECS_ENABLE_TASK_IAM_ROLE_NETWORK_HOST=true" >> /etc/ecs/ecs.config',
//       'cat /etc/ecs/ecs.config',
//       'echo "✅ ECS cluster name configured"',
//       '',
//       '# Enable and start ECS agent',
//       'echo "Enabling and starting ECS agent..."',
//       'systemctl enable ecs',
//       'systemctl start ecs',
//       'sleep 10',
//       'echo "Checking ECS agent status..."',
//       'systemctl status ecs --no-pager --lines=20',
//       '',
//       '# Verify registration',
//       'echo "Waiting for ECS agent to register (max 30 seconds)..."',
//       'for i in {1..30}; do',
//       '  if curl -s http://localhost:51678/v1/metadata | grep -q "Cluster"; then',
//       '    echo "✅ ECS agent registered successfully!"',
//       '    curl -s http://localhost:51678/v1/metadata',
//       '    break',
//       '  fi',
//       '  echo "[$i/30] Waiting for registration..."',
//       '  sleep 1',
//       'done',
//       '',
//       'echo "========================================="',
//       'echo "=== Initialization complete ==="',
//       'echo "========================================="'
//     );
// 
//     /*
// // Create ECS Capacity Provider
//     const capacityProvider = new ecs.AsgCapacityProvider(this, 'FluxionCapacityProvider', {
//       autoScalingGroup: asg,
//       enableManagedScaling: true,
//       enableManagedTerminationProtection: false,
//     });
//
//     cluster.addAsgCapacityProvider(capacityProvider);
//     */

    // ========================================
    // 6. Backend Task Definition (EC2 with host volume)
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

    // Grant S3 read access to download database from old backup bucket
    const oldBackupBucket = s3.Bucket.fromBucketName(
      this,
      'OldFluxionBackups',
      'fluxion-backups-611395766952'
    );
    oldBackupBucket.grantRead(backendTask.taskRole);

    // Also grant access to new backup bucket
    backupBucket.grantRead(backendTask.taskRole);

    // Grant EFS root access to task role (required for Fargate)
    fileSystem.grantRootAccess(backendTask.taskRole);

    // Grant Backend permission to launch ETL tasks (will be configured after ETL task is created)
    // This allows the Backend to manually trigger ETL via /api/etl/sync endpoint

    // Reference existing ECR repository
    const backendRepo = ecr.Repository.fromRepositoryName(
      this,
      'FluxionBackendRepo',
      'fluxion-backend'
    );

    const backendContainer = backendTask.addContainer('backend', {
      image: ecs.ContainerImage.fromEcrRepository(backendRepo, 'latest'),
      // Note: Memory is defined at task level for Fargate (2048 MiB)
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'fluxion-backend',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        ENVIRONMENT: 'production',
        DATABASE_PATH: '/data/fluxion_production.db',
        SENTRY_DSN: process.env.SENTRY_DSN || '',
        AWS_REGION: this.region,
        ECS_CLUSTER_NAME: cluster.clusterName,
        // ETL task definition ARN will be set after etlTask is created
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
    const backendService = new ecs.FargateService(this, 'FluxionBackendService', {
      cluster,
      taskDefinition: backendTask,
      desiredCount: 1,
      platformVersion: ecs.FargatePlatformVersion.LATEST,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      minHealthyPercent: 0, // Allow stopping old task before starting new one (only 1 task)
      maxHealthyPercent: 100, // Only 1 task at a time
      healthCheckGracePeriod: cdk.Duration.seconds(600), // 10 minutes - allow time for DB download
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
        interval: cdk.Duration.seconds(60), // Check every 60s to reduce load during startup
        timeout: cdk.Duration.seconds(10), // Increased timeout
        healthyThresholdCount: 2, // Need 2 successful checks to be healthy
        unhealthyThresholdCount: 5, // Need 5 failed checks to be unhealthy (5min grace)
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
    // 8. ECR Repository for ETL - Import existing
    // ========================================
    const etlRepo = ecr.Repository.fromRepositoryName(
      this,
      'FluxionETLRepo',
      'fluxion-etl'
    );

    // ========================================
    // 9. ETL Task Definition (Fargate)
    // ========================================
    const etlTask = new ecs.FargateTaskDefinition(this, 'FluxionETLTask', {
      memoryLimitMiB: 4096,  // 4GB RAM
      cpu: 2048,              // 2 vCPU
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

    // Grant permissions to ETL task
    fileSystem.grantRootAccess(etlTask.taskRole);
    sqlCredentials.grantRead(etlTask.taskRole);
    wireguardConfig.grantRead(etlTask.taskRole);

    // ETL Container
    const etlContainer = etlTask.addContainer('etl', {
      image: ecs.ContainerImage.fromEcrRepository(etlRepo, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'fluxion-etl',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        ENVIRONMENT: 'production',
        AWS_REGION: this.region,
        DATABASE_PATH: '/data/fluxion_production.db',  // Use EFS shared storage
        ETL_MODE: 'etl_inventario.py',
        ETL_ARGS: '--todas',  // Todas las tiendas activas (20 ubicaciones)
        ETL_ENVIRONMENT: 'production',  // Usar IPs y puertos de producción via WireGuard
        RUN_MODE: 'scheduled',
        SENTRY_DSN: process.env.SENTRY_DSN || '',
      },
      secrets: {
        // SQL credentials from Secrets Manager
        SQL_USER: ecs.Secret.fromSecretsManager(sqlCredentials, 'username'),
        SQL_PASS: ecs.Secret.fromSecretsManager(sqlCredentials, 'password'),
      },
      stopTimeout: cdk.Duration.minutes(2),
    });

    // Mount EFS volume to /data
    etlContainer.addMountPoints({
      containerPath: '/data',
      sourceVolume: 'fluxion-data',
      readOnly: false,
    });

    // Security Group for ETL
    const etlSecurityGroup = new ec2.SecurityGroup(this, 'ETLSecurityGroup', {
      vpc,
      description: 'Security group for ETL tasks',
      allowAllOutbound: true,
    });

    // Allow ETL to access La Granja network via VPN
    etlSecurityGroup.addEgressRule(
      ec2.Peer.ipv4('192.168.0.0/16'),
      ec2.Port.allTraffic(),
      'Allow ETL to access La Granja network via VPN'
    );

    // Allow ETL to access EFS
    fileSystem.connections.allowDefaultPortFrom(etlSecurityGroup);

    // ========================================
    // 10. ETL Scheduled Rules (Twice daily: 3:00 AM and 2:00 PM)
    // ========================================
    // Morning ETL at 3:00 AM UTC-4 (7:00 AM UTC)
    const etlRuleMorning = new events.Rule(this, 'FluxionETLScheduleMorning', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '7',  // 3:00 AM Venezuela time (UTC-4)
        weekDay: '*',
      }),
      description: 'Run Fluxion ETL at 3:00 AM Venezuela time',
      ruleName: 'fluxion-etl-schedule-morning',
      enabled: true,
    });

    etlRuleMorning.addTarget(
      new targets.EcsTask({
        cluster,
        taskDefinition: etlTask,
        subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [etlSecurityGroup],
        platformVersion: ecs.FargatePlatformVersion.LATEST,
        taskCount: 1,
        propagateTags: ecs.PropagatedTagSource.TASK_DEFINITION,
      })
    );

    // Afternoon ETL at 2:00 PM UTC-4 (6:00 PM UTC)
    const etlRuleAfternoon = new events.Rule(this, 'FluxionETLScheduleAfternoon', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '18',  // 2:00 PM Venezuela time (UTC-4)
        weekDay: '*',
      }),
      description: 'Run Fluxion ETL at 2:00 PM Venezuela time',
      ruleName: 'fluxion-etl-schedule-afternoon',
      enabled: true,
    });

    etlRuleAfternoon.addTarget(
      new targets.EcsTask({
        cluster,
        taskDefinition: etlTask,
        subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [etlSecurityGroup],
        platformVersion: ecs.FargatePlatformVersion.LATEST,
        taskCount: 1,
        propagateTags: ecs.PropagatedTagSource.TASK_DEFINITION,
      })
    );

    // ========================================
    // Configure Backend with ETL task information
    // ========================================
    // Get private subnets for ETL task launching
    const privateSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
    }).subnetIds;

    // Add ETL configuration to Backend container environment
    backendContainer.addEnvironment('ETL_TASK_DEFINITION', etlTask.taskDefinitionArn);
    backendContainer.addEnvironment('ETL_SUBNETS', privateSubnets.join(','));
    backendContainer.addEnvironment('ETL_SECURITY_GROUPS', etlSecurityGroup.securityGroupId);

    // Grant Backend permission to run ETL tasks
    backendTask.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ecs:RunTask'],
        resources: [etlTask.taskDefinitionArn],
      })
    );

    // Grant Backend permission to describe and stop ETL task instances
    // Note: DescribeTasks and StopTask require task instance ARN, not task definition ARN
    backendTask.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecs:DescribeTasks',
          'ecs:StopTask',
        ],
        resources: [
          `arn:aws:ecs:${this.region}:${this.account}:task/fluxion-cluster/*`,
        ],
      })
    );

    // Grant Backend permission to pass ETL task role (required for ecs:RunTask)
    backendTask.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [
          etlTask.taskRole.roleArn,
          etlTask.executionRole!.roleArn,
        ],
      })
    );

    // Grant Backend permission to read ETL CloudWatch Logs
    backendTask.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:DescribeLogStreams',
          'logs:GetLogEvents',
          'logs:FilterLogEvents',
        ],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:FluxionStackV2-FluxionETLTask*:*`,
        ],
      })
    );

    // ========================================
    // 10. Ventas ETL Task Definition (Fargate)
    // ========================================
    const ventasEtlTask = new ecs.FargateTaskDefinition(this, 'FluxionVentasETLTask', {
      memoryLimitMiB: 4096,  // 4GB RAM
      cpu: 2048,              // 2 vCPU
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

    // Grant permissions to Ventas ETL task
    fileSystem.grantRootAccess(ventasEtlTask.taskRole);
    sqlCredentials.grantRead(ventasEtlTask.taskRole);
    wireguardConfig.grantRead(ventasEtlTask.taskRole);

    // Ventas ETL Container
    const ventasEtlContainer = ventasEtlTask.addContainer('ventas-etl', {
      image: ecs.ContainerImage.fromEcrRepository(etlRepo, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'fluxion-ventas-etl',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        ENVIRONMENT: 'production',
        AWS_REGION: this.region,
        DATABASE_PATH: '/data/fluxion_production.db',  // Use EFS shared storage
        ETL_MODE: 'etl_ventas_multi_tienda.py',
        ETL_ARGS: '--fecha-inicio 2025-01-01 --fecha-fin 2025-12-31 --todas',  // Default args
        RUN_MODE: 'scheduled',
        SENTRY_DSN: process.env.SENTRY_DSN || '',
      },
      secrets: {
        // SQL credentials from Secrets Manager
        SQL_USER: ecs.Secret.fromSecretsManager(sqlCredentials, 'username'),
        SQL_PASS: ecs.Secret.fromSecretsManager(sqlCredentials, 'password'),
      },
      stopTimeout: cdk.Duration.minutes(2),  // Fargate max is 120 seconds
    });

    // Mount EFS volume to /data
    ventasEtlContainer.addMountPoints({
      containerPath: '/data',
      sourceVolume: 'fluxion-data',
      readOnly: false,
    });

    // ========================================
    // 11. Ventas ETL Scheduled Rules (Twice daily: 3:00 AM and 2:00 PM)
    // ========================================
    // Morning Ventas ETL at 3:00 AM UTC-4 (7:00 AM UTC)
    const ventasEtlRuleMorning = new events.Rule(this, 'FluxionVentasETLScheduleMorning', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '7',  // 3:00 AM Venezuela time (UTC-4)
        weekDay: '*',
      }),
      description: 'Run Fluxion Ventas ETL at 3:00 AM Venezuela time',
      ruleName: 'fluxion-ventas-etl-schedule-morning',
      enabled: true,
    });

    ventasEtlRuleMorning.addTarget(
      new targets.EcsTask({
        cluster,
        taskDefinition: ventasEtlTask,
        subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [etlSecurityGroup],
        platformVersion: ecs.FargatePlatformVersion.LATEST,
        taskCount: 1,
        propagateTags: ecs.PropagatedTagSource.TASK_DEFINITION,
      })
    );

    // Afternoon Ventas ETL at 2:00 PM UTC-4 (6:00 PM UTC)
    const ventasEtlRuleAfternoon = new events.Rule(this, 'FluxionVentasETLScheduleAfternoon', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '18',  // 2:00 PM Venezuela time (UTC-4)
        weekDay: '*',
      }),
      description: 'Run Fluxion Ventas ETL at 2:00 PM Venezuela time',
      ruleName: 'fluxion-ventas-etl-schedule-afternoon',
      enabled: true,
    });

    ventasEtlRuleAfternoon.addTarget(
      new targets.EcsTask({
        cluster,
        taskDefinition: ventasEtlTask,
        subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [etlSecurityGroup],
        platformVersion: ecs.FargatePlatformVersion.LATEST,
        taskCount: 1,
        propagateTags: ecs.PropagatedTagSource.TASK_DEFINITION,
      })
    );

    // ========================================
    // 12. Configure Backend with Ventas ETL task information
    // ========================================
    // Add Ventas ETL configuration to Backend container environment
    backendContainer.addEnvironment('VENTAS_TASK_DEFINITION', ventasEtlTask.taskDefinitionArn);

    // Grant Backend permission to run Ventas ETL tasks
    backendTask.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ecs:RunTask'],
        resources: [ventasEtlTask.taskDefinitionArn],
      })
    );

    // Grant Backend permission to describe and stop Ventas ETL task instances
    // Note: DescribeTasks and StopTask require task instance ARN, not task definition ARN
    // This permission is already granted above for all tasks in the cluster
    // (see ecs:DescribeTasks/StopTask on arn:aws:ecs:.../task/fluxion-cluster/*)

    // Grant Backend permission to pass Ventas ETL task role (required for ecs:RunTask)
    backendTask.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [
          ventasEtlTask.taskRole.roleArn,
          ventasEtlTask.executionRole!.roleArn,
        ],
      })
    );

    // Grant Backend permission to read Ventas ETL CloudWatch Logs
    backendTask.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:DescribeLogStreams',
          'logs:GetLogEvents',
          'logs:FilterLogEvents',
        ],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:FluxionStackV2-FluxionVentasETLTask*:*`,
        ],
      })
    );

    // ========================================
    // 13. Backup Task Definition (TEMPORARILY DISABLED)
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
    });

    new cdk.CfnOutput(this, 'BackendCloudFrontDistributionId', {
      value: backendDistribution.distributionId,
      description: 'Backend CloudFront Distribution ID',
    });

    new cdk.CfnOutput(this, 'FrontendURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Frontend CloudFront URL',
    });

    new cdk.CfnOutput(this, 'FrontendBucket', {
      value: frontendBucket.bucketName,
      description: 'Frontend S3 bucket name',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront Distribution ID for cache invalidation',
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

    new cdk.CfnOutput(this, 'ETLRepositoryURI', {
      value: etlRepo.repositoryUri,
      description: 'ECR Repository URI for ETL',
      exportName: 'FluxionETLRepoURI',
    });

    new cdk.CfnOutput(this, 'ETLTaskDefinitionArn', {
      value: etlTask.taskDefinitionArn,
      description: 'ETL Task Definition ARN',
      exportName: 'FluxionETLTaskArn',
    });

    new cdk.CfnOutput(this, 'ETLLogGroup', {
      value: '/aws/ecs/fluxion-etl',
      description: 'CloudWatch Log Group for ETL',
      exportName: 'FluxionETLLogGroup',
    });

    new cdk.CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
      description: 'ECS Cluster Name',
    });
  }
}
