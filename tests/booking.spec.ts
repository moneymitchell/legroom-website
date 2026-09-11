import { test, expect } from "@playwright/test";

/**
 * The booking link is the whole conversion path. If PUBLIC_CAL_LINK is ever
 * dropped from the build environment, links.ts quietly falls back to /contact
 * and all four CTAs stop booking anything. That is exactly the failure nobody
 * notices, so it fails the build here instead.
 */

const BOOKING_CTAS = ["nav", "nav-mobile", "hero-primary", "final-primary"];

test("every booking CTA points at cal.com, none at /contact", async ({ page }) => {
  await page.goto("/");

  for (const location of BOOKING_CTAS) {
    const cta = page.locator(`[data-cta="${location}"]`);
    await expect(cta, `no CTA found for data-cta="${location}"`).toHaveCount(1);
    const href = await cta.getAttribute("href");
    expect(href, `${location} has no href`).toBeTruthy();
    expect(
      href,
      `${location} points at ${href}. PUBLIC_CAL_LINK is probably missing from the build environment.`,
    ).toMatch(/^https:\/\/cal\.com\/.+/);
    expect(href, `${location} fell back to the contact form`).not.toBe("/contact");
  }
});

test("the breakdown capture posts to the lead endpoint, not to Cal", async ({ page }) => {
  await page.goto("/");
  const form = page.locator('form[data-lead-form][data-source="breakdown"]');
  await expect(form).toHaveCount(1);
  await expect(form).toHaveAttribute("action", "/api/lead");
});

test("the secondary CTAs still go to the contact form", async ({ page }) => {
  await page.goto("/");
  for (const location of ["hero-secondary", "final-secondary"]) {
    const href = await page.locator(`[data-cta="${location}"]`).getAttribute("href");
    expect(href, `${location} should be the contact form`).toBe("/contact");
  }
});

test("the thanks page books too", async ({ page }) => {
  await page.goto("/thanks");
  const href = await page.locator('a:has-text("Book a free breakdown")').first().getAttribute("href");
  expect(href).toMatch(/^https:\/\/cal\.com\/.+/);
});
