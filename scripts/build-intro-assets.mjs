/**
 * ============================================================================
 * Intro assets. Run by hand with `node scripts/build-intro-assets.mjs` after
 * changing a source image or a cloud shape. OUTPUT IS COMMITTED, the same
 * arrangement build-assets.mjs uses for the founder photos, so the site build
 * never touches an image.
 *
 * Produces, in public/intro/:
 *
 *   sky-desktop.webp        1600 wide, the cabin illustration for 1x displays
 *   sky-desktop-2x.webp     2000 wide, for dense displays
 *   sky-desktop-depth.webp  the depth map, copied as is
 *   clouds.webp             a 4x2 atlas of eight drawn clouds, with alpha
 *
 * SOURCES ARE NOT IN THIS REPO. The illustration is a ChatGPT original on JD's
 * Desktop and there is no PSD and no vector. The depth map was made from it
 * with Depth Anything V2 and verified by eye: white is near, black is far, and
 * it separates legs and shoes from cabin walls from sky cleanly. A missing
 * source blocks a REBUILD, never a deploy, because the outputs are committed.
 *
 * WHY THE DENSE PLATE IS 2000 WIDE AND NOT 2400. It is a WebGL texture now,
 * not an <img>. A 2400x1351 RGBA upload is 13MB through texImage2D on the
 * main thread, and that is a long task on exactly the visitors the intro is
 * for. 2000x1125 is 9MB, and at 1440 CSS px on a 2x display it is 0.69 of
 * native, which on flat art with charcoal outlines is the point where you
 * stop being able to tell.
 *
 * THE CLOUDS ARE DRAWN, NOT CUT. Sprites lifted from the illustration come out
 * clipped wherever a cloud met another cloud or the frame edge, and a raster
 * cloud scaled twenty times in a fly through pixelates into a blob. So they
 * are authored here as SVG in the illustration's own language: a flat base
 * with a tapering tail, a run of circular arcs of uneven radius along the top,
 * one pale blue grey lobe for shading, a thin charcoal outline. Which is,
 * looking closely at the original, exactly how those clouds were constructed
 * in the first place. Rasterised at 512px per cell so the biggest on screen
 * scale stays under 4x.
 * ========================================================================= */
import sharp from "sharp";
import { existsSync, mkdirSync, statSync, copyFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "intro");
const desk = join(homedir(), "Desktop", "Legroom");

const PLATE = join(desk, "ChatGPT Image Sep 8, 2026, 01_16_00 AM.png");
const DEPTH = join(desk, "intro-assets", "sky-desktop-depth.webp");

for (const f of [PLATE, DEPTH]) {
  if (!existsSync(f)) {
    console.error(`\n  missing source: ${f}\n  See the header of this script.\n`);
    process.exit(1);
  }
}
mkdirSync(out, { recursive: true });
const log = (m) => console.log("  " + m);
const kb = (p) => (statSync(p).size / 1024).toFixed(1) + "KB";

/* --- 1. the plates -------------------------------------------------------- */
for (const [name, width, quality] of [
  ["sky-desktop.webp", 1600, 66],
  ["sky-desktop-2x.webp", 2000, 58],
]) {
  const dest = join(out, name);
  await sharp(PLATE).resize({ width }).webp({ quality, effort: 6 }).toFile(dest);
  const m = await sharp(dest).metadata();
  log(`${name.padEnd(24)} ${m.width}x${m.height}  ${kb(dest)}`);
}

/* --- 2. the depth map ----------------------------------------------------- */
{
  const dest = join(out, "sky-desktop-depth.webp");
  copyFileSync(DEPTH, dest);
  const m = await sharp(dest).metadata();
  log(`${"sky-desktop-depth.webp".padEnd(24)} ${m.width}x${m.height}  ${kb(dest)}`);
}

