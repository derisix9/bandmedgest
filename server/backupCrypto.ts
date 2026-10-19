/**
 * Cifra dos backups por escola (sem dependências: só `node:crypto` e `node:zlib`).
 *
 * Formato do ficheiro `.bmbak`:
 *   "BMBAK1" (6 bytes) | tamanho do cabeçalho (uint32 BE) | cabeçalho JSON (UTF-8) | texto cifrado | etiqueta GCM (16 bytes)
 * O cabeçalho (escola, modo, parâmetros do scrypt, sal, IV…) é AUTENTICADO (AAD): trocar a escola ou o custo do
 * scrypt no cabeçalho invalida o ficheiro. Cifra: AES-256-GCM. Chave: scrypt(palavra-passe, sal).
 * Antes de cifrar o JSON é comprimido (gzip).
 *
 * Dois modos:
 *  • "password": a palavra-passe é escolhida por quem cria o backup e NUNCA fica no servidor. Sem ela não há restauro.
 *  • "server":   a palavra-passe deriva do segredo mestre do servidor + escola (HMAC). Usado nos backups automáticos e
 *                nos pontos de segurança, que ninguém está presente para cifrar. Quem tiver o segredo mestre abre-os.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

export type BackupMode = 'password' | 'server';
export type BackupKind = 'manual' | 'auto' | 'safety';
export type CryptoErrorCode = 'wrong-password' | 'corrupt' | 'unsupported' | 'weak-password' | 'weak-secret';

export class BackupCryptoError extends Error {
  constructor(public code: CryptoErrorCode, message: string) { super(message); this.name = 'BackupCryptoError'; }
}

export interface BackupMeta { institutionId: string; mode: BackupMode; kind: BackupKind }
export interface BackupHeader extends BackupMeta {
  v: 1; alg: 'aes-256-gcm'; kdf: 'scrypt'; N: number; r: number; p: number;
  salt: string; iv: string; check: string; zip: 'gzip'; createdAt: string;
}

const MAGIC = Buffer.from('BMBAK1', 'latin1');
const TAG_LEN = 16;
const MAX_HEADER = 4096;
const MAX_PLAIN = 1024 * 1024 * 1024;          // 1 GiB depois de descomprimir (defesa contra "bombas" gzip)
const SCRYPT = { N: 32768, r: 8, p: 1 };
const ALLOWED_N = new Set([16384, 32768, 65536]);
export const MIN_PASSWORD = 10;

const scryptKey = (password: string, salt: Buffer, N: number, r: number, p: number): Buffer =>
  scryptSync(Buffer.from(password.normalize('NFKC'), 'utf8'), salt, 32, { N, r, p, maxmem: 256 * 1024 * 1024 });

const checkOf = (key: Buffer): string => createHmac('sha256', key).update('bmbak-check').digest('base64');

export function encryptBackup(plain: string | Buffer, password: string, meta: BackupMeta, now: Date = new Date()): Buffer {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw new BackupCryptoError('weak-password', `A palavra-passe deve ter pelo menos ${MIN_PASSWORD} caracteres.`);
  }
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = scryptKey(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p);
  const header: BackupHeader = {
    v: 1, alg: 'aes-256-gcm', kdf: 'scrypt', ...SCRYPT, ...meta,
    salt: salt.toString('base64'), iv: iv.toString('base64'), check: checkOf(key), zip: 'gzip', createdAt: now.toISOString()
  };
  const hb = Buffer.from(JSON.stringify(header), 'utf8');
  const len = Buffer.alloc(4); len.writeUInt32BE(hb.length);
  const aad = Buffer.concat([MAGIC, len, hb]);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const body = Buffer.concat([cipher.update(gzipSync(typeof plain === 'string' ? Buffer.from(plain, 'utf8') : plain)), cipher.final()]);
  return Buffer.concat([aad, body, cipher.getAuthTag()]);
}

function parse(file: Buffer): { header: BackupHeader; aad: Buffer; body: Buffer; tag: Buffer } {
  const bad = () => new BackupCryptoError('corrupt', 'Cabeçalho do backup ilegível.');
  if (!Buffer.isBuffer(file) || file.length < MAGIC.length + 4 + TAG_LEN) throw new BackupCryptoError('corrupt', 'Ficheiro de backup inválido ou truncado.');
  if (!file.subarray(0, MAGIC.length).equals(MAGIC)) throw new BackupCryptoError('corrupt', 'Isto não é um ficheiro de backup BandMed.');
  const hl = file.readUInt32BE(MAGIC.length);
  const start = MAGIC.length + 4;
  if (hl < 2 || hl > MAX_HEADER || start + hl + TAG_LEN > file.length) throw bad();
  let header: any;
  try { header = JSON.parse(file.subarray(start, start + hl).toString('utf8')); } catch { throw bad(); }
  if (!header || typeof header !== 'object') throw bad();
  const ok = header.v === 1 && header.alg === 'aes-256-gcm' && header.kdf === 'scrypt' && header.zip === 'gzip'
    && ALLOWED_N.has(header.N) && header.r === 8 && header.p === 1
    && (header.mode === 'password' || header.mode === 'server')
    && ['manual', 'auto', 'safety'].includes(header.kind)
    && typeof header.institutionId === 'string' && typeof header.salt === 'string' && typeof header.iv === 'string' && typeof header.check === 'string';
  if (!ok) throw new BackupCryptoError('unsupported', 'Parâmetros de cifra não suportados.');
  const salt = Buffer.from(header.salt, 'base64'), iv = Buffer.from(header.iv, 'base64');
  if (salt.length !== 16 || iv.length !== 12) throw new BackupCryptoError('unsupported', 'Parâmetros de cifra não suportados.');
  return { header, aad: file.subarray(0, start + hl), body: file.subarray(start + hl, file.length - TAG_LEN), tag: file.subarray(file.length - TAG_LEN) };
}

/** Lê o cabeçalho (escola, modo, tipo, data) SEM palavra-passe. Não é de confiança até decifrar com sucesso. */
export function readBackupHeader(file: Buffer): BackupHeader { return parse(file).header; }

