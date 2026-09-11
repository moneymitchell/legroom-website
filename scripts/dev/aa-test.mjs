import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { readFileSync } from "node:fs";
const REF = "../handoff/reference/screens/03-credibility.png";
const variants = [
  { name: "hinting=none", args: ["--hide-scrollbars","--force-color-profile=srgb","--font-render-hinting=none"] },
  { name: "hinting=medium", args: ["--hide-scrollbars","--force-color-profile=srgb","--font-render-hinting=medium"] },
  { name: "default", args: ["--hide-scrollbars","--force-color-profile=srgb"] },
  { name: "lcd-off", args: ["--hide-scrollbars","--force-color-profile=srgb","--disable-lcd-text"] },
];
const expected = PNG.sync.read(readFileSync(REF));
for (const v of variants) {
  const b = await chromium.launch({ args: v.args });
  const p = await b.newPage({ viewport:{width:1440,height:900}, deviceScaleFactor:2, reducedMotion:"reduce" });
  await p.goto("http://127.0.0.1:4321/", { waitUntil:"networkidle" });
  await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(200);
  const shot = await p.locator("section.band").first().screenshot({ animations:"disabled" });
  const a = PNG.sync.read(shot);
  const w = Math.min(a.width,expected.width), h = Math.min(a.height,expected.height);
  const A = crop(a,w,h), B = crop(expected,w,h);
  const d = new PNG({width:w,height:h});
  const n = pixelmatch(A.data,B.data,d.data,w,h,{threshold:0.12,includeAA:false});
  console.log(v.name.padEnd(16), ((n/(w*h))*100).toFixed(3)+"%");
  await b.close();
}
function crop(p,w,h){ if(p.width===w&&p.height===h) return p; const o=new PNG({width:w,height:h}); PNG.bitblt(p,o,0,0,w,h,0,0); return o; }
