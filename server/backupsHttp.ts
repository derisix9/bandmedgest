/**
 * API HTTP dos pontos de restauro (sem Express: só `node:http`, para não acrescentar dependências).
 *
 *   GET    /backups                  lista os pontos de restauro da escola de quem pede
 *   POST   /backups                  { password }                       cria backup manual cifrado
 *   POST   /backups/run-auto                                            força um backup automático agora
 *   POST   /backups/import           corpo = ficheiro .bmbak; cabeçalho x-backup-password   (recuperação de desastre)
 *   GET    /backups/:id/download                                        descarrega o ficheiro .bmbak (cifrado)
 *   POST   /backups/:id/restore      { password?, confirm:"RESTAURAR" } restaura (cria antes um ponto de segurança)
 *   DELETE /backups/:id                                                 elimina um backup manual
 *
 * Segurança: Authorization: Bearer <token de sessão Supabase>. Só o ADMINISTRADOR ACTIVO da escola.
 * A escola vem do perfil verificado no servidor, nunca do pedido.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { BackupError, SchoolBackups, type BackupErrorCode } from './schoolBackups';

export interface Caller { userId: string; institutionId: string }
export type Authenticator = (accessToken: string) => Promise<Caller | null>;

export interface HandlerDeps {
  svc: SchoolBackups;
  authenticate: Authenticator;
  allowedOrigin?: string;
  now?: () => number;
  log?: (...a: unknown[]) => void;
  maxUploadBytes?: number;
}

const MAX_BODY = 8 * 1024;
const WRONG_PW_LIMIT = 5;
const WRONG_PW_WINDOW = 10 * 60_000;
const RUN_AUTO_MIN_GAP = 60_000;
const DEFAULT_MAX_UPLOAD = 256 * 1024 * 1024;

const STATUS: Record<BackupErrorCode, number> = {
  'bad-request': 400, 'bad-id': 400, 'weak-password': 400, 'invalid-backup': 422, corrupt: 422,
  'not-found': 404, forbidden: 403, 'wrong-password': 403, 'wrong-school': 403,
  busy: 409, 'rate-limited': 429, storage: 502, database: 502
};

class HttpError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

async function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  const chunks: Buffer[] = []; let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > max) throw new HttpError(413, 'too-large', 'Pedido grande demais.');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

export function createBackupHandler(d: HandlerDeps) {
  const now = d.now ?? Date.now;
  const log = d.log ?? (() => undefined);
  const wrongPw = new Map<string, number[]>();          // escola → instantes das palavras-passe erradas
  const lastRunAuto = new Map<string, number>();

  const tooMany = (inst: string): boolean => {
    const t = now();
    const a = (wrongPw.get(inst) ?? []).filter((x) => t - x < WRONG_PW_WINDOW);
    wrongPw.set(inst, a);
    return a.length >= WRONG_PW_LIMIT;
  };
  const noteWrong = (inst: string) => wrongPw.set(inst, [...(wrongPw.get(inst) ?? []), now()]);

  const cors = (res: ServerResponse) => {
    if (d.allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', d.allowedOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Backup-Password');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    }
  };
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };
  const parseJson = async (req: IncomingMessage): Promise<any> => {
    const raw = await readBody(req, MAX_BODY);
    if (raw.length === 0) return {};
    try { const j = JSON.parse(raw.toString('utf8')); return j && typeof j === 'object' ? j : {}; }
    catch { throw new HttpError(400, 'bad-request', 'JSON inválido.'); }
  };

  /** Devolve true se o pedido era para esta API (mesmo que tenha dado erro). */
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://x');
    const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (parts[0] !== 'backups') return false;
    cors(res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return true; }

    try {
      const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      const who = token ? await d.authenticate(token).catch(() => null) : null;
      if (!who) throw new HttpError(401, 'unauthenticated', 'Sessão inválida ou sem permissão (só o administrador da escola).');
      const inst = who.institutionId;
      const m = req.method ?? 'GET';

      if (parts.length === 1 && m === 'GET') return json(res, 200, { backups: await d.svc.list(inst) }), true;

      if (parts.length === 1 && m === 'POST') {
        const b = await parseJson(req);
        const info = await d.svc.createManual(inst, who.userId, String(b.password ?? ''));
        return json(res, 201, { backup: info }), true;
      }

      if (parts.length === 2 && parts[1] === 'run-auto' && m === 'POST') {
        const t = now();
        if (t - (lastRunAuto.get(inst) ?? 0) < RUN_AUTO_MIN_GAP) throw new BackupError('rate-limited', 'Espere um minuto antes de repetir.');
        lastRunAuto.set(inst, t);
        const r = await d.svc.runAutoNow(inst, who.userId);
        return json(res, 201, r), true;
      }

      if (parts.length === 2 && parts[1] === 'import' && m === 'POST') {
        if (tooMany(inst)) throw new BackupError('rate-limited', 'Demasiadas palavras-passe erradas. Tente mais tarde.');
        const file = await readBody(req, d.maxUploadBytes ?? DEFAULT_MAX_UPLOAD);
        try {
          const info = await d.svc.importFile(inst, file, String(req.headers['x-backup-password'] ?? ''), who.userId);
          return json(res, 201, { backup: info }), true;
        } catch (e) { if (e instanceof BackupError && e.code === 'wrong-password') noteWrong(inst); throw e; }
      }

      if (parts.length >= 2) {
        const id = decodeURIComponent(parts[1]);
        if (parts.length === 3 && parts[2] === 'download' && m === 'GET') {
          const f = await d.svc.download(inst, id);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="bandmed_${inst}_${id}.bmbak"`);
          res.setHeader('Cache-Control', 'no-store');
          res.end(f);
          return true;
        }
        if (parts.length === 3 && parts[2] === 'restore' && m === 'POST') {
          const b = await parseJson(req);
          if (b.confirm !== 'RESTAURAR') throw new BackupError('bad-request', 'Confirmação em falta: escreva RESTAURAR.');
          if (tooMany(inst)) throw new BackupError('rate-limited', 'Demasiadas palavras-passe erradas. Tente mais tarde.');
          try {
            const r = await d.svc.restore(inst, id, who.userId, { password: typeof b.password === 'string' ? b.password : undefined });
            log('restauro concluído', inst, id);
            return json(res, 200, r), true;
          } catch (e) { if (e instanceof BackupError && e.code === 'wrong-password') noteWrong(inst); throw e; }
        }
        if (parts.length === 2 && m === 'DELETE') {
          await d.svc.delete(inst, id);
          return json(res, 200, { ok: true }), true;
        }
      }
      throw new HttpError(404, 'not-found', 'Pedido desconhecido.');
    } catch (e: any) {
      if (e instanceof HttpError) { json(res, e.status, { error: e.code, message: e.message }); return true; }
      if (e instanceof BackupError) { json(res, STATUS[e.code] ?? 500, { error: e.code, message: e.message }); return true; }
      log('erro inesperado', e?.message ?? e);
      json(res, 500, { error: 'internal', message: 'Erro interno.' });
      return true;
    }
  };
}

/** Valida o token no Supabase e confirma que é um ADMINISTRADOR ACTIVO (lê o próprio perfil com o token dele: RLS). */
export function supabaseAuthenticator(cfg: { url: string; anonKey: string; fetch?: typeof fetch }): Authenticator {
  const f = cfg.fetch ?? fetch;
  const base = cfg.url.replace(/\/+$/, '');
  return async (token) => {
    const headers = { apikey: cfg.anonKey, Authorization: `Bearer ${token}` };
    const u = await f(`${base}/auth/v1/user`, { headers });
    if (!u.ok) return null;
    const uid = ((await u.json()) as { id?: string }).id;
    if (!uid) return null;
    const p = await f(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=institution_id,role,active,active_institution_id`, { headers });
    if (!p.ok) return null;
    const row = ((await p.json()) as Array<{ institution_id?: string; role?: string; active?: boolean; active_institution_id?: string | null }>)[0];
    if (!row || row.role !== 'admin' || row.active !== true || !row.institution_id) return null;
    // Escola ATIVA do administrador (mãe ou filial, migração 0024): o backup é da escola em que está a trabalhar.
    return { userId: uid, institutionId: row.active_institution_id || row.institution_id };
  };
}
