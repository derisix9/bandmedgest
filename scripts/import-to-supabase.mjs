#!/usr/bin/env node
/**
 * Copia colecções de uma escola do Firebase para o Supabase (uma só vez, por escola).
 *
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/import-to-supabase.mjs --file export.json --institution inst_bandmed --collections students,matriculas,classes [--dry-run]
 *
 * `export.json` = exportação JSON do Realtime Database: o nó inteiro, ou só `inst_data/<escola>`, ou um objecto
 * { students: [...] | {chave: registo}, classes: ... }. A chave service_role fica NA SUA MÁQUINA: nunca no site nem no Git.
 * Idempotente: pode correr outra vez; só actualiza. No fim confere as contagens.
 */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const dry = process.argv.includes('--dry-run');
const file = arg('file'), inst = arg('institution'), cols = (arg('collections', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
if (!file || !inst || cols.length === 0) { console.error('Uso: --file export.json --institution <id> --collections a,b,c [--dry-run]'); process.exit(1); }
if (cols.some((c) => ['invoices', 'homologations'].includes(c))) { console.error('invoices/homologations migram na fase de finanças (RPC).'); process.exit(1); }

const decodeKey = (k) => k.replace(/~([0-9a-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
const small = (v) => (typeof v === 'string' && v.length > 30000 ? '' : v);   // base64 grande não entra na base (vai para o Storage)
const sanitizeStudent = (s) => ({
  ...s, docPassPhoto: small(s.docPassPhoto),
  docBiFile: s.docBiFile ? { ...s.docBiFile, dataUrl: small(s.docBiFile.dataUrl) } : s.docBiFile,
  docCertificateFile: s.docCertificateFile ? { ...s.docCertificateFile, dataUrl: small(s.docCertificateFile.dataUrl) } : s.docCertificateFile,
  additionalDocs: (s.additionalDocs || []).map((d) => ({ ...d, dataUrl: small(d.dataUrl) }))
});

const root = JSON.parse(fs.readFileSync(file, 'utf8'));
const base = root?.inst_data?.[inst] ?? root?.[inst] ?? root;
const strip = (v) => JSON.parse(JSON.stringify(v));   // remove undefined

function rowsFor(name) {
  const src = base?.[name];
  if (!src) return [];
  const entries = Array.isArray(src) ? src.map((r, i) => [String(r?.id ?? 'mig-' + name + '-' + i), r, i]) : Object.entries(src).map(([k, r], i) => [decodeKey(k), r, i]);
  const seen = new Set(), out = [];
  for (const [key, rec, i] of entries) {
    if (!rec || typeof rec !== 'object') continue;
    let { _o, ...data } = rec;
    if (name === 'students') data = sanitizeStudent(data);
    let id = String(data.id ?? key);
    if (seen.has(id)) id = id + '-dup' + i;
    seen.add(id);
    out.push({ institution_id: inst, collection: name, id, data: strip({ ...data, id: data.id ?? id }),
      ord: typeof _o === 'number' ? _o : i, academic_year: data.academicYear != null ? String(data.academicYear) : null });
  }
  return out;
}

const sb = dry ? null : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let bad = false;
for (const name of cols) {
  const rows = rowsFor(name);
  console.log(`${name}: ${rows.length} registos`);
  if (dry) continue;
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from('records').upsert(rows.slice(i, i + 200), { onConflict: 'institution_id,collection,id' });
    if (error) { console.error('ERRO em', name, error.message); process.exit(1); }
  }
  const { count, error } = await sb.from('records').select('id', { count: 'exact', head: true }).eq('institution_id', inst).eq('collection', name);
  if (error || count !== rows.length) { bad = true; console.error(`  ✘ conferência: esperado ${rows.length}, na base ${count} ${error?.message ?? ''}`); }
  else console.log('  ✔ conferido');
}
process.exit(bad ? 1 : 0);
