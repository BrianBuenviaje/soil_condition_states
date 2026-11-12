(function (root) {
  const HOUR = 3600e3;
  const BOUNDS = { m: [0, 100], ph: [3, 10], tc: [0, 45], ec: [0, 2] };
  const CHANNEL = { m: "moisture", ph: "ph", tc: "temp", ec: "ec" };
  const SETTLING_H = 24;
  const R1_DEFAULT_H = 1.0;
  const R1_WINDOW_H = 12;
  const R2_DAYS = 4;
  const R3_H = 24;
  const R5_H = 48;
  const R5_PH = 5.5;

  const pad = (n) => String(n).padStart(2, "0");
  const toIso = (ms) => {
    const d = new Date(ms);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + "T" +
      pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
  };
  const parseIso = (s) => {
    const [d, t] = s.split("T");
    const [y, mo, da] = d.split("-").map(Number);
    const [h, mi, se] = (t || "00:00:00").split(":").map(Number);
    return Date.UTC(y, mo - 1, da, h || 0, mi || 0, se || 0);
  };

  function insertSorted(a, v) {
    let lo = 0, hi = a.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; }
    a.splice(lo, 0, v);
  }
  function quantile(a, q) {
    if (!a.length) return NaN;
    const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return a[lo] + (a[hi] - a[lo]) * (pos - lo);
  }
  const median = (a) => quantile(a, 0.5);
  const iqr = (a) => Math.max(quantile(a, 0.75) - quantile(a, 0.25), 1e-6);

  function outOfRange(r) {
    return Object.keys(BOUNDS).filter((k) => !(r[k] >= BOUNDS[k][0] && r[k] <= BOUNDS[k][1])).map((k) => CHANNEL[k]);
  }

  function consecutive(prev, ms) {
    if (prev == null) return false;
    const g = (ms - prev) / HOUR;
    return g >= 0.75 && g <= 1.25;
  }

  function weekStart(ms) {
    const d = new Date(ms);
    const day = (d.getUTCDay() + 6) % 7;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * 24 * HOUR;
  }
  const dayKey = (ms) => Math.floor(ms / (24 * HOUR));

  function classify(model, x) {
    const votes = new Array(model.classes.length).fill(0);
    for (const t of model.trees) {
      let i = 0;
      while (t.f[i] !== -1) i = x[t.f[i]] <= t.t[i] ? t.l[i] : t.r[i];
      votes[t.c[i]]++;
    }
    let best = 0;
    for (let k = 1; k < votes.length; k++) if (votes[k] > votes[best]) best = k;
    return { state: model.classes[best], share: votes[best] / model.trees.length };
  }

  class Engine {
    constructor(model, nodes) {
      this.model = model;
      this.nodes = nodes.slice().sort();
      this.track = {};
      for (const n of this.nodes) {
        this.track[n] = {
          prevTs: null, prevState: null, held: 0, drier: 0, s1: 0, s4: 0, s4ph: [],
          installedAt: null, base: { m: [], ph: [], tc: [] }, recent: [],
          episodes: [], pending: [], s1days: new Set(), ec: [], lastMs: -Infinity,
        };
      }
    }

    baseline(n) {
      const b = this.track[n].base;
      return { m: [median(b.m), iqr(b.m)], ph: [median(b.ph), iqr(b.ph)], tc: [median(b.tc), iqr(b.tc)] };
    }

    features(n, r) {
      const k = this.track[n];
      const bl = this.baseline(n);
      const clip = (v) => Math.max(-this.model.clip, Math.min(this.model.clip, v));
      const near = (h) => {
        const target = r.ms - h * HOUR;
        let best = null;
        for (const p of k.recent) {
          const dt = Math.abs(p.ms - target);
          if (dt <= 20 * 60e3 && (!best || dt < Math.abs(best.ms - target))) best = p;
        }
        return best;
      };
      const p1 = near(1), p3 = near(3);
      const mr = (r.m - bl.m[0]) / bl.m[1];
      const x = [mr, (r.ph - bl.ph[0]) / bl.ph[1], (r.tc - bl.tc[0]) / bl.tc[1],
        p1 ? (r.m - p1.m) / bl.m[1] : 0, p3 ? (r.m - p3.m) / bl.m[1] : 0].map(clip);
      return { x, mr };
    }

    remember(n, r) {
      const k = this.track[n];
      if (r.tc >= 0 && r.tc < 45) {
        insertSorted(k.base.m, r.m); insertSorted(k.base.ph, r.ph); insertSorted(k.base.tc, r.tc);
      }
      k.recent.push({ ms: r.ms, m: r.m });
      while (k.recent.length && k.recent[0].ms < r.ms - 4 * HOUR) k.recent.shift();
    }

    install(n, ms) {
      this.track[n].installedAt = ms;
    }

    step(n, raw, state, mrGiven) {
      const k = this.track[n];
      const r = { ms: raw.ms, m: raw.m, ph: raw.ph, tc: raw.tc, ec: raw.ec };
      let mr = mrGiven, share = null;
      if (state == null) {
        this.remember(n, r);
        const f = this.features(n, r);
        const c = classify(this.model, f.x);
        state = c.state; share = c.share; mr = f.mr;
      } else {
        this.remember(n, r);
      }
      if (k.installedAt == null) k.installedAt = r.ms;
      const t = r.ms;
      const cons = consecutive(k.prevTs, t);
      k.held = cons && k.prevState === state ? k.held + 1 : 1;
      const dry = state === "S3" || state === "S4";
      k.drier = dry ? (cons && (k.prevState === "S3" || k.prevState === "S4") ? k.drier + 1 : 1) : 0;
      k.s1 = state === "S1" ? k.held : 0;
      if (state === "S4") {
        k.s4 = k.held;
        k.s4ph = (k.held > 1 ? k.s4ph : []).concat(r.ph >= 3 && r.ph <= 10 ? [r.ph] : []);
      } else { k.s4 = 0; k.s4ph = []; }

      for (const e of k.pending) {
        if (e.done) continue;
        const h = (t - e.start) / HOUR;
        if (h > R1_WINDOW_H) { e.done = true; continue; }
        if (Math.abs(mr) <= 0.5) { e.done = true; k.episodes.push({ start: e.start, knownAt: t, hours: h }); }
      }
      k.pending = k.pending.filter((e) => !e.done);
      if (state === "S1" && k.prevState !== "S1") k.pending.push({ start: t });
      if (state === "S1") k.s1days.add(dayKey(t));

      k.prevTs = t; k.prevState = state; k.lastMs = Math.max(k.lastMs, t);
      if (r.ec >= 0 && r.ec <= 2) insertSorted(k.ec, r.ec);

      const bad = outOfRange(r);
      const settling = t - k.installedAt < SETTLING_H * HOUR;
      const fired = [], info = {};
      if (settling) {
        fired.push("R8");
      } else {
        if (state === "S1") {
          const known = k.episodes.filter((e) => e.knownAt <= t).map((e) => e.hours).sort((a, b) => a - b);
          const interval = known.length ? median(known) : R1_DEFAULT_H;
          info.recovery_interval_h = Math.round(interval * 100) / 100;
          if (k.s1 > interval) fired.push("R1");
        }
        const ws = weekStart(t);
        let days = 0;
        for (const dk of k.s1days) if (dk * 24 * HOUR >= ws && dk * 24 * HOUR <= t) days++;
        if (days >= R2_DAYS) fired.push("R2");
        if (k.drier > R3_H) fired.push("R3");
        if (state === "S2") fired.push("R4");
        if (state === "S4" && k.s4 > R5_H && k.s4ph.length && median(k.s4ph.slice().sort((a, b) => a - b)) < R5_PH) fired.push("R5");
        const others = this.nodes.filter((m) => m !== n).map((m) => this.track[m].ec);
        if (k.ec.length && others.every((a) => a.length) && median(k.ec) < Math.min(...others.map(median))) fired.push("R6");
        if (bad.length) { fired.push("R7"); info.out_of_range = bad; }
      }
      return {
        t: toIso(t), ms: t, s: state, h: k.held, dr: k.drier,
        m: Math.round(r.m * 100) / 100, ph: Math.round(r.ph * 100) / 100, tc: Math.round(r.tc * 100) / 100,
        ec: Math.round(r.ec * 1000) / 1000, st: settling, r: fired, i: info, mr, share,
      };
    }
  }

  function fromHistory(model, nodesData) {
    const eng = new Engine(model, Object.keys(nodesData));
    const all = [];
    for (const n of Object.keys(nodesData)) for (const r of nodesData[n]) {
      if (r.ms == null) r.ms = parseIso(r.t);
      all.push([n, r]);
    }
    all.sort((a, b) => a[1].ms - b[1].ms || (a[0] < b[0] ? -1 : 1));
    for (const [n, r] of all) eng.step(n, { ms: r.ms, m: r.m, ph: r.ph, tc: r.tc, ec: r.ec }, r.s, r.mr);
    return eng;
  }

  const api = { Engine, classify, outOfRange, toIso, parseIso, median, iqr, fromHistory, HOUR };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SoilEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
