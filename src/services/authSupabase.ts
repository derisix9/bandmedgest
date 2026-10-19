/**
 * Autenticação Supabase — substituto de src/services/auth.ts (Firebase).
 * O perfil (escola, papel) vem SEMPRE da tabela `profiles`, protegida por RLS;
 * o cliente nunca decide o seu próprio papel.
 */
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseUrl, supabaseAnonKey, clearRecoveryPending } from './supabase';
import type { User, UserRole } from '../types';

export interface SignInResult {
  success: boolean; error?: string;
  /** true quando a conta tem 2FA activo e falta introduzir o código (nível aal2). */
  needsMfa?: boolean; factorId?: string; session?: Session | null;
}

function translate(msg: string | undefined): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'E-mail ou palavra-passe incorretos.';
  if (m.includes('email not confirmed')) return 'O e-mail ainda não foi confirmado.';
  if (m.includes('captcha')) return 'Verificação de captcha falhou ou expirou. Tente novamente.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiadas tentativas. Tente novamente dentro de alguns minutos.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem ligação à internet. Verifique a rede.';
  if (m.includes('banned') || m.includes('disabled')) return 'Esta conta foi desativada. Contacte o administrador.';
  return 'Não foi possível autenticar. Tente novamente.';
}

/**
 * ======================  INTERRUPTOR GLOBAL DO MFA / 2FA  ======================
 * false = verificação em dois passos DESLIGADA (login e criação de conta entram direto).
 * true  = volta a exigir o 2FA (TOTP) aos perfis em MFA_REQUIRED_ROLES.
 * É o ÚNICO sítio a alterar para ativar/desativar o 2FA em todo o sistema.
 */
export const MFA_ENABLED = false;

/** Com o captcha activo no Supabase (Authentication → Attack Protection), o token do Turnstile é obrigatório. */
export async function signIn(email: string, password: string, captchaToken?: string | null): Promise<SignInResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(), password, options: captchaToken ? { captchaToken } : undefined
  });
  if (error) return { success: false, error: translate(error.message) };
  if (!MFA_ENABLED) return { success: true, session: data.session };   // 2FA desligado
  // Há 2FA inscrito mas a sessão ainda é aal1? Então falta o segundo factor.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    const { data: f } = await supabase.auth.mfa.listFactors();
    const totp = f?.totp?.[0];
    return { success: true, needsMfa: true, factorId: totp?.id, session: data.session };
  }
  return { success: true, session: data.session };
}

export async function verifyMfa(factorId: string, code: string): Promise<{ success: boolean; error?: string }> {
  const { data: ch, error: ce } = await supabase.auth.mfa.challenge({ factorId });
  if (ce || !ch) return { success: false, error: 'Não foi possível iniciar a verificação.' };
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
  return error ? { success: false, error: 'Código incorreto ou expirado.' } : { success: true };
}

/** Inscreve o 2FA (TOTP): devolve o QR (data URI/SVG) e o segredo para a app autenticadora. */
export async function enrollTotp(): Promise<{ factorId: string; qr: string; secret: string }> {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'BandMed ' + Date.now() });
  if (error || !data) throw new Error('Não foi possível activar o 2FA: ' + (error?.message ?? ''));
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function signOutUser(): Promise<void> { await supabase.auth.signOut(); }

export async function sendPasswordReset(email: string, captchaToken?: string | null): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    captchaToken: captchaToken || undefined,
    redirectTo: typeof window !== 'undefined' ? window.location.origin + '/' : undefined
  });
  // Só falhas técnicas são mostradas; "e-mail inexistente" nunca é revelado (evita descobrir quem tem conta).
  return error && /rate limit|too many|fetch|network|captcha/i.test(error.message)
    ? { success: false, error: translate(error.message) } : { success: true };
}

export async function updateOwnPassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
  if (newPassword.length < 10 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return { success: false, error: 'Mínimo 10 caracteres, com maiúsculas, minúsculas e números.' };
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    const m = error.message.toLowerCase();
    return { success: false, error: m.includes('same') ? 'A nova palavra-passe tem de ser diferente da anterior.'
      : m.includes('session') ? 'O link expirou. Peça um novo link de recuperação.' : translate(error.message) };
  }
  clearRecoveryPending();
  return { success: true };
}

export async function getCurrentAuthUid(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export function watchAuthState(cb: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_e, s) => cb(s));
  return () => data.subscription.unsubscribe();
}

