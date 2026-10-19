/**
 * Núcleo dos backups por escola: criar, listar, descarregar, importar, restaurar, apagar e a rotina agendada.
 * Não sabe de HTTP (ver backupsHttp.ts) nem do fornecedor de armazenamento (ver backupStore.ts).
 *
 * Garantias:
 *  • A escola vem SEMPRE de quem chama (já verificado), e a chave de armazenamento é calculada a partir dela:
 *    um pedido nunca consegue apontar para os ficheiros de outra escola.
 *  • Restauro: decifra e valida ANTES de tocar na base; guarda um ponto de segurança do estado actual (para desfazer);
 *    a substituição é feita pela base de dados numa única transacção (tudo ou nada).
 *  • Um restauro de cada vez por escola; backups manuais com intervalo mínimo.
 */
import { randomBytes } from 'node:crypto';
import type { BackupStore } from './backupStore';
import {
  BackupCryptoError, checkBackupPassword, decryptBackup, deriveServerPassword, encryptBackup, readBackupHeader,
  type BackupKind, type BackupMode
} from './backupCrypto';

export type BackupErrorCode =
  | 'bad-request' | 'bad-id' | 'not-found' | 'forbidden' | 'wrong-password' | 'weak-password' | 'corrupt'
  | 'wrong-school' | 'busy' | 'rate-limited' | 'storage' | 'database' | 'invalid-backup';

export class BackupError extends Error {
  constructor(public code: BackupErrorCode, message: string) { super(message); this.name = 'BackupError'; }
}

/** Ponte para a base de dados (REST do Supabase com a chave service_role). */
export interface BackupRpc {
  call(fn: string, args: Record<string, unknown>): Promise<any>;
  /** GET no PostgREST, ex.: "institutions?status=eq.active&select=id". */
  select(path: string): Promise<any[]>;
}

export interface BackupInfo { id: string; kind: BackupKind; mode: BackupMode; createdAt: string; size: number; createdBy: string | null }

/**
 * Retenção legal do histórico escolar: 10 ANOS (diários de classe, matrículas e
 * demais documentos têm prazos longos de conservação). Aplica-se às cópias
 * AUTOMÁTICAS: as mais antigas do que este prazo são descartadas pela rotina.
 * As cópias manuais nunca se apagam sozinhas (só o administrador as elimina).
 */
export const BACKUP_RETENTION_YEARS = 10;
const RETENTION_MS = BACKUP_RETENTION_YEARS * 365.25 * 86_400_000;
const SAFETY_KEEP = 5;
const MAX_JSON_BYTES = 900 * 1024 * 1024;
const ID_RE = /^(\d{8}T\d{6}Z)_(manual|auto|safety)_(p|s)_([a-z0-9]{6})$/;
const INST_RE = /^[a-z0-9_]{3,64}$/;

