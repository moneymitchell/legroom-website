import { test, expect, devices, chromium } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  statSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { FENCED_FILES, stripFences } from "../scripts/check-intro-csp.mjs";

/**
 * ============================================================================
 * The first visit intro.
 *
 * playwright.config.ts gives EVERY other test a storageState that marks the
 * visitor as returning, so the intro never runs underneath a test that is
 * trying to click a button. This file is the exception: it clears the key on
 * purpose and drives the thing.
 *
 * Every non negotiable in the brief has a test here, and each one asserts on
 * the thing that matters rather than on a proxy: that the plate DECODED, not
 * that it was requested; that a returning visitor fetched zero intro bytes,
 * counted; that the INTRO=off build is byte identical to the tag, hashed.
 * ========================================================================= */

// ESM: this package is "type": "module", so there is no __dirname here.
const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * ONE WEBGL SCENE AT A TIME. The config is fullyParallel, which is right for
 * the rest of the suite and wrong for this file: six SwiftShader contexts
 * each rendering a full viewport shader at once starve the software GPU
 * process until Chrome starts losing contexts, and a lost context is exactly
 * what the intro treats as "skip to the homepage". Seven tests then failed
 * for doing the right thing. Sequential in one worker; the rest of the suite
 * runs in parallel around it.
 */
test.describe.configure({ mode: "default" });

/**
 * AND ON THE REAL GPU WHERE THERE IS ONE. Playwright's default browser is the
 * headless shell with SwiftShader, so every WebGL frame is shaded on the CPU:
 * a full viewport at 1440x900 with ten texture taps a pixel, for 4.6 seconds
 * a test, while seven other workers try to run the rest of the suite on the
 * same cores. That starved the site's own canvas tests into failing and, at
 * its worst, crashed browser processes outright. On a Mac, the full Chromium
 * build renders through Metal and the intro costs the CPU nothing; anywhere
 * else, software GL, which is what CI has anyway.
 */
let hw: Browser;
test.beforeAll(async () => {
  const mac = process.platform === "darwin";
  hw = await chromium.launch({
    channel: mac ? "chromium" : undefined,
    args: mac ? ["--use-angle=metal", "--ignore-gpu-blocklist"] : [],
  });
});
test.afterAll(async () => {
  await hw?.close();
});
const firstVisit = { storageState: { cookies: [], origins: [] } };

/** What the intro fetches that the homepage would not: its assets and its chunk. */
const INTRO_ASSET = /\/intro\/|_astro\/intro\.[\w-]+\.js/;

async function visitor(browser: Browser, extra: Record<string, unknown> = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...firstVisit,
    ...extra,
  });
  const page = await ctx.newPage();
  const requests: string[] = [];
  const bytes = { intro: 0, all: 0 };
  const errors: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("response", async (r) => {
    let n = 0;
    try {
      n = (await r.body()).length;
    } catch {
      /* redirects and aborted bodies count as zero */
    }
    bytes.all += n;
    if (INTRO_ASSET.test(r.url())) bytes.intro += n;
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, requests, bytes, errors };
}

const state = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.intro ?? "(none)");
const overlayHidden = async (page: Page) => {
  const n = page.locator("[data-intro-overlay]");
  return (await n.count()) === 0 || (await n.isHidden());
};

/* --- it plays, and the page under it is real ------------------------------ */

test("a first visit on a desktop lands on the still, and the still waits", async () => {
  const { ctx, page, errors } = await visitor(hw);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(await state(page)).toBe("run");
  await expect(page.locator("[data-intro-overlay]")).toBeVisible();

  // live underneath from the first frame: real headline, real booking link
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator('[data-cta="hero-primary"]')).toHaveAttribute(
    "href",
    /^https:\/\/cal\.com\//,
  );

  // the still: the sign, the lockup, the canvas the gate created, focus on the sign
  const sign = page.locator("[data-intro-cta]");
  await expect(sign).toBeVisible();
  await expect(sign).toHaveText(/let's go!/i);
  await expect(page.locator("[data-intro-hero]")).toBeVisible();
  await expect(page.locator("[data-intro-overlay] canvas")).toHaveCount(1);
  await expect(sign).toBeFocused();

  // and it WAITS. Nothing launches without the visitor.
  await page.waitForTimeout(2600);
  expect(await state(page)).toBe("run");
  expect(errors, errors.join("; ")).toHaveLength(0);
  await ctx.close();
});

