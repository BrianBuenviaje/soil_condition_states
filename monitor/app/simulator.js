(function (root) {
  const HOUR = 3600e3;
  const CEILING = 136.97;

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function quantile(sorted, q) {
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function profileOf(records) {
    const col = (k, ok) => records.map((r) => r[k]).filter(ok).sort((a, b) => a - b);
    const stat = (a) => ({ med: quantile(a, 0.5), iqr: Math.max(quantile(a, 0.75) - quantile(a, 0.25), 1e-3) });
    const valid = (r) => r.m <= 100 && r.ph >= 3 && r.ph <= 10 && r.tc < 45;
    const good = records.filter(valid);
    const byHour = new Array(24).fill(0).map(() => []);
    for (const r of good) byHour[new Date(r.ms).getUTCHours()].push(r.tc);
    const tmed = quantile(col("tc", (v) => v < 45), 0.5);
    const diurnal = byHour.map((a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length - tmed : 0));
    const last = good[good.length - 1];
    return {
      m: stat(good.map((r) => r.m).sort((a, b) => a - b)),
      ph: stat(good.map((r) => r.ph).sort((a, b) => a - b)),
      tc: stat(good.map((r) => r.tc).sort((a, b) => a - b)),
      ec: stat(col("ec", (v) => v >= 0 && v <= 2)),
      diurnal,
      last: { m: last.m, ph: last.ph, tc: last.tc, ec: last.ec },
    };
  }

  function floodWeekStart(t) {
    const today = new Date(t);
    let first = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) + 24 * HOUR;
    const weekday = (new Date(first).getUTCDay() + 6) % 7;
    if (weekday > 3) first += (7 - weekday) * 24 * HOUR;
    return first;
  }

  const SCENARIOS = {
    flood: { label: "Prolonged flood, 3 h", rules: "R1, R7" },
    dry: { label: "Dry spell, 30 h", rules: "R3" },
    aciddry: { label: "Acidic dry spell, 54 h", rules: "R3, R5" },
    floodweek: { label: "Flood on 4 days of one week", rules: "R2, R7" },
    fault: { label: "Sensor fault (one bad reading)", rules: "R7" },
    newprobe: { label: "Install new probe", rules: "R8" },
    offline: { label: "Go offline", rules: "No reading notice" },
    online: { label: "Back online", rules: "" },
    normal: { label: "Back to normal", rules: "" },
  };

  class Simulator {
    constructor(history, seed, since) {
      this.rand = rng(seed || 7);
      this.nodes = Object.keys(history).sort();
      this.p = {};
      this.s = {};
      let lastMs = 0;
      for (const n of this.nodes) {
        const recs = history[n];
        this.p[n] = profileOf(recs);
        const more = (since && since[n]) || [];
        const tail = more.length ? more[more.length - 1] : recs[recs.length - 1];
        lastMs = Math.max(lastMs, recs[recs.length - 1].ms, tail.ms);
        const L = more.length && tail.m <= 100 && tail.ph >= 3 && tail.ph <= 10 && tail.tc < 45 ? tail : this.p[n].last;
        this.s[n] = { m: Math.min(L.m, 99.5), ph: L.ph, tc: L.tc, ec: L.ec, regime: null, until: 0, plan: [], offline: false, mode: null };
      }
      this.clock = Math.floor((lastMs + 60e3) / HOUR) * HOUR;
    }

    gauss() {
      let u = 0, v = 0;
      while (u === 0) u = this.rand();
      while (v === 0) v = this.rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    pickRegime(n, t) {
      const prev = this.s[n].regime;
      const regime = prev === "moist" ? (this.rand() < 0.55 ? "dryhigh" : "drylow") : "moist";
      const hours = regime === "moist" ? 5 + Math.floor(this.rand() * 6) : 4 + Math.floor(this.rand() * 6);
      this.s[n].regime = regime;
      this.s[n].until = t + hours * HOUR;
    }

    target(n, t) {
      const p = this.p[n], s = this.s[n];
      if (s.mode && s.mode.until > t) return s.mode.target(p, t);
      if (s.mode && s.mode.until <= t) s.mode = null;
      if (!s.regime || t >= s.until) this.pickRegime(n, t);
      const hour = new Date(t).getUTCHours();
      const tc = p.tc.med + p.diurnal[hour];
      if (s.regime === "moist") return { m: p.m.med + 0.45 * p.m.iqr, ph: p.ph.med, tc: tc - 0.5 * p.tc.iqr };
      if (s.regime === "dryhigh") return { m: p.m.med - 0.7 * p.m.iqr, ph: p.ph.med + 0.6 * p.ph.iqr, tc: tc + 0.3 * p.tc.iqr };
      return { m: p.m.med - 0.7 * p.m.iqr, ph: p.ph.med - 0.9 * p.ph.iqr, tc: tc + 0.2 * p.tc.iqr };
    }

    command(cmd, node) {
      const t = this.clock;
      const s = this.s[node];
      if (!s) return [];
      const out = [];
      if (cmd === "flood") {
        s.plan = this.floodPlan(node, t + HOUR);
      } else if (cmd === "floodweek") {
        const plan = [];
        const first = floodWeekStart(t);
        for (let d = 0; d < 4; d++) plan.push(...this.floodPlan(node, first + d * 24 * HOUR + 8 * HOUR, 2));
        s.plan = plan;
      } else if (cmd === "dry") {
        s.plan = [];
        s.mode = { until: t + 31 * HOUR, target: (p, tt) => ({ m: p.m.med - 1.6 * p.m.iqr, ph: p.ph.med + 0.8 * p.ph.iqr, tc: p.tc.med + p.diurnal[new Date(tt).getUTCHours()] + 0.6 * p.tc.iqr }) };
      } else if (cmd === "aciddry") {
        s.plan = [];
        s.mode = { until: t + 55 * HOUR, target: (p, tt) => ({ m: p.m.med - 1.6 * p.m.iqr, ph: 5.2, tc: p.tc.med + p.diurnal[new Date(tt).getUTCHours()] + 0.6 * p.tc.iqr }) };
      } else if (cmd === "fault") {
        s.plan = s.plan.filter((x) => x.at > t + HOUR).concat([{ at: t + HOUR, fault: true }]);
      } else if (cmd === "newprobe") {
        out.push({ kind: "install", node, t: t + 1000, src: "sim" });
      } else if (cmd === "offline") {
        s.offline = true;
      } else if (cmd === "online") {
        s.offline = false;
      } else if (cmd === "normal") {
        s.plan = []; s.mode = null; s.regime = null; s.offline = false;
      }
      return out;
    }

    floodPlan(node, at, hours) {
      const p = this.p[node];
      const ceilingHours = hours || 3;
      const plan = [];
      for (let i = 0; i < ceilingHours; i++) plan.push({ at: at + i * HOUR, m: CEILING, ph: p.ph.med - 1.2 * p.ph.iqr });
      const tail = [2.6, 1.4, 0.6, 0.3];
      tail.forEach((k, i) => plan.push({ at: at + (ceilingHours + i) * HOUR, m: p.m.med + k * p.m.iqr }));
      return plan;
    }

    tick() {
      this.clock += HOUR;
      const t = this.clock;
      const out = [];
      this.nodes.forEach((n, idx) => {
        const s = this.s[n], p = this.p[n];
        const due = s.plan.filter((x) => x.at <= t);
        s.plan = s.plan.filter((x) => x.at > t);
        const tg = this.target(n, t);
        s.m += 0.35 * (tg.m - s.m) + 0.12 * p.m.iqr * this.gauss();
        s.ph += 0.3 * (tg.ph - s.ph) + 0.08 * p.ph.iqr * this.gauss();
        s.tc += 0.5 * (tg.tc - s.tc) + 0.1 * p.tc.iqr * this.gauss();
        s.ec = p.ec.med + 0.05 * p.ec.iqr * this.gauss();
        s.m = Math.min(s.m, 99.5); s.ph = Math.max(3.2, Math.min(9.8, s.ph)); s.tc = Math.min(s.tc, 40);
        let m = s.m, ph = s.ph, tc = s.tc, ec = s.ec;
        for (const x of due) {
          if (x.m != null) { m = x.m; if (x.m < CEILING) s.m = x.m; }
          if (x.ph != null) ph = x.ph;
          if (x.fault) ph = 0;
        }
        if (s.offline) return;
        out.push({ kind: "reading", node: n, t: t - 60e3 + idx * 2000, m: +m.toFixed(4), ph: +ph.toFixed(4), tc: +tc.toFixed(4), ec: +ec.toFixed(5), src: "sim" });
      });
      return out;
    }
  }

  const api = { Simulator, SCENARIOS, floodWeekStart, HOUR };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SoilSimulator = api;
})(typeof window !== "undefined" ? window : globalThis);
