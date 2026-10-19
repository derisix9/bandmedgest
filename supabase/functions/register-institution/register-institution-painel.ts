// register-institution — versão num só ficheiro, para colar no editor do painel do Supabase.
// Cria escola + administrador. Registo LIVRE com captcha (Turnstile): 30 dias de teste ('trial'); depois 'pendente' até pagar.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// ---- CORS (antes em _shared/cors.ts) ----
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
const preflight = () => new Response(null, { status: 204, headers: cors });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const MIN_PASSWORD = 10;
function passwordProblem(p: string): string | null {
  if (typeof p !== 'string' || p.length < MIN_PASSWORD) return `A palavra-passe deve ter pelo menos ${MIN_PASSWORD} caracteres.`;
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p)) return 'Use maiúsculas, minúsculas e números.';
  return null;
}


// Palavras-passe óbvias (a regra mínima de tamanho/maiúsculas/números está em passwordProblem).
function weakPassword(p: string): string | null {
  const l = p.toLowerCase();
  const seq = 'abcdefghijklmnopqrstuvwxyz0123456789', rev = seq.split('').reverse().join('');
  const hasSeq = [...Array(Math.max(0, l.length - 3)).keys()].some((i) => seq.includes(l.slice(i, i + 4)) || rev.includes(l.slice(i, i + 4)));
  const common = ['password', 'palavra', 'senha', 'qwerty', 'abcdef', '123456', 'admin', 'bandmed', 'letmein', 'welcome'];
  if (/(.)\1{2,}/.test(p) || hasSeq || common.some((w) => l.includes(w)))
    return 'Palavra-passe demasiado fraca: evite sequências, repetições e palavras comuns.';
  return null;
}

// Captcha Cloudflare Turnstile (secret TURNSTILE_SECRET_KEY). Sem secret configurado, recusa (fecha por defeito).
async function captchaOk(token: unknown, ip: string | null): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret || typeof token !== 'string' || !token || token.length > 2048) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const d = await r.json();
    return d?.success === true;
  } catch { return false; }
}

// ---- Função ----
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  const b = await req.json().catch(() => ({}));

  if (b.website) return json({ error: 'Pedido inválido' }, 400);   // campo-isco anti-robôs
  if (!(await captchaOk(b.captchaToken, req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null)))
    return json({ error: 'Captcha inválido ou expirado. Tente novamente.' }, 400);

  const email = String(b.adminEmail ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'E-mail inválido' }, 400);
  const pw = passwordProblem(b.password);
  if (pw) return json({ error: pw }, 400);
  const weak = weakPassword(b.password);
  if (weak) return json({ error: weak }, 400);
  const name = String(b.schoolName ?? '').trim();
  if (name.length < 3 || name.length > 200) return json({ error: 'Nome da escola obrigatório (3 a 200 caracteres)' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const slug = 'inst_' + name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) + '_' + crypto.randomUUID().slice(0, 6);

  const { data: created, error } = await admin.auth.admin.createUser({ email, password: b.password, email_confirm: true });
  if (error || !created.user) return json({ error: error?.message ?? 'Falha ao criar conta' }, 400);

  const { error: ie } = await admin.from('institutions').insert({
    id: slug, name, nif: b.nif ?? null,
    plan_status: 'trial', trial_ends_at: new Date(Date.now() + 30 * 86400000).toISOString()
  });
  if (ie) { await admin.auth.admin.deleteUser(created.user.id); return json({ error: ie.message }, 400); }
  const { error: pe } = await admin.from('profiles').insert({
    id: created.user.id, institution_id: slug, role: 'admin', name: String(b.adminName ?? name).trim(), email,
    data: { roleTitle: 'Administrador Geral', ...(b.username ? { username: String(b.username).trim().toLowerCase() } : {}) }
  });
  if (pe) {
    await admin.from('institutions').delete().eq('id', slug);
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: pe.message }, 400);
  }
  // Token de uso único para o cliente abrir sessão sem novo captcha (o captcha já foi validado acima).
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  return json({ institutionId: slug, userId: created.user.id, tokenHash: link?.properties?.hashed_token ?? null });
});
