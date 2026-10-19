import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const anon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anon) {
  console.warn('Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env');
}

/**
 * O link de "recuperar palavra-passe" abre a app com `#...type=recovery`. Lemos isto ANTES de criar o cliente
 * (que limpa o endereço) para a app mostrar o ecrã "nova palavra-passe" em vez de abrir a sessão directamente.
 */
export let recoveryPending: boolean =
  typeof window !== 'undefined' && /(^|[#&?])type=recovery(&|$)/.test(window.location.hash + '&' + window.location.search);
export const clearRecoveryPending = () => { recoveryPending = false; };

export const supabaseUrl = url ?? 'http://localhost:54321';
export const supabaseAnonKey = anon ?? 'anon-missing';

/** A chave "anon" é pública por desenho. A segurança está nas políticas RLS (supabase/migrations). */
/**
 * Onde fica a sessão: com "Lembrar-me" em localStorage (sobrevive ao fecho do navegador; a inatividade de 60 min
 * é imposta por sessionActivity/App), sem "Lembrar-me" em sessionStorage (termina ao fechar o navegador).
 */
const hybridStorage = {
  getItem(k: string): string | null {
    try { return sessionStorage.getItem(k) ?? localStorage.getItem(k); } catch { return null; }
  },
  setItem(k: string, v: string): void {
    try {
      const remember = localStorage.getItem('bandmed_remember') !== '0';
      (remember ? localStorage : sessionStorage).setItem(k, v);
      (remember ? sessionStorage : localStorage).removeItem(k);
    } catch { /* ignore */ }
  },
  removeItem(k: string): void {
    try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch { /* ignore */ }
  }
};

export const supabase: SupabaseClient = createClient(url ?? 'http://localhost:54321', anon ?? 'anon-missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: hybridStorage }
});
