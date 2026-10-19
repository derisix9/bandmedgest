/**
 * Formatos do backup da escola: JSON, XLSX, SQL e CSV.
 *
 * Tudo converte de/para o MESMO objecto canónico (o JSON de `school_backup_export()`), por isso a base de dados
 * só vê JSON e volta a validar tudo. Parte pura: sem React nem rede; a biblioteca `xlsx` vem de fora.
 *
 *  • JSON — o objecto tal e qual.
 *  • CSV  — UM ficheiro "plano": cada linha é uma `section` (meta, records, docs, prematricula_config, prematriculas,
 *           ref_payments, ref_fiscal_documents, ref_fiscal_series); o conteúdo vai em JSON na coluna `data`.
 *  • XLSX — as mesmas linhas, repartidas por folhas (info, registos, documentos, prematricula, referencia).
 *           O Excel só guarda 32 767 caracteres por célula: `data` maior é partida em várias linhas (`part`/`parts`).
 *  • SQL  — INSERTs legíveis (records, institution_docs, pré-matrícula). A app NUNCA executa o SQL: lê só este formato
 *           estrito (parser próprio) e envia o resultado pela mesma função de restauro. Qualquer outra instrução é recusada.
 *
 * Pagamentos, documentos fiscais e séries (`archive`) vão sempre como referência; o restauro nunca lhes toca.
 */
import { BACKUP_FORMAT, SchoolBackupApiError } from './schoolBackupApi';

export type BackupFormat = 'json' | 'xlsx' | 'sql' | 'csv';

export interface BackupFormatInfo { label: string; ext: string; mime: string; hint: string }

export const BACKUP_FORMAT_ORDER: BackupFormat[] = ['json', 'xlsx', 'sql', 'csv'];
export const BACKUP_FORMATS: Record<BackupFormat, BackupFormatInfo> = {
  json: { label: 'JSON', ext: '.json', mime: 'application/json', hint: 'Formato completo e mais fiável (recomendado).' },
  xlsx: { label: 'EXCEL', ext: '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hint: 'Folhas de cálculo; abre no Excel. O conteúdo de cada registo fica em JSON na coluna "data".' },
  sql: { label: 'SQL', ext: '.sql', mime: 'application/sql', hint: 'Instruções INSERT legíveis. A app só lê ficheiros SQL gerados pelo BandMed (nunca executa SQL arbitrário).' },
  csv: { label: 'CSV', ext: '.csv', mime: 'text/csv', hint: 'Um único ficheiro de texto separado por vírgulas; abre no Excel.' }
};

export const isBackupFormat = (v: string): v is BackupFormat => v in BACKUP_FORMATS;

/** Formato pela extensão do nome do ficheiro (ou null). */
export function formatFromFileName(name: string): BackupFormat | null {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  const ext = m ? m[1].toLowerCase() : '';
  return isBackupFormat(ext) ? ext : null;
}

const bad = (msg: string) => new SchoolBackupApiError('invalid-backup', msg);

// ---------------------------------------------------------------------------------------------------------------
// Modelo plano (CSV e XLSX)
// ---------------------------------------------------------------------------------------------------------------
export const FLAT_COLUMNS = ['section', 'collection', 'id', 'academic_year', 'ord', 'version', 'created_at', 'updated_at', 'part', 'parts', 'data'] as const;
export type FlatColumn = typeof FLAT_COLUMNS[number];
export type FlatRow = Record<FlatColumn, string | number | null>;

/** Limite do Excel é 32 767 caracteres por célula; fica-se abaixo, com folga. */
export const CELL_LIMIT = 30000;

type Section = 'meta' | 'records' | 'docs' | 'prematricula_config' | 'prematriculas' | 'ref_payments' | 'ref_fiscal_documents' | 'ref_fiscal_series';
const SECTIONS: Section[] = ['meta', 'records', 'docs', 'prematricula_config', 'prematriculas', 'ref_payments', 'ref_fiscal_documents', 'ref_fiscal_series'];
const META_KEYS = ['format', 'formatVersion', 'institutionId', 'schoolName', 'exportedAt'] as const;

/** Partir texto em blocos sem cortar um par de substitutos (emoji) ao meio. */
export function splitText(s: string, n: number = CELL_LIMIT): string[] {
  if (s.length <= n) return [s];
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + n, s.length);
    if (end < s.length) {
      const c = s.charCodeAt(end - 1);
      if (c >= 0xd800 && c <= 0xdbff) end -= 1;       // não separar o par
    }
    out.push(s.slice(i, end)); i = end;
  }
  return out;
}

