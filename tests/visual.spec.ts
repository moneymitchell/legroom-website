import { test, expect, type Page } from "@playwright/test";

/**
 * Visual regression and behaviour.
 *
 * The pixel comparison against the handoff PNGs lives in
 * scripts/compare-reference.mjs, which reports a diff percentage per section
 * and is what the 0.8% gate is measured with. This file covers the things a
 * screenshot cannot assert: that the canvases exist and have real dimensions,
 * that the button physics actually move, that the deck scrolls and snaps, and
 * that no breakpoint introduces a horizontal scrollbar.
 */

const BREAKPOINTS = [
  { name: "1920", width: 1920, height: 1080 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
];

/**
 * Walk the page (and the founder rail, which is its own scroll container) so
 * every lazy image starts loading, then wait for them with a ceiling.
 *
 * The ceiling matters: the second founder photo lives 724px down inside the
 * rail, so with the rail at rest it is never near the viewport and decode()
 * on it would otherwise never settle.
 */
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.evaluate(async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const rail = document.querySelector<HTMLElement>(".rail");
    const railBehavior = rail?.style.scrollBehavior;
    if (rail) rail.style.scrollBehavior = "auto";

    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await wait(30);
    }
    if (rail) {
      rail.scrollTop = rail.scrollHeight;
      await wait(60);
      rail.scrollTop = 0;
      await wait(60);
      rail.style.scrollBehavior = railBehavior ?? "";
    }
    window.scrollTo(0, 0);

    await Promise.all(
      [...document.images].map((i) =>
        i.complete
          ? Promise.resolve()
          : Promise.race([i.decode().catch(() => {}), wait(3000)]),
      ),
    );
  });
}

