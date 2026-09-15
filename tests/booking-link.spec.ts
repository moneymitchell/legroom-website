import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * ============================================================================
 * The booking link lives in TWO places, and they must never disagree.
 *
 *   PUBLIC_CAL_LINK   build time, .env locally and a build variable in CI and
 *                     Cloudflare. It is compiled into the HTML and is what
 *                     every button on the site points at.
 *   CAL_LINK          run time, vars in wrangler.jsonc. It is what the
 *                     confirmation email tells people to click.
 *
 * Change one without the other and the site sends people to a live page while
 * the confirmation email sends them to a dead one, or the reverse. Nothing
 * fails, nothing logs, every test still passes, and the only symptom is
 * bookings quietly not happening.
 *
 * tests/booking.spec.ts already proves the buttons resolve to cal.com rather
 * than falling back to /contact. This is the other half: that the two sources
 * of the link are the same link.
 * ========================================================================= */

const ROOT = join(import.meta.dirname, "..");

/**
 * wrangler.jsonc is JSON with comments. Comments are stripped BEFORE the
 * lookup, so a commented-out old value cannot be read as the live one.
 */
function readWranglerVar(name: string): string | undefined {
  const raw = readFileSync(join(ROOT, "wrangler.jsonc"), "utf8");
  const code = raw.replace(/"(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) =>
    m.startsWith('"') ? m : " ",
  );
  return new RegExp('"' + name + '"\\s*:\\s*"([^"]+)"').exec(code)?.[1];
}

/**
 * The build-time value. In CI it arrives as a real environment variable; on a
 * laptop it is in .env, which is gitignored and therefore absent on a runner.
 * Checking both means the test is meaningful in both places rather than
 * quietly skipping in one of them.
 */
function readPublicCalLink(): string | undefined {
  if (process.env.PUBLIC_CAL_LINK) return process.env.PUBLIC_CAL_LINK.trim();
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return undefined;
  return /^PUBLIC_CAL_LINK=(.*)$/m.exec(readFileSync(envPath, "utf8"))?.[1]?.trim();
}

test("the site and the confirmation email point at the same booking link", () => {
  const runtime = readWranglerVar("CAL_LINK");
  const build = readPublicCalLink();

  expect(runtime, "CAL_LINK is missing from wrangler.jsonc").toBeTruthy();
  expect(
    build,
    "PUBLIC_CAL_LINK is set in neither the environment nor .env, so this check cannot run. " +
      "In CI it comes from the workflow env; locally it comes from .env.",
  ).toBeTruthy();

  expect(
    build,
    `The buttons point at ${build} and the confirmation email points at ${runtime}. ` +
      `One of them was changed without the other. Update BOTH: PUBLIC_CAL_LINK in .env ` +
      `and in the Cloudflare build variables, and CAL_LINK in wrangler.jsonc.`,
  ).toBe(runtime);
});

test("the booking link is a real cal.com URL, not a slug or a placeholder", () => {
  const runtime = readWranglerVar("CAL_LINK")!;
  // A bare slug works in the embed but is a dead link in a plain-text email,
  // which is the one place nobody would notice it.
  expect(runtime, "CAL_LINK must be an absolute https URL for the email to work").toMatch(
    /^https:\/\/cal\.com\/[^/]+\/[^/\s]+$/,
  );
  expect(runtime, "still a placeholder").not.toMatch(/example|changeme|your-/i);
});