/** O servidor não respondeu (504, timeout, rede): NÃO significa que a conta não tem perfil. */
export class ProfileUnavailableError extends Error {
  constructor(public readonly cause?: unknown) {
    super('Servidor temporariamente indisponível. Tente novamente dentro de instantes.');
    this.name = 'ProfileUnavailableError';
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Carrega o perfil e converte para o tipo `User` que a app já usa.
 * Devolve `null` SÓ quando a conta realmente não tem perfil activo. Falhas transitórias do servidor
 * (504 Gateway Timeout, rede) são repetidas com espera e, se persistirem, lançam `ProfileUnavailableError`
 * — antes eram tratadas como "conta sem perfil", o que impedia o acesso a todas as contas.
 */
export async function loadProfile(): Promise<User | null> {
  const uid = await getCurrentAuthUid();
  if (!uid) return null;
  let p: any = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await wait(700 * 2 ** (attempt - 1));
    try {
      const res = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (!res.error) { p = res.data; lastError = null; break; }
      lastError = res.error;
    } catch (e) { lastError = e; }
  }
  if (lastError) throw new ProfileUnavailableError(lastError);
  if (!p || !p.active) return null;
  const { data: ua } = await supabase.from('user_access').select('sections').eq('user_id', uid).maybeSingle();
  const d = (p.data ?? {}) as Record<string, any>;
  return {
    id: p.id, name: p.name, email: p.email, role: p.role as UserRole,
    roleTitle: d.roleTitle ?? p.role, avatar: d.avatar ?? '', phone: p.phone ?? undefined,
    institutionId: p.role === 'admin' && p.active_institution_id ? p.active_institution_id : p.institution_id,
    homeInstitutionId: p.institution_id,
    linkedStudentId: p.linked_student_id ?? undefined, linkedTeacherId: p.linked_teacher_id ?? undefined,
    linkedFuncionarioId: p.linked_funcionario_id ?? undefined,
    access: ua?.sections ? ({ sections: ua.sections } as any) : undefined
  } as User;
}

/** Perfis que DEVEM ter 2FA (aal2) para operar. */
export const MFA_REQUIRED_ROLES: UserRole[] = ['admin', 'director', 'financeiro'];
export async function mfaSatisfied(role: UserRole): Promise<boolean> {
  if (!MFA_ENABLED) return true;   // 2FA desligado: nunca bloqueia o acesso
  if (!MFA_REQUIRED_ROLES.includes(role)) return true;
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === 'aal2';
}

/** Há um segundo factor (TOTP) já verificado nesta conta? */
export async function hasVerifiedTotp(): Promise<boolean> {
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.totp?.length ?? 0) > 0;   // `totp` só lista factores já verificados
}

/**
 * Reconfirma a identidade da sessão actual com a palavra-passe (assinatura de homologações, operações sensíveis).
 * A verificação usa um cliente ISOLADO, sem guardar sessão: a sessão da aplicação (incluindo o nível 2FA / aal2)
 * não é tocada nem rebaixada, e nenhuma sessão extra fica activa.
 */
export async function reauthenticate(password: string, captchaToken?: string | null): Promise<{ success: boolean; error?: string }> {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user.email;
  if (!email) return { success: false, error: 'Sessão expirada. Inicie sessão novamente.' };
  if (!password) return { success: false, error: 'Introduza a sua palavra-passe.' };
  const probe = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  try {
    const { data: r, error } = await probe.auth.signInWithPassword({ email, password, options: captchaToken ? { captchaToken } : undefined });
    // Tem de ser a mesma conta que tem a sessão aberta.
    if (error || !r.user || r.user.id !== data.session?.user.id) {
      return { success: false, error: error && /rate limit|too many|captcha/i.test(error.message) ? translate(error.message) : 'Palavra-passe incorreta.' };
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Sem ligação ao servidor. Tente novamente.' };
  } finally {
    try { await probe.auth.signOut({ scope: 'local' }); } catch { /* cliente descartável */ }
  }
}

/** Abre sessão com o token de uso único devolvido pela Edge Function de registo (já validou o captcha). */
export async function signInWithTokenHash(tokenHash: string): Promise<SignInResult> {
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (error || !data.session) return { success: false, error: translate(error?.message) };
  return { success: true, session: data.session };
}
