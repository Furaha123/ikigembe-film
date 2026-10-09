# IKIGEMBE — current architecture: notes

Companion to `ikigembe-current-architecture.drawio`. It has two tabs: **Overview** and **Key Runtime Flows**. PNG previews of the tabs are `ikigembe-current-architecture.png` and `ikigembe-current-architecture-flows.png`.

Inspected on 2026-10-09, branch `feat/test-readiness` in both repositories:
- frontend: `ikigembe-film` (this repo);
- backend: `../ikigembe_backend`. Backend paths below start with `backend/`.

No secret values were read into this document. Environment variables are named, never valued.

## Summary

IKIGEMBE is two deployables plus managed services:

- **Frontend:** an Angular 19 single-page app built client-only. Vercel serves it as static files. A build script writes Vercel routes that proxy `/api/*` and `/sitemap.xml` to the backend, so the API is same-origin for the browser and the refresh cookie is first-party. Crawlers on `/movie/:id` and `/casting/:id` get backend-rendered metadata pages.
- **Backend:** one Django 6 / DRF application, a modular monolith with domain apps under `apps/`. It runs on Render as a Gunicorn web service. The same Render blueprint (`render.yaml`) also defines:
  - a `transcode-worker` background worker;
  - six cron jobs (Django management commands);
  - a Render-managed PostgreSQL database (`ikigembe_db`, referenced via `fromDatabase`).
- **Media:** Cloudflare R2, through its S3-compatible API (boto3 / django-storages). There are two buckets:
  - **public:** artwork, trailers and ad creatives, served on an R2 custom domain;
  - **private:** full films, HLS output, subtitles, talent videos, contract signatures and copyright documents, reached only through presigned URLs or the API's HLS playlist proxy.
- **Uploads:** browsers upload large files directly to R2 with presigned multipart PUTs.
- **Transcoding:** local FFmpeg produces multi-rendition HLS. It runs either in a background thread of the web process after an upload, or in the worker, which polls the database.
- **Payments:** one gateway adapter, PawaPay (mobile money) or DPO Pay (hosted checkout), chosen by `PAYMENT_GATEWAY`. It also has a demo mode, which is what the current deployment runs. Viewing rights are granted only server-side, by `resolve_deposit`, after the API's own status check with the provider. Webhooks and browser redirects only trigger that check.
- **Email:** Resend through django-anymail. Mail is queued in an `EmailOutbox` table, sent after commit by a thread pool, and retried by the `send_outbox` cron.
- **Sign-in:** email or phone with password, and Google Identity Services (ID token verified server-side).

## Evidence