export function decryptBackup(file: Buffer, password: string): Buffer {
  const { header, aad, body, tag } = parse(file);
  const key = scryptKey(String(password ?? ''), Buffer.from(header.salt, 'base64'), header.N, header.r, header.p);
  const want = Buffer.from(header.check), got = Buffer.from(checkOf(key));
  if (want.length !== got.length || !timingSafeEqual(want, got)) throw new BackupCryptoError('wrong-password', 'Palavra-passe errada.');
  try {
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(header.iv, 'base64'));
    d.setAAD(aad); d.setAuthTag(tag);
    const zipped = Buffer.concat([d.update(body), d.final()]);
    return gunzipSync(zipped, { maxOutputLength: MAX_PLAIN });
  } catch (e) {
    if (e instanceof BackupCryptoError) throw e;
    throw new BackupCryptoError('corrupt', 'O backup está corrompido ou foi alterado.');
  }
}

/** Palavra-passe do modo "server": determinística por escola, só com o segredo mestre (≥ 32 caracteres). */
export function deriveServerPassword(masterSecret: string, institutionId: string): string {
  if (typeof masterSecret !== 'string' || masterSecret.length < 32) {
    throw new BackupCryptoError('weak-secret', 'BACKUP_MASTER_SECRET deve ter pelo menos 32 caracteres.');
  }
  return createHmac('sha256', masterSecret).update(`bmbak-server-key|${institutionId}`).digest('hex');
}

/** Valida uma palavra-passe nova sem cifrar nada. */
export function checkBackupPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw new BackupCryptoError('weak-password', `A palavra-passe deve ter pelo menos ${MIN_PASSWORD} caracteres.`);
  }
  if (password.length > 256) throw new BackupCryptoError('weak-password', 'Palavra-passe demasiado longa.');
}