test.describe("layout", () => {
  for (const bp of BREAKPOINTS) {
    test(`no horizontal overflow at ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto("/");
      await settle(page);

      const { scrollWidth, clientWidth, offenders } = await page.evaluate(() => {
        const doc = document.documentElement;
        const bad: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>("body *")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // an element may legitimately bleed if an ancestor clips it
          let clipped = false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            if (getComputedStyle(p).overflowX !== "visible") {
              clipped = true;
              break;
            }
          }
          if (!clipped && r.right > doc.clientWidth + 1) {
            bad.push(`${el.tagName.toLowerCase()}.${el.className || "(no class)"} right=${Math.round(r.right)}`);
          }
        }
        return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders: bad.slice(0, 5) };
      });

      expect(offenders, `elements past the right edge at ${bp.name}`).toEqual([]);
      expect(scrollWidth, `document scrolls horizontally at ${bp.name}`).toBeLessThanOrEqual(
        clientWidth + 1,
      );
    });
  }

  test("section heights match the measured design at 1440", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    // Frame sizes from HANDOFF.md. The CTA section is measured together with
    // the footer, which the reference board wrapped in the same frame.
    const expected: Record<string, number> = {
      "header.hero": 836,
      "#breakdown": 1055,
      "section.band": 498,
      "[aria-labelledby='promise-title']": 796,
      "section.brk": 468,
    };
    for (const [sel, want] of Object.entries(expected)) {
      const h = await page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().height);
      expect(Math.abs(h - want), `${sel} is ${h.toFixed(1)}, expected ~${want}`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("slitscan canvases", () => {
  test("both exist, are sized, and are hidden from assistive tech", async ({ page }) => {
    await page.goto("/");
    await settle(page);

    const canvases = page.locator("canvas[data-slitscan]");
    await expect(canvases).toHaveCount(2);

    for (const variant of ["light", "dark"]) {
      const cv = page.locator(`canvas[data-slitscan="${variant}"]`);
      await expect(cv).toHaveAttribute("aria-hidden", "true");
      const box = await cv.evaluate((el: HTMLCanvasElement) => ({
        cssW: el.getBoundingClientRect().width,
        cssH: el.getBoundingClientRect().height,
        bufW: el.width,
        bufH: el.height,
      }));
      expect(box.cssW, `${variant} canvas has no width`).toBeGreaterThan(0);
      expect(box.cssH, `${variant} canvas has no height`).toBeGreaterThan(0);
      // backing store is sized to DPR, capped at 2
      expect(box.bufW).toBeGreaterThanOrEqual(Math.round(box.cssW));
      expect(box.bufW).toBeLessThanOrEqual(Math.round(box.cssW * 2) + 2);
    }
  });

  test("paints something once it is on screen", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    // the loop is paused while the canvas is off screen, which is the point
    await page.locator("section.brk").scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const painted = await page.locator('canvas[data-slitscan="dark"]').evaluate(
      (el: HTMLCanvasElement) => {
        const ctx = el.getContext("2d");
        if (!ctx) return 0;
        const { data } = ctx.getImageData(0, 0, el.width, Math.min(el.height, 200));
        let lit = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) lit++;
        return lit;
      },
    );
    expect(painted, "the dark slitscan drew no pixels").toBeGreaterThan(0);
  });

  test("reduced motion draws one frame and stops the loop", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    // count rAF callbacks after load: a stopped loop schedules none of its own
    await page.addInitScript(() => {
      (window as unknown as { __raf: number }).__raf = 0;
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => {
        (window as unknown as { __raf: number }).__raf++;
        return orig(cb);
      };
    });
    await page.goto("/");
    await settle(page);
    const first = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
    await page.waitForTimeout(700);
    const second = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
    // a running 60fps loop would add ~40 frames in 700ms
    expect(second - first, "the slitscan loop is still running under reduced motion").toBeLessThan(8);

    const painted = await page.locator('canvas[data-slitscan="dark"]').evaluate((el: HTMLCanvasElement) => {
      const c = el.getContext("2d");
      if (!c) return 0;
      const { data } = c.getImageData(0, 0, el.width, Math.min(el.height, 200));
      let lit = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) lit++;
      return lit;
    });
    expect(painted, "reduced motion should still paint the single static frame").toBeGreaterThan(0);
    await ctx.close();
  });
});

test.describe("button physics", () => {
  test("primary button lifts on hover and bottoms out on press", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const btn = page.locator(".btn-y").first();

    const read = () =>
      btn.evaluate((el) => {
        const cs = getComputedStyle(el);
        const m = new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform);
        return { y: Math.round(m.m42), shadow: cs.boxShadow, bg: cs.backgroundColor };
      });

    const rest = await read();
    expect(rest.y, "button should sit at 0 at rest").toBe(0);
    expect(rest.shadow, "rest base should be 5px charcoal").toContain("0px 5px 0px 0px");

    await btn.hover();
    await page.waitForTimeout(180);
    const hover = await read();
    expect(hover.y, "button should lift 2px on hover").toBe(-2);
    expect(hover.shadow, "hover base should grow to 7px").toContain("0px 7px 0px 0px");
    expect(hover.bg, "face should brighten to #FFD230 on hover").toBe("rgb(255, 210, 48)");

    await page.mouse.down();
    await page.waitForTimeout(180);
    const active = await read();
    await page.mouse.up();
    expect(active.y, "button should travel the full 5px down on press").toBe(5);
    expect(active.shadow, "base should collapse to 0 on press").toContain("0px 0px 0px 0px");
  });

  test("the sharpie highlight paints behind the text, not on top of it", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const hl = page.locator("h1 .hl").first();
    const info = await hl.evaluate((el) => {
      const svg = el.querySelector("svg")!;
      const wrap = getComputedStyle(el);
      const mark = getComputedStyle(svg);
      const r = svg.getBoundingClientRect();
      return {
        wrapZ: wrap.zIndex,
        markZ: mark.zIndex,
        blend: mark.mixBlendMode,
        transform: mark.transform,
        w: r.width,
        h: r.height,
      };
    });
    // z-index:0 on the wrapper is what keeps the z-index:-1 child from
    // disappearing behind the section background
    expect(info.wrapZ).toBe("0");
    expect(info.markZ).toBe("-1");
    expect(info.blend).toBe("multiply");
    expect(info.w).toBeGreaterThan(0);
    expect(info.h).toBeGreaterThan(0);
  });
});

test.describe("founder deck", () => {
  test("dots are wired to the rail's scroll timeline", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const wiring = await page.evaluate(() => {
      const deck = document.querySelector(".deck") as HTMLElement;
      const rail = document.querySelector(".rail") as HTMLElement;
      const dots = [...document.querySelectorAll(".sdot")] as HTMLElement[];
      return {
        // without timeline-scope on the grid parent the dots never animate
        scope: getComputedStyle(deck).getPropertyValue("timeline-scope").trim(),
        railTimeline: getComputedStyle(rail).getPropertyValue("scroll-timeline").trim(),
        dotTimelines: dots.map((d) => getComputedStyle(d).animationTimeline),
        dotNames: dots.map((d) => getComputedStyle(d).animationName),
      };
    });
    expect(wiring.scope, "timeline-scope: --deck is missing from the grid parent").toBe("--deck");
    expect(wiring.railTimeline).toContain("--deck");
    expect(wiring.dotTimelines).toEqual(["--deck", "--deck"]);
    expect(wiring.dotNames).toEqual(["dotA", "dotB"]);
  });

  test("scrolling the rail moves the dots", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const before = await page.locator(".sdot.d2").evaluate((d) => getComputedStyle(d).backgroundColor);
    await page.locator(".rail").evaluate((r) => {
      r.style.scrollBehavior = "auto";
      r.scrollTop = r.scrollHeight;
    });
    await page.waitForTimeout(400);
    const after = await page.locator(".sdot.d2").evaluate((d) => getComputedStyle(d).backgroundColor);
    expect(after, "the second dot never changed as the rail scrolled").not.toBe(before);
  });

  test("is reachable and operable from the keyboard", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const rail = page.locator("#founder-rail");
    await expect(rail).toHaveAttribute("tabindex", "0");
    await expect(rail).toHaveAttribute("role", "region");

    await rail.focus();
    const start = await rail.evaluate((r) => r.scrollTop);
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(500);
    const moved = await rail.evaluate((r) => r.scrollTop);
    expect(moved, "keyboard scrolling did not move the deck").toBeGreaterThan(start);

    // the dots are real links to their cards, so they work without script too
    const dots = page.locator(".sdot");
    await expect(dots).toHaveCount(2);
    for (const dot of await dots.all()) {
      await expect(dot).toHaveAttribute("href", /#founder-\d/);
      expect((await dot.getAttribute("aria-label")) ?? "").not.toBe("");
    }
  });

  test("founder photos load, on Manila and not white", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const pics = page.locator(".pic");
    await expect(pics).toHaveCount(2);
    for (const pic of await pics.all()) {
      const info = await pic.evaluate((el) => {
        const img = el.querySelector("img") as HTMLImageElement;
        return {
          bg: getComputedStyle(el).backgroundColor,
          loaded: img.complete && img.naturalWidth > 0,
          natural: img.naturalWidth,
          alt: img.alt,
        };
      });
      expect(info.loaded, "a founder photo failed to load").toBe(true);
      expect(info.natural).toBeGreaterThan(300);
      // Manila #EAE5DA, never white
      expect(info.bg).toBe("rgb(234, 229, 218)");
      expect(info.alt.length).toBeGreaterThan(3);
    }
  });
});

test.describe("client logo ghosts", () => {
  test("each ghost keeps its own scale", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const widths = await page.locator(".wk .ghost").evaluateAll((els) =>
      els.map((e) => (e as HTMLElement).style.width),
    );
    // the four source files differ in aspect ratio by ~5x; one value ruins two
    expect(widths).toEqual(["168%", "210%", "150%", "160%"]);
    expect(new Set(widths).size, "ghost scales were collapsed into one value").toBe(4);
  });
});

test.describe("nothing animates on scroll", () => {
  test("no scroll-reveal animations are attached to sections", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const animated = await page.evaluate(() =>
      [...document.querySelectorAll("section, .card, .wk, .step")]
        .filter((el) => {
          const a = getComputedStyle(el).animationName;
          return a && a !== "none";
        })
        .map((el) => el.className),
    );
    expect(animated, "the design has no scroll-reveal; something is animating").toEqual([]);
  });
});
