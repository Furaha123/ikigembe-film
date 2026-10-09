# Implementation checklist (test-readiness)

Single source of truth for the test-readiness programme across both repos:

- Frontend: `ikigembe-film` (this repo), branch `feat/test-readiness`
- Backend: `../ikigembe_backend`, branch `feat/test-readiness`

Status values: **missing** · **partial** · **implemented** (code written) · **verified** (tests/build green) · **blocked** (needs external setup or a decision — reason given).

Update this file at the end of every work session: status, changed files, checks run, next task.

## Product decisions in force

| Topic | Decision |
|---|---|
| One view, one device | Backend-enforced, env flag `ENFORCE_SINGLE_DEVICE_VIEW` (on in staging, explicit in production). Device-bound, one active playback session, resume on the same device within the window. Failed authorization never consumes a purchase. |
| Film price | Frw 1,000 default per film; only admins override; producers can't change a published price; server computes checkout amount. |
| Producer setup | **Changed 2026-10-08: no admin approval.** A producer completes the profile once and signs the distribution agreement; then they can submit films, buy producer services, publish casting calls and search actors. Before that they can sign in and use their dashboard. An expired agreement locks services until renewal. Admins only suspend/reactivate. |
| Casting calls | Published only after payment **and** admin approval. Draft → paid/pending review → published or rejected. No publication after the deadline. Refund eligibility is separate from moderation. |

## Phase 0 — security, green tests, admin dashboard

Audit references (from the gap audit in the session that created this file):

| # | Item | Status | Notes |
|---|---|---|---|
| A1 | PawaPay webhook trusts unauthenticated status / skips amount check | verified | Callbacks only trigger our own `get_deposit`/`get_payout` check (amount + currency); demo/DPO payments ignored. `payments/views.py`, `services.refresh_payout`. Tests: `PawapayWebhookTests`, `PayoutWebhookTests`. |
| A2 | Backend accepts `role=Producer` at registration | verified | `RegisterSerializer.validate_role` → Viewer only. Test updated to expect 400. |
| A3 | No login throttling/lockout; forgot-password not rate-limited | verified | `ikigembe_bn/throttles.py`, `apps/users/login_guard.py`, migration `users/0024`. FE shows the wait-time message on 429. Tests: `tests_security.py`. |
| A4 | Change-password keeps other sessions; weak validation | verified | Rotates session, runs `validate_password`, returns new session. **FE bug fixed:** client never sent `confirm_password` (every change failed 400); now sent and new session stored. |
| A8 | Red test suites + missing migration | verified | BE 335/335, FE 473/473, `makemigrations --check` clean (`marketplace/0005`). Stale specs updated to current UI (poster step, KPI counts, new selectors). |
| A9 | Config | verified (code) / blocked (Render dashboard) | Tests pin demo mode + single-device flag; `DEBUG` defaults False; `SECRET_KEY` required outside DEBUG; `CACHE_BACKEND=db` + `createcachetable`; `reconcile-payments` cron; all services get `SECRET_KEY`. **Blocked:** values must be entered in the Render dashboard (secrets). Local `.env` still points at the hosted DB — documented, not changed (user file). |
| D1 | Admin dashboard `marketplace_payments_confirmed` always 0 | verified | Root cause: movie-only `Payment.objects`. Now `all_objects`; regression test. |
| S1 | Security sweep | verified | Fixed: Google pre-hijack (`email_verified`, unusable password on unverified link), email change re-verification, upload type allow-list + server Content-Type, raw storage errors hidden, DOB locked after a priced upload, producer mass-assignment (`is_featured`/`producer_profile`/`is_active`/`price`), withdrawal race (lock producer row), staff/superuser protected from dashboard admins, webhook payload logging redacted, logout revokes access token. Accepted as intended: producers see applicants' videos on their own casting call (actor chose to apply). |

## Phase 1 — core user journeys

