# legroomcompany.com

The Legroom marketing site. One page, statically rendered, deployed to Cloudflare Workers with a single Worker route for the lead form.

This is a **port of an approved design**, not a design. The source of truth is `../handoff/`: eight self-contained HTML files that are the real running design, plus `tokens.css` and the brand assets. Before changing anything visual, open those files and look at them.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # optional; everything has a working default
npm run dev                    # http://localhost:4321
```

```bash
npm run build                  # static output to ./dist
npm run preview                # serve ./dist
npm run check                  # astro check: types + templates
npm run typecheck              # tsc on src and worker
npm test                       # Playwright: 51 visual, behaviour, a11y and analytics tests
npm run test:pixels            # diff every section against the handoff PNGs
npm run test:design            # diff every section against the reference HTML
npm run lh && npm run lh:report # Lighthouse CI, desktop
npm run lh:mobile              # Lighthouse CI, mobile
npm run assets                 # regenerate AVIF/WebP, OG card, favicons
```

Tests run against the **production build**, never the dev server. A pass on `astro dev` proves nothing about what ships.

---

## Installed versions

Every one came from `npm view <pkg> version` at build time, not from memory.

| Package | Version | Note |
| --- | --- | --- |
| astro | 7.3.2 | The brief said "latest stable 5.x". Latest stable is **7.3.2**. The brief's own rule, verify then use latest, takes precedence. |
| tailwindcss | 4.3.3 | via `@tailwindcss/vite` 4.3.3 |
| typescript | 6.0.3 | **Not 7.0.2.** `@astrojs/check` declares `typescript@^5 \|\| ^6`; TS 7 makes `astro check` uninstallable, so template type-checking would have been lost. 6.0.3 is the newest version the toolchain supports. |
| @astrojs/check | 0.9.10 | |
| @playwright/test | 1.63.0 | |
| @axe-core/playwright | 4.13.0 | |
| @lhci/cli | 0.15.1 | |
| wrangler | 4.131.0 | |
| @cloudflare/workers-types | 5.20260911.1 | |
| sharp | 0.35.4 | build-time only, for `npm run assets` |
| pixelmatch / pngjs | 7.2.0 / 7.0.0 | visual regression only |

No UI framework. No React. The three interactive pieces are vanilla TypeScript and total **3.2 KB gzipped**.

---

## How it is put together

```
src/
  content/site.ts        every user-facing string, typed. No copy in components.
  config/                (none: site.ts holds it)
  styles/tokens.css      the design contract, copied from handoff/ then extended
  styles/global.css      @font-face, the @theme bridge to Tailwind, focus, motion
  layouts/Base.astro     head, metadata, JSON-LD, skip link
  components/            one file per section, in page order
  components/ui/         Button, ArcadeButton, Chip, Highlight, Underline, Arrow, EmailCapture
  scripts/slitscan.ts    one canvas engine, two presets
  scripts/form.ts        progressive enhancement for both forms
  scripts/cal.ts         lazy Cal.com embed
  pages/                 index, contact, thanks, 404, sitemap.xml
worker/index.ts          POST /api/lead; everything else falls through to assets
migrations/              D1 schema
public/                  fonts, brand, logos, photos, _headers, robots.txt, llms.txt
tests/                   visual.spec.ts, a11y.spec.ts, analytics.spec.ts
scripts/                 build-assets, compare-reference, compare-design, lh-summary, dev-csp
```

**`src/content/site.ts` is a hard rule.** Not one string of user-facing copy lives in a component. JD edits copy by editing that one file.

**`src/styles/tokens.css` is a contract.** Every colour, size, spacing value and easing curve is a custom property defined there, and `@theme` hands the same variables to Tailwind so utilities and hand-written CSS cannot drift. A raw hex in a component is a bug.

---

## Things that look wrong and are not

Six of these were called out in the handoff. All six are honoured, and two more were found while building.

1. **The sharpie highlight is an SVG behind the text.** Three overlapping paths, `mix-blend-mode: multiply`, rotated `-0.55deg`. The wrapper carries `z-index: 0` to open a stacking context; without it the `z-index: -1` child paints behind the section background and vanishes completely. Asserted in `tests/visual.spec.ts`.
2. **Buttons travel the full 5px.** Rest on a 5px charcoal base, hover lifts 2px onto a 7px base and the face brightens to `#FFD230`, press travels 5px down onto a 0px base. 90ms. The 2px white strip on the top edge is what makes the yellow read as a physical face. Asserted.
3. **The slitscan pointer is smoothed, not tracked.** Position lerps 0.12 per frame, lens strength 0.06. The lag is the effect. Do not make it follow the cursor.
4. **`timeline-scope: --deck` on the deck grid.** The dots live outside the scrolling rail, so the named timeline has to be scoped on the shared parent or the dots silently never move. Asserted.
5. **Founder photos sit on Manila `#EAE5DA`.** They were composited on that ground so the two headshots read as one set. Not white, no white border. Asserted.
6. **Client logo ghosts are scaled per logo** (168 / 210 / 150 / 160%). The four source files differ in aspect ratio by about 5x. Asserted that all four values are still distinct.
7. **`html { line-height: normal }`.** The design was authored with no CSS reset. Tailwind's preflight sets `1.5`, which grew the spots chip by 2.3px and pushed the whole hero column down with it. Removing this line breaks hero alignment.
8. **The CSS minifier is esbuild, not Lightning CSS.** Lightning CSS folds `animation-timeline: --deck` into the `animation` shorthand, which cannot carry a timeline name. The declaration becomes invalid and the deck dots stop animating: the same failure as a missing `timeline-scope`, reached from a different direction.

