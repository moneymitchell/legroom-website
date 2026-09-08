# legroomcompany.com

Coming-soon page for Legroom. One screen, one HTML file, no build, no JavaScript.

Live at https://legroomcompany.com. Deployed by Cloudflare from this repo on every push to `main`. Changes are logged in `CHANGELOG.md`.

## Files

- `index.html` is the whole site. Inline CSS, no JS, no framework. If you find yourself adding a package.json, stop.
- `assets/` holds the background art, the logo source files, and the share image. The logo paths from `legroom-lockup-horizontal-charcoal.svg` are inlined once in `index.html` as two `<symbol>`s (mark and wordmark). Two `<svg>` compositions reuse them with `<use>`: a horizontal lockup for desktop and a stacked one for mobile. CSS swaps which one shows. If the logo changes, replace the two path `d` attributes and nothing else. Everything in it is already optimized. Do not re-export, re-compress, or regenerate anything.
- `favicon.ico`, `favicon.svg`, `apple-touch-icon.png` sit at the root.
- `_headers` is read by Cloudflare Pages. Long, immutable cache on `/assets/*`. No cache on `/` and `/index.html`, so a page edit is live on the next request while images stay cached.
- `ASSETS.md` is the asset manifest with sizes and sampled colors.

## Things that look wrong but are deliberate

- The sign has a 14px border radius. The brand is sharp corners everywhere else. A chunky arcade button with square corners reads as a form field, so this is the one exception. Do not "fix" it.
- The sign is not a link and not a button. It is a `<p>`. It used to be a mailto link. Do not add a hover state back without also making it interactive again.
- The sign's extrusion is built from layered box-shadows, not a pseudo-element or a wrapper. Animating it never changes layout: box-shadows and transforms are paint only.
- The idle animation presses the sign into its own base every 4.6 seconds. The extrusion depth is a registered custom property (`@property --depth`) so the browser can interpolate it inside the keyframes. Press travel equals the rest extrusion minus 2px (10px base, 8px travel on desktop; 8px base, 6px travel on mobile) so the silhouette height never changes. `prefers-reduced-motion` removes the animation entirely.
- The sign has a fixed width, height, and line-height with a real fallback stack. The page does not reflow when Oswald arrives.
- Logo colors: mark in Signal Yellow, wordmark in Bone. Bone is the brand's white. The page never uses pure #FFFFFF.
- The content block sits at 40% from the top on desktop and 25% on mobile. Both were set by looking at the art, not by formula.
- On mobile the background is scaled to 118% of the viewport height and anchored to the top edge. That pushes the cloud bank down to roughly 31 to 37% of the viewport so the stacked lockup has clear sky, at the cost of a few pixels off the sneaker soles. If the background art changes, re-check both the scale and the anchor.
- The stacked lockup places the mark 25 units left of the wordmark's center on purpose. The seat back carries the visual weight, so true bounding-box centering looks off.
- The background is an `<img>` inside `<picture>` with `object-fit: cover`, not a CSS background-image, so the browser chooses the right crop and density and can prioritize the download.

## Cache gotcha

`/assets/*` is served with `max-age=31536000, immutable`. If you replace an image, give it a new filename and update `index.html`. Overwriting a file under the same name will not reach anyone who has already visited.

## Deploy

GitHub repo, connected to Cloudflare Pages. Every push to `main` deploys. No build command, no output directory, root directory blank. Custom domains `legroomcompany.com` (primary) and `www.legroomcompany.com` (redirects to the apex).

## Local preview

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. The favicons use root-relative paths, so serve from this directory, not from a parent.

## Making a change

1. Edit `index.html`.
2. Check it locally at 390x844 and 1440x900. Nothing should scroll.
3. Add a line under Unreleased in `CHANGELOG.md`.
4. Commit with a conventional commit message (`feat:`, `fix:`, `docs:`, `chore:`), push to `main`.
5. Cloudflare deploys in under a minute. Hard refresh to confirm.
