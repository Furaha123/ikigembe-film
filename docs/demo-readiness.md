# Demo readiness (2026-10-14)

What was done to make Ikigembe demo-ready on the current free infrastructure (Render free web service,
Supabase free PostgreSQL, Cloudflare R2 free tier, Vercel), what is simulated, how to run it, and what is
still open. Covers both repos: this one (`ikigembe-film`) and `../ikigembe_backend`. Nothing is committed yet.

**Product rules kept (owner's decision, 2026-10-14):** the brief asked for producer approval, admin review of
talent videos and casting calls, and per-item fees (talent video Frw 5,000/10,000 by age, casting Frw 20,000,
actor search Frw 20,000). The repo's newer decisions stay in force instead: no producer approval (profile +
signed agreement), castings and talent videos go live without review (admins only remove), and yearly plans
(actor Frw 5,000/yr; producer Full Frw 15,000/yr or View-only Frw 10,000/yr; Frw 5,000 per casting call
without Full). See `docs/implementation-checklist.md` → Product decisions.

## 1. Feature checklist

Status: **working** (built and tested locally) · **simulated** (works, no real provider) · **unverified**
(needs the hosted environment) · **gap** (not built).

| Area | Status | Notes |
|---|---|---|
| Register, login, logout, refresh rotation, forgot/reset/change password, profile | working | Unchanged; covered by backend tests and E2E. |
| Email verification | working (simulated delivery) | Link captured in the outbox; E2E verifies a new account through it. Enforced on every API request from the user row (403 `email_unverified`; profile/email fix, logout, password and verification stay open); an email change restricts the session until the new link is opened (`/verify-email-required` prompt + banner). Reset/verification tokens are stored as SHA-256 digests, single-use by conditional update; per-IP and per-address limits. |
| Roles & ownership | working | Server-side permissions and ownership checks; no self-assigned roles (audited). Producer emails no longer leak on public producer pages. |
| Demo mode | simulated | One server switch `PAYMENT_DEMO_MODE`; site-wide banner "Demo — payments simulated". |
| Demo payments | simulated | Scenarios: success, declined, cancelled, expired, pending, delayed callback, duplicate callback — owner only, Pending only, 404 outside demo mode. Same `resolve_deposit` path as live. |
| Payment integrity | working | Server price/amount/currency/owner/purpose; one open charge per item (row lock); idempotent confirmation; status + grant + ledger commit together (a failed grant stays Pending and is retried); leftover demo payments fail once demo mode is off. |
| Demo vs real money | working | `LedgerEntry.simulated`; live mode never counts demo money; overview, payments ledger, wallet, statements, monthly report CSV/PDF and receipts show real and SIMULATED apart. |
| Receipts, history, refunds | working | Receipts say SIMULATED; history shows Available / Watching / Used / Expired / Refunded per purchase; audited demo refunds. |
| Email outbox | simulated | DB outbox with type, related record, status `captured` (never "sent"); admin-only preview at `/admin/email-outbox`, opening reset/verification emails is audited. |
| Notifications | working | In-app inboxes unchanged. |
| Catalog, details, trailers, release gating, related, share | working | Unchanged (server-side release checks). |
| Stream security | working (unverified on R2) | Full-film URLs only from `/stream/`; server-signed device id; HLS token bound to device + session (latest playback wins); atomic binding; 90 % rule on the film's own length. Not DRM — see residual risks. |
| Player | working | Buffering spinner, retry, distinct errors, captions menu, keyboard quality menu, shortcuts, resume on the film page. |
| Actors & casting | working | Yearly plans, talent-video checks, casting publish on payment, deadlines enforced server-side. |
| Producers | working | Setup, submission/review/resubmission, change requests, per-film stats, statements (+ CSV), monthly payouts recorded honestly. |
| Admin | working | Users, producers, films (create/update/delete now audit-logged; sold films can't be deleted), payments/refunds, finance, payouts, CMS, ads, abuse, audit log, email outbox, diagnostics. |
| Reports | working | Kigali boundaries; real vs simulated; per-film purchases, plays, unique viewers, completed views (deduplicated); CSV/PDF; producer statements CSV. |
| Debugging | working | `X-Request-ID` on every response and in error bodies (`code`, `request_id`); JSON logs with redaction; frontend shows "Reference: …"; `/api/health/`, `/api/ready/`; admin diagnostics. |
| Jobs on the free tier | working (unverified hosted) | DB-backed `JobRun`/`JobLock`; `run_jobs`; admin "Run now"; `POST /api/ops/tick/` for a free external scheduler; optional opportunistic tick. |
| Demo data | working | `seed_demo` (idempotent, guarded) + `make_demo_media` (generated sample media). |
| Genre management, editable home page, explicit draft/scheduled film statuses | gap | Genres are free text; home sections are automatic; "scheduled" = approved with a future `release_at`. |
| Provider fees, hosting-usage estimates | gap | Net = gross − refunds (tax configurable, labelled); no hosting estimate shown. |
| HLS transcoding on Render free | gap | No free worker: transcode locally (`make_demo_media --upload --transcode` or `transcode_movie`) and upload. |

## 2. Test results (local, 2026-10-14)

| Check | Result |
|---|---|
| Backend `manage.py test` (SQLite in memory) | 645/645 OK |
| `makemigrations --check` | clean |
| `manage.py check --deploy` (DEBUG off) | warnings only: HSTS subdomains/preload, SSL redirect (Render terminates TLS), X-Frame SAMEORIGIN |
| Frontend `npm run lint` | 0 errors |
| Frontend unit (Karma) | 604/604 |
| `npm run build` | clean |
| `npm run i18n:check` | en/rw keys match (Kinyarwanda needs native review) |
| Playwright E2E (`npm run e2e`) | 10/10, incl. new `demo-journey.spec.ts` (register → verify via outbox → declined payment grants nothing → duplicate confirmation grants once → SIMULATED receipt → other account blocked) |

**Unverified (hosted only):** Render deploy + health check, Supabase pooler under load, R2 CORS + range
requests from the Vercel URL, real HLS through the proxy on R2, external tick scheduler, Vercel crawler routes.

Verify-list coverage: 1 ✔ (E2E) · 2 ✔ (E2E + tests) · 3 ✔ (E2E + tests) · 4 ✔ (tests: device/session binding, other account) · 5 ✔ (tests; no moderation by decision) · 6 ✔ (tests; plans instead of search passes) · 7 ✔ (tests: review/changes/approve; scheduling via `release_at`) · 8 ✔ (tests: ledger = reports = CSV, real/simulated split) · 9 ✔ (tests: idempotent seed, locked jobs, rerun reconcile).

## 3. Commands

```bash
# Backend (../ikigembe_backend) — always point at the right database first
python manage.py migrate                  # new: payments 0010, finance 0004, users 0039–0040, movies 0025, ops 0001
python manage.py createcachetable
DEMO_SEED_ALLOWED=1 python manage.py seed_demo            # prints random passwords once (or --password / DEMO_SEED_PASSWORD)
python manage.py make_demo_media                           # local sample media (needs ffmpeg)
DEMO_SEED_ALLOWED=1 python manage.py make_demo_media --upload --transcode   # attach to seeded films (run locally, needs R2 creds)
python manage.py run_jobs --due                            # run due jobs once (same as the tick)
python manage.py test

# Frontend (this repo)
npm start · npm run build · npm run lint · npx ng test --watch=false --browsers=ChromeHeadless · npm run e2e
```

Environment: `../ikigembe_backend/.env.example` (no secrets). Deploy: Render web service only on the free
plan (`healthCheckPath: /api/health/`), set `OPS_TICK_TOKEN` and point a free scheduler (GitHub Actions
`.github/workflows/ops-tick.yml` with secrets `OPS_TICK_URL`, `OPS_TICK_TOKEN`, or cron-job.org) at
`POST /api/ops/tick/` with header `X-Ops-Token`. Vercel: `BACKEND_ORIGIN` = the Render URL.

## 4. Stakeholder walkthrough (≈ 15 min)

Start with `seed_demo` run and the banner visible ("Demo — payments simulated").

1. **Viewer** — register a new account → as admin open *Email outbox*, show the captured verification email
   ("Captured for demo", not delivered) → open the link → signed in.
2. Browse home (featured, new, coming soon), search and filter `/films`, open a film (credits, trailer, price
   Frw 1,000). A coming-soon film shows its date, no buy button.
3. Buy: choose *Payment is declined* → no access. Buy again with *Confirmation arrives twice* → access once;
   profile → history shows one paid purchase, receipt marked SIMULATED.
4. Watch, close at a few minutes, reopen → resumes. Show the history status "Watching — until …".
5. **Actor** (seeded actor) — membership, talent videos (live / failed with reason), apply to a casting call.
6. **Producer** (seeded ready producer) — dashboard, per-film stats, wallet (SIMULATED note), statements CSV,
   casting call published on payment, applicants and shortlist.
7. **Admin** — dashboard money strip (real vs simulated), payments ledger (filters, CSV, refund a demo
   purchase), film review queue (pending / changes requested / rejected), finance + monthly report PDF
   (SIMULATED), audit log (film price change shows before/after), diagnostics (jobs, Run now).

## 5. Debug runbook

- **A user reports an error:** ask for the "Reference: …" shown under the message (= `X-Request-ID`). Search
  Render logs (JSON) for `"request_id": "<ref>"`: one access line + any errors for that request.
- **Payment stuck Pending:** admin → Payments → filter Unresolved → open → *Re-check*. Demo payments expire
  after 30 min; reconcile runs via the tick (`reconcile_payments`). Trace: payment row → `failure_reason` →
  ledger entry (`simulated`) → benefit (purchase / membership / casting) → `/stream/` refusal `code`.
- **Can't play:** the player/stream refusal `code` says why (`purchase_required`, `view_used`, `other_device`,
  `device_invalid`, `session_replaced`, `not_released`, `stream_unavailable`).
