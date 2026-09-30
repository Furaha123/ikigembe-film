# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev server (http://localhost:4200)
npm start

# Production build
npm run build

# Unit tests (Karma/Jasmine) — headless, single run
npx ng test --watch=false --browsers=ChromeHeadless

# Run a single test file
npx ng test --include='**/auth.service.spec.ts'

# SSR serve (only works once SSR is enabled in angular.json — see "SSR" below)
npm run serve:ssr:ikigembe-film

# Angular CLI (schematics, generate, etc.)
npx ng <command>
```

No dedicated lint script in package.json; use `npx ng lint` if ESLint is configured.

## Architecture

Angular 19 standalone components — no NgModules. All components declare their own imports.

### Role-based routing

Three user roles (Viewer, Producer, Admin) each have separate lazy-loaded route trees and layout shells:

| Role | Paths | Layout | Guard |
|------|-------|--------|-------|
| Viewer | `/browse`, `/movie/:id`, `/profile`, `/my-list` | Core `header`/`footer` | `authGuard` + `viewerGuard` |
| Viewer (actor marketplace) | `/actor/profile`, `/actor/videos`, `/actor/applications`, `/casting`, `/casting/:id` | Core `header`/`footer` + `ActorNavComponent` | `authGuard` + `viewerGuard` |
| Producer | `/producer/*` incl. `/producer/casting`, `/producer/casting/:id`, `/producer/actors`, `/producer/actors/:id` | `ProducerLayoutComponent` | `producerGuard` (role = Producer) |
| Admin | `/admin/*` incl. `/admin/marketplace`, `/admin/cms/pages`, `/admin/cms/ads` | `AdminLayoutComponent` | `adminGuard` (is_staff = true) |
| Public | `/terms`, `/about`, `/privacy`, `/contact`, `/pages/:slug` (CMS), `/preview/:id`, `/producers` | none | — |

Guest routes (`/login`, `/register`, `/forgot-password`) use `guestGuard` which redirects already-authenticated users to their role's home.

Actors are **Viewer** accounts with an actor profile — there is no Actor role.

### Auth flow

`core/services/auth.service.ts` manages all JWT state via Angular Signals:
- Tokens stored in `localStorage` as `ikigembe_token` / `ikigembe_refresh`
- `auth.interceptor.ts` injects Bearer tokens and auto-refreshes on 401, queuing concurrent requests during refresh
- Key signals: `isLoggedIn`, `isAdmin`, `userRole`, `accountStatus`
- `getAccessToken()` is for requests HttpClient can't make (e.g. `fetch(..., { keepalive: true })` on page unload)

### Feature areas

- **`src/app/core/`** — Auth, interceptor, guards, header/banner/footer, and core services (payments, CMS, ads, device ID, language, data saver, SEO)
- **`src/app/shared/`** — Reusable UI (`VideoPlayer`, `MovieCarousel`, `PaymentModal`, `AdSlot`, `CmsPageBody`, `DatePicker`), shared services (`MovieService`, `WatchProgressService`, `MultipartUploadService`, `ActorMarketplaceService`), models, utils (`api-error`, `stream-error`, `marketplace-status`), `styles/marketplace-page.scss`, `testing/` fixtures
- **`src/app/pages/`** — Public/viewer pages (incl. `actor/`, `casting/`, `cms-page/`), each lazy-loaded via `loadComponent`
- **`src/app/admin/`** — Admin dashboard: users, producers, movies (incl. per-film revenue splits), withdrawals, contracts, marketplace moderation, CMS pages & ads, reports
- **`src/app/producer/`** — Producer dashboard: onboarding, upload, movies/resubmit, wallet, withdrawals, contracts, casting calls, actor directory

### Key services

| Service | Location | Responsibility |
|---------|----------|---------------|
| `AuthService` | `core/services/auth.service.ts` | JWT lifecycle, user state signals |
| `MovieService` | `shared/services/movie.service.ts` | Catalog, detail, `getStream()` (the only viewer playback source), My List, `saveProgress()` |
| `WatchProgressService` | `shared/services/watch-progress.service.ts` | Posts watch progress (interval/pause/end/close; keepalive fetch on unload) |
| `DeviceIdService` | `core/services/device-id.service.ts` | Per-browser `ikigembe_device_id` for the single-device view policy |
| `PaymentService` | `core/services/payment.service.ts` | Movie payment initiation, `pollUntilSettled()` (shared by all purchases), history with `purpose` |
| `MovieUploadService` | `shared/services/movie-upload.service.ts` | `/movies/upload/*` endpoints, bound to a `field_name` (admin + producer) |
| `MultipartUploadService` | `shared/services/multipart-upload.service.ts` | initiate → sign-part → complete (abort on error/cancel) for any `MultipartUploadApi` |
| `ActorMarketplaceService` | `shared/services/actor-marketplace.service.ts` | Actor profile, talent videos (+upload API), casting calls, applications |
| `CastingService` | `producer/services/casting.service.ts` | Producer casting calls, applications, directory pass, actor search, shortlist |
| `CmsService` / `AdsService` | `core/services/` | Public CMS pages (bilingual lookup) and ads (+ impression/click tracking) |
| `AdminService` | `admin/services/admin.service.ts` | Admin CRUD for users, producers, movies, withdrawals, reports, revenue shares |
| `AdminMarketplaceService` / `AdminCmsService` | `admin/services/` | Marketplace moderation; CMS pages and ad campaigns (multipart) |
| `ProducerService` | `producer/services/producer.service.ts` | Wallet, films, `movieUploadApi(field_name)`, `resubmitFilmFiles()`, notifications |

### Playback rules (private media)

- **A viewer plays a film only through `MovieService.getStream(id)`** (`GET /api/movies/<id>/stream/`). Pass `stream_url` to the player unchanged; `fallback_url` is only for a fatal HLS error; subtitles come from the `/stream/` response. Never use `video_url` / `hls_url` from list or detail responses for viewer playback.
- Each `/stream/` call increments the view counter — call it once per playback session. The player re-requests it **once** on a fatal 403 (expired token) via its `refreshSource` input, then shows its error state.
- Signed URLs (stream/fallback/subtitle/actor-video URLs) are credentials: keep them in component memory only — never `localStorage`, router state, logs or analytics.
- hls.js must not send credentials or an Authorization header (the playlist proxy uses a `token` query param; segments are cross-origin presigned URLs).
- `X-Device-Id` (from `DeviceIdService`) is sent on `/stream/` **only**. `/stream/` refusals are classified in one place: `shared/utils/stream-error.ts` (`purchase_required`, `view_used` → Buy again, `other_device`, …).
- `has_purchased` can flip back to `false` (single-device policy); re-read it after playback or a refused stream.
- Watch progress (`{ progress_seconds, duration_seconds }`) is load-bearing: a view is consumed at ≥ 90 %.
- Producer/admin previews may use their endpoints' `hls_url`, but fetch it fresh each time the preview opens.

### Uploads

All uploads use the multipart flow through `MultipartUploadService`. Movie files (admin **and** producer): `MovieUploadService.api(field_name)` (`ProducerService.movieUploadApi()` delegates to it) with `field_name` ∈ `video_file | trailer_file | thumbnail | backdrop | copyright_document` (it decides the storage bucket). `/movies/create/` and `/movies/<id>/update/` accept only `video_key` / `trailer_key` for video — never post the raw video file; images (thumbnail, backdrop) are sent as files. Admin-created films link the producer via `producer_profile` (account id). Actor talent videos: `ActorMarketplaceService.videoUploadApi(videoId)`.

### Marketplace purchases

Every marketplace fee goes through `PaymentModalComponent` with a `ServicePurchase` (`[service]` input) and shares `PaymentService.pollUntilSettled()`. A `503` means pricing isn't configured yet ("This service isn't available yet").

### Revenue splits

Splits are per film. Never hardcode 70/30 or multiply by 0.7 — display API amounts, or use `producer_share_percentage` (wallet, blended) where a percentage label is needed. Admin splits are append-only (`RevenueSharesDialogComponent`).

### CMS pages & ads

- `CmsPageComponent` renders `/terms`, `/about`, `/privacy`, `/contact` and `/pages/:slug`. Body HTML is bound with `[innerHTML]` (Angular sanitizes it) — never use `bypassSecurityTrust*`. Kinyarwanda looks up `<slug>-rw`, then `<slug>`. `/terms` falls back to the built-in `TermsComponent` text if the page is missing.
- `<app-ad-slot placement="…">` (placements: `home_hero`, `home_banner`, `browse_inline`, `movie_detail`, `sidebar`) renders nothing without a live ad, with data saver on, or on the server. Impressions: once per ad per page view at ≥ 50 % visible for ≥ 1 s. Tracking failures are ignored.

### i18n

ngx-translate with `src/assets/i18n/en.json` and `rw.json`. Add every new key to **both** files. Many newer keys still hold English text in `rw.json` pending translation.

### Environment & API

Backend: `https://ikigembe-backend.onrender.com/api` (same URL for dev and prod by default).

Override in production via Vite env vars `NG_APP_API_URL` / `NG_APP_BACKEND_URL` (see `src/environments/environment.prod.ts`).

Backend errors are `{ "error": "<message>" }` (DRF validation: `{ "<field>": ["..."] }`); use `apiErrorMessage()` from `shared/utils/api-error.ts`.

### SSR

`@angular/ssr` files exist (`app.config.server.ts`, `app.routes.server.ts`, `server.ts`), but **the build does not enable SSR/prerendering yet**: `angular.json` has no `server`/`ssr`/`outputMode`, so `ng build` emits a client-only app (deployed as static files on Vercel). Code must still be SSR-safe: guard `window`, `document`, `localStorage`, `IntersectionObserver`, `crypto`, `Hls`, `HTMLVideoElement` with `isPlatformBrowser()`.

### State management

No NgRx. Reactive state is handled with Angular Signals and RxJS. Shared signal state lives in `AuthService`.
