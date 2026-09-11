/**
 * Where every CTA points.
 *
 * PUBLIC_CAL_LINK holds the Cal.com booking slug, e.g. "legroom/breakdown"
 * (or a full https:// URL). JD is creating the account now; until the variable
 * is filled in, every "Book" CTA falls back to the contact form, which is a
 * working path rather than a dead link. Fill the variable in and every button
 * on the site switches over with no code change.
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
