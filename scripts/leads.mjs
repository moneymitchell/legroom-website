/**
 * ============================================================================
 * Read the leads out of D1, from the terminal.
 *
 *   npm run leads            the last 20, newest first
 *   npm run leads -- --all   every row
 *   npm run leads -- --csv   CSV on stdout, for a spreadsheet
 *
 * The Cloudflare dashboard can do this too, but it is four clicks and a SQL
 * box, and the thing you want to know at 9am is "did anything come in", which
 * should be one command.
 *
 * This reads the REMOTE database. There is only one: staging and production
 * share it deliberately, so that what gets tested is what runs. Test rows are
 * cleared at cutover, see CUTOVER.md.
 * ========================================================================= */

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const all = args.includes("--all");
const csv = args.includes("--csv");
const limit = all ? 1000 : 20;

const sql = `SELECT created_at, source, email, name, message FROM leads ORDER BY created_at DESC LIMIT ${limit};`;

let raw;
try {
  raw = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "legroom-leads", "--remote", "--json", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
} catch {
  console.error("\n  Could not reach D1. Are you logged in? Try: npx wrangler whoami\n");
  process.exit(1);
}

// wrangler prints a banner before the JSON, so start at the first bracket.
const rows = JSON.parse(raw.slice(raw.indexOf("[")))[0]?.results ?? [];

if (rows.length === 0) {
  console.log("\n  No leads yet.\n");
  process.exit(0);
}

/** Pacific, because that is the clock the person reading this is on. */
const when = (iso) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

if (csv) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  console.log("created_at,source,email,name,message");
  for (const r of rows) {
    console.log([r.created_at, r.source, r.email, r.name, r.message].map(esc).join(","));
  }
  process.exit(0);
}

console.log(`\n  ${rows.length} lead${rows.length === 1 ? "" : "s"}${all ? "" : ", most recent first"}\n`);
for (const r of rows) {
  console.log(`  ${when(r.created_at)}  ·  ${r.source}`);
  console.log(`  ${r.email}${r.name ? `  (${r.name})` : ""}`);
  if (r.message) {
    // One indented block, wrapped, so a long message stays readable.
    const words = String(r.message).split(/\s+/);
    let line = "   ";
    for (const w of words) {
      if ((line + " " + w).length > 76) {
        console.log(line);
        line = "   ";
      }
      line += (line === "   " ? "" : " ") + w;
    }
    if (line.trim()) console.log(line);
  }
  console.log("");
}
