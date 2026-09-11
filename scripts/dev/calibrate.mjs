import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { readFileSync } from "node:fs";
const d = "tests/__screenshots__";
const R = "../handoff/reference/screens";
const names = ["01-hero","02-breakdown","03-credibility","04-promise"];
console.log("threshold sweep (differing % per section)\n");
console.log("thr   " + names.map(n=>n.slice(0,12).padStart(13)).join(""));
for (const thr of [0.1,0.15,0.2,0.25,0.3,0.35]) {
  const row = [];
  for (const n of names) {
    const a = PNG.sync.read(readFileSync(`${d}/${n}-actual.png`));
    const b = PNG.sync.read(readFileSync(`${R}/${n}.png`));
    const w = Math.min(a.width,b.width), h = Math.min(a.height,b.height);
    const A = crop(a,w,h), B = crop(b,w,h); sync(A,B);
    const diff = new PNG({width:w,height:h});
    const n2 = pixelmatch(A.data,B.data,diff.data,w,h,{threshold:thr,includeAA:false});
    row.push(((n2/(w*h))*100).toFixed(3).padStart(13));
  }
  console.log(String(thr).padEnd(6)+row.join(""));
}
function crop(p,w,h){ if(p.width===w&&p.height===h) return p; const o=new PNG({width:w,height:h}); PNG.bitblt(p,o,0,0,w,h,0,0); return o; }
function sync(a,b){ for(let i=0;i<a.data.length;i+=4){ if(a.data[i]===255&&a.data[i+1]===0&&a.data[i+2]===255){b.data[i]=255;b.data[i+1]=0;b.data[i+2]=255;b.data[i+3]=a.data[i+3];} } }