const emptyRow = (section: Section): FlatRow => ({
  section, collection: null, id: null, academic_year: null, ord: null, version: null,
  created_at: null, updated_at: null, part: 1, parts: 1, data: ''
});

function pushChunked(rows: FlatRow[], base: FlatRow, json: string) {
  const chunks = splitText(json);
  chunks.forEach((c, i) => rows.push({ ...base, part: i + 1, parts: chunks.length, data: c }));
}

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const txt = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
};

/** Objecto canónico → linhas planas. */
export function payloadToRows(p: any): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const k of META_KEYS) rows.push({ ...emptyRow('meta'), id: k, data: String(p?.[k] ?? '') });

  for (const r of arr(p?.records)) {
    pushChunked(rows, {
      ...emptyRow('records'), collection: txt(r.collection), id: txt(r.id), academic_year: txt(r.academic_year),
      ord: num(r.ord), version: num(r.version), created_at: txt(r.created_at), updated_at: txt(r.updated_at)
    }, JSON.stringify(r.data ?? {}));
  }
  for (const d of arr(p?.docs)) {
    pushChunked(rows, { ...emptyRow('docs'), id: txt(d.key), updated_at: txt(d.updated_at) }, JSON.stringify(d.data ?? null));
  }
  if (p?.publicAdmissionConfig && typeof p.publicAdmissionConfig === 'object') {
    pushChunked(rows, { ...emptyRow('prematricula_config'), id: 'config' }, JSON.stringify(p.publicAdmissionConfig));
  }
  for (const q of arr(p?.publicAdmissionRequests)) {
    pushChunked(rows, { ...emptyRow('prematriculas'), id: txt(q.id), created_at: txt(q.created_at) }, JSON.stringify(q.data ?? {}));
  }
  arr(p?.archive?.payments).forEach((x, i) => pushChunked(rows, { ...emptyRow('ref_payments'), id: txt(x?.id) ?? String(i + 1) }, JSON.stringify(x)));
  arr(p?.archive?.fiscalDocuments).forEach((x, i) =>
    pushChunked(rows, { ...emptyRow('ref_fiscal_documents'), id: txt(x?.doc_no) ?? `${x?.doc_type ?? ''} ${x?.series ?? ''}/${x?.number ?? i + 1}` }, JSON.stringify(x)));
  arr(p?.archive?.fiscalSeries).forEach((x, i) =>
    pushChunked(rows, { ...emptyRow('ref_fiscal_series'), id: `${x?.doc_type ?? ''}:${x?.series ?? i + 1}` }, JSON.stringify(x)));
  return rows;
}

