/**
 * ============================================================================
 * The measure. The hero's bottom edge.
 *
 * R4 replaced the hero slitscan with this. Two slitscan bands on one page said
 * the same thing twice, and the one under the hero had to carry the first
 * interaction a visitor ever has with the site. A wave is atmosphere. This is
 * an argument.
 *
 * It draws a ruler: a hairline across the full width with graduations rising
 * off it, every fifth one major, the same drafting language as the measured
 * drawing in the hero panel above it. The pointer does not push the ruler
 * around. It STRETCHES it. The graduations near the cursor spread apart, the
 * rule bows up under them, and a dimension bar snaps across the gap that just
 * opened, capped at both ends exactly like the yellow "legroom" measure in the
 * drawing.
 *
 * That is the whole product in one gesture: you arrive, and the room opens
 * where you are, and then it tells you how much room it made.
 *
 * ---- THE STRETCH IS A LENS, NOT A SHOVE ----
 * Each graduation is displaced by an odd function that is zero at the cursor
 * and decays away from it. The displacement itself is not what you see. Its
 * SLOPE is: where the slope is positive the spacing between neighbours grows,
 * and that widening is the effect. Displacing ticks away from the cursor by a
 * bell curve instead would leave whichever tick sits nearest the cursor
 * stranded alone in the middle of the gap it opened. Nothing here is ever
 * removed, hidden or teleported. The row only breathes.
 *
 * THE POINTER IS SMOOTHED, NOT TRACKED. Position lerps at 0.12 per frame and
 * strength at 0.06, the same constants the wordmark band runs on, because the
 * lag is what makes either of them feel like a physical object.
 *
 * Reduced motion draws ONE static frame and never starts the loop. With no
 * pointer term that frame is an evenly graduated rule, which is a finished
 * drawing rather than a degraded animation.
 * ========================================================================= */

const PITCH = 13; // px between graduations
const MAJOR = 5; // every 5th is a major graduation
const MINOR_LEN = 13;
const MAJOR_LEN = 26;
const GAIN = 1.5; // how much taller a graduation gets at the pointer
const SPREAD = 190; // pointer falloff radius in px
const SHOVE = 58; // peak displacement in px. Its slope is the legroom.
const BOW = 7; // how far the rule lifts under the pointer
const BASE = 0.8; // the rule sits here, as a fraction of band height

/** Cold colour. Mixes toward SIGNAL as a graduation heats up. */
const BONE_R = 150;
const BONE_G = 145;
const BONE_B = 127;
const SIGNAL_R = 233;
const SIGNAL_G = 179;
const SIGNAL_B = 0;

