import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { writeFileSync } from "node:fs";
const b = await chromium.launch({ args:["--hide-scrollbars","--force-color-profile=srgb"] });
async function shot(url, sel, w=1440) {
  const p = await b.newPage({ viewport:{width:w,height:900}, deviceScaleFactor:2, reducedMotion:"reduce" });
  await p.goto(url,{waitUntil:"networkidle"});
  await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(250);
  const masks = await p.locator("canvas").all();
  const buf = await p.locator(sel).first().screenshot({ mask:masks, maskColor:"#FF00FF", animations:"disabled" });
  await p.close(); return PNG.sync.read(buf);
}
const cases = [
  ["03-credibility", "http://127.0.0.1:8900/reference/03-credibility.html", ".board", "http://127.0.0.1:4321/", "section.band", 1440],
  ["01-hero", "http://127.0.0.1:8900/reference/01-hero.html", ".board", "http://127.0.0.1:4321/", "header.hero", 1440],
  ["02-breakdown", "http://127.0.0.1:8900/reference/02-breakdown.html", ".board", "http://127.0.0.1:4321/", "#breakdown", 1440],
];
for (const [name, rurl, rsel, aurl, asel, w] of cases) {
  const R = await shot(rurl, rsel, w), A = await shot(aurl, asel, w);
  const ww=Math.min(R.width,A.width), hh=Math.min(R.height,A.height);
  const a=crop(A,ww,hh), r=crop(R,ww,hh); sync(a,r);
  const d=new PNG({width:ww,height:hh});
  const n=pixelmatch(a.data,r.data,d.data,ww,hh,{threshold:0.12,includeAA:false});
  console.log(name.padEnd(18), ((n/(ww*hh))*100).toFixed(3)+"%", ` ref ${R.width}x${R.height}  build ${A.width}x${A.height}`);
  writeFileSync(`tests/__screenshots__/live-${name}-diff.png`, PNG.sync.write(d));
}
await b.close();
function crop(p,w,h){ if(p.width===w&&p.height===h) return p; const o=new PNG({width:w,height:h}); PNG.bitblt(p,o,0,0,w,h,0,0); return o; }
function sync(a,b){ for(let i=0;i<a.data.length;i+=4){ if(a.data[i]===255&&a.data[i+1]===0&&a.data[i+2]===255){b.data[i]=255;b.data[i+1]=0;b.data[i+2]=255;b.data[i+3]=a.data[i+3];} } }
