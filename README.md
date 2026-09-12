# legroomcompany.com

The Legroom marketing site. One page, statically rendered, deployed to Cloudflare Workers with a single Worker route for the lead form.

This is a **port of an approved design**, not a design. The source of truth is `../handoff/`: eight self-contained HTML files that are the real running design, plus `tokens.css` and the brand assets. Before changing anything visual, open those files and look at them.

---

## Quick start

```bash
npm install
npm run dev                    # http://localhost:4321
```

Nothing has to be configured to get the page on screen. Every environment
variable has a working default and the page renders without any of them. What
you lose without them is the booking link and the bot check, both covered
below.

To work on anything that will be verified, build first:

```bash
npm run build && npm run serve       # then the gates below run against :4321
```

**Every gate runs against the production build, never the dev server.** A pass
on `astro dev` proves nothing about what ships: the CSS minifier, the CSP and
the hashed asset names all only exist after a build, and all three have broken
this site at least once.

### Every script

| Script | What it does | Watch out |
| --- | --- | --- |
| `npm run test` | The full Playwright suite, 75 tests. | Visual behaviour, a11y, copy, analytics, booking. |
| `npm run dev` | Astro dev server on :4321. | Fast, but nothing is verified against it. See the note below. |
| `npm run build` | Static build to `./dist`. | What every gate and every deploy actually runs against. |
| `npm run preview` | Astro's own preview server on :4321. | Backgrounds itself off a TTY and takes a lock. Fine by hand, unusable from a script. Use `serve`. |
| `npm run serve` | Foreground static server for `./dist`. | What Playwright and the comparators run against, in CI and locally. See `scripts/serve-dist.mjs`. |
| `npm run check` | `astro check`: types plus template and prop checking. |  |
| `npm run typecheck` | `tsc --noEmit` over `src/` and `worker/`, two configs. |  |
| `npm run test:visual` | Just `tests/visual.spec.ts`. |  |
| `npm run test:a11y` | Just `tests/a11y.spec.ts`. |  |
| `npm run lh` | Lighthouse CI, desktop, three runs, asserts against `lighthouserc.json`. |  |
| `npm run assets` | Regenerate AVIF/WebP founder photos, the OG card and the favicons. | Build-time only, needs `sharp`. Commit the output. |
| `npm run deploy` | Build, then `wrangler deploy`. | Manual escape hatch. Normal deploys go through git; see Deployment. |
| `npm run cf:dev` | Build, then `wrangler dev`: the Worker plus the built site. | Defaults to :8787. `check:csp` expects :8788, so pass `--port 8788`. |
| `npm run db:migrate` | Apply D1 migrations against the **remote** database. | Not local. See LAUNCH.md. |
| `npm run test:pixels` | Diff every section against the handoff PNGs. | Gates at 0.8% differing pixels, with written per-section allowances. Exits non-zero. |
| `npm run test:design` | Diff every section against the reference HTML, rendered in the same browser. | Removes the capture session as a variable. Reports, does not gate. |
| `npm run lh:mobile` | Same, mobile form factor. |  |
| `npm run lh:report` | Print the medians from the last `lh` and `lh:mobile` runs. |  |
| `npm run check:csp` | Load every page behind the real `_headers` CSP and report any violation. | Needs `npm run cf:dev` running in another shell first. |
| `npm run emails` | Render both transactional emails to disk exactly as they will send. |  |

### The full local gate, in order

This is exactly what CI runs. If all of it is green, a push will be too.

```bash
npm run typecheck && npm run check && npm run build && npm test && npm run test:pixels
npm run lh && npm run lh:mobile && npm run lh:report
```

`npm test` and `npm run lh` start and stop their own servers. `test:pixels`
and `test:design` do not, so they need `npm run serve` already running.

`check:csp` is the one gate that is not in that chain, because it needs a
second shell and real Cloudflare credentials:

```bash
npx wrangler dev --port 8788      # shell one
npm run check:csp                 # shell two
```

---

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

Node **24**, npm **11.19.1**. The version is pinned in three places that have to agree: `engines` in `package.json`, `.nvmrc`, and `node-version` in `.github/workflows/ci.yml`. Cloudflare Workers Builds reads `.nvmrc`, which is the only reason that file exists.

