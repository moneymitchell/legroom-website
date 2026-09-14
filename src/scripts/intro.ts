/**
 * ============================================================================
 * The first-visit intro. A POV drift in an aeroplane seat, a dolly forward
 * into the sky, the lockup, and a crossfade onto the homepage that has been
 * live underneath the whole time.
 *
 * This module is loaded by dynamic import and ONLY when the gate in Base.astro
 * has set data-intro="run". A returning visitor never fetches this chunk.
 *
 * WHY THE CAMERA IS translateZ AND NOT scale()
 *
 * The stage carries `perspective: 1000px` and a perspective-origin at the
 * vanishing point, so moving a layer on Z is a real dolly: the projection does
 * the scaling, about a point that is the camera rather than the middle of a
 * box. With one flat plane you cannot tell the difference. With Phase B's eight
 * to ten cut layers you can tell immediately, because giving each layer its own
 * Z is the entire parallax effect and needs no new machinery. Scale() would
 * have to be thrown away to get there.
 *
 * WHY DRIFT AND DOLLY ARE SEPARATE ELEMENTS
 *
 * They both animate `transform`, and one element has one transform. The drift
 * is driven per frame by requestAnimationFrame because it answers the cursor;
 * the dolly is a fixed curve and belongs to the Web Animations API, off the
 * main thread. Nesting them lets each own its own property and lets the dolly
 * run on the compositor even while the drift is doing main-thread work.
 *
 * TRANSFORM AND OPACITY ONLY. Nothing here animates width, top, or filter. The
 * speed smear is a second copy of the same decoded bitmap rather than a blur,
 * for exactly this reason. See the note in Intro.astro.
 * ========================================================================= */

/** Matches the `perspective` on .intro-stage. Changing one without the other
 *  silently rescales the whole dolly. */
const PERSPECTIVE = 1000;

/** Z that projects to a given apparent scale under PERSPECTIVE. */
const zFor = (scale: number) => PERSPECTIVE * (1 - 1 / scale);

/** The dolly curve, from the brief. Slow to leave, hard through the middle. */
const DOLLY_EASE = "cubic-bezier(.65,0,.35,1)";

/** How long we will wait for the plate to decode before starting anyway.
 *  Starting on a plate that has not arrived means the drift beat plays on flat
 *  blue and the illustration pops in mid-dolly, which is worse than a slightly
 *  late start. Capped so a stalled image cannot hold the homepage hostage. */
const DECODE_WAIT_MS = 600;

/** The exit when a visitor skips. Long enough not to be a cut, short enough
 *  not to be an argument. */
const SKIP_FADE_MS = 200;

/** The overlay's layers, resolved once. Named rather than string-keyed so a
 *  typo is a compile error instead of an undefined at 3am. */
interface Layers {
  root: HTMLElement;
  drift: HTMLElement;
  dolly: HTMLElement;
  plate: HTMLImageElement;
  smear: HTMLImageElement;
  edge: HTMLElement;
  wash: HTMLElement;
  floor: HTMLElement;
  logo: HTMLElement;
  lockup: HTMLImageElement;
}

interface Beat {
  el: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}

/**
 * Desktop, 3500ms. Hold and drift, dolly, lockup, crossfade.
 */