| # | Item | Status | Notes |
|---|---|---|---|
| 1A | Release gating | verified | `apps/movies/release.py` + `Movie.objects.listed()/released()/upcoming()`; `release_at` (Kigali midnight of `release_date` by default; admin form has a time). Lists show released only, `upcoming/` coming soon, search/detail/preview listed. Checkout → 409 `not_released`; `/stream/` → 403 `not_released` without binding/counting; progress → 404. Admin/owner preview kept. `publish_releases` cron (15 min) announces once (`release_announced_at`); access never waits for it. Migration `movies/0020` (backfills `release_at`, marks live films announced, approves seed films left `pending_review` with no producer so nothing visible disappears). FE: `release_state` badge/CTA, carousel badge, stream-error codes. Tests: `tests_release.py`, FE specs. |
| 1B | Pricing + producer approval | verified | Price default 1000 (`DEFAULT_FILM_PRICE`), NULL/500 → 1000 in `0020`, other prices kept; producers can't set/edit price (create, resubmit, PATCH); admin form min 1. `User.producer_status` (none/pending/approved/rejected) separate from `account_status`; `IsApprovedProducer` gates film create/upload/resubmit and every producer marketplace endpoint; migration `users/0025` keeps working producers approved. Admin approve/reactivate/reject(reason)/documents endpoints with audit + notification. FE: access map `requiresApprovedProducer`, dashboard banners (pending / rejected + reason + re-apply), upload guard, admin page statuses + documents from real data. Tests: `tests_producer_approval.py`, access spec. |
| 1C | Actor videos | verified | `apps/marketplace/media.py`: after upload `processing` → server measures size (HEAD), container+duration (ffprobe), thumbnail (ffmpeg) → `pending_review` or `upload_failed` (+reason, object deleted, free retry on the same slot). MP4/MOV only, 500 MB / 5 min in `MarketplaceSettings` (admin-editable). Fee band snapshot on the video, amount on the payment; one slot per payment; replacement = new paid slot with `replaces`, old stays live until approval (`replaced`). Actor delete (soft). Search fee default 20,000 (migration only changes an unedited 15,000). FE: videos page states, polling while processing, retry, replace, delete; wizard MP4/MOV + size + replacement. Tests: `tests_lifecycle.py`, FE specs. **Infra:** ffmpeg/ffprobe needed on the web service and `marketplace-jobs` cron (render.yaml installs it). |
| 1D | Notifications & receipts | verified | `EmailOutbox` (dedup, after-commit, retry/backoff, `send-outbox` cron), `notifications.notify()` (right inbox per role + email), `payments/receipts.py` for every purpose (reference, item, amount, currency, date, status, method), `GET /payments/<ref>/receipt/` owner/admin only, `completed_at`. Events: producer review, talent video received/failed/approved/rejected/removed, casting in review/published/rejected/removed/closed, application received/status, search-access expiry, film released, admin alerts (producer application, video & casting to review, stuck processing). Old email links now use `FRONTEND_URL`. Admin manual resolve goes through `resolve_deposit`. FE: receipt dialog in payment history (also for producers). |
| 1E | Casting moderation + deadline job | verified | `apps/marketplace/casting.py`: draft → paid → `pending_review` → admin approve → `published` / reject (reason) → edit + `submit/` (no new fee). Approval refuses unpaid or past-deadline calls; payment alone never publishes; existing published calls untouched. `marketplace_jobs` closes expired calls once (`closed_at`), applications refused at request time. FE: producer states + reason + edit & resend, admin approve/reject. Refund eligibility left to the refund workflow (Phase 2B). |
| 1F | Payment reconciliation job | verified | Bounded, isolated per record, payouts too, shares webhook transitions (`resolve_deposit`, `refresh_payout`), never downgrades. Admin view of unresolved payments: Phase 2A. |

## Phase 2 — admin operations