| Component | Implementation status | Deployment status | Evidence |
|---|---|---|---|
| Angular 19 SPA (standalone, ngx-translate, hls.js) | Implemented | Vercel, static files | `package.json`, `src/app/**`, `angular.json`, `vercel.json`, `scripts/vercel-output.mjs` |
| SSR (`@angular/ssr`) | Files present, **not enabled** | Not deployed | `src/server.ts`, `src/app/app.config.server.ts`; `angular.json` has no `ssr`/`outputMode` (see `CLAUDE.md`) |
| Vercel `/api` proxy + crawler routes | Implemented | Configured by the build script. Production defaults to `https://ikigembe-backend.onrender.com`; preview builds must set `BACKEND_ORIGIN` | `scripts/vercel-output.mjs`, `scripts/vercel-output.test.mjs`, `docs/environments.md` |
| Django 6 + DRF API (Gunicorn, WhiteNoise) | Implemented | Render web service `ikigembe-backend` | `backend/requirements.txt`, `backend/ikigembe_bn/settings.py`, `backend/ikigembe_bn/urls.py`, `backend/render.yaml` |
| JWT auth (SimpleJWT, rotating refresh + blacklist, httpOnly refresh cookie) | Implemented | Part of the web service | `backend/ikigembe_bn/settings.py` (`SIMPLE_JWT`, `AUTH_REFRESH_COOKIE_*`), `backend/apps/users/cookies.py`, `backend/apps/users/views.py`, `src/app/core/services/auth.service.ts`, `src/app/core/interceptors/auth.interceptor.ts` |
| Google sign-in | Implemented | Needs `GOOGLE_CLIENT_ID` (`sync: false`, value not verified) | `src/index.html` (gsi/client), `src/app/pages/login/login.component.ts`, `backend/apps/users/views.py` (`verify_oauth2_token`) |
| Role permissions, producer setup gate | Implemented | Web service | `backend/apps/users/permissions.py`, `src/app/core/access/marketplace-access.ts`, `src/app/core/guards/*` |
| PostgreSQL | Implemented (SQLite locally and in tests) | Render database `ikigembe_db` via `fromDatabase`. Staging blueprint defines `ikigembe_db_staging` | `backend/render.yaml`, `backend/render.staging.yaml`, `backend/ikigembe_bn/settings.py` (`dj_database_url`), `docs/environments.md` |
| Django DB cache (rate limits, refresh-token grace) | Implemented | `CACHE_BACKEND=db` set in the blueprint; `createcachetable` in pre-deploy | `backend/render.yaml`, `backend/ikigembe_bn/settings.py` |
| Cloudflare R2 public + private buckets | Implemented (key-prefix routing, presigned access) | Bucket names are `sync: false`. Whether the private bucket is separate and non-public was **not verified** | `backend/apps/movies/storage.py`, `backend/ikigembe_bn/settings.py`, `backend/docs/r2-resend.md`, `docs/environments.md` |
| Presigned multipart upload | Implemented | Browser → R2 S3 endpoint. Needs a CORS policy on both buckets (operator step) | `backend/apps/movies/views.py` (initiate / sign-part / complete / abort), `src/app/shared/services/multipart-upload.service.ts`, `src/app/shared/models/upload.constants.ts` |
| HLS transcoding (local FFmpeg, multi-rendition, optional AES-128) | Implemented | `transcode-worker` Render worker plus an in-process thread in the web service. Both builds install `ffmpeg` | `backend/apps/movies/transcoding.py`, `backend/apps/movies/management/commands/transcode_worker.py`, `backend/apps/movies/hls_keys.py`, `backend/render.yaml` |
| HLS playlist proxy + playback tokens + entitlement | Implemented | Web service | `backend/apps/movies/playback.py`, `backend/apps/movies/views.py` (`MovieStreamView`, hls-proxy), `src/app/shared/services/movie.service.ts` |
| Single-device view policy (`X-Device-Id`) | Implemented behind `ENFORCE_SINGLE_DEVICE_VIEW` | Forced `True` in staging; `sync: false` in production. `docs/environments.md` asks for `True` on the current demo | `backend/apps/movies/playback.py`, `backend/docs/pay-per-view-policy.md`, `src/app/core/services/device-id.service.ts` |
| Playback watermark | Implemented behind `PLAYBACK_WATERMARK` | `docs/environments.md` says start with `False` | `backend/apps/movies/watermark.py`, video player component |
| PawaPay (deposits, payouts, refunds, webhook) | Implemented | Not live. Current deployment runs **demo mode**; live keys are a launch step | `backend/apps/payments/gateways.py`, `backend/apps/payments/services.py`, `backend/apps/payments/views.py` (`PawapayWebhookView`), `docs/environments.md` |
| DPO Pay (hosted checkout, callback, verifyToken) | Implemented as the alternative gateway | Not live (same as above) | `backend/apps/payments/gateways.py`, `backend/apps/payments/views.py` (`DpoCallbackView`), `src/app/pages/payment/payment-return.component.ts`, `src/app/core/services/payment.service.ts` |
| Payment demo mode | Implemented | **Active** on the current deployment, forced on staging | `backend/ikigembe_bn/settings.py` (`PAYMENT_DEMO_MODE`), `backend/render.staging.yaml`, `docs/environments.md` |
| Resend email (Anymail) + outbox | Implemented | `EMAIL_BACKEND` set to Anymail Resend in the blueprint. API key and sender domain not verified; `docs/environments.md` warns that sign-up mail fails without a verified domain | `backend/apps/users/outbox.py`, `backend/apps/users/notifications.py`, `backend/render.yaml`, `backend/docs/r2-resend.md` |
| Cron jobs: `reconcile_payments`, `send_outbox`, `marketplace_jobs`, `publish_releases`, `expire_contracts`, `reset_stale_transcodes` | Implemented | Declared as Render crons in the blueprint | `backend/render.yaml`, `backend/apps/*/management/commands/*.py`, `backend/docs/operations.md` |
| Business domains (catalog, contracts/finance, marketplace, CMS/ads, analytics, abuse reports, admin) | Implemented as Django apps in one service | Web service | `backend/apps/{movies,contracts,finance,marketplace,cms,analytics,abuse,users,platform_settings}` |
| Staging stack | Defined | **Not verified** as created on Render / Vercel | `backend/render.staging.yaml`, `docs/environments.md` (stage B) |
| E2E test stack (Playwright, seeded local API) | Implemented | Local only, not deployed | `playwright.config.ts`, `e2e/`, `backend/ikigembe_bn/e2e_storage.py` |

