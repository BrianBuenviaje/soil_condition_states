const fs = require("fs");
const path = require("path");
const E = require("../app/engine.js");
global.window = {};
require(path.resolve(process.argv[3]));
const model = global.window.SOIL_MODEL;
const lines = fs.readFileSync(process.argv[2], "utf8").trim().split("\n");
const head = lines[0].split(",");
let n = 0, bad = 0;
for (const l of lines.slice(1)) {
  const c = l.split(",");
  const x = model.features.map((f) => +c[head.indexOf(f)]);
  const want = c[head.indexOf("pred")];
  const got = E.classify(model, x).state;
  n++; if (got !== want) bad++;
}
console.log("compared", n, "mismatches", bad);
