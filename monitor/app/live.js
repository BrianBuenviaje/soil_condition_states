(function (root) {
  const HOUR = 3600e3;
  const CHANNEL = "soil-demo";
  const FEED = "/live/feed";

  const feedKey = (it) => "t" + String(Math.round(it.t)).padStart(15, "0") + "_" + (it.kind === "install" ? "i" : "r") + "_" + it.node;

  function dbUrl(base, path, params) {
    const u = new URL(base);
    u.pathname = (u.pathname.replace(/\/$/, "") + path + ".json").replace(/\/\//g, "/");
    for (const [k, v] of Object.entries(params || {})) if (v != null) u.searchParams.set(k, v);
    return u.toString();
  }

  class FirebaseFeed {
    constructor(cfg, store) {
      this.cfg = cfg || {};
      this.store = store || null;
      this.token = null;
      this.refresh = store ? store.get("scm-refresh") : null;
      this.expires = 0;
      this.uid = null;
    }

    configured() {
      return !!(this.cfg.databaseURL && /^https?:\/\//.test(this.cfg.databaseURL));
    }

    async signIn() {
      if (!this.cfg.apiKey) return null;
      if (this.token && Date.now() < this.expires - 5 * 60e3) return this.token;
      const authURL = (this.cfg.authURL || "https://identitytoolkit.googleapis.com/v1").replace(/\/$/, "");
      const key = "?key=" + encodeURIComponent(this.cfg.apiKey);
      const keep = (token, refresh, secs, uid) => {
        this.token = token; this.refresh = refresh; this.expires = Date.now() + Number(secs) * 1000; this.uid = uid || this.uid;
        if (this.store) this.store.set("scm-refresh", refresh);
        return token;
      };
      if (this.refresh) {
        const tokenURL = authURL.replace("identitytoolkit.googleapis.com/v1", "securetoken.googleapis.com/v1") + "/token" + key;
        const res = await fetch(tokenURL, {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(this.refresh),
        }).catch(() => null);
        if (res && res.ok) {
          const j = await res.json();
          return keep(j.id_token, j.refresh_token, j.expires_in, j.user_id);
        }
      }
      const res = await fetch(authURL + "/accounts:signUp" + key, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }),
      });
      if (!res.ok) throw new Error("Anonymous sign in was refused (" + res.status + "). Turn on Anonymous sign in under Firebase Authentication.");
      const j = await res.json();
      return keep(j.idToken, j.refreshToken, j.expiresIn, j.localId);
    }

    async readAll() {
      const res = await fetch(dbUrl(this.cfg.databaseURL, FEED));
      if (!res.ok) throw new Error("Could not read the database (" + res.status + "). Check the database URL and rules.");
      const j = await res.json();
      return j ? Object.keys(j).sort().map((k) => j[k]).filter(Boolean) : [];
    }

    async publish(items) {
      if (!items.length) return;
      if (!this.cfg.apiKey) throw new Error("config.js has no apiKey, so this page cannot sign in to write.");
      const token = await this.signIn();
      const body = {};
      for (const it of items) body[feedKey(it)] = it;
      const res = await fetch(dbUrl(this.cfg.databaseURL, FEED, { auth: token }), { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error("The database refused the write (" + res.status + "). Check the database rules.");
    }

    async reset() {
      if (!this.cfg.apiKey) throw new Error("config.js has no apiKey, so this page cannot sign in to write.");
      const token = await this.signIn();
      const res = await fetch(dbUrl(this.cfg.databaseURL, FEED, { auth: token }), { method: "DELETE" });
      if (!res.ok) throw new Error("The database refused the reset (" + res.status + ").");
    }

    listen(onItems, onReset, onError) {
      const es = new EventSource(dbUrl(this.cfg.databaseURL, FEED));
      const handle = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch (err) { return; }
        if (!msg) return;
        const path = msg.path || "/";
        const data = msg.data;
        if (path === "/") {
          if (e.type === "put") onReset();
          if (data != null) onItems(Object.keys(data).sort().map((k) => data[k]).filter(Boolean));
        } else if (data != null && path.split("/").filter(Boolean).length === 1) {
          onItems([data]);
        }
      };
      es.addEventListener("put", handle);
      es.addEventListener("patch", handle);
      es.addEventListener("cancel", () => onError(new Error("The database stopped the stream. Check the read rules.")));
      es.onerror = () => onError(new Error("Lost the connection to the database"));
      return es;
    }
  }

  class Tracker {
    constructor(model, nodes) {
      this.model = model;
      this.nodes = nodes;
      this.pristine = {};
      for (const n of Object.keys(nodes)) this.pristine[n] = nodes[n].length;
      this.engine = root.SoilEngine.fromHistory(model, nodes);
    }

    ingest(items) {
      const E = this.engine;
      const list = items.filter((it) => it && it.node && this.nodes[it.node])
        .sort((a, b) => a.t - b.t || (a.node < b.node ? -1 : a.node > b.node ? 1 : 0));
      let added = 0;
      for (const it of list) {
        if (it.kind === "install") { E.install(it.node, it.t); continue; }
        if (!(it.t > E.track[it.node].lastMs)) continue;
        const rec = E.step(it.node, { ms: it.t, m: +it.m, ph: +it.ph, tc: +it.tc, ec: +it.ec }, null);
        this.nodes[it.node].push(rec);
        added++;
      }
      return added;
    }

    since() {
      const out = {};
      for (const n of Object.keys(this.nodes)) out[n] = this.nodes[n].slice(this.pristine[n]);
      return out;
    }

    reset() {
      for (const n of Object.keys(this.nodes)) this.nodes[n].length = this.pristine[n];
      this.engine = root.SoilEngine.fromHistory(this.model, this.nodes);
    }

    recovery(n, t) {
      const known = this.engine.track[n].episodes.filter((e) => e.knownAt <= t).map((e) => e.hours).sort((a, b) => a - b);
      return Math.round((known.length ? root.SoilEngine.median(known) : 1) * 100) / 100;
    }

    summary() {
      const out = {};
      for (const n of Object.keys(this.nodes)) {
        const r = this.nodes[n][this.nodes[n].length - 1];
        if (r) out[n] = { t: r.ms, s: r.s, h: r.h, r: r.r, st: r.st, m: r.m, ph: r.ph, tc: r.tc, ri: this.recovery(n, r.ms) };
      }
      return out;
    }
  }

  function makeTicker(fn) {
    let worker = null, timer = null, current = 0;
    const plain = (ms) => { clearInterval(timer); timer = ms > 0 ? setInterval(fn, ms) : null; };
    try {
      const src = "let h=null;onmessage=function(e){clearInterval(h);h=e.data>0?setInterval(function(){postMessage(0)},e.data):null;};";
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      worker.onmessage = () => fn();
      worker.onerror = () => { worker = null; plain(current); };
    } catch (e) { worker = null; }
    return {
      set(ms) {
        current = ms || 0;
        if (worker) worker.postMessage(current);
        else plain(current);
      },
    };
  }

  function startApp(opts) {
    const { data, model, config, onUpdate, onMode } = opts;
    const tracker = new Tracker(model, data.nodes);
    const simCfg = config.simulator || {};
    const seed = simCfg.seed || 7;

    const ingest = (items) => { tracker.ingest(items); if (items.length) onUpdate(); };
    const reset = () => { tracker.reset(); onUpdate(); };

    const params = new URLSearchParams(root.location ? root.location.search : "");
    const wanted = params.get("source") || "auto";
    const fb = new FirebaseFeed(config.firebase || {});
    let sim = null, paused = false, sph = simCfg.secondsPerHour || 3, channel = null;

    const status = () => channel && channel.postMessage({
      type: "status", source: "sim", clock: sim ? sim.clock : null, secondsPerHour: sph, paused,
      offline: sim ? sim.nodes.filter((n) => sim.s[n].offline) : [], nodes: tracker.summary(),
    });
    const tickOnce = () => { if (sim) { ingest(sim.tick()); status(); } };
    const ticker = makeTicker(tickOnce);
    const schedule = () => ticker.set(paused ? 0 : sph * 1000);

    function startSim(reason) {
      onMode("sim", reason);
      sim = new root.SoilSimulator.Simulator(data.nodes, seed);
      if ("BroadcastChannel" in root) {
        channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = (e) => {
          const m = e.data || {};
          if (m.type === "command") ingest(sim.command(m.cmd, m.node));
          else if (m.type === "speed") { sph = Math.max(0.2, +m.secondsPerHour || sph); schedule(); }
          else if (m.type === "pause") { paused = true; schedule(); }
          else if (m.type === "resume") { paused = false; schedule(); }
          else if (m.type === "skip") { const all = []; for (let i = 0; i < Math.min(+m.hours || 1, 24 * 14); i++) all.push(...sim.tick()); ingest(all); }
          else if (m.type === "reset") { reset(); sim = new root.SoilSimulator.Simulator(data.nodes, seed); }
          else if (m.type !== "hello") return;
          status();
        };
      }
      schedule();
      status();
    }

    if (wanted === "replay") { onMode("replay"); return; }
    if (wanted === "sim" || !fb.configured()) { startSim(fb.configured() ? "chosen in the address" : "no database in config.js"); return; }

    const strict = wanted === "live";
    let got = false, es = null, wait = null;
    const fallback = (err) => {
      if (sim || got || strict) return;
      if (es) es.close();
      startSim(err ? err.message : "no answer from the database");
    };
    const label = (items) => {
      const real = items.filter((it) => it.kind === "reading");
      if (real.length) onMode(real[real.length - 1].src === "sim" ? "sim" : "live", "readings from the live feed");
    };
    const connect = () => {
      es = fb.listen(
        (items) => { got = true; clearTimeout(wait); ingest(items); label(items); },
        () => { got = true; clearTimeout(wait); onMode("live"); reset(); },
        (err) => {
          if (!got && !strict) { clearTimeout(wait); fallback(err); return; }
          if (es.readyState === 2) { es.close(); setTimeout(connect, 5000); }
        }
      );
    };
    if (!strict) wait = setTimeout(() => fallback(), 8000);
    connect();
  }

  const api = { FirebaseFeed, Tracker, startApp, makeTicker, feedKey, CHANNEL, HOUR };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SoilLive = api;
})(typeof window !== "undefined" ? window : globalThis);
