import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility. WCAG 2.2 AA.
 *
 * axe runs at every breakpoint on every page. The colour-contrast rule is run
 * separately and reported rather than silently fixed: `--ink-3` (#96917F) is a
 * brand token that fails 4.5:1 on all three papers, and the brief says to
 * report that rather than darken it. See the README, "Known contrast findings".
 */

const BREAKPOINTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
];

const PAGES = ["/", "/contact", "/thanks", "/404"];

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.evaluate(async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const rail = document.querySelector<HTMLElement>(".rail");
    if (rail) {
      rail.style.scrollBehavior = "auto";
      rail.scrollTop = rail.scrollHeight;
      await wait(60);
      rail.scrollTop = 0;
      await wait(60);
    }
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await wait(30);
    }
    window.scrollTo(0, 0);
    await Promise.all(
      [...document.images].map((i) =>
        i.complete ? Promise.resolve() : Promise.race([i.decode().catch(() => {}), wait(3000)]),
      ),
    );
  });
}

const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);

test.describe("axe", () => {
  for (const path of PAGES) {
    for (const bp of BREAKPOINTS) {
      test(`${path} has no violations at ${bp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: bp.width, height: bp.height });
        await page.goto(path);
        await settle(page);

        // colour-contrast is measured and reported in its own test below
        const results = await scan(page).disableRules(["color-contrast"]).analyze();

        const summary = results.violations.map(
          (v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}\n      ${v.nodes[0]?.html?.slice(0, 120)}`,
        );
        expect(summary, `axe violations on ${path} at ${bp.name}`).toEqual([]);
      });
    }
  }

  test("colour contrast: report, do not silently darken", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();

    const found = results.violations.flatMap((v) =>
      v.nodes.map((n) => {
        const msg = n.any[0]?.message ?? "";
        // axe states the measured value as "color contrast of X" and the
        // requirement as "Expected contrast ratio of 4.5:1". Read the former.
        const ratio = /color contrast of ([\d.]+)/.exec(msg)?.[1] ?? "?";
        const fg = /foreground color: (#[0-9a-f]{6})/i.exec(msg)?.[1] ?? "?";
        const bg = /background color: (#[0-9a-f]{6})/i.exec(msg)?.[1] ?? "?";
        return { ratio, fg, bg, html: (n.html ?? "").slice(0, 70) };
      }),
    );

    // The brief is explicit: verify --ink-3 / --ink-2 against their real
    // backgrounds and report anything under 4.5:1 rather than changing it.
    // This test therefore records the finding instead of failing the build.
    if (found.length > 0) {
      console.log(`\n  contrast findings (reported, not fixed): ${found.length} node(s)`);
      const byToken = new Map<string, { n: number; ratio: string }>();
      for (const f of found) {
        const key = `${f.fg} on ${f.bg}`;
        const cur = byToken.get(key);
        byToken.set(key, { n: (cur?.n ?? 0) + 1, ratio: f.ratio });
      }
      for (const [pair, v] of byToken) console.log(`    ${v.ratio}:1  ${pair}  x${v.n} node(s)`);
    }
    /**
     * These four token pairs are the audited, known findings. They are brand
     * values, and the brief says to report rather than change them, so the
     * test records them. What it will not allow is a NEW failing pair: that
     * would be a regression somebody introduced, not a decision somebody made.
     *
     *   #96917F on #F4F1EA  2.79:1  --ink-3 on paper  (eyebrows, micro copy)
     *   #96917F on #EAE5DA  2.51:1  --ink-3 on Manila (same, in the offer band)
     *   #6B675E on #EAE5DA  4.48:1  --ink-2 on Manila (body copy, 0.02 short)
     *   #E9B300 on #F4F1EA  1.70:1  --yellow-deep on paper (the Q&A labels)
     */
    const KNOWN = new Set([
      "#96917f on #f4f1ea",
      "#96917f on #eae5da",
      "#6b675e on #eae5da",
      "#e9b300 on #f4f1ea",
    ]);
    const unexpected = [...new Set(found.map((f) => `${f.fg} on ${f.bg}`))].filter(
      (pair) => !KNOWN.has(pair),
    );
    expect(unexpected, "a colour pair started failing contrast that was not in the audit").toEqual([]);
  });
});