const cell = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Linhas lidas de CSV/XLSX (chaves = nomes das colunas) → objecto canónico. Lança `invalid-backup` se algo não bater. */
export function rowsToPayload(raw: Array<Record<string, unknown>>): any {
  type Group = { section: Section; collection: string; id: string; first: Record<string, unknown>; parts: Map<number, string>; declared: number };
  const groups = new Map<string, Group>();
  const order: Group[] = [];

  for (const row of raw) {
    if (FLAT_COLUMNS.every((c) => cell(row[c]).trim() === '')) continue;        // linha vazia
    const section = cell(row.section).trim() as Section;
    if (!SECTIONS.includes(section)) throw bad(`Linha com secção desconhecida ("${section || 'vazia'}"). O ficheiro não é um backup do BandMed ou foi alterado.`);
    const collection = cell(row.collection).trim();
    const id = cell(row.id).trim();
    if (!id) throw bad(`Linha da secção "${section}" sem "id".`);
    const partN = cell(row.part).trim() === '' ? 1 : Number(row.part);
    const declared = cell(row.parts).trim() === '' ? 1 : Number(row.parts);
    if (!Number.isInteger(partN) || partN < 1 || !Number.isInteger(declared) || declared < 1 || partN > declared) {
      throw bad(`Linha ${section}/${id} com numeração de partes inválida.`);
    }
    const key = [section, collection, id].join('\u0001');
    let g = groups.get(key);
    if (!g) { g = { section, collection, id, first: row, parts: new Map(), declared }; groups.set(key, g); order.push(g); }
    if (g.declared !== declared) throw bad(`Registo ${section}/${id} com partes inconsistentes.`);
    if (g.parts.has(partN)) throw bad(`Registo repetido: ${section}${collection ? '/' + collection : ''}/${id}.`);
    g.parts.set(partN, cell(row.data));
  }

  const joined = (g: Group): string => {
    if (g.parts.size !== g.declared) throw bad(`Ficheiro incompleto: faltam partes do registo ${g.section}/${g.id}. Nada foi alterado.`);
    let s = '';
    for (let i = 1; i <= g.declared; i++) s += g.parts.get(i) ?? '';
    return s;
  };
  const json = (g: Group): any => {
    const text = joined(g);                       // fora do try: "faltam partes" não pode virar "JSON inválido"
    try { return JSON.parse(text); }
    catch { throw bad(`O conteúdo de ${g.section}${g.collection ? '/' + g.collection : ''}/${g.id} não é JSON válido (ficheiro alterado ou corrompido).`); }
  };

  const meta: Record<string, string> = {};
  for (const g of order) if (g.section === 'meta') meta[g.id] = joined(g);
  if (meta.format !== BACKUP_FORMAT) throw bad('O ficheiro não é um backup válido do BandMed.');
  const version = Number(meta.formatVersion);

  const payload: any = {
    format: meta.format, formatVersion: Number.isInteger(version) ? version : meta.formatVersion,
    institutionId: meta.institutionId ?? '', schoolName: meta.schoolName ?? '', exportedAt: meta.exportedAt ?? '',
    records: [] as any[], docs: [] as any[], publicAdmissionConfig: null, publicAdmissionRequests: [] as any[],
    archive: { payments: [] as any[], fiscalDocuments: [] as any[], fiscalSeries: [] as any[] }
  };
  for (const g of order) {
    const f = g.first;
    switch (g.section) {
      case 'records': {
        const ord = cell(f.ord).trim(); const ver = cell(f.version).trim();
        if (ord !== '' && !Number.isFinite(Number(ord))) throw bad(`Registo ${g.collection}/${g.id} com "ord" inválido.`);
        if (ver !== '' && !Number.isInteger(Number(ver))) throw bad(`Registo ${g.collection}/${g.id} com "version" inválida.`);
        payload.records.push({
          collection: g.collection, id: g.id, academic_year: txt(f.academic_year), ord: ord === '' ? null : Number(ord),
          version: ver === '' ? null : Number(ver), created_at: txt(f.created_at), updated_at: txt(f.updated_at), data: json(g)
        });
        break;
      }
      case 'docs': payload.docs.push({ key: g.id, updated_at: txt(f.updated_at), data: json(g) }); break;
      case 'prematricula_config': payload.publicAdmissionConfig = json(g); break;
      case 'prematriculas': payload.publicAdmissionRequests.push({ id: g.id, created_at: txt(f.created_at), data: json(g) }); break;
      case 'ref_payments': payload.archive.payments.push(json(g)); break;
      case 'ref_fiscal_documents': payload.archive.fiscalDocuments.push(json(g)); break;
      case 'ref_fiscal_series': payload.archive.fiscalSeries.push(json(g)); break;
      default: break;
    }
  }
  payload.counts = {
    records: payload.records.length, docs: payload.docs.length, publicAdmissionRequests: payload.publicAdmissionRequests.length,
    payments: payload.archive.payments.length, fiscalDocuments: payload.archive.fiscalDocuments.length
  };
  return payload;
}