export function parseBackupId(id: string): { at: Date; kind: BackupKind; mode: BackupMode } {
  const m = typeof id === 'string' ? ID_RE.exec(id) : null;
  if (!m) throw new BackupError('bad-id', 'Identificador de backup inválido.');
  const s = m[1];
  return { at: new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`), kind: m[2] as BackupKind, mode: m[3] === 'p' ? 'password' : 'server' };
}
const stamp = (d: Date) => d.toISOString().replace(/[:-]|\.\d{3}/g, '');
const keyOf = (inst: string, id: string) => `schools/${inst}/${id}.bmbak`;
const prefixOf = (inst: string) => `schools/${inst}/`;
const indexKeyOf = (inst: string) => `schools/${inst}/_index.json`;
const assertInst = (inst: string) => { if (!INST_RE.test(inst || '')) throw new BackupError('bad-request', 'Escola inválida.'); };

// ---------------------------------------------------------------------------
// Agendamento (o mesmo formato guardado em Configurações → settings.automaticBackupSchedule)
// A retenção NÃO é configurável: é fixa, 10 anos (ver BACKUP_RETENTION_YEARS).
// ---------------------------------------------------------------------------
export interface Schedule { enabled: boolean; frequency: 'diario' | 'semanal' | 'mensal'; time: string; weekday: number; dayOfMonth: number }

/**
 * Valores inválidos ou em falta caem em omissões SEGURAS. Escola sem agendamento guardado → backup DIÁRIO ligado
 * às 23:00 (dados de menores: é preferível guardar de mais a nunca ter guardado). Só `enabled:false` explícito desliga.
 */
export function effectiveSchedule(s: any): Schedule {
  const raw = s && typeof s === 'object' ? s : {};
  const wd = Math.floor(Number(raw.weekday));
  const dm = Math.floor(Number(raw.dayOfMonth));
  return {
    enabled: raw.enabled !== false,
    frequency: raw.frequency === 'semanal' || raw.frequency === 'mensal' ? raw.frequency : 'diario',
    time: typeof raw.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time) ? raw.time : '23:00',
    weekday: wd >= 0 && wd <= 6 ? wd : 0,
    dayOfMonth: dm >= 1 && dm <= 31 ? dm : 1
  };
}

/** A hora do agendamento é hora de Angola (WAT, UTC+1) por omissão; BACKUP_TZ_OFFSET_MIN muda isto. */
export function lastOccurrence(s: Schedule, now: Date, tzOffsetMin = 60): Date {
  const [h, m] = s.time.split(':').map(Number);
  const local = new Date(now.getTime() + tzOffsetMin * 60_000);           // "relógio da escola" em campos UTC
  const mk = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo, d, h, m) - tzOffsetMin * 60_000);
  const y = local.getUTCFullYear(), mo = local.getUTCMonth(), d = local.getUTCDate();
  if (s.frequency === 'diario') { const t = mk(y, mo, d); return t <= now ? t : mk(y, mo, d - 1); }
  if (s.frequency === 'semanal') {
    let back = (local.getUTCDay() - s.weekday + 7) % 7;
    let t = mk(y, mo, d - back);
    if (t > now) t = mk(y, mo, d - back - 7);
    return t;
  }
  const dim = (yy: number, mm: number) => new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  let t = mk(y, mo, Math.min(s.dayOfMonth, dim(y, mo)));
  if (t > now) { const pm = new Date(Date.UTC(y, mo - 1, 1)); t = mk(pm.getUTCFullYear(), pm.getUTCMonth(), Math.min(s.dayOfMonth, dim(pm.getUTCFullYear(), pm.getUTCMonth()))); }
  return t;
}

/** Devido quando a última ocorrência agendada já passou e ainda não há backup automático depois dela. */
export function isAutoBackupDue(s: Schedule, lastAutoAt: Date | null, now: Date, tzOffsetMin = 60): boolean {
  if (!s.enabled) return false;
  const occ = lastOccurrence(s, now, tzOffsetMin);
  return !lastAutoAt || lastAutoAt.getTime() < occ.getTime();
}

export interface SchoolBackupsOptions {
  rpc: BackupRpc; store: BackupStore; masterSecret: string;
  now?: () => Date; minManualIntervalMs?: number; tzOffsetMin?: number;
}
export interface RunReport { institutionId: string; status: 'ok' | 'skipped' | 'error'; id?: string; error?: string; pruned?: number }

export class SchoolBackups {
  private rpc: BackupRpc; private store: BackupStore; private secret: string;
  private now: () => Date; private minManual: number; private tz: number;
  private locks = new Set<string>();
  private lastManual = new Map<string, number>();

  constructor(o: SchoolBackupsOptions) {
    this.rpc = o.rpc; this.store = o.store; this.secret = o.masterSecret;
    this.now = o.now ?? (() => new Date());
    this.minManual = o.minManualIntervalMs ?? 30_000;
    this.tz = o.tzOffsetMin ?? 60;
    deriveServerPassword(this.secret, 'teste');       // falha já no arranque se o segredo for fraco
  }

  private async withLock<T>(inst: string, fn: () => Promise<T>): Promise<T> {
    if (this.locks.has(inst)) throw new BackupError('busy', 'Já há uma operação de backup/restauro a decorrer nesta escola.');
    this.locks.add(inst);
    try { return await fn(); } finally { this.locks.delete(inst); }
  }

  private passwordFor(inst: string, mode: BackupMode, password?: string): string {
    if (mode === 'server') return deriveServerPassword(this.secret, inst);
    if (!password) throw new BackupError('wrong-password', 'Este backup pede a palavra-passe com que foi criado.');
    return password;
  }

  private mapCrypto(e: unknown): never {
    if (e instanceof BackupError) throw e;
    if (e instanceof BackupCryptoError) {
      const code = e.code === 'wrong-password' ? 'wrong-password' : e.code === 'weak-password' ? 'weak-password' : 'corrupt';
      throw new BackupError(code, e.message);
    }
    throw e;
  }

  async list(inst: string): Promise<BackupInfo[]> {
    assertInst(inst);
    let objs;
    try { objs = await this.store.list(prefixOf(inst)); } catch (e: any) { throw new BackupError('storage', e.message); }
    const index = await this.readIndex(inst);
    const out: BackupInfo[] = [];
    for (const o of objs) {
      const id = o.key.slice(prefixOf(inst).length).replace(/\.bmbak$/, '');
      if (!o.key.endsWith('.bmbak')) continue;
      try {
        const p = parseBackupId(id);
        out.push({ id, kind: p.kind, mode: p.mode, createdAt: p.at.toISOString(), size: o.size, createdBy: index[id]?.actorName ?? null });
      } catch { /* ficheiro estranho: ignora */ }
    }
    return out.sort((a, b) => (a.id < b.id ? 1 : -1));
  }

  // -------------------------------------------------------------------------
  // Índice de responsáveis (schools/<escola>/_index.json): id → quem criou.
  // O armazenamento dos .bmbak é a fonte da verdade; o índice só acrescenta o
  // nome do responsável sem obrigar a abrir cada ficheiro cifrado na listagem.
  // Falhas do índice NUNCA travam uma operação de backup/restauro.
  // -------------------------------------------------------------------------
  private async readIndex(inst: string): Promise<Record<string, { actor: string | null; actorName: string | null }>> {
    try {
      const raw = await this.store.get(indexKeyOf(inst));
      if (!raw) return {};
      const j = JSON.parse(raw.toString('utf8'));
      return j && typeof j === 'object' && j.entries && typeof j.entries === 'object' ? j.entries : {};
    } catch { return {}; }
  }

  private async writeIndex(inst: string, entries: Record<string, { actor: string | null; actorName: string | null }>): Promise<void> {
    try { await this.store.put(indexKeyOf(inst), Buffer.from(JSON.stringify({ v: 1, entries }), 'utf8')); }
    catch { /* o índice é auxiliar: a falha não invalida a cópia já guardada */ }
  }

  private async indexSet(inst: string, id: string, entry: { actor: string | null; actorName: string | null }): Promise<void> {
    const idx = await this.readIndex(inst);
    idx[id] = entry;
    await this.writeIndex(inst, idx);
  }

  private async indexForget(inst: string, ids: string[]): Promise<void> {
    const idx = await this.readIndex(inst);
    let changed = false;
    for (const id of ids) if (id in idx) { delete idx[id]; changed = true; }
    if (changed) await this.writeIndex(inst, idx);
  }

  /** Nome visível do responsável (melhor esforço; sem perfil legível fica null → "Sistema"). */
  private async actorNameOf(actor: string | null): Promise<string | null> {
    if (!actor) return null;
    try {
      const rows = await this.rpc.select(`profiles?id=eq.${encodeURIComponent(actor)}&select=full_name,name`);
      const name = rows?.[0]?.full_name ?? rows?.[0]?.name;
      return typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : null;
    } catch { return null; }
  }

  /** Cria e GUARDA um backup. Verifica a gravação lendo-o de volta e decifrando-o. */
  private async createInner(inst: string, actor: string | null, kind: BackupKind, password?: string): Promise<BackupInfo> {
    const mode: BackupMode = kind === 'manual' ? 'password' : 'server';
    const pw = mode === 'password' ? (checkBackupPassword(password), password as string) : deriveServerPassword(this.secret, inst);
    let snapshot: any;
    try { snapshot = await this.rpc.call('school_backup_export', { p_inst: inst, p_actor: actor }); }
    catch (e: any) { throw new BackupError('database', `Não foi possível exportar a escola: ${e.message}`); }
    if (!snapshot || snapshot.format !== 'bandmed-school-backup' || snapshot.institution_id !== inst) {
      throw new BackupError('database', 'A base de dados devolveu um backup inválido.');
    }
    const json = JSON.stringify(snapshot);
    const at = this.now();
    const id = `${stamp(at)}_${kind}_${mode === 'password' ? 'p' : 's'}_${randomBytes(4).toString('hex').slice(0, 6)}`;
    const file = encryptBackup(json, pw, { institutionId: inst, mode, kind }, at);
    const key = keyOf(inst, id);
    try {
      await this.store.put(key, file);
      const back = await this.store.get(key);
      if (!back || !back.equals(file)) throw new Error('o ficheiro lido de volta não coincide com o gravado');
      if (decryptBackup(back, pw).length !== Buffer.byteLength(json)) throw new Error('verificação de decifra falhou');
    } catch (e: any) {
      await this.store.delete(key).catch(() => undefined);
      throw new BackupError('storage', `Não foi possível guardar o backup: ${e.message}`);
    }
    const actorName = await this.actorNameOf(actor);
    await this.indexSet(inst, id, { actor, actorName });
    return { id, kind, mode, createdAt: at.toISOString(), size: file.length, createdBy: actorName };
  }

  /** Backup manual cifrado com a palavra-passe escolhida por quem o cria. */
  async createManual(inst: string, actor: string | null, password: string): Promise<BackupInfo> {
    assertInst(inst);
    try { checkBackupPassword(password); } catch (e) { this.mapCrypto(e); }
    return this.withLock(inst, async () => {
      const t = this.now().getTime(), last = this.lastManual.get(inst) ?? 0;
      if (t - last < this.minManual) throw new BackupError('rate-limited', 'Espere um momento antes de criar outro backup manual.');
      const info = await this.createInner(inst, actor, 'manual', password);
      this.lastManual.set(inst, t);
      return info;
    });
  }

  /** Backup automático agora (e poda dos antigos). */
  async runAutoNow(inst: string, actor: string | null = null): Promise<{ backup: BackupInfo; pruned: number }> {
    assertInst(inst);
    return this.withLock(inst, async () => {
      const backup = await this.createInner(inst, actor, 'auto');
      const pruned = await this.prune(inst);
      return { backup, pruned };
    });
  }

  /**
   * Retenção fixa de 10 ANOS: descarta cópias automáticas mais antigas do que o
   * prazo legal e pontos de segurança além dos 5 mais recentes. Backups manuais
   * NUNCA se apagam sozinhos.
   */
  private async prune(inst: string): Promise<number> {
    const all = await this.list(inst);
    const cutoff = this.now().getTime() - RETENTION_MS;
    const autos = all.filter((b) => b.kind === 'auto' && new Date(b.createdAt).getTime() < cutoff);
    const safeties = all.filter((b) => b.kind === 'safety').slice(SAFETY_KEEP);
    const doomed = [...autos, ...safeties];
    for (const b of doomed) await this.store.delete(keyOf(inst, b.id));
    if (doomed.length) await this.indexForget(inst, doomed.map((b) => b.id));
    return doomed.length;
  }

  async download(inst: string, id: string): Promise<Buffer> {
    assertInst(inst); parseBackupId(id);
    let f: Buffer | null;
    try { f = await this.store.get(keyOf(inst, id)); } catch (e: any) { throw new BackupError('storage', e.message); }
    if (!f) throw new BackupError('not-found', 'Backup não encontrado.');
    return f;
  }

  /** Só se apagam backups MANUAIS (os automáticos e de segurança são geridos pela retenção). */
  async delete(inst: string, id: string): Promise<void> {
    assertInst(inst);
    const p = parseBackupId(id);
    if (p.kind !== 'manual') throw new BackupError('forbidden', 'Só se podem apagar backups manuais.');
    if (!(await this.store.get(keyOf(inst, id)))) throw new BackupError('not-found', 'Backup não encontrado.');
    await this.store.delete(keyOf(inst, id));
    await this.indexForget(inst, [id]);
  }

  /**
   * Importa um ficheiro .bmbak descarregado antes (recuperação de desastre quando o armazenamento foi perdido).
   * Só entra se pertencer a ESTA escola e se a palavra-passe o decifrar e o conteúdo for um backup válido.
   */
  async importFile(inst: string, file: Buffer, password: string, actor: string | null = null): Promise<BackupInfo> {
    assertInst(inst);
    return this.withLock(inst, async () => {
      let header;
      try { header = readBackupHeader(file); } catch (e) { this.mapCrypto(e); }
      if (header!.institutionId !== inst) throw new BackupError('wrong-school', 'Este ficheiro é de outra escola.');
      if (header!.mode !== 'password') throw new BackupError('forbidden', 'Só se importam backups manuais (com palavra-passe).');
      try { this.parsePayload(decryptBackup(file, this.passwordFor(inst, 'password', password)), inst); } catch (e) { this.mapCrypto(e); }
      const at = this.now();
      const id = `${stamp(at)}_manual_p_${randomBytes(4).toString('hex').slice(0, 6)}`;
      try { await this.store.put(keyOf(inst, id), file); } catch (e: any) { throw new BackupError('storage', e.message); }
      const actorName = await this.actorNameOf(actor);
      await this.indexSet(inst, id, { actor, actorName });
      return { id, kind: 'manual' as const, mode: 'password' as const, createdAt: at.toISOString(), size: file.length, createdBy: actorName };
    });
  }

  private parsePayload(plain: Buffer, inst: string): any {
    if (plain.length > MAX_JSON_BYTES) throw new BackupError('invalid-backup', 'Backup grande demais.');
    let j: any;
    try { j = JSON.parse(plain.toString('utf8')); } catch { throw new BackupError('invalid-backup', 'Conteúdo do backup ilegível.'); }
    if (!j || j.format !== 'bandmed-school-backup' || j.version !== 1) throw new BackupError('invalid-backup', 'Isto não é um backup de escola BandMed.');
    if (j.institution_id !== inst) throw new BackupError('wrong-school', 'Este backup pertence a outra escola.');
    return j;
  }

  /**
   * Restaura. Ordem: ler → conferir escola → decifrar → validar (nada tocou na base até aqui) → ponto de segurança do
   * estado actual → restauro atómico na base. Se o restauro falhar a base fica como estava (e o ponto de segurança existe na mesma).
   */
  async restore(inst: string, id: string, actor: string | null, opts: { password?: string } = {}): Promise<{ summary: any; safetyId: string }> {
    assertInst(inst);
    parseBackupId(id);   // pontos de segurança também se podem restaurar: é assim que se desfaz um restauro
    return this.withLock(inst, async () => {
      let file: Buffer | null;
      try { file = await this.store.get(keyOf(inst, id)); } catch (e: any) { throw new BackupError('storage', e.message); }
      if (!file) throw new BackupError('not-found', 'Backup não encontrado.');
      let payload: any;
      try {
        const header = readBackupHeader(file);
        if (header.institutionId !== inst) throw new BackupError('wrong-school', 'Este ficheiro é de outra escola.');
        payload = this.parsePayload(decryptBackup(file, this.passwordFor(inst, header.mode, opts.password)), inst);
      } catch (e) { this.mapCrypto(e); }

      const safety = await this.createInner(inst, actor, 'safety');
      let summary: any;
      try { summary = await this.rpc.call('school_backup_restore', { p_inst: inst, p_payload: payload, p_actor: actor }); }
      catch (e: any) { throw new BackupError('database', `O restauro falhou e nada foi alterado (ponto de segurança ${safety.id} guardado): ${e.message}`); }
      await this.prune(inst).catch(() => 0);
      return { summary, safetyId: safety.id };
    });
  }

  /** Rotina agendada: percorre as escolas activas; a falha de uma não trava as outras. Nunca lança. */
  async runScheduled(): Promise<RunReport[]> {
    const now = this.now();
    let schools: any[], settings: any[];
    try {
      schools = await this.rpc.select('institutions?status=eq.active&select=id&order=id');
      settings = await this.rpc.select('institution_docs?key=eq.settings&select=institution_id,schedule:data->automaticBackupSchedule');
    } catch (e: any) { return [{ institutionId: '*', status: 'error', error: `Não foi possível listar as escolas: ${e.message}` }]; }
    const sched = new Map<string, any>((settings ?? []).map((r: any) => [r.institution_id, r.schedule]));
    const report: RunReport[] = [];
    for (const s of schools ?? []) {
      const inst = String(s.id);
      try {
        const sc = effectiveSchedule(sched.get(inst));
        if (!sc.enabled) { report.push({ institutionId: inst, status: 'skipped' }); continue; }
        const lastAuto = (await this.list(inst)).filter((b) => b.kind === 'auto').map((b) => new Date(b.createdAt))[0] ?? null;
        if (!isAutoBackupDue(sc, lastAuto, now, this.tz)) { report.push({ institutionId: inst, status: 'skipped' }); continue; }
        const r = await this.runAutoNow(inst);
        report.push({ institutionId: inst, status: 'ok', id: r.backup.id, pruned: r.pruned });
      } catch (e: any) {
        report.push({ institutionId: inst, status: 'error', error: e?.message ?? String(e) });
      }
    }
    return report;
  }
}
