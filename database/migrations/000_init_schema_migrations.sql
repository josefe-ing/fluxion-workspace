-- =========================================================================
-- Migration 000: Initialize Schema Migrations Tracking
-- Description: Creates the schema_migrations table to track database migrations
-- Date: 2025-11-25
-- Author: System
-- =========================================================================

-- Create schema_migrations table to track applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    execution_time_ms INTEGER,
    checksum VARCHAR(64),
    CONSTRAINT chk_version_format CHECK (version ~ '^\d{3}$')
);

-- Index for quick version lookups
CREATE INDEX IF NOT EXISTS idx_migrations_version
    ON schema_migrations(version);

-- Index for chronological queries
CREATE INDEX IF NOT EXISTS idx_migrations_applied_at
    ON schema_migrations(applied_at DESC);

-- Comments
COMMENT ON TABLE schema_migrations IS 'Tracks all database schema migrations applied to this database';
COMMENT ON COLUMN schema_migrations.version IS 'Migration version number (e.g., 001, 002, 003)';
COMMENT ON COLUMN schema_migrations.name IS 'Descriptive name of the migration';
COMMENT ON COLUMN schema_migrations.applied_at IS 'Timestamp when the migration was applied';
COMMENT ON COLUMN schema_migrations.execution_time_ms IS 'Time taken to execute the migration in milliseconds';
COMMENT ON COLUMN schema_migrations.checksum IS 'SHA-256 checksum of the migration file for integrity verification';

-- Insert this migration itself
INSERT INTO schema_migrations (version, name, execution_time_ms)
VALUES ('000', 'init_schema_migrations', 0)
ON CONFLICT (version) DO NOTHING;
