# legroomcompany.com

Coming-soon page for Legroom. One screen, one HTML file, no build, no JavaScript.

## Files

- `index.html` is the whole site. Inline CSS, no JS, no framework. If you find yourself adding a package.json, stop.
- `assets/` holds the background art, the logo, and the share image. Everything in it is already optimized. Do not re-export, re-compress, or regenerate anything.
- `favicon.ico`, `favicon.svg`, `apple-touch-icon.png` sit at the root.
- `_headers` is read by Cloudflare Pages. Long, immutable cache on `/assets/*`. No cache on `/` and `/index.html`, so a page edit is live on the next request while images stay cached.
- `ASSETS.md` is the asset manifest with sizes and sampled colors.

## Things that look wrong but are deliberate

- The sign has a 14px border radius. The brand is sharp corners everywhere else. A chunky arcade button with square corners reads as a form field, so this is the one exception. Do not "fix" it.
- The sign's extrusion is built from layered box-shadows, not a pseudo-element or a wrapper. That is why pressing it never changes layout: box-shadows are paint only.
- The press travel equals the rest extrusion minus 2px (10px base, 8px travel on desktop; 8px base, 6px travel on mobile). That keeps the button's total silhouette height constant between rest and press so nothing twitches.
- The sign and the email line have fixed heights and fixed line-heights with real fallback stacks. The page does not reflow when Oswald or DM Sans arrive.
- The content block sits at 40% from the top on desktop and 29% on mobile. Both were set by looking at the art, not by formula. The mobile crop has a cloud bank between roughly 26% and 31% of the viewport height and the logo has to clear it. If the background art changes, re-check these.
- Hover effects are gated behind `@media (hover: hover) and (pointer: fine)` so a phone tap does not leave the button stuck in its lifted state. On touch, `:active` alone produces the press.
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
