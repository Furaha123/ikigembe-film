# Staging test guide

A manual pass to run before sign-off. Use a staging deploy with the following settings:

- `PAYMENT_DEMO_MODE=True` (no money moves; DPO's page is replaced by `/payment/demo-checkout`)
- `ENFORCE_SINGLE_DEVICE_VIEW=True`
- a verified email domain, or read the emails from the `EmailOutbox` rows in Django admin

You need four accounts: one admin, one producer, and two viewers (A and B). Use two browsers or
profiles so you have two devices.

## 1. Accounts and security

1. Register viewer A. You land on `/browse` as a Viewer. There is no producer sign-up page.
2. Sign in with a wrong password 5 times. The account locks for 15 minutes, with a clear message.
3. Change the password. You stay signed in. Other tabs and devices are signed out.
4. Sign in as A in a second browser. The first browser's session ends at its next request.

## 2. Producer setup (no admin approval)

1. On viewer B's profile, click "Become a Producer". B lands on the producer profile form; there is no way to
   skip it, and an empty form is refused.
2. After saving the profile, B is taken to the distribution agreement. Before signing, the dashboard banner
   explains what is missing, and upload, casting, actor search and service purchases are refused.
3. B signs the agreement. Upload and producer services appear without reloading the page.
4. As admin, open `/admin/producers`: B shows *Ready*; a producer that hasn't finished shows *Setup incomplete*
   with the missing step. There is no approve or reject action, only suspend and reactivate.

## 3. Films, price, release

1. As producer B, upload a film (MP4/MOV). Transcoding moves from queued to processing to succeeded
   (`/admin/transcodes`). The price shows Frw 1,000; B cannot edit it.
2. As admin, approve the film with a release time 20 minutes ahead. The film shows as *Coming soon*. Buying
   works, but playing is refused with "not released", and no view is used.
3. After the release time, `publish-releases` lists the film and buyers are notified.
4. As admin, change the price of one film. Old purchases keep the amount they paid.

## 4. Purchase and playback (one view, one device)

1. Viewer A buys the film (demo checkout). A receipt appears in the profile payment history, and an email is sent.
2. Play the film in browser 1. Play it in browser 2 with the same account: refused with "watching on another
   device".
3. Pause, reload, resume in browser 1 within the window: playback continues.
4. Watch past 90 % (or shorten the window in `/admin/platform-settings`). The view is used: *Buy again* appears
   and `has_purchased` is false.
5. Opening the film page never uses a view, and neither does a refused stream.
6. With `HLS_ENCRYPTION=True`, re-transcode a film and play it:
   - the variant playlist contains `#EXT-X-KEY` pointing to `/hls-key`;
   - the segments downloaded on their own don't play;
   - the stream response has no `fallback_url`.
7. With `PLAYBACK_WATERMARK=True`, a faint `IKG-XXXXXXXX` code moves around the video. In
   `GET /api/admin/dashboard/watermark-lookup/?movie_id=&code=`, admin finds viewer A. The lookup is
   audit-logged.

## 5. Marketplace

1. Viewer A creates an actor profile with a date of birth. The talent video fee is Frw 5,000 under 30 and
   Frw 10,000 at 30 or over.
2. Pay, then upload:
   - a 6-minute file fails the check, and A can retry for free on the same slot;
   - an MP4 under 5 minutes goes processing → pending review.
3. Admin approves the video in `/admin/marketplace`, and A appears in the directory.
4. Producer B buys actor search (Frw 20,000 / 30 days) and opens A's profile, which shows contact details.
5. B posts a casting call:
   - after paying the Frw 20,000 fee, its status is *pending review* (not published);
   - admin rejects it with a reason, B edits and re-sends without paying again;
   - admin approves it, and it is published.
6. Set a casting deadline in the past (or wait for it). `marketplace-jobs` closes the call and applications stop.

## 6. Admin operations

1. In `/admin/payments`, the ledger filters work, the CSV export opens in a spreadsheet, and no cell starts
   with `=`.
2. Request a refund on a demo payment:
   - the status moves to completed;
   - the buyer's entitlement is removed;
   - a negative ledger entry is booked.
3. `/admin/audit-log` shows every action above. Entries can't be edited.
4. `/admin/finance`:
   - open last month: closing is refused until the tax rate is set in platform settings;
   - set the rate, preview, and close: the totals add up and producer statements appear;
   - record a payout reference.
5. `/admin/reports/monthly`: generate last month and download the PDF and CSV. Numbers match the finance
   period and the payments ledger.
6. Producer: `/producer/statements` shows only the producer's own statements. Asking to unpublish or change
   a published film creates a request in `/admin/film-requests`.

## 7. Public site, reports, languages

1. `/`, `/films` (genre, search and sort filters stay in the URL), a film page with credits, related films
   and share, `/refund-policy`, and `/sitemap.xml` (no account or admin URLs).
2. `curl -A "Googlebot" https://<staging>/movie/<id>` returns a small HTML page with the film's title, OG
   tags and JSON-LD. A normal browser gets the app.
3. Click *Report* on a film while signed out: you are asked to sign in. Signed in, send a report:
   - a second report shows "already reported";
   - the admin gets one email, and the report appears in `/admin/abuse-reports`;
   - "action taken" needs a note, and the film is not hidden automatically.
4. Switch to Kinyarwanda in the header. The viewer flows (sign-in, film page, payment, profile) are
   translated; untranslated screens fall back to English, never raw keys.
5. On a phone (or at 375 px wide), check the pages above for horizontal scrolling. Go through the payment
   modal and the report dialog with the keyboard only.

## 8. Jobs

Run each job by hand twice in a staging shell. The second run must change nothing.

```bash
python manage.py reconcile_payments
python manage.py publish_releases
python manage.py marketplace_jobs
python manage.py send_outbox
```
