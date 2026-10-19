#!/usr/bin/env node
/**
 * Gera supabase/migrations/0005_collection_acl.sql a partir de src/config/dataShards.json
 * (a mesma fonte do cliente). Assim as permissões nunca divergem.
 *   node scripts/gen-supabase-acl.mjs          → escreve o ficheiro
 *   node scripts/gen-supabase-acl.mjs --check  → exit 1 se estiver desactualizado
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'src/config/dataShards.json'), 'utf8')).collections;
const out = path.join(root, 'supabase/migrations/0005_collection_acl.sql');

// Colecções onde o registo de auditoria seria só ruído
const NOT_AUDITED = new Set(['internalChatThreads', 'notifications', 'smsWhatsappNotifications', 'notices']);
// Colecções cuja escrita só é permitida por função do servidor
const SERVER_ONLY = new Set(['homologations']);

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const arr = (a) => `array[${a.map(q).join(',')}]::text[]`;
const json = (o) => `${q(JSON.stringify(o || {}))}::jsonb`;

const rows = Object.entries(cfg).map(([name, c]) =>
  `  (${q(name)}, ${arr(c.sections)}, ${arr(c.read)}, ${arr(c.write)}, ${json(c.fieldWrites)}, ${json(c.ownerWrite)}, ` +
  `${!!c.academicYearScoped}, ${!NOT_AUDITED.has(name)}, ${SERVER_ONLY.has(name)})`
);
const sql =
  `-- GERADO por scripts/gen-supabase-acl.mjs a partir de src/config/dataShards.json. NÃO editar à mão.\n` +
  `insert into public.collection_acl\n  (collection, sections, read_roles, write_roles, field_writes, owner_write, academic_year_scoped, audited, server_only)\nvalues\n` +
  rows.join(',\n') +
  `\non conflict (collection) do update set\n  sections = excluded.sections, read_roles = excluded.read_roles, write_roles = excluded.write_roles,\n` +
  `  field_writes = excluded.field_writes, owner_write = excluded.owner_write,\n` +
  `  academic_year_scoped = excluded.academic_year_scoped, audited = excluded.audited, server_only = excluded.server_only;\n`;

if (process.argv.includes('--check')) {
  if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== sql) {
    console.error('0005_collection_acl.sql está desactualizado. Corra: npm run gen:acl');
    process.exit(1);
  }
  console.log('0005_collection_acl.sql está em dia (' + rows.length + ' colecções)');
} else {
  fs.writeFileSync(out, sql);
  console.log('Escrito ' + path.relative(root, out) + ' (' + rows.length + ' colecções)');
}
