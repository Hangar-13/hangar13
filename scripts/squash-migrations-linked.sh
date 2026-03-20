#!/usr/bin/env bash
# Squash all migrations into 001 using pg_dump (no Docker required).
# Dumps schema from your hosted Supabase and replaces all migrations with one file.
set -e

cd "$(dirname "$0")/.."
MIG_DIR="supabase/migrations"

echo "=== Migration squash (no Docker) ==="
echo "This will:"
echo "  1. Create seed.sql from reference data"
echo "  2. Dump remote schema via pg_dump (requires DATABASE_URL)"
echo "  3. Replace all migrations with single 001_initial_schema.sql"
echo ""

# DATABASE_URL from env, or from .env.local (must be postgresql:// URI, not NEXT_PUBLIC_SUPABASE_URL)
if [ -z "$DATABASE_URL" ] && [ -f .env.local ]; then
  val=$(grep -E "^(SUPABASE_DB_URL|DATABASE_URL)=" .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  [ -n "$val" ] && export DATABASE_URL="$val"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL required. Get it from:"
  echo "  Supabase Dashboard > Project Settings > Database > Connection string > URI"
  echo ""
  echo "Use the Session pooler (port 5432) or Transaction pooler (port 6543) - NOT Direct."
  echo "Direct (db.xxx.supabase.co) often fails with DNS/IPv6 on many networks."
  echo "Pooler format: postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
  echo ""
  echo "Add to .env.local: SUPABASE_DB_URL='postgresql://...'  (or DATABASE_URL=...)"
  exit 1
fi
if [[ ! "$DATABASE_URL" =~ ^postgresql:// ]]; then
  echo "Error: DATABASE_URL must be a postgresql:// URI, not the Supabase API URL (https://...)."
  echo "Get the database connection string from: Project Settings > Database > Connection string"
  exit 1
fi

# Check pg_dump is available (from PostgreSQL client tools)
if ! command -v pg_dump &>/dev/null; then
  echo "Error: pg_dump not found. Install PostgreSQL client tools:"
  echo "  macOS: brew install libpq && brew link --force libpq"
  echo "  or: brew install postgresql"
  exit 1
fi

# 1. Create seed.sql BEFORE we delete migrations
echo "Creating supabase/seed.sql..."
{
  echo "-- Seed reference data. Runs after migrations on supabase db reset / supabase start."
  echo ""
  echo "-- 1. ATA chapters (must run before acs_code - IDs are referenced)"
  sed -n '6,61p' "$MIG_DIR/044_ata_chapter_complete.sql"
  echo ""
  echo "-- 2. ACS codes"
  tail -n +9 "$MIG_DIR/047_refresh_acs_codes_ids.sql"
  echo ""
  echo "-- 3. Training plan and weeks (excludes apprentice UPDATE - no apprentices yet)"
  sed -n '1,251p' "$MIG_DIR/004_seed_training_plan.sql"
} > supabase/seed.sql
echo "Created supabase/seed.sql"

# 2. Dump schema from remote (public schema only, no auth/storage)
echo "Dumping remote schema (public only)..."
pg_dump "$DATABASE_URL" \
  --schema=public \
  --schema-only \
  --no-owner \
  --no-privileges \
  --no-comments \
  -f "$MIG_DIR/001_initial_schema.sql"

# Remove psql meta-commands (\restrict, \unrestrict, etc.) - migrations expect plain SQL only
sed -i.bak '/^\\/d' "$MIG_DIR/001_initial_schema.sql" && rm -f "$MIG_DIR/001_initial_schema.sql.bak"
# Supabase migrations run with public already existing - avoid "schema already exists"
sed -i.bak 's/CREATE SCHEMA public;/CREATE SCHEMA IF NOT EXISTS public;/' "$MIG_DIR/001_initial_schema.sql" && rm -f "$MIG_DIR/001_initial_schema.sql.bak"

echo "Dumped to $MIG_DIR/001_initial_schema.sql"

# 3. Remove all other migrations
for f in "$MIG_DIR"/*.sql; do
  [ "$f" = "$MIG_DIR/001_initial_schema.sql" ] && continue
  echo "Removing: $f"
  rm "$f"
done

echo ""
echo "Done. You now have a single 001_initial_schema.sql migration."
echo ""
echo "Next step: Reset your remote DB to apply the clean slate:"
echo "  supabase db reset --linked"
echo ""
echo "This will drop the public schema, apply 001, and run seed.sql."
