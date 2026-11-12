(function () {
  const D = window.SOIL_DATA, CFG = window.SOIL_CONFIG || {};
  const L = window.SoilLive, SIM = window.SoilSimulator, E = window.SoilEngine;
  const HOUR = 3600e3;
  const NODES = Object.keys(D.nodes).sort();
  for (const n of NODES) for (const r of D.nodes[n]) if (r.ms == null) r.ms = E.parseIso(r.t);
  const SEED = (CFG.simulator && CFG.simulator.seed) || 7;
  const SPEEDS = [1, 2, 3, 5, 10];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const pad = (n) => String(n).padStart(2, "0");
  const dt = (ms) => new Date(ms);
  const fmtTime = (ms) => pad(dt(ms).getUTCHours()) + ":" + pad(dt(ms).getUTCMinutes());
  const fmtDate = (ms) => dt(ms).getUTCDate() + " " + MON[dt(ms).getUTCMonth()];
  const fmtDay = (ms) => DAY[dt(ms).getUTCDay()] + " " + fmtDate(ms) + " " + dt(ms).getUTCFullYear() + ", " + fmtTime(ms);
  const label = (n) => n.replace("-", " ");
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  const ST = {
    S1: "border-s1/25 bg-s1/10 text-s1", S2: "border-s2/25 bg-s2/10 text-s2",
    S3: "border-s3/25 bg-s3/10 text-s3", S4: "border-s4/25 bg-s4/10 text-s4",
  };
  const DOT = { S1: "bg-s1", S2: "bg-s2", S3: "bg-s3", S4: "bg-s4" };
  const KIND = { R1: "action", R2: "action", R3: "action", R5: "action", R6: "action", R4: "ok", R7: "check", R8: "settle" };
  const CHIP = { action: "bg-clay/10 text-clay", ok: "bg-s2/10 text-s2", check: "bg-s3/10 text-s3", settle: "bg-s1/10 text-s1" };
  const chip = (id) => '<span title="' + D.rules[id].action + '" class="rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold ' + CHIP[KIND[id]] + '">' + id + "</span>";
  const pill = (s) => '<span class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ' + ST[s] + '"><i class="h-1.5 w-1.5 rounded-full ' + DOT[s] + '"></i><span class="font-mono">' + s + "</span>" + D.states[s] + "</span>";

  const fb = new L.FirebaseFeed(CFG.firebase || {}, store);
  const st = {
    mode: store.get("scm-mode") === "local" || !fb.configured() ? "local" : "firebase",
    node: NODES[0], sph: (CFG.simulator && CFG.simulator.secondsPerHour) || 3, paused: false,
    clock: null, nodes: {}, offline: [], conn: "wait", connText: "Starting", error: "", seen: 0, log: [], armed: 0,
  };

  const appURL = () => {
    const u = new URL("index.html", location.href);
    u.search = st.mode === "local" ? "?source=sim" : "?source=live";
    return u.toString();
  };

  let toastTimer = null;
  function toast(text) {
    $("toastText").textContent = text;
    $("toast").classList.remove("opacity-0");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.add("opacity-0"), 1800);
  }

  function log(text) {
    st.log.unshift({ at: st.clock, text });
    st.log.length = Math.min(st.log.length, 80);
    renderLog();
  }

  function scenarioInfo(id) {
    const info = st.nodes[st.node] || {};
    const ri = info.ri;
    if (id === "flood") {
      if (ri == null) return { rules: ["R1", "R7"], text: "Moisture sits at the sensor ceiling for 3 h, then drains." };
      if (ri < 3) return { rules: ["R1", "R7"], text: "Moisture sits at the sensor ceiling for 3 h, then drains. Expect S1, with R1 from hour " + (Math.floor(ri) + 1) + " because this node usually recovers in " + ri + " h. R7 flags the ceiling readings." };
      return { rules: ["R7"], text: "Moisture sits at the sensor ceiling for 3 h, then drains. This node usually takes " + ri + " h to recover, so a 3 h flood is normal here and R1 stays quiet. R7 still flags the ceiling readings. Try another node to show R1." };
    }
    if (id === "floodweek") {
      const first = st.clock != null ? SIM.floodWeekStart(st.clock) : null;
      const when = first ? " from " + DAY[dt(first).getUTCDay()] + " " + fmtDate(first) + " to " + DAY[dt(first + 3 * 24 * HOUR).getUTCDay()] + " " + fmtDate(first + 3 * 24 * HOUR) : "";
      return { rules: ["R2", "R7"], text: "Two hour floods at 08:00 on four days of one week" + when + ". R2 fires on the fourth day. Use +24 h to get there quickly." };
    }
    const fixed = {
      dry: { rules: ["R3"], text: "Moisture stays well below normal for about 30 h. Expect S3 or S4, and R3 once the drier run passes 24 h. Use +24 h to get there quickly." },
      aciddry: { rules: ["R3", "R5"], text: "Dry soil with pH near 5.2 for about 54 h. Expect S4, R3 after 24 h and R5 after 48 h. Use +24 h twice." },
      fault: { rules: ["R7"], text: "The next reading reports a pH of 0. Expect R7 on that reading only." },
      newprobe: { rules: ["R8"], text: "Marks this probe as newly installed. For 24 h the app shows Settling and gives no advice." },
      offline: { rules: [], text: "Stops readings from this node. After 2 h the app shows how long it has gone without a reading." },
      online: { rules: [], text: "Resumes readings from this node." },
      normal: { rules: [], text: "Cancels any scenario running on this node and brings it back online." },
    };
    return fixed[id];
  }

  const ORDER = ["flood", "dry", "aciddry", "floodweek", "fault", "newprobe", "offline", "online", "normal"];

  const btn = "rounded-lg py-1.5 text-sm font-semibold transition duration-150 active:scale-95 ";
  const on = "bg-card text-brand shadow-sm", off = "text-muted hover:text-ink";

  function renderSource() {
    const can = fb.configured();
    $("modes").innerHTML = [["firebase", "Firebase"], ["local", "This browser"]].map(([m, t]) =>
      '<button data-mode="' + m + '"' + (m === "firebase" && !can ? " disabled" : "") + ' class="' + btn + (st.mode === m ? on : off) + (m === "firebase" && !can ? " cursor-not-allowed opacity-50" : "") + '">' + t + "</button>").join("");
    let note;
    if (st.mode === "firebase") note = "Readings go to your Firebase database, so the app updates on any phone or laptop that opens the link below. Keep this page open during the demo.";
    else note = "Readings are made inside the app itself and this page steers it. Open the app in another tab or window of this same browser." + (can ? "" : " To reach other devices, add your Firebase details to config.js.");
    if (st.error) note += ' <span class="font-semibold text-clay">' + st.error + "</span>";
    $("modeNote").innerHTML = note;
    $("openApp").href = appURL();
    $("appLink").textContent = appURL();
    $("retry").classList.toggle("hidden", !(st.mode === "firebase" && st.conn === "error"));
    const C = {
      ok: "border-s2/30 bg-s2/10 text-s2", wait: "border-line bg-empty text-muted",
      warn: "border-s3/30 bg-s3/10 text-s3", error: "border-clay/30 bg-clay/10 text-clay",
    };
    const dot = { ok: "bg-s2", wait: "bg-dim", warn: "bg-s3", error: "bg-clay" };
    $("conn").className = "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold " + C[st.conn];
    $("conn").innerHTML = '<i class="h-1.5 w-1.5 rounded-full ' + dot[st.conn] + '"></i>' + st.connText;
  }

  function renderClock() {
    $("clock").textContent = st.clock != null ? fmtDay(st.clock) : "--";
    $("runState").textContent = st.clock == null ? "" : st.paused ? "Paused" : "Running";
    $("pause").textContent = st.paused ? "Resume" : "Pause";
    $("pause").className = "col-span-1 rounded-lg px-2 py-2 text-sm font-semibold text-white transition duration-150 hover:opacity-90 active:scale-95 " + (st.paused ? "bg-brand" : "bg-ink");
    $("speeds").innerHTML = SPEEDS.map((s) => '<button data-speed="' + s + '" class="' + btn + "font-mono " + (st.sph === s ? on : off) + '">' + s + " s</button>").join("");
    const day = st.sph * 24;
    $("speedNote").textContent = "1 simulated hour every " + st.sph + " s, a day in " + (day >= 60 ? Math.floor(day / 60) + " min" + (day % 60 ? " " + (day % 60) + " s" : "") : day + " s");
  }

  function renderScenarios() {
    $("nodePick").innerHTML = NODES.map((n) => '<button data-node="' + n + '" aria-label="' + label(n) + '" class="' + btn + "font-mono " + (st.node === n ? on : off) + '">' + n.slice(-2) + "</button>").join("");
    $("scenarios").innerHTML = ORDER.map((id) => {
      const s = SIM.SCENARIOS[id], info = scenarioInfo(id);
      return '<button data-cmd="' + id + '" class="block w-full rounded-xl border border-line bg-card p-3 text-left transition duration-150 hover:border-brand/40 hover:bg-raised active:scale-[0.99]">' +
        '<div class="flex items-center justify-between gap-2"><span class="text-[15px] font-semibold">' + s.label + '</span><span class="flex shrink-0 gap-1">' + info.rules.map(chip).join("") + "</span></div>" +
        '<p class="mt-1 text-[13px] leading-relaxed text-muted">' + info.text + "</p></button>";
    }).join("");
  }

  function renderNodes() {
    $("nodes").innerHTML = NODES.map((n) => {
      const r = st.nodes[n];
      if (!r) return '<div class="py-2.5 text-sm text-dim">' + label(n) + ": waiting for data</div>";
      const gap = st.clock != null ? Math.floor((st.clock - r.t) / HOUR) : 0;
      const off = st.offline.includes(n);
      const rules = r.r.filter((x) => x !== "R8");
      let tail = r.st ? '<span class="rounded-md bg-s1/10 px-1.5 py-0.5 text-[11px] font-semibold text-s1">Settling</span>' : rules.length ? rules.map(chip).join("") : '<span class="text-xs text-dim">No rule</span>';
      if (off) tail += '<span class="rounded-md bg-s3/10 px-1.5 py-0.5 text-[11px] font-semibold text-s3">Offline' + (gap >= 1 ? " " + gap + " h" : "") + "</span>";
      return '<div class="py-2.5"><div class="flex flex-wrap items-center gap-2"><span class="w-16 shrink-0 text-sm font-semibold">' + label(n) + "</span>" + pill(r.s) +
        '<span class="font-mono text-xs text-muted">' + r.h + " h</span>" + '<span class="ml-auto flex flex-wrap justify-end gap-1">' + tail + "</span></div>" +
        '<div class="mt-1 flex flex-wrap gap-x-3 pl-[72px] font-mono text-[11px] text-dim"><span>' + fmtDate(r.t) + ", " + fmtTime(r.t) + "</span><span>" + r.m.toFixed(1) + " %</span><span>pH " + r.ph.toFixed(2) + "</span><span>" + r.tc.toFixed(1) + " &deg;C</span></div></div>";
    }).join("");
  }

  function renderLog() {
    $("log").innerHTML = st.log.length ? st.log.map((e) => '<li class="flex gap-2"><span class="shrink-0 font-mono text-[11px] leading-5 text-dim">' + (e.at != null ? fmtDate(e.at) + " " + fmtTime(e.at) : "--") + '</span><span class="text-muted">' + e.text + "</span></li>").join("") : '<li class="text-dim">Nothing yet.</li>';
    $("logCount").textContent = st.log.length ? st.log.length + " events" : "";
  }

  function renderAll() { renderSource(); renderClock(); renderScenarios(); renderNodes(); renderLog(); }

  const loadModel = () => window.SOIL_MODEL ? Promise.resolve() : new Promise((res, rej) => {
    const el = document.createElement("script"); el.src = "model.js"; el.onload = res; el.onerror = () => rej(new Error("Could not load model.js")); document.body.appendChild(el);
  });

  const copyHistory = () => { const o = {}; for (const n of NODES) o[n] = D.nodes[n].slice(); return o; };

  const firebaseCtl = {
    sim: null, tracker: null, ticker: null, pending: [], sending: false, active: false, resetting: false,
    async start() {
      this.active = true;
      st.conn = "wait"; st.connText = "Connecting"; st.error = ""; renderSource();
      try {
        await loadModel();
        const existing = await fb.readAll();
        await fb.signIn();
        if (!this.active) return;
        this.tracker = new L.Tracker(window.SOIL_MODEL, copyHistory());
        this.tracker.ingest(existing);
        this.sim = new SIM.Simulator(D.nodes, SEED, this.tracker.since());
        st.clock = this.sim.clock; st.nodes = this.tracker.summary(); st.offline = [];
        st.conn = "ok"; st.connText = "Connected";
        log(existing.length ? "Connected to Firebase. Continuing from " + existing.length + " readings already in the live feed." : "Connected to Firebase. The live feed is empty, so the demo starts right after the recorded month.");
        if (!this.ticker) this.ticker = L.makeTicker(() => this.active && this.tick());
        this.schedule();
      } catch (e) {
        st.conn = "error"; st.connText = "Not connected"; st.error = e.message;
        log("Firebase problem: " + e.message);
      }
      renderAll();
    },
    stop() { this.active = false; if (this.ticker) this.ticker.set(0); },
    schedule() { if (this.ticker) this.ticker.set(st.paused || !this.sim ? 0 : st.sph * 1000); },
    async flush() {
      if (this.sending || !this.pending.length) return;
      this.sending = true;
      const batch = this.pending.splice(0, 600);
      try {
        await fb.publish(batch);
        if (st.conn !== "ok") { st.conn = "ok"; st.connText = "Connected"; st.error = ""; renderSource(); }
      } catch (e) {
        this.pending.unshift(...batch);
        if (st.conn !== "error") log("Could not send readings, will retry: " + e.message);
        st.conn = "error"; st.connText = "Retrying"; st.error = e.message; renderSource();
      }
      this.sending = false;
      if (this.pending.length && st.conn === "ok") this.flush();
    },
    send(items) {
      if (!items.length) return;
      this.tracker.ingest(items);
      this.pending.push(...items);
      st.clock = this.sim.clock; st.nodes = this.tracker.summary(); st.offline = this.sim.nodes.filter((n) => this.sim.s[n].offline);
      renderClock(); renderNodes(); renderScenarios();
      this.flush();
    },
    tick() { if (!this.resetting) this.send(this.sim.tick()); },
    command(cmd, node) {
      const out = this.sim.command(cmd, node);
      st.offline = this.sim.nodes.filter((n) => this.sim.s[n].offline);
      if (out.length) this.send(out); else renderNodes();
    },
    skip(h) { const all = []; for (let i = 0; i < h; i++) all.push(...this.sim.tick()); this.send(all); },
    pause(p) { st.paused = p; this.schedule(); renderClock(); },
    speed(s) { st.sph = s; this.schedule(); renderClock(); },
    async reset() {
      this.resetting = true;
      this.pending = [];
      try {
        await fb.reset();
        this.tracker.reset();
        this.sim = new SIM.Simulator(D.nodes, SEED);
        st.clock = this.sim.clock; st.nodes = this.tracker.summary(); st.offline = [];
        log("Demo reset. The live feed is empty again.");
      } catch (e) { log("Reset failed: " + e.message); }
      this.resetting = false;
      renderAll();
    },
    ready() { return !!this.sim; },
  };

  const localCtl = {
    ch: null, timer: null, active: false,
    start() {
      this.active = true;
      st.conn = "wait"; st.connText = "Looking for the app"; st.error = "";
      if (!("BroadcastChannel" in window)) { st.conn = "error"; st.connText = "Not supported"; st.error = "This browser cannot link two tabs. Use Firebase or a newer browser."; renderAll(); return; }
      this.ch = new BroadcastChannel(L.CHANNEL);
      this.ch.onmessage = (e) => {
        const m = e.data || {};
        if (m.type !== "status" || !this.active) return;
        const first = !st.seen || Date.now() - st.seen > 5000;
        st.seen = Date.now();
        st.clock = m.clock; st.sph = m.secondsPerHour; st.paused = m.paused; st.nodes = m.nodes || {}; st.offline = m.offline || [];
        if (first) { st.conn = "ok"; st.connText = "App open"; log("Found the app in this browser."); renderSource(); }
        renderClock(); renderNodes(); renderScenarios();
      };
      const hello = () => {
        this.ch.postMessage({ type: "hello" });
        if (st.seen && Date.now() - st.seen > 6000 && st.conn === "ok") { st.conn = "warn"; st.connText = "App not open"; log("Lost the app. Is its tab still open?"); renderSource(); }
        if (!st.seen && st.conn === "wait") { st.conn = "warn"; st.connText = "App not open"; renderSource(); }
      };
      this.timer = setInterval(hello, 2000);
      this.ch.postMessage({ type: "hello" });
      renderAll();
    },
    stop() { this.active = false; clearInterval(this.timer); if (this.ch) this.ch.close(); this.ch = null; st.seen = 0; },
    post(m) { if (this.ch) this.ch.postMessage(m); },
    command(cmd, node) { this.post({ type: "command", cmd, node }); },
    skip(h) { this.post({ type: "skip", hours: h }); },
    pause(p) { st.paused = p; this.post({ type: p ? "pause" : "resume" }); renderClock(); },
    speed(s) { st.sph = s; this.post({ type: "speed", secondsPerHour: s }); renderClock(); },
    reset() { this.post({ type: "reset" }); log("Demo reset. The app shows only the recorded month again."); },
    ready() { return st.conn === "ok"; },
  };

  let ctl = st.mode === "firebase" ? firebaseCtl : localCtl;

  function switchMode(m) {
    if (m === st.mode) return;
    ctl.stop();
    st.mode = m; store.set("scm-mode", m);
    st.clock = null; st.nodes = {}; st.offline = [];
    ctl = m === "firebase" ? firebaseCtl : localCtl;
    if (m === "firebase") st.paused = false;
    ctl.start();
    renderAll();
  }

  function guard() {
    if (ctl.ready()) return true;
    toast(st.mode === "local" ? "Open the app in this browser first" : "Not connected to Firebase yet");
    return false;
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;
    if (t.dataset.mode && !t.disabled) return switchMode(t.dataset.mode);
    if (t.dataset.node) { st.node = t.dataset.node; renderScenarios(); return; }
    if (t.dataset.speed) { if (guard()) ctl.speed(+t.dataset.speed); return; }
    if (t.dataset.skip) {
      if (!guard()) return;
      ctl.skip(+t.dataset.skip);
      log("Moved ahead " + t.dataset.skip + " h.");
      return;
    }
    if (t.dataset.cmd) {
      if (!guard()) return;
      const s = SIM.SCENARIOS[t.dataset.cmd];
      ctl.command(t.dataset.cmd, st.node);
      log(s.label + " at " + label(st.node) + ".");
      toast(s.label + " started at " + label(st.node));
      return;
    }
    if (t.id === "pause") { if (guard()) { ctl.pause(!st.paused); log(st.paused ? "Paused." : "Resumed."); } return; }
    if (t.id === "retry") { firebaseCtl.start(); return; }
    if (t.id === "copyLink") {
      const done = () => toast("Link copied");
      if (navigator.clipboard) navigator.clipboard.writeText(appURL()).then(done, () => toast(appURL()));
      else toast(appURL());
      return;
    }
    if (t.id === "reset") {
      if (!guard()) return;
      if (Date.now() - st.armed > 4000) {
        st.armed = Date.now();
        t.textContent = "Tap again to reset";
        setTimeout(() => { if (Date.now() - st.armed >= 4000) t.textContent = "Reset the demo"; }, 4100);
        return;
      }
      st.armed = 0;
      t.textContent = "Reset the demo";
      ctl.reset();
    }
  });

  ctl.start();
  renderAll();
})();
