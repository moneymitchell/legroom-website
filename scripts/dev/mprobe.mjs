import { chromium } from "playwright";
const b = await chromium.launch({ args:["--hide-scrollbars"] });
async function probe(url, root, sels) {
  const p = await b.newPage({ viewport:{width:390,height:900} });
  await p.goto(url,{waitUntil:"networkidle"}); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(250);
  const o = await p.evaluate(([root,sels])=>{
    const R=document.querySelector(root).getBoundingClientRect();
    const out={ __root:{h:+R.height.toFixed(2)} };
    for (const [k,s] of Object.entries(sels)) {
      const e=document.querySelector(s); if(!e){out[k]=null;continue;}
      const r=e.getBoundingClientRect();
      out[k]={top:+(r.top-R.top).toFixed(2), h:+r.height.toFixed(2), w:+r.width.toFixed(2)};
    }
    return out;
  },[root,sels]);
  await p.close(); return o;
}
const refSels={ nav:".mnav", logo:".mnav img", chip:".chip", h1:"h1", p:".mb p", cta:".mcta", btn1:".mcta .btn", slot:".mslot", strip:".mstrip", fact1:".mstrip .fact" };
const actSels={ nav:".nav", logo:".nav img", chip:".chip", h1:"h1", p:".sub", cta:".cta", btn1:".cta .btn", slot:".mslot", strip:".mstrip", fact1:".mstrip .fact" };
const ref=await probe("http://127.0.0.1:8900/reference/08-mobile.html",".board",refSels);
const act=await probe("http://127.0.0.1:4321/","header.hero",actSels);
console.log("root height  ref",ref.__root.h," build",act.__root.h," Δ",(act.__root.h-ref.__root.h).toFixed(2));
console.log("\nelem     ref{top,h,w}                 build{top,h,w}                Δtop     Δh");
for (const k of Object.keys(refSels)) {
  const r=ref[k],a=act[k];
  if(!r||!a){console.log(k.padEnd(8),!r?"MISSING ref":"MISSING build");continue;}
  console.log(k.padEnd(8), JSON.stringify(r).padEnd(30), JSON.stringify(a).padEnd(30), String((a.top-r.top).toFixed(2)).padStart(7), String((a.h-r.h).toFixed(2)).padStart(7));
}
await b.close();
