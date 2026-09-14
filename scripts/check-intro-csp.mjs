/**
 * ============================================================================
 * Inline-script CSP hash guard.
 *
 * WHAT IT IS PROTECTING
 *
 * The CSP in public/_headers has `script-src 'self' ...` and deliberately no
 * 'unsafe-inline'. The intro gate in Base.astro is inline, because it has to
 * run before the first paint and a <script src> in <head> is a blocking round
 * trip charged to every visitor. So it is allowed by a sha256 hash instead.
 *
 * A hash pins the EXACT bytes. Change one character of that script and the
 * browser blocks it, silently, with no build error and no test failure: the
 * intro just stops existing for everybody, and the only signal is a console
 * message nobody is looking at. That is the failure this script exists to make
 * loud.
 *
 * Run with no argument to VERIFY, which is what the predeploy guard does.
 * Run with --write to regenerate public/_headers after editing the gate.
 *
 * Hashes and host sources coexist: adding 'sha256-...' does not switch off
 * 'self' or the Cal and Turnstile origins. Only 'strict-dynamic' would, and
 * this CSP does not use it.
 *
 * application/ld+json is skipped. CSP script-src governs scripts that execute,
 * and a JSON-LD data block does not, which is why the structured data on every
 * page has never needed a hash.
 * ========================================================================= */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const headersPath = join(root, "public", "_headers");
const write = process.argv.includes("--write");

const fail = (msg) => {
  console.error(`\n  CSP HASH GUARD FAILED\n\n${msg}\n`);
  process.exit(1);
};

/** Every .html under dist. */
const htmlFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith(".html")) htmlFiles.push(full);
  }
};
try {
  walk(dist);
} catch {
  fail(`  no dist/ to check. Run \`npm run build\` first.`);
}

/** Executable inline scripts, as the browser would hash them. */
const found = new Map(); // hash -> [files]
const SCRIPT_RE = /<script([^>]*)>([\s\S]*?)<\/script>/gi;

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  for (const m of html.matchAll(SCRIPT_RE)) {
    const attrs = m[1];
    const body = m[2];
    if (/\ssrc\s*=/i.test(attrs)) continue; // external, covered by 'self'
    const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    // Anything that is not a JavaScript type is a data block and does not
    // execute, so CSP script-src never looks at it.
    if (type && !/^(module|text\/javascript|application\/javascript)$/.test(type)) continue;
    if (body.trim() === "") continue;
    const hash = "sha256-" + createHash("sha256").update(body, "utf8").digest("base64");
    if (!found.has(hash)) found.set(hash, []);
    found.get(hash).push(file.replace(root + "/", ""));
  }
}

let headers = readFileSync(headersPath, "utf8");
const cspLine = headers.split("\n").find((l) => l.includes("Content-Security-Policy:"));
if (!cspLine) fail("  public/_headers has no Content-Security-Policy line.");

const declared = new Set([...cspLine.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1]));

if (write) {
  // Replace the full set rather than appending, so a removed inline script
  // takes its hash with it instead of leaving a permanent hole in the policy.
  let scriptSrc = /script-src ([^;]+);/.exec(cspLine);
  if (!scriptSrc) fail("  could not find script-src in the CSP.");
  const kept = scriptSrc[1]
    .trim()
    .split(/\s+/)
    .filter((t) => !/^'sha256-/.test(t));
  const rebuilt = [...kept, ...[...found.keys()].sort().map((h) => `'${h}'`)].join(" ");
  headers = headers.replace(scriptSrc[0], `script-src ${rebuilt};`);
  writeFileSync(headersPath, headers);
  console.log(`\n  public/_headers script-src rewritten with ${found.size} hash(es):`);
  for (const [h, files] of found) console.log(`    '${h}'  <- ${files.join(", ")}`);
  console.log();
  process.exit(0);
}

const missing = [...found.keys()].filter((h) => !declared.has(h));
const stale = [...declared].filter((h) => !found.has(h));

if (missing.length > 0) {
  fail(
    missing
      .map(
        (h) =>
          `  an inline script in ${found.get(h).join(", ")} is NOT allowed by the CSP.\n` +
          `  Expected hash: '${h}'\n`,
      )
      .join("\n") +
      `\n  The browser will block it silently: no build error, no test failure,\n` +
      `  the intro simply never runs. Regenerate with:\n\n` +
      `    npm run build && node scripts/check-intro-csp.mjs --write\n`,
  );
}

if (stale.length > 0) {
  fail(
    `  public/_headers allows ${stale.length} inline script hash(es) that no\n` +
      `  longer exist in the build:\n\n` +
      stale.map((h) => `    '${h}'`).join("\n") +
      `\n\n  A hash for a script nobody ships is a permanent hole in the policy.\n` +
      `  Remove it with:\n\n    node scripts/check-intro-csp.mjs --write\n`,
  );
}

console.log(
  `  intro CSP guard: ${found.size} inline script(s), all hashed in _headers. OK`,
);
