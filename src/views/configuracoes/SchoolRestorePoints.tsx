import React, { useCallback, useMemo, useRef, useState } from 'react';
import { supabase } from '../../services/supabase';
import { dbService } from '../../services/db';
import {
  MAX_BACKUP_FILE_BYTES, RESTORE_CONFIRM_WORD, backupFileName, createBackupApi, describeRestoreSummary,
  formatBackupSize, friendlyBackupError, purgeLocalSchoolCache, saveFile, validateBackupPayload,
  type BackupFileInfo
} from '../../utils/schoolBackupApi';
import {
  BACKUP_FORMATS, BACKUP_FORMAT_ORDER, isBackupFormat, readBackupFile, serializeBackup,
  type BackupFormat, type XlsxLib
} from '../../utils/backupFormats';

/** A biblioteca xlsx só é carregada quando se escolhe/usa o tipo Excel. */
const loadXlsx = async () => (await import('xlsx')) as unknown as XlsxLib;

interface Props {
  /** Só o administrador descarrega/restaura (a base de dados volta a verificar). */
  isAdmin: boolean;
}

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'medium' }); } catch { return iso; }
};

/**
 * Configurações → Segurança & Backups → Cópias de Segurança & Restauro.
 *   • "Baixar backup": um ficheiro .json com todos os dados da escola.
 *   • "Carregar backup": o mesmo ficheiro volta a entrar e substitui os dados da escola (tudo ou nada) —
 *     serve para repor uma versão anterior (downgrade) ou recuperar dados.
 * Antes de restaurar, descarrega-se automaticamente o estado actual (para poder desfazer).
 * Tudo corre no Supabase (funções SQL da migração 0012): sem Storage, cron nem Edge Function.
 */
