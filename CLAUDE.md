# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev server (http://localhost:4200)
npm start

# Production build
npm run build

# Unit tests (Karma/Jasmine)
npm test

# Run a single test file
npx ng test --include='**/auth.service.spec.ts'

# SSR build & serve
npm run serve:ssr:ikigembe-film

# Angular CLI (schematics, generate, etc.)
npx ng <command>
```

No dedicated lint script in package.json; use `npx ng lint` if ESLint is configured.

## Architecture

Angular 19 standalone components — no NgModules. All components declare their own imports.

### Role-based routing

Three user roles (Viewer, Producer, Admin) each have separate lazy-loaded route trees and layout shells:

| Role | Root path | Layout | Guard |
|------|-----------|--------|-------|
| Viewer | `/browse`, `/movie/:id`, `/profile`, `/my-list` | Core `header`/`footer` | `authGuard` + `viewerGuard` |
| Producer | `/producer/*` | `ProducerLayoutComponent` | `producerGuard` (role = Producer) |
| Admin | `/admin/*` | `AdminLayoutComponent` | `adminGuard` (is_staff = true) |

Guest routes (`/login`, `/register`, `/forgot-password`) use `guestGuard` which redirects already-authenticated users to their role's home.

### Auth flow

`core/services/auth.service.ts` manages all JWT state via Angular Signals:
- Tokens stored in `localStorage` as `ikigembe_token` / `ikigembe_refresh`
- `auth.interceptor.ts` injects Bearer tokens and auto-refreshes on 401, queuing concurrent requests during refresh
- Key signals: `isLoggedIn`, `isAdmin`, `userRole`, `accountStatus`

### Feature modules

- **`src/app/core/`** — Auth service, interceptor, route guards, shared header/banner/footer components
- **`src/app/shared/`** — Reusable UI components (`VideoPlayer`, `MovieCarousel`, `PaymentModal`, `AuthModal`, `DatePicker`), pipes, mock data
- **`src/app/pages/`** — Public/viewer pages, each lazy-loaded via `loadComponent`
- **`src/app/admin/`** — Admin dashboard with sub-routes: users, producers, movies, withdrawals, reports (chart.js)
- **`src/app/producer/`** — Producer dashboard: onboarding, upload (S3 presigned URLs), wallet, withdrawals, reports

### Key services

| Service | Location | Responsibility |
|---------|----------|---------------|
| `AuthService` | `core/services/auth.service.ts` | JWT lifecycle, user state signals |
| `MovieService` | `core/services/movie.service.ts` | Movie catalog API (`/api/movies/discover/`, detail, streaming) |
| `PaymentService` | `core/services/payment.service.ts` | Payment initiation, status polling, purchase history |
| `AdminService` | `admin/services/admin.service.ts` | Admin CRUD for users, producers, movies, withdrawals, reports |
| `ProducerService` | `producer/services/producer.service.ts` | Wallet, S3 upload URLs, producer withdrawals, notifications |

### Environment & API

Backend: `https://ikigembe-backend.onrender.com/api` (same URL for dev and prod by default).

Override in production via Vite env vars `NG_APP_API_URL` / `NG_APP_BACKEND_URL` (see `src/environments/environment.prod.ts`).

Movie files are uploaded directly to S3 via presigned URLs from `ProducerService.getPresignedUploadUrl()`.

### SSR

`@angular/ssr` is configured. Any browser-only API access (localStorage, window) must be guarded with `isPlatformBrowser()`.

### State management

No NgRx. Reactive state is handled with Angular Signals and RxJS. Shared signal state lives in `AuthService`.
