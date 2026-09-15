/**
 * ============================================================================
 * The first visit intro. Loaded by dynamic import from the homepage's script,
 * and only when the gate in Base.astro has already decided there should be
 * one: reduced motion off, a fine pointer, a wide enough window, a first
 * visit, and a WebGL2 context it has already created and handed over.
 *
 * Four stages, timed from timing.ts:
 *
 *   look     the illustration with a camera in it, parallax by depth
 *   fly      the cabin scales away, clouds come at the viewer, the sky lifts
 *   logo     the lockup on paper, then travelling to the nav's own box
 *   handoff  a cross dissolve into the real nav, and the overlay is gone
 *
 * THE HOMEPAGE IS LIVE UNDERNEATH FROM THE FIRST FRAME. This is an overlay on
 * a page, not a gate in front of one. The nav the lockup lands on is the real
 * nav, measured with getBoundingClientRect when the beat begins, so it is
 * wherever the viewport put it.
 *
 * ANY INPUT ENDS IT. Freeze the frame, fade it off, tear down. A lost WebGL
 * context does the same without the fade, because a lost canvas has nothing
 * to fade.
 * ========================================================================= */

import { T, LOOK, FLY, CLOUDS, SKY_RGB, LOGO, RENDER_DPR_MAX } from "./timing";
import { Renderer, type QuadConstants, type QuadState } from "./gl";
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

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeIn = (t: number, k: number) => Math.pow(t, k);