test.describe("keyboard", () => {
  test("the whole conversion path is reachable, in order, with a visible ring", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await page.keyboard.press("Tab"); // skip link

    const seen: string[] = [];
    for (let i = 0; i < 26; i++) {
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          label: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
          outlineWidth: cs.outlineWidth,
          outlineStyle: cs.outlineStyle,
          outlineColor: cs.outlineColor,
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });
      if (info) {
        seen.push(`${info.tag}:${info.label}`);
        // every stop must show a real ring; never outline:none with no replacement
        expect(
          info.outlineStyle !== "none" && parseFloat(info.outlineWidth) >= 2,
          `no visible focus ring on <${info.tag}> "${info.label}" (outline: ${info.outlineStyle} ${info.outlineWidth})`,
        ).toBe(true);
      }
      await page.keyboard.press("Tab");
    }

    const joined = seen.join(" | ");
    expect(joined, "the skip link should be the first stop").toContain("Skip to content");
    expect(joined.toLowerCase()).toContain("book a call");
    expect(joined.toLowerCase()).toContain("book a free breakdown");
    expect(joined.toLowerCase()).toContain("send us a note");
  });

  test("the skip link moves focus to the main content", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await page.keyboard.press("Tab");
    await expect(page.locator("a.skip")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
    await expect(page.locator("#main")).toBeVisible();
  });

  test("the phone menu opens and closes from the keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await settle(page);
    const summary = page.locator(".menu summary");
    await expect(summary).toBeVisible();
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".menu")).toHaveAttribute("open", "");
    await expect(page.locator(".panel a").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".menu")).not.toHaveAttribute("open", "");
  });
});

test.describe("tap targets", () => {
  test("every interactive target is at least 44x44 on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await settle(page);
    // open the menu so its items are measured too
    await page.locator(".menu summary").click();

    const small = await page.evaluate(() => {
      const bad: string[] = [];
      const nodes = document.querySelectorAll<HTMLElement>(
        "a[href], button, summary, input, textarea, [tabindex]:not([tabindex='-1'])",
      );
      for (const el of nodes) {
        if (el.classList.contains("skip")) continue; // only visible while focused
        if (el.tabIndex < 0) continue; // honeypot and other non-targets
        if (el.closest("[aria-hidden='true']")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right < 0 || r.bottom < 0) continue; // parked off-screen
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        // an element can enlarge its hit area with an absolutely positioned
        // pseudo-element; measure that too
        let h = r.height;
        let w = r.width;
        const before = getComputedStyle(el, "::before");
        if (before.position === "absolute" && before.content !== "none") {
          const inset = parseFloat(before.top || "0");
          if (inset < 0) {
            h += Math.abs(inset) * 2;
            w += Math.abs(parseFloat(before.left || "0")) * 2;
          }
        }
        if (h < 44 || w < 44) {
          bad.push(
            `${el.tagName.toLowerCase()}.${el.className || "-"} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 28)}" ${Math.round(w)}x${Math.round(h)}`,
          );
        }
      }
      return bad;
    });
    expect(small, "targets under 44x44 on a phone").toEqual([]);
  });
});