function desktopBeats(el: Layers): Beat[] {
  return [
    {
      el: el.dolly,
      keyframes: [
        { transform: "translateZ(0px)" },
        { transform: `translateZ(${zFor(2.6).toFixed(1)}px)` },
      ],
      options: {
        delay: 900,
        duration: 1500,
        easing: DOLLY_EASE,
        fill: "forwards",
      },
    },
    {
      // Only at peak velocity. In and out, never present at rest.
      el: el.smear,
      keyframes: [
        { opacity: 0 },
        { opacity: 0.34, offset: 0.45 },
        { opacity: 0 },
      ],
      options: {
        delay: 1100,
        duration: 1300,
        easing: "ease-in-out",
        fill: "forwards",
      },
    },
    {
      el: el.edge,
      keyframes: [{ opacity: 0 }, { opacity: 1 }],
      options: {
        delay: 900,
        duration: 1500,
        easing: "ease-in",
        fill: "forwards",
      },
    },
    {
      // Later and faster than the edges, so the legs leave before they loom.
      el: el.floor,
      keyframes: [{ opacity: 0 }, { opacity: 1 }],
      options: {
        delay: 1350,
        duration: 750,
        easing: "ease-in",
        fill: "forwards",
      },
    },
    {
      el: el.wash,
      keyframes: [{ opacity: 0 }, { opacity: 0.94 }],
      options: {
        delay: 2050,
        duration: 400,
        easing: "ease-out",
        fill: "forwards",
      },
    },
    {
      // 2400 in, settled by 3000, out by 3300. One animation rather than two,
      // so the hold in the middle cannot drift out of sync.
      el: el.logo,
      keyframes: [
        { opacity: 0, transform: "scale(1.06)" },
        { opacity: 1, transform: "scale(1.042)", offset: 0.222 },
        { opacity: 1, transform: "scale(1)", offset: 0.667 },
        { opacity: 0, transform: "scale(1.02)" },
      ],
      options: {
        delay: 2400,
        duration: 900,
        easing: "ease-out",
        fill: "forwards",
      },
    },
    {
      el: el.root,
      keyframes: [{ opacity: 1 }, { opacity: 0 }],
      options: {
        delay: 3300,
        duration: 200,
        easing: "ease-in",
        fill: "forwards",
      },
    },
  ];
}

/**
 * Mobile, 2000ms. The same beats, compressed. No cursor to answer, so no
 * lissajous: a straight slow push to 1.06 and then the dolly. No smear, which
 * on a phone GPU costs a full-viewport composited layer to sell speed that the
 * shorter, smaller dolly is not really claiming.
 */
function mobileBeats(el: Layers): Beat[] {
  return [
    {
      el: el.dolly,
      keyframes: [
        { transform: "translateZ(0px)", easing: "ease-out" },
        {
          transform: `translateZ(${zFor(1.06).toFixed(1)}px)`,
          offset: 0.357,
          easing: DOLLY_EASE,
        },
        { transform: `translateZ(${zFor(2.0).toFixed(1)}px)` },
      ],
      options: { delay: 0, duration: 1400, fill: "forwards" },
    },
    {
      el: el.edge,
      keyframes: [{ opacity: 0 }, { opacity: 1 }],
      options: {
        delay: 500,
        duration: 900,
        easing: "ease-in",
        fill: "forwards",
      },
    },
    {
      el: el.floor,
      keyframes: [{ opacity: 0 }, { opacity: 1 }],
      options: {
        delay: 700,
        duration: 500,
        easing: "ease-in",
        fill: "forwards",
      },
    },
    {
      el: el.wash,
      keyframes: [{ opacity: 0 }, { opacity: 0.94 }],
      options: {
        delay: 1150,
        duration: 300,
        easing: "ease-out",
        fill: "forwards",
      },
    },
    {
      el: el.logo,
      keyframes: [
        { opacity: 0, transform: "scale(1.05)" },
        { opacity: 1, transform: "scale(1.02)", offset: 0.35 },
        { opacity: 1, transform: "scale(1)", offset: 0.7 },
        { opacity: 0, transform: "scale(1.015)" },
      ],
      options: {
        delay: 1400,
        duration: 400,
        easing: "ease-out",
        fill: "forwards",
      },
    },
    {
      el: el.root,
      keyframes: [{ opacity: 1 }, { opacity: 0 }],
      options: {
        delay: 1800,
        duration: 200,
        easing: "ease-in",
        fill: "forwards",
      },
    },
  ];
}

