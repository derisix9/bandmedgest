/**
 * Backup e restauro da escola num ÚNICO ficheiro (JSON, XLSX, SQL ou CSV — ver backupFormats.ts), tudo pelo próprio Supabase:
 *   • descarregar: RPC `school_backup_export()`            → o navegador guarda o ficheiro;
 *   • carregar:    RPC `school_backup_restore(ficheiro, 'RESTAURAR')` → a base de dados substitui os dados da escola, tudo ou nada.
 * (migração supabase/migrations/0012_school_backup_file.sql). Parte pura: sem React; o `rpc` vem de fora.
 * A escola nunca vem do pedido: a base de dados usa a escola do administrador autenticado.
 */

export const BACKUP_FORMAT = 'bandmed-school-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_FILE_EXT = '.json';
export const RESTORE_CONFIRM_WORD = 'RESTAURAR';
/** Limite de segurança do lado do navegador (o ficheiro é lido em memória e enviado numa só chamada). */
export const MAX_BACKUP_FILE_BYTES = 100 * 1024 * 1024;

export interface BackupFileInfo {
  schoolName: string;
  institutionId: string;
  exportedAt: string;
  counts: { records: number; docs: number; publicAdmissionRequests: number; payments: number; fiscalDocuments: number };
}
export interface RestoreSummary {
  records: number; recordsIgnored: number; invoicesRecreated: number; invoicesKept: number;
  docs: number; publicAdmissionRequests: number; backupExportedAt?: string | null;
}

export class SchoolBackupApiError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'SchoolBackupApiError'; }
}

/** Ponte para o Supabase: `supabase.rpc.bind(supabase)` serve. */
export type RpcFn = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: { message?: string; code?: string } | null }>;

export function formatBackupSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const slug = (s: string) =>
  (s || 'escola').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'escola';
const two = (n: number) => String(n).padStart(2, '0');

/** `bandmed_<escola>_2026-10-11_1813.json` (hora local); `tag` marca "antes-do-restauro"; `ext` = .json/.xlsx/.sql/.csv. */
export function backupFileName(schoolName: string, when: Date = new Date(), tag?: string, ext: string = BACKUP_FILE_EXT): string {
  const d = `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())}_${two(when.getHours())}${two(when.getMinutes())}`;
  return `bandmed_${slug(schoolName)}${tag ? `_${tag}` : ''}_${d}${ext}`;
}

/** Valida um backup já em objecto (qualquer formato acaba aqui). Lança SchoolBackupApiError com código útil. */
export function validateBackupPayload(payload: any, expectedInstitutionId?: string): { payload: any; info: BackupFileInfo } {
  if (!payload || typeof payload !== 'object' || payload.format !== BACKUP_FORMAT) {
    throw new SchoolBackupApiError('invalid-backup', 'O ficheiro não é um backup válido do BandMed.');
  }
  if (!Number.isInteger(payload.formatVersion) || payload.formatVersion < 1 || payload.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new SchoolBackupApiError('invalid-backup', 'Este backup foi criado por uma versão mais recente do BandMed. Actualize a aplicação.');
  }
  if (!Array.isArray(payload.records) || !Array.isArray(payload.docs)) {
    throw new SchoolBackupApiError('invalid-backup', 'O ficheiro está incompleto ou corrompido. Nada foi alterado na escola.');
  }
  if (expectedInstitutionId && payload.institutionId !== expectedInstitutionId) {
    throw new SchoolBackupApiError('wrong-school', 'Este backup pertence a outra escola.');
  }
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  return {
    payload,
    info: {
      schoolName: String(payload.schoolName ?? ''),
      institutionId: String(payload.institutionId ?? ''),
      exportedAt: String(payload.exportedAt ?? ''),
      counts: {
        records: payload.records.length, docs: payload.docs.length,
        publicAdmissionRequests: len(payload.publicAdmissionRequests),
        payments: len(payload.archive?.payments), fiscalDocuments: len(payload.archive?.fiscalDocuments)
      }
    }
  };
}

/** Lê e valida um ficheiro de backup JSON (sem rede). */
export function parseBackupText(text: string, expectedInstitutionId?: string): { payload: any; info: BackupFileInfo } {
  let payload: any;
  try { payload = JSON.parse(text); }
  catch { throw new SchoolBackupApiError('invalid-backup', 'O ficheiro não é um backup válido do BandMed (não é JSON legível).'); }
  return validateBackupPayload(payload, expectedInstitutionId);
}

