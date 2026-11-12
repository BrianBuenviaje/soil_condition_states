const fs = require("fs"), path = require("path");
const E = require("../app/engine.js");
const csv = fs.readFileSync(process.argv[2], "utf8").trim().split("\n");
const head = csv[0].split(","); const col = (n) => head.indexOf(n);
const CODE = { "Saturated": "S1", "Moist / cooler": "S2", "Drier / higher pH": "S3", "Drier / lower pH": "S4" };
const rows = csv.slice(1).map((l) => l.split(",")).map((c) => ({ node: c[col("node")], ms: E.parseIso(c[col("ts")].replace(" ", "T")),
  m: +c[col("moisture")], ph: +c[col("ph")], tc: +c[col("temp")], ec: +c[col("ec")], s: CODE[c[col("state_ref")]] }));
rows.sort((a, b) => a.ms - b.ms || a.node.localeCompare(b.node));
global.window = {}; require(path.resolve(process.argv[3]));
const eng = new E.Engine(global.window.SOIL_MODEL, [...new Set(rows.map((r) => r.node))]);
let agree = 0, n = 0, late = 0, lateAgree = 0;
const t0 = rows[0].ms;
for (const r of rows) { const g = eng.step(r.node, r, null); n++; if (g.s === r.s) agree++; if (r.ms - t0 > 7 * 24 * 3600e3) { late++; if (g.s === r.s) lateAgree++; } }
console.log("past-only baseline agreement with reference states:", (agree / n).toFixed(3), "after first week:", (lateAgree / late).toFixed(3));
