/**
 * ============================================================================
 * Slitscan canvas engine.
 *
 * One engine, two presets. Ported from handoff/snippets/slitscan.js (dark, the
 * wordmark band) and slitscan-light.js (light, the hero's bottom strip). The two
 * snippets were byte-identical apart from the constants below, so they collapse
 * into one module with two configs.
 *
 * THE POINTER IS SMOOTHED, NOT TRACKED. Position lerps at 0.12 per frame and
 * lens strength at 0.06. The resulting ~5-frame lag is the entire effect. If you
 * make it follow the cursor exactly it stops feeling physical and starts feeling
 * cheap. Do not "fix" it.
 *
 * Reduced motion draws ONE static frame and never starts the loop. It is not
 * slowed down, it is stopped.
 * ========================================================================= */

export type SlitscanConfig = {
  /** Column pitch in px. */
  cw: number;
  /** Gap between slits in px. */
  gap: number;
  /** Wave speed. */
  speed: number;
  /** Waves across the full width. */
  waves: number;
  /** Pointer falloff radius in px. */
  lens: number;
  /** Resting wave amplitude. */
  baseAmp: number;
  /** Resting slit length. */
  baseLen: number;
  /** Cold colour, as [r,g,b]. Mixes toward Signal Yellow as heat rises. */
  bone: readonly [number, number, number];
  /** Alpha floor. */
  alphaBase: number;
  /** Alpha added at full heat. */
  alphaHeat: number;
};

/** The wordmark band. Bone slits on charcoal, wide and slow. */
export const DARK: SlitscanConfig = {
  cw: 9,
  gap: 2.6,
  speed: 0.00046,
  waves: 2.35,
  lens: 210,
  baseAmp: 26,
  baseLen: 46,
  bone: [242, 239, 233],
  alphaBase: 0.055,
  alphaHeat: 0.2,
};

/** The hero's bottom scan strip. Warmer, tighter, more opaque on paper. */
export const LIGHT: SlitscanConfig = {
  cw: 8,
  gap: 2.4,
  speed: 0.00038,
  waves: 1.85,
  lens: 190,
  baseAmp: 13,
  baseLen: 30,
  bone: [175, 167, 148],
  alphaBase: 0.14,
  alphaHeat: 0.42,
};

const SIGNAL_R = 255;
const SIGNAL_G = 200;
const SIGNAL_B = 0;

export function mountSlitscan(canvas: HTMLCanvasElement, cfg: SlitscanConfig): () => void {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return () => {};

  const reduceQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  let W = 0;
  let H = 0;
  let dpr = 1;

  // Pointer state. x/y are the smoothed values that get drawn; tx/ty are the
  // raw target. k is the smoothed lens strength, tk its target (1 in, 0 out).
  let mx = -9999;
  let my = 0;
  let mtx = -9999;
  let mty = 0;
  let mk = 0;
  let mtk = 0;

  // Cached so mousemove never forces a layout. Refreshed on scroll and resize,
  // which is the only time the canvas can move relative to the viewport.
  let rectLeft = 0;
  let rectTop = 0;

  const measure = () => {
    const r = canvas.getBoundingClientRect();
    rectLeft = r.left;
    rectTop = r.top;
    W = r.width || canvas.width;
    H = r.height || canvas.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const onMove = (e: MouseEvent) => {
    mtx = e.clientX - rectLeft;
    mty = e.clientY - rectTop;
    mtk = 1;
  };
  const onLeave = () => {
    mtk = 0;
  };
  const onScroll = () => {
    const r = canvas.getBoundingClientRect();
    rectLeft = r.left;
    rectTop = r.top;
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, W, H);

    // The lag is the effect. 0.12 position, 0.06 strength.
    mx += (mtx - mx) * 0.12;
    my += (mty - my) * 0.12;
    mk += (mtk - mk) * 0.06;

    const cols = Math.ceil(W / cfg.cw) + 1;
    const mid = H / 2;
    const boneR = cfg.bone[0];
    const boneG = cfg.bone[1];
    const boneB = cfg.bone[2];

    for (let i = 0; i < cols; i++) {
      const x = i * cfg.cw;
      const u = x / W;
      const ph = t * cfg.speed - u * cfg.waves * Math.PI * 2;
      const w =
        Math.sin(ph) * 0.6 + Math.sin(ph * 2.13 + 1.7) * 0.26 + Math.sin(ph * 0.47 - 0.9) * 0.14;

      const d = (x - mx) / cfg.lens;
      const g = Math.exp(-d * d) * mk;

      const amp = cfg.baseAmp * (1 + g * 1.75);
      const yc = mid + w * amp + (my - mid) * g * 0.3;
      const len = cfg.baseLen * (1 + Math.abs(w) * 0.5 + g * 1.15);
      const heat = Math.min(1, Math.abs(w) * 0.42 + g * 0.92);

      // Channel mix inlined: no array allocated per column, per frame.
      const mixT = Math.min(1, heat * 1.25);
      const r = Math.round(boneR + (SIGNAL_R - boneR) * mixT);
      const gg = Math.round(boneG + (SIGNAL_G - boneG) * mixT);
      const b = Math.round(boneB + (SIGNAL_B - boneB) * mixT);

      ctx.fillStyle =
        "rgba(" +
        r +
        "," +
        gg +
        "," +
        b +
        "," +
        (cfg.alphaBase + heat * cfg.alphaHeat).toFixed(3) +
        ")";
      ctx.fillRect(x, yc - len / 2, cfg.cw - cfg.gap, len);
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

  // Offscreen canvases do not animate. This costs nothing visible (the strip is
  // not on screen) and keeps two rAF loops off the main thread during scroll.
  let io: IntersectionObserver | null = null;

  const teardown = () => {
    stop();
    io?.disconnect();
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseleave", onLeave);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", onScroll);
    reduceQuery?.removeEventListener("change", onReduceChange);
  };

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

  measure();

  if (reduceQuery?.matches) {
    // One frame. No loop. Not a slower loop — no loop.
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

/** Wires every [data-slitscan] canvas on the page to its preset. */
export function initSlitscans(): void {
  const nodes = document.querySelectorAll<HTMLCanvasElement>("canvas[data-slitscan]");
  for (const cv of nodes) {
    mountSlitscan(cv, cv.dataset.slitscan === "dark" ? DARK : LIGHT);
  }
}
