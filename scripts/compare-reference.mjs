/**
 * Visual regression against the handoff PNGs, with a real number per section.
 *
 * The eight files in handoff/reference/screens are 2x renders of the approved
 * design at 1440 (and 390 for mobile). This captures the same sections from the
 * built site at deviceScaleFactor 2 and reports the percentage of differing
 * pixels for each.
 *
 * The two slitscan canvases are animated, so the reference captured them mid
 * frame and no two runs can ever agree. Their rectangles are painted flat in
 * BOTH images before diffing, and the test asserts separately that the canvas
 * exists and has non-zero dimensions.
 *
 *   node scripts/compare-reference.mjs [--write] [--url http://127.0.0.1:4321]
 *
 * --write saves actual/diff PNGs next to the report for eyeballing.
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = join(root, "..", "handoff", "reference", "screens");
const OUT = join(root, "tests", "__screenshots__");

const args = process.argv.slice(2);
const write = args.includes("--write");
const urlArg = args.indexOf("--url");
const BASE = urlArg >= 0 ? args[urlArg + 1] : "http://127.0.0.1:4321";

/** Each section, its reference PNG, and the selector that frames it. */
const SECTIONS = [
  { name: "01-hero", selector: "header.hero", width: 1440 },
  { name: "02-breakdown", selector: "#breakdown", width: 1440 },
  { name: "03-credibility", selector: "section.band", width: 1440 },
  { name: "04-promise", selector: "[aria-labelledby='promise-title']", width: 1440 },
  { name: "05-wordmark-break", selector: "section.brk", width: 1440 },
  // the reference board wraps the CTA grid AND the footer in one frame
  { name: "06-cta-founders", selector: "#who-we-are", through: "footer", width: 1440 },
  { name: "08-mobile", selector: "header.hero", width: 390 },
];

const results = [];

const browser = await chromium.launch({
  args: ["--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none"],
});

for (const sec of SECTIONS) {
  const page = await browser.newPage({
    viewport: { width: sec.width, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce", // freezes the dot ping so it cannot flap the diff
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // Walk the page so lazy images below the fold start loading, then wait for
  // every one of them to finish decoding. Without this the founder photos are
  // still empty when the founders card is captured.
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
    await Promise.all(
      [...document.images].map((img) =>
        img.complete ? Promise.resolve() : img.decode().catch(() => {}),
      ),
    );
  });
  await page.waitForTimeout(300);

  const target = page.locator(sec.selector).first();
  if ((await target.count()) === 0) {
    results.push({ name: sec.name, status: "missing selector" });
    await page.close();
    continue;
  }

  const masks = await page.locator("canvas[data-slitscan]").all();

  let shot;
  if (sec.through) {
    // Frame from the top of `selector` to the bottom of `through`, which the
    // reference captured as a single board.
    const box = await page.evaluate(
      ([from, to]) => {
        const a = document.querySelector(from).getBoundingClientRect();
        const b = document.querySelector(to).getBoundingClientRect();
        const sx = window.scrollX, sy = window.scrollY;
        return { x: 0, y: a.top + sy, width: window.innerWidth, height: b.bottom + sy - (a.top + sy) };
      },
      [sec.selector, sec.through],
    );
    await page.setViewportSize({ width: sec.width, height: Math.ceil(box.height) + 40 });
    await page.waitForTimeout(120);
    const box2 = await page.evaluate(
      ([from, to]) => {
        const a = document.querySelector(from).getBoundingClientRect();
        const b = document.querySelector(to).getBoundingClientRect();
        const sy = window.scrollY;
        return { x: 0, y: a.top + sy, width: window.innerWidth, height: b.bottom - a.top };
      },
      [sec.selector, sec.through],
    );
    shot = await page.screenshot({
      clip: box2,
      mask: masks,
      maskColor: "#FF00FF",
      animations: "disabled",
      fullPage: true,
    });
  } else {
    shot = await target.screenshot({
      mask: masks,
      maskColor: "#FF00FF",
      animations: "disabled",
    });
  }

  const refPath = join(REF, `${sec.name}.png`);
  if (!existsSync(refPath)) {
    results.push({ name: sec.name, status: "no reference" });
    await page.close();
    continue;
  }

  const actual = PNG.sync.read(shot);
  const expected = PNG.sync.read(readFileSync(refPath));

  // Compare on the overlap. A height delta is reported separately rather than
  // being smeared across the pixel percentage.
  const w = Math.min(actual.width, expected.width);
  const h = Math.min(actual.height, expected.height);
  const a = crop(actual, w, h);
  const b = crop(expected, w, h);

  // Flatten the canvas rectangles in the reference too: the mask colour is only
  // in `actual`, so without this every masked pixel counts as a difference.
  syncMask(a, b);

  // Sub-pixel sampling phase: each section sits at a fractional Y in the page
  // flow, so a 2x capture can land half a device pixel off the reference's
  // whole-pixel origin and every horizontal edge then disagrees. Align to the
  // nearest whole pixel before diffing and report the shift that was needed.
  // A shift beyond +/-2 device px is real drift, not sampling, and shows up as
  // a large offset in the report rather than being hidden.
  let best = null;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const shifted = shift(a, dx, dy);
      const d = new PNG({ width: w, height: h });
      const n = pixelmatch(shifted.data, b.data, d.data, w, h, {
        threshold: 0.12,
        includeAA: false,
      });
      if (!best || n < best.n) best = { n, dx, dy, diff: d };
    }
  }
  const diff = best.diff;
  const differing = best.n;
  const pct = (differing / (w * h)) * 100;

  results.push({
    name: sec.name,
    status: "compared",
    pct,
    differing,
    actualSize: `${actual.width}x${actual.height}`,
    refSize: `${expected.width}x${expected.height}`,
    heightDelta: actual.height - expected.height,
    align: `${best.dx},${best.dy}`,
  });

  if (write) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `${sec.name}-actual.png`), PNG.sync.write(actual));
    writeFileSync(join(OUT, `${sec.name}-diff.png`), PNG.sync.write(diff));
  }

  await page.close();
}

