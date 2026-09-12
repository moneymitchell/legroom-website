/**
 * ============================================================================
 * Deploy guard. Runs automatically around `npm run deploy` via the npm
 * predeploy and postdeploy lifecycle hooks, so it cannot be forgotten.
 *
 * WHAT IT IS PROTECTING
 *
 * legroomcompany.com and www serve the COMING SOON page, from a Worker named
 * `legroom-website`. This project is `legroom-web`. Two characters apart, same
 * account, same zone.
 *
 * The specific way this goes wrong: Cloudflare's git integration pre-fills the
 * Worker name from the REPOSITORY name, which is `legroom-website`. Accepting
 * that default overwrites the live coming soon site. So does a typo in
 * wrangler.jsonc, or `wrangler deploy --name legroom-website`, or a copy-paste
 * from the wrong terminal.
 *
 * Care is not a control. This is the control.
 *
 *   pre   the config is for legroom-web, carries no apex or www route, and
 *         has no placeholder resource ids left in it
 *   post  the apex still serves the coming soon page, fetched over the public
 *         internet, not assumed
 *
 * Either one failing exits non-zero.
 * ========================================================================= */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "pre";

/** The only name this project may ever deploy to. */
const OURS = "legroom-web";
/** The Worker serving the coming soon page. Never ours to touch. */
const THEIRS = "legroom-website";

/** Hostnames that belong to the coming soon page until JD says otherwise. */
const PRODUCTION_HOSTS = ["legroomcompany.com", "www.legroomcompany.com"];

const fail = (msg) => {
  console.error(`\n  DEPLOY BLOCKED\n\n  ${msg}\n`);
  process.exit(1);
};

/** wrangler.jsonc is JSON with comments. Strip them rather than add a dep. */
const readConfig = () => {
  const raw = readFileSync(join(root, "wrangler.jsonc"), "utf8");
  const stripped = raw
    .replace(/"(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) =>
      m.startsWith('"') ? m : " ",
    )
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped);
};

if (mode === "pre") {
  const cfg = readConfig();

  if (cfg.name !== OURS) {
    fail(
      `wrangler.jsonc says name: "${cfg.name}".\n` +
        `  It must be "${OURS}". "${THEIRS}" is the coming soon site and\n` +
        `  deploying over it takes the live page down.`,
    );
  }

  // Routes, custom domains and workers_dev all reach the public. The apex and
  // www must not be reachable from this config by ANY of those doors.
  const surfaces = JSON.stringify([
    cfg.routes ?? null,
    cfg.route ?? null,
    cfg.env ?? null,
  ]).toLowerCase();

  for (const host of PRODUCTION_HOSTS) {
    if (surfaces.includes(host)) {
      fail(
        `wrangler.jsonc carries a route or custom domain for ${host}.\n` +
          `  Staging reaches the public only through preview.legroomcompany.com.\n` +
          `  The apex moves at cutover, by hand, per CUTOVER.md.`,
      );
    }
  }

  // A placeholder id deploys a Worker whose bindings point at nothing, which
  // fails at the first form submission rather than at deploy time.
  const placeholders = [];
  for (const db of cfg.d1_databases ?? []) {
    if (/^0+(-0+)*$/.test(db.database_id ?? "")) placeholders.push(`d1 ${db.database_name}`);
  }
  for (const kv of cfg.kv_namespaces ?? []) {
    if (/^0+[0-9a-f]?$/.test(kv.id ?? "")) placeholders.push(`kv ${kv.binding}`);
  }
  if (placeholders.length > 0) {
    fail(
      `these bindings still hold placeholder ids: ${placeholders.join(", ")}.\n` +
        `  Create the resources and put the real ids in wrangler.jsonc first.`,
    );
  }

  console.log(`  deploy guard: name "${cfg.name}", no apex route, no placeholder ids. OK`);
  process.exit(0);
}

if (mode === "post") {
  // Fetch it. The whole point is not to take anyone's word for it, including
  // Cloudflare's dashboard or this script's own pre-check.
  let bad = false;
  for (const host of PRODUCTION_HOSTS) {
    const url = `https://${host}`;
    try {
      const res = await fetch(url, { redirect: "follow" });
      const html = await res.text();
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "(none)";
      const h1 =
        /<h1[^>]*>([\s\S]*?)<\/h1>/i
          .exec(html)?.[1]
          ?.replace(/<[^>]*>/g, "")
          .trim() ?? "(none)";
      const comingSoon = /coming soon/i.test(html);

      console.log(`  ${url}`);
      console.log(`    HTTP  ${res.status}`);
      console.log(`    title ${title}`);
      console.log(`    h1    ${h1}`);
      console.log(`    coming soon marker: ${comingSoon ? "present" : "ABSENT"}`);

      if (!comingSoon) {
        bad = true;
        console.error(`    ^^ ${url} is no longer serving the coming soon page.`);
      }
    } catch (err) {
      bad = true;
      console.error(`  ${url} could not be fetched: ${err.message}`);
    }
  }
  if (bad) {
    fail(
      `the apex changed. Something in this deploy reached production.\n` +
        `  Roll back per CUTOVER.md and stop.`,
    );
  }
  console.log(`  apex guard: coming soon page intact on both hosts. OK`);
  process.exit(0);
}

fail(`unknown mode "${mode}". Use "pre" or "post".`);
