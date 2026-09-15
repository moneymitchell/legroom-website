# Reviving the intro

Parked 2026-09-15 at `0a27d74`, tagged `intro-v3-parked`. `main` has no intro
and never will by accident: nothing here is reachable from it.

## What this branch has that is worth keeping

The plumbing, which is independent of what draws:

- `src/layouts/Base.astro`, inside its `INTRO` fence: the blocking gate. Decides
  before first paint, writes the first-visit flag only after every other check
  has passed, preloads at low priority so the headline's fonts win the race.
- `scripts/check-intro-csp.mjs`: hashes the gate from the BUILT HTML into
  `dist/_headers` on every build, so an inline script survives a strict CSP and
  the hash cannot drift. Also the `INTRO=off` build, and the Tailwind scan
  exclusion.
- `src/components/Intro.astro`: the overlay shell on a live page. Scoped, prefixed
  `lg-`, because the homepage already has a `.intro` class.
- `src/scripts/intro/intro.ts`: skip on any input, lost context handling, the
  lockup beat that lands on the nav's measured box, teardown.
- `tests/intro.spec.ts`: every non negotiable, plus the byte identical build.

The renderer in `src/scripts/intro/gl.ts` and `shaders.ts` is the part to
replace if a better creative asset arrives.

## With an mp4

1. `git checkout feat/intro-animation && git merge main`. The fenced blocks
   merge cleanly; resolve anything else in favour of main.
2. Put the video in `public/intro/`. In the gate, preload it instead of the
   plates. In `Intro.astro`, put `<video muted playsinline preload="auto">`
   inside `[data-intro-overlay]` with no `src`; the module sets it, so
   returning visitors fetch nothing.
3. In `intro.ts`, delete the renderer and the cloud pool. On the sign's click,
   `video.play()`; on `ended`, call `startLogo()` for the existing lockup beat.
   Keep `skip`, `onLost` becomes unnecessary, keep `teardown`.
4. Keep the still and the click. A video that autoplays before the click will
   be the Largest Contentful Paint element on first visit, and the site asserts
   LCP under 1500ms on mobile and performance 0.98.
5. `npx playwright test tests/intro.spec.ts`. The byte identical test must still
   pass with `INTRO=off`.

## With a component built elsewhere

Mount it inside `[data-intro-overlay]`, start it from the sign's click handler,
and call `startLogo()` when it finishes. Everything else stays.

## Or start again on main

Take only the gate and the CSP hashing. Those two took the longest to get
right, and both are wrong in ways that fail silently if done from memory.