export const SchoolRestorePoints: React.FC<Props> = ({ isAdmin }) => {
  const api = useMemo(() => createBackupApi((fn, args) => supabase.rpc(fn, args)), []);

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [loaded, setLoaded] = useState<{ name: string; size: number; payload: any; info: BackupFileInfo } | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<BackupFormat>('json');
  const [restoreFormat, setRestoreFormat] = useState<BackupFormat>('json');
  const [confirming, setConfirming] = useState(false);
  const [confirmWord, setConfirmWord] = useState('');

  const say = (kind: 'ok' | 'err', text: string) => setNotice({ kind, text });

  const audit = (action: string, details: string) => {
    try {
      dbService.addAuditLog({
        userName: dbService.getDatabase().currentUser?.name || 'Administrador',
        userRole: dbService.getDatabase().currentUser?.roleTitle || 'Administrador Geral',
        action, details, module: 'sistema', timestamp: 'Agora mesmo', badgeColor: '#0b1f3a'
      });
    } catch { /* a auditoria do servidor permanece */ }
  };

  const schoolName = () => dbService.getDatabase().settings?.schoolName || 'escola';

  const run = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(label); setNotice(null);
    try { return await fn(); }
    catch (e) { say('err', friendlyBackupError(e)); return undefined; }
    finally { setBusy(null); }
  }, []);

  // ---------- Baixar ----------
  const handleDownload = async () => {
    const fmt = downloadFormat;
    const r = await run('A preparar o backup…', async () => {
      const exp = await api.exportBackup();
      return { exp, file: await serializeBackup(exp.payload, fmt, loadXlsx) };
    });
    if (!r) return;
    const name = backupFileName(r.exp.info.schoolName || schoolName(), new Date(), undefined, r.file.ext);
    saveFile(name, r.file.data, r.file.mime);
    audit('Backup da Escola Descarregado', `Ficheiro ${name} (${formatBackupSize(r.file.bytes)}) com ${r.exp.info.counts.records} registos.`);
    say('ok', `Backup guardado: ${name} (${formatBackupSize(r.file.bytes)}). Guarde-o num local seguro: contém dados pessoais dos alunos e funcionários.`);
  };

  // ---------- Carregar ----------
  const handlePick = async (file: File | null) => {
    setLoaded(null); setNotice(null);
    if (!file) return;
    if (file.size > MAX_BACKUP_FILE_BYTES) { say('err', `Ficheiro demasiado grande (${formatBackupSize(file.size)}).`); return; }
    try {
      const raw = await readBackupFile(file, restoreFormat, loadXlsx);
      const { payload, info } = validateBackupPayload(raw, dbService.activeInstitutionId);
      setLoaded({ name: file.name, size: file.size, payload, info });
    } catch (e) {
      say('err', friendlyBackupError(e));
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const closeConfirm = () => { setConfirming(false); setConfirmWord(''); };
  const canRestore = !!loaded && confirmWord === RESTORE_CONFIRM_WORD && !busy;

  const handleRestore = async () => {
    if (!loaded || !canRestore) return;
    const file = loaded;
    // 1) Ponto de segurança: descarrega o estado ACTUAL. Se falhar, não se restaura.
    const safety = await run('A guardar o estado actual (ponto de segurança)…', async () => {
      const cur = await api.exportBackup();
      const name = backupFileName(cur.info.schoolName || schoolName(), new Date(), 'antes-do-restauro');
      saveFile(name, cur.text, BACKUP_FORMATS.json.mime);      // a cópia de segurança é sempre JSON (formato completo)
      return name;
    });
    if (!safety) return;
    // 2) Restauro (tudo ou nada, na base de dados)
    const summary = await run('A restaurar… (não feche esta página)', () => api.restoreBackup(file.payload, confirmWord));
    if (!summary) return;      // erro já mostrado; a escola ficou como estava
    closeConfirm(); setLoaded(null); if (fileRef.current) fileRef.current.value = '';
    say('ok', `${describeRestoreSummary(summary)} O estado anterior ficou guardado em ${safety}. A recarregar…`);
    audit('Restauro da Escola a partir de Backup', `Ficheiro ${file.name} (de ${fmtDate(file.info.exportedAt)}) restaurado; estado anterior guardado em ${safety}.`);
    // A cópia local está desactualizada: apaga-a e recarrega a app a partir da nuvem.
    await purgeLocalSchoolCache(dbService.activeInstitutionId);
    setTimeout(() => window.location.reload(), 2500);
  };

  return (
    <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-4" data-testid="school-restore-points">
      <div className="pb-3 border-b border-slate-100">
        <h3 className="font-headline text-base lg:text-lg font-bold text-slate-900">2. Backup e Restauração</h3>
        <p className="text-xs text-slate-500">
          Baixe um ficheiro com todos os dados desta escola.
          Pagamentos, documentos fiscais e o registo de auditoria nunca são apagados nem reescritos.
        </p>
      </div>

      {!isAdmin && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">Só o administrador da escola descarrega e restaura backups.</p>}

      {isAdmin && (
        <>
          {notice && (
            <div role="status" className={`text-xs rounded-lg p-3 border ${notice.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-800'}`}>{notice.text}</div>
          )}
          {busy && <div className="text-xs text-slate-500" aria-live="polite">{busy}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-slate-600 uppercase">Baixar</span>
              <span className="text-[11px] text-slate-500">
                Gera um ficheiro com os registos, definições, pautas, calendário e pré-matrículas da escola
                (mais, só para consulta, pagamentos e documentos fiscais). Não leva contas nem palavras-passe.
              </span>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
                Tipo de ficheiro
                           <select value={downloadFormat} disabled={!!busy} onChange={(e) => isBackupFormat(e.target.value) && setDownloadFormat(e.target.value)}
                  data-testid="backup-download-format" className="p-2 text-xs border border-slate-300 rounded-lg bg-white font-normal text-slate-800">
                  {BACKUP_FORMAT_ORDER.map((f) => <option key={f} value={f}>{BACKUP_FORMATS[f].label} ({BACKUP_FORMATS[f].ext})</option>)}
                </select>
                <span className="font-normal text-slate-500">{BACKUP_FORMATS[downloadFormat].hint}</span>
              </label>
              <div>
                <button type="button" disabled={!!busy} onClick={handleDownload} className="px-3 py-2 rounded-lg bg-[#0b1f3a] text-white text-xs font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Baixar backup ({BACKUP_FORMATS[downloadFormat].ext})
                </button>
              </div>
              <span className="text-[11px] text-amber-1500">O ficheiro não está cifrado e tem dados pessoais: guarde-o num local seguro.</span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-slate-600 uppercase">Carregar</span>
              <span className="text-[11px] text-slate-500">
                Escolha um ficheiro descarregado antes desta escola. Os dados actuais da escola serão <strong>substituídos</strong> pelos do ficheiro, quer seja mais antigo ou mais recente.
              </span>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
                Tipo de ficheiro a carregar
                <select value={restoreFormat} disabled={!!busy}
                  onChange={(e) => {
                    if (!isBackupFormat(e.target.value)) return;
                    setRestoreFormat(e.target.value); setLoaded(null); setNotice(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                  data-testid="backup-restore-format" className="p-2 text-xs border border-slate-300 rounded-lg bg-white font-normal text-slate-800">
                  {BACKUP_FORMAT_ORDER.map((f) => <option key={f} value={f}>{BACKUP_FORMATS[f].label} ({BACKUP_FORMATS[f].ext})</option>)}
                </select>
              </label>
              <input key={restoreFormat} ref={fileRef} type="file" accept={BACKUP_FORMATS[restoreFormat].ext} disabled={!!busy} onChange={(e) => handlePick(e.target.files?.[0] ?? null)} className="text-xs" />
              {loaded && (
                <div className="text-[11px] text-slate-700 bg-white border border-slate-200 rounded-lg p-2 flex flex-col gap-0.5" data-testid="loaded-backup-info">
                  <span><strong>{loaded.info.schoolName || 'Escola'}</strong> · {loaded.name} ({formatBackupSize(loaded.size)})</span>
                  <span>Criado em {fmtDate(loaded.info.exportedAt)}</span>
                  <span>{loaded.info.counts.records} registos · {loaded.info.counts.docs} documentos · {loaded.info.counts.publicAdmissionRequests} pré-matrículas</span>
                </div>
              )}
              <div>
                <button type="button" disabled={!loaded || !!busy} onClick={() => setConfirming(true)} className="px-3 py-2 rounded-lg bg-[#ac332b] text-white text-xs font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">upload</span>
                  Restaurar backup
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {confirming && loaded && (
        <div className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Confirmar restauro">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 flex flex-col gap-3 shadow-2xl">
            <h4 className="font-headline text-lg font-bold text-red-700">Restaurar a escola?</h4>
            <p className="text-xs text-slate-700">
              Vai substituir <strong>todos os dados da escola</strong> pelos do backup de <strong>{fmtDate(loaded.info.exportedAt)}</strong>.
              Tudo o que foi feito depois desse momento (matrículas, notas, alterações) será perdido,
              {' '}<u>excepto pagamentos, documentos fiscais e auditoria</u>. As facturas que já existem ficam como estão.
              Antes de restaurar, o estado actual é descarregado como ficheiro, para poder desfazer.
              Os outros utilizadores com a app aberta devem recarregá-la.
            </p>
            <input type="text" autoComplete="off" value={confirmWord} onChange={(e) => setConfirmWord(e.target.value)} placeholder={`Escreva ${RESTORE_CONFIRM_WORD} para confirmar`} className="p-2 text-xs border border-slate-300 rounded-lg font-mono" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeConfirm} disabled={!!busy} className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold cursor-pointer">Cancelar</button>
              <button type="button" onClick={handleRestore} disabled={!canRestore} className="px-3 py-2 rounded-lg bg-red-700 text-white text-xs font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">{busy ? 'A trabalhar…' : 'Restaurar'}</button>
            </div>
            {busy && <div className="text-xs text-slate-500" aria-live="polite">{busy}</div>}
            {notice?.kind === 'err' && <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{notice.text}</div>}
          </div>
        </div>
      )}
    </section>
  );
};
