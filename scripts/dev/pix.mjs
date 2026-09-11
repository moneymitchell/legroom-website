import { chromium } from "playwright";
import { PNG } from "pngjs";
const b = await chromium.launch({ args:["--hide-scrollbars","--force-color-profile=srgb"] });
async function shot(url, sel) {
  const p = await b.newPage({ viewport:{width:1440,height:900}, deviceScaleFactor:2, reducedMotion:"reduce" });
  await p.goto(url,{waitUntil:"networkidle"});
  await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(250);
  const buf = await p.locator(sel).first().screenshot({ animations:"disabled" });
  await p.close(); return PNG.sync.read(buf);
}
const R = await shot("http://127.0.0.1:8900/reference/03-credibility.html", ".board");
const A = await shot("http://127.0.0.1:4321/", "section.band");
// crop the eyebrow "PROOF, NOT PROMISES" : 2x coords approx x 240..580, y 158..180
function sample(png, x0,y0,x1,y1,label){
  let colored=0,total=0; const seen=new Map();
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
    const i=(png.width*y+x)<<2;
    const r=png.data[i],g=png.data[i+1],bl=png.data[i+2];
    total++;
    if(!(r===g&&g===bl)) colored++;
    const k=`${r},${g},${bl}`; seen.set(k,(seen.get(k)||0)+1);
  }
  const top=[...seen.entries()].sort((p,q)=>q[1]-p[1]).slice(0,4).map(([k,v])=>`${k}(${v})`).join("  ");
  console.log(`${label}: subpixel-coloured ${((colored/total)*100).toFixed(1)}%  top: ${top}`);
}
sample(R,240,155,600,182,"reference eyebrow");
sample(A,240,155,600,182,"build     eyebrow");
sample(R,240,470,980,600,"reference body   ");
sample(A,240,470,980,600,"build     body   ");
await b.close();
