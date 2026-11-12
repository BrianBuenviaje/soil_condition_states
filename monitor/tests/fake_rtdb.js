const http = require("http");

const port = +process.argv[2] || 9000;
let feed = null;
const listeners = new Set();
const KEY = /^t[0-9]+_[ir]_Node-[0-9]+$/;
const stats = { patches: 0, deletes: 0, refused: 0, streams: 0 };

const send = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(body));
};
const emit = (event, data) => {
  const msg = "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
  for (const res of listeners) res.write(msg);
};
const authed = (url) => {
  const t = url.searchParams.get("auth");
  if (!t) return false;
  try { return !!JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).user_id; } catch (e) { return false; }
};

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,PATCH,PUT,DELETE", "Access-Control-Allow-Headers": "*" });
    return res.end();
  }
  if (url.pathname === "/__stats") return send(res, 200, { ...stats, items: feed ? Object.keys(feed).length : 0 });
  if (url.pathname !== "/live/feed.json") return send(res, 401, { error: "Permission denied" });
  if (req.method === "GET" && (req.headers.accept || "").includes("text/event-stream")) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" });
    res.write("event: put\ndata: " + JSON.stringify({ path: "/", data: feed }) + "\n\n");
    listeners.add(res); stats.streams++;
    req.on("close", () => listeners.delete(res));
    return;
  }
  if (req.method === "GET") return send(res, 200, feed);
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (!authed(url)) { stats.refused++; return send(res, 401, { error: "Permission denied" }); }
    if (req.method === "DELETE") { feed = null; stats.deletes++; emit("put", { path: "/", data: null }); return send(res, 200, null); }
    if (req.method === "PATCH") {
      const data = JSON.parse(body || "{}");
      for (const [k, v] of Object.entries(data)) {
        if (!KEY.test(k) || !v || v.kind == null || v.node == null || v.t == null) { stats.refused++; return send(res, 400, { error: "Invalid data; couldn't parse JSON object" }); }
      }
      feed = Object.assign(feed || {}, data); stats.patches++;
      emit("patch", { path: "/", data });
      return send(res, 200, data);
    }
    send(res, 405, { error: "Method not allowed" });
  });
}).listen(port, "127.0.0.1", () => console.log("fake rtdb on", port));
setInterval(() => { for (const res of listeners) res.write("event: keep-alive\ndata: null\n\n"); }, 15000);
