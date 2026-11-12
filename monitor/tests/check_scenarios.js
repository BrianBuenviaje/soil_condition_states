const path = require("path");
const E = require("../app/engine.js");
const S = require("../app/simulator.js");
global.window = {};
require(path.resolve("app/model.js")); require(path.resolve("app/data.js"));
const model = global.window.SOIL_MODEL, D = global.window.SOIL_DATA;

function fresh(seed) {
  const hist = JSON.parse(JSON.stringify(D.nodes));
  const eng = E.fromHistory(model, hist);
  for (const n of Object.keys(hist)) for (const r of hist[n]) r.ms = E.parseIso(r.t);
  const sim = new S.Simulator(hist, seed);
  return { eng, sim, hist };
}
function run(ctx, hours, onRec) {
  for (let h = 0; h < hours; h++) for (const it of ctx.sim.tick()) {
    const rec = ctx.eng.step(it.node, { ms: it.t, m: it.m, ph: it.ph, tc: it.tc, ec: it.ec }, null);
    ctx.hist[it.node].push(rec); if (onRec) onRec(it.node, rec);
  }
}
function apply(ctx, cmd, node) { for (const ev of ctx.sim.command(cmd, node)) if (ev.kind === "install") ctx.eng.install(ev.node, ev.t); }

const t0 = Date.now();
const base = fresh(7);
const states = {}, runs = [], rules = {};
let cur = {};
run(base, 24 * 7, (n, r) => {
  states[r.s] = (states[r.s] || 0) + 1;
  for (const id of r.r) rules[id] = (rules[id] || 0) + 1;
});
console.log("normal week: states", states, "rules", rules, "ms", Date.now() - t0);

const cases = [
  ["flood", "Node-03", 8, ["R1", "R7"], "S1"],
  ["flood", "Node-01", 8, ["R1", "R7"], "S1"],
  ["flood", "Node-04", 8, ["R1", "R7"], "S1"],
  ["flood", "Node-05", 8, ["R1", "R7"], "S1"],
  ["flood", "Node-02", 8, ["R7"], "S1"],
  ["dry", "Node-03", 30, ["R3"], null],
  ["aciddry", "Node-05", 56, ["R3", "R5"], "S4"],
  ["fault", "Node-01", 2, ["R7"], null],
  ["newprobe", "Node-02", 6, ["R8"], null],
  ["floodweek", "Node-01", 24 * 8, ["R2"], null],
  ["floodweek", "Node-03", 24 * 8, ["R2"], null],
];
for (const [cmd, node, hours, want, wantState] of cases) {
  const ctx = fresh(11);
  run(ctx, 6);
  apply(ctx, cmd, node);
  const seen = new Set(), st = {};
  run(ctx, hours, (n, r) => { if (n === node) { r.r.forEach((x) => seen.add(x)); st[r.s] = (st[r.s] || 0) + 1; } });
  const ok = want.every((w) => seen.has(w)) && (!wantState || st[wantState]);
  console.log((ok ? "PASS " : "FAIL ") + cmd.padEnd(10) + node, "rules seen:", [...seen].sort().join(","), "states:", JSON.stringify(st));
}
const ctx = fresh(3); run(ctx, 4); apply(ctx, "offline", "Node-04"); run(ctx, 5);
const last = ctx.hist["Node-04"].slice(-1)[0];
console.log("offline Node-04: last reading", last.t, "clock", E.toIso(ctx.sim.clock));
