#!/usr/bin/env python3
"""Gera src/styles/theme-dark.css (modo escuro, só para ecrã)."""

# ---- Paleta escura (saúde ocular: azul-ardósia suave, sem preto puro) -------
DARK = {
    'bg': '#1a212d', 'surface': '#232c3b', 'surface2': '#2b3547', 'surface3': '#344057',
    'surface4': '#3e4c66', 'border': '#3a475e', 'border-strong': '#4b5b77',
    'text': '#e3e8f0', 'text2': '#c3ccdb', 'text3': '#9eabc0',
    'heading': '#bcd0f2', 'ink': '#1f3960', 'ink-soft': '#2a4a7a',
    'button': '#3268d0', 'button-hover': '#2b5bb8', 'accent': '#ff7a5c',
    'danger': '#c9433f', 'danger-hover': '#a93532', 'input': '#19212d',
}
LIGHT = {  # valores originais (papel / documentos imprimíveis)
    'bg': '#fdfdfc', 'surface': '#ffffff', 'surface2': '#f8f8f7', 'surface3': '#f1f1ef',
    'surface4': '#e3e3e0', 'border': '#e3e3e0', 'border-strong': '#d6d6d2',
    'text': '#1c1c1a', 'text2': '#1c1c1a', 'text3': '#12498A',
    'heading': '#12498A', 'ink': '#12498A', 'ink-soft': '#1d4ed8',
    'button': '#2563EB', 'button-hover': '#1d4ed8', 'accent': '#f53003',
    'danger': '#dc2626', 'danger-hover': '#1c1c1a', 'input': '#ffffff',
}

