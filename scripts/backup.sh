#!/usr/bin/env bash
# Backup externo da base Supabase (Postgres), CIFRADO. Corre no GitHub Actions (.github/workflows/backup.yml) ou num cron.
# Dados de menores e de saúde: nunca sai da máquina sem cifra.
#   SUPABASE_DB_URL=postgresql://postgres:...@db.xxxx.supabase.co:5432/postgres BACKUP_PASSPHRASE=... ./scripts/backup.sh
# Gera backup_AAAAMMDD_HHMM.dump.gpg  (esquemas public + app (funções de permissões e auditoria) + dados de auth.users/identities para recriar contas)
set -euo pipefail
: "${SUPABASE_DB_URL:?defina SUPABASE_DB_URL}"
: "${BACKUP_PASSPHRASE:?defina BACKUP_PASSPHRASE (guarde-a FORA do GitHub também)}"
OUT="backup_$(date -u +%Y%m%d_%H%M).dump"
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges --schema=public --schema=app --schema=auth --file="$OUT"
gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 -o "$OUT.gpg" "$OUT"
rm -f "$OUT"
echo "Criado $OUT.gpg ($(du -h "$OUT.gpg" | cut -f1))"
# Não inclui ficheiros do Storage (bucket school-files): copie-os à parte (ver backup.yml, passo "Storage").
# Restauro: gpg -d backup.dump.gpg > backup.dump && pg_restore --clean --no-owner --no-privileges -d "$TEST_DB_URL" backup.dump