| # | Item | Status | Notes |
|---|---|---|---|
| 2A | Admin payments ledger | verified | `payments/admin_views.py`: every purpose, server filters (reference/user/phone/name, purpose, status, provider, dates in Kigali, refund state, unresolved > 30 min), pagination ≤ 100, totals (paid/refunded/net), detail (benefit, refunds, refundable amount), re-check with provider, CSV with the same filters and formula-injection guard (`csv_safe`), export audited. FE `/admin/payments` with URL-synced filters + drawer. |
| 2B | Refund workflow | verified | `PaymentRefund` (requested → processing → completed/failed), `payments/refunds.py`: completed payments only, never above what is left, one in flight per payment (row lock), provider refunds only for PawaPay (+ demo), DPO → manual with transfer reference; nothing "refunded" before confirmation; full refund → payment `Refunded` (drops out of revenue/entitlement) + benefit revoked (film access, talent slot, casting call, search window); refund callbacks re-checked with PawaPay; reconciliation covers refunds; audited; buyer notified. **Unverified live:** PawaPay `/refunds` request shape against the sandbox. |
| 2C | Audit-log viewer | verified | `audit-logs/` paginated with actor/action/target/resource/date filters + action labels; entries append-only (model refuses save-after-create/delete); details redacted for password/token/secret keys. New actions logged: refunds, re-checks, exports, producer/casting/film-change decisions, settings, transcode retries. FE `/admin/audit-log`. |
| 2D | Transcode health | verified | `hls_attempts`, worker auto-retries failed jobs only while attempts < 3, terminal failures alert admins once, safe error text (no paths/URLs), `transcodes/` list + counts, guarded retry (conditional claim, 409 on duplicate), audited. FE `/admin/transcodes`. |
| 2E | Platform settings | verified | New app `platform_settings`: default film price (new films), single-view resume window (playback now reads it; env value seeds it), tax rate (explicit, null until set), operations %; validated, audited before/after, read-only environment switches (single-device flag, provider, demo, default split). Marketplace fees + talent limits stay in `MarketplaceSettings`; its page no longer shows a form after a failed load (no default overwrite) and maps server field errors. FE `/admin/platform-settings`, `/admin/marketplace-settings`. Default 70/30 split intentionally not editable (would rewrite past reports). |
| 2F | Producer edit locking + revisions | verified | `apps/movies/editing.py`: direct edits only in changes_requested/rejected (resubmit allowed from both), locked while reviewed, approved films change through `FilmChangeRequest` (metadata revision or unpublish; one pending per kind; admin approve applies / reject with reason; audited; notified). Price/owner/flags/revenue never producer-editable. FE: producer "Request changes"/"Request unpublish", admin `/admin/film-requests`. |

## Phase 3 — discovery and public site

| # | Item | Status | Notes |
|---|---|---|---|
| 3A | Public homepage | verified | `/` = `HomeComponent` (signed in or not): featured film (`movies/featured/`), new releases, coming soon, most watched, actions (browse all, create account, actors & casting); loading / partial / total-error states. Header: Home, Films, My List only when signed in; Enter in search opens `/films?q=`. |
| 3B | Catalog search/filters/sort/paging | verified | `GET movies/catalog/` (q over title/overview/cast/director, exact genre, language, year, availability released/coming_soon/all, sort newest/most_watched/title, page_size ≤ 48), `movies/genres/` (+ languages). New `Movie.director/writer/original_language` (producer upload already sent director/writer; now stored). FE `/films` with URL state, skeleton/empty/error, pagination. |
| 3C | Film details | verified | `/movie/:id` public (visitors read + trailer; buy/watch → sign in with return URL); credits (director, writer, language, genres, cast), release status, related films via `movies/<id>/related/` (listed only, genre-ranked, released first; stubs removed), share button (Web Share → copy-link fallback). Admin form edits credits/language. |
| 3D | Refund policy, sitemap, metadata | verified | `/refund-policy` (CMS `refund-policy` page or built-in text describing the implemented process — **needs legal review**, promises nothing extra). Dynamic sitemap `GET /api/sitemap.xml` (static public pages + listed films + approved producers; no account/checkout/admin URLs) behind a Vercel rewrite; static sitemap removed from the build; robots allows /films, /movie/, /refund-policy. Film pages indexable (`noindex` only when unavailable); JSON-LD points to `/movie/<id>`. Crawler-visible per-film metadata still needs SSR (4E). |

## Phase 4 — finance and extras