# Matizes com significado (estados): cor-base clara (≈ Tailwind 400) e tons de texto
HUES = {
    'red':     (248, 113, 113, '#fca5a5', '#f87171'),
    'rose':    (251, 113, 133, '#fda4af', '#fb7185'),
    'amber':   (251, 191, 36,  '#fcd34d', '#fbbf24'),
    'yellow':  (250, 204, 21,  '#fde047', '#facc15'),
    'orange':  (251, 146, 60,  '#fdba74', '#fb923c'),
    'emerald': (52, 211, 153,  '#6ee7b7', '#34d399'),
    'green':   (74, 222, 128,  '#86efac', '#4ade80'),
    'teal':    (45, 212, 191,  '#5eead4', '#2dd4bf'),
    'cyan':    (34, 211, 238,  '#67e8f9', '#22d3ee'),
    'sky':     (56, 189, 248,  '#7dd3fc', '#38bdf8'),
    'blue':    (96, 165, 250,  '#93c5fd', '#60a5fa'),
    'indigo':  (129, 140, 248, '#a5b4fc', '#818cf8'),
    'violet':  (167, 139, 250, '#c4b5fd', '#a78bfa'),
    'purple':  (192, 132, 252, '#d8b4fe', '#c084fc'),
    'pink':    (244, 114, 182, '#f9a8d4', '#f472b6'),
    'lime':    (163, 230, 53,  '#bef264', '#a3e635'),
    'fuchsia': (232, 121, 249, '#f0abfc', '#e879f9'),
}
# valores CLAROS originais do Tailwind (para o papel): bg-50/100/200, border-100/200/300, texto 600-950
TW = {
 'red':     dict(b50='#fef2f2', b100='#fee2e2', b200='#fecaca', d100='#fee2e2', d200='#fecaca', d300='#fca5a5', t500='#ef4444', t600='#dc2626', t700='#b91c1c', t800='#991b1b', t900='#7f1d1d', t950='#450a0a'),
 'rose':    dict(b50='#fff1f2', b100='#ffe4e6', b200='#fecdd3', d100='#ffe4e6', d200='#fecdd3', d300='#fda4af', t500='#f43f5e', t600='#e11d48', t700='#be123c', t800='#9f1239', t900='#881337', t950='#4c0519'),
 'amber':   dict(b50='#fffbeb', b100='#fef3c7', b200='#fde68a', d100='#fef3c7', d200='#fde68a', d300='#fcd34d', t500='#f59e0b', t600='#d97706', t700='#b45309', t800='#92400e', t900='#78350f', t950='#451a03'),
 'yellow':  dict(b50='#fefce8', b100='#fef9c3', b200='#fef08a', d100='#fef9c3', d200='#fef08a', d300='#fde047', t500='#eab308', t600='#ca8a04', t700='#a16207', t800='#854d0e', t900='#713f12', t950='#422006'),
 'orange':  dict(b50='#fff7ed', b100='#ffedd5', b200='#fed7aa', d100='#ffedd5', d200='#fed7aa', d300='#fdba74', t500='#f97316', t600='#ea580c', t700='#c2410c', t800='#9a3412', t900='#7c2d12', t950='#431407'),
 'emerald': dict(b50='#ecfdf5', b100='#d1fae5', b200='#a7f3d0', d100='#d1fae5', d200='#a7f3d0', d300='#6ee7b7', t500='#10b981', t600='#059669', t700='#047857', t800='#065f46', t900='#064e3b', t950='#022c22'),
 'green':   dict(b50='#f0fdf4', b100='#dcfce7', b200='#bbf7d0', d100='#dcfce7', d200='#bbf7d0', d300='#86efac', t500='#22c55e', t600='#16a34a', t700='#15803d', t800='#166534', t900='#14532d', t950='#052e16'),
 'teal':    dict(b50='#f0fdfa', b100='#ccfbf1', b200='#99f6e4', d100='#ccfbf1', d200='#99f6e4', d300='#5eead4', t500='#14b8a6', t600='#0d9488', t700='#0f766e', t800='#115e59', t900='#134e4a', t950='#042f2e'),
 'cyan':    dict(b50='#ecfeff', b100='#cffafe', b200='#a5f3fc', d100='#cffafe', d200='#a5f3fc', d300='#67e8f9', t500='#06b6d4', t600='#0891b2', t700='#0e7490', t800='#155e75', t900='#164e63', t950='#083344'),
 'sky':     dict(b50='#f0f9ff', b100='#e0f2fe', b200='#bae6fd', d100='#e0f2fe', d200='#bae6fd', d300='#7dd3fc', t500='#0ea5e9', t600='#0284c7', t700='#0369a1', t800='#075985', t900='#0c4a6e', t950='#082f49'),
 'blue':    dict(b50='#eff6ff', b100='#dbeafe', b200='#bfdbfe', d100='#dbeafe', d200='#bfdbfe', d300='#93c5fd', t500='#3b82f6', t600='#2563eb', t700='#1d4ed8', t800='#1e40af', t900='#1e3a8a', t950='#172554'),
 'indigo':  dict(b50='#eef2ff', b100='#e0e7ff', b200='#c7d2fe', d100='#e0e7ff', d200='#c7d2fe', d300='#a5b4fc', t500='#6366f1', t600='#4f46e5', t700='#4338ca', t800='#3730a3', t900='#312e81', t950='#1e1b4b'),
 'violet':  dict(b50='#f5f3ff', b100='#ede9fe', b200='#ddd6fe', d100='#ede9fe', d200='#ddd6fe', d300='#c4b5fd', t500='#8b5cf6', t600='#7c3aed', t700='#6d28d9', t800='#5b21b6', t900='#4c1d95', t950='#2e1065'),
 'purple':  dict(b50='#faf5ff', b100='#f3e8ff', b200='#e9d5ff', d100='#f3e8ff', d200='#e9d5ff', d300='#d8b4fe', t500='#a855f7', t600='#9333ea', t700='#7e22ce', t800='#6b21a8', t900='#581c87', t950='#3b0764'),
 'pink':    dict(b50='#fdf2f8', b100='#fce7f3', b200='#fbcfe8', d100='#fce7f3', d200='#fbcfe8', d300='#f9a8d4', t500='#ec4899', t600='#db2777', t700='#be185d', t800='#9d174d', t900='#831843', t950='#500724'),
 'lime':    dict(b50='#f7fee7', b100='#ecfccb', b200='#d9f99d', d100='#ecfccb', d200='#d9f99d', d300='#bef264', t500='#84cc16', t600='#65a30d', t700='#4d7c0f', t800='#3f6212', t900='#365314', t950='#1a2e05'),
 'fuchsia': dict(b50='#fdf4ff', b100='#fae8ff', b200='#f5d0fe', d100='#fae8ff', d200='#f5d0fe', d300='#f0abfc', t500='#d946ef', t600='#c026d3', t700='#a21a9d', t800='#86198f', t900='#701a75', t950='#4a044e'),
}

# Neutros (slate/gray/zinc/neutral/stone) — valores claros originais do Tailwind
NEUTRAL_LIGHT = {  # shade: (hex slate)
    'bg':   {'50': '#f8fafc', '100': '#f1f5f9', '200': '#e2e8f0', '300': '#cbd5e1', '400': '#94a3b8'},
    'text': {'200': '#e2e8f0', '300': '#cbd5e1', '400': '#94a3b8', '500': '#64748b', '600': '#475569', '700': '#334155', '800': '#1e293b', '900': '#0f172a'},
    'bd':   {'50': '#f8fafc', '100': '#f1f5f9', '200': '#e2e8f0', '300': '#cbd5e1', '400': '#94a3b8', '500': '#64748b'},
}
NEUTRALS = ['slate', 'gray']

