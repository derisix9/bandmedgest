/**
 * Supabase como destino de uma colecção por registo (alternativa ao Realtime Database do Firebase).
 * Fala o mesmo "idioma" do db.ts: mapa de registos {chave → registo} e caminhos "id" / "id/campo".
 * Quem pode ler/escrever o quê decide a base (RLS + gatilhos); este ficheiro nunca confia no papel do cliente.
 */
import { reportPlanLimit } from '../utils/planLimits';
import { supabase } from './supabase';
import type { RecordMap, ShardUpdates } from '../utils/shardSync';
import { rowsToRecordMap, updatesToOps, applyPatch, type RecordRow } from '../utils/shardSupabase';
import { registerPayment, homologatePauta } from './supabaseData';

/** Campos que só o servidor pode alterar numa factura (gatilho guard_record_write). */
const INVOICE_PAY_FIELDS = ['status', 'totalPaidKz', 'paymentDate'] as const;

const PAGE = 1000;

/** Corre `fn` sobre os itens com no máximo `limit` pedidos em simultâneo (não afoga a base de dados). */
async function pooled<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}

async function currentInstitution(): Promise<string> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) throw new Error('Sem sessão Supabase');
  const { data, error } = await supabase.from('profiles').select('institution_id, role, active_institution_id').eq('id', uid).maybeSingle();
  if (error || !data) throw new Error('Perfil Supabase não encontrado');
  // Escola ATIVA (migração 0024): o administrador de um grupo pode estar a trabalhar numa filial.
  // Antes isto devolvia sempre a escola mãe, e por isso alunos/registos criados numa filial iam para o sítio errado
  // (ou eram recusados pela RLS) e o painel do administrador não os contava. O servidor volta a validar tudo.
  if (data.role === 'admin' && data.active_institution_id) return data.active_institution_id as string;
  return data.institution_id as string;
}
let instCache: { uid: string; inst: string } | null = null;
/** Esquece a escola em cache (chamar ao trocar de escola). */
export function resetInstitutionCache(): void { instCache = null; }
async function inst(): Promise<string> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id ?? '';
  if (instCache && instCache.uid === uid) return instCache.inst;
  const i = await currentInstitution();
  instCache = { uid, inst: i };
  return i;
}

export async function sbHasSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

/** Lê a colecção toda (ou só um ano lectivo), por páginas. */
export async function sbLoad(collection: string, year?: string): Promise<RecordMap> {
  const institution = await inst();
  const rows: RecordRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from('records').select('id,data,ord,academic_year,version')
      .eq('institution_id', institution).eq('collection', collection)
      .order('ord', { ascending: true, nullsFirst: false }).order('id');
    // Registos antigos sem ano (academic_year NULL) continuam visíveis em vez de "desaparecerem".
    if (year) q = q.or(`academic_year.eq.${year},academic_year.is.null`);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as RecordRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rowsToRecordMap(rows);
}

/** Envia o diff. Novos → INSERT; apagados → DELETE; campos → lê a linha actual, junta e grava (sem sobrepor o que outros mudaram). */
export async function sbPush(collection: string, updates: ShardUpdates): Promise<void> {
  try {
    await sbPushInner(collection, updates);
  } catch (e) {
    reportPlanLimit(e);   // limite do plano (alunos/armazenamento): avisa o utilizador
    throw e;
  }
}

