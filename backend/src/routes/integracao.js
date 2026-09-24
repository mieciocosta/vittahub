import express from 'express';
import { socketEmit } from '../socketServer.js';
import { query } from '../db/pool.js';
import { pareceMensagemDeTeste, avisarTesteBloqueado } from '../services/freio.js';

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
  /* 🚨 A ponte com o VittaSys/VittaMed é uma porta de envio como qualquer
     outra — e a mais provável de carregar sobra de homologação do outro lado.
     Mensagem de teste não passa por aqui pro WhatsApp do cliente. */
  if (pareceMensagemDeTeste(message)) {
    await avisarTesteBloqueado(query, { texto: message, destino: phone, origem: 'ponte de integração (VittaSys/VittaMed)' });
    return res.status(409).json({ error: 'Mensagem de teste bloqueada — o VittaHub não envia texto de teste para clientes.' });
  }
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

/* ═══ 💬 A CONVERSA DO WHATSAPP DENTRO DO VITTASYS (ordem do master, 24/09/2026) ═══
   "Na hora do Chamar a família, quero um chat igual ao do CRM do VittaHub."
   O número do WhatsApp é UM só, e um número só entrega mensagem (webhook) pra
   um sistema — este. Então o VittaSys não liga na Z-API por conta própria: ele
   lê e escreve NA MESMA conversa daqui, pela ponte. O que a equipe do VittaSys
   manda aparece no inbox do VittaHub assinado com o nome dela; o que a família
   responde aparece nos dois. Nada de segundo webhook, nada de histórico
   partido em dois. */
const digitos = (v) => String(v || '').replace(/\D/g, '');
async function conversaPorTelefone(phoneIn, { criar = false, nome = null } = {}) {
  let d = digitos(phoneIn);
  if (d.length < 10) return null;
  const com55 = d.startsWith('55') ? d : `55${d}`;
  const sem55 = com55.slice(2);
  const { rows } = await query(`
    SELECT * FROM conversas
    WHERE channel = 'whatsapp' AND (
      contact_id = $1 || '@s.whatsapp.net' OR contact_id = $2 || '@s.whatsapp.net'
      OR regexp_replace(COALESCE(phone,''), '\\D', '', 'g') IN ($1, $2)
      OR RIGHT(regexp_replace(COALESCE(phone,''), '\\D', '', 'g'), 10) = RIGHT($1, 10))
    ORDER BY last_message_at DESC NULLS LAST LIMIT 1`, [com55, sem55]);
  if (rows[0] || !criar) return rows[0] || null;
  const { rows: [nova] } = await query(`
    INSERT INTO conversas (channel, contact_name, contact_id, phone, unread, last_message, last_message_at, status_atend)
    VALUES ('whatsapp', $1, $2 || '@s.whatsapp.net', $2, 0, '', NOW(), 'aberto')
    ON CONFLICT (contact_id) DO UPDATE SET updated_at = NOW() RETURNING *`, [String(nome || com55).slice(0, 120), com55]);
  return nova;
}

