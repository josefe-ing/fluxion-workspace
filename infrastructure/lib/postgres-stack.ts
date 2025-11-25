import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as logs from 'aws-cdk-lib/aws-logs';

/**
 * Fluxion Stack V3 - PostgreSQL v2.0
 *
 * Stack completamente nuevo con SOLO PostgreSQL RDS.
 * Ventajas vs FluxionStackV2:
 * - Sin historial de errores de rollback
 * - Configuración optimizada (100GB GP3, sin IOPS custom)
 * - Deploy limpio y rápido
 */
export class FluxionStackV3 extends cdk.Stack {
  public readonly dbInstance: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // TAGS
    // ========================================
    const projectTags = {
      Application: 'fluxion',
      Project: 'fluxion-ai',
      Environment: 'production',
      ManagedBy: 'cdk',
      CostCenter: 'la-granja-mercado',
      Owner: 'josefe-ing',
      Component: 'database',
      Version: 'v2.0',
    };

    Object.entries(projectTags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    // ========================================
    // 1. Import VPC from FluxionStackV2
    // ========================================
    const vpc = ec2.Vpc.fromLookup(this, 'ExistingVPC', {
      vpcName: 'fluxion-vpc',
    });

    // ========================================
    // 2. PostgreSQL Security Group
    // ========================================
    const postgresSecurityGroup = new ec2.SecurityGroup(this, 'PostgreSQLSecurityGroup', {
      vpc,
      securityGroupName: 'fluxion-postgres-sg',
      description: 'Security group for PostgreSQL RDS v2.0',
      allowAllOutbound: true,
    });

    // Allow connections from VPC CIDR (todos los servicios internos)
    postgresSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL from VPC'
    );

    // ========================================
    // 3. PostgreSQL RDS Instance (Optimized)
    // ========================================
    this.dbInstance = new rds.DatabaseInstance(this, 'FluxionPostgres', {
      instanceIdentifier: 'fluxion-postgres-v2',
      databaseName: 'fluxion_production',

      // Engine: PostgreSQL 16.3
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_3,
      }),

      // Instance type: t3.small (2 vCPU, 2GB RAM) - SUFICIENTE para inicio
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),

      // Credentials auto-generated
      credentials: rds.Credentials.fromGeneratedSecret('postgres', {
        secretName: 'fluxion/postgres-credentials-v2',
      }),

      // Networking
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [postgresSecurityGroup],
      publiclyAccessible: false,

      // Storage: 100GB GP3 (3000 IOPS baseline GRATIS)
      allocatedStorage: 100,
      maxAllocatedStorage: 500,  // Auto-scale hasta 500GB
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      // NO especificar IOPS - GP3 da 3000 IOPS gratis

      // Backups: 7 días
      backupRetention: cdk.Duration.days(7),
      deleteAutomatedBackups: false,
      preferredBackupWindow: '03:00-04:00',  // 11 PM - 12 AM Venezuela

      // Maintenance
      preferredMaintenanceWindow: 'sun:04:00-sun:05:00',  // Domingo 12 AM - 1 AM Venezuela

      // High Availability: Disabled (costo)
      multiAz: false,

      // Monitoring
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_WEEK,
      enablePerformanceInsights: false,  // Disabled para ahorrar

      // Deletion protection
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      deletionProtection: true,
    });

    // ========================================
    // 4. Outputs
    // ========================================
    new cdk.CfnOutput(this, 'PostgreSQLEndpoint', {
      value: this.dbInstance.dbInstanceEndpointAddress,
      description: 'PostgreSQL RDS Endpoint',
      exportName: 'FluxionPostgreSQLEndpointV2',
    });

    new cdk.CfnOutput(this, 'PostgreSQLPort', {
      value: this.dbInstance.dbInstanceEndpointPort,
      description: 'PostgreSQL Port (5432)',
    });

    new cdk.CfnOutput(this, 'PostgreSQLDatabase', {
      value: 'fluxion_production',
      description: 'PostgreSQL Database Name',
    });

    new cdk.CfnOutput(this, 'PostgreSQLSecretArn', {
      value: this.dbInstance.secret!.secretArn,
      description: 'PostgreSQL credentials in Secrets Manager',
      exportName: 'FluxionPostgreSQLSecretArnV2',
    });

    new cdk.CfnOutput(this, 'PostgreSQLSecurityGroupId', {
      value: postgresSecurityGroup.securityGroupId,
      description: 'PostgreSQL Security Group ID',
      exportName: 'FluxionPostgreSQLSecurityGroupIdV2',
    });

    new cdk.CfnOutput(this, 'PostgreSQLConnectionString', {
      value: `postgresql://{{username}}:{{password}}@${this.dbInstance.dbInstanceEndpointAddress}:${this.dbInstance.dbInstanceEndpointPort}/fluxion_production`,
      description: 'Connection string template (get credentials from Secrets Manager)',
    });
  }
}
