# PostgreSQL v2.0 Migration - Complete Setup Guide

**Date**: 2025-11-25
**Status**: In Progress
**Migration**: DuckDB → PostgreSQL 16.3

---

## 📋 Overview

This document describes the complete setup for migrating Fluxion AI from DuckDB to PostgreSQL v2.0 using AWS RDS.

### Key Components

1. **RDS PostgreSQL 16.3** - Managed database service
2. **Database Migrations System** - Versioned schema migrations
3. **CDK Infrastructure** - Automated deployment
4. **Secrets Manager** - Secure credential management

---

## 🗄️ Database Migrations System

### Migration Files Created

#### 1. Schema Migrations Tracking Table
**File**: `database/migrations/000_init_schema_migrations.sql`

Creates the `schema_migrations` table to track all applied migrations:
- Version number (3-digit format: 001, 002, etc.)
- Migration name
- Applied timestamp
- Execution time in milliseconds
- SHA-256 checksum for integrity verification

#### 2. Historical Inventory Feature (Migration 001)
**Files**:
- `database/migrations/001_add_historical_inventory_UP.sql` - Apply migration
- `database/migrations/001_add_historical_inventory_DOWN.sql` - Rollback migration

**Includes EVERYTHING**:
- Table: `inventario_historico` with columns:
  - `id` (SERIAL PRIMARY KEY)
  - `ubicacion_id` (VARCHAR(50), FK to ubicaciones)
  - `producto_id` (VARCHAR(50), FK to productos)
  - `almacen_codigo` (VARCHAR(50), nullable)
  - `cantidad` (DECIMAL(15,3))
  - `fecha_snapshot` (TIMESTAMP)
  - `fecha_carga` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

- **4 Optimized Indexes**:
  - `idx_hist_producto_ubicacion` - Product + location queries
  - `idx_hist_fecha` - Temporal queries
  - `idx_hist_ubicacion` - Location-based queries
  - `idx_hist_producto_ubicacion_fecha` - Composite with INCLUDE clause

- **Analytical View**: `v_inventario_historico_reciente`
  - Last 90 days of inventory history
  - LAG window function for variation calculation
  - Joins with productos and ubicaciones

- **Foreign Key Constraints**: ON DELETE CASCADE
- **Table and Column Comments**: Full documentation

### Migration Runner

**File**: `database/run_migrations.py`

Python script for managing migrations with the following features:

#### Commands
```bash
# List all migrations and their status
python3 run_migrations.py --list

# Apply all pending migrations
python3 run_migrations.py --up

# Rollback specific migration
python3 run_migrations.py --down 001

# Initialize schema_migrations table only
python3 run_migrations.py --init
```

#### Features
- ✅ SHA-256 checksum calculation for integrity
- ✅ Execution time tracking in milliseconds
- ✅ Transaction safety (BEGIN/COMMIT blocks)
- ✅ PostgreSQL connection via environment variables
- ✅ Compatible with AWS CDK deployments
- ✅ Idempotent migrations support

#### Environment Variables
```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=fluxion_production
export POSTGRES_USER=fluxion
export POSTGRES_PASSWORD=your_password
```

---

## 🏗️ AWS CDK Infrastructure

### RDS PostgreSQL Configuration

**File**: `infrastructure/lib/infrastructure-stack.ts` (lines 169-233)

#### Database Instance Specifications

```typescript
const dbInstance = new rds.DatabaseInstance(this, 'FluxionPostgres', {
  engine: rds.DatabaseInstanceEngine.postgres({
    version: rds.PostgresEngineVersion.VER_16_3,
  }),
  instanceType: ec2.InstanceType.of(
    ec2.InstanceClass.T3,
    ec2.InstanceSize.SMALL  // t3.small: 2 vCPU, 2GB RAM
  ),
  databaseName: 'fluxion_production',
  instanceIdentifier: 'fluxion-postgres-v2',

  // Storage: 100GB initial, auto-scale to 500GB
  allocatedStorage: 100,
  maxAllocatedStorage: 500,
  storageType: rds.StorageType.GP3,
  storageEncrypted: true,
  iops: 3000,

  // Backups: 7 days retention
  backupRetention: cdk.Duration.days(7),
  preferredBackupWindow: '03:00-04:00',  // 11 PM - 12 AM Venezuela

  // High availability: Disabled for cost (enable for production HA)
  multiAz: false,

  // Deletion protection
  removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
  deletionProtection: true,

  // Monitoring
  cloudwatchLogsExports: ['postgresql'],
  cloudwatchLogsRetention: logs.RetentionDays.ONE_WEEK,
});
```