test("the sign launches the flight, which hands off to the page", async () => {
  const { ctx, page, errors } = await visitor(hw);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => !!document.querySelector("[data-intro-overlay] canvas"),
    null,
    { timeout: 10000 },
  );
  await page.locator("[data-intro-cta]").click();
  await page.waitForFunction(
    () => document.documentElement.dataset.intro === "fly",
    null,
    { timeout: 2000 },
  );
  await page.waitForFunction(
    () => document.documentElement.dataset.intro === "done",
    null,
    { timeout: 6000 },
  );
  await expect(page.locator("[data-intro-overlay]")).toHaveCount(0);
  await expect(page.locator("h1")).toBeVisible();
  expect(errors, errors.join("; ")).toHaveLength(0);
  await ctx.close();
});

test("Enter on the focused sign is the same launch from the keyboard", async () => {
  const { ctx, page } = await visitor(hw);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => !!document.querySelector("[data-intro-overlay] canvas"),
    null,
    { timeout: 10000 },
  );
  await expect(page.locator("[data-intro-cta]")).toBeFocused();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => document.documentElement.dataset.intro === "fly",
    null,
    { timeout: 2000 },
  );
  await page.waitForFunction(
    () => document.documentElement.dataset.intro === "done",
    null,
    { timeout: 6000 },
  );
  await ctx.close();
});

test("the lockup lands on the nav's own box, measured", async () => {
  const { ctx, page } = await visitor(hw);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => !!document.querySelector("[data-intro-overlay] canvas"),
    null,
    { timeout: 10000 },
  );
  await page.locator("[data-intro-cta]").click();
  // The landed state is the lockup's own layout box with the identity
  // transform. Both halves are checked directly rather than by catching the
  // 120ms dissolve on a polled screenshot: the box the module laid the
  // element out in when the beat began must be the nav lockup's box to the
  // pixel, and the travel animation's final keyframe must be transform: none,
  // so that box is where it ends.
  const landed = await page.waitForFunction(
    () => {
      const l = document.querySelector<HTMLElement>("[data-intro-lockup]");
      const n = document.querySelector("nav.nav .brand img");
      if (!l || !n || !l.style.width) return null;
      const travel = l.getAnimations().find((a) => {
        const kf = (a.effect as KeyframeEffect).getKeyframes();
        return kf.length > 0 && kf[kf.length - 1]!.transform === "none";
      });
      if (!travel) return null;
      const b = n.getBoundingClientRect();
      return {
        laidOut: [
          parseFloat(l.style.left),
          parseFloat(l.style.top),
          parseFloat(l.style.width),
          parseFloat(l.style.height),
        ],
        nav: [b.left, b.top, b.width, b.height],
      };
    },
    null,
    { timeout: 9000, polling: 50 },
  );
  const { laidOut, nav } = (await landed.jsonValue()) as {
    laidOut: number[];
    nav: number[];
  };
  for (let i = 0; i < 4; i++)
    expect(Math.abs(laidOut[i]! - nav[i]!), `edge ${i}`).toBeLessThan(1);
  await ctx.close();
});

/* --- who gets it, and who does not ---------------------------------------- */

test("a returning visitor gets no intro and downloads zero intro bytes", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  }); // config: returning
  const page = await ctx.newPage();
  const hits: string[] = [];
  let introBytes = 0;
  page.on("response", async (r) => {
    if (INTRO_ASSET.test(r.url())) {
      hits.push(r.url());
      try {
        introBytes += (await r.body()).length;
      } catch {}
    }
  });
  await page.goto("/", { waitUntil: "networkidle" });
  expect(await state(page)).toBe("(none)");
  expect(await overlayHidden(page)).toBe(true);
  expect(hits, `returning visitor fetched ${hits.join(", ")}`).toHaveLength(0);
  expect(introBytes).toBe(0);
  await ctx.close();
});

