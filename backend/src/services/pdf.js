/* ─── HTML → PDF (Puppeteer) ───────────────────────────────────────────────────
   Motor único de PDF do VittaHub. Nasceu dentro do inbox.js pra gerar proposta
   de vacinas; virou serviço quando a Solicitação de Vacinas também passou a
   emitir PDF — duas cópias da mesma rotina de navegador é pedido de divergência.

   O caminho do Chrome muda conforme onde roda (imagem do Railway, container
   com chromium do sistema, ou o pacote @sparticuz), por isso a busca em ordem. */

export async function htmlParaPDF(html, { formato = 'A4', margem = null } = {}) {
  const puppeteer = (await import('puppeteer-core')).default;
  let browser;
  try {
    const fsMod = await import('fs');
    const sysChromePaths = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
    let execPath = sysChromePaths.find(p => { try { return fsMod.existsSync(p); } catch { return false; } });
    let launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'];
    if (!execPath) {
      const chromium = (await import('@sparticuz/chromium')).default;
      execPath = await chromium.executablePath();
      launchArgs = chromium.args;
    }
    browser = await puppeteer.launch({ args: launchArgs, executablePath: execPath, headless: true });
    const page = await browser.newPage();
    // 'load' e não 'networkidle0': o HTML é local e autocontido, sem rede pra
    // esperar — networkidle fica pendurado até o timeout à toa.
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 });
    const pdfBuffer = await page.pdf({
      format: formato, printBackground: true,
      ...(margem ? { margin: margem } : {}),
    });
    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

export default htmlParaPDF;