#### Credentials Management

**Auto-generated via Secrets Manager**:
```typescript
credentials: rds.Credentials.fromGeneratedSecret('postgres', {
  secretName: 'fluxion/postgres-credentials',
}),
```

CDK automatically:
1. Creates secret in AWS Secrets Manager
2. Generates secure random password
3. Configures RDS with these credentials
4. Makes secret available to ECS tasks

#### Security Groups

**Connections configured**:
1. **WireGuard Bridge** → PostgreSQL (for La Granja SQL Server ETL)
2. **Backend Service** → PostgreSQL (for FastAPI queries)
3. **ETL Tasks** → PostgreSQL (for data loading)

```typescript
// Allow Backend to connect
dbInstance.connections.allowFrom(
  backendService,
  ec2.Port.tcp(5432),
  'Allow Backend service to access PostgreSQL'
);

// Allow ETL to connect (to be added)
dbInstance.connections.allowFrom(
  etlSecurityGroup,
  ec2.Port.tcp(5432),
  'Allow ETL tasks to access PostgreSQL'
);
```

---

## 🔐 Credentials Configuration

### How Credentials Work

1. **During CDK Deploy**:
   ```bash
   npx cdk deploy
   ```
   - CDK creates `fluxion/postgres-credentials` in Secrets Manager
   - Generates secure password automatically
   - RDS instance configured with these credentials

2. **ECS Tasks Access**:
   ```typescript
   // Backend container configuration
   backendContainer.addEnvironment('POSTGRES_HOST', dbInstance.dbInstanceEndpointAddress);
   backendContainer.addEnvironment('POSTGRES_PORT', '5432');
   backendContainer.addEnvironment('POSTGRES_DB', 'fluxion_production');

   backendContainer.addSecret('POSTGRES_USER',
     ecs.Secret.fromSecretsManager(dbInstance.secret!, 'username')
   );
   backendContainer.addSecret('POSTGRES_PASSWORD',
     ecs.Secret.fromSecretsManager(dbInstance.secret!, 'password')
   );
   ```

3. **Manual Access (for migrations)**:
   ```bash
   # Get credentials from Secrets Manager
   export POSTGRES_USER=$(aws secretsmanager get-secret-value \
     --secret-id fluxion/postgres-credentials \
     --query SecretString --output text | jq -r .username)

   export POSTGRES_PASSWORD=$(aws secretsmanager get-secret-value \
     --secret-id fluxion/postgres-credentials \
     --query SecretString --output text | jq -r .password)

   # Get RDS endpoint from CloudFormation
   export POSTGRES_HOST=$(aws cloudformation describe-stacks \
     --stack-name FluxionStackV2 \
     --query 'Stacks[0].Outputs[?OutputKey==`PostgreSQLEndpoint`].OutputValue' \
     --output text)
   ```

---

## 🚀 Deployment Workflow

### Step 1: Deploy Infrastructure

```bash
cd infrastructure
npx cdk deploy
```

**What happens**:
1. ✅ Creates VPC and networking
2. ✅ Creates RDS PostgreSQL instance (~10-15 minutes)
3. ✅ Creates Secrets Manager secret with credentials
4. ✅ Configures Security Groups
5. ✅ Outputs RDS endpoint and connection info

### Step 2: Run Database Migrations

**Option A: From Local (via VPN/Bastion)**
```bash
cd database

# Set connection variables (from Secrets Manager)
export POSTGRES_HOST=fluxion-postgres-v2.abc123.us-east-1.rds.amazonaws.com
export POSTGRES_PORT=5432
export POSTGRES_DB=fluxion_production
export POSTGRES_USER=$(aws secretsmanager get-secret-value ...)
export POSTGRES_PASSWORD=$(aws secretsmanager get-secret-value ...)

# Run migrations
python3 run_migrations.py --up
```

