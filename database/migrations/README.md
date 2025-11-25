# Database Migrations System

This directory contains all database schema migrations for Fluxion AI PostgreSQL v2.0.

## Migration Files

Migrations follow a strict naming convention:

```
{VERSION}_{description}_{DIRECTION}.sql
```

- `VERSION`: Three-digit number (001, 002, 003, etc.)
- `description`: Snake_case description of the migration
- `DIRECTION`: Either `UP` or `DOWN`

### Current Migrations

#### Migration 000: Initialize Schema Migrations
- **File**: `000_init_schema_migrations.sql`
- **Description**: Creates the `schema_migrations` tracking table
- **Status**: System migration (always applied first)

#### Migration 001: Add Historical Inventory System
- **UP**: `001_add_historical_inventory_UP.sql`
- **DOWN**: `001_add_historical_inventory_DOWN.sql`
- **Description**: Complete historical inventory tracking feature
- **Components**:
  - Table: `inventario_historico`
  - View: `v_inventario_historico_reciente`
  - 4 indexes for query optimization
  - Foreign key constraints
  - Table and column comments

## Migration Runner

The `run_migrations.py` script manages all database migrations.

### Usage

#### List All Migrations
```bash
cd /Users/jose/Developer/fluxion-workspace/database
python3 run_migrations.py --list
```

#### Apply Pending Migrations
```bash
# Apply all pending migrations
python3 run_migrations.py --up
```

#### Rollback a Migration
```bash
# Rollback specific version
python3 run_migrations.py --down 001
```

#### Initialize Schema Migrations Table
```bash
# First time setup
python3 run_migrations.py --init
```

### Environment Variables

The migration runner uses these PostgreSQL environment variables:

```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=fluxion_production
export POSTGRES_USER=fluxion
export POSTGRES_PASSWORD=your_password
```

## AWS CDK Integration

For production deployments using AWS CDK:

### During CDK Deploy

Add to your CDK deployment workflow (GitHub Actions or manual):

```bash
# In your deployment script or GitHub Actions workflow
- name: Run Database Migrations
  run: |
    export POSTGRES_HOST=${{ secrets.RDS_HOST }}
    export POSTGRES_DB=fluxion_production
    export POSTGRES_USER=${{ secrets.RDS_USER }}
    export POSTGRES_PASSWORD=${{ secrets.RDS_PASSWORD }}

    cd database
    python3 run_migrations.py --up
```

### Using ECS Task (Alternative)

Create a one-off ECS task that runs migrations:

```typescript
// In your CDK stack
import * as ecs from 'aws-cdk-lib/aws-ecs';

const migrationTask = new ecs.FargateTaskDefinition(this, 'MigrationTask', {
  cpu: 256,
  memoryLimitMiB: 512,
});

migrationTask.addContainer('migrations', {
  image: ecs.ContainerImage.fromAsset('./database'),
  command: ['python3', 'run_migrations.py', '--up'],
  environment: {
    POSTGRES_HOST: rdsInstance.dbInstanceEndpointAddress,
    POSTGRES_DB: 'fluxion_production',
  },
  secrets: {
    POSTGRES_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret),
  },
  logging: new ecs.AwsLogDriver({ streamPrefix: 'migrations' }),
});
```

## Creating New Migrations

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
# Apply migration
python3 run_migrations.py --up

# Verify
python3 run_migrations.py --list

# Test rollback
python3 run_migrations.py --down 002

# Reapply
python3 run_migrations.py --up
```

## Best Practices

### 1. Always Use Transactions
Wrap all migrations in `BEGIN;` / `COMMIT;` blocks for atomicity.

### 2. Include Rollback Scripts
Every UP migration must have a corresponding DOWN migration.

### 3. Test Locally First
Always test migrations on local database before production:
```bash
# Local test
python3 run_migrations.py --up

# Verify data
psql -h localhost -U fluxion -d fluxion_production
```

### 4. Idempotent Migrations
Use `IF EXISTS` / `IF NOT EXISTS` to make migrations idempotent:
```sql
CREATE TABLE IF NOT EXISTS my_table (...);
CREATE INDEX IF NOT EXISTS idx_name ON my_table(column);
```

### 5. Document Everything
- Add comprehensive comments in SQL files
- Update this README with new migrations
- Include rationale for schema changes

### 6. Schema Migrations Table
The migration runner automatically tracks:
- Version number
- Migration name
- Applied timestamp
- Execution time (milliseconds)
- File checksum (SHA-256)

## Production Deployment Checklist

Before deploying migrations to production:

- [ ] Test migration locally
- [ ] Test rollback locally
- [ ] Verify migration is idempotent
- [ ] Review schema changes with team
- [ ] Backup production database
- [ ] Schedule maintenance window (if needed)
- [ ] Run migrations during low-traffic period
- [ ] Monitor application logs after migration
- [ ] Verify application functionality
- [ ] Document any manual steps required

## Troubleshooting

### Migration Failed Halfway
If a migration fails and the database is in inconsistent state:

```bash
# Check which migrations are applied
python3 run_migrations.py --list

# Manually fix the database if needed
psql -h localhost -U fluxion -d fluxion_production

# Remove failed migration from tracking
DELETE FROM schema_migrations WHERE version = 'XXX';

# Try again
python3 run_migrations.py --up
```

### Rollback Not Working
If DOWN migration fails:

```bash
# Manually inspect the database
psql -h localhost -U fluxion -d fluxion_production

# Manually execute rollback SQL
\i database/migrations/001_migration_name_DOWN.sql
```

### Connection Issues
Verify PostgreSQL connection:

```bash
# Test connection
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB

# Check environment variables
env | grep POSTGRES
```

## Migration History

| Version | Name | Date | Description |
|---------|------|------|-------------|
| 000 | init_schema_migrations | 2025-11-25 | Initialize migration tracking system |
| 001 | add_historical_inventory | 2025-11-25 | Historical inventory snapshots with analytics |

## Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [AWS RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [AWS CDK](https://docs.aws.amazon.com/cdk/latest/guide/home.html)