### Searched for and not found

None of these are drawn:
- **AWS services:** S3, CloudFront, EC2, MediaConvert, SES, WAF, CloudWatch. Media is on Cloudflare R2. The `AWS_*` setting names are django-storages conventions that point at R2.
- **Supabase:** named only in the backend `CLAUDE.md` ("Supabase in prod") and nowhere in code or deployment files. `render.yaml` binds `DATABASE_URL` to the Render database `ikigembe_db`. Supabase Auth is not used.
- **Celery or Redis:** background work is threads, a polling worker and cron jobs.
- **Sentry or other monitoring/APM:** only Python logging and Render's own logs.
- **CI/CD workflows** (`.github/workflows` etc.): deploys rely on Render's and Vercel's Git integrations, as described in `docs/environments.md`.
- **Dockerfiles, infrastructure-as-code beyond the Render blueprints, VPCs.**

## Limitations and unverified assumptions

1. **The deployment is not proven by the repos.** The Render blueprints and the Vercel build script show configuration only. I didn't check the Render or Vercel dashboards, so I can't confirm that every declared service and cron exists or that its `sync: false` variables are set.
2. **Database provider conflict.** The backend `CLAUDE.md` says Supabase; `render.yaml` says Render PostgreSQL. The diagram follows the deployment file. If `DATABASE_URL` was overridden in the Render dashboard to point at Supabase, the diagram is wrong on this point.
3. **Private bucket.** The code treats the private bucket as private. The protection holds only if an operator created a separate bucket with public access off and set `CLOUDFLARE_R2_PRIVATE_BUCKET_NAME`. If that variable is unset, private media falls back to the public bucket. `docs/environments.md` says this may still be pending for the demo.
4. **CDN.** The public bucket is served on an R2 custom domain on Cloudflare's network, but no cache rules are defined in either repo. Video segments are **not** delivered through a CDN: they come from presigned URLs on the R2 S3 API endpoint.
5. **Payments are in demo mode** on the current deployment. Live PawaPay or DPO flows, callback URL registration and payouts are untested in production (`docs/implementation-checklist.md` lists them as staging-only checks).
6. **Two transcoding paths.** The web service can transcode in an in-process thread after an upload, and the worker picks up queued or failed jobs.
   - A Render web instance restart kills an in-flight thread. `reset_stale_transcodes` re-queues those jobs.
   - The diagram shows both paths. Sizing and timeouts of the Render plans weren't checked.
