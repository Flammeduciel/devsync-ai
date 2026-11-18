-- Runs once, when the volume is first created.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Separate database for integration tests.
CREATE DATABASE devsync_test OWNER devsync;
\connect devsync_test
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