/**
 * The handheld drift. Two sine pairs at incommensurable rates so the path
 * never visibly repeats inside the beat, plus a slow roll.
 *
 * On a fine pointer the whole figure is biased toward the cursor at a quarter
 * strength, which is what makes it read as the viewer steering rather than as
 * the page wobbling. THE BIAS IS LERPED, NOT SET. Following the cursor exactly
 * turns a head-turn into a mouse-look and feels like a bug. Same reasoning as
 * the lag in slitscan.ts and pointer-tilt.ts.
 *
 * Amplitude ramps to zero over the last 200ms of its life so the dolly does
 * not inherit a moving frame and snap.
 */
function startDrift(drift: HTMLElement, lifetimeMs: number): () => void {
  const AMPLITUDE = 1.5; // percent of the frame, per the brief
  const ROLL = 0.4; // degrees
  const BIAS = 0.25; // cursor authority
  const FADE_MS = 200;

  const fine =
    window.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? false;

  let raf = 0;
  const t0 = performance.now();

  // Cursor target and its smoothed follower, both in -1..1 viewport space.
  let tx = 0;
  let ty = 0;
  let cx = 0;
  let cy = 0;

  const onMove = (e: PointerEvent) => {
    tx = (e.clientX / window.innerWidth) * 2 - 1;
    ty = (e.clientY / window.innerHeight) * 2 - 1;
  };

  const tick = (now: number) => {
    const t = now - t0;

    // Ease the whole figure out rather than stopping it dead.
    const life = Math.min(1, Math.max(0, (lifetimeMs - t) / FADE_MS));

    cx += (tx - cx) * 0.045;
    cy += (ty - cy) * 0.045;

    const s = t / 1000;
    const lx = Math.sin(s * 1.9) * 0.6 + Math.sin(s * 0.77 + 1.3) * 0.4;
    const ly = Math.sin(s * 1.37 + 0.6) * 0.62 + Math.sin(s * 2.31) * 0.38;

    const x = (lx * (1 - BIAS) + cx * BIAS) * AMPLITUDE * life;
    const y = (ly * (1 - BIAS) + cy * BIAS) * AMPLITUDE * life;
    const r = Math.sin(s * 1.11 + 0.4) * ROLL * life;

    drift.style.transform = `translate3d(${x.toFixed(3)}%, ${y.toFixed(3)}%, 0) rotate(${r.toFixed(3)}deg)`;

    if (t < lifetimeMs) raf = requestAnimationFrame(tick);
    else raf = 0;
  };

  if (fine) window.addEventListener("pointermove", onMove, { passive: true });
  raf = requestAnimationFrame(tick);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (fine) window.removeEventListener("pointermove", onMove);
  };
}

/**
 * Runs the intro. Resolves once the overlay is gone, however it went: played
 * out, skipped, or never started because the markup was not there.
 */