async function sbPushInner(collection: string, updates: ShardUpdates): Promise<void> {
  const institution = await inst();
  const ops = updatesToOps(updates);

  // Homologações: só pela função do servidor (assina com o utilizador autenticado, não com o que o cliente diz).
  let inserts = ops.inserts;
  if (collection === 'homologations') {
    for (const r of inserts) await homologatePauta({ ...r.data, id: r.id });
    inserts = [];
  }
  // Facturas: o estado "pago" e o valor pago nunca se escrevem à mão; entram como pendentes e o pagamento
  // é registado pela função do servidor (que soma os pagamentos e decide o estado).
  const pendingPayments: Array<{ id: string; amount: number; method: string; ref: string | null; key: string }> = [];
  if (collection === 'invoices') {
    inserts = inserts.map((r) => {
      const d = { ...r.data };
      const total = Number(d.totalAmountKz) || 0;
      const paid = d.status === 'pago' ? Number(d.totalPaidKz ?? total) : Number(d.totalPaidKz) || 0;
      if (paid > 0) pendingPayments.push({ id: r.id, amount: paid, method: String(d.method || 'outro'), ref: d.transactionNumber ? String(d.transactionNumber) : null, key: 'ins-' + r.id + '-' + paid });
      if (d.status === 'pago') d.status = 'pendente';
      delete d.totalPaidKz; delete d.paymentDate;
      return { ...r, data: d };
    });
  }
  for (let i = 0; i < inserts.length; i += 200) {
    const batch = inserts.slice(i, i + 200).map((r) => ({ institution_id: institution, collection, ...r }));
    const { error } = await supabase.from('records').insert(batch);
    if (error) throw error;
  }
  for (const p of pendingPayments) await registerPayment(p.id, p.amount, p.method, p.ref, p.key);
  for (let i = 0; i < ops.deletes.length; i += 100) {
    const { error } = await supabase.from('records').delete()
      .eq('institution_id', institution).eq('collection', collection).in('id', ops.deletes.slice(i, i + 100));
    if (error) throw error;
  }
  const ids = Object.keys(ops.patches);
  for (let i = 0; i < ids.length; i += 50) {
    const slice = ids.slice(i, i + 50);
    const { data, error } = await supabase.from('records').select('id,data,ord,academic_year,version')
      .eq('institution_id', institution).eq('collection', collection).in('id', slice);
    if (error) throw error;
    const byId = new Map((data as RecordRow[]).map((r) => [r.id, r]));
    await pooled(slice, 8, async (id) => {
      const row = byId.get(id);
      if (!row) return;   // apagado entretanto por outro utilizador: nada a alterar
      let patch = ops.patches[id];
      let payAfter: { amount: number; method: string; ref: string | null; key: string } | null = null;
      if (collection === 'invoices' && INVOICE_PAY_FIELDS.some((f) => f in patch)) {
        const before = Number(row.data?.totalPaidKz) || 0;
        const total = Number(row.data?.totalAmountKz) || 0;
        const wanted = patch.totalPaidKz !== undefined && patch.totalPaidKz !== null ? Number(patch.totalPaidKz)
          : patch.status === 'pago' ? Math.max(total, before) : before;
        if (wanted > before) {
          const m = String(patch.method ?? row.data?.method ?? 'outro');
          payAfter = { amount: wanted - before, method: m, ref: row.data?.transactionNumber ? String(row.data.transactionNumber) : null, key: 'upd-' + id + '-' + wanted };
        }
        patch = Object.fromEntries(Object.entries(patch).filter(([k]) => !(INVOICE_PAY_FIELDS as readonly string[]).includes(k)));
      }
      if (Object.keys(patch).length > 0) {
      // Bloqueio optimista: se outro envio gravou este registo entretanto (erro 40001), volta a ler a versão
      // actual e reaplica SÓ as nossas alterações — em vez de falhar o envio todo e repeti-lo em tempestade.
      let cur: RecordRow = row;
      for (let attempt = 0; ; attempt++) {
        const next = applyPatch(cur, patch);
        const { error: ue, count } = await supabase.from('records')
          .update({ ...next, version: cur.version }, { count: 'exact' })
          .eq('institution_id', institution).eq('collection', collection).eq('id', id);
        if (!ue) {
          if (!count) throw new Error('Sem permissão para alterar ' + collection + '/' + id);
          break;
        }
        if ((ue as any).code !== '40001' || attempt >= 4) throw ue;
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1) + Math.random() * 150));
        const { data: fresh, error: fe } = await supabase.from('records').select('id,data,ord,academic_year,version')
          .eq('institution_id', institution).eq('collection', collection).eq('id', id).maybeSingle();
        if (fe) throw fe;
        if (!fresh) return;   // apagado entretanto
        cur = fresh as RecordRow;
      }
      }
      if (payAfter) await registerPayment(id, payAfter.amount, payAfter.method, payAfter.ref, payAfter.key);
    });
  }
}

/** Escuta alterações (Realtime) e volta a ler a colecção; se o Realtime falhar, vai verificando de 30 em 30 s. */
export function sbListen(collection: string, year: string | undefined, onMap: (m: RecordMap) => void, onError: (e: unknown) => void): () => void {
  let stopped = false, timer: ReturnType<typeof setTimeout> | null = null, poll: ReturnType<typeof setInterval> | null = null;
  const refresh = async () => { try { const m = await sbLoad(collection, year); if (!stopped) onMap(m); } catch (e) { if (!stopped) onError(e); } };
  const later = () => { if (timer) clearTimeout(timer); timer = setTimeout(refresh, 400); };
  const channel = supabase.channel(`rec-${collection}-${year ?? 'all'}-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `collection=eq.${collection}` }, later)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') { if (poll) { clearInterval(poll); poll = null; } void refresh(); }
      else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !poll && !stopped) poll = setInterval(refresh, 30000);
    });
  return () => { stopped = true; if (timer) clearTimeout(timer); if (poll) clearInterval(poll); void supabase.removeChannel(channel); };
}

export interface PageQuery { year?: string; classId?: string; status?: string; search?: string; page?: number; pageSize?: number }

/** Uma página (por omissão 50) filtrada NO SERVIDOR — é o que os ecrãs novos devem usar em vez de carregar tudo. */
export async function sbPage(collection: string, q: PageQuery = {}): Promise<{ rows: any[]; total: number }> {
  const institution = await inst();
  const size = Math.min(Math.max(q.pageSize ?? 50, 1), 200);
  const from = Math.max(q.page ?? 0, 0) * size;
  let query = supabase.from('records').select('id,data,ord', { count: 'exact' })
    .eq('institution_id', institution).eq('collection', collection);
  if (q.year) query = query.eq('academic_year', q.year);
  if (q.classId) query = query.eq('data->>classId', q.classId);
  if (q.status) query = query.eq('data->>status', q.status);
  if (q.search?.trim()) query = query.ilike('data->>name', '%' + q.search.trim().replace(/[%_\\]/g, (c) => '\\' + c) + '%');
  const { data, error, count } = await query.order('ord', { ascending: true, nullsFirst: false }).order('id').range(from, from + size - 1);
  if (error) throw error;
  return { rows: (data ?? []).map((r: any) => ({ ...r.data, id: r.data?.id ?? r.id })), total: count ?? 0 };
}
