/**
 * Build vs reference DESIGN, captured identically: both rendered in this
 * browser, both captured as their own element at their own origin. This
 * removes the reference PNG (a different capture session) as a variable and
 * answers the only question that matters: does the port differ from the design?
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
const b = await chromium.launch({ args:["--hide-scrollbars","--force-color-profile=srgb"] });
async function shot(url, sel, w, through) {
  const p = await b.newPage({ viewport:{width:w,height:900}, deviceScaleFactor:2, reducedMotion:"reduce" });
  await p.goto(url,{waitUntil:"networkidle"});
  await p.evaluate(()=>document.fonts.ready.then(()=>1));
  await p.evaluate(async()=>{const wt=(m)=>new Promise(r=>setTimeout(r,m));
    for(let y=0;y<document.body.scrollHeight;y+=innerHeight){scrollTo(0,y);await wt(40);}
    const rail=document.querySelector('.rail'); if(rail){rail.style.scrollBehavior='auto';rail.scrollTop=rail.scrollHeight;await wt(80);rail.scrollTop=0;await wt(80);}
    scrollTo(0,0);
    await Promise.all([...document.images].map(i=>i.complete?1:Promise.race([i.decode().catch(()=>{}),wt(2000)])));});
  const masks = await p.locator('canvas, .pic img').all();
  let buf;
  if (through) {
    const h = await p.evaluate(([f,t])=>{const a=document.querySelector(f),z=document.querySelector(t);return Math.ceil(z.getBoundingClientRect().bottom-a.getBoundingClientRect().top);},[sel,through]);
    await p.setViewportSize({width:w,height:h+60}); await p.waitForTimeout(200);
    const clip = await p.evaluate(([f,t])=>{const a=document.querySelector(f),z=document.querySelector(t);
      const abs=a.getBoundingClientRect().top+scrollY; scrollTo(0,abs);
      const fa=a.getBoundingClientRect(), fz=z.getBoundingClientRect();
      return {x:0,y:Math.round(fa.top),width:Math.round(innerWidth),height:Math.round(fz.bottom-fa.top)};},[sel,through]);
    buf = await p.screenshot({clip, mask:masks, maskColor:"#FF00FF", animations:"disabled"});
  } else {
    buf = await p.locator(sel).first().screenshot({ mask:masks, maskColor:"#FF00FF", animations:"disabled" });
  }
  await p.close(); return PNG.sync.read(buf);
}
const R="http://127.0.0.1:8900/reference/", A="http://127.0.0.1:4321/";
const cases = [
  ["01-hero",       R+"01-hero.html",".board", A,"header.hero",1440,null,null],
  ["02-breakdown",  R+"02-breakdown.html",".board", A,"#breakdown",1440,null,null],
  ["03-credibility",R+"03-credibility.html",".board", A,"section.band",1440,null,null],
  ["04-promise",    R+"04-promise.html",".board", A,"[aria-labelledby='promise-title']",1440,null,null],
  ["05-wordmark",   R+"05-wordmark-break.html",".board", A,"section.brk",1440,null,null],
  ["06-founders",   R+"06-cta-founders.html",".board", A,"#who-we-are",1440,null,"footer"],
  ["08-mobile",     R+"08-mobile.html",".board", A,"header.hero",390,null,null],
];
console.log("\nSection          build-vs-design%   pixels    build size     design size");
console.log("-".repeat(74));
let worst=0;
for (const [name,rurl,rsel,aurl,asel,w,_x,through] of cases) {
  const Rp = await shot(rurl,rsel,w,null);
  const Ap = await shot(aurl,asel,w,through);
  const ww=Math.min(Rp.width,Ap.width), hh=Math.min(Rp.height,Ap.height);
  const a=crop(Ap,ww,hh), r=crop(Rp,ww,hh); sync(a,r);
  let best=null;
  for(let dy=-2;dy<=2;dy++)for(let dx=-1;dx<=1;dx++){const S=shift(a,dx,dy);const d=new PNG({width:ww,height:hh});const n=pixelmatch(S.data,r.data,d.data,ww,hh,{threshold:0.12,includeAA:false});if(best===null||n<best)best=n;}
  const pct=(best/(ww*hh))*100; worst=Math.max(worst,pct);
  console.log(`${name.padEnd(16)} ${pct.toFixed(3).padStart(10)}%  ${String(best).padStart(9)}   ${(Ap.width+"x"+Ap.height).padStart(11)}   ${(Rp.width+"x"+Rp.height).padStart(11)}`);
}
console.log("-".repeat(74));
console.log(`worst section: ${worst.toFixed(3)}%\n`);
await b.close();
function crop(p,w,h){ if(p.width===w&&p.height===h) return p; const o=new PNG({width:w,height:h}); PNG.bitblt(p,o,0,0,w,h,0,0); return o; }
function sync(a,b){ for(let i=0;i<a.data.length;i+=4){ if(a.data[i]===255&&a.data[i+1]===0&&a.data[i+2]===255){b.data[i]=255;b.data[i+1]=0;b.data[i+2]=255;b.data[i+3]=a.data[i+3];} } }
function shift(png,dx,dy){ if(!dx&&!dy) return png; const o=new PNG({width:png.width,height:png.height});
  for(let y=0;y<png.height;y++){const sy=Math.min(png.height-1,Math.max(0,y-dy));for(let x=0;x<png.width;x++){const sx=Math.min(png.width-1,Math.max(0,x-dx));const si=(png.width*sy+sx)<<2;const di=(png.width*y+x)<<2;o.data[di]=png.data[si];o.data[di+1]=png.data[si+1];o.data[di+2]=png.data[si+2];o.data[di+3]=png.data[si+3];}}
  return o; }
