/** Full-page screenshots at every breakpoint, for eyeballing. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "/private/tmp/claude-501/-Users-jdworcester-Desktop-BWL-blk-legroom-teardown/65980819-e817-4457-98ce-251bd349ec52/scratchpad/shots";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ["--hide-scrollbars"] });
for (const [name, w, h] of [["1920",1920,1080],["1440",1440,900],["1024",1024,768],["768",768,1024],["390",390,844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await p.goto("http://127.0.0.1:4321/", { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready.then(()=>1));
  await p.evaluate(async()=>{const wt=(m)=>new Promise(r=>setTimeout(r,m));
    for(let y=0;y<document.body.scrollHeight;y+=innerHeight){scrollTo(0,y);await wt(50);}
    const rail=document.querySelector('.rail'); if(rail){rail.style.scrollBehavior='auto';rail.scrollTop=rail.scrollHeight;await wt(80);rail.scrollTop=0;await wt(80);}
    scrollTo(0,0);
    await Promise.all([...document.images].map(i=>i.complete?1:Promise.race([i.decode().catch(()=>{}),wt(2500)])));});
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const m = await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,h:document.body.scrollHeight}));
  console.log(`${name}: page ${m.h}px tall, scrollWidth ${m.sw} vs client ${m.cw} ${m.sw>m.cw+1?'  HORIZONTAL OVERFLOW':''}`);
  await p.close();
}
await b.close();
