/**
 * Armazenamento dos backups: pasta local (FsBackupStore) ou qualquer S3 compatível (S3BackupStore, sem SDK).
 * As chaves são sempre `schools/{escola}/{id}.bmbak`; `assertSafeKey` impede fugas de pasta ("..", "/abs", "\\").
 */
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { signV4 } from './sigv4';

export interface StoredObject { key: string; size: number; lastModified: string }
export interface BackupStore {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  list(prefix: string): Promise<StoredObject[]>;
  delete(key: string): Promise<void>;
}

/** Letras, dígitos e _ - . /  — sem "..", sem barra inicial nem final, sem "//". */
const KEY_RE = /^[A-Za-z0-9_][A-Za-z0-9_.\-/]{0,200}$/;
export function assertSafeKey(key: string): void {
  if (typeof key !== 'string' || !KEY_RE.test(key) || key.includes('..') || key.includes('//') || key.endsWith('/')) {
    throw new Error(`Chave de armazenamento inválida: ${String(key).slice(0, 80)}`);
  }
}
const assertSafePrefix = (p: string) => { if (p !== '') assertSafeKey(p.endsWith('/') ? p.slice(0, -1) : p); };

// ---------------------------------------------------------------------------
// Pasta local
// ---------------------------------------------------------------------------
export class FsBackupStore implements BackupStore {
  private root: string;
  constructor(dir: string) { this.root = path.resolve(dir); }
  private full(key: string): string {
    assertSafeKey(key);
    const f = path.resolve(this.root, key);
    if (!f.startsWith(this.root + path.sep)) throw new Error('Chave fora da pasta de backups');
    return f;
  }
  async put(key: string, body: Buffer): Promise<void> {
    const f = this.full(key);
    await mkdir(path.dirname(f), { recursive: true });
    const tmp = `${f}.${randomBytes(4).toString('hex')}.tmp`;     // escrita atómica: nunca fica um ficheiro a meio
    try { await writeFile(tmp, body, { mode: 0o600 }); await rename(tmp, f); }
    catch (e) { await rm(tmp, { force: true }); throw e; }
  }
  async get(key: string): Promise<Buffer | null> {
    try { return await readFile(this.full(key)); } catch (e: any) { if (e?.code === 'ENOENT') return null; throw e; }
  }
  async list(prefix: string): Promise<StoredObject[]> {
    assertSafePrefix(prefix);
    const dirRel = prefix.endsWith('/') ? prefix.slice(0, -1) : path.posix.dirname(prefix);
    const base = prefix.endsWith('/') ? '' : path.posix.basename(prefix);
    const dir = dirRel && dirRel !== '.' ? this.full(dirRel) : this.root;
    let names: string[];
    try { names = await readdir(dir); } catch (e: any) { if (e?.code === 'ENOENT') return []; throw e; }
    const out: StoredObject[] = [];
    for (const n of names.sort()) {
      if (n.endsWith('.tmp') || (base && !n.startsWith(base))) continue;
      const key = dirRel && dirRel !== '.' ? `${dirRel}/${n}` : n;
      const s = await stat(path.join(dir, n));
      if (s.isFile()) out.push({ key, size: s.size, lastModified: s.mtime.toISOString() });
    }
    return out;
  }
  async delete(key: string): Promise<void> { await rm(this.full(key), { force: true }); }
}

// ---------------------------------------------------------------------------
// S3 compatível (path-style: {endpoint}/{bucket}/{key})
// ---------------------------------------------------------------------------
export interface S3Config {
  endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string;
  prefix?: string; fetch?: typeof fetch; retries?: number; retryDelayMs?: number;
}
const xmlText = (s: string, tag: string): string[] =>
  [...s.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'));

export class S3BackupStore implements BackupStore {
  private pre: string;
  private f: typeof fetch;
  constructor(private cfg: S3Config) {
    const p = (cfg.prefix || '').replace(/^\/+|\/+$/g, '');
    this.pre = p ? p + '/' : '';
    this.f = cfg.fetch ?? fetch;
  }
  private url(key: string, query = ''): string {
    const ep = this.cfg.endpoint.replace(/\/+$/, '');
    return `${ep}/${this.cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}${query}`;
  }
  private async call(method: string, key: string, query = '', body?: Buffer, okStatuses: number[] = [200]): Promise<Response> {
    const url = this.url(key, query);
    const attempts = (this.cfg.retries ?? 3) + 1;
    let last = 'sem resposta';
    for (let a = 0; a < attempts; a++) {
      try {
        const headers = signV4({ method, url, body, region: this.cfg.region, accessKeyId: this.cfg.accessKeyId, secretAccessKey: this.cfg.secretAccessKey });
        const res = await this.f(url, { method, headers, body: body as any });
        if (okStatuses.includes(res.status)) return res;
        const txt = (await res.text().catch(() => '')).slice(0, 200);
        last = `HTTP ${res.status} ${txt}`;
        if (res.status < 500 && res.status !== 429) throw Object.assign(new Error(last), { final: true });
      } catch (e: any) {
        if (e?.final) throw new Error(`Armazenamento S3 recusou o pedido: ${e.message}`);
        last = e instanceof Error ? e.message : String(e);
      }
      if (a < attempts - 1) await new Promise((r) => setTimeout(r, (this.cfg.retryDelayMs ?? 400) * 2 ** a));
    }
    throw new Error(`Armazenamento S3 indisponível: ${last}`);
  }
  async put(key: string, body: Buffer): Promise<void> { assertSafeKey(key); await this.call('PUT', this.pre + key, '', body, [200]); }
  async get(key: string): Promise<Buffer | null> {
    assertSafeKey(key);
    const res = await this.call('GET', this.pre + key, '', undefined, [200, 404]);
    return res.status === 404 ? null : Buffer.from(await res.arrayBuffer());
  }
  async delete(key: string): Promise<void> { assertSafeKey(key); await this.call('DELETE', this.pre + key, '', undefined, [200, 204, 404]); }
  async list(prefix: string): Promise<StoredObject[]> {
    assertSafePrefix(prefix);
    const out: StoredObject[] = [];
    let token = '';
    for (let page = 0; page < 1000; page++) {
      const q = `?list-type=2&prefix=${encodeURIComponent(this.pre + prefix)}` + (token ? `&continuation-token=${encodeURIComponent(token)}` : '');
      const res = await this.call('GET', '', q.replace(/^/, ''), undefined, [200]);
      const xml = await res.text();
      const contents = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((m) => m[1]);
      for (const c of contents) {
        const k = xmlText(c, 'Key')[0] ?? '';
        if (!k.startsWith(this.pre)) continue;
        out.push({ key: k.slice(this.pre.length), size: Number(xmlText(c, 'Size')[0] ?? 0), lastModified: xmlText(c, 'LastModified')[0] ?? '' });
      }
      if (xmlText(xml, 'IsTruncated')[0] === 'true' && xmlText(xml, 'NextContinuationToken')[0]) token = xmlText(xml, 'NextContinuationToken')[0];
      else break;
    }
    return out.sort((a, b) => (a.key < b.key ? -1 : 1));
  }
}
