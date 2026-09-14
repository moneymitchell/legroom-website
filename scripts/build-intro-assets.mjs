/**
 * ============================================================================
 * Intro animation stills.
 *
 * Derived from the two ChatGPT originals on JD's Desktop, which are the only
 * full-quality copies that exist. There is no PSD and no vector: see
 * CC-PROMPT-INTRO-ANIMATION.md. The originals are NOT in this repo, so this
 * script is run by hand and its OUTPUT IS COMMITTED, the same arrangement
 * build-assets.mjs uses for the founder photos.
 *
 * WHY NOT REUSE website/assets/sky-*.webp
 *
 * Those are the coming soon page's hero, encoded to be looked at: a still
 * someone reads for thirty seconds. This image is on screen for two seconds on
 * a phone, in motion the whole time, and washed to paper over the last third.
 * Encoding it for the second job rather than the first takes mobile from 90KB
 * to 38KB, and on first visit this image is the Largest Contentful Paint, so
 * every one of those kilobytes is on the critical path. Detail nobody can
 * resolve while it is moving is detail worth spending.
 *
 * Four files, one per viewport tier and pixel ratio. The gate in Base.astro
 * picks exactly one and preloads it, so a visitor downloads a single image
 * rather than a srcset the browser has to choose from.
 *
 * THE DENSE TIER IS "-2x", NOT THE USUAL "@2x". Cloudflare's static asset
 * server answers a path containing @ with a 307 to the percent-encoded form:
 *
 *   GET /intro/sky-mobile@2x.webp  ->  307  Location: /intro/sky-mobile%402x.webp
 *
 * Which costs a round trip on the one request that is the Largest Contentful
 * Paint, and stops the <link rel=preload> matching the <img> that follows it,
 * so the plate is fetched twice and shows up late. On a retina phone that read
 * as flat blue where the illustration should be, for most of the intro. Every
 * phone and every modern laptop is on this tier, so it was the common case
 * rather than an edge one. Do not rename these back.
 * ========================================================================= */
import sharp from "sharp";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "intro");
const src = join(homedir(), "Desktop", "Legroom");

/** The originals. Landscape is the cabin at 1672x941, portrait at 941x1672. */
const LANDSCAPE = join(src, "ChatGPT Image Sep 8, 2026, 01_16_00 AM.png");
const PORTRAIT = join(src, "ChatGPT Image Sep 8, 2026, 01_17_59 AM.png");

for (const f of [LANDSCAPE, PORTRAIT]) {
  if (!existsSync(f)) {
    console.error(`\n  missing source: ${f}\n\n  This script reads the originals from JD's Desktop.`);
    console.error(`  The committed output in public/intro is what the site serves, so a`);
    console.error(`  missing source blocks a REBUILD, never a deploy.\n`);
    process.exit(1);
  }
}

mkdirSync(out, { recursive: true });

// Quality is set per tier rather than globally. The 2x files are only ever
// seen on a dense display where the extra pixels already carry the detail, so
// they can take a harder squeeze than the 1x files without showing it.
const TIERS = [
  { name: "sky-desktop.webp", from: LANDSCAPE, width: 1600, quality: 66 },
  { name: "sky-desktop-2x.webp", from: LANDSCAPE, width: 2400, quality: 54 },
  { name: "sky-mobile.webp", from: PORTRAIT, width: 720, quality: 64 },
  { name: "sky-mobile-2x.webp", from: PORTRAIT, width: 1080, quality: 54 },
];

let total = 0;
for (const t of TIERS) {
  const dest = join(out, t.name);
  await sharp(t.from)
    .resize({ width: t.width })
    .webp({ quality: t.quality, effort: 6 })
    .toFile(dest);
  const kb = statSync(dest).size / 1024;
  total += kb;
  const meta = await sharp(dest).metadata();
  console.log(`  intro/${t.name.padEnd(20)} ${meta.width}x${meta.height}  ${kb.toFixed(1)}KB`);
}

console.log(`\n  four tiers, ${total.toFixed(0)}KB on disk. One is served per visitor.\n`);
