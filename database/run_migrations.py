#!/usr/bin/env python3
"""
Database Migration Runner for Fluxion AI
Executes SQL migrations in versioned order
Compatible with AWS CDK deployment workflows
"""

import os
import sys
import time
import hashlib
import psycopg2
from pathlib import Path
from typing import List, Tuple, Optional

# PostgreSQL connection configuration
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'localhost')
POSTGRES_PORT = int(os.getenv('POSTGRES_PORT', '5432'))
POSTGRES_DB = os.getenv('POSTGRES_DB', 'fluxion_production')
POSTGRES_USER = os.getenv('POSTGRES_USER', 'fluxion')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'fluxion_dev_2025')

# Migration directory
MIGRATIONS_DIR = Path(__file__).parent / 'migrations'


def get_connection():
    """Get PostgreSQL database connection"""
    return psycopg2.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        database=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD
    )


def calculate_checksum(file_path: Path) -> str:
    """Calculate SHA-256 checksum of migration file"""
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b''):
            sha256.update(chunk)
    return sha256.hexdigest()


def ensure_schema_migrations_table():
    """Ensure schema_migrations table exists"""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Check if table exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'schema_migrations'
            )
        """)

        exists = cursor.fetchone()[0]

        if not exists:
            print("⚠️  schema_migrations table does not exist")
            print("📋 Creating schema_migrations table...")

            # Execute the init migration
            init_file = MIGRATIONS_DIR / '000_init_schema_migrations.sql'
            if init_file.exists():
                with open(init_file, 'r') as f:
                    sql = f.read()
                cursor.execute(sql)
                conn.commit()
                print("✅ schema_migrations table created")
            else:
                raise Exception(f"Init migration not found: {init_file}")

    finally:
        cursor.close()
        conn.close()


def get_applied_migrations() -> set:
    """Get list of already applied migrations"""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT version FROM schema_migrations ORDER BY version")
        return {row[0] for row in cursor.fetchall()}
    finally:
        cursor.close()
        conn.close()


def get_pending_migrations() -> List[Tuple[str, Path]]:
    """Get list of pending migrations to apply"""
    # Get all UP migration files
    migration_files = sorted(
        MIGRATIONS_DIR.glob('*_UP.sql'),
        key=lambda p: p.name
    )

    # Filter out 000_init (already applied)
    migration_files = [f for f in migration_files if not f.name.startswith('000_')]

    applied = get_applied_migrations()
    pending = []

    for file_path in migration_files:
        # Extract version from filename (e.g., "001" from "001_add_historical_inventory_UP.sql")
        version = file_path.name.split('_')[0]

        if version not in applied:
            pending.append((version, file_path))

    return pending


def apply_migration(version: str, file_path: Path) -> bool:
    """Apply a single migration"""
    print(f"\n📦 Applying migration {version}: {file_path.name}")

    start_time = time.time()
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Read migration SQL
        with open(file_path, 'r') as f:
            sql = f.read()

        # Calculate checksum
        checksum = calculate_checksum(file_path)

        # Execute migration
        cursor.execute(sql)

        # Migration file already records itself in schema_migrations
        # We just need to update the checksum and execution time
        execution_time_ms = int((time.time() - start_time) * 1000)

        cursor.execute("""
            UPDATE schema_migrations
            SET checksum = %s, execution_time_ms = %s
            WHERE version = %s
        """, (checksum, execution_time_ms, version))

        conn.commit()

        print(f"✅ Migration {version} applied successfully ({execution_time_ms}ms)")
        return True

    except Exception as e:
        conn.rollback()
        print(f"❌ Error applying migration {version}: {e}")
        return False

    finally:
        cursor.close()
        conn.close()


def rollback_migration(version: str) -> bool:
    """Rollback a specific migration"""
    down_file = MIGRATIONS_DIR / f"{version}_*_DOWN.sql"
    down_files = list(MIGRATIONS_DIR.glob(f"{version}_*_DOWN.sql"))

    if not down_files:
        print(f"❌ No DOWN migration found for version {version}")
        return False

    file_path = down_files[0]
    print(f"\n🔄 Rolling back migration {version}: {file_path.name}")

    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Read rollback SQL
        with open(file_path, 'r') as f:
            sql = f.read()

        # Execute rollback
        cursor.execute(sql)
        conn.commit()

        print(f"✅ Migration {version} rolled back successfully")
        return True

    except Exception as e:
        conn.rollback()
        print(f"❌ Error rolling back migration {version}: {e}")
        return False

    finally:
        cursor.close()
        conn.close()


def list_migrations():
    """List all migrations and their status"""
    applied = get_applied_migrations()
    all_migrations = sorted(MIGRATIONS_DIR.glob('*_UP.sql'), key=lambda p: p.name)

    print("\n📋 Migration Status:")
    print("=" * 70)
    print(f"{'Version':<10} {'Status':<12} {'Migration Name'}")
    print("=" * 70)

    for file_path in all_migrations:
        version = file_path.name.split('_')[0]
        name = file_path.stem.replace(f"{version}_", "").replace("_UP", "")
        status = "✅ Applied" if version in applied else "⏳ Pending"

        print(f"{version:<10} {status:<12} {name}")

    print("=" * 70)


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Run database migrations')
    parser.add_argument('--up', action='store_true', help='Apply pending migrations')
    parser.add_argument('--down', metavar='VERSION', help='Rollback specific migration version')
    parser.add_argument('--list', action='store_true', help='List all migrations')
    parser.add_argument('--init', action='store_true', help='Initialize schema_migrations table only')

    args = parser.parse_args()

    # Default: show help and list migrations
    if not any([args.up, args.down, args.list, args.init]):
        parser.print_help()
        print()
        list_migrations()
        return 0

    try:
        # Ensure schema_migrations table exists
        if not args.list:
            ensure_schema_migrations_table()

        if args.init:
            print("✅ Schema migrations table initialized")
            return 0

        if args.list:
            list_migrations()
            return 0

        if args.up:
            pending = get_pending_migrations()

            if not pending:
                print("✅ No pending migrations")
                return 0

            print(f"\n🚀 Found {len(pending)} pending migration(s)")

            for version, file_path in pending:
                if not apply_migration(version, file_path):
                    print(f"\n❌ Migration failed. Stopping.")
                    return 1

            print(f"\n🎉 All migrations applied successfully!")
            return 0

        if args.down:
            version = args.down
            if not rollback_migration(version):
                return 1
            return 0

    except Exception as e:
        print(f"❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
