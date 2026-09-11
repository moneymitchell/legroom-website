import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--hide-scrollbars"] });
const REF = process.env.REF || "http://127.0.0.1:8900/reference/06-cta-founders.html";
const ACT = process.env.ACT || "http://127.0.0.1:4321/";
const W = Number(process.env.W || 1440);
const sels = JSON.parse(process.env.SELS || '{}');
async function probe(url) {
  const p = await b.newPage({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1 });
  await p.goto(url, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(200);
  const out = await p.evaluate((sels) => {
    const o = {};
    for (const [k, s] of Object.entries(sels)) {
      const e = document.querySelector(s);
      if (!e) { o[k] = null; continue; }
      const r = e.getBoundingClientRect();
      o[k] = [Math.round(r.left*10)/10, Math.round(r.top*10)/10, Math.round(r.width*10)/10, Math.round(r.height*10)/10];
    }
    return o;
  }, sels);
  await p.close();
  return out;
}
const ref = await probe(REF), act = await probe(ACT);
// normalise by the anchor element's top so only relative offsets show
const anchor = Object.keys(sels)[0];
const ro = ref[anchor] ? ref[anchor][1] : 0, ao = act[anchor] ? act[anchor][1] : 0;
console.log("elem          ref[l,t,w,h]                  build[l,t,w,h]                Δtop Δleft  Δw    Δh");
for (const k of Object.keys(sels)) {
  const r = ref[k], a = act[k];
  if (!r || !a) { console.log(k.padEnd(13), r ? "MISSING in build" : "MISSING in ref"); continue; }
  const dt=((a[1]-ao)-(r[1]-ro)).toFixed(1), dl=(a[0]-r[0]).toFixed(1), dw=(a[2]-r[2]).toFixed(1), dh=(a[3]-r[3]).toFixed(1);
  console.log(k.padEnd(13), JSON.stringify(r).padEnd(30), JSON.stringify(a).padEnd(30), String(dt).padStart(5), String(dl).padStart(6), String(dw).padStart(5), String(dh).padStart(6));
}
await b.close();