| # | Item | Status | Notes |
|---|---|---|---|
| 4A | Finance engine | verified | App `finance`: `LedgerEntry` (append-only, one per confirmed payment / refund, booked outside closed periods), `RevenuePeriod` (monthly, closed once under row lock, snapshots tax & ops rates and totals), `Allocation` (append-only), `ProducerStatement` (payout status/reference recorded, no disbursement). Engine `finance/allocation.py`: explicit tax (blocks if unset) → operations (contract platform % or settings default 30 %) → contract split of the rest (largest remainder, integer RWF, exact reconciliation); refunds reverse; producer film without agreement blocks with an actionable message. Hooks: `resolve_deposit` and refunds record entries; `finance_backfill` command + reconcile cron catch-up. Admin `/admin/finance` (preview, close, CSV, payouts), producer `/producer/statements` (own only). With tax 0 the producer share equals the wallet. **Decision needed:** the applicable tax rate, and how wallet balances (pre-tax) relate to post-tax statements. |
| 4B | Monthly PDF/CSV reports | verified | `finance.MonthlyReport` (append-only snapshot JSON, history kept; regenerate adds a row). `finance/reports.py`: Kigali month; revenue/refunds by category from `LedgerEntry.booked_at` (same as finance periods), top films, views from server playback events (notes when tracking started), users new/total by role, films submitted/released/listed, actor slots paid/approved/rejected, producer services by purpose. `POST/GET /api/admin/dashboard/finance/reports/`, `/reports/<id>/`, `/reports/<id>/report.csv|pdf` (formula-safe CSV, reportlab PDF), all audit-logged. Scheduled: `reconcile_payments` stores last month once and emails admins; `manage.py monthly_report --month YYYY-MM` by hand. UI `/admin/reports/monthly`. New dependency `reportlab==4.4.4`. |
| 4C | Event tracking | verified | App `analytics`: `AnalyticsEvent` (stable names, unique dedup key). Browser events `page_view`, `trailer_play`, `checkout_open`, `casting_view` via `POST /api/analytics/events/` (≤ 20 per batch, throttle scope `events`, unknown names/props dropped, query strings stripped, visitor id hashed, user reduced to role, repeats ignored). Server events (trusted, idempotent): `playback_start` (stream), `playback_complete` (≥ 90 %), `payment_completed` / `service_purchased` / `payment_failed` (resolve_deposit), `casting_application`. Admin `GET /api/analytics/events/summary/?days=`. Frontend `AnalyticsService` (batched, keepalive flush on page hide, honours Do Not Track, best effort). Events never grant access or feed finance. |
| 4D | Abuse reports | verified | App `abuse`: `AbuseReport` (film / casting call / actor account id; 9 categories; open → actioned/dismissed). `POST /api/abuse-reports/` signed-in only, public items only (listed film, published/closed call, directory actor), throttle scope `abuse_report` (default 10/hour/IP), one open report per person per item (DB constraint; repeat returns `already_reported`), admins emailed once per item per day. Admin queue `GET /api/admin/dashboard/abuse-reports/` (filters, per-item open counts, moderation link) and `POST …/<id>/resolve/` (actioned needs a note; once only, 409 after; audit `resolve_abuse_report`; reporter told in-app). **Never hides content automatically.** UI: `ReportButtonComponent` on film detail, casting detail and producer actor detail; `/admin/abuse-reports`. |
| 4E | SSR / prerender for public pages | implemented | Chosen approach: crawler metadata pages instead of a Node SSR deployment (no new paid service). `apps/movies/crawler.py`: `GET /api/seo/movie/<id>` (listed films only: title, trimmed description, image, canonical, OG/Twitter tags, schema.org Movie JSON-LD with `<` escaped, visible text) and `GET /api/seo/casting/<id>` (published/closed calls; `noindex` because the real page needs sign-in); anything else 404 + noindex; no prices, entitlements or signed links. `vercel.json` sends bot user agents (Googlebot, facebookexternalhit, WhatsApp, Twitterbot, Slack, LinkedIn, Telegram, Discord, …) on `/movie/:id` and `/casting/:id` to them; people still get the SPA. Backend tests verified; **the Vercel `has` rewrite can only be verified after deploy** (check with `curl -A Googlebot https://<site>/movie/<id>`). Full Angular SSR remains possible later (files exist; needs `outputMode: server` + a Node runtime). |
| 4F | Kinyarwanda / English coverage | implemented | `npm run i18n:check` (`scripts/i18n-check.mjs`): fails on en/rw key mismatch or static keys missing from en.json; reports untranslated rw values by section. English fallback (`fallbackLang: 'en'`). Viewer flows translated (auth, header/footer, home/browse/films, film page, player, payment, profile, refund policy, report/share): rw coverage 16 % → 35 % of keys. **Machine-assisted: needs native review** (`docs/i18n-review.md`). Pending: `marketplace.*` (next), producer/admin screens, `terms.*` (publish a reviewed `terms-rw` CMS page). |
| 4G | HLS encryption + session watermark | implemented | `HLS_ENCRYPTION`: per-film random AES-128 key (`movies/hls_keys.py`), sealed with Fernet (`HLS_KEY_SECRET` or SECRET_KEY) on `Movie.hls_key_sealed`, never stored in the bucket; ffmpeg `hls_key_info_file`; proxy rewrites only `EXT-X-KEY … URI="key.bin"` to `GET /api/movies/<id>/hls-key?token=` (same token + entitlement re-check as playlists, `no-store`); other URI attributes refused; encrypted films get no MP4 fallback. Migration movies 0024. `PLAYBACK_WATERMARK`: `/stream/` returns `watermark` (`IKG-` + HMAC of user/film), drawn over the player and moved every 30 s; admin trace `GET /api/admin/dashboard/watermark-lookup/` (audit `trace_watermark`). Unit/API tests verified; **real ffmpeg encrypted transcode + Safari/Chrome playback to verify in staging.** |

