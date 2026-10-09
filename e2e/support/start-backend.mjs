// Starts an isolated Django API for the Playwright suite: a fresh SQLite file, seeded accounts,
// demo payments and fake storage credentials. Nothing it does can reach a hosted database,
// the payment provider, Cloudflare R2 or an email service.
//
// Backend location: IKIGEMBE_BACKEND_DIR, or ../ikigembe_backend next to this repo.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(process.env.IKIGEMBE_BACKEND_DIR ?? join(here, '..', '..', '..', 'ikigembe_backend'));
const python = [join(backendDir, '.venv', 'Scripts', 'python.exe'), join(backendDir, '.venv', 'bin', 'python')]
  .find(existsSync) ?? 'python';
const dbFile = join(backendDir, 'e2e.sqlite3');
// Set by playwright.config.ts.
const BACKEND_PORT = process.env.E2E_BACKEND_PORT ?? '8001';
const FRONTEND_URL = process.env.E2E_FRONTEND_URL ?? 'http://localhost:4300';

const env = {
  ...process.env,
  DATABASE_URL: 'sqlite:///e2e.sqlite3',
  E2E_SEED_ALLOWED: '1',
  E2E_LOCAL_STORAGE: '1',   // private uploads (signatures) on local disk, see settings.py
  DEBUG: 'True',
  FRONTEND_URL,
  // Demo payments: PawaPay-style, settle after 1 s; no provider credentials may be present.
  PAYMENT_DEMO_MODE: 'True',
  PAYMENT_GATEWAY: 'pawapay',
  PAYMENT_DEMO_DELAY_SECONDS: '1',
  PAWAPAY_API_KEY: '',
  DPO_COMPANY_TOKEN: '',
  // Fake storage: presigning happens locally; any real fetch fails fast against a closed port.
  CLOUDFLARE_R2_ACCESS_KEY_ID: 'e2e-access-key',
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'e2e-secret-key',
  CLOUDFLARE_R2_BUCKET_NAME: 'e2e-public',
  CLOUDFLARE_R2_PRIVATE_BUCKET_NAME: 'e2e-private',
  CLOUDFLARE_R2_ENDPOINT_URL: 'http://127.0.0.1:9',
  CLOUDFLARE_R2_CUSTOM_DOMAIN: 'e2e-media.invalid',   // .invalid never resolves (RFC 2606)
  EMAIL_BACKEND: 'django.core.mail.backends.locmem.EmailBackend',
  RESEND_API_KEY: '',
  CACHE_BACKEND: 'locmem',
  ENFORCE_SINGLE_DEVICE_VIEW: 'True',
  HLS_ENCRYPTION: 'False',
  PLAYBACK_WATERMARK: 'False',
  THROTTLE_LOGIN: '1000/min',
  THROTTLE_REGISTER: '1000/min',
  THROTTLE_EVENTS: '1000/min',
  THROTTLE_ABUSE_REPORT: '1000/min',
  PYTHONUNBUFFERED: '1',
};

function manage(...args) {
  const result = spawnSync(python, ['manage.py', ...args], { cwd: backendDir, env, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[e2e backend] manage.py ${args.join(' ')} failed`);
    process.exit(result.status ?? 1);
  }
}

rmSync(dbFile, { force: true });
rmSync(join(backendDir, 'e2e-media'), { recursive: true, force: true });
manage('migrate', '--noinput', '-v', '0');
manage('createcachetable');
manage('seed_e2e');

const server = spawn(python, ['manage.py', 'runserver', `127.0.0.1:${BACKEND_PORT}`, '--noreload'], {
  cwd: backendDir, env, stdio: 'inherit',
});
const stop = () => server.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);
server.on('exit', (code) => process.exit(code ?? 0));
