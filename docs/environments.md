# Environments: demo now, staging and production at launch

Two repos deploy together:
- `ikigembe_backend` on Render, defined by `render.yaml` and `render.staging.yaml`;
- `ikigembe-film` on Vercel. `npm run build:vercel` packages the app and proxies `/api` to `BACKEND_ORIGIN`.

| Stage | Backend (Render) | Database | Frontend (Vercel) | Payments |
|---|---|---|---|---|
| **A. Now: demo** | current services, from `main` | `ikigembe_db` | Production deployment of `main` | Demo |
| **B. Staging (before launch)** | `render.staging.yaml`, from `staging` | `ikigembe_db_staging` | Preview deployments with `BACKEND_ORIGIN` set to the staging API | Demo (forced) |
| **C. Production (launch)** | `render.yaml`, from `main` | **New, empty** database | Production deployment of `main` | Live keys |

Release flow once B exists: feature branch → PR into `staging` → test and demo → PR `staging` → `main`.

---

## A. Demo on the current deployment (now)

The platform has no real users yet, so the current deployment serves as the demo environment. Nothing
here is final: at stage C production gets a fresh database, and none of the demo data comes along.

### 1. Before merging
- [ ] **Back up** `ikigembe_db`: Render → the database → Backups. Or `pg_dump` it.
- [ ] Check **Render env vars**. Values marked `sync: false` are set in each service's Environment tab.

  | Variable | Value | Services |
  |---|---|---|
  | `PAYMENT_DEMO_MODE` | `True` | ikigembe-backend, reconcile-payments |
  | `PAYMENT_GATEWAY` | `pawapay` | ikigembe-backend, reconcile-payments |
  | `PAWAPAY_API_KEY`, `DPO_COMPANY_TOKEN` | **empty**. The API refuses to start in demo mode if either is set. | same |
  | `ENFORCE_SINGLE_DEVICE_VIEW` | `True` | ikigembe-backend |
  | `HLS_ENCRYPTION`, `PLAYBACK_WATERMARK` | `False` at first | ikigembe-backend, transcode-worker |
  | `SECRET_KEY` | set, not the dev key | all |
  | `FRONTEND_URL` | the Vercel URL | ikigembe-backend, publish-releases, marketplace-jobs |
  | `CACHE_BACKEND` | `db` (already set in the blueprint) | all |
  | `RESEND_API_KEY`, `DEFAULT_FROM_EMAIL` | set. Without a verified domain, sign-up emails don't arrive (see below). | web, crons that email |
  | `CLOUDFLARE_R2_PRIVATE_BUCKET_NAME` | a bucket **other than** `CLOUDFLARE_R2_BUCKET_NAME`, with no public access | web, transcode-worker, marketplace-jobs, crons |

- [ ] **Storage:** if the private bucket isn't separated yet, demo films are reachable by guessable URLs.
  Accept that for the demo, or do the steps in `ikigembe_backend/docs/r2-resend.md` first.
- [ ] **Vercel:** the production deployment needs no `BACKEND_ORIGIN`; it defaults to
  `https://ikigembe-backend.onrender.com`. Preview deployments now **fail to build** until `BACKEND_ORIGIN`
  is set for the Preview environment. This is on purpose: previews must never use the production API.

### 2. Merge and deploy
1. Backend: open a PR `feat/test-readiness` → `main` and merge it. Render deploys, running
   `migrate` and `createcachetable` before the new version starts. In the deploy log, the migrations
   should end with `users.0035` and `platform_settings.0002` applied.
2. Frontend: open a PR `feat/test-readiness` → `main` in `Furaha123/ikigembe-film` (the repo owner
   approves it) and merge it. Vercel deploys.

### 3. After the deploy (Render → ikigembe-backend → Shell)
```bash
python manage.py createsuperuser        # Admin role, staff, verified
python manage.py finance_backfill       # ledger rows for payments made before the finance engine
```
Then, in the app:
- set the **tax rate** in Admin → Platform settings. Use 0 for the demo if the real rate isn't known yet.
- create demo users:
  - register a viewer and a producer account. If email isn't set up, verify them in Django admin by
    ticking `is_verified`, or read the link from the `EmailOutbox` rows;
  - the producer completes their profile, signs the agreement and uploads a film;
  - the admin approves the film.
- go through `docs/staging-test-guide.md` with demo payments.

### 4. Smoke test
- [ ] `/` and `/films` load; a film page shows its price.
- [ ] Sign in as admin: the dashboard numbers load and `/admin/platform-settings` shows "demo".
- [ ] A demo purchase completes and the film plays.
- [ ] `curl -A Googlebot https://<vercel-url>/movie/<id>` returns the metadata page.

---

## B. Create staging (when you're ready to stop demoing on `main`)

1. Backend repo: `git checkout -b staging main && git push -u origin staging`.
2. Render → **New → Blueprint** → this repo → file path `render.staging.yaml`. This creates the
   `*-staging` services and the `ikigembe_db_staging` database. Fill in the `sync: false` values with
   **staging** values:
   - separate R2 buckets (`ikigembe-staging-media` and `ikigembe-staging-private`);
   - a new `SECRET_KEY` and `HLS_KEY_SECRET`;
   - `FRONTEND_URL` = the Vercel staging URL;
   - Resend can share the sending domain.

   Payments are forced to demo and the blueprint has no provider keys.
3. Vercel → Settings → Environment Variables → **Preview** → `BACKEND_ORIGIN` =
   `https://ikigembe-backend-staging.onrender.com`, the staging web service URL. Optionally, under
   Settings → Domains, assign `staging.<your-domain>` to the `staging` branch.
4. Frontend repo: create a `staging` branch too. Its Vercel preview is the staging site.
5. Seed staging the same way as A.3.

## C. Launch production

1. **New database for production:** in `render.yaml`, change every `fromDatabase: name: ikigembe_db` to
   `ikigembe_prod`. Add a `databases:` block, as in `render.staging.yaml`, with `name: ikigembe_prod`.
   Sync the blueprint. Render creates the empty database and the next deploy migrates it. The old
   `ikigembe_db` holds only demo data: keep a backup, then delete it.
2. **Production env vars:**
   - `PAYMENT_DEMO_MODE=False`, plus the live PawaPay or DPO keys. Register the callback URLs with the provider.
   - Production R2 buckets: a public one, and a private one with no public access.
   - The verified Resend domain.
   - `FRONTEND_URL=https://<your-domain>`.
   - A new `SECRET_KEY` and `HLS_KEY_SECRET`.
   - `ENFORCE_SINGLE_DEVICE_VIEW` set explicitly.
3. **Domain:** add the domain to the Vercel production deployment, and to the Google sign-in client's
   authorised origins.
4. **Deploy `main`**, then run `createsuperuser` and set the tax rate.
5. **One real purchase and refund** with a small amount.
6. **Then** move day-to-day work to the `staging` branch → PR to `main` flow.

## Notes
- `npm run test:scripts` checks the Vercel packaging script. A real preview deploy is the final check.
  The Build Output API routes replace the old `vercel.json` rewrites one-for-one.
- Keep `render.staging.yaml` in sync when `render.yaml` gains services or env vars.