// ---------------------------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------------------------
const csvField = (v: unknown): string => {
  const s = cell(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV com BOM (o Excel abre bem os acentos) e quebras CRLF. */
export function toCsv(payload: any): string {
  const lines = [FLAT_COLUMNS.join(',')];
  for (const r of payloadToRows(payload)) lines.push(FLAT_COLUMNS.map((c) => csvField(r[c])).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

/** Lê CSV (RFC 4180: aspas, vírgulas e quebras dentro de aspas). Aceita `,` `;` ou tab (o Excel PT grava com `;`). */
export function parseCsv(text: string): string[][] {
  let s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const nl = s.search(/[\r\n]/);
  const head = nl === -1 ? s : s.slice(0, nl);
  const delim = [',', ';', '\t'].map((d) => [d, head.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = []; let f = ''; let q = false; let any = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"' && f === '') { q = true; any = true; }
    else if (c === delim) { row.push(f); f = ''; any = true; }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      if (any || f !== '') { row.push(f); rows.push(row); }
      row = []; f = ''; any = false;
    } else { f += c; any = true; }
  }
  if (q) throw bad('CSV inválido: aspas por fechar.');
  if (any || f !== '') { row.push(f); rows.push(row); }
  return rows;
}

const tableToObjects = (table: unknown[][]): Array<Record<string, unknown>> => {
  if (!table.length) return [];
  const header = table[0].map((h) => cell(h).trim().toLowerCase());
  if (!header.includes('section') || !header.includes('data')) {
    throw bad('O ficheiro não tem as colunas de um backup do BandMed (section, id, data…).');
  }
  return table.slice(1).map((r) => {
    const o: Record<string, unknown> = {};
    header.forEach((h, i) => { if (h) o[h] = r[i] ?? ''; });
    return o;
  });
};

export function payloadFromCsv(text: string): any { return rowsToPayload(tableToObjects(parseCsv(text))); }

// ---------------------------------------------------------------------------------------------------------------
// XLSX (a biblioteca `xlsx` entra por parâmetro: carrega-se só quando é preciso)
// ---------------------------------------------------------------------------------------------------------------
export interface XlsxLib {
  utils: {
    book_new(): any;
    aoa_to_sheet(rows: unknown[][]): any;
    book_append_sheet(wb: any, ws: any, name: string): void;
    sheet_to_json(ws: any, opts: any): unknown[][];
  };
  write(wb: any, opts: any): any;
  read(data: any, opts: any): { SheetNames: string[]; Sheets: Record<string, any> };
}
export type XlsxLoader = () => Promise<XlsxLib>;

const SHEET_OF: Record<Section, string> = {
  meta: 'info', records: 'registos', docs: 'documentos', prematricula_config: 'prematricula', prematriculas: 'prematricula',
  ref_payments: 'referencia', ref_fiscal_documents: 'referencia', ref_fiscal_series: 'referencia'
};
const SHEET_ORDER = ['info', 'registos', 'documentos', 'prematricula', 'referencia'];

export function toXlsxBytes(XLSX: XlsxLib, payload: any): Uint8Array {
  const bySheet = new Map<string, unknown[][]>(SHEET_ORDER.map((n) => [n, [FLAT_COLUMNS.slice() as unknown[]]]));
  for (const r of payloadToRows(payload)) bySheet.get(SHEET_OF[r.section as Section])!.push(FLAT_COLUMNS.map((c) => r[c]));
  const wb = XLSX.utils.book_new();
  for (const name of SHEET_ORDER) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bySheet.get(name)!), name);
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
  return new Uint8Array(out as ArrayBuffer);
}

export function payloadFromXlsx(XLSX: XlsxLib, bytes: ArrayBuffer | Uint8Array): any {
  let wb: ReturnType<XlsxLib['read']>;
  try { wb = XLSX.read(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { type: 'array' }); }
  catch { throw bad('Não foi possível abrir o ficheiro Excel (está corrompido ou não é .xlsx).'); }
  const all: Array<Record<string, unknown>> = [];
  let found = false;
  for (const name of wb.SheetNames) {
    const table = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false });
    const header = (table[0] ?? []).map((h) => cell(h).trim().toLowerCase());
    if (!header.includes('section') || !header.includes('data')) continue;       // folhas de notas do utilizador são ignoradas
    found = true;
    all.push(...tableToObjects(table));
  }
  if (!found) throw bad('O ficheiro Excel não tem as folhas de um backup do BandMed.');
  return rowsToPayload(all);
}