test.describe("semantics", () => {
  test("exactly one h1, and no skipped heading levels", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const levels = await page.evaluate(() =>
      [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => ({
        level: Number(h.tagName[1]),
        text: (h.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
      })),
    );
    expect(levels.filter((l) => l.level === 1).length, "there must be exactly one h1").toBe(1);
    expect(levels[0]?.level, "the first heading should be the h1").toBe(1);
    for (let i = 1; i < levels.length; i++) {
      const jump = levels[i]!.level - levels[i - 1]!.level;
      expect(jump, `heading jumps from h${levels[i - 1]!.level} to h${levels[i]!.level} at "${levels[i]!.text}"`).toBeLessThanOrEqual(1);
    }
  });

  test("decorative art is hidden and meaningful images are described", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const report = await page.evaluate(() => {
      const canvases = [...document.querySelectorAll("canvas")].map((c) => c.getAttribute("aria-hidden"));
      const decorativeSvgs = [...document.querySelectorAll("svg")].filter(
        (s) => !s.getAttribute("aria-hidden") && !s.getAttribute("role") && !s.querySelector("title"),
      ).length;
      const imgs = [...document.querySelectorAll("img")].map((i) => ({
        src: (i.getAttribute("src") || "").split("/").pop(),
        alt: i.getAttribute("alt"),
      }));
      return { canvases, decorativeSvgs, imgs };
    });
    expect(report.canvases, "both canvases must be aria-hidden").toEqual(["true", "true"]);
    expect(report.decorativeSvgs, "every decorative svg needs aria-hidden").toBe(0);

    // logos and photos carry real alt; the seat mark inside the drawing is decorative
    const named = report.imgs.filter((i) => i.alt !== "");
    expect(named.length).toBeGreaterThan(4);
    for (const i of report.imgs) {
      expect(i.alt, `img ${i.src} is missing an alt attribute entirely`).not.toBeNull();
    }
  });

  test("the document has the metadata a share and a crawler need", async ({ page }) => {
    await page.goto("/");
    const meta = await page.evaluate(() => {
      const get = (sel: string, attr = "content") =>
        document.querySelector(sel)?.getAttribute(attr) ?? null;
      return {
        lang: document.documentElement.lang,
        title: document.title,
        description: get('meta[name="description"]'),
        canonical: get('link[rel="canonical"]', "href"),
        ogTitle: get('meta[property="og:title"]'),
        ogImage: get('meta[property="og:image"]'),
        ogType: get('meta[property="og:type"]'),
        twitter: get('meta[name="twitter:card"]'),
        jsonLd: document.querySelector('script[type="application/ld+json"]')?.textContent ?? "",
      };
    });
    expect(meta.lang).toBe("en");
    expect(meta.title.length).toBeGreaterThan(10);
    expect(meta.description?.length ?? 0).toBeGreaterThan(50);
    expect(meta.canonical).toBe("https://legroomcompany.com/");
    expect(meta.ogType).toBe("website");
    expect(meta.ogImage).toContain("/og-image.jpg");
    expect(meta.twitter).toBe("summary_large_image");

    const graph = JSON.parse(meta.jsonLd);
    const types = graph["@graph"].map((n: { "@type": string }) => n["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain("ProfessionalService");
    expect(types).toContain("WebSite");
    expect(types).toContain("Service");
  });

  test("the word 'teardown' appears nowhere", async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      const html = await page.content();
      expect(html.toLowerCase(), `"teardown" found on ${path}`).not.toContain("teardown");
    }
  });
});

test.describe("forms without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the capture and the contact form still post", async ({ page }) => {
    await page.goto("/");
    const form = page.locator("form[data-lead-form]").first();
    await expect(form).toHaveAttribute("method", /post/i);
    await expect(form).toHaveAttribute("action", "/api/lead");
    await expect(form.locator('input[type="email"]')).toHaveAttribute("required", "");
    // a label, not just a placeholder
    const id = await form.locator('input[type="email"]').getAttribute("id");
    await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);

    await page.goto("/contact");
    const contact = page.locator("form[data-lead-form]");
    await expect(contact).toHaveAttribute("action", "/api/lead");
    for (const field of ["name", "email", "message"]) {
      await expect(page.locator(`label[for="${field}"]`), `no label for ${field}`).toHaveCount(1);
    }
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("the founder deck is still readable and the CTAs still work", async ({ page }) => {
    await page.goto("/");
    // both cards are in the DOM, not rendered by script
    // .card is also the promise section's class; scope to the deck
    await expect(page.locator(".rail .card")).toHaveCount(2);
    await expect(page.locator(".sdot")).toHaveCount(2);
    await expect(page.locator(".sdot").first()).toHaveAttribute("href", "#founder-1");
    // the booking CTA is a real link even with the Cal embed unavailable
    const cta = page.locator('[data-cta="hero-primary"]');
    await expect(cta).toHaveAttribute("href", /.+/);
  });
});
