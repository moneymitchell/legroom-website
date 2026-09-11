import { chromium } from "playwright";
const b = await chromium.launch({ args:["--hide-scrollbars","--force-color-profile=srgb"] });
async function styles(url, sel, props) {
  const p = await b.newPage({ viewport:{width:1440,height:900} });
  await p.goto(url,{waitUntil:"networkidle"});
  await p.evaluate(()=>document.fonts.ready);
  const r = await p.evaluate(([sel,props])=>{
    const e=document.querySelector(sel); if(!e) return null;
    const c=getComputedStyle(e); const o={};
    for(const k of props) o[k]=c.getPropertyValue(k);
    o.__text = (e.textContent||"").trim().slice(0,28);
    return o;
  },[sel,props]);
  await p.close(); return r;
}
const props=["font-family","font-size","font-weight","line-height","letter-spacing","color","-webkit-font-smoothing","font-feature-settings","font-variation-settings","text-rendering","font-synthesis-weight","font-optical-sizing"];
const pairs=[[".cg .body","body copy"],[".cg h2","h2"],[".res","result"],[".fact","fact chip"],[".eyebrow","eyebrow"]];
for (const [sel,label] of pairs) {
  const r = await styles("http://127.0.0.1:8900/reference/03-credibility.html", sel, props);
  const a = await styles("http://127.0.0.1:4321/", sel, props);
  const diffs=[];
  for (const k of props) if (r && a && r[k]!==a[k]) diffs.push(`${k}: ref="${r[k]}" build="${a[k]}"`);
  console.log(`\n${label}  (${sel})  ref text: ${r?r.__text:"n/a"}`);
  console.log(diffs.length? "  "+diffs.join("\n  ") : "  identical");
}
await b.close();
