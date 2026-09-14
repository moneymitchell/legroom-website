import { test, expect, devices } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

/**
 * ============================================================================
 * The first-visit intro overlay.
 *
 * playwright.config.ts gives EVERY other test a storageState that marks the
 * visitor as returning, so the intro never runs underneath a test that is
 * trying to click a button. This file is the exception: it clears the key on
 * purpose and drives the thing.
 *
 * Every context here is built by hand from the `browser` fixture rather than
 * using the page fixture, because each case needs a different starting state:
 * empty storage, seeded storage, reduced motion, a phone, a dense display.
 * ========================================================================= */

/** Empty storage, so the gate sees a first visit. */
const firstVisit = { storageState: { cookies: [], origins: [] } };

/** Everything the intro fetches, so a test can prove none of it was fetched. */
const INTRO_ASSET = /\/intro\/|\/intro\..*\.js|lockup-charcoal/;

async function newVisitor(
  browser: Browser,
  extra: Record<string, unknown> = {},
) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...firstVisit,
    ...extra,
  });
  const page = await ctx.newPage();
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, requests, errors };
}

const introState = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.intro ?? "(none)");

test("a first visit plays the intro and then gets out of the way", async ({
  browser,
}) => {
  const { ctx, page, errors } = await newVisitor(browser);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  expect(await introState(page)).toBe("run");
  await expect(page.locator("[data-intro-overlay]")).toBeVisible();

  // The homepage is LIVE underneath from the first frame. The overlay is an
  // overlay, not a gate in front of an empty page.
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator('[data-cta="hero-primary"]')).toHaveAttribute(
    "href",
    /^https:\/\/cal\.com\//,
  );

  await page.waitForFunction(
    () => document.documentElement.dataset.intro === "done",
    null,
    {
      timeout: 8000,
    },
  );
  await expect(page.locator("[data-intro-overlay]")).toHaveCount(0);
  expect(errors, errors.join("; ")).toHaveLength(0);
  await ctx.close();
});

test("the plate actually decodes, it is not just requested", async ({
  browser,
}) => {
  // The regression this exists for: the dense tier was once named "@2x", and
  // Cloudflare's asset server answers a path containing @ with a 307 to the
  // percent-encoded form. The request was made and logged, the preload never
  // matched the img, and the intro played over a flat blue rectangle on every
  // retina device. Asserting on the request would have passed.
  for (const [label, opts] of [
    ["1x desktop", {}],
    ["2x desktop", { deviceScaleFactor: 2 }],
    ["phone", { ...devices["Pixel 7"], viewport: { width: 412, height: 839 } }],
  ] as const) {
    const { ctx, page } = await newVisitor(browser, opts);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const plate = page.locator("[data-intro-plate]");
    await expect(plate, label).toHaveAttribute("src", /\/intro\/sky-/);
    await page.waitForFunction(
      () => {
        const p =
          document.querySelector<HTMLImageElement>("[data-intro-plate]");
        return !!p && p.complete && p.naturalWidth > 0;
      },
      null,
      { timeout: 8000 },
    );
    const natural = await plate.evaluate(
      (p: HTMLImageElement) => p.naturalWidth,
    );
    expect(natural, `${label} decoded to nothing`).toBeGreaterThan(0);
    await ctx.close();
  }
});

test("a returning visitor gets the intro and downloads none of it", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));

  // The config's default storageState already marks this context as returning.
  await page.goto("/", { waitUntil: "networkidle" });

  expect(await introState(page)).toBe("(none)");
  const overlay = page.locator("[data-intro-overlay]");
  if ((await overlay.count()) > 0) await expect(overlay).toBeHidden();

  const paid = requests.filter((u) => INTRO_ASSET.test(u));
  expect(paid, `returning visitor downloaded ${paid.join(", ")}`).toHaveLength(
    0,
  );
  await ctx.close();
});

test("reduced motion skips the whole thing, and does not spend the first visit", async ({
  browser,
}) => {
  const { ctx, page, requests } = await newVisitor(browser, {
    reducedMotion: "reduce",
  });
  await page.goto("/", { waitUntil: "networkidle" });

  expect(await introState(page)).toBe("(none)");
  const overlay = page.locator("[data-intro-overlay]");
  if ((await overlay.count()) > 0) await expect(overlay).toBeHidden();

  const paid = requests.filter((u) => INTRO_ASSET.test(u));
  expect(paid, `reduced motion downloaded ${paid.join(", ")}`).toHaveLength(0);

  // The flag is checked AFTER reduced motion, so turning the setting off later
  // still leaves a first visit to have.
  expect(
    await page.evaluate(() => localStorage.getItem("lg.intro.seen")),
  ).toBeNull();
  await ctx.close();
});

for (const [label, act] of [
  ["Escape", (p: Page) => p.keyboard.press("Escape")],
  ["any key", (p: Page) => p.keyboard.press("a")],
  ["a click", (p: Page) => p.mouse.click(700, 400)],
  ["a scroll", (p: Page) => p.mouse.wheel(0, 120)],
] as const) {
  test(`${label} ends the intro immediately`, async ({ browser }) => {
    const { ctx, page } = await newVisitor(browser);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.documentElement.dataset.intro === "run",
    );
    await page.waitForTimeout(600);

    const t0 = Date.now();
    await act(page);
    await page.waitForFunction(
      () => document.documentElement.dataset.intro === "done",
      null,
      {
        timeout: 3000,
      },
    );
    // Cleanly, not by jumping: there is a short fade, and then it is gone.
    // Well inside the 2.9s of timeline that was still to come.
    expect(Date.now() - t0).toBeLessThan(900);
    await expect(page.locator("[data-intro-overlay]")).toHaveCount(0);
    await ctx.close();
  });
}

test("the intro is the homepage only", async ({ browser }) => {
  const { ctx, page } = await newVisitor(browser);
  for (const path of ["/contact", "/thanks", "/404"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(await introState(page), `${path} mounted the gate`).toBe("(none)");
    await expect(page.locator("[data-intro-overlay]"), path).toHaveCount(0);
  }
  await ctx.close();
});