export function mountMeasureRule(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return () => {};

  const reduceQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  /** Per-band intensity multiplier on the alpha. */
  const K = Number.parseFloat(canvas.dataset.intensity ?? "1") || 1;

  let W = 0;
  let H = 0;
  let dpr = 1;

  // Pointer state. x is the smoothed value that gets drawn, tx the raw target.
  // k is smoothed strength, tk its target (1 in, 0 out).
  let mx = -9999;
  let mtx = -9999;
  let mk = 0;
  let mtk = 0;

  // Cached so pointer moves never force a layout, and INVALIDATED rather than
  // recomputed when the canvas moves. Reading the rect inside the scroll
  // handler is the obvious version and it is wrong twice over: it is a sync
  // layout read on every scroll frame, and the read lands before the scroll
  // has settled, so the cache can end up holding a position the canvas was
  // only passing through. A stale top silently fails the band test in onMove
  // and the whole effect just stops answering the pointer with nothing on
  // screen to say why. Mouse moves are rarer than scroll frames, so the
  // recompute belongs there.
  let rectLeft = 0;
  let rectTop = 0;
  let rectH = 0;
  let rectDirty = true;

  const refresh = () => {
    const r = canvas.getBoundingClientRect();
    rectLeft = r.left;
    rectTop = r.top;
    rectH = r.height;
    rectDirty = false;
  };

  const measure = () => {
    const r = canvas.getBoundingClientRect();
    rectLeft = r.left;
    rectTop = r.top;
    rectH = r.height;
    W = r.width || canvas.width;
    H = r.height || canvas.height;
    rectDirty = false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const onMove = (e: MouseEvent) => {
    if (rectDirty) refresh();
    mtx = e.clientX - rectLeft;
    const y = e.clientY - rectTop;
    // The band is 128px in a 860px hero. Demanding the pointer be inside it
    // would mean the effect only ever fires by accident, so it engages from a
    // generous distance above and below and the horizontal position is what
    // actually steers it.
    mtk = y > -260 && y < rectH + 160 ? 1 : 0;
  };
  const onLeave = () => {
    mtk = 0;
  };
  const onScroll = () => {
    rectDirty = true;
  };

  const draw = () => {
    ctx.clearRect(0, 0, W, H);

    // The lag is the effect. 0.12 position, 0.06 strength.
    mx += (mtx - mx) * 0.12;
    mk += (mtk - mk) * 0.06;

    const baseY = Math.round(H * BASE) + 0.5; // +0.5 keeps the hairline crisp

    // ---- the rule ----
    // Sampled rather than drawn as one line, because it bows under the pointer.
    ctx.beginPath();
    for (let x = 0; x <= W; x += 6) {
      const u = (x - mx) / SPREAD;
      const g = Math.exp(-u * u) * mk;
      const y = baseY - BOW * g;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${BONE_R},${BONE_G},${BONE_B},${(K * 0.55).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // ---- the graduations ----
    const count = Math.ceil(W / PITCH) + 2;
    for (let i = 0; i < count; i++) {
      const x = i * PITCH;
      const u = (x - mx) / SPREAD;

      // Odd, zero at the cursor, decaying outward. Its SLOPE is the legroom:
      // positive slope at the cursor means neighbouring ticks move apart.
      const push = SHOVE * Math.tanh(u * 1.35) * Math.exp(-u * u * 0.42) * mk;
      const xd = x + push;

      const g = Math.exp(-u * u) * mk;
      const heat = Math.min(1, g * 1.15);
      const len = (i % MAJOR === 0 ? MAJOR_LEN : MINOR_LEN) * (1 + g * GAIN);
      const y0 = baseY - BOW * g;

      // Channel mix inlined: no array allocated per graduation, per frame.
      const r = Math.round(BONE_R + (SIGNAL_R - BONE_R) * heat);
      const gg = Math.round(BONE_G + (SIGNAL_G - BONE_G) * heat);
      const b = Math.round(BONE_B + (SIGNAL_B - BONE_B) * heat);

      ctx.fillStyle = `rgba(${r},${gg},${b},${(K * (0.26 + heat * 0.5)).toFixed(3)})`;
      ctx.fillRect(xd - 0.75, y0 - len, 1.5, len);
    }

    // ---- the dimension bar over the room that opened ----
    // The same glyph as the yellow "legroom" measure in the hero drawing: two
    // end caps and a line between them. It spans the whole stretched zone
    // rather than the one gap nearest the cursor, because the single gap is
    // about 19px wide and reads as a stray mark floating over the rule
    // instead of a measurement of anything. It grows in with the effect.
    if (mk > 0.05) {
      const half = SPREAD * 0.95 * mk;
      const leftX = Math.max(2, mx - half);
      const rightX = Math.min(W - 2, mx + half);
      // clear the tallest graduation the pointer is currently raising
      const y = Math.round(baseY - BOW * mk - MAJOR_LEN * (1 + GAIN * mk) - 14) + 0.5;
      const a = mk * 0.9;
      ctx.strokeStyle = `rgba(${SIGNAL_R},${SIGNAL_G},${SIGNAL_B},${(K * a).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(leftX, y - 5);
      ctx.lineTo(leftX, y + 5);
      ctx.moveTo(rightX, y - 5);
      ctx.lineTo(rightX, y + 5);
      ctx.moveTo(leftX, y);
      ctx.lineTo(rightX, y);
      ctx.stroke();

      // Extension lines, the drafting convention: the dimension sits off the
      // object and two faint lines carry it back down to what it measures.
      // Without them the bar floats and could be measuring anything.
      ctx.strokeStyle = `rgba(${SIGNAL_R},${SIGNAL_G},${SIGNAL_B},${(K * a * 0.35).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(leftX, y + 5);
      ctx.lineTo(leftX, baseY - 4);
      ctx.moveTo(rightX, y + 5);
      ctx.lineTo(rightX, baseY - 4);
      ctx.stroke();
    }
  };

  let raf = 0;
  let running = false;

  const loop = () => {
    draw();
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
  // the loop off the main thread while the reader is elsewhere.
  let io: IntersectionObserver | null = null;

  const onResize = () => {
    measure();
    if (!running) draw();
  };

  const onReduceChange = () => {
    if (reduceQuery?.matches) {
      stop();
      mk = 0;
      mtk = 0;
      draw();
    } else {
      start();
    }
  };

  const unmount = () => {
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
    // One frame. No loop. Not a slower loop, no loop. With no pointer term it
    // is an evenly graduated rule, which is a drawing, not a broken animation.
    draw();
    window.addEventListener("resize", onResize);
    reduceQuery.addEventListener("change", onReduceChange);
    return unmount;
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

  return unmount;
}

/** Wires every [data-measure] canvas on the page. */
export function initMeasureRules(): void {
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

  for (const cv of document.querySelectorAll<HTMLCanvasElement>("canvas[data-measure]")) {
    mountMeasureRule(cv);
  }
}