Nothing on this page fades in on scroll. There are no scroll-reveal animations, no stagger, no parallax, and a test asserts that none appear.

---

## Deliberate differences from the reference PNGs

Three, all decided rather than drifted into.

| What | Why |
| --- | --- |
| **Nav button** renders `13px 30px` padding with charcoal text | The reference CSS declares exactly that but renders neither, because `.nav a` (specificity 0,1,1) beats `.navbtn` (0,1,0) and overrides padding and colour. The rendered result is an 83x33 button with grey `#6B675E` text. The handoff kit and the brief's motion table both describe the declared version. Confirmed with JD on 2026-09-10: the written spec wins. |
| **Founder photos are AVIF/WebP** with a JPEG fallback | Required by the performance spec. A re-encode differs from the JPEG in every pixel, so the photos are masked in the pixel comparison and asserted separately: they load, they are the right size, they sit on Manila. |
| **Phone tap targets** on footer links and founder social links are 44px | Required by the accessibility gate. Applied only below 768px, so the desktop layout keeps the reference's inline metrics exactly. |

---

## Known contrast findings

The brief says to verify `--ink-3` and `--ink-2` against their real backgrounds and **report** anything under 4.5:1 rather than silently darkening it. Four token pairs fail. They are brand values, so they are reported here and left alone.

| Token | Colour | Ground | Ratio | Used for |
| --- | --- | --- | --- | --- |
| `--ink-3` | `#96917F` | paper `#F4F1EA` | **2.79:1** | eyebrows, micro copy, annotations |
| `--ink-3` | `#96917F` | Manila `#EAE5DA` | **2.51:1** | the same, inside the offer band |
| `--ink-2` | `#6B675E` | Manila `#EAE5DA` | **4.48:1** | body copy in the Breakdown (0.02 short) |
| `--yellow-deep` | `#E9B300` | paper `#F4F1EA` | **1.70:1** | the four Q&A labels: Cost, Time, After, Fit |

`--yellow-deep` on paper is the one worth a decision. 1.7:1 is not a rounding error, and those four labels carry meaning rather than decoration.

If JD wants all four to pass, these are the nearest hue-preserving replacements:

```css
--ink-3:       #6B6758;  /* paper 5.02:1  Manila 4.51:1 */
--ink-2:       #6A675E;  /* paper 5.01:1  Manila 4.50:1 */
--yellow-deep: #896A00;  /* paper 4.51:1 — a visible change, it reads brown */
```

`--yellow-deep` is also the button base colour and the step-number hover, where it sits on yellow and passes comfortably. Changing the token globally would alter those too; scoping the darker value to the Q&A labels alone is the smaller change.

Every other accessibility audit passes. Lighthouse accessibility is 97 on `/` and 94 on `/contact`, and the entire gap is this one audit. Fixing the four pairs takes both pages to 100.

`tests/a11y.spec.ts` asserts the exact set of failing pairs, so a **new** failing pair breaks the build while these four stay reported.

---

## Results

### Visual regression

Two harnesses, because they answer different questions.

`npm run test:pixels` diffs each section against the handoff PNGs, which were captured in a different session:

| Section | Differing pixels |
| --- | --- |
| 01 hero | 0.480% |
| 02 breakdown | 0.389% |
| 03 credibility | 0.182% |
| 04 promise | 0.068% |
| 05 wordmark break | 0.000% |
| 06 CTA + founders | 0.887% |
| 08 mobile | 0.547% |

`npm run test:design` renders the reference HTML in the same browser and captures both sides identically, which removes the capture session as a variable:

| Section | Differing pixels |
| --- | --- |
| 01 hero | 0.455% |
| 02 breakdown | 0.270% |
| 03 credibility | 0.084% |
| 04 promise | 0.019% |
| 05 wordmark break | 0.000% |
| 06 CTA + founders | 0.715% |
| 08 mobile | 0.446% |

