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

    /**
     * html { scroll-behavior: smooth } has to come off for the duration.
     * Every scroll below is programmatic, and with smooth on, each one is an
     * animation that outlives the call that started it. The last scrollTo(0,
     * 0) is then still in flight when settle() returns, so the caller gets a
     * page that is quietly still moving: element boxes read at a position the
     * page is only passing through, and anything hovered slides out from
     * under the cursor mid-assertion. It is put back at the end.
     */
    const root = document.documentElement;
    const rootBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";

    // The founder rail is its own scroll container, and the second card sits a
    // full card height down inside it, so it never comes near the viewport at
    // rest and its lazy image never starts loading.
    const rail = document.querySelector<HTMLElement>(".rail");
    const railBehavior = rail?.style.scrollBehavior;
    if (rail) {
      rail.style.scrollBehavior = "auto";
      for (const card of rail.querySelectorAll(".card")) {
        card.scrollIntoView({ block: "nearest" });
        await wait(220);
      }
      rail.scrollTop = 0;
      await wait(120);
      rail.style.scrollBehavior = railBehavior ?? "";
    }

    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await wait(40);
    }
    window.scrollTo(0, 0);

    // Poll rather than sleep a guessed amount: decode() on an image the
    // browser has not chosen to fetch yet never settles, so it cannot be
    // awaited directly.
    const deadline = Date.now() + 5000;
    for (;;) {
      const pending = [...document.images].filter((i) => !i.complete || i.naturalWidth === 0);
      if (pending.length === 0 || Date.now() > deadline) break;
      await wait(100);
    }

    // scrollIntoView moves the sequential focus navigation starting point, so
    // a following Tab would start from the founders section rather than the
    // top of the document. Put it back on the body.
    const body = document.body;
    body.setAttribute("tabindex", "-1");
    body.focus({ preventScroll: true });
    body.blur();
    body.removeAttribute("tabindex");

    // Land at the top for real, then hand smooth scrolling back.
    window.scrollTo(0, 0);
    root.style.scrollBehavior = rootBehavior;
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
      "header.hero": 860,
      "#breakdown": 1055,
      "section.band": 669,
      "[aria-labelledby='promise-title']": 828,
      "section.brk": 387,
    };
    for (const [sel, want] of Object.entries(expected)) {
      const h = await page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().height);
      expect(Math.abs(h - want), `${sel} is ${h.toFixed(1)}, expected ~${want}`).toBeLessThanOrEqual(1);
    }
    // The reference board for the last section wraps the CTA grid AND the
    // footer in one frame, so it is measured the same way here.
    const ctaThroughFooter = await page.evaluate(() => {
      const a = document.querySelector("#who-we-are")!.getBoundingClientRect();
      const f = document.querySelector("footer")!.getBoundingClientRect();
      return f.bottom - a.top;
    });
    expect(
      Math.abs(ctaThroughFooter - 1043),
      `CTA through footer is ${ctaThroughFooter.toFixed(1)}, expected ~1043`,
    ).toBeLessThanOrEqual(1);
  });
});

