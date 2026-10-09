# End-to-end tests (Playwright)

These tests drive the real app in Chromium against the real Django API. They cover the highest-risk
journeys:

| Spec | Journey |
|---|---|
| `access.spec.ts` | Signed-out redirect. A viewer is kept out of the admin and producer areas, and the API refuses them too. |
| `film-purchase.spec.ts` | A coming-soon film can't be bought: no button, and the API returns 409. A viewer buys a released film with demo Mobile Money, playback is authorised, and the receipt appears in payment history. |
| `producer-setup.spec.ts` | Viewer → producer with no admin approval. The profile can't be skipped. Upload stays closed until the agreement is signed: review, signature, name check, consent. Then upload opens. |
| `casting-call.spec.ts` | A producer writes and pays for a casting call. It stays *In review* and hidden from viewers until an admin approves it. Then it is published. |
| `refund.spec.ts` | An admin refunds a demo purchase, and a reason is required. The refund completes and the buyer sees *Refunded*. |

## Running

You need:
- Node 20 or later and the frontend's dependencies (`npm ci`);
- the Chromium build Playwright uses, installed once with `npx playwright install chromium`;
- the backend repo next to this one (`../ikigembe_backend`), or set `IKIGEMBE_BACKEND_DIR`. Its virtualenv (`.venv`) must have
  `requirements.txt` installed.

```bash
npm run e2e                                  # whole suite (about 4 minutes)
npx playwright test e2e/refund.spec.ts       # one file
npx playwright test --headed                 # watch it run
npm run e2e:report                           # HTML report from the last CI run
```

## What the suite starts

Playwright starts its own stack and stops it afterwards. The dev servers on 4200 and 8000 can keep running.

- **API on `127.0.0.1:8001`:** `e2e/support/start-backend.mjs` sets up a fresh database each run:
  1. deletes `e2e.sqlite3` in the backend folder;
  2. runs `migrate` and `createcachetable`;
  3. runs `seed_e2e` (accounts, films, fees and one refundable purchase);
  4. starts `runserver`.
- **App on `localhost:4300`:** `ng serve` with `e2e/proxy.e2e.json`, which proxies `/api` to 8001.

## Safety

The test API can't reach anything real:

- **Payments:** `PAYMENT_DEMO_MODE=True` and the PawaPay and DPO credentials are blanked, so no money moves. Demo
  Mobile Money settles after 1 second.
- **Storage:** the R2 credentials are fake. Presigning happens locally. Media URLs point at a closed port or at
  `e2e-media.invalid`, which never resolves, and the browser aborts those requests. Private uploads, such as
  contract signatures, go to `ikigembe_backend/e2e-media/` (`E2E_LOCAL_STORAGE=1`, refused without `DEBUG`).
- **Email:** Django's in-memory backend; nothing is sent.
- **Database:** `seed_e2e` refuses to run unless the database is SQLite and `E2E_SEED_ALLOWED=1` is set.

## Not covered here

These need real infrastructure:
- a real video upload and transcode (R2 and ffmpeg);
- real HLS playback and encryption;
- live PawaPay or DPO callbacks;
- email delivery.

See `docs/staging-test-guide.md` and the backend's `docs/operations.md`.

## Seeded accounts

All accounts use the password `E2e-Passw0rd!`. See `e2e/support/session.ts`:

| Key | Email | Account |
|---|---|---|
| admin | `e2e-admin@ikigembe.test` | Staff admin |
| viewer | `e2e-viewer@ikigembe.test` | Viewer |
| refund | `e2e-refund@ikigembe.test` | Viewer who owns *E2E Refund Film* |
| producer | `e2e-producer@ikigembe.test` | Producer, profile complete and agreement signed |
| maker | `e2e-maker@ikigembe.test` | Verified viewer who becomes a producer during the suite |