## Session log

_Newest first. Each entry: date, phase, changed files, checks and results, next task._

### 2026-10-08 — ESLint + Playwright E2E
- ESLint: `angular-eslint` 19 (`eslint.config.js`, `npm run lint`): 274 errors → 0 by fixing code (keyboard support on clickable elements/backdrops, label `for`/`id`, `===`, real types instead of `any`, stub names, `app-date-picker` selector). No rules disabled.
- Playwright (`npm run e2e`, `e2e/README.md`): 8 tests over access control, film purchase + playback + receipt, coming-soon refusal, producer setup (profile + agreement → upload), casting call payment + approval, admin refund. Own stack: seeded SQLite API on 8001 (`e2e/support/start-backend.mjs`, backend `seed_e2e`), `ng serve` on 4300; demo payments, fake storage, locmem email.
- Bugs found by the suite and fixed: (1) refresh-token rotation signed users out when a page was left mid-refresh → `REFRESH_REUSE_GRACE_SECONDS` grace (backend tests added); (2) SQLite "database is locked" lost in-app notifications under runserver → SQLite `timeout` + `IMMEDIATE` transactions.
- Backend: `seed_e2e` (+ `tests_seed_e2e.py`), `ikigembe_bn/e2e_storage.py`, settings (`REFRESH_REUSE_GRACE_SECONDS`, `E2E_LOCAL_STORAGE`, SQLite options).
- Checks: BE 456 OK, `makemigrations --check` clean; FE lint 0 errors, 499 unit OK, build clean, `i18n:check` OK, `e2e:typecheck` OK, E2E 8/8 (three consecutive green runs).
- Escape for dialogs fixed in a follow-up (2026-10-09): shared `appModalBackdrop` directive on 38 backdrops in 17 components; Escape works from inside the dialog and closes only the topmost layer (payment modal joins the same stack). Directive spec (6) + E2E Escape checks on the receipt dialog and the refund drawer. FE 505 unit OK, lint 0, E2E 8/8.

### 2026-10-08 — Producer approval replaced by producer setup
- Decision (product owner): admins don't approve producers; producers complete their profile once and sign the agreement.
- Backend: `users/permissions.py` (`producer_setup`, `is_ready_producer`, `IsReadyProducer`, 403 `code: producer_setup_required`), `UserSerializer.producer_setup`, upgrade view (no pending state, no admin alert), admin approve/reject replaced by `producers/<id>/reactivate/`, admin list `status` ready/incomplete/suspended + `profile_complete`/`contract_signed`, onboarding requires country/bio/experience, migration `users/0035` (pending/rejected producers → approved), `users/testing.py`, `tests_producer_setup.py` (replaces `tests_producer_approval.py`).
- Frontend: access map `requiresReadyProducer`/`isReadyProducer`/notice `producerSetup`; `AuthService.contractSigned`/`producerReady`/`refreshProfile()`; `readyProducerGuard`; producer layout setup banner; onboarding without Skip → agreement; agreement welcome and contracts dashboard no longer require an uploaded/approved film; admin producers page (setup status, reactivate only); i18n.
- Checks: BE 451 OK; FE 499 OK; build clean; `i18n:check` OK.