for (const [label, extra] of [
  ["reduced motion", { reducedMotion: "reduce" }],
  ["a coarse pointer", { ...devices["iPad Pro 11 landscape"] }],
  ["a window under 1024", { viewport: { width: 1000, height: 800 } }],
] as const) {
  test(`${label} skips the whole thing and does not spend the first visit`, async ({
    browser,
  }) => {
    const { ctx, page, requests } = await visitor(
      browser,
      extra as Record<string, unknown>,
    );
    await page.goto("/", { waitUntil: "networkidle" });
    expect(await state(page)).toBe("(none)");
    expect(await overlayHidden(page)).toBe(true);
    expect(requests.filter((u) => INTRO_ASSET.test(u))).toHaveLength(0);
    // the gate returns BEFORE it writes the flag, so a later visit that passes
    // every check is still a first visit
    expect(
      await page.evaluate(() => localStorage.getItem("lg.intro.seen")),
    ).toBeNull();
    await ctx.close();
  });
}

test("no WebGL2 means no intro, and no first visit spent", async ({
  browser,
}) => {
  const { ctx, page, requests } = await visitor(browser);
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...rest: unknown[]
    ) {
      if (kind === "webgl2") return null;
      return (real as (...a: unknown[]) => unknown).call(this, kind, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/", { waitUntil: "networkidle" });
  expect(await state(page)).toBe("(none)");
  expect(await overlayHidden(page)).toBe(true);
  expect(requests.filter((u) => INTRO_ASSET.test(u))).toHaveLength(0);
  expect(
    await page.evaluate(() => localStorage.getItem("lg.intro.seen")),
  ).toBeNull();
  await ctx.close();
});

test("the intro is the homepage only", async ({ browser }) => {
  const { ctx, page } = await visitor(browser);
  for (const path of ["/contact", "/thanks", "/404"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(await state(page), path).toBe("(none)");
    await expect(page.locator("[data-intro-overlay]"), path).toHaveCount(0);
  }
  await ctx.close();
});

/* --- leaving early --------------------------------------------------------- */

for (const [label, act] of [
  ["Escape", (p: Page) => p.keyboard.press("Escape")],
  ["any key", (p: Page) => p.keyboard.press("a")],
  ["a click away from the sign", (p: Page) => p.mouse.click(120, 120)],
  ["a scroll", (p: Page) => p.mouse.wheel(0, 120)],
  ["Tab off the sign", (p: Page) => p.keyboard.press("Tab")],
] as const) {
  test(`${label} ends the intro at once, and cleanly`, async () => {
    const { ctx, page } = await visitor(hw);
    // Timed from inside the page: the first input event to the moment the
    // overlay is gone. That is the visitor's experience, and it leaves out
    // Playwright's own transport and screenshot latency.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __skip: { input?: number; done?: number };
      };
      w.__skip = {};
      for (const t of ["pointerdown", "keydown", "wheel"]) {
        window.addEventListener(
          t,
          () => (w.__skip.input ??= performance.now()),
          { capture: true, once: true },
        );
      }
      new MutationObserver(() => {
        if (document.documentElement.dataset.intro === "done")
          w.__skip.done ??= performance.now();
      }).observe(document, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-intro"],
      });
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => !!document.querySelector("[data-intro-overlay] canvas"),
      null,
      { timeout: 10000 },
    );
    await page.waitForTimeout(500);
    await act(page);
    await page.waitForFunction(
      () => document.documentElement.dataset.intro === "done",
      null,
      { timeout: 5000 },
    );
    const { input, done } = await page.evaluate(
      () =>
        (window as unknown as { __skip: { input?: number; done?: number } })
          .__skip,
    );
    expect(input, "the input never reached the page").toBeDefined();
    // A short fade, not a cut.
    expect(done! - input!).toBeLessThan(1500);
    await expect(page.locator("[data-intro-overlay]")).toHaveCount(0);
    await ctx.close();
  });
}