export function runIntro(): Promise<void> {
  const root = document.querySelector<HTMLElement>("[data-intro-overlay]");
  const src = document.documentElement.dataset.introSrc;

  // The gate is the only thing that sets data-intro="run", and it never sets it
  // without a src. If either is missing, something is wrong upstream and the
  // right move is to leave the homepage alone.
  if (!root || !src) {
    document.documentElement.removeAttribute("data-intro");
    return Promise.resolve();
  }

  const pick = <T extends HTMLElement>(name: string) =>
    root.querySelector<T>(`[data-intro-${name}]`);

  const el: Layers = {
    root,
    drift: pick("drift")!,
    dolly: pick("dolly")!,
    plate: pick<HTMLImageElement>("plate")!,
    smear: pick<HTMLImageElement>("smear")!,
    edge: pick("edge")!,
    wash: pick("wash")!,
    floor: pick("floor")!,
    logo: pick("logo")!,
    lockup: pick<HTMLImageElement>("lockup")!,
  };

  // If the markup has been edited out from under this module, do nothing
  // rather than throw inside a promise nobody is awaiting.
  if (Object.values(el).some((node) => !node)) {
    root.remove();
    document.documentElement.removeAttribute("data-intro");
    return Promise.resolve();
  }

  const mobile = window.matchMedia?.("(max-width: 767px)").matches ?? false;

  // The gate already preloaded this exact URL, so these are cache hits.
  el.plate.src = src;
  el.lockup.src = "/brand/lockup-charcoal.svg";
  // Desktop only. On a phone the second layer is cost without a claim.
  if (!mobile) el.smear.src = src;

  return new Promise<void>((resolve) => {
    let done = false;
    let stopDrift: (() => void) | null = null;
    const animations: Animation[] = [];

    // Promoted for the duration and gone with the element. Left in CSS these
    // would hold compositor layers alive for the whole session.
    for (const node of [el.drift, el.dolly])
      node.style.willChange = "transform";
    for (const node of [el.edge, el.floor, el.wash, el.root])
      node.style.willChange = "opacity";
    // These two move and fade at the same time.
    for (const node of [el.smear, el.logo])
      node.style.willChange = "transform, opacity";

    const teardown = () => {
      if (done) return;
      done = true;
      stopDrift?.();
      for (const a of animations) a.cancel();
      for (const t of listeners)
        window.removeEventListener(t, onInput, INPUT_OPTS);
      reduce?.removeEventListener("change", onReduceChange);
      root.remove();
      document.documentElement.dataset.intro = "done";
      resolve();
    };

    /**
     * Skip. Freeze wherever the frame is and fade it off, rather than cutting
     * to the homepage. Someone who came here to book a call gets out on the
     * first input, but they do not get a jump cut for their trouble.
     */
    const skip = () => {
      if (done) return;
      stopDrift?.();
      // Hold the current rendered state, then fade that.
      for (const a of animations) {
        try {
          a.commitStyles();
        } catch {
          // commitStyles throws on an animation that never started. Nothing to
          // commit in that case, which is the state we already want.
        }
        a.cancel();
      }
      const out = root.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: SKIP_FADE_MS,
        easing: "ease-out",
        fill: "forwards",
      });
      animations.push(out);
      out.onfinish = teardown;
      // A cancelled or never-finishing animation must not strand the overlay
      // on top of the page.
      window.setTimeout(teardown, SKIP_FADE_MS + 120);
    };

    const onInput = () => skip();

    /**
     * Any input at all. pointerdown rather than click so it goes at the press,
     * wheel and touchstart because a scroll gesture is a decision, keydown for
     * Escape and for everything else, because a visitor reaching for the
     * keyboard has stopped watching.
     */
    const listeners = [
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
      "scroll",
    ] as const;
    const INPUT_OPTS = { passive: true, capture: true } as const;
    for (const t of listeners) window.addEventListener(t, onInput, INPUT_OPTS);

    // Flipping the OS setting mid-intro stops it, same as it never having run.
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onReduceChange = () => {
      if (reduce?.matches) teardown();
    };
    reduce?.addEventListener("change", onReduceChange);

    const play = () => {
      if (done) return;

      const beats = mobile ? mobileBeats(el) : desktopBeats(el);
      for (const b of beats)
        animations.push(b.el.animate(b.keyframes, b.options));

      // The drift owns the hold beat and hands over to the dolly. Mobile gets
      // a straight push instead, which is the dolly's own first keyframe, so
      // there is nothing to drive per frame.
      if (!mobile) stopDrift = startDrift(el.drift, 1100);

      // The overlay fade is always the last beat.
      const last = animations.at(-1);
      if (last) last.onfinish = teardown;
      // WAAPI can drop onfinish if the tab is backgrounded across the end of
      // the timeline. The overlay coming off the page is not optional.
      window.setTimeout(teardown, (mobile ? 2000 : 3500) + 400);
    };

    // Start on a plate that has actually decoded, or give up waiting.
    let started = false;
    const startOnce = () => {
      if (started) return;
      started = true;
      play();
    };
    el.plate.decode().then(startOnce, startOnce);
    window.setTimeout(startOnce, DECODE_WAIT_MS);
  });
}