Every section is under 0.8% on the identical-capture comparison. Section 06 sits at 0.887% against the PNG because it is the last section on the page and cannot be captured on the same sub-pixel phase its standalone board had. Layout is asserted exactly and separately: a geometry probe compares fractional element positions against the reference and every element in the hero, credibility band and founders section matches to 0.000px.

### Lighthouse

Median of three runs, against the production build.

| | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Desktop `/` | **100** | 97 | **100** | **100** | 385ms | 0.000 | 0ms |
| Desktop `/contact` | **100** | 94 | **100** | **100** | 327ms | 0.001 | 0ms |
| Mobile `/` | **100** | 97 | **100** | **100** | 1363ms | 0.000 | 0ms |

Budgets: LCP < 1500ms, CLS < 0.02, TBT < 100ms, INP proxy (max potential FID) < 120ms. All met.

Total JavaScript shipped: **3.2 KB gzipped**. Page weight 107 KB desktop, 77 KB mobile.

The slitscan loops start on `requestIdleCallback`. Running them from load put 190ms of script evaluation inside the measurement window; starting them on idle takes total blocking time to 0 and costs a few hundred milliseconds of an eight-second ambient wave.

### Tests

51 Playwright tests, all passing: axe at four breakpoints on four pages, the full keyboard path with focus-ring assertions, tap targets, heading order, metadata and JSON-LD, the button press physics, the deck timeline wiring, reduced motion, no-JavaScript form and deck behaviour, horizontal-overflow checks at 1920 / 1440 / 1024 / 768 / 390, and the five dataLayer events with their payloads.

---

## Environment variables

Build-time and public. They are compiled into the HTML, which is correct for both.

| Variable | Default | Effect |
| --- | --- | --- |
| `PUBLIC_CAL_LINK` | empty | Cal.com slug or URL. Empty means every "Book" CTA falls back to `/contact`, which still works. |
| `PUBLIC_TURNSTILE_SITE_KEY` | empty | Empty means the widget is never loaded and the Worker applies its no-token controls. |

**Secrets never live in this repo.** `TURNSTILE_SECRET_KEY` and `RESEND_API_KEY` go in with `wrangler secret put`. See `LAUNCH.md` section 2.

---

## The backend

One Worker in front of the static assets. Only `POST /api/lead` is handled; everything else falls through to `env.ASSETS`. A broken integration cannot take the page down.

Order of operations on a submission:

1. Parse JSON (enhanced path) or form-encoded (no-JavaScript path).
2. Honeypot: a filled `company` field gets a cheerful 200 and goes nowhere.
3. Fill time: under 1.2 seconds is not a human typing.
4. Turnstile, **fail closed**: a token that does not verify, or a verify call that errors, is a rejection.
5. Rate limit by hashed IP in KV. Five per hour with a token, two without.
6. Insert into D1.
7. Notify JD and confirm to the submitter through Resend, in `waitUntil`.
8. JSON for the enhanced path, `303` to `/thanks` for the no-JavaScript path.

**The lead is written to D1 before either email is attempted**, so a Resend failure is a logged warning, not a lost lead and not a 500. Resend's free tier is 3,000 a month and 100 a day; the daily cap is the one that bites.

### On "fail closed" and "must work without JavaScript"

Turnstile needs JavaScript to mint a token, so a strictly token-required endpoint cannot also accept no-JavaScript submissions. The reading here: **verification** fails closed (a present token that does not verify is rejected, and an errored verify call is rejected), while an **absent** token is treated as the no-JavaScript path and allowed through on a tighter rate limit plus the honeypot and fill-time checks. If JD would rather reject token-less submissions outright, delete the `hasToken` branch in `worker/index.ts`; the no-JavaScript path then reaches `/contact` with an error and the email address is still on the page.

Nothing logs a full submission. IPs are SHA-256 hashed before they reach the rate-limit store.

---

## Making a change

1. Copy edits go in `src/content/site.ts`. Nowhere else.
2. Colour, type and spacing go in `src/styles/tokens.css`. Nowhere else.
3. `npm run check && npm test` before committing.
4. `npm run test:design` if you touched anything visual.
5. `npm run lh` if you touched anything that ships bytes.

## Deployment

`LAUNCH.md` is the runbook. Short version:

```bash
npm run build
npx wrangler deploy
```

Cloudflare Workers static assets, configured in `wrangler.jsonc`. `public/_headers` carries the security headers and cache policy and is applied to asset responses; Worker responses set their own headers in code.

The CSP is strict: `script-src` is `'self'` plus Turnstile and Cal.com, with **no `'unsafe-inline'`**, because the site has no inline scripts. Verified with `npm run check:csp` against `wrangler dev`, which loads every page, focuses a form so Turnstile loads, warms the Cal embed, and reports any blocked request. Adding Google Tag Manager will require loosening this; see LAUNCH.md section 8d.
