/** Loads the page behind the real _headers CSP and reports any violation. */
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
p.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text().slice(0, 160)); });
p.on("pageerror", (e) => problems.push("pageerror: " + e.message.slice(0, 160)));
p.on("requestfailed", (r) => problems.push("blocked: " + r.url().slice(0, 100) + " " + (r.failure()?.errorText ?? "")));
for (const path of ["/", "/contact", "/thanks", "/404"]) {
  await p.goto("http://127.0.0.1:8788" + path, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready.then(() => 1));
  await p.waitForTimeout(600);
}
// touch a form so Turnstile would load, and hover a CTA so Cal would warm
await p.goto("http://127.0.0.1:8788/", { waitUntil: "networkidle" });
await p.locator('input[type="email"]').first().focus();
await p.locator('[data-cta="hero-primary"]').hover();
await p.waitForTimeout(1200);
console.log(problems.length === 0 ? "no CSP violations, console errors or blocked requests" : problems.join("\n"));
await b.close();