// ---------------------------------------------------------------------------------------------------------------
// SQL (formato estrito, só INSERTs; nunca é executado pela app)
// ---------------------------------------------------------------------------------------------------------------
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const lit = (v: unknown): string => (v === null || v === undefined || v === '' ? 'NULL' : typeof v === 'number' ? String(v) : q(String(v)));
const jlit = (v: unknown) => `${q(JSON.stringify(v ?? null))}::jsonb`;

export function toSql(payload: any): string {
  const inst = String(payload?.institutionId ?? '');
  const L: string[] = [
    '-- BandMed — backup da escola (SQL)',
    '-- Gerado pela aplicação. Para restaurar use Configurações → Segurança & Backups → Restaurar backup (tipo SQL).',
    '-- A app lê apenas este formato (INSERTs abaixo); nunca executa SQL arbitrário.',
    '-- Se o executar à mão no SQL Editor, faça-o só numa base vazia: não apaga dados e não toca em pagamentos/auditoria.',
    `-- @meta ${JSON.stringify(Object.fromEntries(META_KEYS.map((k) => [k, payload?.[k] ?? ''])))}`,
    'BEGIN;'
  ];
  for (const r of arr(payload?.records)) {
    L.push(`INSERT INTO public.records (institution_id, collection, id, academic_year, ord, version, created_at, updated_at, data) VALUES (${[
      q(inst), lit(r.collection), lit(r.id), lit(r.academic_year), lit(num(r.ord)), lit(num(r.version)), lit(r.created_at), lit(r.updated_at), jlit(r.data)
    ].join(', ')});`);
  }
  for (const d of arr(payload?.docs)) {
    L.push(`INSERT INTO public.institution_docs (institution_id, key, updated_at, data) VALUES (${[q(inst), lit(d.key), lit(d.updated_at), jlit(d.data)].join(', ')});`);
  }
  if (payload?.publicAdmissionConfig && typeof payload.publicAdmissionConfig === 'object') {
    L.push(`INSERT INTO public.public_admission_config (institution_id, data) VALUES (${q(inst)}, ${jlit(payload.publicAdmissionConfig)});`);
  }
  for (const x of arr(payload?.publicAdmissionRequests)) {
    L.push(`INSERT INTO public.public_admission_requests (institution_id, id, created_at, data) VALUES (${[q(inst), lit(x.id), lit(x.created_at), jlit(x.data)].join(', ')});`);
  }
  L.push('COMMIT;');
  L.push('-- Referência (nunca restaurada; só consulta):');
  for (const k of ['payments', 'fiscalDocuments', 'fiscalSeries'] as const) {
    for (const x of arr(payload?.archive?.[k])) L.push(`-- @archive ${k} ${JSON.stringify(x)}`);
  }
  return L.join('\n') + '\n';
}

type SqlValue = string | number | null | { json: unknown };
const SQL_TABLES: Record<string, string[]> = {
  records: ['institution_id', 'collection', 'id', 'academic_year', 'ord', 'version', 'created_at', 'updated_at', 'data'],
  institution_docs: ['institution_id', 'key', 'updated_at', 'data'],
  public_admission_config: ['institution_id', 'data'],
  public_admission_requests: ['institution_id', 'id', 'created_at', 'data']
};

