/**
 * Servidor de notificações (passo 5) — EXEMPLO PRONTO A LIGAR, NÃO TESTADO CONTRA O FORNECEDOR.
 *
 * Faz a ponte entre a app e o fornecedor de SMS/WhatsApp (Twilio) sem expor chaves no
 * navegador. Corra com:   npx tsx server/notify.ts
 * Variáveis de ambiente (nunca no código nem no repositório):
 *   SUPABASE_URL                URL do projecto Supabase (para validar o token de quem pede)
 *   SUPABASE_ANON_KEY           chave pública (anon) do projecto — NUNCA a service_role
 *   NOTIFY_ALLOWED_EMAILS       e-mails autorizados a enviar, separados por vírgula
 *   NOTIFY_ALLOWED_ORIGIN       origem da app (CORS), ex.: https://escola.exemplo.ao
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   TWILIO_SMS_FROM             número ou remetente alfanumérico para SMS
 *   TWILIO_WHATSAPP_FROM        ex.: whatsapp:+14155238886 (número aprovado no Twilio)
 *   SUPABASE_SERVICE_ROLE_KEY   (opcional) chave service_role: SÓ no servidor, nunca no navegador nem no repositório.
 *   NOTIFY_POLL_SECONDS         (opcional) intervalo do worker da fila; por omissão 15
 *
 * Dois modos:
 *   - COM SUPABASE_SERVICE_ROLE_KEY (modo fila, recomendado): POST /notify só ENFILEIRA em
 *     public.notification_queue (com o token de quem pede, por isso a RLS aplica a permissão e a escola).
 *     Um worker neste processo reserva lotes com claim_notifications(), envia pelo Twilio e regista o
 *     resultado com finish_notification(). Falhas são repetidas com recuo (2, 4, 8... min, até 5 tentativas).
 *     A resposta do /notify passa a significar "aceite na fila", não "entregue".
 *   - SEM essa chave (modo directo): comportamento anterior, envia logo pelo Twilio e responde com o resultado.
 * Para WhatsApp em produção o Twilio/Meta exige número aprovado e modelos de mensagem
 * para conversas iniciadas pela escola. Sem isso o fornecedor recusa o envio.
 * A cada pedido aceita no máximo 500 mensagens.
 */
import express from 'express';
import type { GatewayMessage, GatewayResult } from '../src/utils/notificationGateway';
import { toE164 } from '../src/utils/notificationGateway';

// Lê o ficheiro .env da pasta onde corre o comando (não substitui variáveis já definidas no sistema).
try { (process as any).loadEnvFile?.(); } catch { /* sem .env: usa só as variáveis do sistema */ }

const env = (k: string) => process.env[k] || '';
const MAX_MESSAGES = 500;

/** Valida o token de sessão Supabase (access_token) e devolve o e-mail de quem pede. */
async function verifyIdToken(accessToken: string): Promise<{ email?: string } | null> {
  const url = env('SUPABASE_URL').replace(/\/+$/, '');
  const key = env('SUPABASE_ANON_KEY');
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { email?: string };
    return user?.email ? { email: user.email.toLowerCase() } : null;
  } catch {
    return null;
  }
}

async function sendTwilio(m: GatewayMessage): Promise<GatewayResult> {
  const sid = env('TWILIO_ACCOUNT_SID');
  const token = env('TWILIO_AUTH_TOKEN');
  const from = m.channel === 'whatsapp' ? env('TWILIO_WHATSAPP_FROM') : env('TWILIO_SMS_FROM');
  if (!sid || !token || !from) return { id: m.id, ok: false, error: 'Fornecedor não configurado no servidor.' };
  const to = toE164(m.to);
  if (!to) return { id: m.id, ok: false, error: 'Número inválido.' };
  const body = new URLSearchParams({ To: m.channel === 'whatsapp' ? `whatsapp:${to}` : to, From: from, Body: m.body });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
    const data = (await res.json()) as { sid?: string; message?: string };
    return res.ok ? { id: m.id, ok: true, providerId: data.sid } : { id: m.id, ok: false, error: data.message || `Twilio ${res.status}` };
  } catch (e) {
    return { id: m.id, ok: false, error: e instanceof Error ? e.message : 'erro de rede' };
  }
}

const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const QUEUE_MODE = Boolean(SERVICE_KEY);
const supaUrl = () => env('SUPABASE_URL').replace(/\/+$/, '');

interface QueueRow { id: string; channel: 'sms' | 'whatsapp'; to_phone: string; body: string }

