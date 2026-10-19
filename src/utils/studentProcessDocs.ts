/**
 * Processo do aluno: todos os documentos que ficaram anexados a um aluno, venham da ficha
 * (BI, certificado, outros) ou da inscrição/Pré-Matrícula que deu origem a esse aluno.
 * Regras puras + ajudantes de visualização/impressão (sem acesso à base de dados).
 */
import type { Admission, SchoolDatabase, Student } from '../types';

export interface ProcessDoc {
  id: string;
  label: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  origin: 'ficha' | 'inscricao';
  uploadedAt?: string;
}

export const ORIGIN_LABEL: Record<ProcessDoc['origin'], string> = {
  ficha: 'Ficha do aluno',
  inscricao: 'Inscrição'
};

const mimeOf = (type?: string, dataUrl?: string, name?: string) => {
  if (type && type.includes('/')) return type;
  const m = /^data:([^;,]+)/.exec(dataUrl || '');
  if (m) return m[1];
  return /\.pdf$/i.test(name || '') ? 'application/pdf' : 'application/octet-stream';
};

export function collectStudentProcessDocs(student: Student, admissions: Admission[] = []): ProcessDoc[] {
  const out: ProcessDoc[] = [];
  const seen = new Set<string>();
  const push = (d: ProcessDoc) => {
    const key = `${d.fileName.toLowerCase()}|${d.size}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(d);
  };

  const fromFicha = (label: string, f?: { id?: string; name?: string; size?: number; type?: string; dataUrl?: string; uploadedAt?: string; uploadDate?: string } | null) => {
    if (!f) return;
    push({
      id: `ficha-${f.id || label}`, label, fileName: f.name || label, mimeType: mimeOf(f.type, f.dataUrl, f.name),
      size: f.size || 0, dataUrl: f.dataUrl || '', origin: 'ficha', uploadedAt: f.uploadedAt || f.uploadDate
    });
  };
  fromFicha('Bilhete de Identidade / Cédula', student.docBiFile);
  fromFicha('Certificado de habilitações', student.docCertificateFile);
  (student.additionalDocs || []).forEach((d, i) => fromFicha(`Documento adicional ${i + 1}`, d));

  admissions
    .filter((a) => a.studentId && String(a.studentId) === String(student.id))
    .forEach((a) => (a.documents || []).forEach((d) => {
      if (!d.attachment) return;
      push({
        id: `insc-${a.id}-${d.key}`, label: d.label, fileName: d.attachment.fileName || d.label,
        mimeType: mimeOf(d.attachment.mimeType, d.attachment.dataUrl, d.attachment.fileName),
        size: d.attachment.size || 0, dataUrl: d.attachment.dataUrl || '', origin: 'inscricao', uploadedAt: a.createdAt
      });
    }));
  return out;
}

export function processDocsByStudent(db: SchoolDatabase): Array<{ student: Student; docs: ProcessDoc[] }> {
  const admissions = db.admissions || [];
  return (db.students || []).map((student) => ({ student, docs: collectStudentProcessDocs(student, admissions) }));
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function toBlobUrl(doc: ProcessDoc): string | null {
  try {
    const [, b64] = doc.dataUrl.split(',');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: doc.mimeType }));
  } catch {
    return null;
  }
}

/** Abre o ficheiro num separador novo. Devolve false se não houver conteúdo neste dispositivo. */
export function viewProcessDoc(doc: ProcessDoc): boolean {
  if (!doc.dataUrl) return false;
  const url = toBlobUrl(doc);
  if (!url) return false;
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/** Imprime o ficheiro: imagens numa página A4 ajustada; PDF no visualizador do navegador. */
export function printProcessDoc(doc: ProcessDoc, studentName: string): boolean {
  if (!doc.dataUrl) return false;
  if (doc.mimeType.startsWith('image/')) {
    const w = window.open('', '_blank');
    if (!w) return false;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.label)} — ${esc(studentName)}</title>
<style>@page{size:A4;margin:12mm}html,body{margin:0;background:#fff}img{display:block;max-width:100%;max-height:270mm;margin:0 auto;object-fit:contain}</style></head>
<body><img src="${doc.dataUrl}" alt="${esc(doc.label)}" onload="setTimeout(function(){window.focus();window.print();},150)"></body></html>`);
    w.document.close();
    return true;
  }
  const url = toBlobUrl(doc);
  if (!url) return false;
  const w = window.open(url, '_blank');
  if (!w) { URL.revokeObjectURL(url); return false; }
  window.setTimeout(() => { try { w.focus(); w.print(); } catch { /* o utilizador imprime no visualizador */ } }, 900);
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return true;
}