- **Jobs:** admin → Diagnostics shows last run, attempts, last error, next due; *Run now* is locked against
  double runs (409 `job_running`). CLI: `run_jobs --job <name>`.
- **Health:** `/api/health/` (process up), `/api/ready/` (database, cache, migrations).
- **Emails:** admin → Email outbox (status, type, related record). Never "delivered" in captured mode.
- **Never log** passwords, JWTs, reset tokens, R2 keys or signed URLs — the log filter redacts them; keep it.

## 6. What is simulated

Payments (all purposes) and refunds · producer payouts (demo provider; or *Record transfer* with a reference
for real off-platform payments) · email delivery (captured) · the DPO hosted page (`/payment/demo-checkout`) ·
sample media (generated test pattern). Real: authentication, permissions, prices, entitlements, release
rules, single-device policy, moderation removals, ledger arithmetic, reports.

## 7. Residual risks

- Single-device playback is a browser restriction, not DRM: copying the device id to another browser on the
  same account passes; segment URLs already handed out keep working until they expire (film length + 1 h).
- External tick every 5 min keeps the Render free instance awake (~744 of 750 free hours/month).
- Kinyarwanda strings are machine-assisted. Terms/refund text need legal review.
- Single-device binding race is tested sequentially (SQLite); PostgreSQL row locks cover the concurrent case.

## 8. Production checklist

1. **Domain**: buy a domain; set `FRONTEND_URL`, CORS/CSRF origins, R2 CORS, cookie settings; enable HSTS
   preload only once all subdomains are HTTPS.
2. **Email**: provider (e.g. Resend) with a verified sending domain; `EMAIL_DELIVERY=send`; SPF/DKIM/DMARC.
3. **Payments**: verified DPO (or PawaPay) merchant account, sandbox end-to-end test, callback URL, then
   `PAYMENT_DEMO_MODE=False` — startup refuses live mode without credentials. Implement the DPO payout adapter.
4. **Data**: go live on a fresh database (or remove demo rows); never run `seed_demo` there.
5. **Backups**: Supabase paid tier (daily backups / PITR) or scheduled `pg_dump` to storage; test a restore.
6. **Infrastructure**: paid Render instance (no sleep), a worker for HLS transcoding (or a managed
   transcoder), cron jobs or keep the tick; R2 private bucket checked; `ENFORCE_SINGLE_DEVICE_VIEW=True`.
7. **Legal/finance**: tax rate confirmed by an accountant; terms, privacy, refund policy reviewed.
8. **Monitoring**: log drain/alerting on 5xx and job failures; uptime check on `/api/ready/`.
