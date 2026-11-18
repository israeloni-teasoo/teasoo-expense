#!/usr/bin/env bash
# Copy the app's data from one Postgres database to another (e.g. Supabase → Neon).
#
#   SOURCE_DATABASE_URL='postgres://…supabase…:5432/postgres' \
#   TARGET_DATABASE_URL='postgres://…neon.tech/neondb?sslmode=require' \
#   npm run db:copy
#
# Use the DIRECT (unpooled) string for both: Supabase "Session pooler" or direct (port 5432), and Neon's
# connection string with pooling switched off (no "-pooler" in the host). Needs pg_dump / pg_restore / psql
# at least as new as the source server (Supabase runs Postgres 15 or 17: install postgresql-client-17).
#
# Copies only the app's schemas (public + drizzle, which records applied migrations), not Supabase's own
# auth/storage schemas. Refuses to write into a target that already has tables. Read-only on the source.
set -euo pipefail

: "${SOURCE_DATABASE_URL:?Set SOURCE_DATABASE_URL (the database to copy from)}"
: "${TARGET_DATABASE_URL:?Set TARGET_DATABASE_URL (the empty database to copy into)}"
for bin in pg_dump pg_restore psql; do
  command -v "$bin" >/dev/null || { echo "✗ $bin not found — install the PostgreSQL client tools"; exit 1; }
done
if [ "$SOURCE_DATABASE_URL" = "$TARGET_DATABASE_URL" ]; then echo "✗ Source and target are the same"; exit 1; fi

count_sql="select count(*) from information_schema.tables where table_schema in ('public','drizzle')"
existing=$(psql "$TARGET_DATABASE_URL" -Atc "$count_sql")
if [ "$existing" != "0" ]; then
  echo "✗ The target already has $existing table(s). Use a new, empty Neon database (or branch) and try again."
  exit 1
fi

dump=$(mktemp -t teasoo-db-XXXXXX.dump)
list=$(mktemp -t teasoo-db-XXXXXX.list)
trap 'rm -f "$dump" "$list"' EXIT

echo "→ Dumping source (schemas public, drizzle)…"
pg_dump "$SOURCE_DATABASE_URL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=drizzle --file="$dump"

echo "→ Restoring into target…"
# Every new database already has a "public" schema, so its CREATE SCHEMA entry is left out.
pg_restore --list "$dump" | grep -v ' SCHEMA - public ' > "$list"
pg_restore --dbname="$TARGET_DATABASE_URL" --no-owner --no-privileges --exit-on-error --single-transaction \
  --use-list="$list" "$dump"

echo "→ Comparing row counts…"
rows_sql="select table_schema||'.'||table_name from information_schema.tables
          where table_schema in ('public','drizzle') and table_type='BASE TABLE' order by 1"
mismatch=0
while read -r t; do
  [ -z "$t" ] && continue
  a=$(psql "$SOURCE_DATABASE_URL" -Atc "select count(*) from $t")
  b=$(psql "$TARGET_DATABASE_URL" -Atc "select count(*) from $t")
  if [ "$a" = "$b" ]; then printf '  ✓ %-40s %s\n' "$t" "$a"; else printf '  ✗ %-40s source %s, target %s\n' "$t" "$a" "$b"; mismatch=1; fi
done < <(psql "$SOURCE_DATABASE_URL" -Atc "$rows_sql")

if [ "$mismatch" = 1 ]; then echo "✗ Row counts differ — don't switch over yet"; exit 1; fi
echo "✓ Copy complete. Point DATABASE_URL / DIRECT_URL at the target and redeploy."
