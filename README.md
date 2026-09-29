# IkigembeFilm

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.2.11.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

Headless, single run (CI): `npx ng test --watch=false --browsers=ChromeHeadless`

## Operator notes

These matter when running the app against the `ikigembe_backend` API:

- **Private media & CORS.** Films play only through `GET /api/movies/<id>/stream/` (short-lived signed URLs). The backend must allow the `X-Device-Id` request header, and the R2 bucket's CORS must allow `GET` from the site origin (HLS segments and `.vtt` subtitles).
- **Single-device pay-per-view** (`ENFORCE_SINGLE_DEVICE_VIEW` on the backend) needs no frontend release to switch on: the app always sends a per-browser device ID (stored as `ikigembe_device_id`) and handles the "view used" / "another device" responses.
- **Marketplace fees.** Until fees are configured on the backend, marketplace purchases show "This service isn't available yet" (HTTP 503).
- **CMS pages.** `/terms`, `/about`, `/privacy` and `/contact` come from the backend CMS (Admin → Pages & Ads). Publish a Kinyarwanda version as `<slug>-rw` (e.g. `terms-rw`). If `terms` is not published, the built-in terms text is shown.
- **Ads.** Campaigns are managed in Admin → Pages & Ads. Placements: `home_hero`, `home_banner`, `browse_inline` (home page), `movie_detail`, `sidebar` (movie page).
- **SSR is not enabled in the build.** `ng build` outputs a client-only app (Vercel serves `dist/ikigembe-film/browser`), so CMS pages are not server-rendered for search engines. Enabling prerendering (`outputMode: "static"` plus `server`/`ssr` in `angular.json`) would fix that. Content would then be fixed at build time, so CMS edits would need a redeploy.
- **Translations.** Many newer strings still have English text in `src/assets/i18n/rw.json` and need a Kinyarwanda translation.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