test("Escape in the middle of the flight ends it too", async () => {
  const { ctx, page } = await visitor(hw);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => !!document.querySelector("[data-intro-overlay] canvas"),
    null,
    { timeout: 10000 },
  );
  await page.locator("[data-intro-cta]").click();
  await page.waitForFunction(
    () => document.documentElement.dataset.intro === "fly",
    null,
    { timeout: 2000 },
  );
  await page.waitForTimeout(350);
  const t0 = Date.now();
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.documentElement.dataset.intro === "done",
    null,
    { timeout: 3000 },
  );
  // well inside the 1.7 seconds that were still to come
  expect(Date.now() - t0).toBeLessThan(1500);
  await expect(page.locator("[data-intro-overlay]")).toHaveCount(0);
  await ctx.close();
});

test("a lost WebGL context skips to the homepage instead of leaving a dead canvas", async () => {
  const { ctx, page, errors } = await visitor(hw);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => !!document.querySelector("[data-intro-overlay] canvas"),
    null,
    { timeout: 10000 },
  );
  await page.locator("[data-intro-cta]").click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>(
      "[data-intro-overlay] canvas",
    )!;
    c.getContext("webgl2")!.getExtension("WEBGL_lose_context")!.loseContext();
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.intro === "done",
    null,
    { timeout: 2000 },
  );
  await expect(page.locator("[data-intro-overlay]")).toHaveCount(0);
  await expect(page.locator("h1")).toBeVisible();
  // the module says so on the console, and that is the only message allowed
  expect(errors, errors.join("; ")).toHaveLength(0);
  await ctx.close();
});

/* --- removability --------------------------------------------------------- */

const tagFile = (path: string) =>
  execFileSync("git", ["show", `pre-intro-animation:${path}`], {
    cwd: ROOT,
    encoding: "utf8",
  });

test("every fenced file strips back to its version at the tag, byte for byte", () => {
  for (const rel of FENCED_FILES) {
    const { code, blocks } = stripFences(readFileSync(join(ROOT, rel), "utf8"));
    expect(blocks, `${rel} has no INTRO fence`).toBeGreaterThan(0);
    expect(code, rel).toBe(tagFile(rel));
  }
});

/** sha256 of every file under a directory, keyed by relative path. */
function tree(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const full = join(d, e);
      if (statSync(full).isDirectory()) walk(full);
      else
        out.set(
          relative(dir, full),
          createHash("sha256").update(readFileSync(full)).digest("hex"),
        );
    }
  };
  walk(dir);
  return out;
}

test("an INTRO=off build is byte identical to a build of the tag", () => {
  test.setTimeout(240_000);
  const work = mkdtempSync(join(tmpdir(), "legroom-intro-off-"));
  const tagDir = join(work, "tag");
  const offDir = join(work, "off");
  try {
    // the tag, in its own worktree, sharing node_modules and the build env
    execFileSync(
      "git",
      ["worktree", "add", "-f", tagDir, "pre-intro-animation"],
      { cwd: ROOT, stdio: "pipe" },
    );
    symlinkSync(join(ROOT, "node_modules"), join(tagDir, "node_modules"));
    if (existsSync(join(ROOT, ".env")))
      copyFileSync(join(ROOT, ".env"), join(tagDir, ".env"));
    execFileSync("npx", ["astro", "build"], { cwd: tagDir, stdio: "pipe" });

    // this branch, with the flag off, to a directory of its own
    execFileSync("npx", ["astro", "build", "--outDir", offDir], {
      cwd: ROOT,
      stdio: "pipe",
      env: { ...process.env, INTRO: "off" },
    });

    const a = tree(join(tagDir, "dist"));
    const b = tree(offDir);
    const onlyTag = [...a.keys()].filter((k) => !b.has(k));
    const onlyOff = [...b.keys()].filter((k) => !a.has(k));
    const differ = [...a.keys()].filter(
      (k) => b.has(k) && a.get(k) !== b.get(k),
    );
    expect(onlyOff, "files only in the INTRO=off build").toEqual([]);
    expect(onlyTag, "files only in the tag build").toEqual([]);
    expect(differ, "files that differ").toEqual([]);
    expect(b.size).toBeGreaterThan(10);
  } finally {
    try {
      execFileSync("git", ["worktree", "remove", "-f", tagDir], {
        cwd: ROOT,
        stdio: "pipe",
      });
    } catch {}
    rmSync(work, { recursive: true, force: true });
  }
});