/** Chamada RPC com a chave service_role (só o worker). */
async function rpcService<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${supaUrl()}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error(`${fn}: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

let draining = false;
/** Reserva um lote, envia e regista o resultado. Nunca lança; repete no próximo ciclo. */
async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      const rows = await rpcService<QueueRow[]>('claim_notifications', { p_limit: 50 });
      if (!rows || rows.length === 0) break;
      for (const r of rows) {
        const out = await sendTwilio({ id: r.id, to: r.to_phone, channel: r.channel, body: r.body });
        try {
          await rpcService('finish_notification', { p_id: r.id, p_ok: out.ok, p_provider_id: out.providerId ?? null, p_error: out.error ?? null });
        } catch (e) {
          // Se não conseguir registar, a mensagem fica "a enviar" e a tarefa bm_requeue_stuck volta a pô-la na fila.
          console.error('Falha a registar resultado', r.id, e instanceof Error ? e.message : e);
        }
      }
    }
  } catch (e) {
    console.error('Worker da fila:', e instanceof Error ? e.message : e);
  } finally {
    draining = false;
  }
}

/** Enfileira com o token de quem pede: a RLS garante permissão e escola; o servidor não escolhe a escola. */
async function enqueueAsUser(accessToken: string, messages: GatewayMessage[]): Promise<GatewayResult[]> {
  const base = supaUrl();
  const headers = { apikey: env('SUPABASE_ANON_KEY'), Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const fail = (error: string) => messages.map((m) => ({ id: m.id, ok: false, error }));
  try {
    const u = await fetch(`${base}/auth/v1/user`, { headers });
    const uid = u.ok ? ((await u.json()) as { id?: string }).id : undefined;
    if (!uid) return fail('Sessão inválida.');
    const p = await fetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=institution_id,role,active_institution_id`, { headers });
    const prof = p.ok ? ((await p.json()) as Array<{ institution_id?: string; role?: string; active_institution_id?: string | null }>)[0] : undefined;
    // Só o administrador pode estar numa filial; a escola ativa vem do perfil (o servidor valida na migração 0024).
    const inst = prof?.role === 'admin' && prof.active_institution_id ? prof.active_institution_id : prof?.institution_id;
    if (!inst) return fail('Perfil sem escola associada.');

    const rows: Array<{ institution_id: string; channel: string; to_phone: string; body: string }> = [];
    const keep: GatewayMessage[] = [];
    const results = new Map<string, GatewayResult>();
    for (const m of messages) {
      const to = toE164(m.to);
      if (!to) { results.set(m.id, { id: m.id, ok: false, error: 'Número inválido.' }); continue; }
      rows.push({ institution_id: inst, channel: m.channel, to_phone: to, body: m.body });
      keep.push(m);
    }
    if (rows.length) {
      const ins = await fetch(`${base}/rest/v1/notification_queue`, { method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(rows) });
      const err = ins.ok ? '' : `Fila recusou o pedido (HTTP ${ins.status}).`;
      for (const m of keep) results.set(m.id, err ? { id: m.id, ok: false, error: err } : { id: m.id, ok: true, providerId: 'fila' });
    }
    return messages.map((m) => results.get(m.id) as GatewayResult);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'erro de rede');
  }
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const origin = env('NOTIFY_ALLOWED_ORIGIN');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.post('/notify', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const who = token ? await verifyIdToken(token) : null;
  const allowed = env('NOTIFY_ALLOWED_EMAILS').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (!who?.email || !allowed.includes(who.email)) return res.status(403).send('Não autorizado.');

  const messages = (req.body?.messages || []) as GatewayMessage[];
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return res.status(400).send(`Envie entre 1 e ${MAX_MESSAGES} mensagens.`);
  }
  const valid = messages.every((m) => m && typeof m.id === 'string' && typeof m.body === 'string' && m.body.length <= 480 && (m.channel === 'sms' || m.channel === 'whatsapp'));
  if (!valid) return res.status(400).send('Pedido inválido.');

  if (QUEUE_MODE) {
    const results = await enqueueAsUser(token, messages);
    void drainQueue(); // arranca já um ciclo, sem esperar pelo próximo intervalo
    return res.json({ results });
  }
  const results: GatewayResult[] = [];
  for (const m of messages) results.push(await sendTwilio(m)); // em série: evita estourar limites do fornecedor
  res.json({ results });
});

const port = Number(env('NOTIFY_PORT')) || 8787;
app.listen(port, () => {
  console.log(`Gateway de notificações em http://localhost:${port}/notify (${QUEUE_MODE ? 'modo fila' : 'modo directo'})`);
  // Diagnóstico: só mostra NOMES de variáveis em falta, nunca valores.
  const needed = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'NOTIFY_ALLOWED_EMAILS', 'NOTIFY_ALLOWED_ORIGIN', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_SMS_FROM', 'TWILIO_WHATSAPP_FROM'];
  const missing = needed.filter((k) => !env(k));
  if (!QUEUE_MODE) {
    missing.unshift('SUPABASE_SERVICE_ROLE_KEY');
    const alike = Object.keys(process.env).filter((k) => /service|role/i.test(k) && k !== 'SUPABASE_SERVICE_ROLE_KEY');
    if (alike.length) console.warn(`  Atenção: encontrei ${alike.map((k) => `"${k}"`).join(', ')}, mas o nome certo é SUPABASE_SERVICE_ROLE_KEY.`);
  }
  if (missing.length) console.warn(`  Variáveis em falta ou vazias: ${missing.join(', ')}`);
  if (!env('NOTIFY_ALLOWED_ORIGIN')) console.warn('  Sem NOTIFY_ALLOWED_ORIGIN o navegador bloqueia os pedidos da app (use ex.: http://localhost:3000).');
  if (QUEUE_MODE) {
    const every = Math.max(5, Number(env('NOTIFY_POLL_SECONDS')) || 15) * 1000;
    setInterval(() => void drainQueue(), every);
    void drainQueue();
  }
});
