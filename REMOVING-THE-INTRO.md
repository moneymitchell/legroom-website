# Removing the intro

The first visit intro is additive and removable in one command each way.

## Turn it off for one build

```bash
INTRO=off npm run build
```

The output has no intro code in it: no gate, no overlay, no chunk, no
`dist/intro/`, and a Content-Security-Policy without the gate's hash. It is byte
identical to a build of tag `pre-intro-animation`, and `tests/intro.spec.ts` proves
that on every run rather than assuming it. The build fails if any intro marker
survives.

## Remove it permanently

Everything the intro is lives in these paths:

```
src/components/Intro.astro
src/scripts/intro/
public/intro/
scripts/build-intro-assets.mjs
scripts/check-intro-csp.mjs
tests/intro.spec.ts
REMOVING-THE-INTRO.md
```

Four files outside them carry intro changes, each inside a fenced block that
begins with a line containing `INTRO: start` and ends with one containing
`INTRO: end`:

```
astro.config.mjs
src/layouts/Base.astro
src/pages/index.astro
playwright.config.ts
```

Cut the fences, then delete the paths:

```bash
node scripts/check-intro-csp.mjs --strip-fences
git rm -r src/components/Intro.astro src/scripts/intro public/intro \
  scripts/build-intro-assets.mjs scripts/check-intro-csp.mjs tests/intro.spec.ts \
  REMOVING-THE-INTRO.md
npm run build && npm test
```

The four fenced files are then byte identical to their versions at
`pre-intro-animation`, and so is the build.

## Why it is shaped this way

`public/_headers` is never edited. The gate is an inline script and the policy
has no `'unsafe-inline'`, so it is allowed by a hash of its exact bytes, and that
hash is computed from the built HTML and written into `dist/_headers` by the build
itself. A hash kept in source drifts the first time someone edits the gate, and
the browser blocks a drifted hash silently. One computed from the output cannot
drift.

Tailwind v4 scans every text file in the project for class shaped tokens, so
`easing: "ease-out"` in a module nobody imports still ships `.ease-out` to every
page. The intro's paths are excluded from that scan by the same build hook. That
is why an `INTRO=off` build matches the tag to the byte instead of differing by
five CSS rules.
