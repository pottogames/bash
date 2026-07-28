#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres and runs the RLS test suite.
#
# Used by CI and locally. It deliberately does not use the Supabase CLI: the
# only Supabase-specific things the schema depends on are `auth.users` and
# `auth.uid()`, and `supabase/tests/00_auth_stub.sql` supplies both — so the
# policies can be tested against a plain Postgres in a few seconds.
set -euo pipefail

HOST="${PGHOST:-/tmp}"
PORT="${PGPORT:-55432}"
USER="${PGUSER:-postgres}"
DB="${PGDATABASE:-plan2quote_test}"

psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -q \
  -c "drop database if exists $DB;" -c "create database $DB;"

run() { psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$1"; }

run supabase/tests/00_auth_stub.sql
for f in supabase/migrations/*.sql; do
  echo "  migrate $(basename "$f")"
  run "$f"
done

echo "  rls tests"
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/tests/10_rls.test.sql
