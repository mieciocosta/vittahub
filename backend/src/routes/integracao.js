import express from 'express';

// ─── Integração servidor-a-servidor (ex.: VittaMed → VittaHub) ────────────────
// Permite que outro sistema da clínica envie mensagens pelo WhatsApp conectado
// aqui (Z-API), autenticando por token secreto compartilhado (INTEGRACAO_TOKEN).
// Sem o env configurado, o endpoint responde 503 e nada é enviado.

const r = express.Router();

const ZAPI_BASE = () => `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}`;
const ZAPI_CTOKEN = () => process.env.ZAPI_CLIENT_TOKEN || '';
const zapiOk = () => process.env.ZAPI_INSTANCE && process.env.ZAPI_TOKEN;

async function zapiSendText(phone, message) {
  const { default: fetch } = await import('node-fetch');
  const headers = { 'Content-Type': 'application/json' };
  if (ZAPI_CTOKEN()) headers['Client-Token'] = ZAPI_CTOKEN();
  return fetch(`${ZAPI_BASE()}/send-text`, {
    method: 'POST', headers,
    body: JSON.stringify({ phone, message }),
    signal: AbortSignal.timeout(15000),
  });
}

// Auth por token compartilhado — nunca aceita chamadas sem o env configurado.
function autenticado(req) {
  const esperado = process.env.INTEGRACAO_TOKEN;
  if (!esperado || esperado.length < 16) return false; // exige token forte configurado
  return req.headers['x-integracao-token'] === esperado;
}

// POST /api/integracao/send-text { phone: "98984221002" | "5598984221002", message }
r.post('/send-text', async (req, res) => {
  if (!autenticado(req)) return res.status(403).json({ error: 'Token de integração ausente ou inválido.' });
  if (!zapiOk()) return res.status(503).json({ error: 'WhatsApp (Z-API) não configurado.' });
  const b = req.body || {};
  let phone = String(b.phone || '').replace(/\D/g, '');
  const message = String(b.message || '').slice(0, 3000);
  if (!phone || phone.length < 10 || !message.trim()) return res.status(400).json({ error: 'Informe phone e message.' });
  if (!phone.startsWith('55')) phone = `55${phone}`;
  try {
    const zr = await zapiSendText(phone, message);
    const txt = await zr.text().catch(() => '');
    if (!zr.ok) return res.status(502).json({ error: 'Falha no envio', detalhe: txt.slice(0, 180) });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(502).json({ error: 'Falha no envio', detalhe: err.message });
  }
});

// GET /api/integracao/status — o outro sistema confere se a ponte está de pé.
r.get('/status', (req, res) => {
  if (!autenticado(req)) return res.status(403).json({ error: 'Token de integração ausente ou inválido.' });
  res.json({ ok: true, whatsapp: !!zapiOk() });
});

export default r;
