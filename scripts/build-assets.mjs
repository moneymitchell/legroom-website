/**
 * Derived image assets. Run with `npm run assets` after changing a source photo
 * or the brand marks. Output is committed, so the build itself stays free of
 * image processing.
 *
 * Produces:
 *   photos/*.avif, *.webp   founder headshots, from the handoff JPGs
 *   og-image.jpg            1200x630 share card, composed from the brand assets
 *   favicon.svg             the seat mark, charcoal on paper
 *   favicon.ico             32px + 16px
 *   apple-touch-icon.png    180px, bone mark on charcoal (never on yellow)
 *   icon-192.png / -512.png PWA-sized app icons
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");

const PAPER = "#F4F1EA";
const CHARCOAL = "#1C1C1A";
const YELLOW = "#FFC800";

const log = (m) => console.log("  " + m);

/* --- 1. founder photos ---------------------------------------------------- */
// Displayed at 192x256 CSS, so 480x640 covers 2x. Re-encode, do not upscale.
for (const name of ["jd-photo", "sean-photo"]) {
  const src = join(pub, "photos", `${name}.jpg`);
  const input = readFileSync(src);
  await sharp(input).avif({ quality: 62, effort: 6 }).toFile(join(pub, "photos", `${name}.avif`));
  await sharp(input).webp({ quality: 78, effort: 6 }).toFile(join(pub, "photos", `${name}.webp`));
  log(`photos/${name}.{avif,webp}`);
}

/* --- 2. Open Graph card --------------------------------------------------- */
// Paper ground, charcoal lockup, one yellow rule. Built from the real brand
// files so it can never drift from the site.
{
  const lockup = readFileSync(join(pub, "brand", "lockup-charcoal.svg"));
  const W = 1200;
  const H = 630;
  const lockupW = 760;
  const lockupBuf = await sharp(lockup, { density: 400 })
    .resize({ width: lockupW })
    .png()
    .toBuffer();
  const meta = await sharp(lockupBuf).metadata();

  const caption = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
       <rect x="220" y="${Math.round(H / 2 + 46)}" width="760" height="14" fill="${YELLOW}" opacity="0.92"/>
       <text x="${W / 2}" y="${H - 120}" text-anchor="middle"
             font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="30" fill="#6B675E">
         We find the work eating your team&#8217;s week.
       </text>
       <text x="${W / 2}" y="${H - 66}" text-anchor="middle"
             font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="22"
             letter-spacing="4" fill="#96917F">
         LEGROOMCOMPANY.COM
       </text>
     </svg>`,
  );

  await sharp({
    create: { width: W, height: H, channels: 3, background: PAPER },
  })
    .composite([
      {
        input: lockupBuf,
        left: Math.round((W - lockupW) / 2),
        top: Math.round(H / 2 - (meta.height ?? 150) / 2 - 40),
      },
      { input: caption, left: 0, top: 0 },
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(join(pub, "og-image.jpg"));
  log("og-image.jpg (1200x630)");
}

/* --- 3. favicons + app icons --------------------------------------------- */
{
  // The brand rule: the icon is bone on charcoal in every context, like a black
  // Apple. Never the yellow mark, never the mark on yellow.
  const markBone = readFileSync(join(pub, "brand", "mark-bone.svg"));
  const markCharcoal = readFileSync(join(pub, "brand", "mark-charcoal.svg"));

  // favicon.svg: charcoal mark on paper, scales to any size
  const svgSrc = readFileSync(join(pub, "brand", "mark-charcoal.svg"), "utf8");
  const inner = svgSrc.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  writeFileSync(
    join(pub, "favicon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-90 -160 1180 1100">` +
      `<rect x="-90" y="-160" width="1180" height="1100" fill="${PAPER}"/>` +
      inner +
      `</svg>\n`,
  );
  log("favicon.svg");

  const onCharcoal = async (size, padRatio = 0.18) => {
    const inset = Math.round(size * padRatio);
    const markW = size - inset * 2;
    const mark = await sharp(markBone, { density: 600 }).resize({ width: markW }).png().toBuffer();
    const m = await sharp(mark).metadata();
    return sharp({
      create: { width: size, height: size, channels: 3, background: CHARCOAL },
    })
      .composite([{ input: mark, left: inset, top: Math.round((size - (m.height ?? markW)) / 2) }])
      .png()
      .toBuffer();
  };

  writeFileSync(join(pub, "apple-touch-icon.png"), await onCharcoal(180));
  writeFileSync(join(pub, "icon-192.png"), await onCharcoal(192));
  writeFileSync(join(pub, "icon-512.png"), await onCharcoal(512));
  log("apple-touch-icon.png, icon-192.png, icon-512.png");

  // favicon.ico: charcoal mark on paper at 32 and 16
  const icoPng = async (size) => {
    const inset = Math.round(size * 0.08);
    const markW = size - inset * 2;
    const mark = await sharp(markCharcoal, { density: 600 })
      .resize({ width: markW })
      .png()
      .toBuffer();
    const m = await sharp(mark).metadata();
    return sharp({ create: { width: size, height: size, channels: 3, background: PAPER } })
      .composite([{ input: mark, left: inset, top: Math.round((size - (m.height ?? markW)) / 2) }])
      .png()
      .toBuffer();
  };
  writeFileSync(join(pub, "favicon.ico"), buildIco([await icoPng(32), await icoPng(16)]));
  log("favicon.ico (32 + 16)");
}

console.log("\nassets built\n");

/**
 * Minimal ICO container around PNG frames. The format is a 6-byte header plus a
 * 16-byte directory entry per image, then the PNG payloads. Browsers have
 * accepted PNG-in-ICO since IE6.
 */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  const payloads = [];
  let offset = 6 + 16 * pngs.length;

  for (const png of pngs) {
    // width/height live at bytes 16..24 of the PNG IHDR
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    const e = Buffer.alloc(16);
    e.writeUInt8(w >= 256 ? 0 : w, 0);
    e.writeUInt8(h >= 256 ? 0 : h, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    payloads.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...payloads]);
}