/* --- 3. the sky colour, for the record ------------------------------------ */
// The renderer needs the illustration's own blue: the near geometry fades to
// it, and the sky lifts FROM it to the paper token. It is sampled here rather
// than typed in, and the value is printed so the constant in
// src/scripts/intro/timing.ts can be checked against it.
{
  const { data, info } = await sharp(PLATE).raw().toBuffer({ resolveWithObject: true });
  const at = (xr, yr) => {
    const i = (Math.round(yr * info.height) * info.width + Math.round(xr * info.width)) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const [r, g, b] = at(0.5, 0.3);
  log(`sky colour at 50%,30%:   rgb(${r}, ${g}, ${b})  #${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
}

/* --- 4. the clouds -------------------------------------------------------- */
/**
 * A cloud is a baseline and a run of arcs. Each bump is [centre x, radius], in
 * a 512 unit box. The path walks the top of the bumps left to right with
 * circular arcs, drops to the baseline, and returns along it, with the base
 * extended into a thin tail on one side the way the illustration's clouds
 * trail off. The shading lobe is the lower part of the two or three largest
 * bumps, pushed down and right, clipped to the cloud.
 */
const FILL = "#FEFAF2"; // sampled from the illustration's clouds
const SHADE = "#D5E5F5"; // the pale blue grey lobe
const INK = "#1C1C1A"; // --charcoal
const STROKE = 3.2; // about 2px at the illustration's scale, on a 512 cell

const CLOUDS = [
  // wide cumulus, tail left
  { base: 330, bumps: [[150, 46], [222, 70], [305, 84], [385, 58], [440, 36]], tail: [-1, 70] },
  // three round lobes
  { base: 320, bumps: [[170, 62], [258, 88], [350, 66]], tail: [1, 40] },
  // long and low
  { base: 300, bumps: [[110, 30], [170, 42], [240, 50], [312, 44], [380, 52], [440, 34]], tail: [-1, 60] },
  // tall, two tiers
  { base: 340, bumps: [[190, 54], [262, 100], [352, 74], [416, 46]], tail: [1, 38] },
  // small puff
  { base: 300, bumps: [[210, 44], [268, 58], [326, 46]], tail: [-1, 30] },
  // wide, tail right
  { base: 325, bumps: [[120, 40], [190, 64], [270, 80], [356, 72], [420, 44]], tail: [1, 40] },
  // lopsided
  { base: 318, bumps: [[160, 50], [232, 92], [326, 56], [382, 40]], tail: [-1, 48] },
  // thin sliver, the distant kind
  { base: 290, bumps: [[190, 22], [240, 30], [296, 34], [352, 26], [400, 18]], tail: [-1, 90] },
];

function cloudSvg({ base, bumps, tail }) {
  const first = bumps[0];
  const last = bumps[bumps.length - 1];
  const left = first[0] - first[1];
  const right = last[0] + last[1];
  const [side, len] = tail;
  // A cloud that leaves its cell gets a hard vertical edge in the atlas that
  // reads as a cut sprite, which is the one thing these exist not to be.
  const extentL = side < 0 ? left - len : left;
  const extentR = side > 0 ? right + len : right;
  if (extentL < 8 || extentR > 504 || base + 6 > 504) {
    throw new Error(`cloud leaves its 512 cell: x ${extentL}..${extentR}, base ${base}`);
  }
  // top run: start at the left edge of the first bump on the baseline, arc
  // over each bump to where it meets the next
  let d = `M ${left} ${base}`;
  for (let i = 0; i < bumps.length; i++) {
    const [cx, r] = bumps[i];
    const nx = i + 1 < bumps.length ? bumps[i + 1][0] - bumps[i + 1][1] * 0.55 : cx + r;
    const ny = i + 1 < bumps.length ? base - Math.sqrt(Math.max(0, r * r - (nx - cx) ** 2)) : base;
    d += ` A ${r} ${r} 0 0 1 ${nx.toFixed(1)} ${ny.toFixed(1)}`;
  }
  // baseline back, with the tail: the base runs on past the lobes and rises
  // to a point, so the underside reads as one flat plane seen from below
  if (side > 0) {
    d += ` L ${right + len} ${base - 6} L ${right + len - 4} ${base + 4} L ${left} ${base + 4} Z`;
  } else {
    d += ` L ${right} ${base + 4} L ${left - len + 4} ${base + 4} L ${left - len} ${base - 6} Z`;
  }
  // shading: ONE lobe, low and to the right, clipped by the cloud so it never
  // escapes the outline. The illustration's clouds are almost entirely the
  // near white; the blue grey is a single soft shape in the lower right
  // quarter and a thin line along the base. The first pass shaded three
  // bumps at 0.86 of their radius and the whole cloud went blue.
  const big = bumps.slice().sort((a, b) => b[1] - a[1]).slice(0, 2);
  const shade = big
    .map(([cx, r]) => `<circle cx="${(cx + r * 0.55).toFixed(1)}" cy="${(base + r * 0.05).toFixed(1)}" r="${(r * 0.62).toFixed(1)}"/>`)
    .join("");
  const id = Math.random().toString(36).slice(2, 8);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><clipPath id="c${id}"><path d="${d}"/></clipPath></defs>
  <path d="${d}" fill="${FILL}"/>
  <g clip-path="url(#c${id})" fill="${SHADE}">${shade}<rect x="0" y="${base - 9}" width="512" height="20"/></g>
  <path d="${d}" fill="none" stroke="${INK}" stroke-width="${STROKE}" stroke-linejoin="round"/>
</svg>`;
}

{
  const CELL = 512;
  const COLS = 4;
  const ROWS = 2;
  const tiles = [];
  for (let i = 0; i < CLOUDS.length; i++) {
    const png = await sharp(Buffer.from(cloudSvg(CLOUDS[i]))).png().toBuffer();
    tiles.push({ input: png, left: (i % COLS) * CELL, top: Math.floor(i / COLS) * CELL });
  }
  const dest = join(out, "clouds.webp");
  await sharp({ create: { width: CELL * COLS, height: CELL * ROWS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(tiles)
    .webp({ quality: 84, alphaQuality: 90, effort: 6 })
    .toFile(dest);
  log(`${"clouds.webp".padEnd(24)} ${CELL * COLS}x${CELL * ROWS}  ${kb(dest)}  (${CLOUDS.length} clouds, ${CELL}px cells)`);
  // a contact sheet for eyeballing, not committed
  const sheet = join(root, ".astro", "clouds-preview.png");
  mkdirSync(dirname(sheet), { recursive: true });
  await sharp(dest).flatten({ background: "#1579db" }).png().toFile(sheet);
  log(`preview at .astro/clouds-preview.png`);
}

console.log("\n  intro assets built\n");
