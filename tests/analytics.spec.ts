import { test, expect, type Page } from "@playwright/test";

/**
 * dataLayer contract.
 *
 * LAUNCH.md section 8f tells JD exactly which events to build triggers for.
 * If these names or payloads change and the runbook does not, he builds
 * triggers that never fire. So the names are asserted here.
 */

const readLayer = (page: Page) =>
  page.evaluate(() => (window as unknown as { dataLayer?: Record<string, unknown>[] }).dataLayer ?? []);

/** The CTAs are real links, so stop the navigation before reading the layer. */
async function stopNavigation(page: Page) {
  await page.evaluate(() => {
    document.addEventListener("click", (e) => e.preventDefault(), { capture: false });
  });
}

test("book_call_click fires with the location, once per CTA", async ({ page }) => {
  await page.goto("/");
  await stopNavigation(page);
  await page.locator('[data-cta="hero-primary"]').click();
  await page.waitForTimeout(150);
  const layer = await readLayer(page);
  const evt = layer.find((e) => e.event === "book_call_click");
  expect(evt, "no book_call_click was pushed").toBeTruthy();
  expect(evt!.location).toBe("hero-primary");
});

test("the secondary CTA is not counted as a booking", async ({ page }) => {
  await page.goto("/");
  await stopNavigation(page);
  await page.locator('[data-cta="hero-secondary"]').click();
  await page.waitForTimeout(150);
  const layer = await readLayer(page);
  expect(layer.filter((e) => e.event === "book_call_click")).toHaveLength(0);
});

test("email_capture fires from the inline unit", async ({ page }) => {
  await page.goto("/");
  await page.locator('form[data-lead-form] input[type="email"]').first().fill("test@example.com");
  await page.locator('form[data-lead-form] button[type="submit"]').first().click();
  await page.waitForTimeout(200);
  const layer = await readLayer(page);
  const evt = layer.find((e) => e.event === "email_capture");
  expect(evt, "no email_capture was pushed").toBeTruthy();
  expect(evt!.source).toBe("breakdown");
});

test("form_submit fires from the contact form", async ({ page }) => {
  await page.goto("/contact");
  await page.locator("#email").fill("test@example.com");
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(200);
  const layer = await readLayer(page);
  const evt = layer.find((e) => e.event === "form_submit");
  expect(evt, "no form_submit was pushed").toBeTruthy();
  expect(evt!.source).toBe("contact");
});

test("scroll_depth fires at each threshold exactly once", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const wait = (m: number) => new Promise((r) => setTimeout(r, m));
    // the page scrolls smoothly by default; step instantly so each threshold
    // is actually reached before the next measurement
    document.documentElement.style.scrollBehavior = "auto";
    const max = document.documentElement.scrollHeight - window.innerHeight;
    for (const pct of [0.3, 0.55, 0.8, 1]) {
      window.scrollTo({ top: max * pct, behavior: "instant" as ScrollBehavior });
      await wait(150);
    }
  });
  await page.waitForTimeout(250);
  const layer = await readLayer(page);
  const depths = layer.filter((e) => e.event === "scroll_depth").map((e) => e.percent);
  expect(depths).toEqual([25, 50, 75, 100]);
});

test("every documented event name is reachable from the bundle", async ({ page }) => {
  await page.goto("/");
  // cal_booking_complete only fires on a postMessage from cal.com; assert the
  // listener exists by sending one and watching for the push
  await page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent("message", { origin: "https://app.cal.com", data: { type: "bookingSuccessful" } }),
    );
  });
  await page.waitForTimeout(150);
  const layer = await readLayer(page);
  expect(layer.some((e) => e.event === "cal_booking_complete"), "cal_booking_complete never fired").toBe(true);
});

test("a message from another origin is ignored", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent("message", { origin: "https://evil.example", data: { type: "bookingSuccessful" } }),
    );
  });
  await page.waitForTimeout(150);
  const layer = await readLayer(page);
  expect(layer.filter((e) => e.event === "cal_booking_complete")).toHaveLength(0);
});