7. **Client IP.** With `TRUSTED_PROXY_COUNT=1`, requests through the Vercel proxy share Vercel's IP for rate limiting (backend `CLAUDE.md`). Per-client throttling is therefore weaker for proxied traffic.
8. **The diagram is a simplification.** The runtime flows tab omits refunds, payouts, talent-video moderation, contract signing and the crawler pages.

## Implemented protections (and their limits)

**Authentication**
- **Tokens:** 30-minute access tokens are kept in browser memory only. 7-day refresh tokens:
  - rotate and are blacklisted on use;
  - are sent as an httpOnly, Secure, `SameSite=Strict` cookie scoped to `/api/auth/`;
  - get a 30-second reuse grace to survive concurrent refreshes.
- **Single active session:** a `session_key` claim is checked against the account. Logout and password change revoke outstanding access tokens.
- **Throttling:** login, registration and password reset are rate-limited per IP. Accounts lock after repeated wrong passwords. Email accounts must verify before signing in.
- **Google sign-in:** the backend verifies the Google ID token and requires `email_verified`.
- **Roles:** enforced server-side by permission classes. Frontend guards are UX only.
- *Limits:*
  - `AUTH_REFRESH_IN_BODY` defaults to `True` (transitional), so the refresh token is also returned in JSON until it's switched off.
  - CORS allows all origins. That's safe only because no endpoint other than the refresh/logout paths reads cookies, and `CORS_ALLOW_CREDENTIALS=False`.

**Payments**
- Every purchase goes through `start_deposit` and finishes in the idempotent `resolve_deposit`.
- **Webhooks:**
  - PawaPay callbacks are checked against an optional bearer token. Bodies are never trusted.
  - Both PawaPay and DPO callbacks only trigger the API's own status query, which compares amount and currency.
- DPO redirects are unsigned, so `/payment/return` shows only the server's status.
- `reconcile_payments` re-checks pending payments every 10 minutes.
- A 409 on an open payment prevents a second charge.
- Demo mode refuses to start while real provider keys are present.
- *Limits:*
  - `PAWAPAY_CALLBACK_TOKEN` is optional, which is fine because callbacks are not trusted anyway.
  - The live flows are untested here (see limitation 5).

**Uploads**
- **Server-side gates:** the upload endpoints require a ready producer (or the actor's own paid slot). The server:
  - mints object keys;
  - checks extensions against per-field allow-lists;
  - sets Content-Type from the extension;
  - rejects other accounts' keys on sign-part / complete / abort;
  - checks the `uploaded-by` metadata before attaching a key to a film.
- **Talent videos** are probed with ffprobe (container, duration) before moderation.
- *Limits:* film files aren't content-scanned beyond what FFmpeg needs to transcode them. Frontend checks are early feedback only.

**Streaming**
- `/stream/` checks release state and entitlement (payment, owning producer or admin). It returns a stream URL to the HLS proxy with a signed, time-limited token.
- The proxy re-checks token and entitlement on every playlist fetch. It rewrites segment URIs into presigned R2 URLs that live for the playlist duration plus slack.
- Private URLs are `null` in every API response for non-entitled users.
- **Optional features:**
  - single-device binding and view consumption at ≥ 90 % (`ENFORCE_SINGLE_DEVICE_VIEW`);
  - AES-128 HLS encryption with a sealed per-film key (`HLS_ENCRYPTION`);
  - a visible viewer watermark (`PLAYBACK_WATERMARK`).
- *Limits:*
  - These measures raise the cost of sharing; they are not DRM. Anyone holding a still-valid presigned segment URL can fetch that segment until it expires.
  - A determined entitled viewer can record the screen.
  - Encryption and the watermark are off unless enabled.
  - The protection depends on the private bucket really being private (limitation 3).

## Regenerating

The `.drawio` file is plain uncompressed XML and can be edited directly in diagrams.net. I generated and validated it with scratch scripts that aren't kept in the repo, so edit it in diagrams.net from now on. Re-export the PNGs from diagrams.net (File → Export as → PNG) after editing.
