/** Prints the median Lighthouse result per URL from the last lhci run. */
import { readdirSync, readFileSync, existsSync } from "node:fs";
const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const [label, dir] of [["DESKTOP", ".lighthouseci"], ["MOBILE", ".lighthouseci-mobile"]]) {
  if (!existsSync(dir)) { console.log(`${label}: no run`); continue; }
  const files = readdirSync(dir).filter((f) => f.endsWith(".report.json"));
  const byUrl = {};
  for (const f of files) {
    const r = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    const u = (r.finalDisplayedUrl || r.requestedUrl || "?").replace(/^http:\/\/localhost:\d+/, "");
    (byUrl[u] ??= []).push(r);
  }
  console.log(`\n### ${label}`);
  for (const [u, rs] of Object.entries(byUrl)) {
    const c = (k) => med(rs.map((r) => Math.round(r.categories[k].score * 100)));
    const a = (k) => med(rs.map((r) => r.audits[k].numericValue));
    console.log(
      `  ${u.padEnd(22)} perf ${String(c("performance")).padStart(3)}  a11y ${String(c("accessibility")).padStart(3)}` +
      `  best-practices ${String(c("best-practices")).padStart(3)}  seo ${String(c("seo")).padStart(3)}`,
    );
    console.log(
      `  ${" ".repeat(22)} LCP ${Math.round(a("largest-contentful-paint"))}ms  CLS ${a("cumulative-layout-shift").toFixed(3)}` +
      `  TBT ${Math.round(a("total-blocking-time"))}ms  SI ${Math.round(a("speed-index"))}ms` +
      `  weight ${rs[0].audits["total-byte-weight"].displayValue}`,
    );
  }
}
console.log();
