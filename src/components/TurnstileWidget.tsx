import React, { useEffect, useRef } from 'react';

/** Captcha Cloudflare Turnstile. Site key em VITE_TURNSTILE_SITE_KEY. Muda a prop `resetKey` para o refazer. */
export const TURNSTILE_SITE_KEY = ((import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as string | undefined) || '';

declare global { interface Window { turnstile?: any } }

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptPromise = null; reject(new Error('captcha')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

interface Props { onToken: (token: string | null) => void; resetKey?: number }

export const TurnstileWidget: React.FC<Props> = ({ onToken, resetKey = 0 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = React.useState(false);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let id: string | undefined;
    let cancelled = false;
    onToken(null);
    loadScript().then(() => {
      if (cancelled || !ref.current) return;
      id = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        language: 'pt-br',
        callback: (t: string) => onToken(t),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null)
      });
    }).catch(() => setFailed(true));
    return () => { cancelled = true; try { if (id) window.turnstile?.remove(id); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) {
    return <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">Captcha não configurado: defina VITE_TURNSTILE_SITE_KEY no .env.</p>;
  }
  if (failed) {
    return <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">Não foi possível carregar o captcha. Verifique a ligação e recarregue a página.</p>;
  }
  return <div ref={ref} className="flex justify-center mt-6 mb-4 min-h-[65px]" />;
};