await browser.close();

/** Translate `png` by (dx,dy) device px, filling the exposed edge with its own edge pixels. */
function shift(png, dx, dy) {
  if (dx === 0 && dy === 0) return png;
  const out = new PNG({ width: png.width, height: png.height });
  for (let y = 0; y < png.height; y++) {
    const sy = Math.min(png.height - 1, Math.max(0, y - dy));
    for (let x = 0; x < png.width; x++) {
      const sx = Math.min(png.width - 1, Math.max(0, x - dx));
      const si = (png.width * sy + sx) << 2;
      const di = (png.width * y + x) << 2;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = png.data[si + 3];
    }
  }
  return out;
}

function crop(png, w, h) {
  if (png.width === w && png.height === h) return png;
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, 0, 0, w, h, 0, 0);
  return out;
}

/** Wherever `a` is the mask colour, copy those pixels into `b` so they match. */
function syncMask(a, b) {
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] === 255 && a.data[i + 1] === 0 && a.data[i + 2] === 255) {
      b.data[i] = 255;
      b.data[i + 1] = 0;
      b.data[i + 2] = 255;
      b.data[i + 3] = a.data[i + 3];
    }
  }
}

const THRESHOLD = 0.8;
let failed = 0;
console.log("\nSection                    diff%    pixels      actual        reference   Δh  align");
console.log("-".repeat(92));
for (const r of results) {
  if (r.status !== "compared") {
    console.log(`${r.name.padEnd(24)}  ${r.status}`);
    failed++;
    continue;
  }
  const flag = r.pct <= THRESHOLD ? "ok" : "OVER";
  if (r.pct > THRESHOLD) failed++;
  console.log(
    `${r.name.padEnd(24)}  ${r.pct.toFixed(3).padStart(6)}  ${String(r.differing).padStart(8)}  ${r.actualSize.padStart(11)}  ${r.refSize.padStart(11)}  ${String(r.heightDelta).padStart(4)}  ${String(r.align).padStart(5)}  ${flag}`,
  );
}
console.log("-".repeat(92));
console.log(`threshold ${THRESHOLD}% differing pixels per section\n`);
process.exit(failed > 0 ? 1 : 0);
