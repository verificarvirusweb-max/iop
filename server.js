// Tracker de IPs — Node.js 18+, sin dependencias.
// Uso:  DASHBOARD_PASSWORD=tuclave node server.js
// Si está detrás de un proxy (Nginx, Cloudflare, Render, etc.): TRUST_PROXY=1

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const USER = process.env.DASHBOARD_USER || "admin";
const PASS = process.env.DASHBOARD_PASSWORD || "cambia-esto";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const LOG = path.join(__dirname, "visits.jsonl");

function getIP(req) {
  let ip = req.socket.remoteAddress || "";
  if (TRUST_PROXY) {
    const xf = req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"];
    if (xf) ip = String(xf).split(",")[0].trim();
  }
  return ip.replace(/^::ffff:/, "");
}

function logVisit(req) {
  const row = {
    ip: getIP(req),
    time: new Date().toISOString(),
    path: req.url.slice(0, 200),
    ua: (req.headers["user-agent"] || "").slice(0, 300),
    ref: (req.headers["referer"] || "").slice(0, 300),
  };
  fs.appendFile(LOG, JSON.stringify(row) + "\n", () => {});
}

function readVisits() {
  if (!fs.existsSync(LOG)) return [];
  return fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function authorized(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  const [u, ...p] = Buffer.from(h.slice(6), "base64").toString().split(":");
  return u === USER && p.join(":") === PASS;
}

const HOME = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bienvenido</title>
<style>
:root{--bg:#f6f4ef;--ink:#1c2321;--mute:#5d6a66;--acc:#1f6f5c;--line:#dcd8cd}
@media(prefers-color-scheme:dark){:root{--bg:#141a18;--ink:#e9efec;--mute:#93a29d;--acc:#5fc4a8;--line:#2a3632}}
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{display:flex;flex-direction:column;background:var(--bg);color:var(--ink);font:17px/1.6 Georgia,"Times New Roman",serif}
main{flex:1;max-width:640px;width:100%;margin:0 auto;padding:12vh 24px 48px}
h1{font-size:clamp(2.2rem,6vw,3.4rem);line-height:1.1;margin:0 0 20px;letter-spacing:-.01em}
p{color:var(--mute);margin:0 0 16px}
footer{border-top:1px solid var(--line);padding:18px 24px;display:flex;gap:16px;flex-wrap:wrap;align-items:center;justify-content:space-between;font:14px/1.4 system-ui,sans-serif;color:var(--mute)}
footer a{color:var(--ink);text-decoration:none;border:1px solid var(--line);padding:8px 16px;border-radius:6px}
footer a:hover,footer a:focus-visible{border-color:var(--acc);color:var(--acc);outline:none}
</style></head><body>
<main>
<h1>Hola, gracias por pasar.</h1>
<p>Esta es una página sencilla. Puedes quedarte a leer o cerrarla cuando quieras.</p>
<p>Pronto habrá más contenido por aquí.</p>
</main>
<footer>
<span>Esta página registra la dirección IP de sus visitantes.</span>
<a href="/dashboard">Panel de visitas</a>
</footer>
</body></html>`;

const DASH = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel de visitas</title>
<style>
:root{--bg:#f4f5f3;--card:#fff;--ink:#17201d;--mute:#64726d;--acc:#1f6f5c;--line:#dfe3df}
@media(prefers-color-scheme:dark){:root{--bg:#101614;--card:#18211e;--ink:#e8eeeb;--mute:#8f9f99;--acc:#5fc4a8;--line:#27332f}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:20px 24px;border-bottom:1px solid var(--line)}
h1{font-size:1.2rem;margin:0}
a{color:var(--acc)}
.stats{display:flex;gap:32px;padding:24px;flex-wrap:wrap}
.stats b{display:block;font-size:2rem;line-height:1.1}
.stats span{color:var(--mute);font-size:.85rem}
.wrap{padding:0 24px 40px;overflow-x:auto}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line)}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--mute);font-weight:600;font-size:.82rem}
td.ip{font-family:ui-monospace,Menlo,monospace;color:var(--acc)}
td.ua{max-width:360px;overflow:hidden;text-overflow:ellipsis;color:var(--mute)}
.empty{padding:32px;color:var(--mute)}
</style></head><body>
<header><h1>Panel de visitas</h1><a href="/">Volver a la página</a></header>
<section class="stats">
<div><b id="total">–</b><span>visitas totales</span></div>
<div><b id="uniq">–</b><span>IPs distintas</span></div>
<div><b id="last">–</b><span>última visita</span></div>
</section>
<div class="wrap"><table>
<thead><tr><th>IP</th><th>Fecha y hora</th><th>Ruta</th><th>Navegador</th></tr></thead>
<tbody id="rows"></tbody></table>
<div class="empty" id="empty" hidden>Aún no hay visitas. Abre la página principal para registrar la primera.</div></div>
<script>
async function load(){
  const r = await fetch("/api/visits"); if(!r.ok) return;
  const d = await r.json();
  total.textContent = d.length;
  uniq.textContent = new Set(d.map(v=>v.ip)).size;
  last.textContent = d[0] ? new Date(d[0].time).toLocaleTimeString() : "–";
  empty.hidden = d.length>0;
  rows.replaceChildren(...d.map(v=>{
    const tr=document.createElement("tr");
    [["ip",v.ip],["",new Date(v.time).toLocaleString()],["",v.path],["ua",v.ua]].forEach(([c,t])=>{
      const td=document.createElement("td"); td.className=c; td.textContent=t; if(c==="ua")td.title=t; tr.append(td);
    }); return tr;
  }));
}
load(); setInterval(load, 5000);
</script></body></html>`;

http.createServer((req, res) => {
  const url = req.url.split("?")[0];

  if (url === "/dashboard" || url === "/api/visits") {
    if (!authorized(req)) {
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Panel"' });
      return res.end("Acceso restringido");
    }
    if (url === "/api/visits") {
      const data = readVisits().reverse().slice(0, 500);
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify(data));
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(DASH);
  }

  if (url === "/") {
    logVisit(req);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(HOME);
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("No encontrado");
}).listen(PORT, () => {
  console.log("Página:  http://localhost:" + PORT);
  console.log("Panel:   http://localhost:" + PORT + "/dashboard  (usuario: " + USER + ")");
});