V = {}   # nome-var -> (escuro, claro)
rules = []  # (selector-suffix list, declarations)

def var(name, dark, light):
    V[name] = (dark, light)
    return f'var(--dk-{name})'

def sel(*tokens, hover=False, extra=''):
    """[class~='x'] para cada token (com variante hover opcional)."""
    out = []
    for t in tokens:
        if hover:
            out.append(f"[class~='hover:{t}']:hover{extra}")
        else:
            out.append(f"[class~='{t}']{extra}")
    return out

def add(selectors, decl):
    rules.append((selectors, decl))

def rgba(rgb, a):
    return f'rgba({rgb[0]}, {rgb[1]}, {rgb[2]}, {a})'

# ------------------------------------------------------------- Neutros -------
for n in NEUTRALS:
    # fundos claros
    bgmap = {'50': ('surface2', 'surface2'), '100': ('surface3', 'surface3'), '200': ('surface3', 'surface3'), '300': ('surface4', 'surface4')}
    for shade, (dkey, _) in bgmap.items():
        v = var(f'bg-{n}-{shade}', DARK[dkey], NEUTRAL_LIGHT['bg'][shade])
        add(sel(f'bg-{n}-{shade}'), f'background-color: {v} !important;')
        add(sel(f'bg-{n}-{shade}', hover=True), f'background-color: {v} !important;')
        add(sel(f'focus:bg-{n}-{shade}', hover=False) and [f"[class~='focus:bg-{n}-{shade}']:focus"], f'background-color: {v} !important;')
    # fundos claros com opacidade (50/xx e 100/xx e 200/xx)
    for shade, dkey in (('50', 'surface2'), ('100', 'surface3'), ('200', 'surface3')):
        add([f"[class*='bg-{n}-{shade}/']"], f'background-color: {var(f"bg-{n}-{shade}", DARK[dkey], NEUTRAL_LIGHT["bg"][shade])} !important;')
        add([f"[class*='hover:bg-{n}-{shade}/']:hover"], f'background-color: {var(f"bg-{n}-{shade}", DARK[dkey], NEUTRAL_LIGHT["bg"][shade])} !important;')
    # texto
    tmap = {'900': 'text', '800': 'text', '700': 'text', '600': 'text2', '500': 'text3', '400': 'text3', '300': 'text3', '200': 'text3'}
    for shade, dkey in tmap.items():
        light = NEUTRAL_LIGHT['text'].get(shade, '#64748b')
        v = var(f'text-{n}-{shade}', DARK[dkey] if shade not in ('700',) else DARK['text'], light)
        add(sel(f'text-{n}-{shade}'), f'color: {v} !important;')
        add(sel(f'text-{n}-{shade}', hover=True), f'color: {v} !important;')
        add([f"[class~='placeholder:text-{n}-{shade}']::placeholder"], f'color: {v} !important;')
    # bordas / divisórias
    for shade in ('100', '200', '300', '400', '500'):
        dkey = {'100': 'border', '200': 'border', '300': 'border', '400': 'border-strong', '500': 'border-strong'}[shade]
        v = var(f'bd-{n}-{shade}', DARK[dkey], NEUTRAL_LIGHT['bd'][shade])
        add(sel(f'border-{n}-{shade}'), f'border-color: {v} !important;')
        add(sel(f'border-{n}-{shade}', hover=True), f'border-color: {v} !important;')
        add(sel(f'divide-{n}-{shade}', extra=' > * + *'), f'border-color: {v} !important;')
        add([f"[class~='divide-{n}-{shade}']"], f'border-color: {v} !important;')
    for shade in ('100', '200', '300', '400', '500'):
        add([f"[class*='border-{n}-{shade}/']"], f'border-color: {var(f"bd-{n}-{shade}", DARK["border"], NEUTRAL_LIGHT["bd"][shade])} !important;')
    add([f"[class~='ring-{n}-200']", f"[class~='ring-{n}-300']"], f'--tw-ring-color: {var("ring-neutral", DARK["border-strong"], "#cbd5e1")} !important;')

# branco / preto translúcido
add(sel('bg-white'), f'background-color: {var("bg-white", DARK["surface"], "#ffffff")} !important;')
add(sel('bg-white', hover=True), f'background-color: {var("bg-white", DARK["surface"], "#ffffff")} !important;')
add(["[class~='focus:bg-white']:focus", "[class~='focus-within:bg-white']:focus-within"], f'background-color: {var("bg-white-focus", DARK["surface2"], "#ffffff")} !important;')
add(['[class*="bg-white/60"]', '[class*="bg-white/70"]', '[class*="bg-white/80"]', '[class*="bg-white/90"]'], f'background-color: {var("bg-white-soft", "rgba(35, 44, 59, 0.85)", "rgba(255, 255, 255, 0.8)")} !important;')
add(sel('border-white'), f'border-color: {var("bd-white", DARK["border"], "#ffffff")} !important;')