/** `#f4f1ea` to [0..1] rgb. The paper token, read from the stylesheet. */
function paperRgb(): [number, number, number] {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--paper")
    .trim();
  const m = /^#([0-9a-f]{6})$/i.exec(raw);
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1] ?? "ffffff", 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Loaded AND decoded. onload fires when the bytes are in, not when the pixels
 * are, and handing an undecoded image to texImage2D makes the upload decode
 * it synchronously on the main thread. On software GL under Lighthouse that
 * showed up as three long tasks of about 300ms, one per texture, in one run
 * out of five. decode() does the same work off the main thread first, and the
 * upload is then a copy.
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
  if (!handoff || !root || !logo || !lockup) return bail();

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
    let t0 = -1;
    let last = 0;
    let started = false;
    const pool = new CloudPool(CLOUDS.COUNT);
    const constants: QuadConstants = {
      plateAspect: 16 / 9,
      vp: VP_SCREEN,
      farFollow: LOOK.FAR_FOLLOW,
      barrel: LOOK.BARREL,
      vignette: LOOK.VIGNETTE,
      sky: [SKY_RGB[0] / 255, SKY_RGB[1] / 255, SKY_RGB[2] / 255],
      bone: paperRgb(),
      focal: CLOUDS.FOCAL,
    };
    const state: QuadState = {
      shift: [0, 0],
      roll: 0,
      zoom: LOOK.OVERSCAN,
      scaleSky: 1,
      scaleNear: 1,
      nearFade: 0,
      lift: 0,
      streak: 0,
    };

    // pointer, in -1..1, lerped
    let ptx = 0;
    let pty = 0;
    let px = 0;
    let py = 0;
    let pointerSeen = -1;
    const onMove = (e: PointerEvent) => {
      ptx = (e.clientX / innerWidth) * 2 - 1;
      pty = 1 - (e.clientY / innerHeight) * 2;
      if (pointerSeen < 0) pointerSeen = performance.now();
    };

    // the lockup's two boxes
    let logoStage = 0; // 0 not started, 1 in, 2 travelling, 3 handing off
    const animations: Animation[] = [];

    canvas.className = "intro-canvas";
    root.prepend(canvas);
    lockup.src = "/brand/lockup-charcoal.svg";

    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, RENDER_DPR_MAX);
      renderer.resize(
        Math.round(innerWidth * dpr),
        Math.round(innerHeight * dpr),
      );
    };

    const teardown = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      for (const a of animations) a.cancel();
      for (const t of INPUTS)
        window.removeEventListener(t, onInput, INPUT_OPTS);
      window.removeEventListener("pointermove", onMove);
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

    const onInput = () => skip();
    const INPUTS = [
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
      "scroll",
    ] as const;
    const INPUT_OPTS = { passive: true, capture: true } as const;
    for (const t of INPUTS) window.addEventListener(t, onInput, INPUT_OPTS);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", size);
    canvas.addEventListener("webglcontextlost", onLost);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onReduce = () => {
      if (reduce?.matches) teardown();
    };
    reduce?.addEventListener("change", onReduce);

    /* --- the lockup ------------------------------------------------------ */

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
      const k = heroW / box.width;
      const heroH = box.height * k;
      const dx = innerWidth / 2 - heroW / 2 - box.left;
      const dy = innerHeight / 2 - heroH / 2 - box.top;
      const at = (s: number) =>
        `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${(k * s).toFixed(4)})`;
      logo.style.opacity = "1";
      const a = lockup.animate(
        [
          { opacity: 0, transform: at(LOGO.SCALE_IN) },
          {
            opacity: 1,
            transform: at(1),
            offset: T.LOGO_FADE_IN / (T.LOGO_HOLD_END - T.FLY_END),
          },
          { opacity: 1, transform: at(1) },
        ],
        {
          duration: T.LOGO_HOLD_END - T.FLY_END,
          easing: "ease-out",
          fill: "forwards",
        },
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
      if (t0 < 0) {
        t0 = now;
        last = now;
      }
      const t = now - t0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ts = t / 1000;

      // stage 1: the look around, decaying as the fly begins
      const look = 1 - smooth(T.LOOK_END, T.LOOK_END + T.FLY_RAMP, t);
      const influence =
        pointerSeen < 0 ? 0 : smooth(0, T.POINTER_EASE_IN, now - pointerSeen);
      px += (ptx - px) * LOOK.POINTER_LERP;
      py += (pty - py) * LOOK.POINTER_LERP;
      const ptrAmp = LOOK.CEILING * LOOK.POINTER_WEIGHT * influence;
      let sx =
        LOOK.IDLE_AMP * Math.sin(TAU * LOOK.IDLE_HZ_X * ts) + px * ptrAmp;
      let sy =
        LOOK.IDLE_AMP * 0.7 * Math.sin(TAU * LOOK.IDLE_HZ_Y * ts + 1.1) +
        py * ptrAmp * 0.7;
      const len = Math.hypot(sx, sy);
      if (len > LOOK.CEILING) {
        sx *= LOOK.CEILING / len;
        sy *= LOOK.CEILING / len;
      }
      state.shift = [sx * look, sy * look];
      state.roll =
        ((LOOK.ROLL_DEG * Math.PI) / 180) *
        Math.sin(TAU * LOOK.ROLL_HZ * ts + 2.0) *
        look;
      state.zoom =
        LOOK.OVERSCAN *
        (1 + LOOK.BREATHE * Math.sin(TAU * LOOK.BREATHE_HZ * ts));

      // stage 2: the fly
      const fp = clamp01((t - T.LOOK_END) / (T.FLY_END - T.LOOK_END));
      state.scaleSky = 1 + (FLY.SKY_SCALE_END - 1) * easeIn(fp, FLY.SKY_CURVE);
      state.scaleNear =
        1 + (FLY.NEAR_SCALE_END - 1) * easeIn(fp, FLY.NEAR_CURVE);
      state.nearFade = smooth(T.LOOK_END, T.CABIN_GONE, t);
      state.lift = smooth(T.SKY_LIFT_START, T.SKY_LIFT_END, t);
      state.streak =
        FLY.STREAK *
        Math.sin(
          Math.PI *
            clamp01((t - T.STREAK_START) / (T.STREAK_END - T.STREAK_START)),
        );

      renderer.drawQuad(constants, state);

      if (t >= T.LOOK_END && renderer.hasAtlas()) {
        const ramp = smooth(T.LOOK_END, T.LOOK_END + T.FLY_RAMP, t);
        const alpha = ramp * (1 - smooth(0.45, 0.95, state.lift));
        pool.update(dt, CLOUDS.SPEED * ramp);
        if (alpha > 0)
          renderer.drawClouds(constants, pool.buffer, pool.write(alpha));
      }

      // stage 3 begins on the clock; stages 3 and 4 run on the Web Animations
      // API from there, and the canvas just keeps showing paper underneath
      if (t >= T.FLY_END && logoStage === 0) {
        root.style.background = "var(--paper)";
        startLogo();
      }
      // belt and braces: the WAAPI chain ends the intro, and if a backgrounded
      // tab ever drops an onfinish, the clock does
      if (t > T.TOTAL + 600) teardown();
    };

    /* --- assets, staggered ----------------------------------------------- */

    size();
    const plate = loadImage(src);
    const depth = loadImage("/intro/sky-desktop-depth.webp");
    const atlas = loadImage("/intro/clouds.webp");

    const begin = () => {
      if (started || done) return;
      started = true;
      raf = requestAnimationFrame(frame);
    };

    // The plate and the depth map on separate frames, each an upload of a few
    // megabytes; the atlas afterwards, since nothing draws it for 1.3 seconds.
    plate
      .then((img) => {
        constants.plateAspect = img.naturalWidth / img.naturalHeight;
        renderer.setPlate(img);
        return depth;
      })
      .then((img) => {
        requestAnimationFrame(() => {
          if (done) return;
          renderer.setDepth(img);
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
