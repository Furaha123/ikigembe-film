# Kinyarwanda review

Run `npm run i18n:check` to verify translations. It:

- fails when `en.json` and `rw.json` have different keys;
- fails when code uses a static key that is not in `en.json`;
- lists the `rw.json` values that are still identical to the English text (`--list` prints every key).

English is the fallback language (`provideTranslateService({ fallbackLang: 'en' })`). A key with no
Kinyarwanda translation shows English, never the raw key.

## Translated in this release: needs native review

These viewer flows were translated with machine assistance, so wording and tone must be checked by a native
speaker before launch:

| Area | Keys |
|---|---|
| Sign-in, register, password reset | `auth.*` |
| Header, footer, navigation | `header.*`, `footer.*`, `nav.*` |
| Home, browse, films catalogue, carousel, banner | `home.*`, `browse.*`, `films.*`, `carousel.*`, `banner.*` |
| Film page, preview, player | `movieDetailPage.*`, `movieDetail.*`, `preview.*`, `viewer.*`, `playerUi.*`, `player.*` |
| Payment modal, payment return, receipts | `paymentModal.*`, `paymentReturn.*`, `payments.*` |
| Profile, My List, status banner | `profile.*`, `myList.*`, `statusBanner.*` |
| Refund policy (needs legal review as well) | `refundPolicy.*` |
| Report, share, upload errors, date picker, not found | `abuse.*`, `share.*`, `uploadErrors.*`, `datePicker.*`, `notFound.*` |

Kept in English on purpose:

- brand and payment names: Ikigembe, MTN, Airtel, MoMo, PawaPay, DPO, Google, RWF;
- "Cookies";
- "Producer";
- the sample names "John" / "Doe".

## Still English: pending translation

The tool reports about 1,700 keys. Most are in screens for staff and producers:

- `admin.*`: the admin dashboard. Staff can work in English, so this is the lowest priority.
- `producerUi.*`, `contracts.*`: the producer dashboard and agreement flow. Translate the agreement only
  through `ContractService` (legal text comes from the API, not the frontend).
- `marketplace.*`: actor and casting flows. **These are viewer-facing: translate them next.**
- `terms.*`: the built-in fallback for `/terms`. It is legal text, so publish a reviewed `terms-rw` CMS page
  instead of machine-translating it.
- `demoCheckout.*`: staging only.

## Rules for new keys

- Add every key to both files. If no translation is ready yet, put the English text in `rw.json`; the check
  reports it as pending.
- Keep `{{placeholders}}`, HTML, brand names and amounts exactly as they are.
- Build keys dynamically (`'a.b.' + status`) only for closed sets, and keep every member of the set in both
  files. The checker can't see dynamic keys.
