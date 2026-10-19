#!/usr/bin/env bash
# Teste de ponta a ponta do backup/restauro por escola com um Postgres real (migrações + servidor Node).
# Requer: psql, um Postgres acessível (PGURL) e `npx tsx`.
set -euo pipefail
PGURL="${PGURL:-postgres://postgres:postgres@localhost:5432/postgres}"
DB=bm_e2e_$$
psql "$PGURL" -q -c "create database $DB"
URL="${PGURL%/*}/$DB"
trap 'psql "$PGURL" -q -c "drop database if exists $DB" >/dev/null' EXIT
psql "$URL" -q -v ON_ERROR_STOP=1 -c 'create extension if not exists pgcrypto' -f supabase/tests/00_local_auth_stub.sql >/dev/null
for f in supabase/migrations/*.sql; do psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "ERRO na migração $f"; exit 1; }; done
E2E_DB="$URL" npx tsx tests/e2e/backupPostgres.e2e.mts
