const fs = require("fs");
const path = require("path");
const E = require("../app/engine.js");
const csv = fs.readFileSync(process.argv[2], "utf8").trim().split("\n");
const head = csv[0].split(",");
const col = (n) => head.indexOf(n);
const CODE = { "Saturated": "S1", "Moist / cooler": "S2", "Drier / higher pH": "S3", "Drier / lower pH": "S4" };
const rows = csv.slice(1).map((l) => l.split(",")).map((c) => ({
  node: c[col("node")], ms: E.parseIso(c[col("ts")].replace(" ", "T")),
  m: +c[col("moisture")], ph: +c[col("ph")], tc: +c[col("temp")], ec: +c[col("ec")],
  mr: +c[col("moisture_rel")], s: CODE[c[col("state_ref")]],
}));
rows.sort((a, b) => a.ms - b.ms || a.node.localeCompare(b.node));
const window = {};
global.window = window;
require(path.resolve(process.argv[3]));
const model = global.window.SOIL_MODEL;
const nodes = [...new Set(rows.map((r) => r.node))];
const eng = new E.Engine(model, nodes);
const got = {};
for (const r of rows) (got[r.node] = got[r.node] || []).push(eng.step(r.node, r, r.s, r.mr));
global.window = {};
require(path.resolve(process.argv[4]));
const D = global.window.SOIL_DATA;
let n = 0, bad = 0;
for (const node of nodes) {
  const want = D.nodes[node];
  want.forEach((w, i) => {
    const g = got[node][i]; n++;
    const same = g.t === w.t && g.s === w.s && g.h === w.h && g.dr === w.dr && g.st === w.st &&
      JSON.stringify(g.r) === JSON.stringify(w.r) &&
      (w.i.recovery_interval_h === undefined || Math.abs(w.i.recovery_interval_h - g.i.recovery_interval_h) < 0.011);
    if (!same && bad++ < 8) console.log("MISMATCH", node, w.t, JSON.stringify({ want: [w.s, w.h, w.dr, w.r, w.i], got: [g.s, g.h, g.dr, g.r, g.i] }));
  });
}
console.log("compared", n, "mismatches", bad);