# ------------------------------------------------ Matizes de estado ----------
for h, (r, g, b, t300, t400) in HUES.items():
    rgb = (r, g, b); tw = TW[h]
    for sh, a, key in (('50', 0.12, 'b50'), ('100', 0.18, 'b100'), ('200', 0.26, 'b200')):
        v = var(f'bg-{h}-{sh}', rgba(rgb, a), tw[key])
        add(sel(f'bg-{h}-{sh}'), f'background-color: {v} !important;')
        add(sel(f'bg-{h}-{sh}', hover=True), f'background-color: {v} !important;')
        add([f"[class*='bg-{h}-{sh}/']"], f'background-color: {v} !important;')
        add([f"[class*='hover:bg-{h}-{sh}/']:hover"], f'background-color: {v} !important;')
    for sh, key, dv in (('900', 't900', t300), ('800', 't800', t300), ('700', 't700', t300), ('950', 't950', t300),
                        ('600', 't600', t400), ('500', 't500', t400)):
        v = var(f'text-{h}-{sh}', dv, tw[key])
        add(sel(f'text-{h}-{sh}'), f'color: {v} !important;')
        add(sel(f'text-{h}-{sh}', hover=True), f'color: {v} !important;')
    for sh, a, key in (('100', 0.30, 'd100'), ('200', 0.34, 'd200'), ('300', 0.42, 'd300')):
        v = var(f'bd-{h}-{sh}', rgba(rgb, a), tw[key])
        add(sel(f'border-{h}-{sh}'), f'border-color: {v} !important;')
        add(sel(f'border-{h}-{sh}', hover=True), f'border-color: {v} !important;')
        add([f"[class*='border-{h}-{sh}/']"], f'border-color: {v} !important;')
    add([f"[class~='divide-{h}-200']"], f'border-color: {var(f"bd-{h}-200", rgba(rgb, 0.34), tw["d200"])} !important;')

# Degradês claros
add(["[class*='from-rose-50']", "[class*='to-amber-50']"], '--tw-gradient-from: rgba(251, 113, 133, 0.12) !important; --tw-gradient-to: rgba(251, 191, 36, 0.10) !important; --tw-gradient-via: transparent !important;')

# ------------------------------------------------ Cores institucionais -------
ink_txt = var('heading', DARK['heading'], LIGHT['heading'])
add(sel('text-[#0b1f3a]') + sel('text-[#12335e]') + sel('text-[#183f73]'), f'color: {ink_txt} !important;')
add(sel('text-[#0b1f3a]', hover=True), f'color: {ink_txt} !important;')
add(sel('border-[#0b1f3a]') + sel('border-[#12335e]'), f'border-color: {var("bd-ink", "#4a6fa8", "#12498A")} !important;')
add(sel('border-[#0b1f3a]', hover=True), f'border-color: {var("bd-ink", "#4a6fa8", "#12498A")} !important;')
add(['[class*="focus:border-[#0b1f3a]"]:focus'], f'border-color: {var("bd-ink", "#4a6fa8", "#12498A")} !important;')
add(sel('text-[#7a0c0c]') + sel('text-[#ac332b]') + sel('text-[#a12626]'), f'color: {var("accent", DARK["accent"], LIGHT["accent"])} !important;')
add(sel('text-[#7a0c0c]', hover=True) + sel('text-[#ac332b]', hover=True), f'color: {var("accent", DARK["accent"], LIGHT["accent"])} !important;')
add(sel('border-[#7a0c0c]') + sel('border-[#ac332b]'), f'border-color: {var("accent", DARK["accent"], LIGHT["accent"])} !important;')
add(sel('bg-[#f8fafc]') + sel('bg-[#eff4ff]'), f'background-color: {var("surface2", DARK["surface2"], LIGHT["surface2"])} !important;')

# Fundo azul-marinho translúcido = "realce claro" → realce azulado suave
add(["[class*='bg-[#0b1f3a]/']", "[class*='bg-[#12335e]/']"], f'background-color: {var("tint-ink", "rgba(120, 160, 230, 0.14)", "rgba(11, 31, 58, 0.06)")} !important; color: {ink_txt} !important;')
add(["[class*='bg-[#7a0c0c]/']", "[class*='bg-[#ac332b]/']"], f'background-color: {var("tint-accent", "rgba(255, 122, 92, 0.14)", "rgba(122, 12, 12, 0.06)")} !important; color: {var("accent", DARK["accent"], LIGHT["accent"])} !important;')

