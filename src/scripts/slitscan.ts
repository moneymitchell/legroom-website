/**
 * ============================================================================
 * Slitscan canvas engine.
 *
 * R2: one engine, one preset. Both bands now run the light variant and differ
 * only by a `data-intensity` multiplier read off the canvas: 0.85 for the
 * 128px hero strip, 1.2 for the 387px wordmark band. The dark variant is gone
 * along with the charcoal background it lived on.
 *
 * Amplitude and slit length scale from the band height, so the same wave reads
 * correctly at 128px and at 387px without a second set of constants.
 *
 * EVERY SLIT IS CLAMPED INSIDE THE BAND. Without the clamp the wave clips flat
 * against the top and bottom edges wherever the pointer pushes it, which is
 * what the clamp in the R2 snippet exists to stop. Do not remove it.
 *
 * THE POINTER IS SMOOTHED, NOT TRACKED. Position lerps at 0.12 per frame and
 * lens strength at 0.06. The resulting lag is the entire effect. Making it
 * follow the cursor exactly stops it feeling physical.
 *
 * Reduced motion draws ONE static frame and never starts the loop. It is not
 * slowed down, it is stopped.
 *
 * Ported from handoff/snippets/slitscan-light.js.
 * ========================================================================= */

const CW = 8; // column pitch in px
const GAP = 2.4; // gap between slits
const SPEED = 0.00038; // wave speed
const WAVES = 1.85; // waves across the band
const LENS = 190; // pointer falloff radius in px

/** Cold colour. Mixes toward SIGNAL as a column heats up. */
const BONE_R = 150;
const BONE_G = 145;
const BONE_B = 127;
const SIGNAL_R = 233;
const SIGNAL_G = 179;
const SIGNAL_B = 0;

