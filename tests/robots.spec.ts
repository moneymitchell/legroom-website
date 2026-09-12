import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import worker, { type Env } from "../worker/index";

/**
 * ============================================================================
 * The crawl ban, and the far more important question of where it does NOT go.
 *
 * Staging serves the same site as production on a different hostname. Without
 * a crawl ban it competes with the real homepage in search on its own content.
 * With a crawl ban in the wrong place, the real site falls out of Google,
 * nobody notices for weeks, and it takes weeks more to come back.
 *
 * So the absence assertions below matter more than the presence ones. If you
 * are here because one of these failed, read which half failed before changing
 * anything: a missing header on preview is untidy, a present one on the apex
 * is an emergency.
 *
 * These call the Worker module directly rather than a deployed URL, so they
 * run in CI with no credentials and no network. The same properties are
 * checked again against the real host in scripts/qa-live.mjs, because a unit
 * test cannot prove Cloudflare did not add or strip something in front.
 * ========================================================================= */

const PRODUCTION = ["legroomcompany.com", "www.legroomcompany.com"];
const STAGING = [
  "preview.legroomcompany.com",
  "legroom-web.jd-legroom.workers.dev",
  "some-branch.legroom-web.workers.dev",
];

/**
 * ASSETS, stubbed. Returns headers frozen the way the real asset server does,
 * which is the entire reason worker/index.ts copies the response instead of
 * mutating it. A stub with mutable headers would let a broken implementation
 * pass here and throw in production.
 */
const env = (): Env =>
  ({
    ASSETS: {
      fetch: async (req: Request) =>
        new Response("<!doctype html><title>Legroom</title>", {
          headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
          status: new URL(req.url).pathname === "/nope" ? 404 : 200,
        }),
    },
    SITE_URL: "https://legroomcompany.com",
  }) as unknown as Env;

const get = (host: string, path = "/") =>
  worker.fetch(new Request(`https://${host}${path}`), env(), {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext);

test.describe("X-Robots-Tag", () => {
  for (const host of STAGING) {
    test(`is present on ${host}`, async () => {
      for (const path of ["/", "/contact", "/sitemap.xml", "/og-image.jpg", "/nope"]) {
        const res = await get(host, path);
        expect(
          res.headers.get("x-robots-tag"),
          `${host}${path} is crawlable, so staging can outrank the real site`,
        ).toContain("noindex");
      }
    });
  }

  for (const host of PRODUCTION) {
    test(`is ABSENT on ${host}`, async () => {
      for (const path of ["/", "/contact", "/sitemap.xml", "/og-image.jpg", "/nope"]) {
        const res = await get(host, path);
        expect(
          res.headers.get("x-robots-tag"),
          `${host}${path} is telling Google not to index the live site. This is the ` +
            `worst failure in the project. Do not "fix" it by relaxing this test.`,
        ).toBeNull();
      }
    });
  }

  test("the API answers carry it on staging and not on production", async () => {
    const staging = await worker.fetch(
      new Request("https://preview.legroomcompany.com/api/lead"),
      env(),
      {} as unknown as ExecutionContext,
    );
    expect(staging.headers.get("x-robots-tag")).toContain("noindex");

    const production = await worker.fetch(
      new Request("https://legroomcompany.com/api/lead"),
      env(),
      {} as unknown as ExecutionContext,
    );
    expect(production.headers.get("x-robots-tag")).toBeNull();
  });
});

test.describe("robots.txt", () => {
  test("staging disallows everything", async () => {
    for (const host of STAGING) {
      const res = await get(host, "/robots.txt");
      const body = await res.text();
      expect(body, `${host} is not disallowing crawlers`).toContain("Disallow: /");
      expect(body, `${host} is advertising a sitemap`).not.toContain("Sitemap:");
      expect(res.headers.get("x-robots-tag")).toContain("noindex");
    }
  });

  test("production serves the real one, which allows crawling", async () => {
    for (const host of PRODUCTION) {
      const res = await get(host, "/robots.txt");
      const body = await res.text();
      // The stub stands in for the asset server, so what matters here is that
      // the Worker did NOT substitute its own disallow-all.
      expect(body, `${host} is being served the staging robots.txt`).not.toContain("Disallow: /\n");
      expect(res.headers.get("x-robots-tag")).toBeNull();
    }
  });

  test("the shipped robots.txt allows crawling and points at the apex", () => {
    const body = readFileSync(join(process.cwd(), "dist", "robots.txt"), "utf8");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Sitemap: https://legroomcompany.com/sitemap.xml");
    expect(body, "the build baked in a crawl ban").not.toMatch(/^Disallow: \/$/m);
  });
});

test("SITE_URL and the hard-coded production list have not drifted apart", () => {
  // The Worker decides production from a literal list, on purpose. This is the
  // check that notices when someone changes the domain in one place only.
  const cfg = readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf8");
  const siteUrl = /"SITE_URL"\s*:\s*"([^"]+)"/.exec(cfg)?.[1];
  expect(siteUrl, "SITE_URL is missing from wrangler.jsonc").toBeTruthy();
  expect(
    PRODUCTION,
    `SITE_URL is ${siteUrl} but the Worker's PRODUCTION_HOSTS does not contain its host. ` +
      `One of them was changed without the other, and the crawl ban is now pointing at the wrong site.`,
  ).toContain(new URL(siteUrl!).hostname);

  const src = readFileSync(join(process.cwd(), "worker", "index.ts"), "utf8");
  for (const host of PRODUCTION) {
    expect(src, `worker/index.ts no longer lists ${host} as production`).toContain(`"${host}"`);
  }
});