# ------------------------------------------------ Texto branco em fundo claro --
add(["[class~='bg-white'][class~='text-white']", "[class~='bg-slate-50'][class~='text-white']", "[class~='bg-slate-100'][class~='text-white']", "[class~='bg-slate-200'][class~='text-white']", "[class~='bg-[#f8fafc]'][class~='text-white']", "[class~='bg-[#eff4ff]'][class~='text-white']"], f'color: {var("text", DARK["text"], "#1c1c1a")} !important;')

# ------------------------------------------------ Barra lateral --------------
add(["aside [class~='bg-white'][class~='text-[#0b1f3a]']", "aside [class~='bg-white'][class*='text-[#0b1f3a]']"], 'background-color: rgba(255, 255, 255, 0.14) !important; color: #ffffff !important;')

# Overlays de modal
add(["[class*='bg-black/']"], f'background-color: {var("overlay", "rgba(8, 12, 19, 0.66)", "rgba(27, 27, 24, 0.35)")} !important;')

# ------------------------------------------------ escrita para o CSS ---------
def flat_selectors(selectors, prefix):
    return ',\n'.join(f'{prefix} {s}' if not s.startswith('aside ') else f'{prefix} {s}' for s in selectors)

PREFIX = "html[data-color-mode='dark'][data-ui-theme]"

out = []
out.append('''/* =============================================================================
   MODO ESCURO (noite) — só no ECRÃ, nunca na impressão
   =============================================================================
   FICHEIRO GERADO (gerado por scripts/gen-dark-theme.py).
   Ativado pelo atributo data-color-mode="dark" no <html> (ver
   src/theme/colorMode.ts) — o botão sol/lua do cabeçalho alterna-o.

   Princípios
   ----------
   • Saúde ocular: fundo azul-ardósia (#1a212d), NÃO preto puro; texto branco
     ligeiramente acinzentado (#e3e8f0); cores de estado (verde, âmbar,
     vermelho…) em versões translúcidas e suaves, sem brilho agressivo.
   • Legibilidade: todo o texto tem contraste ≥ 4.5:1 sobre a sua superfície.
   • Impressão: TODAS as regras estão dentro de @media screen. Ao imprimir,
     o navegador ignora este ficheiro e o documento sai igual ao modo claro
     (fundo branco, texto preto), mesmo com o modo noite ligado no ecrã.
   • Documentos (fichas, boletins, recibos) abertos em janela: mantêm o
     aspeto de "folha de papel" branca também no modo noite (o que se vê é o
     que se imprime). Ver a secção "Papel" no fim.
   ========================================================================== */

@media screen {
''')

# Variáveis
dark_vars = []
light_vars = []
for name, (d, l) in V.items():
    dark_vars.append(f'  --dk-{name}: {d};')
    light_vars.append(f'  --dk-{name}: {l};')

out.append(f'''{PREFIX} {{
  color-scheme: dark;

  /* Paleta base */
  --lv-bg: {DARK['bg']};
  --lv-surface: {DARK['surface']};
  --lv-surface-muted: {DARK['surface2']};
  --lv-border: {DARK['border']};
  --lv-border-strong: {DARK['border-strong']};
  --lv-text-strong: {DARK['text']};
  --lv-muted: {DARK['text3']};
  --lv-ink: {DARK['ink']};
  --lv-ink-soft: {DARK['ink-soft']};
  --lv-button-blue: {DARK['button']};
  --lv-button-blue-hover: {DARK['button-hover']};
  --lv-accent: {DARK['accent']};
  --lv-accent-hover: #ff9478;
  --lv-danger: {DARK['danger']};
  --lv-danger-hover: {DARK['danger-hover']};
  --lv-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  --lv-shadow-md: 0 4px 14px rgba(0, 0, 0, 0.38);
  --lv-shadow-lg: 0 14px 34px rgba(0, 0, 0, 0.5);
  --bs-body-bg: {DARK['bg']};
  --bs-body-color: {DARK['text']};
  --bs-border-color: {DARK['border']};
  --surface-white: {DARK['surface']};
  --bg-academic: {DARK['bg']};
  --text-main: {DARK['text']};
  --text-muted: {DARK['text3']};
  --border-subtle: {DARK['border']};

  /* Tokens do modo escuro */
{chr(10).join(dark_vars)}
}}
''')

