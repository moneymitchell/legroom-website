import { test, expect } from "@playwright/test";
import { SPOTS_OPEN, spots, spotsMonth } from "../src/content/site";

/**
 * The scarcity chip.
 *
 * "2 SPOTS OPEN · SEPTEMBER" shipped on 15 September 2026 as a typed string,
 * in three places, with the month hard-coded. Fifteen days later it would have
 * been a lie on every page view. Now the count lives in one place and the
 * month is derived, and this is what keeps it that way.
 *
 * These run against the static build, so they see the BUILD-TIME month. The
 * Worker rewrites [data-month] again on every request (worker/index.ts,
 * freshenMonth); that path is exercised against the deployed site, not here.
 */

test("the month is derived, in Pacific time", () => {
  // 03:00 UTC on 1 October is 20:00 on 30 September in Los Angeles. A build
  // at that moment must still say September.
  expect(spotsMonth(new Date("2026-10-01T03:00:00Z"))).toBe("September");
  expect(spotsMonth(new Date("2026-10-01T08:00:00Z"))).toBe("October");
  expect(spots.month).toBe(spotsMonth());
});

test("every chip on the homepage carries the one count and the current month", async ({
  page,
}) => {
  await page.goto("/");
  const chips = page.locator(".chip");
  const texts = (await chips.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  expect(texts.length).toBeGreaterThanOrEqual(3);

  const label = `${SPOTS_OPEN} spots open`;
  for (const text of texts) {
    // The chip is uppercased by CSS; innerText reports it as rendered.
    expect(text.toLowerCase()).toContain(label.toLowerCase());
  }

  const months = await page.locator("[data-month]").allInnerTexts();
  expect(months.length).toBe(2);
  for (const m of months) {
    expect(m.trim().toLowerCase()).toBe(spotsMonth().toLowerCase());
  }
});

test("the founders section has no link that goes nowhere", async ({ page }) => {
  await page.goto("/");
  const dead = page.locator('#who-we-are a[href="#"]');
  expect(await dead.count()).toBe(0);
});

test("no design canvas label is in the rendered page", async ({ page }) => {
  await page.goto("/");
  const html = (await page.content()).toLowerCase();
  expect(html).not.toContain("illustration slot");
});