export function mountSlitscan(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return () => {};

  const reduceQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  /** Per-band intensity multiplier on the alpha. */
  const K = Number.parseFloat(canvas.dataset.intensity ?? "1") || 1;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let baseAmp = 15;
  let baseLen = 32;

  // Pointer state. x/y are the smoothed values that get drawn; tx/ty are the
  // raw target. k is the smoothed lens strength, tk its target (1 in, 0 out).
  let mx = -9999;
  let my = 0;
  let mtx = -9999;
  let mty = 0;
  let mk = 0;
  let mtk = 0;

  // Cached so pointer moves never force a layout, and INVALIDATED rather than
  // recomputed when the canvas moves. Reading the rect in the scroll handler
  // is a sync layout read on every scroll frame, and it lands before the
  // scroll has settled, so the cache can hold a position the canvas was only
  // passing through. Recompute on the next pointer move instead: rarer, and
  // it cannot be stale when it matters. See the same note in measure-rule.ts.
  let rectLeft = 0;
  let rectTop = 0;
  let rectDirty = true;

  const refresh = () => {
    const r = canvas.getBoundingClientRect();
    rectLeft = r.left;
    rectTop = r.top;
    rectDirty = false;
  };

  const measure = () => {
    const r = canvas.getBoundingClientRect();
    rectLeft = r.left;
    rectTop = r.top;
    W = r.width || canvas.width;
    H = r.height || canvas.height;
    rectDirty = false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // scale the wave to the band so one engine serves both heights
    baseAmp = Math.max(11, H * 0.145);
    baseLen = Math.max(24, H * 0.2);
  };

  const onMove = (e: MouseEvent) => {
    if (rectDirty) refresh();
    mtx = e.clientX - rectLeft;
    mty = e.clientY - rectTop;
    mtk = 1;
  };
  const onLeave = () => {
    mtk = 0;
  };
  const onScroll = () => {
    rectDirty = true;
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, W, H);

    // The lag is the effect. 0.12 position, 0.06 strength.
    mx += (mtx - mx) * 0.12;
    my += (mty - my) * 0.12;
    mk += (mtk - mk) * 0.06;

    const cols = Math.ceil(W / CW) + 1;
    const mid = H / 2;

    for (let i = 0; i < cols; i++) {
      const x = i * CW;
      const u = x / W;
      const ph = t * SPEED - u * WAVES * Math.PI * 2;
      const w =
        Math.sin(ph) * 0.6 + Math.sin(ph * 2.13 + 1.7) * 0.26 + Math.sin(ph * 0.47 - 0.9) * 0.14;

      const d = (x - mx) / LENS;
      const g = Math.exp(-d * d) * mk;

      const amp = baseAmp * (1 + g * 1.75);
      // R3: 1.05 rather than 0.5. At 0.5 every slit was within a few pixels
      // of the same length, so the band had a uniform thickness and read as a
      // ribbon with two hard edges. The wider spread is what makes it a wave.
      const len = baseLen * (1 + Math.abs(w) * 1.05 + g * 1.15);
      const heat = Math.min(1, Math.abs(w) * 0.42 + g * 0.92);

      // keep every slit inside the band: no vertical clipping, ever
      const half = len / 2;
      const pad = 4;
      let yc = mid + w * amp + (my - mid) * g * 0.3;
      yc = Math.max(half + pad, Math.min(H - half - pad, yc));

      // Channel mix inlined: no array allocated per column, per frame.
      const mixT = Math.min(1, heat * 1.25);
      const r = Math.round(BONE_R + (SIGNAL_R - BONE_R) * mixT);
      const gg = Math.round(BONE_G + (SIGNAL_G - BONE_G) * mixT);
      const b = Math.round(BONE_B + (SIGNAL_B - BONE_B) * mixT);

      ctx.fillStyle =
        "rgba(" + r + "," + gg + "," + b + "," + (K * (0.16 + heat * 0.44)).toFixed(3) + ")";
      ctx.fillRect(x, yc - len / 2, CW - GAP, len);
    }
  };

  let raf = 0;
  let running = false;

  const loop = (t: number) => {
    draw(t);
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
  };

  // Offscreen canvases do not animate. Nothing visible changes, and it keeps
  // two rAF loops off the main thread while the reader is elsewhere.
  let io: IntersectionObserver | null = null;

  const onResize = () => {
    measure();
    if (!running) draw(0);
  };

  const onReduceChange = () => {
    if (reduceQuery?.matches) {
      stop();
      draw(0);
    } else {
      start();
    }
  };

  const teardown = () => {
    stop();
    io?.disconnect();
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseleave", onLeave);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", onScroll);
    reduceQuery?.removeEventListener("change", onReduceChange);
  };

  measure();

  if (reduceQuery?.matches) {
    // One frame. No loop. Not a slower loop, no loop.
    draw(0);
    window.addEventListener("resize", onResize);
    reduceQuery.addEventListener("change", onReduceChange);
    return teardown;
  }

  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) start();
          else stop();
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(canvas);
  } else {
    start();
  }

  window.addEventListener("mousemove", onMove, { passive: true });
  window.addEventListener("mouseleave", onLeave, { passive: true });
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onScroll, { passive: true });
  reduceQuery?.addEventListener("change", onReduceChange);

  return teardown;
}

/** Wires every [data-slitscan] canvas on the page. */
export function initSlitscans(): void {
  /**
   * NOT MOUNTED ON A TOUCH DEVICE.
   *
   * Both engines exist to answer a pointer. A phone has none, so every frame
   * they draw is a frame nobody can influence: an animation loop running at
   * 60fps in somebody's pocket, on their battery, for an effect that can only
   * ever show its resting state. Mounting it and drawing one static frame was
   * the alternative, and it is worse than not mounting, because the resting
   * state is what the section looks like with the engine absent anyway.
   *
   * Checked with matchMedia rather than a width query: what matters is the
   * input device, not the size of the window. A narrow desktop window still
   * has a mouse and still gets the effect.
   */
  if (window.matchMedia?.("(pointer: coarse)").matches) return;

  for (const cv of document.querySelectorAll<HTMLCanvasElement>("canvas[data-slitscan]")) {
    mountSlitscan(cv);
  }
}
