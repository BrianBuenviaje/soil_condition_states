(function () {
  const D = window.SOIL_DATA;
  const HOUR = 3600e3;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const NODES = Object.keys(D.nodes).sort();
  const T0 = performance.now();

  const ST = {
    S1: { dot: "bg-s1", pill: "border-s1/25 bg-s1/10 text-s1", bar: "bg-s1" },
    S2: { dot: "bg-s2", pill: "border-s2/25 bg-s2/10 text-s2", bar: "bg-s2" },
    S3: { dot: "bg-s3", pill: "border-s3/25 bg-s3/10 text-s3", bar: "bg-s3" },
    S4: { dot: "bg-s4", pill: "border-s4/25 bg-s4/10 text-s4", bar: "bg-s4" },
  };
  const KIND = { R1: "action", R2: "action", R3: "action", R5: "action", R6: "action", R4: "ok", R7: "check", R8: "settle" };
  const KS = {
    action: { label: "Action", icon: "alert", edge: "border-l-clay", chip: "bg-clay/10 text-clay", ico: "bg-clay/10 text-clay" },
    ok: { label: "No action", icon: "check", edge: "border-l-s2", chip: "bg-s2/10 text-s2", ico: "bg-s2/10 text-s2" },
    check: { label: "Data check", icon: "warn", edge: "border-l-s3", chip: "bg-s3/10 text-s3", ico: "bg-s3/10 text-s3" },
    settle: { label: "Settling", icon: "info", edge: "border-l-s1", chip: "bg-s1/10 text-s1", ico: "bg-s1/10 text-s1" },
    none: { label: "No rule", icon: "info", edge: "border-l-line", chip: "bg-empty text-muted", ico: "bg-empty text-muted" },
  };
  const ICON = {
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16.5h.01"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    warn: '<path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    left: '<path d="m14.5 6-6 6 6 6"/>',
    left2: '<path d="m11.5 6-6 6 6 6"/><path d="m18.5 6-6 6 6 6"/>',
    right: '<path d="m9.5 6 6 6-6 6"/>',
    right2: '<path d="m5.5 6 6 6-6 6"/><path d="m12.5 6 6 6-6 6"/>',
    down: '<path d="m6 9.5 6 6 6-6"/>',
    replay: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4.5V9H8"/>',
    live: '<circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="9"/>',
    nodes: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    advice: '<path d="M12 3.5a6 6 0 0 0-3.5 10.9V17h7v-2.6A6 6 0 0 0 12 3.5Z"/><path d="M9.5 20.5h5"/>',
    week: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/>',
    rules: '<path d="M8 6h12"/><path d="M8 12h12"/><path d="M8 18h12"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/>',
  };
  const svg = (n, c) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="' + c + '" aria-hidden="true">' + ICON[n] + "</svg>";

  const parse = (s) => {
    const [d, t] = s.split("T");
    const [y, mo, da] = d.split("-").map(Number);
    const [h, mi, se] = (t || "00:00:00").split(":").map(Number);
    return Date.UTC(y, mo - 1, da, h || 0, mi || 0, se || 0);
  };
  const pad = (n) => String(n).padStart(2, "0");
  const dt = (ms) => new Date(ms);
  const fmtTime = (ms) => pad(dt(ms).getUTCHours()) + ":" + pad(dt(ms).getUTCMinutes());
  const fmtDate = (ms) => dt(ms).getUTCDate() + " " + MON[dt(ms).getUTCMonth()];
  const fmtDay = (ms) => DAY[dt(ms).getUTCDay()] + " " + fmtDate(ms) + " " + dt(ms).getUTCFullYear();
  const label = (n) => n.replace("-", " ");
  const CH = { moisture: "moisture", ph: "pH", temp: "temperature", ec: "conductivity" };

  for (const n of NODES) for (const r of D.nodes[n]) r.ms = parse(r.t);
  const H0 = Math.floor(parse(D.start) / HOUR) * HOUR;
  let H1 = Math.floor(parse(D.end) / HOUR) * HOUR;
  const slider = document.getElementById("slider");
  let MAXK = (H1 - H0) / HOUR;
  slider.max = String(MAXK);

  const S = { view: "nodes", node: NODES[0], k: MAXK, why: false };
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.get("t")) S.k = Math.max(0, Math.min(MAXK, Math.round((parse(q.get("t")) - H0) / HOUR) - 1));
  if (q.get("node") && NODES.includes(q.get("node"))) S.node = q.get("node");
  if (["nodes", "advice", "week", "rules"].includes(q.get("view"))) S.view = q.get("view");
  S.why = q.get("why") === "1";
  slider.value = String(S.k);
  const asOf = () => H0 + (S.k + 1) * HOUR - 1;

  const latest = (n, T) => {
    const a = D.nodes[n];
    let lo = 0, hi = a.length - 1, ans = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (a[m].ms <= T) { ans = m; lo = m + 1; } else hi = m - 1;
    }
    return ans < 0 ? null : a[ans];
  };

  const startMs = parse(D.start), endMs = parse(D.end);
  const setMeta = (e) => { document.getElementById("meta").textContent = "Davao City, " + NODES.length + " nodes, " + fmtDate(startMs) + " to " + fmtDate(e) + " " + dt(e).getUTCFullYear(); };
  const BADGE = { replay: ["replay", "Replay"], live: ["live", "Live"], sim: ["live", "Simulated"] };
  const setBadge = (m) => { const b = BADGE[m] || BADGE.replay; document.getElementById("replayTag").innerHTML = svg(b[0], "h-3 w-3") + b[1]; };
  setMeta(endMs);
  setBadge("replay");

  const stepIcon = { "-24": "left2", "-1": "left", "1": "right", "24": "right2" };
  document.querySelectorAll("button[data-step]").forEach((b) => {
    b.className = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-muted transition duration-150 hover:bg-raised hover:text-ink active:scale-90";
    b.innerHTML = svg(stepIcon[b.dataset.step], "h-4 w-4");
  });

  const TABS = [["nodes", "Nodes", "nodes"], ["advice", "Advice", "advice"], ["week", "Week", "week"], ["rules", "Rules", "rules"]];

  const pill = (s) =>
    '<span class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ' + ST[s].pill + '">' +
    '<i class="h-1.5 w-1.5 rounded-full ' + ST[s].dot + '"></i><span class="font-mono">' + s + "</span>" + D.states[s] + "</span>";

  const stat = (lab, val, unit) =>
    '<div><div class="text-[10px] font-semibold tracking-wider text-dim">' + lab + '</div><div class="font-mono text-[15px] font-medium">' + val +
    (unit ? '<span class="ml-0.5 text-[11px] font-normal text-dim">' + unit + "</span>" : "") + "</div></div>";

  const sectionTitle = (t, sub) =>
    '<div class="mb-3"><h2 class="text-lg font-semibold tracking-tight">' + t + "</h2>" + (sub ? '<p class="text-[13px] text-muted">' + sub + "</p>" : "") + "</div>";

  const switcher = () =>
    '<div class="mb-3 flex items-center gap-2"><span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Node</span><div class="grid flex-1 grid-cols-5 gap-1 rounded-xl bg-empty p-1">' +
    NODES.map((n) => {
      const on = n === S.node;
      return '<button data-node="' + n + '" aria-label="' + label(n) + '" class="rounded-lg py-1.5 font-mono text-sm font-medium transition duration-150 active:scale-95 ' +
        (on ? "bg-card text-brand shadow-sm" : "text-muted hover:text-ink") + '">' + n.slice(-2) + "</button>";
    }).join("") + "</div></div>";

  function nodesView(T) {
    let h = sectionTitle("Nodes", "Tap a node to see its advice");
    h += '<div class="space-y-2.5">';
    for (const n of NODES) {
      const r = latest(n, T);
      if (!r) { h += '<div class="rounded-xl border border-line bg-card p-4 text-sm text-dim">' + label(n) + ": no readings yet</div>"; continue; }
      const gap = Math.floor((T - r.ms) / HOUR);
      const recs = r.r.filter((x) => x !== "R8");
      h += '<button data-open="' + n + '" class="relative block w-full overflow-hidden rounded-xl border border-line bg-card py-3 pl-4 pr-3 text-left shadow-sm transition duration-150 hover:border-brand/40 active:scale-[0.99]">' +
        '<span class="absolute inset-y-0 left-0 w-1 ' + ST[r.s].bar + '"></span>' +
        '<div class="flex items-center justify-between gap-2"><div class="flex min-w-0 items-center gap-2"><span class="text-[15px] font-semibold">' + label(n) + "</span>" + pill(r.s) + "</div>" +
        '<span class="flex shrink-0 items-center gap-1 text-xs text-muted">' + svg("clock", "h-3.5 w-3.5") + '<span class="font-mono text-ink">' + r.h + " h</span>" + svg("right", "h-4 w-4 text-dim") + "</span></div>" +
        '<div class="mt-2 grid grid-cols-3 gap-2">' + stat("MOISTURE", r.m.toFixed(1), "%") + stat("pH", r.ph.toFixed(2), "") + stat("TEMP", r.tc.toFixed(1), "&deg;C") + "</div>" +
        '<div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">';
      if (r.st) h += '<span class="inline-flex items-center gap-1 rounded-md bg-s1/10 px-2 py-0.5 font-medium text-s1">' + svg("info", "h-3.5 w-3.5") + "Settling, no advice yet</span>";
      else if (recs.length) h += recs.map((id) => '<span class="rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold ' + KS[KIND[id]].chip + '">' + id + "</span>").join("") + '<span class="truncate text-muted">' + D.rules[recs[0]].action.split(";")[0] + (recs.length > 1 ? " and more" : "") + "</span>";
      else h += '<span class="text-dim">No rule applies</span>';
      if (gap >= 2) h += '<span class="inline-flex items-center gap-1 font-medium text-s3">' + svg("warn", "h-3.5 w-3.5") + "No reading for " + gap + " h</span>";
      h += "</div></button>";
    }
    return h + "</div>";
  }

  function evidence(id, r) {
    if (id === "R1" && r.i.recovery_interval_h !== undefined) return "S1 held " + r.h + " h against a recovery interval of " + r.i.recovery_interval_h + " h at this node.";
    if (id === "R3") return "Drier run of " + r.dr + " h with no S1 reading.";
    if (id === "R7" && r.i.out_of_range) return "Out of range: " + r.i.out_of_range.map((c) => CH[c] || c).join(", ") + ".";
    return "";
  }

  const row = (k, v) => v ? '<div><dt class="text-[10px] font-semibold uppercase tracking-wider text-dim">' + k + '</dt><dd class="mt-0.5 text-[13px] leading-relaxed text-muted">' + v + "</dd></div>" : "";

  function adviceCard(id, r, open) {
    const R = D.rules[id], K = KS[KIND[id]];
    return '<article class="rounded-xl border border-l-4 border-line bg-card p-4 shadow-sm ' + K.edge + '">' +
      '<div class="flex items-center gap-2"><span class="flex h-7 w-7 items-center justify-center rounded-md ' + K.ico + '">' + svg(K.icon, "h-4 w-4") + "</span>" +
      '<span class="rounded bg-ink px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">' + id + "</span>" +
      '<span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ' + K.chip + '">' + K.label + "</span></div>" +
      '<p class="mt-2.5 text-[17px] font-semibold leading-snug">' + R.action + ".</p>" +
      '<details data-rule="' + id + '" class="why mt-3 border-t border-line pt-2"' + (open ? " open" : "") + '><summary class="flex cursor-pointer items-center justify-between py-1 text-[13px] font-semibold text-brand">Why this advice' + svg("down", "why-chev h-4 w-4 transition-transform duration-200") + "</summary>" +
      '<dl class="why-body mt-2 space-y-2.5">' + row("Condition", R.condition + ".") + row("Observed", evidence(id, r)) +
      row("Basis", R.basis + '. <span class="text-dim">' + R.cites.join("; ") + ".</span>") + "</dl></details></article>";
  }

  function adviceView(T) {
    const r = latest(S.node, T);
    let h = switcher();
    if (!r) return h + '<p class="text-sm text-dim">No readings yet.</p>';
    h += '<div class="mb-3 rounded-xl border border-line bg-card p-4 shadow-sm"><div class="flex items-center justify-between gap-2"><span class="text-[15px] font-semibold">' + label(S.node) + "</span>" + pill(r.s) + "</div>" +
      '<div class="mt-1.5 flex items-center justify-between text-xs text-muted"><span>Held for <span class="font-mono text-ink">' + r.h + ' h</span></span><span class="font-mono">' + fmtDate(r.ms) + ", " + fmtTime(r.ms) + "</span></div></div>";
    h += '<h3 class="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Advice</h3><div class="space-y-2.5">';
    if (!r.r.length) {
      h += '<article class="rounded-xl border border-l-4 border-line border-l-line bg-card p-4 shadow-sm"><div class="flex items-center gap-2"><span class="flex h-7 w-7 items-center justify-center rounded-md ' + KS.none.ico + '">' + svg("info", "h-4 w-4") + "</span>" +
        '<span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ' + KS.none.chip + '">No rule</span></div><p class="mt-2.5 text-[17px] font-semibold leading-snug">No advice at this time.</p>' +
        '<p class="mt-1 text-[13px] text-muted">No rule applies to this state at this duration.</p></article>';
    } else {
      h += r.r.map((id, i) => adviceCard(id, r, S.why && i === 0)).join("");
    }
    return h + "</div>";
  }

  function weekView(T) {
    const r = latest(S.node, T);
    let h = switcher();
    const end = Math.floor(T / (24 * HOUR)) * 24 * HOUR;
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(end - i * 24 * HOUR);
    const by = new Map();
    for (const x of D.nodes[S.node]) if (x.ms <= T && x.ms >= days[0] - HOUR) by.set(Math.round(x.ms / HOUR), x);
    h += '<div class="rounded-xl border border-line bg-card p-4 shadow-sm"><div class="mb-3 flex items-baseline justify-between"><h3 class="text-[15px] font-semibold">Past week</h3><span class="font-mono text-xs text-muted">' + label(S.node) + "</span></div>";
    h += '<div class="grid grid-cols-[26px_repeat(7,minmax(0,1fr))] gap-[3px]"><div></div>';
    for (const d0 of days) h += '<div class="pb-1 text-center leading-tight"><div class="text-[10px] font-semibold text-dim">' + DAY[dt(d0).getUTCDay()] + '</div><div class="font-mono text-[11px] text-muted">' + dt(d0).getUTCDate() + "</div></div>";
    for (let hr = 0; hr < 24; hr++) {
      h += '<div class="self-center pr-1 text-right font-mono text-[9px] leading-none text-dim">' + (hr % 3 === 0 ? pad(hr) : "") + "</div>";
      for (const d0 of days) {
        const x = by.get(d0 / HOUR + hr);
        const cur = x && r && x === r;
        h += '<div class="h-[11px] rounded-[2px] ' + (x ? ST[x.s].bar : "bg-empty") + (cur ? " ring-2 ring-ink ring-offset-1 ring-offset-card" : "") + '"></div>';
      }
    }
    h += "</div>";
    h += '<div class="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-muted">' + Object.entries(D.states).map(([c, nm]) => '<span class="inline-flex items-center gap-1"><i class="h-2.5 w-2.5 rounded-sm ' + ST[c].dot + '"></i><span class="font-mono font-semibold">' + c + "</span> " + nm + "</span>").join("") +
      '<span class="inline-flex items-center gap-1"><i class="h-2.5 w-2.5 rounded-sm bg-empty"></i>No reading</span></div></div>';
    const counts = { S1: 0, S2: 0, S3: 0, S4: 0 };
    const from = Math.max(days[0], H0);
    for (const [key, x] of by) if (key * HOUR >= from) counts[x.s]++;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const avail = Math.max(1, Math.round((T + 1 - from) / HOUR));
    h += '<div class="mt-3 rounded-xl border border-line bg-card p-4 shadow-sm"><div class="mb-2 flex items-baseline justify-between"><h3 class="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Hours in each state</h3><span class="font-mono text-[11px] text-dim">' + total + " of " + avail + " h read</span></div>" +
      '<div class="flex h-2 overflow-hidden rounded-full bg-empty">' + Object.keys(counts).map((c) => counts[c] ? '<div class="' + ST[c].bar + '" style="width:' + (100 * counts[c] / avail).toFixed(2) + '%"></div>' : "").join("") + "</div>" +
      '<div class="mt-3 grid grid-cols-4 gap-2">' + Object.keys(counts).map((c) => '<div class="rounded-lg bg-raised px-2 py-1.5"><div class="flex items-center gap-1 text-[11px] text-muted"><i class="h-2 w-2 rounded-sm ' + ST[c].dot + '"></i><span class="font-mono font-semibold">' + c + '</span></div><div class="font-mono text-[15px] font-medium">' + counts[c] + '<span class="ml-0.5 text-[11px] font-normal text-dim">h</span></div></div>').join("") + "</div></div>";
    return h;
  }

  function rulesView() {
    let h = sectionTitle("Rules", "Every piece of advice comes from one of these eight rules");
    const groups = [["S1", ["R1", "R2"]], ["S2", ["R4"]], ["dry", ["R3"]], ["S4", ["R5"]], ["site", ["R6", "R7", "R8"]]];
    const names = { dry: "Drier states, S3 and S4", site: "Probe and site" };
    for (const [g, ids] of groups) {
      h += '<div class="mb-2 mt-4 flex items-center gap-2">' + (ST[g] ? pill(g) : '<span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">' + names[g] + "</span>") + "</div>";
      h += '<div class="space-y-2">' + ids.map((id) => {
        const R = D.rules[id], K = KS[KIND[id]];
        return '<article class="rounded-xl border border-line bg-card p-3.5 shadow-sm"><div class="flex items-center gap-2"><span class="rounded bg-ink px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">' + id + "</span>" +
          '<span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ' + K.chip + '">' + K.label + "</span></div>" +
          '<p class="mt-2 text-[15px] font-semibold leading-snug">' + R.action + ".</p>" +
          '<p class="mt-1 text-[13px] leading-relaxed text-muted"><span class="font-semibold text-ink">When: </span>' + R.condition + ".</p>" +
          '<p class="mt-1 text-[12px] leading-relaxed text-dim">' + R.cites.join("; ") + ".</p></article>";
      }).join("") + "</div>";
    }
    return h;
  }

  function tabs() {
    document.getElementById("tabs").innerHTML = TABS.map(([v, lab, ic]) => {
      const on = v === S.view;
      return '<button data-view="' + v + '" class="relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors duration-150 ' + (on ? "text-brand" : "text-dim hover:text-ink") + '">' +
        '<span class="absolute top-0 h-0.5 w-10 rounded-full transition-all duration-200 ' + (on ? "bg-brand opacity-100" : "bg-transparent opacity-0") + '"></span>' +
        svg(ic, "h-5 w-5") + lab + "</button>";
    }).join("");
  }

  let lastView = null;
  function render(quiet) {
    const T = asOf();
    document.getElementById("now").textContent = fmtDay(T + 1) + ", " + fmtTime(T + 1);
    slider.style.setProperty("--p", (100 * S.k / MAXK).toFixed(2) + "%");
    const el = document.getElementById("view");
    if (quiet && S.view === "rules") return;
    const open = {};
    el.querySelectorAll("details[data-rule]").forEach((d) => { open[d.dataset.rule] = d.open; });
    const html = S.view === "nodes" ? nodesView(T) : S.view === "advice" ? adviceView(T) : S.view === "week" ? weekView(T) : rulesView();
    const changed = lastView !== S.view + S.node;
    el.innerHTML = '<div class="' + (changed ? "animate-viewIn" : "") + '">' + html + "</div>";
    if (quiet && !changed) el.querySelectorAll("details[data-rule]").forEach((d) => { if (d.dataset.rule in open) d.open = open[d.dataset.rule]; });
    lastView = S.view + S.node;
    tabs();
  }

  function extend() {
    let end = endMs;
    for (const n of NODES) { const a = D.nodes[n]; if (a.length) end = Math.max(end, a[a.length - 1].ms); }
    const atEnd = S.k >= MAXK;
    H1 = Math.floor(end / HOUR) * HOUR;
    MAXK = (H1 - H0) / HOUR;
    slider.max = String(MAXK);
    if (atEnd || S.k > MAXK) S.k = MAXK;
    slider.value = String(S.k);
    setMeta(end);
    render(true);
  }

  function go(view, node) {
    if (node) S.node = node;
    S.view = view;
    S.why = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }

  document.getElementById("view").addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]");
    if (o) return go("advice", o.dataset.open);
    const n = e.target.closest("[data-node]");
    if (n) { S.node = n.dataset.node; render(); }
  });
  document.getElementById("tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (b) go(b.dataset.view);
  });
  const setK = (k) => { S.k = Math.max(0, Math.min(MAXK, k)); slider.value = String(S.k); render(); };
  slider.addEventListener("input", () => setK(Number(slider.value)));
  document.querySelectorAll("button[data-step]").forEach((b) => b.addEventListener("click", () => setK(S.k + Number(b.dataset.step))));

  render();

  const pre = document.getElementById("preloader");
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  const logo = new Promise((res) => { const im = new Image(); im.onload = im.onerror = res; im.src = "logo.png"; });
  const shown = Promise.all([fonts, logo]).then(() => new Promise((res) => {
    const wait = Math.max(0, 700 - (performance.now() - T0));
    setTimeout(() => { pre.classList.add("done"); document.body.dataset.ready = "1"; res(); }, wait);
  }));

  const load = (src) => new Promise((res, rej) => { const el = document.createElement("script"); el.src = src; el.onload = res; el.onerror = rej; document.body.appendChild(el); });
  const source = new URLSearchParams(location.search).get("source");
  if (source !== "replay" && window.SoilLive && window.SoilEngine && window.SoilSimulator) {
    shown.then(() => (window.SOIL_MODEL ? null : load("model.js"))).then(() => {
      window.SoilLive.startApp({
        data: D, model: window.SOIL_MODEL, config: window.SOIL_CONFIG || {},
        onUpdate: extend,
        onMode: (m, why) => {
          if (document.body.dataset.source === m) return;
          setBadge(m);
          document.body.dataset.source = m;
          if (why) console.info("Data source:", m, "(" + why + ")");
        },
      });
    }).catch((e) => console.warn("Live data unavailable, showing the recorded month only", e));
  }

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
