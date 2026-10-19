#!/usr/bin/env bash
# Corre as migrações e os testes de segurança (RLS) e de backup/restauro num Postgres local descartável.
# Requer: psql e um servidor Postgres acessível (variável PGURL, ex.: postgres://postgres:postgres@localhost:5432/postgres)
set -euo pipefail
PGURL="${PGURL:-postgres://postgres:postgres@localhost:5432/postgres}"
DB=bm_test_$$
psql "$PGURL" -q -c "create database $DB"
URL="${PGURL%/*}/$DB"
trap 'psql "$PGURL" -q -c "drop database if exists $DB" >/dev/null' EXIT
psql "$URL" -q -v ON_ERROR_STOP=1 -c 'create schema if not exists extensions' -c 'create extension if not exists pgcrypto with schema extensions'
psql "$URL" -q -v ON_ERROR_STOP=1 -f supabase/tests/00_local_auth_stub.sql
for f in supabase/migrations/*.sql; do echo "→ $f"; psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f"; done
OUT=$(psql "$URL" -f supabase/tests/rls.test.sql)
echo "$OUT" | tail -12
echo "$OUT" | grep -qE '^\s+[0-9]+ \|\s+0$' || { echo "TESTES DE SEGURANÇA FALHARAM"; exit 1; }
# Backup/restauro por escola em ficheiro (0012)
OUT=$(psql "$URL" -f supabase/tests/school_backup.test.sql)
echo "$OUT" | tail -14
echo "$OUT" | grep -qE '^\s+[0-9]+ \|\s+0$' || { echo "TESTES DE BACKUP/RESTAURO FALHARAM"; exit 1; }
# Eliminação de dados da escola (0015 + 0016)
OUT=$(psql "$URL" -f supabase/tests/school_delete.test.sql)
echo "$OUT" | tail -14
echo "$OUT" | grep -qE '^\s+[0-9]+ \|\s+0$' || { echo "TESTES DE ELIMINAÇÃO FALHARAM"; exit 1; }
# Filiais: escola mãe + filiais, escola ativa do administrador, isolamento (0024)
OUT=$(psql "$URL" -f supabase/tests/branches.test.sql)
echo "$OUT" | tail -14
echo "$OUT" | grep -qE '^\s+[0-9]+ \|\s+0$' || { echo "TESTES DE FILIAIS FALHARAM"; exit 1; }