body_rules = f'''
/* ---- Base ------------------------------------------------------------- */
{PREFIX} body {{
  background-color: {DARK['bg']} !important;
  color: {DARK['text']} !important;
}}
{PREFIX} #root {{ color: {DARK['text']}; }}
{PREFIX} ::selection {{ background: rgba(96, 165, 250, 0.35); color: #ffffff; }}
{PREFIX} ::-webkit-scrollbar-track {{ background: rgba(255, 255, 255, 0.04); }}
{PREFIX} ::-webkit-scrollbar-thumb {{ background: rgba(190, 205, 230, 0.28); }}
{PREFIX} ::-webkit-scrollbar-thumb:hover {{ background: rgba(190, 205, 230, 0.42); }}
{PREFIX} * {{ scrollbar-color: rgba(190, 205, 230, 0.3) transparent; }}

/* ---- Cabeçalho e barra lateral: azul-ardósia mais escuro, sem brilho ---- */
{PREFIX} header[class*='bg-[#0b1f3a]'],
{PREFIX} aside[class*='bg-[#0b1f3a]'] {{
  background-color: {DARK['ink']} !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
}}
{PREFIX} header[class*='bg-[#0b1f3a]'] {{ border-bottom: 1px solid rgba(255, 255, 255, 0.08); }}

/* ---- Campos de formulário ---------------------------------------------- */
{PREFIX} input:not([type='checkbox']):not([type='radio']):not([type='range']):not([class*='bg-transparent']),
{PREFIX} select:not([class*='bg-transparent']),
{PREFIX} textarea {{
  background-color: {DARK['input']} !important;
  border-color: {DARK['border-strong']} !important;
  color: {DARK['text']} !important;
  box-shadow: none;
}}
{PREFIX} input:not([type='checkbox']):not([type='radio']):focus,
{PREFIX} select:focus,
{PREFIX} textarea:focus {{
  border-color: #6f9be0 !important;
  box-shadow: 0 0 0 3px rgba(111, 155, 224, 0.25) !important;
}}
{PREFIX} input:not([class*='placeholder:'])::placeholder,
{PREFIX} textarea:not([class*='placeholder:'])::placeholder {{ color: #7f8ca3 !important; opacity: 1; }}
{PREFIX} input:disabled,
{PREFIX} select:disabled,
{PREFIX} textarea:disabled {{ background-color: {DARK['surface2']} !important; color: {DARK['text3']} !important; opacity: 0.8; }}
{PREFIX} option {{ background-color: {DARK['surface']}; color: {DARK['text']}; }}
{PREFIX} select[class*='bg-transparent'] option {{ background-color: {DARK['ink']}; color: #ffffff; }}
{PREFIX} input[type='checkbox'],
{PREFIX} input[type='radio'] {{ accent-color: #6f9be0; }}
{PREFIX} input[type='date'],
{PREFIX} input[type='time'],
{PREFIX} input[type='month'],
{PREFIX} input[type='datetime-local'] {{ color-scheme: dark; }}
{PREFIX} label {{ color: {DARK['text2']}; }}
{PREFIX} fieldset {{ border-color: {DARK['border']}; }}
{PREFIX} hr {{ border-color: {DARK['border']}; opacity: 1; }}

/* ---- Tabelas ------------------------------------------------------------ */
{PREFIX} tbody tr:hover {{ background-color: {DARK['surface2']}; }}
{PREFIX} tbody tr {{ border-color: {DARK['border']}; }}
{PREFIX} thead tr[class*='bg-slate-50'],
{PREFIX} thead th[class*='bg-slate-50'],
{PREFIX} thead tr[class*='bg-slate-100'],
{PREFIX} thead th[class*='bg-slate-100'],
{PREFIX} thead tr[class*='bg-slate-200'],
{PREFIX} thead th[class*='bg-slate-200'] {{ color: {DARK['heading']} !important; }}
{PREFIX} table {{ color: inherit; }}
{PREFIX} tbody :is(td, th):not([class*='text-']) {{ color: {DARK['text']}; }}
/* Linhas com destaque de estado mantêm a leitura */
{PREFIX} tbody tr[class*='bg-'] :is(td, th) {{ color: inherit; }}

/* ---- Cartões, modais, painéis ------------------------------------------- */
{PREFIX} [class*='bg-white'][class*='border'] {{
  background-color: {DARK['surface']} !important;
  border-color: {DARK['border']} !important;
}}
{PREFIX} dialog,
{PREFIX} [class*='fixed'][class*='inset-0'] > [class*='bg-white'] {{
  border-color: {DARK['border-strong']} !important;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5) !important;
}}
{PREFIX} [class*='shadow-'] {{ --tw-shadow-color: rgba(0, 0, 0, 0.4); }}
{PREFIX} .card,
{PREFIX} .modal-content {{ background-color: {DARK['surface']}; color: {DARK['text']}; border-color: {DARK['border']}; }}

/* Texto de cabeçalhos e ícones sobre superfícies claras (agora escuras) */
{PREFIX} :is(h1, h2, h3, h4, h5, h6):not([class*='text-white']):not([class*='text-']) {{ color: {DARK['text']}; }}
{PREFIX} .material-symbols-outlined:not([class*='text-']) {{ color: inherit; }}

/* ---- Botões: azul mais suave, sem brilho ------------------------------- */
{PREFIX} button:disabled {{ opacity: 0.5; }}
{PREFIX} button:focus-visible,
{PREFIX} a:focus-visible,
{PREFIX} [role='button']:focus-visible {{ outline: 2px solid rgba(147, 187, 245, 0.75); outline-offset: 2px; }}
{PREFIX} button[class*='bg-white'][class*='text-[#0b1f3a]'],
{PREFIX} button[class*='bg-white'][class*='text-slate'] {{
  background-color: {DARK['surface2']} !important;
  border-color: {DARK['border-strong']} !important;
  color: {DARK['text']} !important;
}}
{PREFIX} button[class~='text-[#0b1f3a]']:not([class*='bg-']) {{ color: #8fb2ee !important; }}

/* ---- Bootstrap (usado em alguns pontos) --------------------------------- */
{PREFIX} .btn-outline-primary {{ color: #8fb2ee !important; border-color: #6f9be0 !important; }}
{PREFIX} .btn-outline-primary:hover {{ background-color: #3268d0 !important; color: #fff !important; }}
{PREFIX} .form-control,
{PREFIX} .form-select {{ background-color: {DARK['input']}; color: {DARK['text']}; border-color: {DARK['border-strong']}; }}
{PREFIX} .table {{ --bs-table-bg: transparent; --bs-table-color: {DARK['text']}; --bs-table-border-color: {DARK['border']}; --bs-table-striped-bg: {DARK['surface2']}; --bs-table-hover-bg: {DARK['surface2']}; color: {DARK['text']}; }}
{PREFIX} .dropdown-menu {{ background-color: {DARK['surface']}; border-color: {DARK['border']}; }}
{PREFIX} .dropdown-item {{ color: {DARK['text']}; }}
{PREFIX} .dropdown-item:hover {{ background-color: {DARK['surface2']}; }}

/* ---- Gráficos (Recharts) ------------------------------------------------ */
{PREFIX} .recharts-text {{ fill: {DARK['text3']} !important; }}
{PREFIX} .recharts-cartesian-grid line {{ stroke: {DARK['border']} !important; }}
{PREFIX} .recharts-cartesian-axis-line,
{PREFIX} .recharts-cartesian-axis-tick-line {{ stroke: {DARK['border-strong']} !important; }}
{PREFIX} .recharts-tooltip-wrapper .recharts-default-tooltip {{
  background-color: {DARK['surface2']} !important;
  border: 1px solid {DARK['border-strong']} !important;
  color: {DARK['text']} !important;
  box-shadow: {'0 6px 18px rgba(0, 0, 0, 0.45)'} !important;
}}
{PREFIX} .recharts-default-tooltip .recharts-tooltip-label,
{PREFIX} .recharts-default-tooltip .recharts-tooltip-item {{ color: {DARK['text']} !important; }}
{PREFIX} .recharts-legend-item-text {{ color: {DARK['text2']} !important; }}
{PREFIX} .recharts-cartesian-axis-tick-value,
{PREFIX} .recharts-polar-angle-axis-tick-value {{ fill: {DARK['text3']} !important; }}
{PREFIX} .recharts-rectangle.recharts-tooltip-cursor {{ fill: rgba(255, 255, 255, 0.05) !important; }}
{PREFIX} .recharts-cartesian-grid line[stroke='#f1f5f9'] {{ stroke: {DARK['border']} !important; }}

/* ---- Rótulos (chips) sobre fundo escuro: sem brilho ------------------- */
{PREFIX} img[class*='rounded-full'] {{ filter: brightness(0.92); }}
{PREFIX} .gr-rz-bar {{ background: #0f1622; }}
'''
out.append(body_rules)

