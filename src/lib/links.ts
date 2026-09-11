/**
 * Where every CTA points.
 *
 * PUBLIC_CAL_LINK holds the Cal.com booking link, either a bare slug
 * ("jdworcester/discovery") or the full URL. It lives in .env locally and has
 * to be set as a build environment variable in the Cloudflare dashboard for
 * production, because .env is not committed.
 *
 * The /contact fallback below is a safety net, not a mode: a test asserts that
 * every booking CTA points at cal.com, so losing the variable fails the build
 * instead of quietly turning four CTAs into a contact form link.
 */

const raw = (import.meta.env.PUBLIC_CAL_LINK ?? "").trim();

/** The bare slug Cal's embed API wants, e.g. "legroom/breakdown". */
export const calSlug = raw
  .replace(/^https?:\/\/(www\.)?cal\.com\//i, "")
  .replace(/^\/+|\/+$/g, "");

export const hasCal = calSlug.length > 0;

/** Full URL for the href. Works with the embed script blocked or still loading. */
export const calUrl = hasCal ? `https://cal.com/${calSlug}` : "";

/** Primary CTA target. */
export const bookHref = hasCal ? calUrl : "/contact";

/** Secondary CTA target. */
export const contactHref = "/contact";
