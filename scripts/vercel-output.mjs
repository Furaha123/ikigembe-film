// Packages the Angular build for Vercel (Build Output API v3) with the API proxy pointed at the right
// backend for this deployment, so staging and production can share one repo:
//
//   BACKEND_ORIGIN   https origin of the Django API for this Vercel environment
//                    (production defaults to the current production API; preview builds must set it,
//                    so a preview can never talk to the production database by accident).
//
// Routes (same order as the old vercel.json rewrites): /api/* and /sitemap.xml are proxied to the
// backend (same origin for the browser, so the refresh cookie stays first-party); crawlers on
// /movie/:id and /casting/:id get the backend's metadata pages; everything else is the SPA.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_BACKEND = 'https://ikigembe-backend.onrender.com';
export const BOT_USER_AGENT =
  '.*([Bb]ot|BOT|[Cc]rawler|[Ss]pider|Slurp|facebookexternalhit|facebookcatalog|WhatsApp|Telegram|Slack|Discord|LinkedIn|Pinterest|Embedly|SkypeUriPreview|vkShare|BingPreview).*';

/** The backend origin for this build, or an Error explaining what to set. */
export function backendOrigin(env) {
  const raw = (env.BACKEND_ORIGIN ?? '').trim().replace(/\/+$/, '');
  if (!raw) {
    if (env.VERCEL_ENV === 'preview') {
      return new Error('Set BACKEND_ORIGIN for the Preview environment in Vercel (e.g. the staging API URL). '
        + 'Preview builds never fall back to the production API.');
    }
    return PRODUCTION_BACKEND;
  }
  let url;
  try { url = new URL(raw); } catch { return new Error(`BACKEND_ORIGIN is not a URL: ${raw}`); }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    return new Error(`BACKEND_ORIGIN must be an https origin without a path, e.g. ${PRODUCTION_BACKEND}`);
  }
  return url.origin;
}

export function routes(backend) {
  const bot = [{ type: 'header', key: 'user-agent', value: BOT_USER_AGENT }];
  return [
    { src: '^/api/(.*)$', dest: `${backend}/api/$1` },
    { src: '^/sitemap\\.xml$', dest: `${backend}/api/sitemap.xml` },
    { src: '^/movie/(\\d+)$', has: bot, dest: `${backend}/api/seo/movie/$1` },
    { src: '^/casting/(\\d+)$', has: bot, dest: `${backend}/api/seo/casting/$1` },
    { handle: 'filesystem' },
    { src: '^/(.*)$', dest: '/index.html' },
  ];
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const browser = join(root, 'dist', 'ikigembe-film', 'browser');
  if (!existsSync(join(browser, 'index.html'))) {
    console.error(`[vercel-output] ${browser} has no index.html: run "npm run build" first.`);
    process.exit(1);
  }
  const backend = backendOrigin(process.env);
  if (backend instanceof Error) {
    console.error(`[vercel-output] ${backend.message}`);
    process.exit(1);
  }
  const out = join(root, '.vercel', 'output');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(browser, join(out, 'static'), { recursive: true });
  writeFileSync(join(out, 'config.json'), JSON.stringify({ version: 3, routes: routes(backend) }, null, 2));
  console.log(`[vercel-output] ${process.env.VERCEL_ENV ?? 'local'} build → API ${backend}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
