import express from 'express';
import { query } from '../db/pool.js';

// ─── Integração servidor-a-servidor (ex.: VittaMed/VittaSys → VittaHub) ───────
// Permite que outro sistema da clínica envie mensagens pelo WhatsApp conectado
// aqui (Z-API) e leia a agenda do dia, autenticando por token secreto
// compartilhado (INTEGRACAO_TOKEN). Sem o env configurado, nada é exposto.

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

// POST /api/integracao/aviso — o VittaSys manda um aviso para o sino do VittaHub.
// Pedido do master: os dois sistemas conversam; o que o VittaSys detecta
// (cliente fidelidade sumido, oportunidade de plano) chega para quem atende aqui.
r.post('/aviso', async (req, res) => {
  if (!autenticado(req)) return res.status(403).json({ error: 'Token de integração ausente ou inválido.' });
  const b = req.body || {};
  const titulo = String(b.titulo || '').slice(0, 160).trim();
  const texto = String(b.texto || '').slice(0, 1200).trim();
  if (!titulo) return res.status(400).json({ error: 'Informe o titulo do aviso.' });
  const apenasMaster = b.apenas_master === true || b.apenas_master === 'true';
  try {
    const { rows: [n] } = await query(
      `INSERT INTO notificacoes (tipo, titulo, texto, apenas_master)
       VALUES ('vittasys', $1, $2, $3) RETURNING id, created_at`,
      [`💉 ${titulo}`, texto || null, apenasMaster]);
    return res.json({ ok: true, id: n.id, criado_em: n.created_at });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/integracao/agenda?data=YYYY-MM-DD — pedido do master: a agenda do
// VittaHub aparecer dentro do VittaSys. Somente LEITURA, mesmo token da ponte.
r.get('/agenda', async (req, res) => {
  if (!autenticado(req)) return res.status(403).json({ error: 'Token de integração ausente ou inválido.' });
  try {
    const data = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '')
      ? req.query.data
      : new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); // "hoje" no fuso de São Luís
    const { rows } = await query(`
      SELECT id, paciente, responsavel_nome, servico, data, hora, profissional,
             telefone, observacoes, status, setor, endereco, valor
      FROM agenda_eventos
      WHERE data = $1
      ORDER BY hora, created_at`, [data]);
    res.json({ ok: true, data, total: rows.length, itens: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default r;