# Regras geradas por classes
out.append('\n/* ---- Classes utilitárias (superfícies, texto, bordas, estados) ----------- */\n')
for selectors, decl in rules:
    out.append(flat_selectors(selectors, PREFIX) + ' {\n  ' + decl + '\n}\n')

# Exceções que precisam de mais especificidade que as regras acima
out.append(f'''
/* ---- Ilhas escuras: o texto que herda cor clara mantém-se branco ---------- */
{PREFIX} :is(header, aside, thead)[class*='bg-[#'] {{ color: #ffffff; }}
{PREFIX} header[class*='bg-[#0b1f3a]'] input,
{PREFIX} header[class*='bg-[#0b1f3a]'] select[class*='bg-transparent'] {{ color: #ffffff !important; background-color: transparent !important; border-color: transparent !important; }}
{PREFIX} header[class*='bg-[#0b1f3a]'] input::placeholder {{ color: rgba(191, 219, 254, 0.7) !important; }}

/* Painéis flutuantes (pesquisa, notificações, chat) por cima do cabeçalho */
{PREFIX} header [class*='bg-white'][class*='shadow-2xl'] {{
  background-color: {DARK['surface']} !important;
  border-color: {DARK['border-strong']} !important;
  color: {DARK['text']} !important;
}}
{PREFIX} header [class*='bg-white'][class*='shadow-2xl'] :is([class*='text-slate-'], [class*='text-gray-']) {{ color: {DARK['text2']} !important; }}
{PREFIX} header [class*='bg-white'][class*='shadow-2xl'] :is([class*='text-slate-800'], [class*='text-slate-900']) {{ color: {DARK['text']} !important; }}
{PREFIX} header [class*='bg-white'][class*='shadow-2xl'] :is([class*='text-slate-400'], [class*='text-slate-500']) {{ color: {DARK['text3']} !important; }}
{PREFIX} header [class*='bg-white'][class*='shadow-2xl'] [class*='group-hover:text-[#0b1f3a]'] {{ color: inherit; }}
{PREFIX} header [class*='bg-white'][class*='shadow-2xl'] [class*='text-blue-700'] {{ color: {HUES['blue'][3]} !important; }}

/* Bolhas do chat: minhas mensagens em azul suave; as dos outros em cartão */
{PREFIX} [class~='bg-blue-600'][class~='text-white'] {{ background-color: {DARK['button']} !important; }}

/* Botão do modo de cor (cabeçalho) — realce ao passar o rato */
{PREFIX} .color-mode-toggle {{ color: #ffd479; }}
''')

