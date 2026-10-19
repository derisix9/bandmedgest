// Origem permitida: por omissão qualquer (a autenticação vai no cabeçalho Authorization, não em cookies, por isso
// '*' não expõe nada). Para restringir em produção: `supabase secrets set ALLOWED_ORIGIN=https://a-sua-app.com`.
export const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
/** Resposta ao pedido prévio (preflight) do navegador: tem de ser 2xx, senão o navegador bloqueia o pedido real. */
export const preflight = () => new Response(null, { status: 204, headers: cors });
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const ROLES = ['admin','director','secretaria','professor','financeiro','funcionario','aluno','encarregado'];
export const MIN_PASSWORD = 10;
export function passwordProblem(p: string): string | null {
  if (typeof p !== 'string' || p.length < MIN_PASSWORD) return `A palavra-passe deve ter pelo menos ${MIN_PASSWORD} caracteres.`;
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p)) return 'Use maiúsculas, minúsculas e números.';
  return null;
}

/** Comparação em tempo constante (evita descobrir o código de convite por diferenças de tempo). */
export function safeEqual(a: unknown, b: unknown): boolean {
  const x = new TextEncoder().encode(String(a ?? '')), y = new TextEncoder().encode(String(b ?? ''));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/** Avatar: só URL https ou imagem pequena. Evita encher a base de dados com ficheiros grandes (vão para o Storage). */
export const MAX_AVATAR = 20000;
export function cleanAvatar(v: unknown): string | null {
  const s = String(v ?? '');
  if (!s || s.length > MAX_AVATAR) return null;
  return /^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(s) ? s : null;
}