**Option B: From GitHub Actions**
```yaml
- name: Run Database Migrations
  run: |
    export POSTGRES_HOST=$(aws cloudformation describe-stacks ...)
    export POSTGRES_PORT=5432
    export POSTGRES_DB=fluxion_production
    export POSTGRES_USER=$(aws secretsmanager get-secret-value ...)
    export POSTGRES_PASSWORD=$(aws secretsmanager get-secret-value ...)

    cd database
    python3 run_migrations.py --up
```

**Option C: ECS Task (Recommended for Production)**

Create one-off migration task in CDK:
```typescript
const migrationTask = new ecs.FargateTaskDefinition(this, 'MigrationTask', {
  cpu: 256,
  memoryLimitMiB: 512,
});

migrationTask.addContainer('migrations', {
  image: ecs.ContainerImage.fromAsset('./database'),
  command: ['python3', 'run_migrations.py', '--up'],
  environment: {
    POSTGRES_HOST: dbInstance.dbInstanceEndpointAddress,
    POSTGRES_DB: 'fluxion_production',
  },
  secrets: {
    POSTGRES_USER: ecs.Secret.fromSecretsManager(dbInstance.secret!, 'username'),
    POSTGRES_PASSWORD: ecs.Secret.fromSecretsManager(dbInstance.secret!, 'password'),
  },
});
```

### Step 3: Update Backend/ETL Configuration

Backend and ETL tasks automatically get PostgreSQL credentials via:
- Environment variables (host, port, database)
- Secrets Manager (username, password)

---

## 📊 CDK Outputs

After deployment, CDK outputs these values:

```bash
Outputs:
FluxionStackV2.PostgreSQLEndpoint = fluxion-postgres-v2.xyz.us-east-1.rds.amazonaws.com
FluxionStackV2.PostgreSQLPort = 5432
FluxionStackV2.PostgreSQLDatabase = fluxion_production
FluxionStackV2.PostgreSQLSecretArn = arn:aws:secretsmanager:us-east-1:xxx:secret:fluxion/postgres-credentials-xxx
```

---

## 🔍 Verification Steps

### 1. Check RDS Instance Status
```bash
aws rds describe-db-instances \
  --db-instance-identifier fluxion-postgres-v2 \
  --query 'DBInstances[0].[DBInstanceStatus,Endpoint.Address]'
```

### 2. List Applied Migrations
```bash
python3 run_migrations.py --list
```

Expected output:
```
📋 Migration Status:
======================================================================
Version    Status       Migration Name
======================================================================
000        ✅ Applied   init_schema_migrations
001        ✅ Applied   add_historical_inventory
======================================================================
```

### 3. Test Database Connection
```bash
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT version();"
```

### 4. Verify Historical Inventory Table
```sql
-- Check table exists
SELECT COUNT(*) FROM inventario_historico;

-- Check view works
SELECT * FROM v_inventario_historico_reciente LIMIT 10;

-- Verify indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'inventario_historico';
```

---

## 📝 Migration Best Practices

### 1. Always Use Transactions
```sql
BEGIN;
-- Your changes here
COMMIT;
```

### 2. Make Migrations Idempotent
```sql
CREATE TABLE IF NOT EXISTS my_table (...);
CREATE INDEX IF NOT EXISTS idx_name ON my_table(column);
```

### 3. Test Locally First
```bash
# Apply
python3 run_migrations.py --up

# Verify
python3 run_migrations.py --list

# Test rollback
python3 run_migrations.py --down 002

# Reapply
python3 run_migrations.py --up
```

### 4. Document Everything
- Add comprehensive comments in SQL files
- Update migration history table
- Include rationale for schema changes

---

## 🔧 Creating New Migrations

### Step 1: Create UP Migration
```sql
-- database/migrations/002_your_feature_name_UP.sql
BEGIN;

-- Your schema changes here
CREATE TABLE new_table (...);

-- Record migration
INSERT INTO schema_migrations (version, name)
VALUES ('002', 'your_feature_name')
ON CONFLICT (version) DO NOTHING;

COMMIT;
```

### Step 2: Create DOWN Migration
```sql
-- database/migrations/002_your_feature_name_DOWN.sql
BEGIN;

-- Reverse your changes
DROP TABLE IF EXISTS new_table CASCADE;

-- Remove migration record
DELETE FROM schema_migrations WHERE version = '002';

COMMIT;
```

