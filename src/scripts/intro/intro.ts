/**
 * ============================================================================
 * The first visit intro. Loaded by dynamic import from the homepage's script,
 * and only when the gate in Base.astro has already decided there should be
 * one: reduced motion off, a fine pointer, a wide enough window, a first
 * visit, and a WebGL2 context it has already created and handed over.
 *
 * Two halves.
 *
 * BEFORE THE CLICK it is a still: the illustration, the lockup, the sign that
 * says LET'S GO. Nothing else moves. The homepage is live underneath the
 * whole time, and any input other than the sign takes the visitor straight
 * to it.
 *
 * AFTER THE CLICK, about two seconds, timed from timing.ts:
 *
 *   launch   the sign presses, the lockup and the sign fall away
 *   flight   straight down Z. The cabin and the legs scale out past the
 *            edges; drawn clouds stream out of the vanishing point, stretched
 *            along their own motion; speed lines rush outward; the sun comes
 *            in from the top right; the plate smears radially
 *   whiteout the frame lifts to the paper token
 *   lockup   the charcoal lockup on paper, then a travel to the nav lockup's
 *            own box, measured with getBoundingClientRect when the beat begins
 *   handoff  a cross dissolve into the real nav, and the overlay is gone
 *
 * ANY INPUT ENDS IT. Freeze the frame, fade it off, tear down. A lost WebGL
 * context does the same without the fade, because a lost canvas has nothing
 * to fade.
 * ========================================================================= */

import { T, FLY, CLOUDS, SKY_RGB, LOGO, RENDER_DPR_MAX } from "./timing";
import { Renderer, type Constants, type QuadState } from "./gl";
import { CloudPool, VP_SCREEN } from "./clouds";

declare global {
  interface Window {
    __legroomIntro?: {
      canvas: HTMLCanvasElement;
      gl: WebGL2RenderingContext;
      src: string;
    };
  }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeIn = (t: number, k: number) => Math.pow(t, k);

/** A `#rrggbb` token from the stylesheet to [0..1] rgb. */
function tokenRgb(
  name: string,
  fallback: [number, number, number],
): [number, number, number] {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const m = /^#([0-9a-f]{6})$/i.exec(raw);
  if (!m) return fallback;
  const n = parseInt(m[1] ?? "0", 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Loaded AND decoded. onload fires when the bytes are in, not when the pixels
 * are, and handing an undecoded image to texImage2D makes the upload decode
 * it synchronously on the main thread. decode() does that work off the main
 * thread first, and the upload is then a copy.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () =>
      img.decode().then(
        () => resolve(img),
        () => resolve(img),
      );
    img.onerror = () => reject(new Error(`intro: could not load ${src}`));
    img.src = src;
  });
}