export function payloadFromSql(text: string): any {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const n = s.length;
  let i = 0;
  let meta: Record<string, unknown> | null = null;
  const archive: Record<string, any[]> = { payments: [], fiscalDocuments: [], fiscalSeries: [] };
  const inserts: Array<{ table: string; cols: string[]; vals: SqlValue[] }> = [];

  const fail = (): never => {
    const near = s.slice(i, i + 60).replace(/\s+/g, ' ');
    throw bad(`SQL não suportado perto de "${near}". Só se aceitam ficheiros SQL gerados pelo BandMed (INSERTs de records, institution_docs e pré-matrícula).`);
  };
  const ws = () => { while (i < n && /\s/.test(s[i])) i++; };
  const word = (): string => { const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i, i + 64)); if (!m) return fail(); i += m[0].length; return m[0]; };
  const expect = (c: string) => { ws(); if (s[i] !== c) fail(); i++; };
  const kw = (w: string) => { ws(); const got = word(); if (got.toUpperCase() !== w) { i -= got.length; fail(); } };

  const literal = (): SqlValue => {
    ws();
    let v: SqlValue;
    if (s[i] === "'") {
      let out = ''; i++;
      for (;;) {
        const j = s.indexOf("'", i);
        if (j === -1) { i = n; fail(); }
        out += s.slice(i, j);
        if (s[j + 1] === "'") { out += "'"; i = j + 2; } else { i = j + 1; break; }
      }
      v = out;
    } else if (s.slice(i, i + 4).toUpperCase() === 'NULL' && !/[A-Za-z0-9_]/.test(s[i + 4] ?? '')) { i += 4; v = null; }
    else {
      const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i, i + 40));
      if (!m) return fail();
      i += m[0].length; v = Number(m[0]);
    }
    if (s[i] === ':' && s[i + 1] === ':') {                     // conversões permitidas
      i += 2; const cast = word().toLowerCase();
      if (cast === 'jsonb') {
        if (typeof v !== 'string') fail();
        try { v = { json: JSON.parse(v as string) }; } catch { throw bad('SQL com JSON inválido num registo (ficheiro alterado ou corrompido).'); }
      } else if (cast !== 'timestamptz' && cast !== 'text') fail();
    }
    return v;
  };

  while (true) {
    ws();
    if (i >= n) break;
    if (s[i] === '-' && s[i + 1] === '-') {
      const e = s.indexOf('\n', i); const line = s.slice(i + 2, e === -1 ? n : e).trim();
      if (line.startsWith('@meta ')) {
        try { meta = JSON.parse(line.slice(6)); } catch { throw bad('Cabeçalho "@meta" do SQL ilegível.'); }
      } else if (line.startsWith('@archive ')) {
        const m = /^@archive (payments|fiscalDocuments|fiscalSeries) (.*)$/.exec(line);
        if (!m) throw bad('Linha "@archive" do SQL inválida.');
        try { archive[m[1]].push(JSON.parse(m[2])); } catch { throw bad('Linha "@archive" do SQL com JSON inválido.'); }
      }
      i = e === -1 ? n : e + 1; continue;
    }
    const w = word().toUpperCase();
    if (w === 'BEGIN' || w === 'COMMIT') { expect(';'); continue; }
    if (w !== 'INSERT') { i -= w.length; fail(); }
    kw('INTO');
    ws();
    let table = word();
    if (table.toLowerCase() === 'public') { expect('.'); table = word(); }
    table = table.toLowerCase();
    const allowed = SQL_TABLES[table];
    if (!allowed) { i -= table.length; fail(); }
    expect('(');
    const cols: string[] = [];
    for (;;) { ws(); cols.push(word().toLowerCase()); ws(); if (s[i] === ',') { i++; continue; } expect(')'); break; }
    if (cols.length !== allowed.length || cols.some((c, k) => c !== allowed[k])) fail();
    kw('VALUES'); expect('(');
    const vals: SqlValue[] = [];
    for (;;) { vals.push(literal()); ws(); if (s[i] === ',') { i++; continue; } expect(')'); break; }
    if (vals.length !== cols.length) fail();
    expect(';');
    inserts.push({ table, cols, vals });
  }

  if (!meta || (meta as any).format !== BACKUP_FORMAT) throw bad('O ficheiro SQL não é um backup do BandMed (falta o cabeçalho "@meta").');
  const get = (row: { cols: string[]; vals: SqlValue[] }, c: string): SqlValue => row.vals[row.cols.indexOf(c)];
  const str = (v: SqlValue): string | null => (v === null ? null : typeof v === 'object' ? JSON.stringify(v.json) : String(v));
  const dataOf = (v: SqlValue): any => (v !== null && typeof v === 'object' ? v.json : fail());

  const payload: any = {
    format: (meta as any).format, formatVersion: (meta as any).formatVersion, institutionId: String((meta as any).institutionId ?? ''),
    schoolName: String((meta as any).schoolName ?? ''), exportedAt: String((meta as any).exportedAt ?? ''),
    records: [], docs: [], publicAdmissionConfig: null, publicAdmissionRequests: [], archive
  };
  for (const row of inserts) {
    if (str(get(row, 'institution_id')) !== payload.institutionId) throw bad('O SQL mistura dados de escolas diferentes.');
    if (row.table === 'records') {
      const ord = get(row, 'ord'); const ver = get(row, 'version');
      payload.records.push({
        collection: str(get(row, 'collection')) ?? '', id: str(get(row, 'id')) ?? '', academic_year: str(get(row, 'academic_year')),
        ord: typeof ord === 'number' ? ord : null, version: typeof ver === 'number' ? ver : null,
        created_at: str(get(row, 'created_at')), updated_at: str(get(row, 'updated_at')), data: dataOf(get(row, 'data'))
      });
    } else if (row.table === 'institution_docs') {
      payload.docs.push({ key: str(get(row, 'key')) ?? '', updated_at: str(get(row, 'updated_at')), data: dataOf(get(row, 'data')) });
    } else if (row.table === 'public_admission_config') {
      payload.publicAdmissionConfig = dataOf(get(row, 'data'));
    } else {
      payload.publicAdmissionRequests.push({ id: str(get(row, 'id')) ?? '', created_at: str(get(row, 'created_at')), data: dataOf(get(row, 'data')) });
    }
  }
  payload.counts = {
    records: payload.records.length, docs: payload.docs.length, publicAdmissionRequests: payload.publicAdmissionRequests.length,
    payments: archive.payments.length, fiscalDocuments: archive.fiscalDocuments.length
  };
  return payload;
}