### Step 3: Test Locally
```bash
# Apply
python3 run_migrations.py --up

# Verify
python3 run_migrations.py --list

# Test rollback
python3 run_migrations.py --down 002

# Reapply
python3 run_migrations.py --up
```

---

## 🚨 Production Deployment Checklist

Before deploying migrations to production:

- [ ] Test migration locally
- [ ] Test rollback locally
- [ ] Verify migration is idempotent
- [ ] Review schema changes with team
- [ ] Backup production database (automated via RDS snapshots)
- [ ] Schedule maintenance window (if needed)
- [ ] Run migrations during low-traffic period
- [ ] Monitor application logs after migration
- [ ] Verify application functionality
- [ ] Document any manual steps required

---

## 💰 Cost Considerations

### RDS PostgreSQL t3.small Costs
- **Instance**: ~$30-40/month (us-east-1)
- **Storage (GP3)**: ~$11.50/month for 100GB
- **Backups**: Included (7 days retention)
- **Data Transfer**: Varies by usage
- **Total Estimated**: ~$50-60/month

### Cost Optimization Options
1. Use Reserved Instances for 1-year commitment (~30% savings)
2. Enable Multi-AZ only if high availability required (+100% cost)
3. Adjust backup retention (shorter = lower cost)
4. Monitor storage auto-scaling to avoid over-provisioning

---

## 📚 Additional Resources

- [AWS RDS PostgreSQL Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [PostgreSQL 16 Documentation](https://www.postgresql.org/docs/16/)
- [AWS CDK RDS Constructs](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds-readme.html)
- [Migration System README](../database/migrations/README.md)

---

## 🐛 Troubleshooting

### Connection Timeout
```bash
# Check Security Groups
aws ec2 describe-security-groups --group-ids sg-xxx

# Verify RDS is accessible from VPC
aws rds describe-db-instances --db-instance-identifier fluxion-postgres-v2 \
  --query 'DBInstances[0].PubliclyAccessible'
```

### Migration Failed Halfway
```bash
# Check applied migrations
python3 run_migrations.py --list

# Manually fix database if needed
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB

# Remove failed migration from tracking
DELETE FROM schema_migrations WHERE version = 'XXX';

# Try again
python3 run_migrations.py --up
```

### Credentials Not Working
```bash
# Verify secret exists
aws secretsmanager get-secret-value --secret-id fluxion/postgres-credentials

# Check RDS master username
aws rds describe-db-instances --db-instance-identifier fluxion-postgres-v2 \
  --query 'DBInstances[0].MasterUsername'
```

---

## 📅 Migration History

| Version | Name | Date | Description | Status |
|---------|------|------|-------------|--------|
| 000 | init_schema_migrations | 2025-11-25 | Initialize migration tracking system | ✅ Created |
| 001 | add_historical_inventory | 2025-11-25 | Historical inventory snapshots with analytics | ✅ Created |

---

## 🎯 Next Steps

### PENDING TASKS

1. **Complete CDK Infrastructure** (COMPLETED):
   - ✅ Add RDS PostgreSQL instance
   - ✅ Configure Security Groups for Backend
   - ✅ Add Security Groups for ETL tasks
   - ✅ Add environment variables to Backend container
   - ✅ Add environment variables to ETL containers (inventario + ventas)
   - ✅ Add CDK outputs for PostgreSQL endpoint

2. **Backend Code Migration**:
   - [ ] Update `db_manager.py` to use PostgreSQL
   - [ ] Replace DuckDB queries with PostgreSQL syntax
   - [ ] Test all API endpoints with PostgreSQL
   - [ ] Update connection pooling configuration

3. **ETL Code Migration**:
   - [ ] Update ETL scripts to use PostgreSQL
   - [ ] Modify data loaders for PostgreSQL
   - [ ] Test ETL pipeline end-to-end

4. **Testing**:
   - [ ] Local testing with PostgreSQL
   - [ ] Staging environment testing
   - [ ] Performance benchmarking
   - [ ] Load testing

5. **Documentation**:
   - ✅ Migration system documentation
   - ✅ PostgreSQL setup guide (this document)
   - [ ] API documentation updates
   - [ ] ETL process documentation

---

**Last Updated**: 2025-11-25 by Claude Code
**Status**: 🟡 In Progress - CDK Infrastructure being completed
