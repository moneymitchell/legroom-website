import { chromium } from "playwright";
const b = await chromium.launch({ args:["--hide-scrollbars"] });
async function probe(url, root, sels) {
  const p = await b.newPage({ viewport:{width:1440,height:900} });
  await p.goto(url,{waitUntil:"networkidle"}); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(200);
  const o = await p.evaluate(([root,sels])=>{
    const R=document.querySelector(root).getBoundingClientRect();
    const out={};
    for (const [k,s] of Object.entries(sels)) {
      const e=document.querySelector(s); if(!e){out[k]=null;continue;}
      const r=e.getBoundingClientRect(); const c=getComputedStyle(e);
      out[k]={top:+(r.top-R.top).toFixed(3), h:+r.height.toFixed(3), lh:c.lineHeight, fs:c.fontSize, mb:c.marginBottom, mt:c.marginTop, ff:c.fontFamily.split(",")[0]};
    }
    return out;
  },[root,sels]);
  await p.close(); return o;
}
const sels={ eyebrowL:".cg > div:nth-child(1) > .eyebrow", h2:".cg h2", bodyP:".cg > div:nth-child(1) > p:not(.eyebrow)", facts:".facts", fact1:".fact", footP:".band .small:last-of-type", cg:".cg" };
const ref=await probe("http://127.0.0.1:8900/reference/03-credibility.html",".board",sels);
const act=await probe("http://127.0.0.1:4321/","section.band",sels);
for (const k of Object.keys(sels)) {
  const r=ref[k],a=act[k];
  if(!r||!a){console.log(k,"missing",!r?"ref":"build");continue;}
  console.log(k.padEnd(11), "ref top",String(r.top).padStart(8),"h",String(r.h).padStart(7),"| build top",String(a.top).padStart(8),"h",String(a.h).padStart(7),
    "| Δtop",String((a.top-r.top).toFixed(3)).padStart(7),"Δh",String((a.h-r.h).toFixed(3)).padStart(7));
  if (r.lh!==a.lh||r.fs!==a.fs||r.mb!==a.mb||r.mt!==a.mt) console.log("   styles ref",JSON.stringify({lh:r.lh,fs:r.fs,mt:r.mt,mb:r.mb}),"build",JSON.stringify({lh:a.lh,fs:a.fs,mt:a.mt,mb:a.mb}));
}
await b.close();
