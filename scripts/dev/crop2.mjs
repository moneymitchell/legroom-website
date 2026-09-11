import { chromium } from "playwright";
import { PNG } from "pngjs";
import { writeFileSync } from "node:fs";
const b = await chromium.launch({ args:["--hide-scrollbars","--force-color-profile=srgb"] });
async function shot(url, sel) {
  const p = await b.newPage({ viewport:{width:1440,height:900}, deviceScaleFactor:2, reducedMotion:"reduce" });
  await p.goto(url,{waitUntil:"networkidle"}); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(250);
  const buf = await p.locator(sel).first().screenshot({ animations:"disabled" });
  await p.close(); return PNG.sync.read(buf);
}
const R = await shot("http://127.0.0.1:8900/reference/03-credibility.html", ".board");
const A = await shot("http://127.0.0.1:4321/", "section.band");
const box = { x: 1180, y: 150, w: 900, h: 130 }; // "SELECTED WORK" + top of .work
function crop(p,x,y,w,h){ const o=new PNG({width:w,height:h}); PNG.bitblt(p,o,x,y,w,h,0,0); return o; }
const out = new PNG({ width: box.w, height: box.h*2+12 });
for (let i=0;i<out.data.length;i+=4){ out.data[i]=255;out.data[i+1]=255;out.data[i+2]=255;out.data[i+3]=255; }
PNG.bitblt(crop(R,box.x,box.y,box.w,box.h), out, 0,0,box.w,box.h, 0,0);
PNG.bitblt(crop(A,box.x,box.y,box.w,box.h), out, 0,0,box.w,box.h, 0,box.h+12);
writeFileSync("/private/tmp/claude-501/-Users-jdworcester-Desktop-BWL-blk-legroom-teardown/65980819-e817-4457-98ce-251bd349ec52/scratchpad/sw.png", PNG.sync.write(out));
console.log("top=reference bottom=build");
await b.close();