test.describe("the canvas bands", () => {
  test("both canvases exist, are sized, and are hidden from assistive tech", async ({ page }) => {
    await page.goto("/");
    await settle(page);

    // R4: two canvases, two different engines. The wordmark keeps the
    // slitscan; the hero band is the measure. One each.
    await expect(page.locator("canvas[data-slitscan]")).toHaveCount(1);
    await expect(page.locator("canvas[data-measure]")).toHaveCount(1);

    const intensities = await page
      .locator("canvas")
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.intensity));
    expect(intensities).toEqual(["1", "1.2"]);

    for (const variant of ["1", "1.2"]) {
      const cv = page.locator(`canvas[data-intensity="${variant}"]`);
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
    const painted = await page.locator('canvas[data-intensity="1.2"]').evaluate(
      (el: HTMLCanvasElement) => {
        const ctx = el.getContext("2d");
        if (!ctx) return 0;
        const { data } = ctx.getImageData(0, 0, el.width, Math.min(el.height, 200));
        let lit = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) lit++;
        return lit;
      },
    );
    expect(painted, "the wordmark slitscan drew no pixels").toBeGreaterThan(0);
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

    const painted = await page.locator('canvas[data-intensity="1.2"]').evaluate((el: HTMLCanvasElement) => {
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

test.describe("the hero measure", () => {
  /**
   * R4 replaced the hero slitscan with a ruler that stretches under the
   * pointer. Three things have to hold or it is not the component that was
   * approved: it draws without a pointer, the pointer visibly opens space and
   * lights it, and it is one static frame under reduced motion.
   */
  /**
   * These tests do NOT call settle(). settle() walks the whole page and the
   * founder rail to start lazy images, and between html { scroll-behavior:
   * smooth } and scrollIntoView on a nested scroll container it hands back a
   * page still travelling: the strip's box comes out at a negative y and every
   * mouse.move lands outside the viewport, so the pointer never engages and
   * the canvas shows a stale frame. The measure sits at the top of the hero
   * and waits on no images. It needs none of that.
   *
   * What it does need is for the engine to have started, and the engines start
   * on requestIdleCallback. So wait for ink, not for a guessed number of ms.
   */
  const ready = async (page: import("@playwright/test").Page) => {
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.waitForFunction(() => {
      const c = document.querySelector("canvas[data-measure]") as HTMLCanvasElement | null;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return false;
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 24) return true;
      return false;
    });
  };

  const sample = (page: import("@playwright/test").Page) =>
    page.locator("canvas[data-measure]").evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext("2d");
      if (!ctx) return { lit: 0, yellow: 0, spread: 0 };
      const { data, width, height } = ctx.getImageData(0, 0, el.width, el.height);
      let lit = 0;
      let yellow = 0;
      let minX = width;
      let maxX = 0;
      let topY = height;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          if (data[i + 3]! < 24) continue;
          lit++;
          if (y < topY) topY = y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          // signal yellow is red-dominant with almost no blue
          if (data[i]! > 190 && data[i + 2]! < 110) yellow++;
        }
      }
      return { lit, yellow, spread: maxX - minX, topY };
    });

  test("draws a graduated rule with no pointer anywhere near it", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const at = await sample(page);
    expect(at.lit, "the measure drew nothing at rest").toBeGreaterThan(500);
    // a rule, so it runs the full width of the band
    const w = await page
      .locator("canvas[data-measure]")
      .evaluate((el: HTMLCanvasElement) => el.width);
    expect(at.spread, "the rule does not span the band").toBeGreaterThan(w * 0.9);
    expect(at.yellow, "there is signal yellow before the pointer arrives").toBe(0);
  });

  test("the pointer opens space, lights it, and dimensions it", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const rest = await sample(page);

    const box = (await page.locator(".scanstrip").boundingBox())!;
    // One move is enough. The engine stores the target and lerps toward it on
    // its own clock, so driving 70 moves across the wire only buys round
    // trips. 0.06 per frame on strength is ~1s to come up; 1400ms is the
    // margin. Two moves, because the first from (0,0) also has to cross into
    // the band for the strength target to flip on.
    await page.mouse.move(box.x + box.width / 2, box.y + 4);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1400);
    const hot = await sample(page);

    expect(hot.yellow, "the pointer lit nothing").toBeGreaterThan(300);
    // the dimension bar sits above the tallest graduation, so the drawing
    // reaches higher into the band than it does at rest
    expect(hot.topY, "no dimension bar appeared above the graduations").toBeLessThan(rest.topY);
    expect(hot.lit, "the pointer removed ink instead of adding it").toBeGreaterThan(rest.lit);
  });

  test("reduced motion draws one still rule and starts no loop", async ({ browser }) => {
    const ctx = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto("/");
    await ready(page);

    const before = await sample(page);
    expect(before.lit, "the still frame is empty").toBeGreaterThan(500);

    // move the pointer across it: a stopped loop cannot repaint, so the frame
    // has to be byte-identical afterwards
    const box = (await page.locator(".scanstrip").boundingBox())!;
    for (let i = 0; i < 6; i++) {
      await page.mouse.move(box.x + box.width * (0.2 + i * 0.1), box.y + box.height / 2);
    }
    await page.waitForTimeout(600);
    const after = await sample(page);
    expect(after, "the measure is still animating under reduced motion").toEqual(before);
    await ctx.close();
  });

  test("it is gone once the hero stacks", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto("/");
    // The phone design has no band at all: the facts strip closes the hero.
    await expect(page.locator(".scanstrip")).toBeHidden();
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

    /**
     * Wait for the 90ms transition to finish rather than sleeping a guessed
     * amount. Reading mid-transition gives -1 instead of -2 and looks like a
     * broken button when it is really just a fast one caught halfway.
     *
     * `from` is the value the button is leaving, and it is the whole reason
     * this is reliable. Two equal reads used to be enough to call it settled,
     * but two reads taken before the hover has landed are also equal, and
     * under parallel load that happens often enough to fail the run with a
     * y of 0 on a button that works perfectly. Unchanged only counts once the
     * value has actually moved.
     */
    const settled = async (from: number) => {
      let last = await read();
      for (let i = 0; i < 25; i++) {
        await page.waitForTimeout(60);
        const next = await read();
        if (next.y !== from && next.y === last.y && next.shadow === last.shadow) return next;
        last = next;
      }
      return last;
    };

    const rest = await read();
    expect(rest.y, "button should sit at 0 at rest").toBe(0);
    expect(rest.shadow, "rest base should be 5px charcoal").toContain("0px 5px 0px 0px");

    await btn.hover();
    const hover = await settled(0);
    expect(hover.y, "button should lift 2px on hover").toBe(-2);
    expect(hover.shadow, "hover base should grow to 7px").toContain("0px 7px 0px 0px");
    expect(hover.bg, "face should brighten to #FFD230 on hover").toBe("rgb(255, 210, 48)");

    await page.mouse.down();
    const active = await settled(-2);
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
    expect(widths).toEqual(["140%", "172%", "126%", "134%"]);
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

test.describe("the sticky rail", () => {
  /**
   * R3 replaced the static ticker above the wordmark with a bar fixed to the
   * bottom of the viewport, running as a subway line: four stations, a yellow
   * line that travels between them, each station lighting as the line arrives.
   *
   * This is the minifier trap again. Lightning CSS once folded
   * `animation-timeline: --deck` into the `animation` shorthand and silently
   * killed the founder-deck dots. Seven keyframe sets driving colour on one
   * element and a transform on another element's ::after is exactly the shape
   * a minifier likes to collapse, so: assert the keyframes survive into the
   * built CSS with their percentages, and that they are actually attached.
   */
  test("all seven keyframe sets survive into the built CSS", async ({ page }) => {
    await page.goto("/");
    const css = await page.evaluate(() =>
      [...document.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n"),
    );
    for (const name of ["lit1", "lit2", "lit3", "lit4", "run1", "run2", "run3"]) {
      expect(css, `@keyframes ${name} is missing from the built CSS`).toContain(`${name}{`);
    }
    // The arrival times. Each station lights at the beat the segment before it
    // finishes filling, which is the whole reason it reads as one line moving
    // rather than four things switching on.
    for (const offset of ["8%", "30%", "52%", "74%"]) {
      expect(css, `the ${offset} arrival beat was optimised away`).toContain(offset);
    }
  });

  test("each station lights in sequence and each segment runs between them", async ({ page }) => {
    await page.goto("/");
    const wiring = await page.evaluate(() => {
      const stations = [...document.querySelectorAll(".railbar .station")] as HTMLElement[];
      const segs = [...document.querySelectorAll(".railbar .seg")] as HTMLElement[];
      return {
        stations: stations.map((el) => ({
          text: (el.textContent ?? "").trim(),
          name: getComputedStyle(el).animationName,
          duration: getComputedStyle(el).animationDuration,
          dot: getComputedStyle(el.querySelector("i") as Element).backgroundColor,
          color: getComputedStyle(el).color,
          dotRing: getComputedStyle(el.querySelector("i") as Element).boxShadow,
          dotPing: getComputedStyle(el.querySelector("i") as Element, "::after").animationName,
        })),
        segs: segs.map((el) => ({
          name: getComputedStyle(el, "::after").animationName,
          duration: getComputedStyle(el, "::after").animationDuration,
        })),
      };
    });

    expect(wiring.stations).toHaveLength(4);
    expect(wiring.stations.map((s) => s.name)).toEqual(["lit1", "lit2", "lit3", "lit4"]);
    // Three segments for four stations. A fourth would close the loop into a
    // circle, and the sequence is an argument with an end, not a cycle.
    expect(wiring.segs).toHaveLength(3);
    expect(wiring.segs.map((s) => s.name)).toEqual(["run1", "run2", "run3"]);

    for (const s of [...wiring.stations, ...wiring.segs]) {
      expect(s.duration, "not on the shared 8s loop").toBe("8s");
    }
    // `background: currentColor` on the dot is what keeps the dot and its
    // label on one animation instead of two that can drift apart.
    for (const s of wiring.stations) {
      expect(s.dot, `${s.text}: the dot is not following its label's colour`).toBe(s.color);
      // The station dot must not pick up the global .dot in tokens.css: that
      // one is the "spots open" pip, a yellow disc with an inset ring and a
      // 1.9s ping. Astro's scoping raised specificity on the properties this
      // component sets but not on the ones it does not, so the ring and the
      // ping came through and every station wore a halo blinking against the
      // 8s line. Renaming fixed it. This is the tripwire.
      expect(s.dotRing, `${s.text}: the dot picked up the global yellow ring`).toBe("none");
      expect(s.dotPing, `${s.text}: the dot is pinging on its own clock`).toBe("none");
    }
  });

  test("the labels are the four steps of the argument, in order", async ({ page }) => {
    await page.goto("/");
    const labels = await page
      .locator(".railbar .station span")
      .evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
    expect(labels).toEqual([
      "Try Legroom",
      "Measure the results",
      "Less time more money",
      "Reinvest and grow",
    ]);
  });

  test("it is pinned flush to the bottom, full width, at the asked-for opacity", async ({
    page,
  }) => {
    await page.goto("/");
    const box = await page.evaluate(() => {
      const el = document.querySelector(".railbar") as HTMLElement;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        position: cs.position,
        left: r.left,
        width: r.width,
        vw: window.innerWidth,
        bottomGap: window.innerHeight - r.bottom,
        bg: cs.backgroundColor,
        bodyPad: getComputedStyle(document.body).paddingBottom,
        height: r.height,
      };
    });
    expect(box.position).toBe("fixed");
    expect(box.left).toBe(0);
    expect(box.width).toBe(box.vw);
    expect(box.bottomGap, "the bar is not flush with the bottom edge").toBe(0);

    // The brief asked for 70 to 90 percent. Chromium reports the backdrop-filter
    // branch here, so this is the 0.78 white.
    const alpha = Number.parseFloat(box.bg.match(/rgba?\([^)]*?([\d.]+)\)$/)?.[1] ?? "1");
    expect(alpha, `background is ${box.bg}, outside the 0.7 to 0.9 the brief set`)
      .toBeGreaterThanOrEqual(0.7);
    expect(alpha).toBeLessThanOrEqual(0.9);

    // The page has to give back what the fixed bar takes, or the last rows of
    // the footer can never be scrolled out from under it.
    expect(Number.parseFloat(box.bodyPad), "the footer can never clear the bar").toBeGreaterThanOrEqual(
      box.height,
    );
  });

  test("reduced motion shows the whole line lit and still", async ({ browser }) => {
    const ctx = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto("/");
    const state = await page.evaluate(() => {
      const stations = [...document.querySelectorAll(".railbar .station")] as HTMLElement[];
      const segs = [...document.querySelectorAll(".railbar .seg")] as HTMLElement[];
      return {
        stations: stations.map((el) => ({
          name: getComputedStyle(el).animationName,
          color: getComputedStyle(el).color,
        })),
        segs: segs.map((el) => ({
          name: getComputedStyle(el, "::after").animationName,
          transform: getComputedStyle(el, "::after").transform,
        })),
      };
    });
    for (const s of state.stations) {
      expect(s.name, "a station is still animating under reduced motion").toBe("none");
      expect(s.color, "a station is not showing its lit colour").toBe("rgb(35, 34, 31)"); // --ink
    }
    for (const g of state.segs) {
      expect(g.name, "a segment is still animating under reduced motion").toBe("none");
      // scaleX(1): the line arrived and stayed. matrix(1, 0, 0, 1, 0, 0).
      expect(g.transform, "a segment is not held at its filled state").toBe("matrix(1, 0, 0, 1, 0, 0)");
    }
    await ctx.close();
  });

  test("it is gone below 768 and present at 768", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto("/");
    // A phone cannot fit four labels legibly and cannot spare the viewport.
    await expect(page.locator(".railbar")).toBeHidden();
    await page.setViewportSize({ width: 768, height: 900 });
    await expect(page.locator(".railbar")).toBeVisible();
    await ctx.close();
  });

  test("it does not swallow clicks on whatever scrolls under it", async ({ page }) => {
    await page.goto("/");
    // Nothing in the bar is interactive, so it must not win a hit test. Without
    // pointer-events: none any CTA that scrolls into the bottom 57px stops
    // responding and gives the reader no clue why.
    const caught = await page.evaluate(() => {
      const bar = document.querySelector(".railbar")!.getBoundingClientRect();
      const y = Math.round(bar.top + bar.height / 2);
      return [40, 300, 720, 1100, 1380]
        .map((x) => document.elementFromPoint(x, y))
        .filter((el) => el && el.closest(".railbar"))
        .map((el) => (el as Element).tagName);
    });
    expect(caught, "the rail is taking hits meant for the page under it").toEqual([]);
  });

  test("the old ticker is gone from the wordmark section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("section.brk .stop")).toHaveCount(0);
  });
});

