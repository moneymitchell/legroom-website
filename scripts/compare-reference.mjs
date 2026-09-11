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
  // R3: the sticky rail is `position: fixed`, so it lands inside every section
  // clip regardless of where that section sits on the page, and it has no
  // counterpart in the reference boards. Hidden rather than masked: masking
  // would blank out whatever the reference actually has in those 57px. The bar
  // is asserted on its own in tests/visual.spec.ts.
  await page.addStyleTag({ content: ".railbar { display: none !important }" });

  await page.waitForTimeout(300);

  const target = page.locator(sec.selector).first();
  if ((await target.count()) === 0) {
    results.push({ name: sec.name, status: "missing selector" });
    await page.close();
    continue;
  }

  // Masked in both images before diffing:
  //  - both canvases, the wordmark slitscan and the hero measure, which are
  //    animated, so the reference caught them mid-frame and no two runs can
  //    agree. Selector is `canvas`, not `canvas[data-slitscan]`: R4 replaced
  //    the hero band with a different engine and the narrower selector would
  //    have quietly stopped masking it
  //  - the founder photos, which ship as AVIF here and were JPEG in the
  //    reference. A re-encode differs in every pixel by construction. The
  //    photos are asserted separately in tests/visual.spec.ts: they load, they
  //    are the right size, and they sit on Manila.
  const masks = [
    ...(await page.locator("canvas").all()),
    ...(await page.locator(".pic img").all()),
  ];

  // ---- capture phase ----
  // The reference boards were each captured at their own origin. Here the
  // sections sit at fractional Y inside one continuous page, and Chromium
  // snaps scroll offsets, so the section cannot always be landed on the same
  // sub-pixel phase the reference had. Glyph edges then disagree by a few
  // units while sitting in exactly the right place.
  //
  // So the capture phase is searched rather than assumed: a handful of
  // sub-pixel scroll offsets are tried and the closest is kept. This removes a
  // property of the capture, not a property of the build. Layout is asserted
  // separately and exactly by the geometry test in tests/visual.spec.ts, which
  // compares fractional element positions against the reference directly.
  // The last section cannot be scrolled to the top of the viewport because the
  // page runs out of scroll, which pins it at whatever sub-pixel phase it
  // happens to land on. A temporary spacer gives every section room to reach
  // the top. It is removed before the next section is measured.
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.id = "__capture_spacer";
    spacer.style.height = "150vh";
    spacer.setAttribute("aria-hidden", "true");
    document.body.appendChild(spacer);
  });

  const measure = async (nudge) =>
    page.evaluate(
      ([from, to, nudge]) => {
        const a = document.querySelector(from);
        const b = to ? document.querySelector(to) : a;
        const absTop = a.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, absTop + nudge);
        const fa = a.getBoundingClientRect();
        const fb = b.getBoundingClientRect();
        return {
          x: 0,
          y: Math.round(fa.top),
          width: Math.round(window.innerWidth),
          height: Math.round(fb.bottom - fa.top),
        };
      },
      [sec.selector, sec.through ?? null, nudge],
    );

  // grow the viewport first if the section is taller than it
  const probe = await measure(0);
  if (probe.height > 900) {
    await page.setViewportSize({ width: sec.width, height: Math.ceil(probe.height) + 40 });
    await page.waitForTimeout(150);
  }

  const refPathEarly = join(REF, `${sec.name}.png`);
  if (!existsSync(refPathEarly)) {
    results.push({ name: sec.name, status: "no reference" });
    await page.close();
    continue;
  }
  const expectedEarly = PNG.sync.read(readFileSync(refPathEarly));

  let shot = null;
  let bestPhase = null;
  for (const nudge of [0, -0.5, 0.5, -0.25, 0.25]) {
    const clip = await measure(nudge);
    const buf = await page.screenshot({
      clip,
      mask: masks,
      maskColor: "#FF00FF",
      animations: "disabled",
    });
    const png = PNG.sync.read(buf);
    const score = quickScore(png, expectedEarly);
    if (bestPhase === null || score < bestPhase) {
      bestPhase = score;
      shot = buf;
    }
  }

  await page.evaluate(() => document.getElementById("__capture_spacer")?.remove());

  const actual = PNG.sync.read(shot);
  const expected = expectedEarly;

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

/** Cheap luminance distance over a subsample, used only to pick the best phase. */
function quickScore(a, b) {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let sum = 0;
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const i = (a.width * y + x) << 2;
      const j = (b.width * y + x) << 2;
      sum +=
        Math.abs(a.data[i] - b.data[j]) +
        Math.abs(a.data[i + 1] - b.data[j + 1]) +
        Math.abs(a.data[i + 2] - b.data[j + 2]);
    }
  }
  return sum;
}

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

/**
 * Per-section allowances, and the reason each one exists.
 *
 * The boards in handoff/reference are the APPROVED DESIGN, and they carry R2
 * copy. R3 replaced copy in three of these frames on the client's
 * instruction, so those frames now differ from their board by glyphs. That is
 * the change, not a regression, and re-shooting the boards to match would
 * throw away the only independent record of what was approved.
 *
 * So the gate stays at 0.8% everywhere, and the frames whose words changed
 * carry a written allowance sized just above the measured diff. Anything past
 * that still fails, which is the point: a real regression in one of these
 * sections is still caught, it just has a higher floor.
 *
 * The allowance covers DIFFERING PIXELS ONLY. Δh and align are reported
 * separately and are not relaxed by anything here: the layout still has to
 * port exactly, and 08-mobile's +50 is text reflow in a column, not a frame
 * that moved.
 *
 * Delete an entry the moment its board is re-shot.
 */
const ALLOW = {
  "02-breakdown": {
    pct: 1.1,
    why: "R3: eyebrow, lead and step 1 rewritten for the 15-minute offer (was 0.397)",
  },
  "06-cta-founders": {
    pct: 5.2,
    why: "R3+R4: both founder roles, Sean's bio and quote, the Last thing block, the After row (was 0.411)",
  },
  "08-mobile": {
    pct: 11.5,
    why: "R3: the same copy reflowed at 390. The longer bios add 50px of column (was 0.563)",
  },
};

let failed = 0;
console.log("\nSection                    diff%    pixels      actual        reference   Δh  align");
console.log("-".repeat(92));
for (const r of results) {
  if (r.status !== "compared") {
    console.log(`${r.name.padEnd(24)}  ${r.status}`);
    failed++;
    continue;
  }
  const allow = ALLOW[r.name];
  const limit = allow ? allow.pct : THRESHOLD;
  const flag = r.pct <= limit ? (allow ? "ok*" : "ok") : "OVER";
  if (r.pct > limit) failed++;
  console.log(
    `${r.name.padEnd(24)}  ${r.pct.toFixed(3).padStart(6)}  ${String(r.differing).padStart(8)}  ${r.actualSize.padStart(11)}  ${r.refSize.padStart(11)}  ${String(r.heightDelta).padStart(4)}  ${String(r.align).padStart(5)}  ${flag}`,
  );
}
console.log("-".repeat(92));
console.log(`threshold ${THRESHOLD}% differing pixels per section`);
const used = results.filter((r) => ALLOW[r.name]);
if (used.length > 0) {
  console.log("\n* copy changed since the board was shot, so this frame runs on an allowance:");
  for (const r of used) {
    console.log(`    ${r.name.padEnd(18)} limit ${String(ALLOW[r.name].pct).padStart(5)}%   ${ALLOW[r.name].why}`);
  }
}
console.log("");
process.exit(failed > 0 ? 1 : 0);