No UI framework. No React. The interactive pieces are vanilla TypeScript and total **4.9 KB gzipped**.

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
  components/StickyRail.astro  the bottom bar, four stations on one CSS-only line
  scripts/slitscan.ts    the wordmark band's wave
  scripts/measure-rule.ts  the hero band: a ruler that stretches under the pointer
  scripts/pointer-tilt.ts  pointer-tracked side depth on the buttons
  content/emails.ts      both transactional email bodies
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
3. **Both canvas engines smooth the pointer rather than track it.** Position lerps 0.12 per frame, strength 0.06. The lag is the effect. Do not make either follow the cursor. In the slitscan every slit is also clamped inside the band, which is what stops the wave clipping flat against an edge when the pointer pushes it.
4. **Neither engine reads the canvas rect inside its scroll handler.** It marks the cache dirty and recomputes on the next pointer move. Reading it on scroll is a sync layout read on every scroll frame, and worse, it lands before the scroll has settled: the cache ends up holding a position the canvas was only passing through, the band test in `onMove` then fails against a stale top, and the effect silently stops answering the pointer with nothing on screen to say why.
5. **The measure stretches, it does not shove.** Each graduation is displaced by an odd function that is zero at the cursor and decays outward. What you see is not the displacement, it is the SLOPE: where the slope is positive, neighbouring graduations move apart, and that widening is the whole effect. Pushing them away by a bell curve instead leaves whichever graduation is nearest the cursor stranded alone in the middle of the gap it just opened.
6. **`timeline-scope: --deck` on the deck grid.** The dots live outside the scrolling rail, so the named timeline has to be scoped on the shared parent or the dots silently never move. Asserted.
7. **Founder photos sit on Manila `#EAE5DA`.** They were composited on that ground so the two headshots read as one set. Not white, no white border. Asserted.
8. **Client logo ghosts are scaled per logo** (168 / 210 / 150 / 160%). The four source files differ in aspect ratio by about 5x. Asserted that all four values are still distinct.
9. **`html { line-height: normal }`.** The design was authored with no CSS reset. Tailwind's preflight sets `1.5`, which grew the spots chip by 2.3px and pushed the whole hero column down with it. Removing this line breaks hero alignment.
10. **The CSS minifier is esbuild, not Lightning CSS.** Lightning CSS folds `animation-timeline: --deck` into the `animation` shorthand, which cannot carry a timeline name. The declaration becomes invalid and the deck dots stop animating: the same failure as a missing `timeline-scope`, reached from a different direction. A test now asserts the sticky rail's seven keyframe sets survive into the built CSS, because it is the same shape of bug waiting to happen.
11. **The rail's reduced-motion block repeats the per-station class selectors.** `.station.s1` is specificity (0,2,0) and a bare `.station` is (0,1,0), so `@media (prefers-reduced-motion) { .station { animation: none } }` loses and the line keeps running for exactly the people who asked it not to. The reference ticker has that bug. This does not.
12. **The rail's classes are `.railbar` / `.station` / `.stationdot`, never `.rail` / `.stop` / `.dot`.** All three of those already mean something else: `.rail` is the founder scroll deck, which the tests and `compare-design.mjs` both query from the document root, and `.dot` is the pinging yellow spots-open pip in `tokens.css`. Astro's scoping is not a namespace. It raises specificity on the properties a component declares, so an overridden `background` wins, but a global `box-shadow` and a global `::after` come through untouched, which is exactly how every station briefly ended up wearing a yellow halo on a 1.9s clock. Asserted.
13. **`--tx` defaults to 0 in CSS, and pointer-tilt only ever sets it on fine pointers.** That default is the whole touch and no-JavaScript story for the button depth: the straight-on shadow is the floor, not a broken state.

Nothing on this page fades in on scroll. There are no scroll-reveal animations, no stagger, no parallax, and a test asserts that none appear.

---

## Deliberate differences from the reference PNGs

Three, all decided rather than drifted into.

