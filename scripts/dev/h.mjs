import { chromium } from "playwright";
const b = await chromium.launch({ args:["--hide-scrollbars"] });
for (const [label,url,sel] of [["ref","http://127.0.0.1:8900/reference/03-credibility.html",".board"],["build","http://127.0.0.1:4321/","section.band"]]) {
  const p = await b.newPage({ viewport:{width:1440,height:900} });
  await p.goto(url,{waitUntil:"networkidle"}); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(200);
  const r = await p.evaluate((sel)=>{
    const e=document.querySelector(sel); const R=e.getBoundingClientRect();
    const cg=document.querySelector(".cg").getBoundingClientRect();
    const cols=[...document.querySelector(".cg").children].map(c=>{const k=c.getBoundingClientRect();return +(k.height).toFixed(3)});
    const cs=getComputedStyle(e);
    return { h:+R.height.toFixed(3), cgH:+cg.height.toFixed(3), cols, padT:cs.paddingTop, padB:cs.paddingBottom };
  }, sel);
  console.log(label.padEnd(6), JSON.stringify(r));
  await p.close();
}
await b.close();