### 2026-10-08 — Phase 4B–4G complete; final docs
- Backend: `finance/reports.py` + `MonthlyReport` (finance 0002, `monthly_report` command, cron hook in `reconcile_payments`, `reportlab`); app `analytics`; app `abuse`; `movies/crawler.py` (+ vercel bot rewrites); `movies/hls_keys.py`, `movies/watermark.py`, key endpoint, movies 0024; users 0033–0034 (audit actions); render.yaml env vars. Docs: `docs/operations.md`, updated `docs/pay-per-view-policy.md`.
- Frontend: `AnalyticsService`; `/admin/reports/monthly`; `ReportButtonComponent` + `/admin/abuse-reports`; player watermark; `scripts/i18n-check.mjs`, rw translations; `docs/i18n-review.md`, `docs/staging-test-guide.md`.
- Checks: BE 450 OK, `makemigrations --check` clean; FE 499 OK, build clean; `npm run i18n:check` passes.
- Remaining: staging verification of live-only items (see `ikigembe_backend/docs/operations.md` → Blockers), native Kinyarwanda review, tax-rate decision.

### 2026-10-08 — Phase 4A complete
- Backend: app `apps/finance` (models, ledger, allocation, views, urls, tests, `finance_backfill`), hooks in payments services/refunds/reconcile. Frontend: `/admin/finance`, `/producer/statements`.
- Checks: BE 420 OK, migrations clean; FE 487 OK, build clean.
- Next: 4B monthly reports (PDF/CSV), then 4C events, 4D abuse reports, 4E SSR, 4F i18n, 4G HLS encryption/watermark; final docs (operations guide, staging test guide).

### 2026-10-08 — Phase 3 complete
- Backend: `apps/movies/catalog.py` (+ urls, sitemap), migration movies 0023. Frontend: `pages/{home,films,refund-policy}`, `shared/components/share-button`, detail page, header, robots/vercel/angular.json.
- Checks: BE 409 OK; FE 487 OK; build clean.
- Next: Phase 4A finance engine.

### 2026-10-08 — Phase 2 complete
- Backend: `payments/{refunds,admin_views}.py`, `PaymentRefund`, `Refunded` status; audit log filters/immutability; `movies/{admin_transcodes,editing,admin_film_requests}.py`, `FilmChangeRequest`, `hls_attempts`; app `platform_settings`. Migrations payments 0008, users 0028–0031, movies 0021–0022, platform_settings 0001.
- Frontend: admin pages payments (+drawer), audit log, transcodes, platform settings, film requests; producer change/unpublish requests; marketplace settings fixes.
- Checks: BE 404 OK; FE 484 OK; build clean.
- Next: Phase 3 public site & discovery.

### 2026-10-08 — Phase 1 complete
- Backend: `apps/movies/release.py`, `publish_releases`; `users/notifications.py`, `outbox.py`, `send_outbox`; `marketplace/{media,casting,notifications}.py`, `marketplace_jobs`; `payments/receipts.py`; migrations movies 0020, users 0025–0027, marketplace 0006–0007, payments 0007; render.yaml crons `publish-releases`, `marketplace-jobs`, `send-outbox`.
- Checks: BE 375 OK, `makemigrations --check` clean. FE 480 OK, build clean.
- Next: Phase 2A admin payments ledger.

### 2026-10-08 — Phase 0 complete
- Backend changed: `ikigembe_bn/{settings,throttles}.py`, `apps/users/{views,serializers,models,login_guard,managers,admin_views}.py`, `apps/payments/{views,services,pawapay}.py`, `reconcile_payments.py`, `apps/movies/{views,producer_views}.py`, `apps/marketplace/{serializers,views,testing}.py`, migrations `users/0024`, `marketplace/0005`, `render.yaml`, `CLAUDE.md`, tests.
- Frontend changed: `core/services/auth.service.ts`, `pages/profile`, `pages/login`, i18n `auth.login.tooManyAttempts`, 3 specs.
- Checks: BE `manage.py test` 335 OK; `makemigrations --check` clean. FE `ng test` 473 OK; `npm run build` clean.
- Next: Phase 1A release gating.