test.describe("pointer-tracked button depth", () => {
  test("--tx follows the cursor across a button and settles back", async ({ page }) => {
    await page.goto("/");
    const btn = page.locator(".btn-y").first();
    const box = (await btn.boundingBox())!;

    const readTx = () => btn.evaluate((el) => el.style.getPropertyValue("--tx"));

    // left edge: --tx approaches -1
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.waitForTimeout(450);
    const left = Number(await readTx());
    expect(left, "--tx should go negative near the left edge").toBeLessThan(-0.5);

    // right edge: --tx approaches +1
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
    await page.waitForTimeout(450);
    const right = Number(await readTx());
    expect(right, "--tx should go positive near the right edge").toBeGreaterThan(0.5);

    // leaving returns it to 0, which is the straight-on shadow
    await page.mouse.move(box.x + box.width / 2, box.y - 120);
    await page.waitForTimeout(500);
    expect(Number(await readTx()), "--tx should settle back to 0 on leave").toBeCloseTo(0, 1);
  });

  test("the shadow offset actually moves with it", async ({ page }) => {
    await page.goto("/");
    const btn = page.locator(".btn-y").first();
    const box = (await btn.boundingBox())!;
    const shadow = () => btn.evaluate((el) => getComputedStyle(el).boxShadow);

    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.waitForTimeout(450);
    const atLeft = await shadow();
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
    await page.waitForTimeout(450);
    const atRight = await shadow();
    expect(atLeft, "the hard shadow did not move with the pointer").not.toBe(atRight);
  });

  test("touch never runs it, and the fallback is the straight-on shadow", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto("/");
    const tx = await page.locator(".btn-y").first().evaluate((el) => ({
      inline: el.style.getPropertyValue("--tx"),
      computed: getComputedStyle(el).getPropertyValue("--tx"),
    }));
    expect(tx.inline, "pointer-tilt ran on a touch device").toBe("");
    expect(tx.computed.trim(), "--tx should be unset, so the CSS default of 0 applies").toBe("");
    await ctx.close();
  });
});