# Papel (documentos)
out.append(f'''
/* ---- Papel: documentos abertos em janela (fichas, boletins, recibos) ------
   Mantêm o aspeto de folha branca no modo noite: redeclaram-se os valores
   claros de todas as variáveis, por isso tudo o que está lá dentro volta ao
   tema claro sem precisar de regras próprias. */
html[data-color-mode='dark'] .printable-modal-overlay .printable-document {{
  color-scheme: light;
  color: #1c1c1a;

  --lv-bg: {LIGHT['bg']};
  --lv-surface: {LIGHT['surface']};
  --lv-surface-muted: {LIGHT['surface2']};
  --lv-border: {LIGHT['border']};
  --lv-border-strong: {LIGHT['border-strong']};
  --lv-text-strong: {LIGHT['text']};
  --lv-muted: #706f6c;
  --lv-ink: {LIGHT['ink']};
  --lv-ink-soft: {LIGHT['ink-soft']};
  --lv-button-blue: {LIGHT['button']};
  --lv-button-blue-hover: {LIGHT['button-hover']};
  --lv-accent: {LIGHT['accent']};
  --lv-accent-hover: #d42a02;
  --lv-danger: {LIGHT['danger']};
  --lv-danger-hover: {LIGHT['danger-hover']};
  --lv-shadow: 0 1px 2px rgba(27, 27, 24, 0.05);
  --lv-shadow-md: 0 4px 12px rgba(27, 27, 24, 0.06);
  --lv-shadow-lg: 0 12px 32px rgba(27, 27, 24, 0.1);

{chr(10).join(light_vars)}
}}
html[data-color-mode='dark'] .printable-modal-overlay .printable-document :is(input, select, textarea):not([class*='bg-transparent']) {{
  background-color: #ffffff !important;
  border-color: #d6d6d2 !important;
  color: #1c1c1a !important;
}}
html[data-color-mode='dark'] .printable-modal-overlay .printable-document tbody tr:hover {{ background-color: #f8f8f7; }}
html[data-color-mode='dark'] .printable-modal-overlay .printable-document img[class*='rounded-full'] {{ filter: none; }}
html[data-color-mode='dark'] .printable-modal-overlay .printable-document .recharts-text {{ fill: #706f6c !important; }}
''')

out.append('}\n')  # fecha @media screen
open('src/styles/theme-dark.css', 'w').write('\n'.join(out))
print('vars:', len(V), 'rules:', len(rules))
