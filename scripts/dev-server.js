// Servidor local: sirve /public y ejecuta /api/*.js como lo haría Vercel.
// Uso: npm install && npm run dev  ->  http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');

// Carga .env sin dependencias
try {
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch { console.warn('Aviso: no hay fichero .env (copia .env.example)'); }

const PUB = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
    const file = path.join(__dirname, '..', 'api', name + '.js');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('{"error":"no existe"}'); }
    let raw = ''; for await (const c of req) raw += c;
    req.body = raw ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : {};
    res.status = c => { res.statusCode = c; return res; };
    res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    delete require.cache[require.resolve(file)];
    return require(file)(req, res);
  }
  let p = path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('No encontrado'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(3000, () => console.log('Local: http://localhost:3000'));
