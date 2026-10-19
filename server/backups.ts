/**
 * Servidor de backups por escola (pontos de restauro). Corra com:   npx tsx server/backups.ts
 *   npx tsx server/backups.ts --run-auto     corre UMA vez a rotina agendada e sai (para cron / GitHub Actions)
 *
 * Variáveis de ambiente (nunca no código nem no repositório):
 *   SUPABASE_URL, SUPABASE_ANON_KEY       validar a sessão de quem pede
 *   SUPABASE_SERVICE_ROLE_KEY             SÓ aqui no servidor: chama school_backup_export / school_backup_restore
 *   BACKUP_MASTER_SECRET                  ≥ 32 caracteres; protege os backups automáticos e os pontos de segurança.
 *                                         Guarde-o FORA do servidor também: sem ele esses backups não abrem.
 *   BACKUP_ALLOWED_ORIGIN                 origem da app (CORS), ex.: https://escola.exemplo.ao
 *   BACKUP_PORT                           por omissão 8788
 *   Armazenamento (um destes):
 *     BACKUP_DIR                          pasta local (por omissão ./backups-escolas)
 *     BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_REGION, BACKUP_S3_KEY_ID, BACKUP_S3_SECRET, [BACKUP_S3_PREFIX]
 *                                         S3 / Backblaze B2 / Wasabi / R2 / MinIO. Use um destino FORA do Supabase.
 *   BACKUP_TZ_OFFSET_MIN                  fuso do agendamento em minutos (por omissão 60 = Angola, WAT)
 *   BACKUP_CHECK_MINUTES                  de quanto em quanto tempo verifica se há backups devidos (por omissão 30)
 *
 * Rotina: backup automático DIÁRIO (por omissão às 23:00 WAT). Retenção fixa de 10 ANOS
 * (BACKUP_RETENTION_YEARS em schoolBackups.ts). O restauro é sempre MANUAL, feito pelo
 * administrador da escola no painel (Configurações → Segurança & Backups).
 */
import { createServer } from 'node:http';
import { FsBackupStore, S3BackupStore, type BackupStore } from './backupStore';
import { SchoolBackups, type BackupRpc } from './schoolBackups';
import { createBackupHandler, supabaseAuthenticator } from './backupsHttp';

try { (process as any).loadEnvFile?.(); } catch { /* sem .env */ }
const env = (k: string) => process.env[k] || '';

export function supabaseRpc(url: string, serviceKey: string, f: typeof fetch = fetch): BackupRpc {
  const base = url.replace(/\/+$/, '');
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  return {
    async call(fn, args) {
      const res = await f(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
      const text = await res.text();
      if (!res.ok) throw new Error(`${fn}: HTTP ${res.status} ${text.slice(0, 300)}`);
      return text ? JSON.parse(text) : null;
    },
    async select(path) {
      const res = await f(`${base}/rest/v1/${path}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      return (await res.json()) as any[];
    }
  };
}

export function storeFromEnv(): BackupStore {
  if (env('BACKUP_S3_ENDPOINT')) {
    const need = ['BACKUP_S3_BUCKET', 'BACKUP_S3_REGION', 'BACKUP_S3_KEY_ID', 'BACKUP_S3_SECRET'].filter((k) => !env(k));
    if (need.length) throw new Error(`Faltam variáveis do armazenamento S3: ${need.join(', ')}`);
    return new S3BackupStore({ endpoint: env('BACKUP_S3_ENDPOINT'), bucket: env('BACKUP_S3_BUCKET'), region: env('BACKUP_S3_REGION'),
      accessKeyId: env('BACKUP_S3_KEY_ID'), secretAccessKey: env('BACKUP_S3_SECRET'), prefix: env('BACKUP_S3_PREFIX') });
  }
  return new FsBackupStore(env('BACKUP_DIR') || './backups-escolas');
}

function main() {
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'BACKUP_MASTER_SECRET'].filter((k) => !env(k));
  if (missing.length) { console.error(`Faltam variáveis de ambiente: ${missing.join(', ')}`); process.exit(1); }
  const svc = new SchoolBackups({
    rpc: supabaseRpc(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')),
    store: storeFromEnv(), masterSecret: env('BACKUP_MASTER_SECRET'),
    tzOffsetMin: env('BACKUP_TZ_OFFSET_MIN') ? Number(env('BACKUP_TZ_OFFSET_MIN')) : 60
  });

  const runScheduled = async () => {
    const rep = await svc.runScheduled();
    const ok = rep.filter((r) => r.status === 'ok').length, err = rep.filter((r) => r.status === 'error');
    console.log(`[${new Date().toISOString()}] rotina: ${ok} backup(s) criado(s), ${rep.length - ok - err.length} sem necessidade, ${err.length} erro(s)`);
    for (const e of err) console.error(`  ✗ ${e.institutionId}: ${e.error}`);
    return err.length === 0;
  };

  if (process.argv.includes('--run-auto')) { runScheduled().then((ok) => process.exit(ok ? 0 : 1)); return; }

  const handle = createBackupHandler({
    svc, allowedOrigin: env('BACKUP_ALLOWED_ORIGIN') || undefined,
    authenticate: supabaseAuthenticator({ url: env('SUPABASE_URL'), anonKey: env('SUPABASE_ANON_KEY') }),
    log: (...a) => console.log(...a)
  });
  const port = Number(env('BACKUP_PORT')) || 8788;
  createServer((req, res) => { void handle(req, res).then((done) => { if (!done) { res.statusCode = 404; res.end('Not found'); } }); })
    .listen(port, () => console.log(`Servidor de backups em http://localhost:${port}/backups`));
  const every = Math.max(5, Number(env('BACKUP_CHECK_MINUTES')) || 30) * 60_000;
  setTimeout(() => void runScheduled(), 30_000);
  setInterval(() => void runScheduled(), every);
}

if (process.argv[1] && /backups\.(ts|js)$/.test(process.argv[1])) main();