export function runIntro(): Promise<void> {
  const handoff = window.__legroomIntro;
  const root = document.querySelector<HTMLElement>("[data-intro-overlay]");
  const ui = root?.querySelector<HTMLElement>("[data-intro-ui]");
  const cta = root?.querySelector<HTMLButtonElement>("[data-intro-cta]");
  const logo = root?.querySelector<HTMLElement>("[data-intro-logo]");
  const lockup = root?.querySelector<HTMLImageElement>("[data-intro-lockup]");
  const navLockup =
    document.querySelector<HTMLImageElement>("nav.nav .brand img");

  const bail = () => {
    root?.remove();
    delete window.__legroomIntro;
    document.documentElement.removeAttribute("data-intro");
    return Promise.resolve();
  };
  if (!handoff || !root || !ui || !cta || !logo || !lockup) return bail();

  // Rebound so the narrowing survives into the hoisted `go` below.
  const sign = cta;
  const still = ui;
  const { canvas, gl, src } = handoff;
  delete window.__legroomIntro;

  let renderer: Renderer;
  try {
    renderer = new Renderer(gl);
  } catch {
    return bail();
  }

  return new Promise<void>((resolve) => {
    let done = false;
    let raf = 0;
    let clickAt = -1;
    let last = 0;
    let dirty = true;
    let logoStage = 0;
    const animations: Animation[] = [];
    const pool = new CloudPool(CLOUDS.COUNT);
    const k: Constants = {
      plateAspect: 16 / 9,
      vp: VP_SCREEN,
      sky: [SKY_RGB[0] / 255, SKY_RGB[1] / 255, SKY_RGB[2] / 255],
      bone: tokenRgb("--paper", [1, 1, 1]),
      ink: tokenRgb("--charcoal", [0.11, 0.11, 0.1]),
      focal: CLOUDS.FOCAL,
      glare: [FLY.GLARE_X, FLY.GLARE_Y],
    };
    const state: QuadState = {
      scaleSky: 1,
      scaleNear: 1,
      nearFade: 0,
      lift: 0,
      streak: 0,
    };

    canvas.className = "lg-intro-canvas";
    canvas.setAttribute("aria-hidden", "true");
    root.prepend(canvas);
    lockup.src = "/brand/lockup-charcoal.svg";

    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, RENDER_DPR_MAX);
      renderer.resize(
        Math.round(innerWidth * dpr),
        Math.round(innerHeight * dpr),
      );
      dirty = true;
    };

    const teardown = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      for (const a of animations) a.cancel();
      for (const t of INPUTS)
        window.removeEventListener(t, onInput, INPUT_OPTS);
      sign.removeEventListener("click", go);
      window.removeEventListener("resize", size);
      reduce?.removeEventListener("change", onReduce);
      canvas.removeEventListener("webglcontextlost", onLost);
      renderer.destroy();
      root.remove();
      document.documentElement.dataset.intro = "done";
      resolve();
    };

    /** Freeze whatever is on screen and fade it off. Never a cut. */
    const skip = () => {
      if (done) return;
      cancelAnimationFrame(raf);
      raf = 0;
      for (const a of animations) {
        try {
          a.commitStyles();
        } catch {
          // never started, nothing to hold
        }
        a.cancel();
      }
      const out = root.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: T.SKIP_FADE,
        easing: "ease-out",
        fill: "forwards",
      });
      out.onfinish = teardown;
      animations.push(out);
      setTimeout(teardown, T.SKIP_FADE + 120);
    };

    /** A lost context leaves a dead canvas. Paper behind it, then out. */
    const onLost = (e: Event) => {
      e.preventDefault();
      if (done) return;
      // Said out loud, because from outside this is indistinguishable from
      // the intro simply not playing.
      console.warn("intro: WebGL context lost, skipping to the homepage");
      cancelAnimationFrame(raf);
      raf = 0;
      canvas.style.visibility = "hidden";
      root.style.background = "var(--paper)";
      const out = root.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 150,
        fill: "forwards",
      });
      out.onfinish = teardown;
      setTimeout(teardown, 300);
    };

    /**
     * Any input at all, except the sign doing its job. A press on the sign is
     * the launch; Enter or Space on it is the same launch from the keyboard.
     * Everything else, including Tab away from it, is a visitor who wants the
     * page, and gets it.
     */
    const onInput = (e: Event) => {
      const onCta = e.target instanceof Node && sign.contains(e.target);
      if (onCta && clickAt < 0) {
        if (e.type === "pointerdown") return;
        if (e.type === "keydown") {
          const key = (e as KeyboardEvent).key;
          if (key === "Enter" || key === " ") return;
        }
      }
      skip();
    };
    const INPUTS = [
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
      "scroll",
    ] as const;
    const INPUT_OPTS = { passive: true, capture: true } as const;
    for (const t of INPUTS) window.addEventListener(t, onInput, INPUT_OPTS);
    window.addEventListener("resize", size);
    canvas.addEventListener("webglcontextlost", onLost);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onReduce = () => {
      if (reduce?.matches) teardown();
    };
    reduce?.addEventListener("change", onReduce);

    /* --- the launch ------------------------------------------------------ */

    function go() {
      if (done || clickAt >= 0) return;
      clickAt = performance.now();
      last = clickAt;
      sign.disabled = true;
      document.documentElement.dataset.intro = "fly";
      // the press, then the lockup and the sign fall away together
      animations.push(
        sign.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(0.95)" },
            { transform: "scale(1)" },
          ],
          {
            duration: T.PRESS,
            easing: "ease-out",
          },
        ),
      );
      const out = still.animate(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(0.8)" },
        ],
        {
          delay: T.UI_OUT_START,
          duration: T.UI_OUT,
          easing: "ease-in",
          fill: "forwards",
        },
      );
      out.onfinish = () => {
        still.style.visibility = "hidden";
      };
      animations.push(out);
      // the atlas has had since load to arrive; if it has not, the clouds
      // join when it does
    }
    sign.addEventListener("click", go);

    /* --- the lockup beat, unchanged ------------------------------------- */

    const startLogo = () => {
      logoStage = 1;
      const nav = navLockup?.getBoundingClientRect();
      const box =
        nav && nav.width > 0
          ? nav
          : new DOMRect(innerWidth / 2 - 85, 22, 170, 34);
      // laid out AT the nav's box, then transformed away from it, so the end
      // state is the identity and survives any viewport
      Object.assign(lockup.style, {
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      });
      const heroW = Math.min(innerWidth * LOGO.WIDTH_VW, LOGO.MAX_WIDTH);
      const kk = heroW / box.width;
      const heroH = box.height * kk;
      const dx = innerWidth / 2 - heroW / 2 - box.left;
      const dy = innerHeight / 2 - heroH / 2 - box.top;
      const at = (s: number) =>
        `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${(kk * s).toFixed(4)})`;
      logo.style.opacity = "1";
      const hold = T.LOGO_HOLD_END - T.LOGO_START;
      const a = lockup.animate(
        [
          { opacity: 0, transform: at(LOGO.SCALE_IN) },
          { opacity: 1, transform: at(1), offset: T.LOGO_FADE_IN / hold },
          { opacity: 1, transform: at(1) },
        ],
        { duration: hold, easing: "ease-out", fill: "forwards" },
      );
      animations.push(a);
      a.onfinish = () => {
        if (done) return;
        logoStage = 2;
        const b = lockup.animate(
          [{ transform: at(1) }, { transform: "none" }],
          {
            duration: T.LOGO_END - T.LOGO_HOLD_END,
            easing: "cubic-bezier(.4,0,.2,1)",
            fill: "forwards",
          },
        );
        animations.push(b);
        b.onfinish = () => {
          if (done) return;
          logoStage = 3;
          // the overlay lockup and the nav lockup are now the same pixels in
          // the same place, so this dissolve has nothing visible in it
          const c = root.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: T.HANDOFF,
            fill: "forwards",
          });
          animations.push(c);
          c.onfinish = teardown;
        };
      };
    };

    /* --- the frame ------------------------------------------------------- */

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!renderer.ready()) {
        if (renderer.failed()) teardown();
        return;
      }
      if (!renderer.hasPlate()) return;

      // before the click: the still, drawn once and again only on resize
      if (clickAt < 0) {
        if (dirty) {
          renderer.drawQuad(k, state);
          dirty = false;
        }
        return;
      }

      const tc = now - clickAt;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const ramp = smooth(0, T.FLY_RAMP, tc);
      const fp = clamp01(tc / T.WASH_END);
      // the seat frame holds while the world starts to move, then breaks out
      const fn = clamp01(
        (tc - FLY.NEAR_START) / (FLY.NEAR_END - FLY.NEAR_START),
      );
      state.scaleSky = 1 + (FLY.SKY_SCALE_END - 1) * easeIn(fp, FLY.SKY_CURVE);
      state.scaleNear =
        1 + (FLY.NEAR_SCALE_END - 1) * easeIn(fn, FLY.NEAR_CURVE);
      state.nearFade = smooth(FLY.NEAR_START + 150, FLY.CABIN_GONE, tc);
      state.lift = smooth(T.WASH_START, T.WASH_END, tc);
      state.streak =
        FLY.STREAK *
        smooth(FLY.STREAK_START, FLY.STREAK_PEAK, tc) *
        (1 - state.lift);
      renderer.drawQuad(k, state);

      if (renderer.hasAtlas()) {
        const alpha = ramp * (1 - smooth(0.5, 1, state.lift));
        pool.update(dt, CLOUDS.SPEED * ramp);
        if (alpha > 0)
          renderer.drawClouds(
            k,
            pool.buffer,
            pool.write(alpha),
            CLOUDS.STRETCH * ramp,
          );
      }

      const lines =
        FLY.LINES *
        smooth(FLY.LINES_START, FLY.LINES_FULL, tc) *
        (1 - smooth(0.3, 1, state.lift));
      // the sun sweeps in from off the top right corner as the speed comes up
      const sweep = smooth(FLY.GLARE_START, FLY.GLARE_FULL, tc);
      const glare = FLY.GLARE * sweep * (1 - smooth(0.6, 1, state.lift));
      k.glare = [
        FLY.GLARE_FROM_X + (FLY.GLARE_X - FLY.GLARE_FROM_X) * sweep,
        FLY.GLARE_FROM_Y + (FLY.GLARE_Y - FLY.GLARE_FROM_Y) * sweep,
      ];
      renderer.drawOverlay(k, tc / 1000, lines, glare);

      // the lockup beat begins on the clock; from there the Web Animations
      // API runs it, and the canvas just keeps showing paper underneath
      if (tc >= T.LOGO_START && logoStage === 0) {
        root.style.background = "var(--paper)";
        startLogo();
      }
      // belt and braces: the WAAPI chain ends the intro, and if a backgrounded
      // tab ever drops an onfinish, the clock does
      if (tc > T.TOTAL + 600) teardown();
    };

    /* --- assets, staggered ----------------------------------------------- */

    size();
    const plate = loadImage(src);
    const depth = loadImage("/intro/sky-desktop-depth.webp");
    const atlas = loadImage("/intro/clouds.webp");

    let started = false;
    const begin = () => {
      if (started || done) return;
      started = true;
      raf = requestAnimationFrame(frame);
      // Enter on the sign is the launch from the keyboard; Tab off it is the
      // page. Focus lands there so both are one key away. No scroll: the
      // overlay is fixed and the page under it must not move.
      sign.focus({ preventScroll: true });
    };

    // The plate and the depth map on separate frames, each an upload of a few
    // megabytes; the atlas afterwards, since nothing draws it until the click.
    plate
      .then((img) => {
        k.plateAspect = img.naturalWidth / img.naturalHeight;
        renderer.setPlate(img);
        return depth;
      })
      .then((img) => {
        requestAnimationFrame(() => {
          if (done) return;
          renderer.setDepth(img);
          dirty = true;
          begin();
          atlas
            .then((a) =>
              requestAnimationFrame(() => !done && renderer.setAtlas(a)),
            )
            .catch(() => {});
        });
      })
      .catch(() => {
        // no plate is no intro
        teardown();
      });
    setTimeout(begin, T.DECODE_WAIT);
  });
}
