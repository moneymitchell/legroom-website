/**
 * Establishes the irreducible floor: render the ORIGINAL handoff HTML in this
 * Playwright Chromium and diff it against its own reference PNG. Anything that
 * shows up here is the capture environment, not the port.
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { readFileSync } from "node:fs";
const REFDIR = "../handoff/reference/screens";
const cases = [
  ["01-hero", "http://127.0.0.1:8900/reference/01-hero.html", ".board", 1440],
  ["02-breakdown", "http://127.0.0.1:8900/reference/02-breakdown.html", ".board", 1440],
  ["03-credibility", "http://127.0.0.1:8900/reference/03-credibility.html", ".board", 1440],
  ["04-promise", "http://127.0.0.1:8900/reference/04-promise.html", ".board", 1440],
  ["06-cta-founders", "http://127.0.0.1:8900/reference/06-cta-founders.html", ".board", 1440],
  ["08-mobile", "http://127.0.0.1:8900/reference/08-mobile.html", ".board", 390],
];
const b = await chromium.launch({ args:["--hide-scrollbars","--force-color-profile=srgb"] });
console.log("\nSELF-DIFF: reference HTML rendered here, vs its own PNG");
console.log("section                 floor%   size");
console.log("-".repeat(52));
for (const [name,url,sel,w0] of cases) {
  const p = await b.newPage({ viewport:{width:w0,height:900}, deviceScaleFactor:2, reducedMotion:"reduce" });
  await p.goto(url,{waitUntil:"networkidle"});
  await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(250);
  const masks = await p.locator("canvas").all();
  const shot = await p.locator(sel).first().screenshot({ mask:masks, maskColor:"#FF00FF", animations:"disabled" });
  const a = PNG.sync.read(shot);
  const e = PNG.sync.read(readFileSync(`${REFDIR}/${name}.png`));
  const w=Math.min(a.width,e.width), h=Math.min(a.height,e.height);
  const A=crop(a,w,h), B=crop(e,w,h); sync(A,B);
  const d=new PNG({width:w,height:h});
  const n=pixelmatch(A.data,B.data,d.data,w,h,{threshold:0.12,includeAA:false});
  console.log(name.padEnd(22), ((n/(w*h))*100).toFixed(3).padStart(6)+"%  "+`${a.width}x${a.height}`);
  await p.close();
}
await b.close();
function crop(p,w,h){ if(p.width===w&&p.height===h) return p; const o=new PNG({width:w,height:h}); PNG.bitblt(p,o,0,0,w,h,0,0); return o; }
function sync(a,b){ for(let i=0;i<a.data.length;i+=4){ if(a.data[i]===255&&a.data[i+1]===0&&a.data[i+2]===255){b.data[i]=255;b.data[i+1]=0;b.data[i+2]=255;b.data[i+3]=a.data[i+3];} } }