// ---------------------------------------------------------------------------------------------------------------
// Entrada/saída por formato
// ---------------------------------------------------------------------------------------------------------------
export interface SerializedBackup { data: string | Uint8Array; mime: string; ext: string; bytes: number }

export async function serializeBackup(payload: any, format: BackupFormat, loadXlsx?: XlsxLoader): Promise<SerializedBackup> {
  const info = BACKUP_FORMATS[format];
  let data: string | Uint8Array;
  switch (format) {
    case 'json': data = JSON.stringify(payload); break;
    case 'csv': data = toCsv(payload); break;
    case 'sql': data = toSql(payload); break;
    case 'xlsx':
      if (!loadXlsx) throw new Error('Biblioteca XLSX indisponível.');
      data = toXlsxBytes(await loadXlsx(), payload); break;
  }
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data).length : data.length;
  return { data, mime: info.mime, ext: info.ext, bytes };
}

export interface BackupFileLike { name: string; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }

/**
 * Lê um ficheiro de backup no formato escolhido e devolve o objecto canónico (ainda por validar com `validateBackupPayload`).
 * Se a extensão não corresponder ao tipo escolhido, recusa com uma mensagem clara.
 */
export async function readBackupFile(file: BackupFileLike, chosen: BackupFormat, loadXlsx?: XlsxLoader): Promise<any> {
  const actual = formatFromFileName(file.name);
  if (actual !== chosen) {
    const got = actual ? BACKUP_FORMATS[actual].label : 'de tipo desconhecido';
    throw new SchoolBackupApiError('wrong-format',
      `Escolheu o tipo ${BACKUP_FORMATS[chosen].label}, mas o ficheiro "${file.name}" é ${got}. Mude o tipo ou escolha outro ficheiro.`);
  }
  switch (chosen) {
    case 'json': {
      try { return JSON.parse(await file.text()); }
      catch { throw bad('O ficheiro não é um backup válido do BandMed (não é JSON legível).'); }
    }
    case 'csv': return payloadFromCsv(await file.text());
    case 'sql': return payloadFromSql(await file.text());
    case 'xlsx':
      if (!loadXlsx) throw new Error('Biblioteca XLSX indisponível.');
      return payloadFromXlsx(await loadXlsx(), await file.arrayBuffer());
  }
}