/** Mensagem em português para erros do Supabase/Postgres e do ficheiro. */
export function friendlyBackupError(e: unknown): string {
  if (e instanceof SchoolBackupApiError) return e.message;
  const msg = e instanceof Error ? e.message : typeof (e as any)?.message === 'string' ? (e as any).message : '';
  const code = (e as any)?.code as string | undefined;
  if (/wrong-school/i.test(msg)) return 'Este backup pertence a outra escola. Nada foi alterado.';
  if (/invalid-backup/i.test(msg)) return 'O ficheiro não é um backup válido do BandMed (ou está corrompido). Nada foi alterado na escola.';
  if (/busy/i.test(msg) || code === '55P03') return 'Já há um restauro a decorrer nesta escola. Aguarde que termine.';
  if (code === '57014' || /statement timeout|canceling statement/i.test(msg)) {
    return 'O servidor demorou demasiado e cancelou a operação. Nada foi alterado. Peça ao responsável técnico para aumentar o limite de tempo (ver docs/BACKUPS_SUPABASE.md).';
  }
  if (code === '42501' || /Só o administrador|permission denied/i.test(msg)) return 'Sem permissão: só o administrador da escola, com sessão iniciada, descarrega e restaura backups.';
  if (code === 'PGRST202' || /Could not find the function/i.test(msg)) return 'A migração 0012 ainda não foi aplicada no Supabase (funções de backup em falta). Cole o ficheiro supabase/migrations/0012_school_backup_file.sql no SQL Editor do Supabase e clique em Run.';
  if (/failed to fetch|network/i.test(msg)) return 'Sem ligação ao Supabase. Verifique a internet e tente de novo.';
  return msg || 'Erro desconhecido.';
}

export function createBackupApi(rpc: RpcFn) {
  const call = async (fn: string, args?: Record<string, unknown>) => {
    const { data, error } = await rpc(fn, args);
    if (error) throw Object.assign(new Error(error.message || 'Erro do Supabase'), { code: error.code });
    return data;
  };
  return {
    /** Todos os dados da escola do administrador, prontos para guardar em ficheiro. */
    async exportBackup(): Promise<{ payload: any; text: string; info: BackupFileInfo }> {
      const payload = await call('school_backup_export');
      const text = JSON.stringify(payload);
      return { payload, text, info: parseBackupText(text).info };
    },
    /** Substitui os dados da escola pelos do ficheiro (a base de dados volta a validar tudo). */
    async restoreBackup(payload: unknown, confirm: string): Promise<RestoreSummary> {
      return (await call('school_backup_restore', { p_payload: payload, p_confirm: confirm })) as RestoreSummary;
    }
  };
}

/** Texto curto para mostrar o resultado de um restauro. */
export function describeRestoreSummary(s: RestoreSummary): string {
  let t = `Restaurado: ${s.records} registos e ${s.docs} documentos da escola.`;
  if (s.invoicesRecreated) t += ` ${s.invoicesRecreated} factura(s) em falta foram recriadas.`;
  if (s.invoicesKept) t += ` ${s.invoicesKept} factura(s) existente(s) ficaram como estavam (ligadas a pagamentos).`;
  if (s.recordsIgnored > 0) t += ` ${s.recordsIgnored} registo(s) de módulos desconhecidos foram ignorados.`;
  return t;
}

/** Guarda um ficheiro (texto ou binário) no computador do utilizador. */
export function saveFile(name: string, data: string | Uint8Array, mime = 'application/octet-stream'): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Compatibilidade: guarda texto como JSON. */
export function saveTextFile(name: string, text: string): void { saveFile(name, text, 'application/json'); }

/**
 * Depois de um restauro a cópia guardada neste navegador (localStorage/IndexedDB) está desactualizada.
 * Apaga-a para a app voltar a ler a nuvem e nunca reenviar dados antigos por cima do restauro.
 * (Esvazia o IndexedDB em vez de o apagar: apagar fica pendente enquanto a página o mantém aberto.)
 */
export async function purgeLocalSchoolCache(
  institutionId: string,
  storage: Pick<Storage, 'removeItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null,
  idb: Pick<IDBFactory, 'open'> | null = typeof indexedDB !== 'undefined' ? indexedDB : null
): Promise<void> {
  try {
    storage?.removeItem('escola_inst_' + institutionId);
    storage?.removeItem('escola_access_map_' + institutionId);
    if (institutionId === 'inst_bandmed') storage?.removeItem('bandmed_escola_db_v1');
  } catch { /* sem localStorage */ }
  if (!idb) return;
  await new Promise<void>((resolve) => {
    try {
      const open = idb.open('bandmed_school_db', 1);
      open.onerror = () => resolve();
      open.onsuccess = () => {
        try {
          const db = open.result;
          if (!db.objectStoreNames.contains('school_database')) { db.close(); resolve(); return; }
          const tx = db.transaction('school_database', 'readwrite');
          tx.objectStore('school_database').clear();
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); resolve(); };
        } catch { resolve(); }
      };
    } catch { resolve(); }
  });
}
