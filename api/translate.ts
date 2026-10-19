/**
 * Serviço de tradução automática da interface (Vercel Serverless Function).
 *
 * POST /api/translate  { texts: string[], target?: 'en' }  →  { translations: string[] }
 *
 * Por ordem de preferência:
 *  1. Google Cloud Translation (oficial)  — defina GOOGLE_TRANSLATE_API_KEY nas variáveis de ambiente do Vercel;
 *  2. endpoint público "gtx" do Google Translate (sem chave; adequado para começar, sem garantia de serviço).
 * Só aceita pedidos feitos a partir do próprio site (mesmo anfitrião) e limita o tamanho de cada pedido.
 */
declare const process: { env: Record<string, string | undefined> };

const MAX_TEXTS = 60;
const MAX_CHARS = 9000;

async function gtx(text: string, target: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`gtx ${r.status}`);
  const data: any = await r.json();
  return (data?.[0] || []).map((s: any) => s?.[0] || '').join('');
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }

  // Mesmo anfitrião apenas (evita que terceiros usem a chave de tradução da escola).
  const host = String(req.headers?.host || '');
  const origin = String(req.headers?.origin || req.headers?.referer || '');
  if (origin && host && !origin.includes(host)) { res.status(403).json({ error: 'origin' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const texts: string[] = Array.isArray(body?.texts) ? body.texts.filter((t: unknown) => typeof t === 'string') : [];
  const target = typeof body?.target === 'string' && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(body.target) ? body.target : 'en';
  if (!texts.length || texts.length > MAX_TEXTS || texts.reduce((n, t) => n + t.length, 0) > MAX_CHARS) {
    res.status(400).json({ error: 'size' });
    return;
  }

  try {
    const key = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (key) {
      const r = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: texts, target, format: 'text' })
      });
      if (!r.ok) throw new Error(`google ${r.status}`);
      const data: any = await r.json();
      const out = (data?.data?.translations || []).map((t: any) => String(t.translatedText || ''));
      if (out.length !== texts.length) throw new Error('google length');
      res.status(200).json({ translations: out });
      return;
    }
    const out: string[] = new Array(texts.length);
    let i = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (i < texts.length) { const k = i++; out[k] = await gtx(texts[k], target); }
    }));
    res.status(200).json({ translations: out });
  } catch (e: any) {
    res.status(502).json({ error: String(e?.message || e) });
  }
}
