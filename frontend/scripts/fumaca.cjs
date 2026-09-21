/* 🔥 TESTE DE FUMAÇA DO FRONTEND (nasceu do build quebrado de 19/09).
   Sobe o `dist` num servidor estático local, abre no Chromium e importa TODOS
   os chunks gerados. Qualquer erro de execução ("Cannot access X before
   initialization", import quebrado, etc.) derruba o processo com código 1.
   É o que o `npm run build` não pega: o build passa, a tela fica branca.

   Uso: node scripts/fumaca.cjs [caminho-do-chrome]
   Sem argumento, usa o Chrome do puppeteer (CI) ou o do Playwright local. */
const fs = require('fs');
const path = require('path');
const http = require('http');

const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = 4321;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

function servir() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let p = path.join(DIST, url === '/' ? 'index.html' : url);
      if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('dist/ não existe — rode npm run build antes'); process.exit(1); }
  let puppeteer;
  try { puppeteer = require('puppeteer'); } catch { puppeteer = require('puppeteer-core'); }
  const executablePath = process.argv[2] || process.env.CHROME_PATH || undefined;
  const srv = await servir();
  const b = await puppeteer.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/i.test(m.text())) erros.push(`console: ${m.text()}`); });
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  const chunks = fs.readdirSync(path.join(DIST, 'assets')).filter((f) => f.endsWith('.js'));
  let falhas = 0;
  for (const f of chunks) {
    const r = await p.evaluate(async (u) => { try { await import(u); return 'OK'; } catch (e) { return 'FALHOU · ' + e.message; } }, '/assets/' + f);
    if (r !== 'OK') falhas++;
    console.log(`${r === 'OK' ? '✅' : '❌'} ${f.padEnd(40)} ${r}`);
  }
  await b.close(); srv.close();
  if (falhas || erros.length) {
    console.error(`\n❌ FUMAÇA: ${falhas} chunk(s) falharam, ${erros.length} erro(s) de página`);
    erros.slice(0, 10).forEach((e) => console.error('  ', e));
    process.exit(1);
  }
  console.log(`\n✅ FUMAÇA OK: ${chunks.length} chunks carregaram sem erro`);
})().catch((e) => { console.error('erro:', e.message); process.exit(1); });
