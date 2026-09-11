import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The writing rules, enforced mechanically.
 *
 * "No em dashes" is a permanent rule, and a rule that depends on somebody
 * remembering it will drift back in. This scans the actual source: the content
 * files, every .astro template, and the Worker's email bodies.
 *
 * En dashes are deliberately allowed. The design uses one, in "2-4 weeks",
 * which is correct typography for a numeric range and is not a tell.
 */

const ROOT = join(import.meta.dirname, "..");
const EM_DASH = "—";

/** Every file whose text can reach a human. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist" || entry === ".astro") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.(astro|ts|tsx|md)$/.test(entry)) out.push(full);
    }
  };
  walk(join(ROOT, "src"));
  walk(join(ROOT, "worker"));
  out.push(join(ROOT, "README.md"), join(ROOT, "LAUNCH.md"));
  return out;
}

test("no em dash appears in any source or document file", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    if (!text.includes(EM_DASH)) continue;
    text.split("\n").forEach((line, i) => {
      if (line.includes(EM_DASH)) {
        offenders.push(`${file.replace(ROOT + "/", "")}:${i + 1}  ${line.trim().slice(0, 90)}`);
      }
    });
  }
  expect(offenders, `em dash found. Use a comma, a period or a colon.`).toEqual([]);
});

test("no em dash reaches the rendered page", async ({ page }) => {
  for (const path of ["/", "/contact", "/thanks", "/404"]) {
    await page.goto(path);
    const text = await page.evaluate(() => document.body.innerText);
    const html = await page.content();
    expect(text.includes("—"), `em dash in visible text on ${path}`).toBe(false);
    expect(html.includes("—"), `em dash in markup on ${path}`).toBe(false);
  }
});

test("the other tells of machine-written copy are absent", async ({ page }) => {
  const BANNED = [
    "seamless",
    "robust",
    "leverage",
    "unlock",
    "elevate",
    "dive in",
    "fast-paced",
    "it's not just",
    "it is not just",
    "best-in-class",
    "game-changing",
    "cutting-edge",
    "synergy",
  ];
  for (const path of ["/", "/contact", "/thanks", "/404"]) {
    await page.goto(path);
    const text = (await page.evaluate(() => document.body.innerText)).toLowerCase();
    const hits = BANNED.filter((w) => text.includes(w));
    expect(hits, `banned phrasing on ${path}`).toEqual([]);
  }
});

test("contractions use the typographic apostrophe, not a straight quote", () => {
  // The design is consistent about this and mixed quotes look sloppy at
  // Oswald's weight. Only word-internal quotes are checked, so the TypeScript
  // string delimiters are untouched.
  const offenders: string[] = [];
  for (const file of [join(ROOT, "src/content/site.ts"), join(ROOT, "src/content/emails.ts")]) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        const t = line.trim();
        // comments are code, not copy
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
        if (/[A-Za-z]'[A-Za-z]/.test(line)) {
          offenders.push(`${file.replace(ROOT + "/", "")}:${i + 1}  ${t.slice(0, 80)}`);
        }
      });
  }
  expect(offenders, "use \u2019 rather than ' inside a word").toEqual([]);
});

test("the email bodies are clean too", () => {
  const emails = readFileSync(join(ROOT, "src/content/emails.ts"), "utf8");
  expect(emails.includes(EM_DASH), "em dash in an email body").toBe(false);
  // and they are plain text: no markup smuggled into the strings
  expect(/<[a-z][^>]*>/i.test(emails.replace(/\/\*[\s\S]*?\*\//g, "")), "markup in a plain-text email").toBe(
    false,
  );
});
