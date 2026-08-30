#!/usr/bin/env bash
# Rejoue TOUTES les migrations Phase 2 + les tests de schéma sur une base jetable.
# Aucune donnée réelle, aucun réseau distant.
#
# Usage :
#   supabase/tests/run.sh                        # Postgres local
#   ADMIN_DSN='postgres://user:pwd@host:5432/postgres' supabase/tests/run.sh
#
# Prérequis : psql dans le PATH, un serveur Postgres accessible, droit de CREATE DATABASE.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="$HERE/../migrations"
ADMIN_DSN="${ADMIN_DSN:-postgres://postgres:postgres@127.0.0.1:5432/postgres}"
TEST_DB="tayoo_ci_$$"

# DSN de la base jetable = ADMIN_DSN avec le nom de base remplacé.
TEST_DSN="$(printf '%s' "$ADMIN_DSN" | sed -E "s#/[^/?]+(\??[^/]*)$#/${TEST_DB}\1#")"

cleanup() { psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -qc "drop database if exists \"$TEST_DB\" with (force);" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ création base jetable $TEST_DB"
psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -qc "create database \"$TEST_DB\";"

echo "▶ shim auth local (test hors Supabase)"
psql "$TEST_DSN" -v ON_ERROR_STOP=1 -q -f "$HERE/00_local_auth_shim.sql"

echo "▶ migrations"
for f in "$MIG_DIR"/*.sql; do
  echo "  – $(basename "$f")"
  psql "$TEST_DSN" -v ON_ERROR_STOP=1 -q -f "$f"
done

echo "▶ tests de schéma"
psql "$TEST_DSN" -v ON_ERROR_STOP=1 -f "$HERE/10_schema_tests.sql"

echo "✅ OK — migrations + tests de schéma passent"
