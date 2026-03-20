#!/usr/bin/env bash
# Squash all migrations into 001 and create seed.sql for reference data.
# Requires: Docker running, supabase start
set -e

cd "$(dirname "$0")/.."
MIG_DIR="supabase/migrations"

echo "=== Migration squash ==="
echo "This will:"
echo "  1. Create seed.sql from reference data (ata_chapter, acs_code, training_plan)"
echo "  2. Reset DB and apply all migrations"
echo "  3. Squash schema into a single migration"
echo "  4. Delete old migrations, keep only 001"
echo ""

# 1. Create seed.sql BEFORE we delete migrations (we need 044, 004, 047 content)
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

if ! docker info &>/dev/null; then
  echo "Error: Docker must be running. Start Docker Desktop and try again."
  exit 1
fi

# Ensure Supabase is running
if ! supabase status &>/dev/null; then
  echo "Starting Supabase..."
  supabase start
fi

echo "Resetting database (applies all migrations)..."
supabase db reset --no-seed

echo "Squashing migrations (schema only; INSERTs are omitted)..."
supabase migration squash --local

# Find the squashed file (squash updates the latest migration; e.g. 047)
SQUASHED=$(ls -1 "$MIG_DIR"/*.sql 2>/dev/null | sort -V | tail -1)
if [ -z "$SQUASHED" ]; then
  echo "Error: No migration file found after squash."
  exit 1
fi

echo "Squashed into: $SQUASHED"

# Remove all migrations except the squashed one
for f in "$MIG_DIR"/*.sql; do
  [ "$f" = "$SQUASHED" ] && continue
  echo "Removing: $f"
  rm "$f"
done

# Rename squashed file to 001_initial_schema.sql
NEW_NAME="$MIG_DIR/001_initial_schema.sql"
if [ "$(basename "$SQUASHED")" != "001_initial_schema.sql" ]; then
  mv "$SQUASHED" "$NEW_NAME"
  echo "Renamed to: $NEW_NAME"
fi

echo ""
echo "Done. Run 'supabase db reset' to apply the new single migration and seed."