| What | Why |
| --- | --- |
| **Nav button** renders `13px 30px` padding with charcoal text | The reference CSS declares exactly that but renders neither, because `.nav a` (specificity 0,1,1) beats `.navbtn` (0,1,0) and overrides padding and colour. The rendered result is an 83x33 button with grey `#6B675E` text. The handoff kit and the brief's motion table both describe the declared version. Confirmed with JD on 2026-09-10: the written spec wins. |
| **Founder photos are AVIF/WebP** with a JPEG fallback | Required by the performance spec. A re-encode differs from the JPEG in every pixel, so the photos are masked in the pixel comparison and asserted separately: they load, they are the right size, they sit on Manila. |
| **Phone tap targets** on footer links, founder social links and the "Currently building" links are 44px | Required by the accessibility gate. Applied only below 768px, so the desktop layout keeps the reference's inline metrics exactly. |
| **The subway line actually stops under reduced motion** | The changelog says it should show all four lit and static. The reference CSS says so too, but a specificity mistake means it keeps animating. Fixed here, and it costs no fidelity: the baseline PNGs are captured without the preference set, so this state appears in no comparison. |
| **R4: the hero band is a measure, not a second slitscan** | Requested on 2026-09-11. Two slitscan bands said the same thing twice, and the one under the hero carries the first interaction anyone has with the site. It is now a ruler that stretches under the pointer and dimensions the space it opens, in the same drafting language as the measured drawing above it. Both bands are masked in the comparison, so the swap costs no fidelity. |
| **R4: the sticky rail's unlit stations sit below AA** | ~3.1:1, `--ink-3` on the bar's white, and the only contrast finding on the page that is ours rather than the reference's. Held at `--ink-2` in R3 to clear AA, but at that weight lit and unlit read as the same thing and the sequence, which is the only reason the bar exists, did not come across. The four phrases restate an argument the page already makes in full, every station reaches `--ink` within one 8s cycle, and reduced motion shows all four permanently lit. Audited in `tests/a11y.spec.ts` by element, not by colour pair: the bar is translucent, so the composited background changes with whatever is scrolled under it. |
| **R3: the ticker is a bottom bar, not a row above the wordmark** | Requested on 2026-09-11. Same four beats, rewritten, running as one line that travels between them rather than four labels blinking in place. The bar is `position: fixed`, so both comparators hide it before capture: it belongs to no section and would otherwise land inside every clip. |
| **R3: three frames carry a written pixel allowance** | The boards are the approved design and they hold R2 copy. R3 replaced the copy in breakdown, CTA + founders and mobile, so those three differ from their board by glyphs. Re-shooting the boards would destroy the only independent record of what was approved, so each carries an allowance sized just above its measured diff, with the reason and the previous number printed in the table. Geometry is not relaxed: Δh and alignment still report straight. |
| **Cal.com's bootstrap stub is theirs, verbatim** | The round 1 stub was a simplification, and their embed script threw partway through init on it. The plain href still navigated, so it looked fine while the modal silently never opened. |

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
--yellow-deep: #896A00;  /* paper 4.51:1, a visible change, it reads brown */
```

`--yellow-deep` is also the button base colour and the step-number hover, where it sits on yellow and passes comfortably. Changing the token globally would alter those too; scoping the darker value to the Q&A labels alone is the smaller change.

Every other accessibility audit passes. Lighthouse accessibility is 97 on `/` and 94 on `/contact`, and the entire gap is this one audit. Fixing the four pairs takes both pages to 100.

`tests/a11y.spec.ts` asserts the exact set of failing pairs, so a **new** failing pair breaks the build while these four stay reported.

---

## Results

### Visual regression

Two harnesses, because they answer different questions.

`npm run test:pixels` diffs each section against the handoff PNGs, which were captured in a different session:

| Section | R2 | R3 | Allowance |
| --- | --- | --- | --- |
| 01 hero | 0.498% | 0.564% | 0.8% |
| 02 breakdown | 0.397% | 0.825% | 1.1% |
| 03 credibility | 0.168% | 0.393% | 0.8% |
| 04 promise | 0.015% | 0.015% | 0.8% |
| 05 wordmark break | 0.000% | 0.000% | 0.8% |
| 06 CTA + founders | 0.411% | 4.873% | 5.2% |
| 08 mobile | 0.563% | 10.759% | 11.5% |

`npm run test:design` renders the reference HTML in the same browser and captures both sides identically, which removes the capture session as a variable:

| Section | R2 | R3 |
| --- | --- | --- |
| 01 hero | 0.468% | 0.539% |
| 02 breakdown | 0.277% | 0.678% |
| 03 credibility | 0.062% | 0.281% |
| 04 promise | 0.006% | 0.006% |
| 05 wordmark break | 0.000% | 0.000% |
| 06 CTA + founders | 0.370% | 4.768% |
| 08 mobile | 0.452% | 10.668% |

Every number in the R3/R4 columns is copy, not layout. The boards hold R2 words and those rounds replaced them, so the three frames that grew carry the written allowances above. Geometry is unchanged and is asserted directly as well: hero 860, breakdown 1055, credibility 669, promise 828, wordmark break 387, and the CTA section measured through the footer at 1043, each to within 1px.

Two of those are worth naming. Credibility held 669 through R4 only because `.cg` carries an explicit `min-height`: cutting a clause off the body copy took two lines out of the left column and collapsed the whole band by 55px. The frame is the approved one, so it is pinned rather than left to whatever the longest column happens to be. And wordmark break reads 0.000% on both harnesses because its canvas covers the whole section and is masked, so the swipe realignment underneath it is asserted in tests, not in pixels. The hero band is masked for the same reason, which is what let R4 swap one engine for another without moving the number.

### Lighthouse

Median of three runs, against the production build.

| | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Desktop `/` | **100** | 97 | **100** | **100** | 386ms | 0.000 | 0ms |
| Desktop `/contact` | **100** | 94 | **100** | **100** | 327ms | 0.001 | 0ms |
| Mobile `/` | **100** | 97 | **100** | **100** | 1361ms | 0.000 | 0ms |

Budgets: LCP < 1500ms, CLS < 0.02, TBT < 100ms, INP proxy (max potential FID) < 120ms. All met.

Total JavaScript shipped: **4.9 KB gzipped**. Page weight 87 KB desktop, 72 KB mobile.

Both canvas loops start on `requestIdleCallback`. Running them from load put 190ms of script evaluation inside the measurement window; starting them on idle takes total blocking time to 0 and costs a few hundred milliseconds of ambient texture nobody is waiting for.

### Tests

75 Playwright tests, all passing: axe at four breakpoints on four pages, the full keyboard path with focus-ring assertions, tap targets, heading order, metadata and JSON-LD, the button press physics, the deck timeline wiring, reduced motion, no-JavaScript form and deck behaviour, horizontal-overflow checks at 1920 / 1440 / 1024 / 768 / 390, the five dataLayer events with their payloads, the sticky rail's seven keyframe sets surviving minification and its stations lighting in sequence, the hero measure drawing without a pointer and opening and dimensioning space with one, the pointer-tilt lerp and its touch fallback, every booking CTA resolving to cal.com, the sticky rail staying out of the page's hit tests, and a zero-tolerance em dash scan over the source, the rendered pages and the email bodies.

---

## The writing rule

**No em dashes. Anywhere.** Not in `site.ts`, not in a template, not in an email body, not in a comment, not in this file. Use a comma, a period or a colon.

`tests/copy.spec.ts` fails the build if one appears, scanning the source files, the rendered pages and the email bodies. It also scans for the other tells: seamless, robust, leverage, unlock, elevate, and the rest. En dashes are allowed in numeric ranges, which is what "2-4 weeks" uses and is correct typography rather than a tell.

This is mechanical on purpose. A rule that depends on somebody remembering it drifts back in.

## Environment variables

Build-time and public. They are compiled into the HTML, which is correct for both.

| Variable | Default | Effect |
| --- | --- | --- |
| `PUBLIC_CAL_LINK` | empty | Cal.com slug or URL. Currently `https://cal.com/jdworcester/15min`, in `.env` locally. **It must also be set in the Cloudflare dashboard as a build variable**, because `.env` is not committed. A test fails the build if a booking CTA falls back to `/contact`. |
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