// GET /api/integracao/conversa?phone=…&limite=80&desde=<ISO> — histórico da conversa
r.get('/conversa', async (req, res) => {
  if (!autenticado(req)) return res.status(403).json({ error: 'Token de integração ausente ou inválido.' });
  try {
    const conv = await conversaPorTelefone(req.query.phone);
    if (!conv) return res.json({ conversa: null, mensagens: [] });
    const limite = Math.min(300, Math.max(1, +req.query.limite || 80));
    const desde = req.query.desde && !isNaN(new Date(req.query.desde)) ? new Date(req.query.desde) : null;
    const { rows } = await query(`
      SELECT id, from_type, type, content, sender_nome, status, created_at, filename, mimetype, transcricao
      FROM mensagens WHERE conversa_id = $1 AND from_type <> 'system' AND ($2::timestamptz IS NULL OR created_at > $2)
      ORDER BY created_at DESC LIMIT $3`, [conv.id, desde, limite]);
    let resp = null;
    if (conv.responsavel_id) { const { rows: [u] } = await query(`SELECT nome FROM usuarios WHERE id = $1`, [conv.responsavel_id]).catch(() => ({ rows: [] })); resp = u?.nome || null; }
    res.json({
      conversa: { id: conv.id, nome: conv.contact_name, phone: conv.phone, unread: conv.unread || 0, responsavel: resp, status_atend: conv.status_atend || null, bot_ativo: !!conv.bot_ativo, ultima_em: conv.last_message_at },
      mensagens: rows.reverse().map(m => ({ id: m.id, de: m.from_type === 'contact' ? 'cliente' : (m.from_type === 'bot' ? 'vitta' : 'equipe'), tipo: m.type || 'text',
        texto: m.content, quem: m.sender_nome || null, status: m.status || null, em: m.created_at, arquivo: m.filename || null, mime: m.mimetype || null, transcricao: m.transcricao || null })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/integracao/conversa/enviar { phone, message, sender_nome, nome_contato } — grava aqui e manda pelo WhatsApp
r.post('/conversa/enviar', async (req, res) => {
  if (!autenticado(req)) return res.status(403).json({ error: 'Token de integração ausente ou inválido.' });
  const b = req.body || {};
  const message = String(b.message || '').trim().slice(0, 3000);
  if (!message || digitos(b.phone).length < 10) return res.status(400).json({ error: 'Informe phone (com DDD) e message.' });
  try {
    const conv = await conversaPorTelefone(b.phone, { criar: true, nome: b.nome_contato });
    if (!conv) return res.status(400).json({ error: 'Telefone inválido.' });
    const { enviarTextoConversa } = await import('./inbox.js');
    const quem = String(b.sender_nome || 'VittaSys').slice(0, 60);
    const msg = await enviarTextoConversa(conv, message, `${quem} · VittaSys`);
    res.json({ ok: true, conversa_id: conv.id, mensagem: { id: msg.id, de: 'equipe', tipo: 'text', texto: msg.content, quem: msg.sender_nome, status: msg.status, em: msg.created_at }, whatsapp: !!zapiOk() });
  } catch (err) {
    const teste = /teste bloqueada/i.test(err.message || '');
    res.status(teste ? 409 : 502).json({ error: err.message });
  }
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

// POST /api/integracao/agenda — o VittaSys agenda e o evento cai DIRETO na
// agenda daqui. Pedido do master: um botão só, e o cliente já aparece nos dois
// sistemas. Idempotente por (paciente, data, hora): não duplica se repetir.
r.post('/agenda', async (req, res) => {
  if (!autenticado(req)) return res.status(403).json({ error: 'Token de integração ausente ou inválido.' });
  const b = req.body || {};
  const cut = (v, n) => (v == null ? null : String(v).slice(0, n));
  const paciente = cut((b.paciente || '').trim(), 80);
  if (!paciente) return res.status(400).json({ error: 'Nome do paciente é obrigatório' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.data || '')) return res.status(400).json({ error: 'Data inválida (YYYY-MM-DD)' });
  const hora = /^\d{2}:\d{2}$/.test(b.hora || '') ? b.hora : '09:00';
  const setor = ['vacinas', 'consultas', 'terapias'].includes(b.setor) ? b.setor : 'vacinas';
  try {
    // Não duplicar: mesmo paciente, mesmo dia e hora já agendados
    const { rows: dup } = await query(
      `SELECT id FROM agenda_eventos WHERE lower(paciente)=lower($1) AND data=$2 AND hora=$3
         AND status NOT IN ('Cancelado') LIMIT 1`, [paciente, b.data, hora]);
    if (dup.length) return res.json({ ok: true, id: dup[0].id, duplicado: true });

    // Motorista único: a agenda de vacinas é uma só. Quem vem de fora também
    // não pode ocupar um horário que já está com outra família.
    if (setor === 'vacinas') {
      const { rows: choque } = await query(
        `SELECT id, paciente FROM agenda_eventos
          WHERE COALESCE(setor,'vacinas')='vacinas' AND data=$1 AND hora=$2
            AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%' LIMIT 1`, [b.data, hora]);
      if (choque.length) return res.status(409).json({
        error: `Horário de vacinas já ocupado (${choque[0].paciente || 'outro cliente'}).`,
        choque: { id: choque[0].id },
      });
    }

    const { rows: [ev] } = await query(`
      INSERT INTO agenda_eventos (paciente, responsavel_nome, servico, data, hora, profissional,
        telefone, observacoes, status, setor, endereco)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Agendado',$9,$10) RETURNING id`,
      [paciente, cut(b.responsavel_nome, 80), cut(b.servico || 'Retorno vacinal', 80), b.data, hora,
       cut(b.profissional, 80), cut((b.telefone || '').replace(/\D/g, ''), 13),
       cut(b.observacoes || 'Agendado pelo VittaSys', 300), setor, cut(b.endereco, 160)]);
    try { socketEmit('agenda_update', { id: ev.id }); } catch (_) {}
    return res.json({ ok: true, id: ev.id });
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

/* GET /api/integracao/equipe — a equipe do VittaHub para o VittaMed importar.
   Pedido do master: cadastrar duas atendentes na mão, com o CPF vindo do outro
   sistema, é pedir pra errar dígito — e CPF errado no VittaMed significa
   pessoa sem login no primeiro dia.

   Vai só o que o outro lado precisa pra criar o acesso: nome, CPF, papel e
   setor. Sem senha, sem e-mail interno, sem metas — cadastro de acesso não é
   cópia de banco. Protegido pelo mesmo token das outras rotas de integração. */
r.get('/equipe', async (req, res) => {
  if (!autenticado(req)) return res.status(403).json({ error: 'Token de integração ausente ou inválido.' });
  try {
    const { query } = await import('../db/pool.js');
    const { rows } = await query(`
      SELECT nome, regexp_replace(COALESCE(cpf,''), '\\D', '', 'g') AS cpf,
             role, setor, COALESCE(setores, ARRAY[]::text[]) AS setores, ativo
        FROM usuarios
       WHERE ativo = true
       ORDER BY nome`);
    res.json({ ok: true, equipe: rows.filter(u => u.cpf && u.cpf.length === 11), total: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default r;
