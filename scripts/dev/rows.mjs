import { PNG } from "pngjs";
import { readFileSync } from "node:fs";
const d = PNG.sync.read(readFileSync("tests/__screenshots__/live-03-credibility-diff.png"));
const rows = new Array(d.height).fill(0);
const cols = new Array(d.width).fill(0);
for (let y=0;y<d.height;y++) for (let x=0;x<d.width;x++) {
  const i=(d.width*y+x)<<2;
  // pixelmatch marks differences in red/yellow; background is transparent-ish
  if (d.data[i+3]>0 && !(d.data[i]===d.data[i+1] && d.data[i+1]===d.data[i+2])) { rows[y]++; cols[x]++; }
}
const top = rows.map((v,i)=>[i,v]).filter(r=>r[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,12);
console.log("busiest rows (y at 2x, count):");
for (const [y,v] of top) console.log(`  y=${y} (css ${Math.round(y/2)})  ${v}`);
// banded summary
console.log("\nrow bands with differences (2x):");
let start=null;
for (let y=0;y<=d.height;y++){
  const has = y<d.height && rows[y]>3;
  if (has && start===null) start=y;
  if (!has && start!==null){ const sum=rows.slice(start,y).reduce((a,b)=>a+b,0); console.log(`  y ${start}-${y-1} (css ${Math.round(start/2)}-${Math.round((y-1)/2)})  px=${sum}`); start=null; }
}
const cTop = cols.map((v,i)=>[i,v]).filter(r=>r[1]>0);
console.log(`\ncolumn range with differences: x ${cTop[0]?.[0]} .. ${cTop[cTop.length-1]?.[0]} (2x)`);
