import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db/pool.js';
import { auth, masterOnly, SECRET } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';
import { socketEmit, setConvGroupFn, setUserSetorFn, socketEmitToUsers } from '../socketServer.js';
import * as propostaGen from '../services/proposta-gen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = express.Router();

// ─── STATUS DE CONEXÃO Z-API (atualizado pelos webhooks, sem precisar de client-token) ──
let zapiConnected = false;
let zapiPhone = null;
function setZapiConnected(v, phone) { zapiConnected = v; zapiPhone = phone || null; }

// Debug: registra os últimos webhooks recebidos
let lastWebhooks = [];
let ultimoPayloadDesconhecido = null;
let ultimoAudioDebug = null;
let ultimoPropostaDebug = null;
function logWebhook(body) {
  lastWebhooks.unshift({ at: new Date().toISOString(), body });
  if (lastWebhooks.length > 10) lastWebhooks = lastWebhooks.slice(0, 10);
}


// ─── CACHE EM MEMÓRIA: evita bater no banco para listagem de conversas ────────
const convoCache = new Map(); // id → conversa
let cacheReady = false;

async function loadCache() {
  try {
    const { rows } = await query(`SELECT * FROM conversas ORDER BY last_message_at DESC LIMIT 2000`);
    rows.forEach(c => convoCache.set(c.id, c));
    cacheReady = true;
    console.log(`✅ ConvoCache: ${rows.length} conversas`);
  } catch (e) { console.error('Cache load error:', e.message); }
}
// Carrega após 3s (espera o pool estar pronto)
setTimeout(loadCache, 3000);

function cacheUpdate(conv) {
  convoCache.set(conv.id, conv);
}

/* ─── OpenAI (motor de IA do sistema) ─────────────────────────────────────────
   Adaptador: chama a Chat Completions e devolve { content:[{type:'text'},
   {type:'tool_use',name,input}] } — mesmo formato que o código já consumia,
   então a lógica da Vitta/Copiloto não muda, só o provedor.                 */
async function openaiMessages({ model = 'gpt-4o-mini', max_tokens = 800, system, messages, tools = null, json = false }) {
  const { default: fetch } = await import('node-fetch');
  const body = {
    model,
    max_tokens,
    messages: [{ role: 'system', content: system }, ...messages],
  };
  if (tools) body.tools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  if (json) body.response_format = { type: 'json_object' };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (d.error) return { error: d.error };
  const msg = d.choices?.[0]?.message || {};
  const content = [];
  if (msg.content) content.push({ type: 'text', text: msg.content });
  for (const tc of (msg.tool_calls || [])) {
    let input = {};
    try { input = JSON.parse(tc.function?.arguments || '{}'); } catch {}
    content.push({ type: 'tool_use', name: tc.function?.name, input });
  }
  return { content };
}

// Transcreve áudio (base64) com Whisper — usado no chat do Copiloto
async function transcreverAudio(base64, mime = 'audio/webm') {
  const { default: fetch } = await import('node-fetch');
  const FormData = (await import('form-data')).default;
  const buf = Buffer.from(base64, 'base64');
  const form = new FormData();
  form.append('file', buf, { filename: mime.includes('ogg') ? 'audio.ogg' : 'audio.webm', contentType: mime });
  form.append('model', 'whisper-1');
  form.append('language', 'pt');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, ...form.getHeaders() },
    body: form,
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'Falha na transcrição');
  return (d.text || '').trim();
}

const ehGrupo = (c) => String(c.contact_id || '').includes('g.us') || String(c.phone || '').replace(/\D/g, '').length > 13;

// Setor de cada usuário (id → setor), pra classificar a conversa pelo RESPONSÁVEL.
// O cache de conversas não guarda o setor do responsável, então mantemos este mapa
// atualizado (a cada 30s) e usamos de forma síncrona na filtragem.
let usuariosSetor = new Map();
let usuariosSetores = new Map(); // id → setores extras (acesso multi-setor, ex.: Danielle)
async function carregarUsuariosSetor() {
  try {
    let rows;
    try { ({ rows } = await query('SELECT id, setor, setores FROM usuarios')); }
    catch { ({ rows } = await query('SELECT id, setor FROM usuarios')); } // coluna 'setores' ainda não existe
    usuariosSetor = new Map(rows.map(u => [String(u.id), u.setor || null]));
    usuariosSetores = new Map(rows.filter(u => Array.isArray(u.setores) && u.setores.length).map(u => [String(u.id), u.setores]));
  } catch { /* banco ainda não pronto — tenta de novo no próximo tick */ }
}
carregarUsuariosSetor();
setInterval(carregarUsuariosSetor, 30000);

// Grupo EFETIVO da conversa (vacina | nao-vacina | null=indefinida). PRECEDÊNCIA:
// 1º o SETOR da conversa (o assunto/triagem manda — conversa marcada 'vacinas' é
// de vacina, não importa quem é o responsável). Só quando a conversa NÃO tem setor
// (ainda não triada) é que usamos o setor de quem é RESPONSÁVEL (Danielle/Raylane
// = vacinas → vacina; demais → não-vacina). Sem nenhum dos dois → indefinida.
// Cada conversa cai em UM único grupo — nunca aparece pra dois lados nem some.
function grupoConversa(conv) {
  const respSetor = conv.responsavel_id ? usuariosSetor.get(String(conv.responsavel_id)) : null;
  const efetivo = conv.setor || respSetor || null;
  if (efetivo === 'vacinas') return 'vacina';
  if (efetivo === 'consultas' || efetivo === 'terapias') return 'nao-vacina';
  return null;
}
// Entrega de eventos em tempo real (socket) também respeita o acesso por setor.
setConvGroupFn(grupoConversa);
setUserSetorFn((userId) => usuariosSetor.get(String(userId)) || null);

// Regra de acesso (gestão): master e quem não tem setor veem tudo. Quem é de
// VACINAS só acessa conversa do grupo vacina; quem é de consultas/terapias acessa
// o grupo não-vacina. Conversa de grupo indefinido fica visível a todos.
// Setor EXATO da conversa (vacinas | consultas | terapias | null).
function setorEfetivo(conv) {
  const respSetor = conv.responsavel_id ? usuariosSetor.get(String(conv.responsavel_id)) : null;
  return conv.setor || respSetor || null;
}
function podeVerSetor(viewer, conv) {
  if (!viewer || viewer.role === 'master') return true;
  // Acesso MULTI-SETOR (ex.: Danielle vê vacinas E consultas). Lista vinda do
  // token ou do cache (id → setores). Vê o setor exato da lista, ou indefinido.
  const extras = (Array.isArray(viewer.setores) && viewer.setores.length ? viewer.setores : usuariosSetores.get(String(viewer.id))) || null;
  if (extras && extras.length) {
    const ef = setorEfetivo(conv);
    return ef === null || extras.includes(ef);
  }
  // O setor pode não vir no token antigo — resolve pelo cache (id → setor).
  const viewerSetor = viewer.setor || usuariosSetor.get(String(viewer.id)) || null;
  if (!viewerSetor) return true;
  // Separação EXATA por setor: vacinas vê só vacinas, consultas só consultas,
  // terapias só terapias. Conversa ainda não triada (sem setor) aparece pra todos
  // (são os leads novos que precisam ser distribuídos).
  const ef = setorEfetivo(conv);
  return ef === null || ef === viewerSetor;
}

function cacheGetList({ channel, search, unread_only, waiting, minhas, responsavel, grupos, setor, categoria, classificacao, page = 1, limit = 100, extraIds = null, viewer = null }) {
  let list = Array.from(convoCache.values())
    .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
  if (channel && channel !== 'all') list = list.filter(c => c.channel === channel);
  // Pastas de organização: com ?categoria=fidelidade|banco_dados mostra só a pasta;
  // sem categoria, o inbox normal ESCONDE quem já foi movido pra uma pasta — EXCETO
  // quando se pede uma classificação específica (páginas Planos/Vacinação/Consultas/
  // Terapias), que devem listar todos daquela classificação, mesmo se tiverem pasta.
  const clsEspecifica = classificacao && classificacao !== 'all' && classificacao !== 'sem';
  if (categoria) list = list.filter(c => c.categoria === categoria);
  else if (!clsEspecifica) list = list.filter(c => !c.categoria);
  // Filtro de setor: chips da gestão (?setor=) ou trava da atendente (vê só o dela)
  if (setor && setor !== 'all') list = list.filter(c => c.setor === setor);
  // Filtro por classificação fina (atalhos coloridos do menu). 'sem' = ainda não
  // classificadas (os leads novos que precisam ser organizados/distribuídos).
  if (classificacao === 'sem') list = list.filter(c => !c.classificacao);
  else if (classificacao && classificacao !== 'all') list = list.filter(c => c.classificacao === classificacao);
  // Acesso por MACRO-grupo (regra da gestão): quem é de VACINAS só vê conversas
  // de vacina; quem NÃO é de vacina (consultas/terapias) vê tudo que não é vacina.
  // Vale pra atendente E supervisora. Master e quem não tem setor veem tudo.
  if (viewer) list = list.filter(c => podeVerSetor(viewer, c));
  if (unread_only === 'true') list = list.filter(c => (c.unread || 0) > 0);
  // Aguardando resposta: a última mensagem é do CLIENTE (fila de quem espera)
  if (waiting === 'true') list = list.filter(c => c.last_from === 'contact');
  // Filtros do mock: Minhas (sou a responsável) e Grupos (conversas de grupo)
  if (minhas === 'true' && viewer) list = list.filter(c => c.responsavel_id === viewer.id);
  // Carteira de um atendente específico (gestão vê a carteira de cada um)
  if (responsavel && responsavel !== 'all') list = list.filter(c => c.responsavel_id === responsavel);
  if (grupos === 'true') list = list.filter(c => ehGrupo(c));
  if (search) {
    const s = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    list = list.filter(c =>
      (c.contact_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(s) ||
      (c.phone || '').includes(s) ||
      (extraIds && extraIds.has(c.id))   // bateu no CONTEÚDO/documento de alguma mensagem
    );
  }
  const total = list.length;
  const offset = (Number(page) - 1) * Number(limit);
  return { data: list.slice(offset, offset + Number(limit)), total, page: Number(page) };
}

function cacheGetUpdatedSince(since, viewer = null) {
  const ts = new Date(since);
  return Array.from(convoCache.values())
    .filter(c => new Date(c.last_message_at || 0) > ts)
    // Mesma regra de acesso da lista: cada um só recebe updates do que pode ver,
    // e nada que esteja numa pasta (Fidelidade/Banco).
    .filter(c => !c.categoria && podeVerSetor(viewer, c))
    .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
}

// ─── SSE: clientes conectados (push em tempo real) ───────────────────────────
const sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const dead = [];
  for (const client of sseClients) {
    try { client.res.write(payload); }
    catch { dead.push(client); }
  }
  dead.forEach(c => sseClients.delete(c));
}

// ─── LONG-POLL: entrega instantânea (<200ms) sem depender de SSE ─────────────
// Servidor segura a conexão até 25s. Quando chega webhook → resposta imediata.
const waiters = new Map(); // convId → [{resolve, timer}]

function notifyWaiters(convId, message) {
  const list = waiters.get(convId);
  if (!list || list.length === 0) return;
  const snapshot = list.splice(0); // atômico: pega tudo e limpa
  snapshot.forEach(w => { clearTimeout(w.timer); w.resolve([message]); });
  waiters.delete(convId); // evita acúmulo de chaves vazias na memória
}

// Upload em memória
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const EVO_URL  = () => process.env.EVOLUTION_API_URL  || '';
const EVO_KEY  = () => process.env.EVOLUTION_API_KEY  || '';
const EVO_INST = () => process.env.EVOLUTION_INSTANCE || 'vittalis';

async function evoFetch(path, method = 'GET', body = null) {
  const { default: fetch } = await import('node-fetch');
  return fetch(`${EVO_URL()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY() },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
}

async function getMediaBase64(messageId, messageType, remoteJid) {
  try {
    const r = await evoFetch(`/chat/getBase64FromMediaMessage/${EVO_INST()}`, 'POST', {
      message: { key: { remoteJid, id: messageId }, messageType }
    });
    if (r.ok) {
      const d = await r.json();
      return d.base64 ? `data:${d.mimetype || 'image/jpeg'};base64,${d.base64}` : null;
    }
  } catch (e) { console.error('getBase64 error:', e.message); }
  return null;
}

// ─── SSE STREAM (/api/inbox/stream) ─────────────────────────────────────────
// EventSource não suporta headers → token como query param
r.get('/stream', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();
  let user;
  try { user = jwt.verify(token, SECRET); }
  catch { return res.status(401).end(); }

  // CORS: usa a origem exata do frontend (não '*' — incompatível com credentials)
  const origin = req.headers.origin || process.env.FRONTEND_URL || '*';
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, no-transform',
    'Connection': 'keep-alive',
    'Keep-Alive': 'timeout=90',
    'X-Accel-Buffering': 'no',       // Railway/nginx: desabilita buffering
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
  });
  res.flushHeaders();

  // retry: browser reconecta automaticamente após 3s se desconectar
  res.write(`retry: 3000\n\n`);
  res.write(`event: connected\ndata: {"ok":true,"ts":"${new Date().toISOString()}"}\n\n`);

  const client = { res, userId: user.id };
  sseClients.add(client);

  // Ping a cada 10s (Railway corta conexões ociosas após ~60s)
  const ping = setInterval(() => {
    try { res.write(`event: ping\ndata: {"ts":"${new Date().toISOString()}"}\n\n`); }
    catch { clearInterval(ping); sseClients.delete(client); }
  }, 10000);

  req.on('close', () => { clearInterval(ping); sseClients.delete(client); });
});


r.post('/webhook/whatsapp', async (req, res) => {
  res.json({ ok: true });
  try {
    const body = req.body;
    const event = body.event || body.apikey || '';

    // Log raw payload for debugging
    console.log(`WH_RAW: ${JSON.stringify(body).slice(0, 300)}`);

    // Extract messages from ANY payload format Evolution API sends
    let msgs = [];
    if (Array.isArray(body.data?.messages))      msgs = body.data.messages;
    else if (body.data?.key)                      msgs = [body.data];
    else if (Array.isArray(body.data))            msgs = body.data;
    else if (body.key)                            msgs = [body];
    else if (Array.isArray(body.messages))        msgs = body.messages;

    if (msgs.length === 0) {
      console.log(`WH_SKIP: no messages found, event="${body.event}"`);
      return;
    }
    console.log(`WH_PROCESS: ${msgs.length} msg(s), event="${body.event}"`);

    for (const msg of msgs) {
      const key = msg.key || {};
      if (!key.remoteJid) continue;
      if (key.remoteJid.endsWith('@g.us')) continue;
      if (key.remoteJid.endsWith('@lid')) continue;

      const remoteJid = key.remoteJid;
      const isMe = !!key.fromMe;

      if (isMe) {
        // fromMe: marca entregue se existir, nunca duplica
        if (key.id) {
          await query(`UPDATE mensagens SET status = 'delivered' WHERE wa_msg_id = $1`, [key.id]).catch(() => {});
        }
        continue;
      }

      // Deduplicação por ID da mensagem WhatsApp
      if (key.id) {
        const { rows: exists } = await query('SELECT id FROM mensagens WHERE wa_msg_id = $1 LIMIT 1', [key.id]);
        if (exists.length > 0) continue; // já processada
      }

      const rawPhone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
      const phone = rawPhone.startsWith('55') ? rawPhone.slice(2) : rawPhone;
      const pushName = msg.pushName || msg.verifiedBizName || '';
      const contactName = (pushName && pushName.length > 2 && pushName !== phone) ? pushName : phone;

      const m = msg.message || {};
      let content = '[mensagem]', type = 'text', mediaData = null;
      let messageType = '';

      if (m.conversation)                     { content = m.conversation; }
      else if (m.extendedTextMessage?.text)    { content = m.extendedTextMessage.text; }
      else if (m.imageMessage)                 { content = m.imageMessage.caption || '📷 Imagem'; type = 'image'; messageType = 'imageMessage'; }
      else if (m.videoMessage)                 { content = m.videoMessage.caption || '🎥 Vídeo'; type = 'video'; messageType = 'videoMessage'; }
      else if (m.audioMessage)                 { content = '🎵 Áudio'; type = 'audio'; messageType = 'audioMessage'; }
      else if (m.pttMessage)                   { content = '🎵 Áudio'; type = 'audio'; messageType = 'pttMessage'; }
      else if (m.documentMessage)              { content = `📎 ${m.documentMessage.fileName || 'Documento'}`; type = 'document'; messageType = 'documentMessage'; }
      else if (m.stickerMessage)               { content = '🎭 Sticker'; type = 'image'; messageType = 'stickerMessage'; }
      else if (m.locationMessage)              { content = `📍 ${m.locationMessage.address || 'Localização'}`; }
      else if (m.contactMessage)               { content = `👤 ${m.contactMessage.displayName || 'Contato'}`; }
      else if (m.reactionMessage)              { content = `${m.reactionMessage.text || '👍'} (reação)`; }

      const ts = msg.messageTimestamp
        ? new Date(parseInt(String(msg.messageTimestamp)) * 1000).toISOString()
        : new Date().toISOString();

      // Busca mídia em base64 se necessário
      if (messageType && key.id) {
        mediaData = await getMediaBase64(key.id, messageType, remoteJid);
      }

      // Upsert conversa
      const { rows: [conv] } = await query(`
        INSERT INTO conversas (channel, contact_name, contact_id, phone, unread, last_message, last_message_at)
        VALUES ('whatsapp', $1, $2, $3, 1, $4, $5)
        ON CONFLICT (contact_id) DO UPDATE SET
          contact_name = CASE
            WHEN length(EXCLUDED.contact_name) > 5 AND EXCLUDED.contact_name != EXCLUDED.phone
            THEN EXCLUDED.contact_name
            ELSE conversas.contact_name
          END,
          unread = conversas.unread + 1,
          last_from = 'contact',
          followup_count = 0,
          last_message = EXCLUDED.last_message,
          last_message_at = EXCLUDED.last_message_at
        RETURNING *`,
        [contactName, remoteJid, phone, content, ts]
      );

      // Salva mensagem com deduplicação por wa_msg_id
      const waId = key.id || null;
      await query(
        `INSERT INTO mensagens (conversa_id, from_type, type, content, filename, created_at, wa_msg_id)
         SELECT $1, 'contact', $2, $3, $4, $5, $6
         WHERE NOT EXISTS (SELECT 1 FROM mensagens WHERE wa_msg_id = $6 AND $6 IS NOT NULL)`,
        [conv.id, type, mediaData || content, messageType || null, ts, waId]
      );

      await query(
        `INSERT INTO notificacoes (tipo, titulo, texto, conv_id) VALUES ('mensagem',$1,$2,$3)`,
        [contactName, content.slice(0, 80), conv.id]
      ).catch(() => {});

      // Bot
      if (conv.bot_ativo) {
        try {
          const { rows: [cfgRow] } = await query("SELECT valor FROM configuracoes WHERE chave = 'bot'");
          const cfg = cfgRow?.valor || {};
          if (cfg.ativo !== false) {
            const { rows: countRow } = await query('SELECT COUNT(*) n FROM mensagens WHERE conversa_id = $1', [conv.id]);
            const msgCount = parseInt(countRow[0].n);
            const respostas = cfg.respostas || {};
            let botReply = '';
            if (msgCount <= 1 && cfg.mensagemBoasVindas) {
              botReply = cfg.mensagemBoasVindas;
            } else {
              botReply = respostas[content.trim()] || respostas['default'] || '';
            }
            if (botReply && EVO_URL() && EVO_KEY()) {
              await evoFetch(`/message/sendText/${EVO_INST()}`, 'POST', { number: rawPhone, text: botReply });
              await query(`INSERT INTO mensagens (conversa_id, from_type, type, content, sender_nome) VALUES ($1,'me','text',$2,'Bot Vittalis')`, [conv.id, botReply]);
              await query("UPDATE conversas SET last_message=$1, last_from='bot', last_message_at=NOW() WHERE id=$2", [botReply.slice(0, 100), conv.id]);
            }
          }
        } catch (e) { console.error('Bot error:', e.message); }
      }
    }
  } catch (err) { console.error('WA_ERROR:', err.message); }
});

r.post('/webhook/instagram', async (req, res) => {
  try {
    const { object, entry } = req.body;
    if (object !== 'instagram') return res.json({ ok: true });
    for (const e of (entry || [])) {
      for (const ev of (e.messaging || [])) {
        if (!ev.message) continue;
        const sid = ev.sender.id;
        const content = ev.message.text || '[mídia]';
        const { rows: [conv] } = await query(`
          INSERT INTO conversas (channel, contact_name, contact_id, unread, last_message, last_message_at)
          VALUES ('instagram', $1, $2, 1, $3, NOW())
          ON CONFLICT (contact_id) DO UPDATE SET unread = conversas.unread + 1, last_from = 'contact', last_message = $3, last_message_at = NOW()
          RETURNING *`, [`@${sid}`, sid, content]);
        await query(`INSERT INTO mensagens (conversa_id, from_type, type, content) VALUES ($1,'contact','text',$2)`, [conv.id, content]);
      }
    }
    res.json({ ok: true });
  } catch (err) { res.json({ ok: true }); }
});

r.get('/webhook/instagram', (req, res) => {
  const T = process.env.INSTAGRAM_VERIFY_TOKEN || 'vittahub_2024';
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === T) res.send(req.query['hub.challenge']);
  else res.sendStatus(403);
});

// ─── JWT REQUIRED BELOW ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
//  Z-API INTEGRATION
//  Docs: https://developer.z-api.io
//  Endpoints: https://api.z-api.io/instances/{id}/token/{token}/...
//  Webhook payload: { phone, senderName, profilePicUrl, text: { message }, 
//                     image: { imageUrl }, audio: { audioUrl }, 
//                     video: { videoUrl }, document: { documentUrl },
//                     isFromMe: bool, messageId }
// ═══════════════════════════════════════════════════════════════════════════

const ZAPI_BASE  = () => `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}`;
const ZAPI_CTOKEN = () => process.env.ZAPI_CLIENT_TOKEN || '';

// Helper: check if Z-API is configured
const zapiOk = () => process.env.ZAPI_INSTANCE && process.env.ZAPI_TOKEN;

// Helper: call Z-API
async function zapiCall(path, method = 'GET', body = null) {
  const { default: fetch } = await import('node-fetch');
  const headers = { 'Content-Type': 'application/json' };
  if (ZAPI_CTOKEN()) headers['Client-Token'] = ZAPI_CTOKEN();
  return fetch(`${ZAPI_BASE()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
}

// ─── INTEGRAÇÃO VITTASYS: preços e proposta PDF ──────────────────────────────
const VITTASYS_URL = () => process.env.VITTASYS_API_URL || 'https://vittasys.vittalissaude.com.br';
let _precosCache = null, _precosCacheAt = 0;

// Busca tabela de preços — usa o catálogo local (independente do VittaSys)
async function getPrecosVittaSys() {
  // Fonte primária: catálogo local (proposta-gen). Sempre disponível.
  return propostaGen.VACINAS;
}

// Formata os preços para o contexto da IA
function formatarPrecos(precos) {
  if (!precos || !precos.length) return '';
  const linhas = precos.map(p => {
    const avista = p.avista ? `à vista R$ ${p.avista}` : '';
    const credito = p.credito ? `cartão R$ ${p.credito}${p.parcelas ? ` em ${p.parcelas}x` : ''}` : '';
    return `- ${p.nome}: ${[avista, credito].filter(Boolean).join(' | ')}`;
  });
  return `\nTABELA DE PREÇOS DAS VACINAS (use estes valores reais quando o cliente perguntar):\n${linhas.join('\n')}`;
}

// Gera PDF da proposta: HTML local (módulo proposta-gen) → Puppeteer
async function htmlParaPDF(html) {
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
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// Proposta de VACINAS INDIVIDUAIS (gera localmente)
async function gerarPropostaPDF({ nomeCliente, nomeBebe, template, pacoteNome, vacinas, desconto, parcelas, creditoFechado }) {
  const html = propostaGen.gerarHtmlOrcamento({
    vacinas, template: template || 'adulto', nomeCliente, nomeBebe, pacoteNome,
    desconto: desconto || 0, parcelas: parcelas || 1, creditoFechado: creditoFechado || 0,
  });
  return htmlParaPDF(html);
}

// Proposta de PLANO VACINAL completo (gera localmente, com capa e benefícios)
async function gerarPlanoPDF({ planoId, desconto, parcelas, bonus }) {
  const html = propostaGen.gerarHtmlPlano({ planoId, desconto: desconto || 0, parcelas, bonus });
  return htmlParaPDF(html);
}

// Envia um PDF (base64) via Z-API para um número
async function enviarPDFZapi(phone, pdfBase64, fileName = 'Proposta-Vittalis.pdf') {
  return zapiCall('/send-document/pdf', 'POST', {
    phone,
    document: `data:application/pdf;base64,${pdfBase64}`,
    fileName,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// VITTA — IA com DEBOUNCE por conversa
// Antes: cada mensagem do cliente disparava uma chamada de IA independente,
// gerando 2-3 respostas seguidas que se contradiziam (e perdiam o lead).
// Agora: as mensagens são agregadas por alguns segundos e a Vitta responde
// UMA vez, lendo o histórico inteiro como turnos reais de conversa.
// ═══════════════════════════════════════════════════════════════════════════
const BOT_DEBOUNCE_MS = 7000;
const botSessions = new Map(); // convId -> { timer, running, again }

/* ─── TRIAGEM POR SETOR (menu inicial + distribuição alternada) ───────────────
   Primeira mensagem de um contato novo → menu Consultas/Vacinas/Terapias.
   Na escolha: define o setor da conversa e distribui em rodízio entre as
   atendentes do setor (Lead 1 → A, Lead 2 → B, Lead 3 → A...).             */
const SETORES = {
  vacinas:   { rotulo: 'Vacinas' },
  consultas: { rotulo: 'Consultas' },
  terapias:  { rotulo: 'Terapias' },
};

function detectarSetor(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^\s*1\b/.test(t) || t.includes('vacin'))   return 'vacinas';
  // Terapias (inclui especialidades terapêuticas) — checa antes de consultas
  if (/^\s*3\b/.test(t) || /terap|\baba\b|ocupacional|psicopedag|fonoaudiolog|\bfono\b/.test(t)) return 'terapias';
  // Consultas (inclui especialidades médicas comuns: pediatra, neuro, psicólogo…)
  if (/^\s*2\b/.test(t) || /consult|pediatr|m[ée]dic|especialista|neuroped|neurolog|psicolog|psiquiatr|psicopediatr|nutri|cardiolog|dermatolog|oftalmolog|otorrino|ortoped/.test(t)) return 'consultas';
  if (/^\s*4\b/.test(t) || t.includes('outro') || t.includes('assunto')) return 'outros';
  return null;
}

const MENU_TITULO = `Olá! 👋
Seja muito bem-vindo(a) à *Vittalis Saúde!* 💎

Para te direcionar ao setor correto e oferecer o melhor atendimento, escolha uma das opções abaixo:`;

const MENU_TRIAGEM = `${MENU_TITULO}

1️⃣ 💉 Vacinação
2️⃣ 🩺 Consultas
3️⃣ 🤲 Terapias
4️⃣ 💬 Outros Assuntos

É só responder com o número ou o nome da opção 😊`;

// Menu de triagem em TEXTO numerado. (Botões da Z-API exigem aceitar os "termos
// de mensagem com botões" no painel — sem isso a Z-API ACEITA o envio mas RECUSA
// a entrega de forma assíncrona, e o cliente nunca recebe o menu. Texto sempre
// chega, e o detectarSetor já entende resposta por número ou por palavra.)
async function enviarMenuTriagem(phoneNum) {
  if (!zapiOk()) return MENU_TRIAGEM;
  await zapiCall('/send-text', 'POST', { phone: `55${phoneNum}`, message: MENU_TRIAGEM });
  return MENU_TRIAGEM;
}

// Rodízio: pega a próxima atendente ativa do setor (contador em configuracoes)
async function distribuirSetor(convId, setor) {
  const { rows: equipe } = await query(
    `SELECT id, nome FROM usuarios
     WHERE setor = $1 AND ativo = true AND role IN ('atendente','supervisor')
     ORDER BY nome`, [setor]);
  if (!equipe.length) return null;
  const chave = `rr_${setor}`;
  const { rows: [cfg] } = await query('SELECT valor FROM configuracoes WHERE chave = $1', [chave]);
  const atual = parseInt(cfg?.valor?.i ?? -1);
  const prox = (atual + 1) % equipe.length;
  await query(
    `INSERT INTO configuracoes (chave, valor) VALUES ($1, $2)
     ON CONFLICT (chave) DO UPDATE SET valor = $2, updated_at = NOW()`,
    [chave, JSON.stringify({ i: prox })]);
  const escolhida = equipe[prox];
  await query('UPDATE conversas SET responsavel_id = $1 WHERE id = $2', [escolhida.id, convId]);
  socketEmit('conv_assigned', { convId, responsavel_id: escolhida.id, responsavel_nome: escolhida.nome });
  return escolhida;
}

// Garante que a conversa tem um lead no funil (pra captura salvar a ficha)
async function garanteLead(conv) {
  if (conv.lead_id) return conv.lead_id;
  // Primeira etapa real do funil do setor (ex: "Boas Vindas"), com fallback
  const { rows: [col] } = await query(
    `SELECT nome FROM funil_colunas WHERE setor = $1 AND ordem < 99 ORDER BY ordem LIMIT 1`,
    [conv.setor || 'vacinas']).catch(() => ({ rows: [] }));
  const statusInicial = col?.nome || 'Novo Lead';
  const { rows: [lead] } = await query(`
    INSERT INTO leads (nome, telefone, origem, interesse, status, responsavel_id, observacoes, setor)
    VALUES ($1,$2,'WhatsApp',$3,$6,$4,'Lead automático via menu de boas-vindas',$5) RETURNING id`,
    [conv.contact_name || conv.phone || 'Cliente', conv.phone || '',
     conv.setor === 'consultas' ? 'Consulta' : conv.setor === 'terapias' ? 'Terapia' : 'Vacina',
     conv.responsavel_id || null, conv.setor || 'vacinas', statusInicial]).catch(() => ({ rows: [null] }));
  if (!lead) return null;
  await query('UPDATE conversas SET lead_id = $1 WHERE id = $2', [lead.id, conv.id]).catch(() => {});
  const cached = convoCache.get(conv.id);
  if (cached) cacheUpdate({ ...cached, lead_id: lead.id });
  return lead.id;
}

// Captura automática pós-apresentação: nome → paciente → nascimento.
// Sai de cena em silêncio se o cliente fugir do roteiro (pergunta, texto longo).
async function capturaDados(conv, texto, phoneNum) {
  const t = String(texto || '').trim();
  const desviou = t.length < 2 || t.length > 60 || /[?]/.test(t) ||
    /\b(quanto|valor|preco|preço|horario|horário|agendar|endere)\b/i.test(t);

  const responde = async (msg, proxEtapa) => {
    await query('UPDATE conversas SET captura_etapa = $2 WHERE id = $1', [conv.id, proxEtapa]).catch(() => {});
    if (zapiOk()) await zapiCall('/send-text', 'POST', { phone: `55${phoneNum}`, message: msg });
    const { rows: [m] } = await query(
      `INSERT INTO mensagens (conversa_id, from_type, sender_nome, type, content, created_at)
       VALUES ($1,'bot','Vitta','text',$2,NOW()) RETURNING *`, [conv.id, msg]).catch(() => ({ rows: [null] }));
    if (m) socketEmit('new_message', { convId: conv.id, message: m, conv });
  };

  if (conv.captura_etapa === 'nome') {
    if (desviou) { await query('UPDATE conversas SET captura_etapa = NULL WHERE id = $1', [conv.id]).catch(() => {}); return false; }
    const nome = t.replace(/\s+/g, ' ').slice(0, 80);
    const leadId = await garanteLead(conv);
    if (leadId) await query('UPDATE leads SET responsavel_cliente = $1 WHERE id = $2 AND (responsavel_cliente IS NULL OR responsavel_cliente = \'\')', [nome, leadId]).catch(() => {});
    await query(`UPDATE conversas SET contact_name = CASE WHEN contact_name IS NULL OR contact_name = phone THEN $1 ELSE contact_name END WHERE id = $2`, [nome, conv.id]).catch(() => {});
    await responde(`Obrigada, *${nome.split(' ')[0]}*! 😊\n\nE qual é o nome do paciente (quem vai receber o atendimento)?`, 'paciente');
    return true;
  }

  if (conv.captura_etapa === 'paciente') {
    if (desviou) { await query('UPDATE conversas SET captura_etapa = NULL WHERE id = $1', [conv.id]).catch(() => {}); return false; }
    const nomeP = t.replace(/\s+/g, ' ').slice(0, 80);
    const leadId = await garanteLead(conv);
    if (leadId) await query('UPDATE leads SET nome = $1 WHERE id = $2', [nomeP, leadId]).catch(() => {});
    await responde(`Perfeito! E qual a data de nascimento de *${nomeP.split(' ')[0]}*? (ex: 15/12/2024)`, 'nascimento');
    return true;
  }

  if (conv.captura_etapa === 'nascimento') {
    const md = t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (!md) { await query('UPDATE conversas SET captura_etapa = NULL WHERE id = $1', [conv.id]).catch(() => {}); return false; }
    let [, d, mes, ano] = md;
    if (ano.length === 2) ano = (parseInt(ano) > 30 ? '19' : '20') + ano;
    const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dt = new Date(iso + 'T12:00:00');
    if (isNaN(dt) || dt > new Date() || parseInt(ano) < 1920) {
      await query('UPDATE conversas SET captura_etapa = NULL WHERE id = $1', [conv.id]).catch(() => {});
      return false;
    }
    const leadId = await garanteLead(conv);
    if (leadId) await query('UPDATE leads SET nascimento = $1 WHERE id = $2', [iso, leadId]).catch(() => {});
    await responde(`Anotado! ✅ E pra finalizar: qual o motivo do seu contato hoje? (ex: vacina de 6 meses, consulta pediátrica, avaliação…)`, 'motivo');
    return true;
  }

  if (conv.captura_etapa === 'motivo') {
    const motivo = t.replace(/\s+/g, ' ').slice(0, 200);
    if (motivo.length < 2) { await query('UPDATE conversas SET captura_etapa = NULL WHERE id = $1', [conv.id]).catch(() => {}); return false; }
    const leadId = await garanteLead(conv);
    if (leadId) {
      await query(`UPDATE leads SET interesse = COALESCE(NULLIF(interesse, ''), $1),
                   observacoes = TRIM(BOTH E'\n' FROM COALESCE(observacoes, '') || E'\n' || $2)
                   WHERE id = $3`,
        [motivo.slice(0, 60), `Motivo do contato: ${motivo}`, leadId]).catch(() => {});
    }
    await responde(`Perfeito, tudo registrado! ✅\n\nPra adiantar seu atendimento: qual *dia e horário* você prefere? 🗓️\n(ex: 15/06 às 09:00 — atendemos de segunda a sábado)`, 'agenda');
    return true;
  }

  // ── Etapa AGENDA: entende "15/06 às 09:00" e cria o agendamento sozinho ──
  if (conv.captura_etapa === 'agenda') {
    const md = t.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
    const mh = t.match(/(\d{1,2})\s*[:hH]\s*(\d{2})?/);
    const encerraSemAgendar = async () => {
      await responde(`Sem problemas! 😊 Nossa equipe vai combinar com você o melhor dia e horário por aqui mesmo. 💎`, null);
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, conv_id)
                   VALUES ('novo_lead', $1, 'Cliente concluiu o cadastro e quer agendar — combinar dia/horário.', $2)`,
        [`Agendar: ${conv.contact_name || 'cliente'}`, conv.id]).catch(() => {});
    };
    if (!md || !mh) { await encerraSemAgendar(); return true; }

    let [, d, mes, ano] = md;
    const hoje = new Date();
    ano = ano ? (String(ano).length === 2 ? '20' + ano : String(ano)) : String(hoje.getFullYear());
    let dataISO = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    let dt = new Date(dataISO + 'T12:00:00');
    if (!md[3] && !isNaN(dt) && dt < new Date(hoje.toDateString())) { // "15/06" já passou → ano que vem
      dataISO = `${hoje.getFullYear() + 1}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      dt = new Date(dataISO + 'T12:00:00');
    }
    const hora = `${String(mh[1]).padStart(2, '0')}:${mh[2] || '00'}`;
    const horaOk = parseInt(mh[1]) >= 0 && parseInt(mh[1]) <= 23 && (!mh[2] || parseInt(mh[2]) <= 59);
    const dataOk = !isNaN(dt) && dt >= new Date(hoje.toDateString()) && (dt - hoje) < 370 * 86400000;
    if (!dataOk || !horaOk) { await encerraSemAgendar(); return true; }

    const leadId = await garanteLead(conv);
    let dadosLead = {};
    if (leadId) {
      const { rows: [l] } = await query('SELECT nome, responsavel_cliente, interesse, email, endereco FROM leads WHERE id = $1', [leadId]).catch(() => ({ rows: [{}] }));
      dadosLead = l || {};
    }
    await query(`
      INSERT INTO agenda_eventos (paciente, responsavel_nome, servico, data, hora, telefone, observacoes, status, setor, lead_id, email, endereco)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'Agendado',$8,$9,$10,$11)`,
      [dadosLead.nome || conv.contact_name || 'Cliente', dadosLead.responsavel_cliente || null,
       dadosLead.interesse || null, dataISO, hora,
       String(conv.phone || '').replace(/\D/g, '').slice(0, 13),
       'Agendado automaticamente pelas boas-vindas 💎',
       conv.setor || 'vacinas', leadId, dadosLead.email || null, dadosLead.endereco || null]).catch(e => console.error('AGENDA_AUTO:', e.message));
    if (leadId) {
      await query(`UPDATE leads SET status = 'Agendado', status_changed_at = NOW(), data_retorno = $1
                   WHERE id = $2 AND EXISTS (SELECT 1 FROM funil_colunas WHERE setor = $3 AND nome = 'Agendado')`,
        [dataISO, leadId, conv.setor || 'vacinas']).catch(() => {});
    }
    socketEmit('agenda_update', { auto: true });
    await query(`INSERT INTO notificacoes (tipo, titulo, texto, conv_id)
                 VALUES ('novo_lead', $1, $2, $3)`,
      [`🗓️ Agendado: ${dadosLead.nome || conv.contact_name || 'cliente'}`,
       `Boas-vindas agendou ${dataISO.split('-').reverse().join('/')} às ${hora} — confirmar detalhes.`, conv.id]).catch(() => {});
    await responde(`Prontinho! Agendei pra *${dataISO.split('-').reverse().join('/')}* às *${hora}* 🗓️💎\nNossa equipe confirma os detalhes com você por aqui. Até lá! 😊`, null);
    return true;
  }
  return false;
}

// Devolve true se a mensagem foi consumida pela triagem (Vitta não responde)
async function triagemSetor(conv, texto, phoneNum) {
  if (conv.setor && conv.menu_enviado) return false; // já triado neste ciclo
  if (!conv.bot_ativo) return false;                 // equipe assumiu
  const escolha = detectarSetor(texto);
  const { rows: [cfgT] } = await query("SELECT valor FROM configuracoes WHERE chave = 'bot'").catch(() => ({ rows: [{}] }));
  const consultaIAon = (cfgT?.valor?.consultaIA ?? true) !== false;
  const botGeralOn   = (cfgT?.valor?.ativo ?? true) !== false;
  // Modo DEDICADO à consulta: o bot geral (vacina) está desligado e só a IA de
  // Consultas está ligada → a IA assume TUDO direto, sem menu de triagem.
  const soConsultaIA = !botGeralOn && consultaIAon;

  if (!escolha) {
    // Só IA de consultas ligada → assume direto como consultas, sem menu.
    if (soConsultaIA) {
      if (!conv.setor) {
        await query('UPDATE conversas SET setor = $1, menu_enviado = true WHERE id = $2', ['consultas', conv.id]).catch(() => {});
        const cc = convoCache.get(conv.id); if (cc) cacheUpdate({ ...cc, setor: 'consultas' });
        conv.setor = 'consultas';
      }
      return false; // a IA (agendarVitta) responde
    }
    // Já mandou o menu e o cliente respondeu algo que não é uma escolha clara:
    // pela REGRA (tudo que não é vacina → IA de consulta), assume consultas pra
    // a IA assumir, em vez de deixar a conversa muda travada sem setor.
    if (conv.menu_enviado) {
      if (consultaIAon && !conv.setor) {
        await query('UPDATE conversas SET setor = $1 WHERE id = $2', ['consultas', conv.id]).catch(() => {});
        const cachedX = convoCache.get(conv.id);
        if (cachedX) cacheUpdate({ ...cachedX, setor: 'consultas' });
        conv.setor = 'consultas';
      }
      return false;                                 // a IA (agendarVitta) responde
    }
    await query('UPDATE conversas SET menu_enviado = true WHERE id = $1', [conv.id]);
    const registrado = await enviarMenuTriagem(phoneNum);
    const { rows: [m] } = await query(
      `INSERT INTO mensagens (conversa_id, from_type, sender_nome, type, content, created_at)
       VALUES ($1,'bot','Vitta','text',$2,NOW()) RETURNING *`, [conv.id, registrado]).catch(() => ({ rows: [null] }));
    if (m) socketEmit('new_message', { convId: conv.id, message: m, conv });
    return true;
  }

  // Modo dedicado à consulta + cliente falou de VACINA: o bot não cuida de vacina
  // agora (geral desligado) → passa pra equipe humana, sem ficar mudo.
  if (escolha === 'vacinas' && !botGeralOn) {
    await query('UPDATE conversas SET bot_ativo = false, menu_enviado = true WHERE id = $1', [conv.id]).catch(() => {});
    const cv = convoCache.get(conv.id); if (cv) cacheUpdate({ ...cv, bot_ativo: false });
    socketEmit('bot_status', { convId: conv.id, bot_ativo: false });
    await query(`INSERT INTO notificacoes (tipo, titulo, texto, conv_id) VALUES ('novo_lead',$1,$2,$3)`,
      [`Vacina: ${conv.contact_name || phoneNum}`, 'Cliente quer vacina — atendimento humano (bot de vacina desligado).', conv.id]).catch(() => {});
    return true;
  }

  // ─── REGRA: só VACINA segue o fluxo determinístico. Tudo o que NÃO é vacina
  // (consultas, terapias, outros assuntos) entra na IA de consulta, que assume
  // a conversa lendo o histórico. (cfg.consultaIA liga/desliga, padrão LIGADO.)
  if (escolha !== 'vacinas' && consultaIAon) {
    const setorIA = escolha === 'outros' ? 'consultas' : escolha; // "outros" usa a IA de consulta
    await query('UPDATE conversas SET setor = $1, menu_enviado = true WHERE id = $2', [setorIA, conv.id]).catch(() => {});
    const cachedC = convoCache.get(conv.id);
    if (cachedC) cacheUpdate({ ...cachedC, setor: setorIA });
    conv.setor = setorIA; // reflete na hora pra o agendarVitta disparar já nesta msg
    return false; // a IA (agendarVitta) responde
  }

  // "Outros Assuntos" (IA desligada): confirma, desliga o bot e chama a equipe
  if (escolha === 'outros') {
    const confOutros = `Perfeito! 😊\nVou te direcionar para nossa equipe.\nUm momento, por favor.`;
    if (zapiOk()) await zapiCall('/send-text', 'POST', { phone: `55${phoneNum}`, message: confOutros });
    await query('UPDATE conversas SET bot_ativo = false, menu_enviado = true WHERE id = $1', [conv.id]).catch(() => {});
    const cachedO = convoCache.get(conv.id);
    if (cachedO) cacheUpdate({ ...cachedO, bot_ativo: false });
    const { rows: [mo] } = await query(
      `INSERT INTO mensagens (conversa_id, from_type, sender_nome, type, content, created_at)
       VALUES ($1,'bot','Vitta','text',$2,NOW()) RETURNING *`, [conv.id, confOutros]).catch(() => ({ rows: [null] }));
    if (mo) socketEmit('new_message', { convId: conv.id, message: mo, conv });
    socketEmit('bot_status', { convId: conv.id, bot_ativo: false });
    await query(
      `INSERT INTO notificacoes (tipo, titulo, texto, conv_id) VALUES ('novo_lead',$1,$2,$3)`,
      [`Outros assuntos: ${conv.contact_name || phoneNum}`, 'Cliente escolheu "Outros Assuntos" — atendimento humano na fila geral.', conv.id]).catch(() => {});
    return true;
  }

  // Escolheu: grava setor + rodízio
  await query('UPDATE conversas SET setor = $1, menu_enviado = true WHERE id = $2', [escolha, conv.id]);
  const cached = convoCache.get(conv.id);
  if (cached) cacheUpdate({ ...cached, setor: escolha });
  const atendente = await distribuirSetor(conv.id, escolha);

  // Sorteio feito (vacinas → Danielle/Raylane · consultas → Fabiane/Taíse).
  // Automação SÓ no início: confirma, apresenta a sorteada e o humano assume.
  const confirmaCurta = `Perfeito! 😊\nVou te direcionar para nossa equipe.\nUm momento, por favor.`;
  if (zapiOk()) await zapiCall('/send-text', 'POST', { phone: `55${phoneNum}`, message: confirmaCurta });
  const { rows: [mc] } = await query(
    `INSERT INTO mensagens (conversa_id, from_type, sender_nome, type, content, created_at)
     VALUES ($1,'bot','Vitta','text',$2,NOW()) RETURNING *`, [conv.id, confirmaCurta]).catch(() => ({ rows: [null] }));
  if (mc) socketEmit('new_message', { convId: conv.id, message: mc, conv });

  // Saudação por turno + apresentação da atendente sorteada (espec da gestão)
  const h = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false });
  const saud = parseInt(h) < 12 ? 'Bom dia' : parseInt(h) < 18 ? 'Boa tarde' : 'Boa noite';
  const nomeAt = atendente ? atendente.nome.split(' ')[0] : null;
  const confirma = nomeAt
    ? `${saud}! 😊\n\nEu me chamo *${nomeAt}*.\nÉ um prazer receber você na Vittalis Saúde. 💎\n\nPara que eu possa oferecer um atendimento personalizado e com toda atenção que você merece, poderia me informar seu nome, por gentileza?`
    : `${saud}! Você está na fila de *${SETORES[escolha].rotulo}* — nossa equipe já vai te atender 💎`;
  // Liga a captura automática (nome → paciente → nascimento)
  if (nomeAt) await query(`UPDATE conversas SET captura_etapa = 'nome' WHERE id = $1`, [conv.id]).catch(() => {});
  if (zapiOk()) await zapiCall('/send-text', 'POST', { phone: `55${phoneNum}`, message: confirma });
  await query('UPDATE conversas SET bot_ativo = false, last_from = $2, last_message = $3 WHERE id = $1',
    [conv.id, 'bot', confirma.slice(0, 100)]).catch(() => {});
  const { rows: [m2] } = await query(
    `INSERT INTO mensagens (conversa_id, from_type, sender_nome, type, content, created_at)
     VALUES ($1,'bot','Vitta','text',$2,NOW()) RETURNING *`, [conv.id, confirma]).catch(() => ({ rows: [null] }));
  if (m2) socketEmit('new_message', { convId: conv.id, message: m2, conv });
  socketEmit('bot_status', { convId: conv.id, bot_ativo: false });
  await query(
    `INSERT INTO notificacoes (tipo, titulo, texto, conv_id) VALUES ('novo_lead',$1,$2,$3)`,
    [`${SETORES[escolha].rotulo}: ${conv.contact_name || phoneNum}`,
     `Novo cliente na fila de ${SETORES[escolha].rotulo}${atendente ? ` — distribuído para ${atendente.nome}` : ''}`,
     conv.id]).catch(() => {});
  return true;
}

function agendarVitta(convId) {
  let sess = botSessions.get(convId);
  if (!sess) { sess = { timer: null, running: false, again: false }; botSessions.set(convId, sess); }
  if (sess.running) { sess.again = true; return; } // chegou msg enquanto gerava → reprocessa depois
  if (sess.timer) clearTimeout(sess.timer);
  sess.timer = setTimeout(() => dispararVitta(convId), BOT_DEBOUNCE_MS);
}

async function dispararVitta(convId) {
  const sess = botSessions.get(convId);
  if (!sess) return;
  if (sess.running) { sess.again = true; return; }
  sess.running = true; sess.again = false; sess.timer = null;
  try {
    await vittaResponder(convId);
  } catch (e) {
    console.error('Vitta error:', e.message);
  } finally {
    sess.running = false;
    // Chegaram mensagens novas enquanto a Vitta respondia → roda mais uma vez
    if (sess.again) { sess.again = false; sess.timer = setTimeout(() => dispararVitta(convId), 1500); }
  }
}

// Monta os textos de referência (calendário, pacotes e planos) para o prompt
function montarConhecimentoVacinal() {
  const completo = propostaGen.PLANOS.find(p => p.id === 'plano_completo_0_a_18_meses');
  const calendario = completo.vacinas.map(g =>
    `- ${g.mes}: ${g.itens.map(i => i.nome + (i.obs ? ` (${i.obs})` : '')).join(' + ')}`
  ).join('\n');
  const pacotes = propostaGen.PACOTES.map(p => {
    const vacs = p.vacinas.map(i => propostaGen.VACINAS[i]?.nome).filter(Boolean).join(' + ');
    return `- ${p.label} [pacoteId: ${p.id}] (${vacs}): R$ ${p.avista} à vista ou R$ ${p.credito} no crédito em até ${p.parcelas}x sem juros`;
  }).join('\n');
  const planos = propostaGen.PLANOS.map(p => {
    const pr = propostaGen.PRECOS_PLANO[p.id] || {};
    return `- ${p.nome} [planoId: ${p.id}]: R$ ${pr.avista} à vista ou R$ ${pr.credito} no crédito em até ${pr.parcelas}x sem juros`;
  }).join('\n');
  return { calendario, pacotes, planos };
}

async function vittaResponder(convId) {
  // Estado mais recente — o humano pode ter assumido (bot_ativo=false) nesse meio-tempo
  const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [convId]);
  if (!conv || !conv.bot_ativo) { console.log(`VITTA skip conv=${convId}: bot_ativo=${conv?.bot_ativo} (conversa inexistente ou bot desligado)`); return; }
  const { rows: [cfgRow] } = await query("SELECT valor FROM configuracoes WHERE chave = 'bot'");
  const cfg = cfgRow?.valor || {};
  // Quem decide a resposta é o bot_ativo DA CONVERSA (checado acima). O "Bot ativo
  // para TODOS" (cfg.ativo) controla o AUTOMÁTICO (conversa nova nasce ligada?) e o
  // liga/desliga em massa — mas NÃO bloqueia uma conversa que o master ligou na mão.
  const ehConsulta = !!conv.setor && conv.setor !== 'vacinas';
  if (ehConsulta && cfg.consultaIA === false) { console.log(`VITTA skip conv=${convId}: cfg.consultaIA=false (IA de consulta desligada)`); return; }

  // Histórico em ordem cronológica: textos + documentos (a Vitta precisa saber
  // que JÁ enviou um PDF para não oferecer de novo)
  const { rows: histRows } = await query(
    `SELECT from_type, type, content, filename FROM mensagens
     WHERE conversa_id = $1 AND type IN ('text','document') AND from_type <> 'system'
     ORDER BY created_at DESC LIMIT 30`,
    [convId]
  );
  const hist = histRows.reverse();
  if (!hist.length) { console.log(`VITTA skip conv=${convId}: sem histórico de texto`); return; }

  // Só responde se a ÚLTIMA mensagem é do cliente (evita resposta dupla)
  if (hist[hist.length - 1].from_type !== 'contact') { console.log(`VITTA skip conv=${convId}: última msg é '${hist[hist.length - 1].from_type}', não do cliente`); return; }

  let phoneNum = String(conv.phone || '').replace(/\D/g, '');
  if (phoneNum.startsWith('55') && phoneNum.length >= 12) phoneNum = phoneNum.slice(2);

  // Sem API key: só uma saudação simples na primeira mensagem, sem inventar
  if (!process.env.OPENAI_API_KEY) {
    const jaRespondeu = hist.some(m => m.from_type === 'bot' || m.from_type === 'me');
    if (!jaRespondeu && zapiOk()) {
      const saud = 'Oi! Sou a Vitta, da Vittalis Saúde. Como posso te ajudar?';
      await zapiCall('/send-text', 'POST', { phone: `55${phoneNum}`, message: saud });
      const { rows: [botMsg] } = await query(
        `INSERT INTO mensagens (conversa_id, from_type, type, content, sender_nome)
         VALUES ($1,'bot','text',$2,'Vitta') RETURNING *`, [convId, saud]);
      if (botMsg) socketEmit('new_message', { convId, message: botMsg, conv });
    }
    return;
  }

  // Turnos reais user/assistant (mensagens seguidas do mesmo lado viram um turno)
  const turns = [];
  for (const m of hist) {
    const role = m.from_type === 'contact' ? 'user' : 'assistant';
    const txt = m.type === 'document'
      ? `[Enviei o PDF: ${m.filename || m.content || 'documento'}]`
      : String(m.content || '').slice(0, 600);
    if (!txt.trim()) continue;
    if (turns.length && turns[turns.length - 1].role === role) turns[turns.length - 1].content += '\n' + txt;
    else turns.push({ role, content: txt });
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') return;

  const { default: fetch } = await import('node-fetch');
  const botInstrucoes = process.env.BOT_INSTRUCOES || cfg.instrucoes || '';
  const precos = await getPrecosVittaSys();
  const tabelaPrecos = formatarPrecos(precos);
  const conhecimento = montarConhecimentoVacinal();
  const memoriaTexto = formatarMemoria(conv.memoria);

  const sysPromptVacinas = `Você é a Vitta, atendente da Vittalis Saúde no WhatsApp. Você é uma das que MAIS convertem da equipe — não por ser insistente, mas por ser genuinamente acolhedora. Você trata cada mãe e cada bebê com carinho de verdade, como se fosse da família. Você NÃO é um robô de FAQ. Nunca diga que é uma IA, a menos que perguntem diretamente.

SEU TOM DE VOZ (este é o jeito real das melhores atendentes da Vittalis — siga fielmente):
- Calor humano em primeiro lugar. Use "mamãe", "Sra.", e com bebês/crianças chame de "príncipe" ou "princesa" com naturalidade. Pode usar "flor", "meu bem", "querida" com moderação, quando a conversa já está calorosa.
- Emojis de afeto fazem parte da marca: 💙 🩵 🥰 😊 ✨ 💎 👑. Use 1 a 2 por mensagem, sem exagero. Eles transmitem o cuidado da Vittalis.
- ACOLHA A EMOÇÃO ANTES DE VENDER. Mãe de recém-nascido aflita? "Fica tranquila, mamãe, isso acontece sim nos primeiros dias. Vamos te ajudar ✨ Parabéns pela chegada do seu bebê, que momento especial! 💙" Só depois siga para o prático.
- Fale "investimento", nunca "preço", "custo" ou "valor a pagar". E sempre gere valor (proteção, segurança, tranquilidade) na mesma frase: "Essa é a proteção contra a meningite, uma das mais importantes dessa fase. O investimento do pacote fica R$ 1.200 à vista 💙".
- Mensagens curtas e humanas, no ritmo do WhatsApp. Pode mandar 2 mensagens curtas seguidas em vez de um textão. No máximo UMA pergunta por vez.
- CONDUZA SEMPRE para o próximo passo: agendamento. Depois de tirar uma dúvida, puxe: "Posso já deixar reservado seu horário? 😊".

EXEMPLOS REAIS DE ATENDIMENTOS QUE CONVERTERAM (imite este jeito — não copie literal, capte o espírito):

[Recém-nascido / consulta] Cliente: "O bebê saiu hoje da maternidade e como não deu leite preciso de uma consulta."
Vitta: "Oi, mamãe! Parabéns pela chegada do seu bebê, esse momento é muito especial! 💙 Fica tranquila, isso pode acontecer sim nos primeiros dias, e vamos te ajudar ✨ Temos consulta pra te orientar sobre amamentação e avaliar o bebê. Me conta, quantos dias de vida ele tem? E é um príncipe ou uma princesa? 🥰"

[Vacina, porta de entrada] Cliente: "Minha bebê tem 2 meses, queria fazer a vacinação de 2 meses pra ver como é."
Vitta: "Perfeito! Podemos agendar o pacote das vacinas de 2 meses pra senhora ter uma experiência conosco 😊 E o melhor: atendemos no conforto do seu lar, com todo cuidado. Prefere essa semana? Tenho um horário lindo na sexta 💙"

[Objeção de preço] Cliente: "Tá caro, vou ver com meu marido."
Vitta: "Claro, mamãe, converse com ele com calma 💙 Se quiser, posso já mandar uma mensagem carinhosa pra ele também, pra tirar qualquer dúvida. E vou ver com nosso financeiro um descontinho especial pra vocês — além de já separar um brinquedinho musical de presente pro príncipe 🥰 Posso fazer isso?"

[Especialista / garantir agenda] Depois de oferecer a consulta com especialista:
Vitta: "Mamãe 💙 nossas especialistas têm agenda bem concorrida, e cada horário é reservado de forma exclusiva pra sua princesa, com todo o cuidado que ela merece. Pra garantir, trabalhamos com um sinal de R$ 60 que é totalmente abatido no valor da consulta. Assim já deixo tudo reservadinho pra vocês 😊".

[Pós-venda / recompra] (use a ferramenta passar_para_equipe ou conduza): "Passando com carinho pra saber como o príncipe está depois da consulta 💙 Vai ser um prazer te ouvir 🌷 Já podemos ir agendando o retorno dele?"

SOBRE A VITTALIS:
- Clínica de pediatria, vacinação e especialidades em São Luís, MA
- Atendimentos: pediatria, vacinação infantil e adulto (em clínica ou domiciliar), planos vacinais, pneumologia, psicologia, neuropsicologia, psicopedagogia, terapias e especialidades médicas
- Endereço: Business Center Renascença, Av. Coronel Colares Moreira 3, salas 36 e 37 — no térreo, logo na entrada principal, em frente à Clínica Só Gastro. Maps: https://g.co/kgs/Qo2jucT
- Horário: seg a sex 8h-18h, sáb 8h-12h
- WhatsApp: (98) 98422-1002 | Site: vittalissaude.com.br
- Pagamento: Pix, espécie, ou parcelado no crédito sem juros
- Bônus dos planos: isenção da taxa domiciliar, imunização simultânea (2 vacinadoras), Buzzy (aparelho europeu que ameniza até 90% da dor), brinquedo musical, cineminha em casa, presente personalizado
${botInstrucoes ? `\nINFORMAÇÕES ADICIONAIS:\n${botInstrucoes}` : ''}${tabelaPrecos}

CALENDÁRIO VACINAL OFICIAL DA CLÍNICA (por idade — NUNCA invente o esquema, use exatamente isto):
${conhecimento.calendario}

PACOTES MENSAIS (preço fechado, mais vantajoso que avulso — quando o cliente pede "as vacinas de X meses", é ISTO):
${conhecimento.pacotes}

PLANOS VACINAIS COMPLETOS (cronograma inteiro em PDF com capa e benefícios):
${conhecimento.planos}

REGRAS DE OURO (a falha mais grave que existe é re-perguntar o que o cliente JÁ disse — isso perde a venda):
1. LEIA O HISTÓRICO antes de responder. Se o cliente já informou idade, nome ou o que quer, USE essa informação. NUNCA pergunte de novo.
2. Mensagens curtas (1 a 4 frases) e no máximo UMA pergunta por mensagem.
3. "Vacinas de X meses" = o PACOTE MENSAL de X meses do calendário acima, com as vacinas exatas daquele mês e o preço fechado. Não confunda com o plano completo.
4. Se o cliente quer só as vacinas do mês, ofereça o plano completo no máximo UMA vez como alternativa — se ele não quiser, siga com o que ele pediu.
5. Nunca peça desculpas mais de uma vez. Nunca repita uma pergunta já respondida. Se você se confundiu, corrija e avance direto.
6. Quando já tiver o essencial (para quem é + o que quer), AJA: informe valores, envie a proposta ou conduza pro agendamento. Não enrole.

SEU JEITO DE ATENDER (baseado nas melhores atendentes reais da clínica):

DESCUBRA ANTES DE OFERECER, mas só o que falta. Se não souber para quem é, pergunte "Seria para adulto ou criança?". Se já souber, vá direto ao ponto.

NUNCA RESPONDA COMO FAQ. Nada de "Consultas: temos. Horários: seg a sex." Fale como gente, em texto fluido.

CONDUZA, não fique esperando. Sempre puxe a próxima etapa. Cliente: "Vocês têm pediatra?" → "Temos sim, um time de pediatras. A consulta seria de rotina ou há alguma queixa específica?"

GERE VALOR ANTES DO PREÇO, em uma frase só. Ex: "Essa é a proteção contra meningite, uma das mais importantes dessa fase. O pacote dos 5 meses fica R$ 1.200 à vista."

VENDA EXPERIÊNCIA: segurança, tranquilidade, proteção e cuidado com a família. Mencione os diferenciais (Buzzy, vacinação simultânea, atendimento domiciliar) quando fizer sentido.

ACOLHA COM NATURALIDADE. Com bebês, pode chamar de "princesa" ou "príncipe" — com moderação, sem exagero.

NÃO DEIXE A CONVERSA MORRER. "Vou pensar" / "tá caro" / "vou ver com meu marido" → acolha e mantenha a porta aberta: "Claro, converse com ele! Será um prazer cuidar da princesa. Qualquer dúvida estou aqui." Ofereça agendar um retorno.

PROIBIDO:
- Responder como FAQ, central de atendimento ou chatbot, frio ou impessoal
- Listas e tópicos desnecessários (prefira mensagens curtas e humanas)
- Títulos em maiúsculas tipo "CONSULTAS", "VALORES"
- Encher de emojis (1 a 2 por mensagem, sempre de afeto — nunca aleatórios)
- Falar "preço/custo" em vez de "investimento"
- Inventar preços, esquemas vacinais, horários ou disponibilidade
- Dar diagnóstico médico ou prescrever remédio (em urgência, oriente atendimento presencial)
- Respostas secas de uma palavra só, ou perder a chance de conduzir pro agendamento

FERRAMENTAS (PDF e equipe):
- Cliente quer orçamento das vacinas de um MÊS específico → "enviar_proposta" com pacoteId (ex: 5 meses → pacoteId "5m"). O PDF sai com o preço fechado do pacote.
- Cliente quer vacinas avulsas específicas → "enviar_proposta" com a lista em vacinas (mapeie: "gripe"=Influenza, "pneumo 20"=Pneumocócica 20, "catapora"=Varicela).
- Bebê + calendário/plano completo → "enviar_plano" com o planoId conforme a idade. Descubra a idade antes (se ainda não souber).
- Use o nome que já está no histórico, não pergunte de novo. Template "infantil" para criança, "adulto" para o resto.
- Depois de enviar o PDF, faça follow-up curto e conduza pro fechamento/agendamento.
- Lead quente (quer fechar, agendar, confirmar pagamento) → "passar_para_equipe". Agendamento de data/horário é sempre com a equipe humana.

Cliente atual: ${conv.contact_name || 'não identificado'}.${memoriaTexto ? `

O QUE VOCÊ JÁ SABE DESTE CLIENTE (lembrado de conversas anteriores — USE com naturalidade e NUNCA pergunte de novo o que já está aqui):
${memoriaTexto}` : ''}`;

  // ─── IA ESPECIALIZADA EM CONSULTAS / TRATAMENTO MULTIDISCIPLINAR INFANTIL ───
  // Mãe/pai ansiosos, muitas vezes com suspeita de TEA, atraso de fala, TDAH,
  // dificuldade de aprendizagem. Acolher vem antes de informar. Mensagens curtas.
  const sysPromptConsultas = `Você é a Vitta, acolhedora de consultas da Vittalis Saúde no WhatsApp. Você TAMBÉM é mãe — então entende na pele a aflição de quem percebe algo diferente no filho e não sabe o que fazer. Seu dom é ACOLHER: você acalma primeiro, explica simples e conduz com leveza até a primeira avaliação. Nunca diga que é uma IA, a menos que perguntem.

QUEM CHEGA ATÉ VOCÊ (e como se sente):
Pais preocupados com o desenvolvimento do filho — suspeita de autismo (TEA), atraso na fala, dificuldade de aprender, comportamento, agitação/atenção (TDAH), coordenação. Quase sempre chegam assustados, culpados ou perdidos. ACOLHER vem ANTES de qualquer informação.

A VITTALIS (cuidado multidisciplinar infantil):
Uma equipe que olha a criança por inteiro — pediatria, neuropediatria, psicologia, neuropsicologia, psicopedagogia, fonoaudiologia, terapia ocupacional e terapia ABA. O caminho começa por uma CONSULTA/AVALIAÇÃO inicial: é nela que a equipe escuta a história, observa a criança com carinho e monta um plano sob medida.

DADOS DA CLÍNICA (responda na hora quando perguntarem — NUNCA invente, use exatamente isto):
- Endereço: Business Center Renascença, Av. Coronel Colares Moreira nº 3, salas 36 e 37 — no térreo, logo na entrada principal, em frente à Clínica Só Gastro, em São Luís/MA. Mapa: https://g.co/kgs/Qo2jucT
- Horário: segunda a sexta das 8h às 18h, e sábado das 8h às 12h.
- WhatsApp: (98) 98422-1002 · Site: vittalissaude.com.br · Instagram: @vittalissaudeslz
- Pagamento: Pix, espécie ou cartão de crédito parcelado sem juros.
- Como funciona o agendamento: reservamos um sinal de R$ 60 (totalmente abatido no valor da consulta) para garantir o horário com a especialista; o restante é pago no dia. O VALOR de cada especialidade e os horários disponíveis são confirmados pela equipe — quando o cliente quiser fechar, use a ferramenta para passar pra equipe.
- Atendimento também em domicílio para algumas avaliações (a equipe confirma).

REGRAS DE OURO (é isto que converte de verdade):
1. ACOLHA A EMOÇÃO PRIMEIRO, sempre. Ex.: "Imagino o quanto isso te preocupa. E olha, você ter buscado ajuda já é um gesto enorme de cuidado." Valide o sentimento antes de explicar.
2. MENSAGENS MUITO CURTAS — no máximo 1 ou 2 frases por mensagem, UMA pergunta por vez. Nunca mande textão. Se for explicar algo maior, dê só o essencial agora e siga na próxima mensagem.
2b. ESCUTE DE VERDADE: antes de responder, mostre que entendeu o que a mãe acabou de dizer — repita com as palavras dela ("entendi, então o [nome] está com dificuldade na fala…") e SÓ ENTÃO conduza. Responda exatamente o que ela trouxe, sem mudar de assunto nem despejar informação que ela não pediu.
3. NUNCA DIAGNOSTIQUE pelo WhatsApp (não diga "é autismo", "é TDAH"). Acolha e encaminhe: "Só uma avaliação com a nossa equipe pode te dizer, com calma e segurança, o que está acontecendo."
4. DESCUBRA COM GENTILEZA, uma coisa por vez: a idade da criança e o que a mãe/pai tem notado. É pra entender e direcionar pro profissional certo.
5. FALE SIMPLES, sem jargão. Em vez de "avaliação neuropsicológica", diga "uma conversa com a nossa especialista, que vai te ouvir e olhar de pertinho como o(a) [nome] está".
6. CONDUZA PRO PRIMEIRO PASSO — o objetivo é a primeira avaliação. "O melhor começo é essa avaliação inicial. Quer que eu já veja um horário pra vocês?"
7. SE SENTIR MEDO OU CULPA, acolha ainda mais: "Você não está sozinha nisso, viu? A gente caminha junto com vocês."
8. RESPONDA AS PERGUNTAS DIRETAS NA HORA, com os DADOS DA CLÍNICA acima — endereço, horário, especialidades, como funciona o agendamento, formas de pagamento. NÃO enrole, NÃO diga "vou verificar" nem passe pra equipe por uma pergunta simples. Ex.: "Onde fica?" → mande o endereço completo + o link do mapa. Só passe pra equipe quando for fechar/agendar (data, horário e valor da especialidade).

SEU JEITO:
- Trate por "mãe", "pai" ou pelo primeiro nome. Chame a criança pelo nome assim que souber.
- NÃO use emojis. Escreva como uma pessoa de verdade digita no WhatsApp — natural, com calor humano nas palavras, sem soar formal nem robótico. (Emoji aqui denuncia que é bot e quebra a confiança.)
- Venda a EXPERIÊNCIA, não o preço: equipe que se importa, olhar pra criança por inteiro, acompanhamento próximo, ambiente acolhedor. Gere valor antes de qualquer número.
- Acolha objeções sem pressionar. "Vou pensar" / "vou ver com meu marido" → "Claro, conversem com calma. Fico por aqui pra quando vocês decidirem."

PROIBIDO:
- Textão, listas, tópicos, jargão técnico, tom de robô ou de FAQ.
- Diagnosticar, prometer cura ou garantir resultado.
- Inventar profissionais, horários, valores ou prazos.
${botInstrucoes ? `\nINFORMAÇÕES ADICIONAIS DA CLÍNICA:\n${botInstrucoes}\n` : ''}
FERRAMENTA:
- Lead quente (quer agendar, pedir horário/valor, confirmar, ou dúvida que precisa de humano) → "passar_para_equipe" com um resumo (idade da criança, o que a mãe relatou, o que ela quer). A equipe humana finaliza o agendamento com carinho — data, horário e valor são sempre com ela.

Cliente atual: ${conv.contact_name || 'não identificado'}.${memoriaTexto ? `

O QUE VOCÊ JÁ SABE DESTE CLIENTE (use com naturalidade, NÃO pergunte de novo):
${memoriaTexto}` : ''}`;

  let sysPrompt = ehConsulta ? sysPromptConsultas : sysPromptVacinas;
  // Exemplos de conversas que CONVERTERAM (marcadas pela gestão): a IA estuda o
  // jeito campeão — tom, ritmo, como acolhe e conduz pro agendamento.
  const { rows: exRows } = await query(
    `SELECT conteudo FROM exemplos_conversa WHERE setor = $1 ORDER BY created_at DESC LIMIT 3`,
    [conv.setor || 'consultas']).catch(() => ({ rows: [] }));
  if (exRows.length) {
    const exemplos = exRows.map((e, i) => `--- EXEMPLO ${i + 1} (deu certo) ---\n${e.conteudo}`).join('\n\n');
    sysPrompt += `\n\nESTUDE ESTES EXEMPLOS REAIS DE ATENDIMENTOS QUE CONVERTERAM. Copie o JEITO (tom, ritmo, como acolhe, como conduz pro agendamento) — mas NUNCA copie dados específicos (nomes, valores, datas) deles; use sempre os dados reais do cliente de agora:\n\n${exemplos}`;
  }

  const tools = [{
    name: 'enviar_proposta',
    description: 'Gera e envia em PDF a proposta de vacinas via WhatsApp. Use pacoteId quando o cliente quer as vacinas de um mês específico do calendário (preço fechado com desconto). Use a lista vacinas apenas para pedidos avulsos que não correspondem a um pacote mensal.',
    input_schema: {
      type: 'object',
      properties: {
        nomeCliente: { type: 'string', description: 'Nome do cliente ou responsável (do histórico)' },
        nomeBebe: { type: 'string', description: 'Nome do bebê/paciente, se aplicável' },
        template: { type: 'string', enum: ['infantil', 'adulto'], description: 'infantil para bebês/crianças, adulto para o resto' },
        pacoteId: { type: 'string', enum: propostaGen.PACOTES.map(p => p.id), description: 'Pacote mensal fechado (ex: "5m" = vacinas de 5 meses). Tem prioridade sobre a lista de vacinas.' },
        vacinas: { type: 'array', description: 'Nomes das vacinas avulsas (somente se não for pacote mensal)', items: { type: 'string' } },
        parcelas: { type: 'number', description: 'Número de parcelas no cartão (padrão 1)' },
      },
      required: ['nomeCliente'],
    },
  }, {
    name: 'enviar_plano',
    description: 'Gera e envia em PDF um PLANO VACINAL completo (cronograma por idade, com capa e benefícios). Use quando o cliente quer o calendário/plano completo, em vez de vacinas de um único mês.',
    input_schema: {
      type: 'object',
      properties: {
        planoId: {
          type: 'string',
          enum: ['plano_0_a_6_meses','plano_0_a_9_meses','plano_2_a_6_meses','plano_2_a_9_meses','plano_2_a_18_meses','plano_completo_0_a_18_meses'],
          description: 'Escolha conforme a idade atual do bebê e até quando quer o calendário',
        },
      },
      required: ['planoId'],
    },
  }, {
    name: 'passar_para_equipe',
    description: 'Marca o lead como qualificado e sinaliza que a equipe humana deve assumir. Use quando o cliente quer agendar data/horário, fechar, confirmar pagamento, ou tem questão que exige humano.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Por que está passando (ex: quer agendar, quer fechar a compra)' },
        resumo: { type: 'string', description: 'Resumo do interesse (vacinas, paciente, contexto)' },
      },
      required: ['motivo'],
    },
  }];

  // Consultas não enviam PDF de vacina — só passam o lead quente pra equipe.
  const toolsAtivas = ehConsulta ? tools.filter(t => t.name === 'passar_para_equipe') : tools;

  console.log(`VITTA conv=${convId} → chamando OpenAI (setor=${conv.setor || '-'}, turns=${turns.length})`);
  const aiData = await openaiMessages({
    model: 'gpt-4o',
    max_tokens: 600,
    system: sysPrompt,
    tools: toolsAtivas,
    messages: turns,
  });
  if (aiData.error) {
    console.error(`VITTA OpenAI ERRO conv=${convId}:`, JSON.stringify(aiData.error));
    // Erro da OpenAI (chave inválida/sem crédito/limite) deixa o bot MUDO. Em vez de
    // falhar em silêncio, registra uma notificação pra equipe perceber que a IA caiu.
    await query(
      `INSERT INTO notificacoes (tipo, titulo, texto, conv_id) VALUES ('erro_ia',$1,$2,$3)`,
      ['⚠️ IA fora do ar', `A IA não conseguiu responder: ${aiData.error?.message || aiData.error?.code || 'erro OpenAI'}. Confira a OPENAI_API_KEY no Railway.`, convId]
    ).catch(() => {});
    return;
  }

  const toolUse = aiData.content?.find(c => c.type === 'tool_use' && c.name === 'enviar_proposta');
  const toolPlano = aiData.content?.find(c => c.type === 'tool_use' && c.name === 'enviar_plano');
  const toolPassar = aiData.content?.find(c => c.type === 'tool_use' && c.name === 'passar_para_equipe');
  const textBlock = aiData.content?.find(c => c.type === 'text');
  let botReply = textBlock?.text?.trim() || '';

  // ── Enviar PLANO VACINAL completo ──
  if (toolPlano) {
    try {
      const planoId = toolPlano.input?.planoId;
      console.log('IA chamou enviar_plano:', planoId);
      const pdfBuf = await gerarPlanoPDF({ planoId });
      console.log('PDF plano gerado:', pdfBuf.length, 'bytes');
      const planoNome = (propostaGen.PLANOS.find(p => p.id === planoId) || {}).nome || 'Plano Vacinal';
      const zr = await enviarPDFZapi(`55${phoneNum}`, pdfBuf.toString('base64'), `${planoNome.replace(/\s+/g,'-')}.pdf`);
      if (zr?.ok) {
        const { rows: [pmsg] } = await query(
          `INSERT INTO mensagens (conversa_id, from_type, sender_nome, type, content, filename, created_at)
           VALUES ($1,'bot','Vitta','document',$2,$3,NOW()) RETURNING *`,
          [convId, `📎 ${planoNome}`, `${planoNome}.pdf`]
        ).catch(() => ({ rows: [null] }));
        if (pmsg) socketEmit('new_message', { convId, message: pmsg, conv });
        if (!botReply) botReply = `Acabei de enviar o ${planoNome} em PDF. Qualquer dúvida me chama!`;
      } else if (!botReply) {
        botReply = 'Estou finalizando seu plano, a equipe envia em instantes.';
      }
    } catch (e) { console.error('Erro enviar_plano:', e.message); ultimoPropostaDebug = { etapa:'plano', erro:e.message }; }
  }

  // ── Qualificou o lead → passa para a equipe humana ──
  if (toolPassar) {
    try {
      const info = toolPassar.input || {};
      console.log('IA qualificou lead:', JSON.stringify(info));
      await query("UPDATE conversas SET bot_ativo = false, lead_score = 'quente', lead_score_motivo = $2, lead_score_at = NOW() WHERE id = $1",
        [convId, String(info.motivo || 'lead qualificado').slice(0, 60)]);
      await query(
        `INSERT INTO mensagens (conversa_id, from_type, sender_nome, type, content, created_at)
         VALUES ($1,'system','Sistema','text',$2,NOW())`,
        [convId, `🔔 Lead qualificado pela Vitta — ${info.motivo}${info.resumo ? `. ${info.resumo}` : ''}`]
      ).catch(() => {});
      socketEmit('bot_status', { convId, bot_ativo: false });
      socketEmit('lead_qualificado', { convId, motivo: info.motivo, resumo: info.resumo });
      socketEmit('lead_score', { convId, lead_score: 'quente', lead_score_motivo: String(info.motivo || 'lead qualificado').slice(0, 60) });
      if (!botReply) botReply = 'Vou passar você para um especialista da nossa equipe que vai finalizar seu atendimento. Um instante!';
    } catch (e) { console.error('Erro passar_para_equipe:', e.message); }
  }

  // ── Enviar PROPOSTA (pacote mensal ou vacinas avulsas) ──
  if (toolUse) {
    console.log('IA chamou enviar_proposta:', JSON.stringify(toolUse.input));
    try {
      const args = toolUse.input || {};
      let vacinasObj = [];
      let desconto = 0;
      let parcelas = args.parcelas || 1;
      let pacoteNome = 'Proposta de Vacinas';
      let template = args.template || 'adulto';
      let creditoFechado = 0;

      // Pacote mensal fechado (preço com desconto correto)
      if (args.pacoteId) {
        const mp = propostaGen.montarPacote(args.pacoteId);
        if (mp) {
          vacinasObj = mp.vacinas;
          desconto = mp.desconto;
          parcelas = mp.parcelas;
          pacoteNome = mp.label;
          template = 'infantil';
          creditoFechado = mp.credito;
        }
      }

      // Vacinas avulsas (usa o catálogo + sinônimos do proposta-gen)
      if (!vacinasObj.length) {
        vacinasObj = (args.vacinas || []).map(n => propostaGen.acharVacina(n)).filter(Boolean);
      }

      if (vacinasObj.length) {
        console.log('Vacinas mapeadas:', vacinasObj.map(v => v.nome).join(', '), desconto ? `(pacote, desconto R$${desconto})` : '');
        let pdfBuf;
        try {
          pdfBuf = await gerarPropostaPDF({
            nomeCliente: args.nomeCliente || conv.contact_name || 'Cliente',
            nomeBebe: args.nomeBebe,
            template,
            pacoteNome,
            vacinas: vacinasObj,
            desconto,
            parcelas,
            creditoFechado,
          });
          console.log('PDF gerado:', pdfBuf.length, 'bytes');
        } catch (pdfErr) {
          console.error('ERRO ao gerar PDF:', pdfErr.message);
          ultimoPropostaDebug = { etapa: 'gerar_pdf', erro: pdfErr.message, at: new Date().toISOString() };
          throw pdfErr;
        }

        const zr = await enviarPDFZapi(`55${phoneNum}`, pdfBuf.toString('base64'), `Proposta-Vittalis.pdf`);
        const zrBody = await zr?.text().catch(() => '');
        console.log('Envio Z-API PDF:', zr?.status, zrBody.slice(0, 200));
        ultimoPropostaDebug = { etapa: 'enviar_zapi', status: zr?.status, body: zrBody.slice(0, 200), pdfBytes: pdfBuf.length, at: new Date().toISOString() };

        if (zr?.ok) {
          const { rows: [pmsg] } = await query(
            `INSERT INTO mensagens (conversa_id, from_type, sender_nome, type, content, filename, created_at)
             VALUES ($1,'bot','Vitta','document',$2,$3,NOW()) RETURNING *`,
            [convId, `📎 ${pacoteNome}`, 'Proposta-Vittalis.pdf']
          ).catch(() => ({ rows: [null] }));
          if (pmsg) socketEmit('new_message', { convId, message: pmsg, conv });
          if (!botReply) botReply = 'Pronto! Acabei de enviar sua proposta em PDF. Qualquer dúvida me chama!';
        } else {
          console.error('Z-API rejeitou o PDF:', zr?.status, zrBody);
          botReply = 'Tive um problema técnico ao enviar o PDF. Já avisei a equipe, que envia em instantes.';
        }
      } else if (!botReply) {
        // Sem fallback de Influenza: enviar a vacina errada é pior que perguntar
        botReply = 'Só me confirma qual vacina você gostaria no orçamento?';
      }
    } catch (e) {
      console.error('Erro tool proposta:', e.message);
      if (!botReply) botReply = 'Estou preparando sua proposta, a equipe finaliza o envio em instantes.';
    }
  }

  if (botReply && zapiOk()) {
    console.log(`VITTA conv=${convId} → resposta ENVIADA: "${botReply.slice(0, 60)}"`);
    await zapiCall('/send-text', 'POST', { phone: `55${phoneNum}`, message: botReply });
    const { rows: [botMsg] } = await query(
      `INSERT INTO mensagens (conversa_id, from_type, type, content, sender_nome)
       VALUES ($1,'bot','text',$2,'Vitta') RETURNING *`,
      [convId, botReply]
    );
    await query("UPDATE conversas SET last_message=$1, last_from='bot', last_message_at=NOW() WHERE id=$2",
      [botReply.slice(0, 100), convId]);
    // Atualiza o cache (a lista do inbox é servida dele) — senão a conversa não
    // sobe pro topo e a prévia fica velha até reiniciar o servidor.
    const cAtual = convoCache.get(convId);
    if (cAtual) cacheUpdate({ ...cAtual, last_message: botReply.slice(0, 100), last_from: 'bot', last_message_at: new Date().toISOString() });
    if (botMsg) { socketEmit('new_message', { convId, message: botMsg, conv }); notifyWaiters(convId, botMsg); }
  }

  // Score de temperatura do lead (não bloqueia a resposta). Se a Vitta acabou de
  // qualificar e passar pra equipe, o lead já foi marcado 'quente' acima.
  if (!toolPassar) classificarLead(convId).catch(() => {});
}

/* ─── MEMÓRIA DO LEAD ──────────────────────────────────────────────────────────
   Perfil persistente do cliente (paciente, idade, responsável, o que já cotou…)
   pra Vitta não tratar quem volta como se fosse a primeira vez. Acumula fatos:
   nunca apaga um dado conhecido por causa de um null vindo da nova extração.  */
function mergeMemoria(antiga = {}, nova = {}) {
  const out = { ...(antiga || {}) };
  for (const k of Object.keys(nova || {})) {
    const v = nova[k];
    if (v === null || v === undefined || v === '' || v === 'null') continue;
    if (Array.isArray(v)) {
      const base = Array.isArray(out[k]) ? out[k] : [];
      out[k] = Array.from(new Set([...base, ...v.map(x => String(x).trim()).filter(Boolean)])).slice(0, 12);
    } else {
      out[k] = typeof v === 'string' ? v.trim().slice(0, 200) : v;
    }
  }
  return out;
}

function formatarMemoria(m) {
  if (!m || typeof m !== 'object') return '';
  const L = [];
  if (m.paciente)        L.push(`Paciente/bebê: ${m.paciente}`);
  if (m.nascimento)      L.push(`Nascimento: ${m.nascimento}`);
  if (m.idade)           L.push(`Idade: ${m.idade}`);
  if (m.responsavel)     L.push(`Responsável: ${m.responsavel}`);
  if (m.endereco)        L.push(`Endereço: ${m.endereco}`);
  if (m.email)           L.push(`E-mail: ${m.email}`);
  if (Array.isArray(m.interesses) && m.interesses.length) L.push(`Interesses: ${m.interesses.join(', ')}`);
  if (m.proposta_enviada) L.push(`Já recebeu proposta: ${m.proposta_enviada}`);
  if (m.preferencias)    L.push(`Preferências: ${m.preferencias}`);
  if (m.observacoes)     L.push(`Observações: ${m.observacoes}`);
  return L.join('\n');
}

/* ─── ANÁLISE DA CONVERSA: score + memória (uma só chamada de IA) ───────────────
   Classifica a temperatura do lead (quente/morno/frio) e extrai/atualiza a
   memória do cliente. Roda após cada resposta da Vitta, sem bloquear o envio.
   Usa IA barata (gpt-4o-mini) com fallback heurístico para o score.          */
async function classificarLead(convId) {
  try {
    const { rows: [conv] } = await query('SELECT memoria FROM conversas WHERE id = $1', [convId]);
    const memoriaAtual = conv?.memoria || {};

    const { rows: histRows } = await query(
      `SELECT from_type, type, content, filename FROM mensagens
       WHERE conversa_id = $1 AND type IN ('text','document') AND from_type <> 'system'
       ORDER BY created_at DESC LIMIT 20`, [convId]
    );
    const hist = histRows.reverse();
    if (!hist.length) return;

    let score = 'morno', motivo = '';
    let memoria = memoriaAtual;

    if (process.env.OPENAI_API_KEY) {
      const resumo = hist.map(m => {
        const quem = m.from_type === 'contact' ? 'Cliente' : 'Vitta';
        const txt = m.type === 'document' ? `[Vitta enviou PDF: ${m.filename || 'proposta'}]` : String(m.content || '').slice(0, 200);
        return `${quem}: ${txt}`;
      }).join('\n');

      const sys = `Você analisa uma conversa de WhatsApp de um lead da Vittalis Saúde (clínica de vacinas e consultas). Responda APENAS JSON:
{"score":"quente|morno|frio","motivo":"até 8 palavras","memoria":{"paciente":null,"nascimento":null,"idade":null,"responsavel":null,"endereco":null,"email":null,"interesses":[],"proposta_enviada":null,"preferencias":null,"observacoes":null}}

TEMPERATURA (score):
- quente: intenção de fechar/agendar AGORA — pede para agendar, confirma horário/pagamento, manda endereço/dados, diz "quero"/"pode marcar", ou engaja logo após a proposta.
- morno: interessado, fazendo perguntas (preço, vacinas, datas), sem decisão.
- frio: vago, "vou pensar", sumiu, ou só cumprimentou.
O último movimento do cliente é o que mais pesa.

MEMÓRIA: preencha SÓ com fatos que o cliente informou ou que a Vitta confirmou na conversa. Use null quando não souber. NÃO invente. "interesses" = vacinas/consultas/planos citados. "proposta_enviada" = o que já foi cotado (ex: "Pacote 2 meses", "Plano completo 0-18m"). "nascimento" no formato YYYY-MM-DD se possível. Memória já conhecida (mantenha e complemente, não contradiga sem motivo): ${JSON.stringify(memoriaAtual)}`;

      const aiData = await openaiMessages({
        model: 'gpt-4o-mini', max_tokens: 260, json: true, system: sys,
        messages: [{ role: 'user', content: resumo }],
      });
      const txt = aiData?.content?.find(c => c.type === 'text')?.text || '';
      try {
        const j = JSON.parse(txt);
        if (['quente', 'morno', 'frio'].includes(j.score)) { score = j.score; motivo = String(j.motivo || '').slice(0, 60); }
        if (j.memoria && typeof j.memoria === 'object') memoria = mergeMemoria(memoriaAtual, j.memoria);
      } catch {}
    } else {
      // Heurística sem IA: score por palavras-chave; memória fica como está
      const all = hist.map(m => String(m.content || '').toLowerCase()).join(' ');
      if (/\bagend|marcar|fechar|quero|confirm|endere[çc]|pix|cart[aã]o|pagar|hoje|amanh[aã]\b/.test(all)) { score = 'quente'; motivo = 'sinais de fechamento'; }
      else if (/\bpre[çc]o|valor|quanto|vacina|consulta|plano|hor[aá]rio\b/.test(all)) { score = 'morno'; motivo = 'tirando dúvidas'; }
      else { score = 'frio'; motivo = 'pouco engajamento'; }
    }

    await query('UPDATE conversas SET lead_score = $1, lead_score_motivo = $2, lead_score_at = NOW(), memoria = $3 WHERE id = $4',
      [score, motivo, JSON.stringify(memoria || {}), convId]);
    const { rows: [c] } = await query('SELECT * FROM conversas WHERE id = $1', [convId]);
    if (c) { cacheUpdate(c); socketEmit('lead_score', { convId, lead_score: score, lead_score_motivo: motivo, memoria: c.memoria }); }
  } catch (e) { console.error('classificarLead erro:', e.message); }
}


// ─── WEBHOOK Z-API (sem JWT — chamado pela Z-API) ─────────────────────────
// GET para teste manual de acessibilidade da rota
r.get('/webhook/zapi', (req, res) => {
  res.json({ ok: true, message: 'Webhook endpoint acessível', method: 'use POST para eventos' });
});
r.post('/webhook/zapi', async (req, res) => {
  res.json({ received: true });
  try {
    const body = req.body;
    // Segurança: só processa webhooks da NOSSA instância Z-API (a Z-API sempre
    // envia o instanceId). Sem isso, qualquer um que soubesse a URL poderia
    // injetar conversas/mensagens falsas no CRM.
    if (process.env.ZAPI_INSTANCE && body?.instanceId !== process.env.ZAPI_INSTANCE) {
      console.warn('Webhook Z-API rejeitado: instanceId ausente ou não confere');
      return;
    }
    logWebhook(body);
    console.log(`ZAPI_WH: ${JSON.stringify(body).slice(0, 300)}`);

    // ── Eventos de conexão/desconexão (vêm do webhook "Ao conectar/desconectar") ──
    const event = body.event || body.type || '';
    if (event === 'connected' || body.connected === true || body.status === 'open') {
      const ph = body.phone || body.connectedPhone || null;
      setZapiConnected(true, ph);
      socketEmit('zapi_status', { connected: true, phone: ph });
      console.log(`✅ Z-API Conectado (webhook): ${ph || 'número não informado'}`);
    }
    if (event === 'disconnected' || body.status === 'close' || body.status === 'disconnected') {
      setZapiConnected(false, null);
      socketEmit('zapi_status', { connected: false });
      console.log('❌ Z-API Desconectado (webhook)');
    }

    // Z-API webhook payload:
    let phone = body.phone;
    if (!phone) return;
    // Ignora TODO callback que não é mensagem recebida (status de entrega,
    // leitura, envio, presença...) — eram eles que viravam "[mensagem]" no chat
    if (body.type && body.type !== 'ReceivedCallback') {
      if (body.type === 'MessageStatusCallback' && (body.ids?.length || body.messageId)) {
        const stIds = body.ids || [body.messageId];
        const st = String(body.status || '').toUpperCase();
        const novo = st.includes('READ') ? 'read' : 'delivered';
        for (const sid of stIds) {
          await query('UPDATE mensagens SET status = $1 WHERE wa_msg_id = $2', [novo, sid]).catch(() => {});
        }
      }
      return;
    }
    // GRUPOS: antes eram descartados. Agora aparecem no inbox (aba Grupos). O BOT
    // nunca responde em grupo (seria spam). Newsletter/status seguem ignorados.
    const isGroupMsg = (body.isGroup === true || body.isGroup === 'true') || String(body.phone || '').includes('@g.us');
    if (body.isNewsletter || body.isStatusReply) return;

    const chatLid = body.chatLid || null;
    const isMe = !!body.isFromMe || !!body.fromMe;
    const msgId = body.messageId || body.zaapId || null;

    // Mensagem APAGADA no WhatsApp (revoke) → marca a mensagem como apagada na
    // thread; NÃO grava "REVOKE" como se fosse texto novo.
    if (String(body.notification || '').toUpperCase().includes('REVOKE') || String(body.type || '') === 'RevokeCallback') {
      const delId = body.referencedMessage?.messageId || body.notificationParameters?.[0] || msgId;
      if (delId) {
        const { rows: [dm] } = await query(
          `UPDATE mensagens SET status='deleted', content='🚫 Mensagem apagada', editada=false
           WHERE wa_msg_id=$1 RETURNING id, conversa_id`, [delId]).catch(() => ({ rows: [] }));
        if (dm) socketEmit('message_updated', { convId: dm.conversa_id, messageId: dm.id, content: '🚫 Mensagem apagada', status: 'deleted' });
      }
      return;
    }

    // WhatsApp LID: algumas mensagens chegam com o telefone em formato @lid
    // (privacidade do WhatsApp, sem número real). Tenta casar pela chatLid → a
    // conversa que já foi criada pelas mensagens com telefone real (mesma chatLid).
    // Vale tanto pra ENVIADAS pelo celular quanto pra RECEBIDAS que venham só com @lid.
    if (!isGroupMsg && String(phone).includes('@lid')) {
      if (chatLid) {
        const { rows: [cLid] } = await query('SELECT contact_id FROM conversas WHERE chat_lid = $1 LIMIT 1', [chatLid]).catch(() => ({ rows: [] }));
        // Usa o telefone COMPLETO do contact_id (com 55) — senão o remoteJid não
        // bate o contact_id existente e a conversa "racha" em duas.
        if (cLid?.contact_id) phone = String(cLid.contact_id).replace('@s.whatsapp.net', '');
        else { console.warn(`SYNC-DROP: @lid sem conversa casada (isMe=${isMe}, chatLid=${chatLid}, msgId=${msgId}) — mensagem não exibida`); return; }
      } else {
        console.warn(`SYNC-DROP: @lid sem chatLid (isMe=${isMe}, phone=${phone}, msgId=${msgId}) — não dá pra casar a conversa`);
        return;                                 // @lid não-resolvível (broadcast/status/recebida sem telefone)
      }
    }
    if (String(phone).includes('broadcast') || String(phone).includes('status')) return;
    const phoneDigits = String(phone).replace(/\D/g, '');
    // Grupos têm id longo (@g.us) — não passam pela regra de telefone normal.
    if (!isGroupMsg && (phoneDigits.length < 10 || phoneDigits.length > 15)) { console.warn(`SYNC-DROP: telefone inválido "${phone}" (isMe=${isMe}, msgId=${msgId})`); return; }

    const senderName = body.senderName || body.chatName || '';
    const profilePic = body.photo || body.senderPhoto || body.profilePicUrl || '';

    if (isMe) {
      // Origem "minha": (a) o VittaHub/bot ENVIOU (já tem registro, ou veio da API)
      // → só confirma a entrega, NÃO duplica; (b) foi DIGITADA no celular pela
      // equipe (fromApi=false, sem registro) → registra como mensagem da equipe e
      // DESLIGA o bot nesta conversa (humano assumiu, o bot não pode interferir).
      if (msgId) {
        const { rows: jaExiste } = await query('SELECT id FROM mensagens WHERE wa_msg_id = $1 LIMIT 1', [msgId]).catch(() => ({ rows: [] }));
        if (jaExiste.length > 0) {
          await query(`UPDATE mensagens SET status = 'delivered' WHERE wa_msg_id = $1`, [msgId]).catch(() => {});
          // Aproveita o eco da msg que ENVIAMOS pra gravar a chatLid na conversa —
          // ajuda a casar as próximas respostas do CELULAR (que chegam só com @lid).
          if (chatLid) await query(
            `UPDATE conversas SET chat_lid = COALESCE(chat_lid, $1)
             WHERE id = (SELECT conversa_id FROM mensagens WHERE wa_msg_id = $2 LIMIT 1)`,
            [chatLid, msgId]).catch(() => {});
          return;
        }
      }
      if (body.fromApi) return; // enviada pelo próprio sistema/bot via API — não duplica nem desliga o bot
      // (b) digitada no celular → segue abaixo, grava como 'me' e desliga o bot
    }

    // Deduplication
    if (msgId) {
      const { rows: exists } = await query('SELECT id FROM mensagens WHERE wa_msg_id = $1 LIMIT 1', [msgId]);
      if (exists.length > 0) return;
    }

    // Extract content — cobre todos os formatos da Z-API
    let content = '[mensagem]', type = 'text', mediaData = null, filename = null;

    // Texto: vários formatos possíveis
    const textMsg = body.text?.message
      || body.buttonsResponseMessage?.message      // clique em botão (menu de boas-vindas)
      || body.buttonReply?.message
      || body.listResponseMessage?.title
      || body.listResponseMessage?.message
      || body.message?.text
      || body.text
      || body.body
      || body.conversation
      || (typeof body.message === 'string' ? body.message : null)
      || body.extendedTextMessage?.text
      || body.notification
      || null;

    if (textMsg && typeof textMsg === 'string') { content = textMsg; type = 'text'; }
    else if (body.image?.imageUrl)     { content = body.image.caption || ''; type = 'image'; mediaData = body.image.imageUrl; }
    else if (body.image?.url)          { content = body.image.caption || ''; type = 'image'; mediaData = body.image.url; }
    else if (body.audio?.audioUrl)     { content = '🎵 Áudio'; type = 'audio'; mediaData = body.audio.audioUrl; }
    else if (body.audio?.url)          { content = '🎵 Áudio'; type = 'audio'; mediaData = body.audio.url; }
    else if (body.video?.videoUrl)     { content = body.video.caption || ''; type = 'video'; mediaData = body.video.videoUrl; }
    else if (body.video?.url)          { content = body.video.caption || ''; type = 'video'; mediaData = body.video.url; }
    else if (body.document?.documentUrl) {
      filename = body.document.fileName || 'Documento';
      content = `📎 ${filename}`; type = 'document'; mediaData = body.document.documentUrl;
    }
    else if (body.sticker?.stickerUrl) { content = ''; type = 'sticker'; mediaData = body.sticker.stickerUrl; }
    else if (body.audio?.audioUrl)     { content = '🎵 Áudio'; type = 'audio'; mediaData = body.audio.audioUrl; }
    else if (body.video?.videoUrl)     { content = body.video.caption || ''; type = 'video'; mediaData = body.video.videoUrl; }
    else if (body.document?.documentUrl) {
      filename = body.document.fileName || body.document.title || 'Documento';
      content = `📎 ${filename}`; type = 'document'; mediaData = body.document.documentUrl;
    }
    else if (body.gif?.gifUrl)         { content = ''; type = 'gif'; mediaData = body.gif.gifUrl; }
    else if (body.location)            { content = `📍 ${body.location.address || `${body.location.latitude||body.location.lat},${body.location.longitude||body.location.lng}`}`; }
    else if (body.contact?.displayName){ content = `👤 ${body.contact.displayName}`; }
    else if (body.reaction?.text || body.reaction?.value) { content = `${body.reaction.text || body.reaction.value} (reação)`; }
    else if (body.pix?.pixKey)         { content = `💰 Pix: ${body.pix.pixKey}`; }
    else {
      // Log payload desconhecido para entender o formato
      console.log('WEBHOOK_CONTEUDO_DESCONHECIDO:', JSON.stringify(body).slice(0, 500));
      ultimoPayloadDesconhecido = { at: new Date().toISOString(), keys: Object.keys(body), body: JSON.stringify(body).slice(0, 800) };
    }

    // Foto de perfil: já vem no campo "photo" do webhook
    let fetchedPic = profilePic && profilePic !== 'null' ? profilePic : null;

    const remoteJid = isGroupMsg ? `${String(phone).replace('@g.us', '')}@g.us` : `${phone}@s.whatsapp.net`;
    const displayPhone = phone.startsWith('55') ? phone.slice(2) : phone;
    // Em mensagem ENVIADA por mim, o senderName é o nome da CLÍNICA, não do
    // cliente — não pode sobrescrever o nome da conversa. Mantém o que já existe.
    // Em grupo, o nome da conversa é o NOME DO GRUPO (chatName).
    const contactName = isGroupMsg ? (body.chatName || body.senderName || 'Grupo')
      : ((!isMe && senderName && senderName.length > 2) ? senderName : displayPhone);
    // Ordena pela hora de RECEBIMENTO no servidor (mesmo relógio das mensagens
    // enviadas pelo VittaHub/bot, que usam NOW()). Usar o "momment" do WhatsApp
    // — que pode vir minutos atrasado por retry/lag — embaralhava a ordem do chat.
    const ts = new Date().toISOString();
    const previewContent = type === 'text' ? content : type === 'sticker' ? '🎭 Sticker' : type === 'gif' ? '🎞️ GIF' : type === 'image' ? '📷 Imagem' : type === 'audio' ? '🎵 Áudio' : type === 'video' ? '🎥 Vídeo' : type === 'document' ? `📎 ${filename}` : content;

    console.log(`ZAPI_MSG: from="${contactName}" phone="${displayPhone}" type="${type}"`);

    // Upsert conversa
    // Eco/callback sem conteúdo reconhecível e sem mídia → ignora (era o "[mensagem]")
    // Conteúdo não reconhecido: se é um eco/callback (sem messageId) → ignora.
    // Se é uma mensagem REAL de um tipo não suportado (enquete, view-once, etc.)
    // → grava um placeholder pra thread não ficar incompleta (a msg não some).
    if (content === '[mensagem]' && !mediaData) {
      if (!msgId) { console.warn(`SYNC-DROP: callback sem conteúdo e sem msgId (phone=${phoneDigits}) — ignorado`); return; }
      content = '[mensagem não suportada neste formato]'; type = 'text';
    }

    // fromMe (digitada no celular) entra como 'me', sem somar não-lidas
    const incUnread = isMe ? 0 : 1;
    const lastFromVal = isMe ? 'me' : 'contact';

    // Ativação do bot na conversa NOVA. Dois interruptores independentes:
    //  • cfg.ativo       = "Bot ativo para TODOS" (fluxo geral / vacina)
    //  • cfg.consultaIA  = "IA de Consultas" (assume sozinha tudo que não é vacina)
    // Se QUALQUER um estiver ligado, a conversa nova nasce ativa pra ser triada —
    // a triagem decide o setor e a IA de consulta assume se for não-vacina.
    const { rows: [cfgIns] } = await query("SELECT valor FROM configuracoes WHERE chave = 'bot'").catch(() => ({ rows: [{}] }));
    const botGeralOn = (cfgIns?.valor?.ativo) !== false;
    const iaConsultasOn = (cfgIns?.valor?.consultaIA) !== false;
    const novoBotAtivo = !isMe && !isGroupMsg && (botGeralOn || iaConsultasOn);

    const { rows: [conv] } = await query(`
      INSERT INTO conversas (channel, contact_name, contact_id, phone, unread, last_message, last_message_at, profile_pic, chat_lid, bot_ativo)
      VALUES ('whatsapp', $1, $2, $3, $7, $4, $5, $6, $9, $10)
      ON CONFLICT (contact_id) DO UPDATE SET
        contact_name = CASE
          WHEN length(EXCLUDED.contact_name) > 5 AND EXCLUDED.contact_name != EXCLUDED.phone
          THEN EXCLUDED.contact_name
          ELSE conversas.contact_name
        END,
        profile_pic = COALESCE(EXCLUDED.profile_pic, conversas.profile_pic),
        chat_lid = COALESCE(EXCLUDED.chat_lid, conversas.chat_lid),
        unread = conversas.unread + $7,
        last_from = $8,
        bot_ativo = CASE WHEN $8 = 'me' THEN false ELSE conversas.bot_ativo END,
        followup_count = CASE WHEN $8 = 'contact' THEN 0 ELSE conversas.followup_count END,
        last_message = EXCLUDED.last_message,
        last_message_at = EXCLUDED.last_message_at
      RETURNING *`,
      [contactName, remoteJid, displayPhone, previewContent, ts, fetchedPic || null, incUnread, lastFromVal, chatLid, novoBotAtivo]
    );

    // Atualiza cache em memória imediatamente
    cacheUpdate(conv);

    // Salva mensagem
    const finalContent = mediaData || content;
    const { rows: [newMsg] } = await query(
      `INSERT INTO mensagens (conversa_id, from_type, type, content, filename, created_at, wa_msg_id, status)
       SELECT $1, $7, $2, $3, $4, $5, $6, $8
       WHERE NOT EXISTS (SELECT 1 FROM mensagens WHERE wa_msg_id = $6 AND $6 IS NOT NULL)
       RETURNING *`,
      [conv.id, type, finalContent, filename, ts, msgId, isMe ? 'me' : 'contact', isMe ? 'delivered' : 'sent']
    );

    // ── Socket.io: entrega instantânea para todos os clientes ──
    if (newMsg) {
      socketEmit('new_message', { convId: conv.id, message: newMsg, conv });
      await query(`SELECT pg_notify('vittahub', $1)`, [
        JSON.stringify({ event:'new_message', convId:conv.id, messageId:newMsg.id, conv })
      ]).catch(() => {});
      notifyWaiters(conv.id, newMsg);
    }

    // Mensagem enviada do celular: já apareceu no VittaHub como 'me'. O bot foi
    // desligado nesta conversa (humano assumiu) — avisa a interface. Não notifica
    // como "nova do cliente" nem aciona o bot.
    if (isMe) {
      const cAtual = convoCache.get(conv.id);
      if (cAtual) cacheUpdate({ ...cAtual, bot_ativo: false });
      socketEmit('bot_status', { convId: conv.id, bot_ativo: false });
      return;
    }


    await query(
      `INSERT INTO notificacoes (tipo, titulo, texto, conv_id) VALUES ('mensagem',$1,$2,$3)`,
      [contactName, content.slice(0, 80), conv.id]
    ).catch(() => {});

    // ─── TRANSCRIÇÃO DE ÁUDIO via Whisper (OpenAI) ────────────────────────────
    // Transcrição via Whisper (aceita ogg/opus direto).
    const isTextoReal = type === 'text' && content && content !== '[mensagem]' && !content.startsWith('[') && content.trim().length > 0;
    let textoParaIA = isTextoReal ? content : null;
    if (conv.bot_ativo && type === 'audio' && mediaData && process.env.OPENAI_API_KEY) {
      try {
        const { default: fetch } = await import('node-fetch');
        // Baixa o áudio (URLs Z-API são públicas)
        const audioResp = await fetch(mediaData);
        const audioBuf = Buffer.from(await audioResp.arrayBuffer());
        console.log(`ÁUDIO p/ Whisper: ${audioBuf.length} bytes, mime=${body.audio?.mimeType}`);

        // Monta multipart/form-data manualmente para o Whisper
        const FormData = (await import('form-data')).default;
        const form = new FormData();
        form.append('file', audioBuf, { filename: 'audio.ogg', contentType: 'audio/ogg' });
        form.append('model', 'whisper-1');
        form.append('language', 'pt');

        const transResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            ...form.getHeaders(),
          },
          body: form,
        });
        const transData = await transResp.json();
        ultimoAudioDebug = {
          at: new Date().toISOString(),
          tamanho: audioBuf.length,
          erro: transData.error ? JSON.stringify(transData.error) : null,
          transcricao: transData.text?.slice(0, 200) || null,
        };
        if (transData.text && transData.text.trim().length > 1) {
          textoParaIA = transData.text.trim();
          await query('UPDATE mensagens SET content = $1 WHERE id = $2',
            [`🎵 "${textoParaIA}"`, newMsg?.id]).catch(() => {});
          if (newMsg) socketEmit('message_updated', { convId: conv.id, messageId: newMsg.id, content: `🎵 "${textoParaIA}"` });
          console.log('ÁUDIO transcrito (Whisper):', textoParaIA.slice(0, 80));
        } else if (transData.error) {
          console.error('WHISPER ERRO:', JSON.stringify(transData.error));
        }
      } catch (e) { console.error('Erro Whisper:', e.message); ultimoAudioDebug = { erro: e.message }; }
    } else if (conv.bot_ativo && type === 'audio' && mediaData && !process.env.OPENAI_API_KEY) {
      console.log('ÁUDIO recebido mas OPENAI_API_KEY não configurada — transcrição desativada');
    }

    // ─── VITTA — IA CONVERSACIONAL COM CLAUDE ─────────────────────────────────
    // Responde a texto real OU áudio transcrito.
    // DEBOUNCE: mensagens em sequência são agregadas e a Vitta responde UMA
    // única vez lendo o histórico completo — corrige as respostas triplicadas
    // que se contradiziam e re-perguntavam o que o cliente já tinha dito.
    // ── REABERTURA AUTOMÁTICA: menu volta após 24h de conversa parada ─────────
    // Regras da gestão: só reabre se NÃO houver atendimento ativo (equipe
    // respondeu nas últimas 24h) e se a última triagem foi há 24h ou mais.
    // Interruptor GLOBAL do bot (só master liga/desliga em Configurações).
    // Ele controla apenas a AUTO-REABERTURA (o bot voltar sozinho após 24h).
    // A RESPOSTA em si é controlada pelo bot_ativo de CADA conversa (botão BOT),
    // então o master pode ligar/desligar o bot conversa a conversa mesmo com o
    // global desligado — e nada se religa sozinho.
    // Em GRUPO o bot nunca atua (nem reabertura, nem triagem, nem IA). A mensagem
    // já foi salva e exibida acima; encerra aqui.
    if (isGroupMsg) return;

    const { rows: [cfgBotRow] } = await query("SELECT valor FROM configuracoes WHERE chave = 'bot'").catch(() => ({ rows: [] }));
    const botGlobalAtivo = cfgBotRow?.valor?.ativo !== false;

    // Auto-reabertura: vale quando o bot geral está ligado OU quando só a IA de
    // Consultas está ligada (aí a IA reassume a conversa sozinha após 24h paradas).
    // iaConsultasOn já foi calculado lá em cima no upsert da conversa.
    const precisaReabrir = (botGlobalAtivo || iaConsultasOn) && textoParaIA &&
      (!conv.triagem_ts || (Date.now() - new Date(conv.triagem_ts).getTime()) >= 24 * 3600 * 1000);
    console.log(`TRIAGEM conv=${conv.id} reabrir=${!!precisaReabrir} triagem_ts=${conv.triagem_ts || 'null'} bot=${conv.bot_ativo} setor=${conv.setor || '-'} menu_enviado=${conv.menu_enviado}`);
    if (precisaReabrir) {
      const { rows: [ativo] } = await query(
        `SELECT 1 FROM mensagens WHERE conversa_id = $1 AND from_type = 'me'
         AND created_at > NOW() - interval '24 hours' LIMIT 1`, [conv.id]).catch(() => ({ rows: [] }));
      console.log(`TRIAGEM conv=${conv.id} atendimentoAtivo24h=${!!ativo}`);
      if (!ativo) {
        await query(
          `UPDATE conversas SET bot_ativo = true, menu_enviado = false, triagem_ts = NOW(), captura_etapa = NULL WHERE id = $1`,
          [conv.id]).catch(() => {});
        conv.bot_ativo = true; conv.menu_enviado = false; conv.captura_etapa = null;
        const cachedT = convoCache.get(conv.id);
        if (cachedT) cacheUpdate({ ...cachedT, bot_ativo: true });
        socketEmit('bot_status', { convId: conv.id, bot_ativo: true });
      } else {
        // atendimento ativo: empurra a janela pra não reavaliar a cada mensagem
        await query(`UPDATE conversas SET triagem_ts = NOW() WHERE id = $1`, [conv.id]).catch(() => {});
      }
    }

    // ── CAPTURA AUTOMÁTICA: nome → paciente → nascimento (salva no CRM) ──────
    // Quem manda é o bot_ativo DA CONVERSA. O geral (botGlobalAtivo) controla só o
    // AUTO-religar (precisaReabrir acima) — não barra conversa ligada na mão.
    if (conv.bot_ativo && textoParaIA && conv.captura_etapa) {
      const tratado = await capturaDados(conv, textoParaIA, phoneDigits.startsWith('55') ? phoneDigits.slice(2) : phoneDigits);
      if (tratado) return; // resposta do webhook já foi enviada lá no início
    }

    if (conv.bot_ativo && textoParaIA) {
      // Triagem de setor primeiro (menu inicial / rodízio); se consumiu, para aqui
      const convAtual = (await query('SELECT * FROM conversas WHERE id = $1', [conv.id])).rows[0] || conv;
      const consumido = await triagemSetor(convAtual, textoParaIA, phoneDigits.startsWith('55') ? phoneDigits.slice(2) : phoneDigits);
      // IA GENERATIVA: ligada SÓ para consultas/terapias (atendimento especializado
      // multidisciplinar, com prompt acolhedor próprio). Vacinas seguem o fluxo
      // determinístico (menu/sorteio/captura) — a IA de vacina foi desligada pela
      // gestão por queimar leads. O liga-desliga de consultas é cfg.consultaIA.
      const vaiResponder = !consumido && convAtual.setor && convAtual.setor !== 'vacinas';
      console.log(`TRIAGEM conv=${conv.id} consumido=${consumido} setor=${convAtual.setor || '-'} → agendarVitta=${vaiResponder}`);
      if (vaiResponder) agendarVitta(conv.id);
    }
  } catch (err) { console.error('ZAPI_ERROR:', err.message); }
});

// ─── META WHATSAPP CLOUD API — WEBHOOK ───────────────────────────────────────
//
// GET /api/inbox/webhook/meta  → verificação do webhook pela Meta
// POST /api/inbox/webhook/meta → mensagens/status recebidos
//
// Variáveis de ambiente necessárias no Railway:
//   META_VERIFY_TOKEN   = string aleatória que você define ao registrar o webhook
//   META_ACCESS_TOKEN   = token de acesso permanente (System User) ou temporário
//   META_PHONE_NUMBER_ID = Phone Number ID do painel Meta for Developers

// Função helper para enviar mensagem pela Meta Cloud API
async function metaSend(phoneNumberId, accessToken, to, type, payload) {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const body = { messaging_product: 'whatsapp', to, type, ...payload };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
  return data;
}

// GET: Verificação do webhook (Meta chama isso quando você registra o URL)
r.get('/webhook/meta', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.META_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ Webhook Meta verificado');
    return res.status(200).send(challenge);
  }
  console.error('❌ Webhook Meta: token inválido');
  res.sendStatus(403);
});

// POST: Mensagens e eventos recebidos
r.post('/webhook/meta', async (req, res) => {
  // Responde 200 IMEDIATAMENTE — Meta retenta se demorar > 5s
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'messages') continue;
        const val = change.value;

        // ── Atualização de status (sent/delivered/read) ───────────────────
        for (const status of (val.statuses || [])) {
          const statusMap = { sent:'sent', delivered:'delivered', read:'read', failed:'failed' };
          const s = statusMap[status.status];
          if (s && status.id) {
            await query('UPDATE mensagens SET status=$1 WHERE wa_msg_id=$2', [s, status.id]).catch(() => {});
          }
        }

        // ── Mensagens recebidas ───────────────────────────────────────────
        for (const msg of (val.messages || [])) {
          const from     = msg.from;           // ex: "5598xxxxxxxx"
          const msgId    = msg.id;             // wamid.xxx
          const ts       = new Date(parseInt(msg.timestamp) * 1000);
          const contact  = (val.contacts || []).find(c => c.wa_id === from);
          const name     = contact?.profile?.name || from;

          // Determina tipo e conteúdo
          let type = 'text', content = '', mediaData = null, filename = null;

          if (msg.type === 'text') {
            type    = 'text';
            content = msg.text?.body || '';
          } else if (msg.type === 'image') {
            type    = 'image';
            content = msg.image?.url || msg.image?.id || '';
            // A Meta retorna media_id; buscar URL via Graph API
            if (msg.image?.id && !content.startsWith('http')) {
              try {
                const AT = process.env.META_ACCESS_TOKEN;
                const mr = await fetch(`https://graph.facebook.com/v21.0/${msg.image.id}`, { headers:{ Authorization:`Bearer ${AT}` } });
                const md = await mr.json();
                content = md.url || content;
              } catch {}
            }
          } else if (msg.type === 'audio') {
            type = 'audio';
            if (msg.audio?.id) {
              try {
                const AT = process.env.META_ACCESS_TOKEN;
                const mr = await fetch(`https://graph.facebook.com/v21.0/${msg.audio.id}`, { headers:{ Authorization:`Bearer ${AT}` } });
                const md = await mr.json();
                content = md.url || '';
              } catch {}
            }
          } else if (msg.type === 'video') {
            type = 'video';
            if (msg.video?.id) {
              try {
                const AT = process.env.META_ACCESS_TOKEN;
                const mr = await fetch(`https://graph.facebook.com/v21.0/${msg.video.id}`, { headers:{ Authorization:`Bearer ${AT}` } });
                const md = await mr.json();
                content = md.url || '';
              } catch {}
            }
          } else if (msg.type === 'document') {
            type     = 'document';
            filename = msg.document?.filename || 'Documento';
            if (msg.document?.id) {
              try {
                const AT = process.env.META_ACCESS_TOKEN;
                const mr = await fetch(`https://graph.facebook.com/v21.0/${msg.document.id}`, { headers:{ Authorization:`Bearer ${AT}` } });
                const md = await mr.json();
                content = md.url || '';
              } catch {}
            }
          } else if (msg.type === 'sticker') {
            type = 'image'; content = msg.sticker?.url || '';
          } else if (msg.type === 'location') {
            type    = 'text';
            content = `📍 Localização: https://maps.google.com/?q=${msg.location?.latitude},${msg.location?.longitude}`;
          } else if (msg.type === 'reaction') {
            continue; // ignorar reações
          } else {
            type = 'text'; content = `[${msg.type}]`;
          }

          if (!content && !mediaData) continue;

          // Upsert da conversa
          const displayPhone = from.replace(/^\+/, '').replace(/^55/, '');
          const contactId    = `${from}@s.whatsapp.net`;
          const profilePic   = null; // Meta não fornece foto via webhook

          const { rows: [conv] } = await query(`
            INSERT INTO conversas (contact_id, phone, contact_name, channel, profile_pic, last_message, last_message_at, unread, status_atend, provider)
            VALUES ($1, $2, $3, 'whatsapp', $4, $5, $6, 1, 'aberto', 'meta')
            ON CONFLICT (contact_id) DO UPDATE SET
              contact_name    = COALESCE(NULLIF(EXCLUDED.contact_name, conversas.contact_id), conversas.contact_name),
              last_message    = EXCLUDED.last_message,
              last_message_at = EXCLUDED.last_message_at,
              unread          = conversas.unread + 1,
              provider        = 'meta'
            RETURNING *`,
            [contactId, displayPhone, name, profilePic,
             type==='text' ? content.slice(0,100) : `[${type}]`,
             ts]
          );

          // Inserção deduplicada da mensagem
          const { rows: [newMsg] } = await query(`
            INSERT INTO mensagens (conversa_id, from_type, type, content, filename, created_at, wa_msg_id)
            SELECT $1, 'contact', $2, $3, $4, $5, $6
            WHERE NOT EXISTS (SELECT 1 FROM mensagens WHERE wa_msg_id = $6 AND $6 IS NOT NULL)
            RETURNING *`,
            [conv.id, type, content, filename, ts, msgId]
          );

          if (newMsg) {
            // Entrega em tempo real: PG NOTIFY → WebSocket + fallbacks
            await query(`SELECT pg_notify('vittahub', $1)`, [
              JSON.stringify({ event:'new_message', convId:conv.id, messageId:newMsg.id, conv })
            ]).catch(() => {});
            broadcast('new_message', { convId:conv.id, message:newMsg, conv });
            notifyWaiters(conv.id, newMsg);
            console.log(`META_MSG from ${from}: ${type} | conv ${conv.id}`);
          }
        }
      }
    }
  } catch (err) { console.error('META_WEBHOOK_ERROR:', err.message); }
});

// ─── META: enviar mensagem (usado pelo endpoint /send quando provider = 'meta') ─
// Exportado como função para uso interno — ver endpoint /conversations/:id/send
export async function sendViaMeta(phone, type, content) {
  const AT  = process.env.META_ACCESS_TOKEN;
  const PID = process.env.META_PHONE_NUMBER_ID;
  if (!AT || !PID) throw new Error('META_ACCESS_TOKEN ou META_PHONE_NUMBER_ID não configurados');
  const to = phone.startsWith('55') ? phone : `55${phone}`;
  if (type === 'text') {
    return metaSend(PID, AT, to, 'text', { text:{ body:content } });
  }
  // Para mídia: envia link
  return metaSend(PID, AT, to, type, { [type]:{ link:content } });
}

// ─── DAQUI PRA BAIXO, TUDO EXIGE LOGIN ───────────────────────────────────────
// O auth subiu para ANTES dos endpoints de debug/teste: antes eles ficavam
// PÚBLICOS (protegidos só por uma chave fixa "vt24" na URL, e o debug-zapi sem
// chave nenhuma), expondo dados de clientes e permitindo enviar/reconfigurar.
r.use(auth);

// Keep Evolution webhook for backward compat
// ─── DEBUG: testar IA Claude (somente logado) ───────────────────────────────
r.get('/whatsapp/test-ia', masterOnly, async (req, res) => {
  if (req.query.k !== 'vt24') return res.status(403).json({ error: 'key inválida' });
  if (!process.env.OPENAI_API_KEY) return res.json({ error: 'OPENAI_API_KEY não configurada' });
  try {
    const { default: fetch } = await import('node-fetch');
    const r2 = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Diga apenas: IA funcionando!' }],
      }),
    });
    const d = await r2.json();
    res.json({
      http_status: r2.status,
      resposta: d.choices?.[0]?.message?.content || null,
      erro: d.error || null,
      key_configurada: !!process.env.OPENAI_API_KEY,
    });
  } catch (e) { res.json({ error: e.message }); }
});

// ─── DIAGNÓSTICO DO BOT: por que ele (não) responde? (master) ────────────────
// Roda todos os portões em ordem e devolve um veredito em português claro.
// Use ?convId=<id> pra checar uma conversa específica (ex: a que está muda).
r.get('/whatsapp/diag-bot', masterOnly, async (req, res) => {
  try {
    const out = { passos: [], veredito: null };
    const add = (ok, msg) => out.passos.push({ ok, msg });

    // 1) Chave da OpenAI — testa de verdade (1 chamada curtinha)
    if (!process.env.OPENAI_API_KEY) {
      add(false, 'OPENAI_API_KEY NÃO está configurada no Railway.');
    } else {
      try {
        const { default: fetch } = await import('node-fetch');
        const r2 = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 5, messages: [{ role: 'user', content: 'ok' }] }),
        });
        const d = await r2.json();
        if (r2.ok && d.choices) add(true, 'OpenAI respondeu OK — a chave está válida e com crédito.');
        else add(false, `OpenAI RECUSOU (HTTP ${r2.status}): ${d.error?.message || d.error?.code || 'erro'}. ➜ Provável chave inválida/revogada ou sem crédito. Atualize a OPENAI_API_KEY no Railway.`);
      } catch (e) { add(false, `Falha ao falar com a OpenAI: ${e.message}`); }
    }

    // 2) Z-API conectada (sem ela o bot não consegue ENVIAR a resposta)
    add(zapiOk(), zapiOk() ? 'Z-API configurada (consegue enviar mensagens).' : 'Z-API NÃO configurada — o bot não consegue enviar a resposta no WhatsApp.');

    // 3) Config geral do bot
    const { rows: [cfgRow] } = await query("SELECT valor FROM configuracoes WHERE chave = 'bot'").catch(() => ({ rows: [{}] }));
    const cfg = cfgRow?.valor || {};
    const geralOn = cfg.ativo !== false;
    const consultaOn = cfg.consultaIA !== false;
    // Com a IA de Consultas ligada, consultas/terapias respondem MESMO com o geral
    // off — então o geral off só não é problema se a IA de Consultas estiver on.
    add(geralOn || consultaOn, geralOn
      ? 'Bot geral LIGADO (vacina + tudo responde).'
      : consultaOn
        ? 'Bot geral DESLIGADO, mas IA de Consultas LIGADA → consultas/terapias respondem; vacina vai pra equipe.'
        : 'Bot geral DESLIGADO e IA de Consultas DESLIGADA → ninguém responde. Ligue ao menos um.');
    add(consultaOn, consultaOn
      ? 'IA de Consultas LIGADA (atende consultas/terapias sozinha).'
      : 'IA de Consultas DESLIGADA — conversas de consulta/terapia não respondem.');

    // 4) Conversa específica (?convId) OU a última que está esperando resposta
    let alvo = null;
    if (req.query.convId) {
      const { rows: [c] } = await query('SELECT * FROM conversas WHERE id = $1', [req.query.convId]);
      alvo = c || null;
      if (!c) add(false, `Conversa ${req.query.convId} não encontrada.`);
    } else {
      const { rows: [c] } = await query(
        "SELECT * FROM conversas WHERE last_from='contact' ORDER BY last_message_at DESC LIMIT 1").catch(() => ({ rows: [] }));
      alvo = c || null;
    }
    if (alvo) {
      const c = alvo;
      out.conversa = { id: c.id, nome: c.contact_name, setor: c.setor, bot_ativo: c.bot_ativo, menu_enviado: c.menu_enviado };
      const ehConsulta = !!c.setor && c.setor !== 'vacinas';
      add(true, `Conversa analisada: "${c.contact_name || c.phone}" · setor=${c.setor || '(sem setor)'} · ${ehConsulta ? 'IA de consulta' : c.setor === 'vacinas' ? 'vacina (sem IA)' : 'aguardando triagem'}.`);
      add(!!c.bot_ativo, c.bot_ativo ? 'Está com "Bot ON".' : 'Está com "Bot OFF" — ligue o botão BOT na conversa.');
      const { rows: [last] } = await query("SELECT from_type FROM mensagens WHERE conversa_id=$1 AND type IN ('text','document') AND from_type<>'system' ORDER BY created_at DESC LIMIT 1", [c.id]).catch(() => ({ rows: [{}] }));
      add(last?.from_type === 'contact', last?.from_type === 'contact'
        ? 'A última mensagem é do cliente (o bot responderia).'
        : `A última mensagem é '${last?.from_type || 'nenhuma'}' — o bot só responde quando a última é do cliente (humano assumiu?).`);
    }

    const falhas = out.passos.filter(p => !p.ok).map(p => p.msg);
    out.versao_backend = '2026-06-18b · IA-consultas-dedicada (geral-off NÃO bloqueia consulta)';
    out.veredito = falhas.length
      ? `Encontrei ${falhas.length} ponto(s) de atenção: ` + falhas.join(' | ')
      : 'Tudo certo — o bot deveria responder. Se não responder, o deploy do backend pode estar atrasado (confira a versao_backend abaixo) ou me chame pros logs.';
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DEBUG: testar POST no próprio webhook (via ?k=vt24) ─────────────────────
r.get('/whatsapp/test-post', async (req, res) => {
  if (req.query.k !== 'vt24') return res.status(403).json({ error: 'key inválida' });
  try {
    const { default: fetch } = await import('node-fetch');
    const url = 'https://vittahub-backend-production.up.railway.app/api/inbox/webhook/zapi';
    const r2 = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true, phone: '5598999999999', text: { message: 'teste POST' } }),
    });
    const body = await r2.text();
    res.json({
      post_status: r2.status,
      post_body: body.slice(0, 200),
      post_ok: r2.status === 200,
    });
  } catch (e) { res.json({ error: e.message }); }
});

// ─── DEBUG: enviar mensagem de teste e checar webhook (via ?k=vt24) ──────────
r.get('/whatsapp/test-send', masterOnly, async (req, res) => {
  if (req.query.k !== 'vt24') return res.status(403).json({ error: 'key inválida' });
  if (!zapiOk()) return res.json({ error: 'Z-API não configurada' });
  try {
    const phone = req.query.phone || '559888278736'; // número do Miécio
    const before = lastWebhooks.length;
    // Envia mensagem de teste
    const r2 = await zapiCall('/send-text', 'POST', { phone, message: 'Teste webhook VittaHub ' + new Date().toLocaleTimeString() });
    const sendResult = await r2?.text() || '';
    // Aguarda 3s para o webhook "ao enviar" chegar
    await new Promise(r => setTimeout(r, 3000));
    res.json({
      enviou: { status: r2?.status, body: sendResult.slice(0, 200) },
      webhooks_antes: before,
      webhooks_depois: lastWebhooks.length,
      recebeu_webhook: lastWebhooks.length > before,
      ultimos: lastWebhooks.slice(0, 3),
    });
  } catch (e) { res.json({ error: e.message }); }
});

// ─── DEBUG: forçar configuração de webhooks e ver resultado (via ?k=vt24) ────
r.get('/whatsapp/force-webhooks', masterOnly, async (req, res) => {
  if (req.query.k !== 'vt24') return res.status(403).json({ error: 'key inválida' });
  if (!zapiOk()) return res.json({ error: 'Z-API não configurada' });
  const webhookUrl = 'https://vittahub-backend-production.up.railway.app/api/inbox/webhook/zapi';
  const results = {};
  const endpoints = [
    'update-webhook-received',
    'update-webhook-delivery',
    'update-webhook-received-delivery',
    'update-webhook-message-status',
    'update-webhook-connected',
    'update-webhook-disconnected',
  ];
  for (const ep of endpoints) {
    try {
      const r2 = await zapiCall(`/${ep}`, 'PUT', { value: webhookUrl });
      const txt = await r2?.text().catch(() => '');
      results[ep] = { status: r2?.status, body: txt.slice(0, 100) };
    } catch (e) { results[ep] = { error: e.message }; }
  }
  res.json({ webhookUrl, results });
});

// ─── DEBUG: ver resposta raw do Z-API (acesso via ?k=vt24) ───────────────────
r.get('/whatsapp/debug-raw', async (req, res) => {
  if (req.query.k !== 'vt24') return res.status(403).json({ error: 'key inválida' });
  if (!zapiOk()) return res.json({ error: 'Z-API não configurada', zapiOk: false });
  try {
    // Status da instância
    const rS = await zapiCall('/status', 'GET');
    const statusBody = await rS?.text().catch(() => '');

    // Device info
    const rD = await zapiCall('/device', 'GET');
    const deviceBody = await rD?.text().catch(() => '');

    res.json({
      backend_url: process.env.BACKEND_URL,
      webhook_esperado: 'https://vittahub-backend-production.up.railway.app/api/inbox/webhook/zapi',
      zapi_status: { http: rS?.status, body: statusBody.slice(0, 300) },
      zapi_device: { http: rD?.status, body: deviceBody.slice(0, 300) },
      ultimo_payload_desconhecido: ultimoPayloadDesconhecido,
      ultimo_audio_debug: ultimoAudioDebug,
      ultimo_proposta_debug: ultimoPropostaDebug,
      ultimos_webhooks_recebidos: lastWebhooks,
    });
  } catch (e) { res.json({ error: e.message }); }
});

// ─── DEBUG: ver resposta raw do Z-API /chats (público — remover após debug) ───
r.get('/whatsapp/debug-zapi', masterOnly, async (req, res) => {
  if (!zapiOk()) return res.json({ error: 'Z-API não configurada', zapiOk: false });
  try {
    const r2 = await zapiCall('/chats?page=1&pageSize=3', 'GET');
    const status = r2?.status;
    const text = await r2?.text() || '{}';
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    res.json({
      zapi_status: status,
      response_type: Array.isArray(parsed) ? 'array' : typeof parsed,
      response_keys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : [],
      first_item: Array.isArray(parsed) ? parsed[0] : (parsed?.chats?.[0] || parsed?.data?.[0] || null),
      raw_preview: text.slice(0, 1000)
    });
  } catch (e) { res.json({ error: e.message }); }
});

// ─── DEBUG: ver resposta crua de preços do VittaSys (via ?k=vt24) ────────────
r.get('/proposta/test-precos', async (req, res) => {
  if (req.query.k !== 'vt24') return res.status(403).json({ error: 'key inválida' });
  try {
    const { default: fetch } = await import('node-fetch');
    const url = `${VITTASYS_URL()}/api/proposta/precos`;
    const r2 = await fetch(url, {
      headers: { 'x-vittalis-key': process.env.VITTAHUB_API_KEY || '' },
      signal: AbortSignal.timeout(8000),
    });
    const body = await r2.text();
    res.json({
      url_chamada: url,
      vittahub_key_configurada: !!process.env.VITTAHUB_API_KEY,
      vittasys_url: VITTASYS_URL(),
      http_status: r2.status,
      resposta: body.slice(0, 600),
    });
  } catch (e) { res.json({ error: e.message }); }
});

// ─── DEBUG: testar ENVIO completo de proposta ───────────────────────────────
r.get('/proposta/test-envio', async (req, res) => {
  if (req.query.k !== 'vt24') return res.status(403).json({ error: 'key inválida' });
  const phone = req.query.phone || '559888278736';
  try {
    const precos = await getPrecosVittaSys();
    const influ = precos.find(p => p.nome.toLowerCase().includes('influenza')) || { nome:'Influenza', avista:170, credito:180, parcelas:1 };
    const t0 = Date.now();
    const pdfBuf = await gerarPropostaPDF({
      nomeCliente: 'Teste Envio', template: 'adulto', pacoteNome: 'Teste',
      vacinas: [influ], desconto: 0, parcelas: 1,
    });
    const t1 = Date.now();
    const b64 = pdfBuf.toString('base64');
    let ph = phone.replace(/\D/g, '');
    if (ph.startsWith('55') && ph.length >= 12) ph = ph.slice(2);
    const zr = await enviarPDFZapi(`55${ph}`, b64, 'Proposta-Teste.pdf');
    const zrBody = await zr?.text().catch(() => '');
    res.json({
      pdf_bytes: pdfBuf.length,
      pdf_base64_kb: Math.round(b64.length / 1024),
      tempo_geracao_ms: t1 - t0,
      precos_carregados: precos.length,
      envio_status: zr?.status,
      envio_resposta: zrBody.slice(0, 300),
      phone_usado: `55${ph}`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack?.slice(0, 400) });
  }
});

// ─── DEBUG: testar geração de PLANO vacinal (via ?k=vt24&plano=plano_0_a_6_meses) ──
r.get('/proposta/test-plano', async (req, res) => {
  if (req.query.k !== 'vt24') return res.status(403).json({ error: 'key inválida' });
  try {
    const planoId = req.query.plano || 'plano_completo_0_a_18_meses';
    const pdfBuf = await gerarPlanoPDF({ planoId });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="plano.pdf"');
    res.send(pdfBuf);
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack?.slice(0, 400) });
  }
});

// ─── DEBUG: testar geração de PDF da proposta (via ?k=vt24) ──────────────────
r.get('/proposta/test-pdf', async (req, res) => {
  if (req.query.k !== 'vt24') return res.status(403).json({ error: 'key inválida' });
  try {
    const pdfBuf = await gerarPropostaPDF({
      nomeCliente: 'Teste Vittalis',
      template: 'adulto',
      pacoteNome: 'Teste',
      vacinas: [{ nome: 'Influenza', avista: 170, credito: 180, parcelas: 1 }],
      desconto: 0, parcelas: 1,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="teste.pdf"');
    res.send(pdfBuf);
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack?.slice(0, 400) });
  }
});

// (auth já aplicado acima, antes do bloco de debug — não repetir)

// ─── POLL: conversas atualizadas — servido do CACHE (zero DB query) ──────────
r.get('/conversations/updates', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache');
  const since = req.query.since;
  if (!since) return res.json({ data: [] });
  const updated = cacheGetUpdatedSince(since, req.user);
  res.json({ data: updated });
});

// ─── LISTAGEM de conversas — servido do CACHE (zero DB query na maioria) ─────
// ─── BATCH: carregar fotos de perfil via Z-API ────────────────────────────────
r.post('/conversations/load-photos', async (req, res) => {
  try {
    if (!zapiOk()) return res.json({ ok: false, updated: 0, error: 'Z-API não configurada' });
    const { rows } = await query(
      `SELECT id, phone FROM conversas
       WHERE (profile_pic IS NULL OR profile_pic = '')
       AND phone IS NOT NULL
       ORDER BY last_message_at DESC LIMIT 50`
    );
    let updated = 0, semFoto = 0;
    for (const conv of rows) {
      try {
        let phone = conv.phone?.replace(/\D/g, '') || '';
        if (!phone || phone.length < 8) continue;
        if (phone.startsWith('55') && phone.length >= 12) phone = phone.slice(2);
        const fullPhone = `55${phone}`;

        // Endpoint /contacts/{phone} retorna imgUrl (campo correto)
        const r2 = await zapiCall(`/contacts/${fullPhone}`, 'GET');
        if (r2?.ok) {
          const text = await r2.text().catch(() => '{}');
          let pic = null;
          try {
            const d = JSON.parse(text);
            pic = d.imgUrl || d.profilePic || d.image || null;
          } catch {}
          if (pic && pic !== 'null' && pic.startsWith('http')) {
            await query('UPDATE conversas SET profile_pic = $1 WHERE id = $2', [pic, conv.id]);
            const cached = convoCache.get(conv.id);
            if (cached) cacheUpdate({ ...cached, profile_pic: pic });
            updated++;
          } else {
            semFoto++;
          }
        }
        await new Promise(r => setTimeout(r, 200));
      } catch {}
    }
    res.json({
      ok: true,
      updated,
      total: rows.length,
      message: updated > 0
        ? `${updated} fotos carregadas. ${semFoto} contatos não têm foto pública (privacidade do WhatsApp deles).`
        : `Nenhuma foto disponível. Os contatos têm foto de perfil restrita a contatos (privacidade do WhatsApp).`
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/conversations', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache');
  // Busca estendida: com 3+ caracteres, procura também no CONTEÚDO das
  // mensagens e no NOME de documentos (índice trigram — não pesa o banco)
  let extraIds = null;
  const termo = String(req.query.search || '').trim();
  if (termo.length >= 3) {
    try {
      const { rows } = await query(
        `SELECT DISTINCT conversa_id FROM mensagens
         WHERE (type = 'text' AND content ILIKE $1 AND length(content) < 2000)
            OR (filename IS NOT NULL AND filename ILIKE $1)
         LIMIT 60`, [`%${termo}%`]);
      extraIds = new Set(rows.map(r2 => r2.conversa_id));
    } catch { extraIds = null; }
  }
  if (!cacheReady) {
    // Cache ainda não carregou — cai para o banco
    try {
      const { channel, search, page = 1, limit = 50, unread_only } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const conditions = [];
      const params = [];
      let pi = 1;
      if (channel && channel !== 'all') { conditions.push(`c.channel = $${pi++}`); params.push(channel); }
      if (unread_only === 'true') conditions.push(`c.unread > 0`);
      if (req.query.classificacao && req.query.classificacao !== 'all') {
        conditions.push(`c.classificacao = $${pi++}`); params.push(req.query.classificacao);
      } else if (req.query.categoria) { conditions.push(`c.categoria = $${pi++}`); params.push(req.query.categoria); }
      else conditions.push(`c.categoria IS NULL`);
      // Acesso por setor (rede de segurança na janela de boot, antes do cache):
      // mesma precedência do cache — o setor da CONVERSA manda; só usa o do
      // responsável quando a conversa não tem setor.
      if (req.user && req.user.role !== 'master' && req.user.setor) {
        const grupoVac = `COALESCE(c.setor, (SELECT u2.setor FROM usuarios u2 WHERE u2.id = c.responsavel_id))`;
        conditions.push(req.user.setor === 'vacinas'
          ? `(${grupoVac} = 'vacinas' OR ${grupoVac} IS NULL)`
          : `(${grupoVac} <> 'vacinas' OR ${grupoVac} IS NULL)`);
      }
      if (search) {
        conditions.push(`(unaccent(lower(c.contact_name)) ILIKE unaccent(lower($${pi})) OR c.phone ILIKE $${pi})`);
        params.push(`%${search}%`); pi++;
      }
      // Carteira individual: minhas (responsável = eu) ou de um atendente específico
      if (req.query.minhas === 'true' && req.user) { conditions.push(`c.responsavel_id = $${pi++}`); params.push(req.user.id); }
      else if (req.query.responsavel && req.query.responsavel !== 'all') { conditions.push(`c.responsavel_id = $${pi++}`); params.push(req.query.responsavel); }
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const countRes = await query(`SELECT COUNT(*) FROM conversas c ${where}`, params);
      const total = parseInt(countRes.rows[0].count);
      const dataRes = await query(`SELECT c.* FROM conversas c ${where} ORDER BY c.last_message_at DESC LIMIT $${pi} OFFSET $${pi+1}`, [...params, parseInt(limit), offset]);
      return res.json({ data: dataRes.rows, total, page: parseInt(page) });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }
  const result = cacheGetList({ ...req.query, extraIds, viewer: req.user });
  // Contadores dos chips (Todas/Minhas/Não lidas/Grupos) — direto do cache, custo zero.
  // Respeita o acesso por setor: cada um só conta o que pode ver. E não conta quem
  // foi movido pra uma pasta (Fidelidade/Banco), igual à lista.
  const tudo = Array.from(convoCache.values()).filter(c => !c.categoria && podeVerSetor(req.user, c));
  result.counts = {
    todas: tudo.length,
    minhas: tudo.filter(c => c.responsavel_id === req.user.id).length,
    naoLidas: tudo.filter(c => (c.unread || 0) > 0).length,
    grupos: tudo.filter(c => ehGrupo(c)).length,
  };
  res.json(result);
});

// ─── CARREGAR MENSAGENS DO Z-API (ao abrir conversa vazia) ───────────────────
// NOTA: A Z-API NÃO fornece endpoint para buscar mensagens antigas do histórico.
// O histórico fica apenas no celular. Mensagens novas chegam via webhook.
// Este endpoint apenas atualiza a foto de perfil do contato.
r.post('/conversations/:id/load-from-zapi', async (req, res) => {
  if (!zapiOk()) return res.json({ ok: false, loaded: 0 });
  try {
    const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    let phone = conv.phone?.replace(/\D/g, '') || '';
    if (phone.startsWith('55') && phone.length >= 12) phone = phone.slice(2);

    // Atualiza foto de perfil se ainda não tiver
    if (!conv.profile_pic) {
      try {
        const r2 = await zapiCall(`/profile-picture?phone=55${phone}`, 'GET');
        if (r2?.ok) {
          const d = await r2.json().catch(() => ({}));
          const pic = d.value || d.url || d.imgUrl || null;
          if (pic?.startsWith('http')) {
            await query('UPDATE conversas SET profile_pic=$1 WHERE id=$2', [pic, conv.id]);
            const cached = convoCache.get(conv.id);
            if (cached) cacheUpdate({ ...cached, profile_pic: pic });
          }
        }
      } catch {}
    }

    // Z-API não tem API de histórico de mensagens — retorna 0
    res.json({ ok: true, loaded: 0, note: 'Z-API não fornece histórico antigo. Mensagens novas chegam via webhook.' });
  } catch (err) { res.json({ ok: false, loaded: 0, error: err.message }); }
});


// Busca conversas (qualquer categoria) para PUXAR um cliente para uma pasta.
// IMPORTANTE: fica ANTES de GET /conversations/:id, senão "buscar" casa com :id.
r.get('/conversations/buscar', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const like = `%${q}%`;
    const { rows } = await query(
      `SELECT id, contact_name, phone, categoria, classificacao FROM conversas
       WHERE unaccent(lower(COALESCE(contact_name,''))) ILIKE unaccent(lower($1)) OR phone ILIKE $1
       ORDER BY last_message_at DESC NULLS LAST LIMIT 20`, [like]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// EDITAR cadastro do cliente (nome / telefone) direto da pasta
r.patch('/conversations/:id/contato', async (req, res) => {
  try {
    const sets = [], params = []; let i = 1;
    if (req.body.nome !== undefined) { sets.push(`contact_name = $${i++}`); params.push(String(req.body.nome).trim().slice(0, 80) || null); }
    if (req.body.phone !== undefined) { sets.push(`phone = $${i++}`); params.push(String(req.body.phone).replace(/\D/g, '').slice(0, 15) || null); }
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    params.push(req.params.id);
    const { rows: [conv] } = await query(`UPDATE conversas SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });
    cacheUpdate(conv);
    res.json({ ok: true, contact_name: conv.contact_name, phone: conv.phone });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ FUNIL DENTRO DA PASTA (etapas por contexto, leads → fechar venda) ═══════ */
const PASTA_CONTEXTOS = ['planos_vacinais', 'vacinacao', 'consultas', 'terapias', 'fidelidade', 'banco_dados'];
const ETAPAS_PADRAO = [
  ['Novo interesse', '#3b82f6', null], ['Proposta enviada', '#8b5cf6', null],
  ['Em negociação', '#f59e0b', null], ['Fechamento', '#0ea5e9', null],
  ['Ganho', '#10b981', 'ganho'], ['Perdido', '#ef4444', 'perdido'],
];
async function etapasDoContexto(contexto) {
  let { rows } = await query('SELECT * FROM pasta_etapas WHERE contexto = $1 ORDER BY ordem, created_at', [contexto]);
  if (!rows.length) {
    // Semeia o funil padrão na primeira vez que a pasta é aberta
    let ordem = 0;
    for (const [nome, cor, tipo] of ETAPAS_PADRAO) {
      await query(`INSERT INTO pasta_etapas (contexto, nome, cor, ordem, fixa, tipo) VALUES ($1,$2,$3,$4,$5,$6)`,
        [contexto, nome, cor, ordem++, !!tipo, tipo]).catch(() => {});
    }
    ({ rows } = await query('SELECT * FROM pasta_etapas WHERE contexto = $1 ORDER BY ordem, created_at', [contexto]));
  }
  return rows;
}

// Lista as etapas do funil de uma pasta (cria as padrão se ainda não existirem)
r.get('/pasta-funil/etapas', async (req, res) => {
  try {
    const contexto = PASTA_CONTEXTOS.includes(req.query.contexto) ? req.query.contexto : null;
    if (!contexto) return res.status(400).json({ error: 'Contexto inválido.' });
    res.json(await etapasDoContexto(contexto));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Criar etapa no funil da pasta (gestão)
r.post('/pasta-funil/etapas', masterOnly, async (req, res) => {
  try {
    const contexto = PASTA_CONTEXTOS.includes(req.body.contexto) ? req.body.contexto : null;
    const nome = String(req.body.nome || '').trim().slice(0, 32);
    if (!contexto || !nome) return res.status(400).json({ error: 'Informe contexto e nome.' });
    const cor = /^#[0-9a-fA-F]{6}$/.test(req.body.cor) ? req.body.cor : '#3b82f6';
    const { rows: [{ max }] } = await query("SELECT COALESCE(MAX(ordem),-1) max FROM pasta_etapas WHERE contexto = $1", [contexto]);
    const { rows: [e] } = await query('INSERT INTO pasta_etapas (contexto, nome, cor, ordem) VALUES ($1,$2,$3,$4) RETURNING *',
      [contexto, nome, cor, parseInt(max) + 1]);
    res.status(201).json(e);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Renomear / cor da etapa (gestão)
r.put('/pasta-funil/etapas/:id', masterOnly, async (req, res) => {
  try {
    const sets = [], params = []; let i = 1;
    if (req.body.nome !== undefined) { sets.push(`nome = $${i++}`); params.push(String(req.body.nome).trim().slice(0, 32)); }
    if (req.body.cor !== undefined && /^#[0-9a-fA-F]{6}$/.test(req.body.cor)) { sets.push(`cor = $${i++}`); params.push(req.body.cor); }
    if (req.body.descricao !== undefined) { sets.push(`descricao = $${i++}`); params.push(String(req.body.descricao || '').slice(0, 1500) || null); }
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    params.push(req.params.id);
    const { rows: [e] } = await query(`UPDATE pasta_etapas SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params);
    if (!e) return res.status(404).json({ error: 'Etapa não encontrada.' });
    res.json(e);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Excluir etapa — os leads dela voltam pra "sem etapa" (1ª coluna no front)
r.delete('/pasta-funil/etapas/:id', masterOnly, async (req, res) => {
  try {
    const { rows: [e] } = await query('SELECT * FROM pasta_etapas WHERE id = $1', [req.params.id]);
    if (!e) return res.status(404).json({ error: 'Etapa não encontrada.' });
    await query('UPDATE conversas SET funil_etapa = NULL WHERE funil_etapa = $1', [e.nome]).catch(() => {});
    await query('DELETE FROM pasta_etapas WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mover um lead pra uma etapa do funil
r.patch('/conversations/:id/funil-etapa', async (req, res) => {
  try {
    const etapa = req.body.etapa ? String(req.body.etapa).slice(0, 32) : null;
    const { rows: [conv] } = await query('UPDATE conversas SET funil_etapa = $1 WHERE id = $2 RETURNING *', [etapa, req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });
    cacheUpdate(conv);
    res.json({ ok: true, funil_etapa: etapa });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/conversations/:id', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache');
    const { rows: [conv] } = await query(`
      SELECT c.*, u.nome AS responsavel_nome, u.cor AS responsavel_cor
      FROM conversas c LEFT JOIN usuarios u ON u.id = c.responsavel_id
      WHERE c.id = $1`, [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Não encontrado' });
    if (!podeVerSetor(req.user, conv)) {
      return res.status(403).json({ error: 'Sem acesso: esta conversa é de outro setor.' });
    }

    // Auto-assign: quem abre uma conversa sem responsável assume o atendimento
    // (pode ser trocado depois no cabeçalho do chat)
    // (Removido o auto-assign no clique — agora a atendente só vira responsável
    // automaticamente depois de RESPONDER 2 mensagens; ver POST /send)
    if (false && !conv.responsavel_id && req.user?.id) {
      conv.responsavel_id = req.user.id;
      conv.responsavel_nome = req.user.nome;
      conv.responsavel_cor = req.user.cor;
      const cached = convoCache.get(conv.id);
      if (cached) cacheUpdate({ ...cached, responsavel_id: req.user.id });
    }

    const MSG_LIMIT = 15;
    const beforeTs = req.query.before_ts ? new Date(req.query.before_ts).toISOString() : null;

    const msgQuery = beforeTs
      ? `SELECT * FROM (SELECT * FROM mensagens WHERE conversa_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3) sub ORDER BY created_at ASC`
      : `SELECT * FROM (SELECT * FROM mensagens WHERE conversa_id = $1 ORDER BY created_at DESC LIMIT $2) sub ORDER BY created_at ASC`;

    const { rows: rawMsgs } = await query(msgQuery, beforeTs
      ? [req.params.id, beforeTs, MSG_LIMIT]
      : [req.params.id, MSG_LIMIT]);

    // Substitui base64 por referência — o frontend carrega sob demanda via /messages/:id/content
    // Uma imagem base64 pode ter 200-500 kB; com 15 mensagens isso pode ser MB de payload desnecessário
    const messages = rawMsgs.map(m => {
      if (m.content && m.content.startsWith('data:') && m.content.length > 500) {
        return { ...m, content: `[media:${m.id}]`, has_media: true };
      }
      return m;
    });

    let lead = null;
    if (conv.lead_id) {
      const { rows: [l] } = await query('SELECT * FROM leads WHERE id = $1', [conv.lead_id]);
      lead = l;
    }

    res.json({ ...conv, messages, has_more: messages.length === MSG_LIMIT, lead });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET MÍDIA DE UMA MENSAGEM (lazy load — evita base64 na resposta da conversa) ─
r.get('/messages/:id/content', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=86400'); // cache 24h no browser
    const { rows: [m] } = await query('SELECT content, type, mimetype FROM mensagens WHERE id = $1', [req.params.id]);
    if (!m || !m.content) return res.status(404).end();

    if (m.content.startsWith('data:')) {
      const comma = m.content.indexOf(',');
      if (comma === -1) return res.status(400).end();
      const header = m.content.slice(0, comma);         // "data:image/jpeg;base64"
      const b64    = m.content.slice(comma + 1);
      const mime   = header.replace('data:', '').replace(';base64', '');
      const buf    = Buffer.from(b64, 'base64');
      res.set('Content-Type', mime);
      res.set('Content-Length', buf.length);
      return res.send(buf);
    }
    // É uma URL normal — redireciona
    res.redirect(m.content);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── LONG-POLL: aguarda mensagem nova — retorna imediatamente quando chegar ───
// Frontend conecta e fica aguardando; servidor responde na hora que o webhook chegar.
// Timeout de 25s → se nada chegar, retorna [] e o cliente reconecta imediatamente.
r.get('/conversations/:id/poll', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache');
    const cPoll = convoCache.get(req.params.id);
    if (cPoll && !podeVerSetor(req.user, cPoll)) return res.status(403).json({ error: 'Sem acesso' });

    // Nunca aceitar timestamps muito antigos (evita retornar todo o histórico)
    // Máximo de 30 minutos atrás — se after_ts for mais antigo, usa 30min atrás
    const THIRTY_MIN_AGO = new Date(Date.now() - 30 * 60 * 1000);
    let afterTs = req.query.after_ts ? new Date(req.query.after_ts) : THIRTY_MIN_AGO;
    if (afterTs < THIRTY_MIN_AGO) afterTs = THIRTY_MIN_AGO;
    afterTs = afterTs.toISOString();

    // Verifica se já há mensagens novas (sem esperar)
    const { rows: immediate } = await query(
      `SELECT * FROM mensagens WHERE conversa_id = $1 AND created_at > $2 ORDER BY created_at ASC LIMIT 20`,
      [req.params.id, afterTs]
    );
    if (immediate.length > 0) return res.json({ messages: immediate });

    // Nenhuma mensagem nova ainda — segura a conexão por até 25s
    const messages = await new Promise(resolve => {
      if (!waiters.has(req.params.id)) waiters.set(req.params.id, []);
      const entry = { resolve, timer: null };
      entry.timer = setTimeout(() => {
        const list = waiters.get(req.params.id) || [];
        const idx = list.indexOf(entry);
        if (idx > -1) list.splice(idx, 1);
        resolve([]);
      }, 25000);
      waiters.get(req.params.id).push(entry);
      req.on('close', () => {
        clearTimeout(entry.timer);
        const list = waiters.get(req.params.id) || [];
        const idx = list.indexOf(entry);
        if (idx > -1) list.splice(idx, 1);
        resolve([]);
      });
    });

    res.json({ messages });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// IDs são UUID — não podem ser comparados numericamente
// Cache-Control: no-store evita 304 do browser
r.get('/conversations/:id/messages/new', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache');
    const cNew = convoCache.get(req.params.id);
    if (cNew && !podeVerSetor(req.user, cNew)) return res.status(403).json({ error: 'Sem acesso' });
    // after_ts: ISO timestamp da última mensagem conhecida
    const afterTs = req.query.after_ts
      ? new Date(req.query.after_ts).toISOString()
      : new Date(0).toISOString();

    const { rows } = await query(
      `SELECT * FROM mensagens
       WHERE conversa_id = $1 AND created_at > $2
       ORDER BY created_at ASC LIMIT 50`,
      [req.params.id, afterTs]
    );
    res.json({ messages: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ─── MARK READ ────────────────────────────────────────────────────────────────
r.patch('/conversations/:id/read', async (req, res) => {
  try {
    await query('UPDATE conversas SET unread = 0 WHERE id = $1', [req.params.id]);
    // Só reescreve o que mudou: mensagens do cliente ainda não lidas (evita
    // reescrever centenas de linhas a cada vez que a conversa é aberta)
    await query("UPDATE mensagens SET status = 'read' WHERE conversa_id = $1 AND from_type = 'contact' AND status <> 'read'", [req.params.id]);
    res.json({ ok: true });

    // Recibo de leitura no WhatsApp (✓✓ azul pro cliente) — como no WhatsApp real.
    // Best-effort: marca a última mensagem recebida como lida na Z-API.
    if (zapiOk()) {
      try {
        const { rows: [c] } = await query('SELECT phone FROM conversas WHERE id = $1', [req.params.id]);
        const { rows: [m] } = await query(
          "SELECT wa_msg_id FROM mensagens WHERE conversa_id = $1 AND from_type = 'contact' AND wa_msg_id IS NOT NULL ORDER BY created_at DESC LIMIT 1",
          [req.params.id]);
        if (c?.phone && m?.wa_msg_id) {
          const tel = String(c.phone).replace(/\D/g, '');
          await zapiCall('/read-message', 'POST', { phone: tel.startsWith('55') ? tel : `55${tel}`, messageId: m.wa_msg_id });
        }
      } catch (e) { console.error('read-message Z-API:', e.message); }
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ASSIGN ────────────────────────────────────────────────────────────────────
r.patch('/conversations/:id/assign', async (req, res) => {
  try {
    const respId = req.body.responsavel_id || null;
    await query('UPDATE conversas SET responsavel_id = $1 WHERE id = $2', [respId, req.params.id]);
    // O lead vinculado herda a carteira (responsável) — pra bater com a pasta/lista
    await query('UPDATE leads SET responsavel_id = $1 WHERE id = (SELECT lead_id FROM conversas WHERE id = $2 AND lead_id IS NOT NULL)', [respId, req.params.id]).catch(() => {});
    const cached = convoCache.get(req.params.id);
    if (cached) cacheUpdate({ ...cached, responsavel_id: respId });
    const { rows: [conv] } = await query(`
      SELECT c.id, c.responsavel_id, u.nome AS responsavel_nome, u.cor AS responsavel_cor
      FROM conversas c LEFT JOIN usuarios u ON u.id = c.responsavel_id WHERE c.id = $1`, [req.params.id]);
    res.json({ ok: true, ...conv });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CLASSIFICAR o atendimento (o atendente define o tipo). Cada classificação mapeia
// pra um SETOR (que rege o acesso: vacina x não-vacina) e, no caso de Fidelidade,
// move a conversa pra pasta. Depois disso ela só aparece pro time responsável.
const CLASSIFICACOES = {
  vacinacao:       { setor: 'vacinas',   categoria: null },
  planos_vacinais: { setor: 'vacinas',   categoria: null },
  fidelidade:      { setor: 'vacinas',   categoria: 'fidelidade' },
  consultas:       { setor: 'consultas', categoria: null },
  terapias:        { setor: 'terapias',  categoria: null },
};
r.patch('/conversations/:id/classificar', async (req, res) => {
  try {
    const cls = req.body.classificacao;
    // null/'' → remove a classificação (tira da pasta de Planos, por ex.)
    if (cls === null || cls === '') {
      const { rows: [conv] } = await query('UPDATE conversas SET classificacao = NULL WHERE id = $1 RETURNING *', [req.params.id]);
      if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });
      cacheUpdate(conv);
      socketEmit('conv_setor', { convId: conv.id, classificacao: null });
      return res.json({ ok: true, classificacao: null });
    }
    const mapa = CLASSIFICACOES[cls];
    if (!mapa) return res.status(400).json({ error: 'Classificação inválida.' });
    const { rows: [conv] } = await query(
      'UPDATE conversas SET classificacao = $1, setor = $2, categoria = $3, menu_enviado = true WHERE id = $4 RETURNING *',
      [cls, mapa.setor, mapa.categoria, req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });
    cacheUpdate(conv);
    socketEmit('conv_setor', { convId: conv.id, setor: mapa.setor, classificacao: cls, categoria: mapa.categoria });
    // O lead vinculado herda o setor (pra lista de Leads bater com o acesso)
    await query('UPDATE leads SET setor = $1 WHERE id = (SELECT lead_id FROM conversas WHERE id = $2 AND lead_id IS NOT NULL)', [mapa.setor, conv.id]).catch(() => {});

    // CARTEIRA: ao PUXAR um cliente para a própria pasta, o cliente vira da
    // pessoa (assumir=true) ou de um atendente escolhido (responsavel_id) — sem
    // rodízio. Cada um organiza a SUA carteira.
    const donoId = req.body.responsavel_id || (req.body.assumir ? req.user.id : null);
    if (donoId) {
      const { rows: [c3] } = await query('UPDATE conversas SET responsavel_id = $1 WHERE id = $2 RETURNING *', [donoId, conv.id]);
      if (c3) { cacheUpdate(c3); socketEmit('conv_setor', { convId: conv.id, setor: mapa.setor, classificacao: cls, categoria: mapa.categoria }); }
      await query('UPDATE leads SET responsavel_id = $1, setor = $2 WHERE id = (SELECT lead_id FROM conversas WHERE id = $3 AND lead_id IS NOT NULL)', [donoId, mapa.setor, conv.id]).catch(() => {});
      return res.json({ ok: true, classificacao: cls, setor: mapa.setor, categoria: mapa.categoria, responsavel: donoId });
    }

    // RODÍZIO AUTOMÁTICO: lead novo (sem responsável) e que NÃO foi pra pasta →
    // distribui entre as atendentes do setor de forma justa e avisa a escolhida.
    let distribuida = null;
    if (!mapa.categoria && !conv.responsavel_id) {
      distribuida = await distribuirSetor(conv.id, mapa.setor).catch(() => null);
      if (distribuida) {
        const { rows: [c2] } = await query('SELECT * FROM conversas WHERE id = $1', [conv.id]).catch(() => ({ rows: [] }));
        if (c2) cacheUpdate(c2);
        await query(
          `INSERT INTO notificacoes (tipo, titulo, texto, conv_id) VALUES ('distribuicao',$1,$2,$3)`,
          [`📥 Novo lead pra você: ${conv.contact_name || conv.phone || 'cliente'}`,
           `Distribuído automaticamente pelo rodízio de ${mapa.setor}.`, conv.id]).catch(() => {});
      }
    }
    res.json({ ok: true, classificacao: cls, setor: mapa.setor, categoria: mapa.categoria, responsavel: distribuida });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// MARCAR COMO PERDIDO (motivo obrigatório). Registra a perda (relatórios) e
// fecha o atendimento. Lista de motivos no front; aqui só exige um motivo.
r.patch('/conversations/:id/perder', async (req, res) => {
  try {
    const motivo = String(req.body.motivo || '').trim().slice(0, 80);
    if (!motivo) return res.status(400).json({ error: 'Informe o motivo da perda.' });
    const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });
    const valor = req.body.valor_potencial !== undefined && !isNaN(parseFloat(req.body.valor_potencial)) ? Math.max(0, parseFloat(req.body.valor_potencial)) : 0;
    await query(
      `INSERT INTO perdas (conversa_id, atendente_id, atendente_nome, setor, categoria, cliente_nome, motivo, observacao, valor_potencial)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [conv.id, req.user.id, req.user.nome, conv.setor || null, conv.classificacao || null, conv.contact_name || conv.phone || null, motivo, String(req.body.observacao || '').slice(0, 300), valor]);
    const { rows: [c2] } = await query(
      "UPDATE conversas SET perdido = true, motivo_perda = $1, status_atend = 'resolvido', bot_ativo = false WHERE id = $2 RETURNING *", [motivo, conv.id]);
    if (c2) cacheUpdate(c2);
    socketEmit('conv_perdido', { convId: conv.id, motivo });
    res.json({ ok: true, motivo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CRIAR FOLLOW-UP a partir da conversa: garante a ficha do lead e agenda o
// retorno (aparece em Follow-up/Retornos). Motivo vai pra observação do lead.
r.post('/conversations/:id/followup', async (req, res) => {
  try {
    const data = String(req.body.data || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ error: 'Escolha a data do follow-up.' });
    const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });
    const leadId = conv.lead_id || await garanteLead(conv);
    if (!leadId) return res.status(500).json({ error: 'Não foi possível criar a ficha do cliente.' });
    const motivo = String(req.body.motivo || '').slice(0, 120);
    await query(
      `UPDATE leads SET data_retorno = $1, updated_at = NOW(),
        observacoes = CASE WHEN $2 <> '' THEN COALESCE(observacoes,'') || E'\n[Follow-up ' || $1 || '] ' || $2 ELSE observacoes END
       WHERE id = $3`, [data, motivo, leadId]).catch(() => {});
    socketEmit('funil_update', { tipo: 'lead', leadId });
    res.json({ ok: true, data, lead_id: leadId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mover atendimento para uma PASTA (fidelidade / banco_dados) ou tirar (null).
// Sai do inbox normal e passa a viver na pasta correspondente.
r.patch('/conversations/:id/categoria', async (req, res) => {
  try {
    const cat = ['fidelidade', 'banco_dados'].includes(req.body.categoria) ? req.body.categoria : null;
    // Ao entrar numa pasta, marca o mês de referência (entrou agora).
    const { rows: [conv] } = await query(
      `UPDATE conversas SET categoria = $1,
         categoria_em = CASE WHEN $1::text IS NOT NULL THEN NOW() ELSE categoria_em END
       WHERE id = $2 RETURNING *`, [cat, req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });
    cacheUpdate(conv);
    socketEmit('conv_categoria', { convId: conv.id, categoria: cat });
    res.json({ ok: true, categoria: cat });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Dia do mês em que o mensalista (Fidelidade) costuma vacinar — organiza a pasta
r.patch('/conversations/:id/pasta-dia', async (req, res) => {
  try {
    let dia = parseInt(req.body.dia);
    dia = (dia >= 1 && dia <= 31) ? dia : null;
    const { rows: [conv] } = await query(
      'UPDATE conversas SET pasta_dia = $1 WHERE id = $2 RETURNING *', [dia, req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });
    cacheUpdate(conv);
    res.json({ ok: true, pasta_dia: dia });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CADASTRAR cliente manualmente direto numa pasta (nome + telefone). Se já existe
// uma conversa com esse telefone, apenas move/transfere ela para a pasta.
r.post('/conversations/manual', async (req, res) => {
  try {
    const nome = String(req.body.nome || '').trim().slice(0, 80);
    const phoneRaw = String(req.body.phone || '').replace(/\D/g, '').slice(0, 15);
    const categoria = ['fidelidade', 'banco_dados'].includes(req.body.categoria) ? req.body.categoria : null;
    const cls = CLASSIFICACOES[req.body.classificacao] ? req.body.classificacao : null;
    if (!categoria && !cls) return res.status(400).json({ error: 'Destino inválido.' });
    if (!nome && !phoneRaw) return res.status(400).json({ error: 'Informe ao menos o nome ou o telefone.' });
    const setorCls = cls ? CLASSIFICACOES[cls].setor : null;
    // Carteira: o cliente cadastrado entra pra quem cadastrou (assumir) ou pro
    // atendente escolhido (responsavel_id).
    const donoId = req.body.responsavel_id || (req.body.assumir ? req.user.id : null);
    const base = phoneRaw ? (phoneRaw.startsWith('55') ? phoneRaw : '55' + phoneRaw) : `manual_${Date.now()}`;
    const contactId = `${base}@s.whatsapp.net`;
    const { rows: [conv] } = await query(`
      INSERT INTO conversas (contact_id, phone, contact_name, channel, last_message, last_message_at, unread, status_atend, provider, categoria, categoria_em, classificacao, setor, responsavel_id)
      VALUES ($1, $2, $3, 'whatsapp', $4, NOW(), 0, 'aberto', 'manual', $5, CASE WHEN $5::text IS NOT NULL THEN NOW() END, $6, $7, $8)
      ON CONFLICT (contact_id) DO UPDATE SET
        contact_name = COALESCE(NULLIF($3,''), conversas.contact_name),
        categoria = COALESCE($5, conversas.categoria),
        categoria_em = CASE WHEN $5::text IS NOT NULL THEN NOW() ELSE conversas.categoria_em END,
        classificacao = COALESCE($6, conversas.classificacao),
        setor = COALESCE($7, conversas.setor),
        responsavel_id = COALESCE($8, conversas.responsavel_id)
      RETURNING *`,
      [contactId, phoneRaw || null, nome || null, 'Cliente cadastrado na pasta', categoria, cls, setorCls, donoId]);
    cacheUpdate(conv);
    socketEmit(cls ? 'conv_setor' : 'conv_categoria', { convId: conv.id, categoria, classificacao: cls });
    res.status(201).json(conv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── EXEMPLOS DE CONVERSA (treino da IA) ──────────────────────────────────────
// Marca uma conversa que converteu como EXEMPLO. A IA passa a estudar o jeito.
r.post('/conversations/:id/exemplo', masterOnly, async (req, res) => {
  try {
    const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });
    const { rows: msgs } = await query(
      `SELECT from_type, type, content, filename FROM mensagens
       WHERE conversa_id = $1 AND type IN ('text','document') AND from_type <> 'system'
       ORDER BY created_at ASC LIMIT 60`, [req.params.id]);
    if (!msgs.length) return res.status(400).json({ error: 'Conversa sem mensagens pra usar de exemplo.' });
    const conteudo = msgs.map(m => {
      const quem = m.from_type === 'contact' ? 'Cliente' : 'Atendente';
      const txt = m.type === 'document' ? `[enviou documento: ${m.filename || 'arquivo'}]` : String(m.content || '').trim();
      return txt ? `${quem}: ${txt}` : '';
    }).filter(Boolean).join('\n').slice(0, 4000);
    const titulo = (req.body?.titulo || conv.contact_name || conv.phone || 'Conversa de sucesso').slice(0, 80);
    const setor = ['vacinas', 'consultas', 'terapias'].includes(conv.setor) ? conv.setor : 'consultas';
    const { rows: [ex] } = await query(
      `INSERT INTO exemplos_conversa (titulo, setor, conteudo, criado_por) VALUES ($1,$2,$3,$4) RETURNING id, titulo, setor, created_at`,
      [titulo, setor, conteudo, req.user?.nome || null]);
    res.status(201).json(ex);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/exemplos', async (req, res) => {
  try {
    const { rows } = await query(`SELECT id, titulo, setor, criado_por, created_at, length(conteudo) tam FROM exemplos_conversa ORDER BY created_at DESC LIMIT 100`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/exemplos/:id', masterOnly, async (req, res) => {
  try { await query('DELETE FROM exemplos_conversa WHERE id = $1', [req.params.id]); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Contagem de leads ESPERANDO resposta por classificação (pros atalhos do menu).
// Respeita o acesso por setor: cada um só conta o que pode ver. Ajuda a organizar
// quem atende o quê (4 atendentes não se perdem com tudo vindo junto).
r.get('/setores-contagem', (req, res) => {
  try {
    const out = { vacinacao: 0, planos_vacinais: 0, consultas: 0, terapias: 0, fidelidade: 0, sem_classificacao: 0 };
    for (const conv of convoCache.values()) {
      if (!podeVerSetor(req.user, conv)) continue;   // só o que a pessoa pode ver
      if (conv.categoria === 'fidelidade') { out.fidelidade++; continue; } // total na pasta
      if (conv.categoria) continue;                  // outras pastas não contam
      if (conv.last_from !== 'contact') continue;    // só os que ESPERAM resposta
      if (conv.classificacao && out[conv.classificacao] !== undefined) out[conv.classificacao]++;
      else if (!conv.classificacao) out.sem_classificacao++;
    }
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// RESUMO DO MÊS por classificação/setor (banner no topo da aba). Junta
// atendimentos, agendados, vendas fechadas e perdidos daquele ambiente.
const CLS_CATEGORIA = { vacinacao: 'Vacinação Geral', planos_vacinais: 'Plano Vacinal', fidelidade: 'Fidelidade Mensal', consultas: 'Consulta', terapias: 'Terapia' };
const CLS_SETOR = { vacinacao: 'vacinas', planos_vacinais: 'vacinas', fidelidade: 'vacinas', consultas: 'consultas', terapias: 'terapias' };
r.get('/setor-resumo', async (req, res) => {
  try {
    const cls = req.query.cls;
    if (!CLS_CATEGORIA[cls]) return res.json({});
    let emAtendimento = 0, esperando = 0;
    for (const c of convoCache.values()) {
      if (c.categoria || c.classificacao !== cls) continue;
      if (!podeVerSetor(req.user, c)) continue;
      emAtendimento++;
      if (c.last_from === 'contact') esperando++;
    }
    const mes = new Date().toISOString().slice(0, 7);
    const cat = CLS_CATEGORIA[cls], setor = CLS_SETOR[cls];
    const [vendas, perdas, ag] = await Promise.all([
      query(`SELECT COUNT(*)::int n, COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float confirmado FROM vendas WHERE to_char(data_venda,'YYYY-MM')=$1 AND categoria=$2`, [mes, cat]).catch(() => ({ rows: [{ n: 0, confirmado: 0 }] })),
      query(`SELECT COUNT(*)::int n, COALESCE(SUM(valor_potencial),0)::float valor FROM perdas WHERE to_char(created_at,'YYYY-MM')=$1 AND (categoria=$2 OR setor=$3)`, [mes, cls, setor]).catch(() => ({ rows: [{ n: 0, valor: 0 }] })),
      query(`SELECT COUNT(*)::int n FROM agenda_eventos WHERE to_char(data,'YYYY-MM')=$1 AND setor=$2 AND status<>'Cancelado'`, [mes, setor]).catch(() => ({ rows: [{ n: 0 }] })),
    ]);
    res.json({
      cls, rotulo: cat,
      emAtendimento, esperando,
      agendados: ag.rows[0]?.n || 0,
      vendas: vendas.rows[0]?.n || 0,
      vendido: vendas.rows[0]?.confirmado || 0,
      perdidos: perdas.rows[0]?.n || 0,
      perdidoValor: perdas.rows[0]?.valor || 0,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// "ATENÇÃO AGORA": pontos de ação pra gestão/atendente agir — respeita o acesso.
r.get('/atencao-agora', async (req, res) => {
  try {
    const agora = Date.now();
    let semResposta = 0, quentes = 0;
    for (const c of convoCache.values()) {
      if (c.categoria) continue;
      if (!podeVerSetor(req.user, c)) continue;
      if (c.last_from === 'contact') {
        const idade = c.last_message_at ? agora - new Date(c.last_message_at).getTime() : 0;
        if (idade > 10 * 60 * 1000 && idade < 24 * 3600 * 1000) semResposta++;
        if (c.lead_score === 'quente') quentes++;
      }
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const mes = hoje.slice(0, 7);
    const soMinhasVenda = req.user.role === 'master' || req.user.role === 'supervisor' ? '' : ` AND atendente_id = '${String(req.user.id).replace(/[^a-zA-Z0-9-]/g, '')}'`;
    const [ag, vp] = await Promise.all([
      query(`SELECT COUNT(*)::int n FROM agenda_eventos WHERE data >= $1 AND status = 'Agendado'`, [hoje]).catch(() => ({ rows: [{ n: 0 }] })),
      query(`SELECT COUNT(*)::int n, COALESCE(SUM(valor),0)::float v FROM vendas
              WHERE to_char(data_venda,'YYYY-MM') = $1 AND status_pagamento IN ('sinal','aguardando','parcelado','pendente') ${soMinhasVenda}`, [mes]).catch(() => ({ rows: [{ n: 0, v: 0 }] })),
    ]);
    res.json({
      semResposta, quentes,
      agendamentosSemConfirmar: ag.rows[0]?.n || 0,
      vendasPendentes: vp.rows[0]?.n || 0,
      vendasPendentesValor: vp.rows[0]?.v || 0,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CHAT INTERNO (equipe ↔ equipe) ──────────────────────────────────────────
// Lista de contatos (usuários) com último recado e não-lidas pra mim.
r.get('/chat-interno/contatos', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT u.id, u.nome, u.cor, u.avatar, u.setor, u.role,
        (SELECT conteudo FROM chat_interno m WHERE (m.de_id=u.id AND m.para_id=$1) OR (m.de_id=$1 AND m.para_id=u.id) ORDER BY m.created_at DESC LIMIT 1) AS ultima,
        (SELECT tipo FROM chat_interno m WHERE (m.de_id=u.id AND m.para_id=$1) OR (m.de_id=$1 AND m.para_id=u.id) ORDER BY m.created_at DESC LIMIT 1) AS ultima_tipo,
        (SELECT created_at FROM chat_interno m WHERE (m.de_id=u.id AND m.para_id=$1) OR (m.de_id=$1 AND m.para_id=u.id) ORDER BY m.created_at DESC LIMIT 1) AS ultima_at,
        (SELECT COUNT(*) FROM chat_interno m WHERE m.de_id=u.id AND m.para_id=$1 AND m.lida=false)::int AS nao_lidas
      FROM usuarios u
      WHERE u.id <> $1 AND u.ativo = true AND u.role <> 'bot'
      ORDER BY ultima_at DESC NULLS LAST, u.nome`, [req.user.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Conversa com um usuário (marca como lidas as que ele me mandou).
r.get('/chat-interno/:userId', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM chat_interno WHERE (de_id=$1 AND para_id=$2) OR (de_id=$2 AND para_id=$1) ORDER BY created_at ASC LIMIT 300`,
      [req.user.id, req.params.userId]);
    await query('UPDATE chat_interno SET lida=true WHERE de_id=$1 AND para_id=$2 AND lida=false', [req.params.userId, req.user.id]).catch(() => {});
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Enviar recado interno.
r.post('/chat-interno', async (req, res) => {
  try {
    const para = String(req.body.para_id || '');
    const tipo = ['text', 'audio', 'document', 'image'].includes(req.body.tipo) ? req.body.tipo : 'text';
    const conteudo = String(req.body.conteudo || '').trim().slice(0, 4000);
    const arquivo = req.body.arquivo ? String(req.body.arquivo) : null;
    if (!para) return res.status(400).json({ error: 'Destinatário é obrigatório.' });
    if (tipo === 'text' && !conteudo) return res.status(400).json({ error: 'Mensagem vazia.' });
    if (tipo !== 'text') {
      if (!arquivo || !/^data:[\w/+.\-]+;base64,/.test(arquivo)) return res.status(400).json({ error: 'Arquivo inválido.' });
      if (arquivo.length > 11_000_000) return res.status(400).json({ error: 'Arquivo muito grande (máx. ~8MB).' });
    }
    const { rows: [m] } = await query(
      `INSERT INTO chat_interno (de_id, de_nome, para_id, conteudo, tipo, arquivo, filename, mimetype) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, req.user.nome, para, conteudo || null, tipo, arquivo,
       req.body.filename ? String(req.body.filename).slice(0, 160) : null,
       req.body.mimetype ? String(req.body.mimetype).slice(0, 100) : null]);
    socketEmitToUsers([para, req.user.id], 'chat_interno', m);
    res.status(201).json(m);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Total de não-lidas (badge do menu).
r.get('/chat-interno-naolidas', async (req, res) => {
  try {
    const { rows: [r2] } = await query('SELECT COUNT(*)::int n FROM chat_interno WHERE para_id=$1 AND lida=false', [req.user.id]);
    res.json({ n: r2?.n || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Lista de atendentes (pra o seletor de transferência) — acessível a todos logados
r.get('/atendentes', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, nome, setor, cor, avatar FROM usuarios
       WHERE ativo = true AND role IN ('atendente','supervisor','master') ORDER BY nome`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// TRANSFERIR atendimento: passa a conversa para outro atendente (e move pro setor
// dele). Some da lista de quem transferiu, aparece pra quem recebeu (com aviso).
r.patch('/conversations/:id/transferir', async (req, res) => {
  try {
    const paraId = req.body.para_id;
    if (!paraId) return res.status(400).json({ error: 'Escolha para quem transferir.' });
    const { rows: [dest] } = await query("SELECT id, nome, setor FROM usuarios WHERE id = $1 AND ativo = true", [paraId]);
    if (!dest) return res.status(404).json({ error: 'Atendente não encontrado.' });
    const novoSetor = ['vacinas', 'consultas', 'terapias'].includes(dest.setor) ? dest.setor : null;
    const { rows: [conv] } = await query(
      `UPDATE conversas SET responsavel_id = $1, bot_ativo = false ${novoSetor ? ', setor = $3' : ''}
       WHERE id = $2 RETURNING *`,
      novoSetor ? [paraId, req.params.id, novoSetor] : [paraId, req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });
    cacheUpdate(conv);
    const de = req.user?.nome || 'a equipe';
    // Mensagem de sistema na thread (registro da transferência)
    const { rows: [sysMsg] } = await query(
      `INSERT INTO mensagens (conversa_id, from_type, type, content, created_at)
       VALUES ($1,'system','text',$2,NOW()) RETURNING *`,
      [conv.id, `🔁 Atendimento transferido de ${de} para ${dest.nome}.`]).catch(() => ({ rows: [null] }));
    // Notifica quem recebeu
    await query(
      `INSERT INTO notificacoes (tipo, titulo, texto, conv_id) VALUES ('transferencia',$1,$2,$3)`,
      [`🔁 Atendimento recebido: ${conv.contact_name || conv.phone || 'cliente'}`,
       `${de} transferiu este atendimento para você. Dê uma olhada e continue de onde parou.`, conv.id]).catch(() => {});
    socketEmit('conv_assigned', { convId: conv.id, responsavel_id: paraId, responsavel_nome: dest.nome });
    socketEmit('conv_transferida', { convId: conv.id, para_id: paraId, para_nome: dest.nome, de_id: req.user?.id });
    if (sysMsg) socketEmit('new_message', { convId: conv.id, message: sysMsg, conv });
    res.json({ ok: true, responsavel_id: paraId, responsavel_nome: dest.nome, setor: conv.setor });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── STATUS DE ATENDIMENTO ────────────────────────────────────────────────────
r.patch('/conversations/:id/status', async (req, res) => {
  try {
    const { status } = req.body; // 'aberto' | 'em_atendimento' | 'resolvido'
    const valid = ['aberto', 'em_atendimento', 'resolvido'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Status inválido' });
    const { rows: [c] } = await query(
      'UPDATE conversas SET status_atend = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    broadcast('status_change', { convId: req.params.id, status_atend: status });
    res.json({ ok: true, status_atend: c.status_atend });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BOT TOGGLE ────────────────────────────────────────────────────────────────
r.patch('/conversations/:id/bot', async (req, res) => {
  try {
    if (req.user?.role !== 'master') return res.status(403).json({ error: 'Apenas o master (Miécio ou Nágila) pode ligar ou desligar o bot.' });
    const { rows: [c] } = await query('UPDATE conversas SET bot_ativo = $1 WHERE id = $2 RETURNING bot_ativo', [req.body.ativo, req.params.id]);
    if (c) { const cached = convoCache.get(req.params.id); if (cached) cacheUpdate({ ...cached, bot_ativo: c.bot_ativo }); }
    socketEmit('bot_status', { convId: req.params.id, bot_ativo: c?.bot_ativo });
    // Ligou o bot e a última mensagem é do cliente esperando? Responde JÁ, sem ter
    // que esperar o cliente mandar outra mensagem. (Só pra setor de IA, não vacina.)
    if (c?.bot_ativo) {
      const { rows: [last] } = await query(
        "SELECT from_type FROM mensagens WHERE conversa_id=$1 AND type IN ('text','document') AND from_type<>'system' ORDER BY created_at DESC LIMIT 1",
        [req.params.id]).catch(() => ({ rows: [] }));
      const { rows: [cv] } = await query('SELECT setor FROM conversas WHERE id=$1', [req.params.id]).catch(() => ({ rows: [] }));
      if (last?.from_type === 'contact' && cv?.setor && cv.setor !== 'vacinas') agendarVitta(req.params.id);
    }
    res.json({ ok: true, botAtivo: c?.bot_ativo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────
r.post('/conversations/:id/send', async (req, res) => {
  try {
    const { content, type = 'text' } = req.body;
    if (type === 'text' && typeof content === 'string' && content.length > 8000) {
      return res.status(400).json({ error: 'Mensagem muito longa (máx. 8000 caracteres).' });
    }
    const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Não encontrado' });
    if (!podeVerSetor(req.user, conv)) return res.status(403).json({ error: 'Sem acesso: esta conversa é de outro setor.' });

    const { rows: [msg] } = await query(`
      INSERT INTO mensagens (conversa_id, from_type, type, content, sender_id, sender_nome, status)
      VALUES ($1, 'me', $2, $3, $4, $5, 'sent')
      RETURNING *`,
      [req.params.id, type, content, req.user.id, req.user.nome]
    );

    const preview = type === 'text' ? content : type === 'audio' ? '🎵 Áudio' : type === 'image' ? '📷 Imagem' : type === 'sticker' ? '🎭 Figurinha' : `📎 Arquivo`;
    // Atendente respondeu pelo painel = humano assumiu → desliga o bot nesta
    // conversa (mesma regra de quando responde pelo celular), pra a IA não falar
    // por cima do atendimento humano.
    const { rows: [convUpd] } = await query("UPDATE conversas SET last_message = $1, last_from = 'me', last_message_at = NOW(), bot_ativo = false WHERE id = $2 RETURNING *", [preview, req.params.id]);
    if (convUpd) cacheUpdate(convUpd);
    if (conv.bot_ativo) socketEmit('bot_status', { convId: req.params.id, bot_ativo: false });

    // EXCLUSIVIDADE: se a conversa ainda não tem setor e quem respondeu é de um
    // setor, a conversa passa a ser DAQUELE setor (some pros outros setores).
    const senderSetor = req.user.setor || usuariosSetor.get(String(req.user.id)) || null;
    if (!conv.setor && ['vacinas', 'consultas', 'terapias'].includes(senderSetor)) {
      const { rows: [cs] } = await query('UPDATE conversas SET setor = $1, menu_enviado = true WHERE id = $2 RETURNING *', [senderSetor, req.params.id]).catch(() => ({ rows: [] }));
      if (cs) { cacheUpdate(cs); socketEmit('conv_setor', { convId: cs.id, setor: senderSetor }); }
    }

    // AUTO-CADASTRO: todo atendimento que um humano responde já vira ficha de
    // cliente no funil (pra nenhum contato ser esquecido). Não bloqueia o envio.
    garanteLead(convUpd || conv).catch(() => {});

    // ── Responsável automático: só depois da 2ª resposta da MESMA atendente ──
    // (a pedido do Sr. Miécio: clicar pra ler não pode "roubar" a conversa)
    let autoAssign = null;
    if (!conv.responsavel_id && req.user?.id) {
      const { rows: [{ count }] } = await query(
        `SELECT COUNT(*) AS count FROM mensagens WHERE conversa_id = $1 AND from_type = 'me' AND sender_id = $2`,
        [req.params.id, req.user.id]);
      if (parseInt(count) >= 2) {
        const { rows: [c2] } = await query(
          `UPDATE conversas SET responsavel_id = $1 WHERE id = $2 AND responsavel_id IS NULL RETURNING *`,
          [req.user.id, req.params.id]);
        if (c2) {
          cacheUpdate(c2);
          autoAssign = { responsavel_id: req.user.id, responsavel_nome: req.user.nome };
          socketEmit('conv_assigned', { convId: req.params.id, ...autoAssign });
        }
      }
    }

    socketEmit('new_message', { convId: req.params.id, message: msg, conv: convUpd || conv });
    await query(`SELECT pg_notify('vittahub', $1)`, [
      JSON.stringify({ event: 'new_message', convId: req.params.id, messageId: msg.id, conv: convUpd || conv })
    ]).catch(() => {});
    notifyWaiters(req.params.id, msg);

    // WhatsApp send: roteia por provider da conversa (meta → Z-API → Evolution)
    if (conv.channel === 'whatsapp') {
      try {
        const waNumber = conv.contact_id
          ? conv.contact_id.replace('@s.whatsapp.net', '')
          : `55${conv.phone}`;
        const phone55 = waNumber.startsWith('55') ? waNumber : `55${waNumber}`;
        let sent = false;

        // ── Meta Cloud API (provider = 'meta') ────────────────────────────────
        if (conv.provider === 'meta' && process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID) {
          try {
            const metaResp = await sendViaMeta(phone55, type, content);
            if (metaResp?.messages?.[0]?.id) {
              await query("UPDATE mensagens SET status='sent', wa_msg_id=$1 WHERE id=$2",
                [metaResp.messages[0].id, msg.id]);
              sent = true;
            }
          } catch (e) { console.error('Meta send error:', e.message); }
        }

        // ── Z-API ─────────────────────────────────────────────────────────────
        if (!sent && zapiOk()) {
          let zr;
          // Identifica a atendente pro cliente (padrão da equipe: "*Raylane:*")
          // — só no WhatsApp; no sistema a mensagem fica limpa com o rótulo visual
          const primeiroNome = (req.user?.nome || '').trim().split(' ')[0];
          const comAssinatura = (type === 'text' && primeiroNome && !content.trimStart().startsWith('*'))
            ? `*${primeiroNome}:*\n${content}` : content;
          if (type === 'text')     zr = await zapiCall('/send-text',     'POST', { phone: phone55, message: comAssinatura });
          else if (type === 'audio')    zr = await zapiCall('/send-audio',    'POST', { phone: phone55, audio: content });
          else if (type === 'sticker')  zr = await zapiCall('/send-sticker',  'POST', { phone: phone55, sticker: content });
          else if (type === 'image')    zr = await zapiCall('/send-image',    'POST', { phone: phone55, image: content, caption: '' });
          else if (type === 'video')    zr = await zapiCall('/send-video',    'POST', { phone: phone55, video: content, caption: '' });
          else if (type === 'document') zr = await zapiCall('/send-document', 'POST', { phone: phone55, document: content, fileName: msg.filename || 'arquivo' });
          if (zr?.ok) {
            const zd = await zr.json();
            if (zd.zaapId || zd.messageId) {
              await query("UPDATE mensagens SET status='delivered', wa_msg_id=$1 WHERE id=$2", [zd.messageId || zd.zaapId, msg.id]);
              sent = true;
            }
          }
        }

        // ── Evolution API fallback ─────────────────────────────────────────────
        if (!sent && EVO_URL() && EVO_KEY()) {
          const { default: fetch } = await import('node-fetch');
          let er;
          if (type === 'text') er = await fetch(`${EVO_URL()}/message/sendText/${EVO_INST()}`, { method:'POST', headers:{'Content-Type':'application/json',apikey:EVO_KEY()}, body: JSON.stringify({number:waNumber,text:content})});
          else er = await fetch(`${EVO_URL()}/message/sendMedia/${EVO_INST()}`, { method:'POST', headers:{'Content-Type':'application/json',apikey:EVO_KEY()}, body: JSON.stringify({number:waNumber,mediatype:type,media:content,caption:''})});
          if (er?.ok) { const ed = await er.json(); if (ed.key) await query("UPDATE mensagens SET status='delivered' WHERE id=$1", [msg.id]); }
        }
      } catch (e) { console.error('WA send error:', e.message); }
    }

    res.json({ ...msg, autoAssign });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── MENSAGENS AGENDADAS: dispara texto pro cliente em data/hora marcada ──────── */
// Envia um texto pela conversa (usado pelo agendador) e registra no histórico.
async function enviarTextoConversa(conv, texto, senderNome) {
  const { rows: [msg] } = await query(
    `INSERT INTO mensagens (conversa_id, from_type, type, content, sender_nome, status) VALUES ($1,'me','text',$2,$3,'sent') RETURNING *`,
    [conv.id, texto, senderNome || 'Agendada']);
  const { rows: [convUpd] } = await query("UPDATE conversas SET last_message=$1, last_from='me', last_message_at=NOW(), bot_ativo=false WHERE id=$2 RETURNING *", [texto.slice(0, 100), conv.id]);
  if (convUpd) cacheUpdate(convUpd);
  socketEmit('new_message', { convId: conv.id, message: msg, conv: convUpd || conv });
  if (conv.channel === 'whatsapp' && zapiOk()) {
    const waNumber = conv.contact_id ? conv.contact_id.replace('@s.whatsapp.net', '') : `55${conv.phone}`;
    const phone55 = waNumber.startsWith('55') ? waNumber : `55${waNumber}`;
    await zapiCall('/send-text', 'POST', { phone: phone55, message: texto });
  }
  return msg;
}

// Agendador: a cada 60s dispara as pendentes cujo horário chegou.
let agendadorRodando = false;
async function processarAgendadas() {
  if (agendadorRodando) return;
  agendadorRodando = true;
  try {
    const { rows } = await query(`SELECT * FROM mensagens_agendadas WHERE status = 'pendente' AND enviar_em <= NOW() ORDER BY enviar_em LIMIT 20`).catch(() => ({ rows: [] }));
    for (const ag of rows) {
      try {
        const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [ag.conversa_id]);
        if (!conv) { await query(`UPDATE mensagens_agendadas SET status='erro', erro='conversa não encontrada' WHERE id=$1`, [ag.id]); continue; }
        await enviarTextoConversa(conv, ag.texto, ag.criado_por);
        await query(`UPDATE mensagens_agendadas SET status='enviada', enviada_em=NOW() WHERE id=$1`, [ag.id]);
      } catch (e) {
        await query(`UPDATE mensagens_agendadas SET status='erro', erro=$2 WHERE id=$1`, [ag.id, String(e.message).slice(0, 200)]).catch(() => {});
      }
    }
  } finally { agendadorRodando = false; }
}
setInterval(processarAgendadas, 60000);
setTimeout(processarAgendadas, 15000); // primeira passada logo após subir

// Agenda uma mensagem pra ser enviada no futuro
r.post('/conversations/:id/agendar', async (req, res) => {
  try {
    const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
    if (!podeVerSetor(req.user, conv)) return res.status(403).json({ error: 'Sem acesso a esta conversa.' });
    const texto = String((req.body || {}).texto || '').trim();
    if (!texto) return res.status(400).json({ error: 'Escreva a mensagem.' });
    const quando = new Date((req.body || {}).enviar_em);
    if (isNaN(quando.getTime())) return res.status(400).json({ error: 'Data/hora inválida.' });
    if (quando.getTime() < Date.now() - 60000) return res.status(400).json({ error: 'Escolha uma data/hora no futuro.' });
    const { rows: [ag] } = await query(
      `INSERT INTO mensagens_agendadas (conversa_id, texto, enviar_em, criado_por, criado_por_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, texto.slice(0, 4000), quando.toISOString(), req.user.nome, req.user.id]);
    res.status(201).json(ag);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Lista as agendadas de uma conversa (pendentes primeiro)
r.get('/conversations/:id/agendadas', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, texto, enviar_em, status, criado_por, enviada_em FROM mensagens_agendadas
       WHERE conversa_id = $1 ORDER BY (status='pendente') DESC, enviar_em`, [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Cancela uma mensagem agendada (só se ainda pendente)
r.delete('/agendadas/:id', async (req, res) => {
  try {
    await query(`UPDATE mensagens_agendadas SET status='cancelada' WHERE id=$1 AND status='pendente'`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── UPLOAD FILE ──────────────────────────────────────────────────────────────
r.post('/conversations/:id/upload', upload.single('file'), async (req, res) => {
  try {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'Arquivo não enviado' });

    const type = f.mimetype.startsWith('audio/') ? 'audio'
               : f.mimetype === 'image/webp' ? 'sticker'   // figurinha do WhatsApp
               : f.mimetype.startsWith('image/') ? 'image'
               : f.mimetype.startsWith('video/') ? 'video'
               : 'document';

    // Converte para base64 para armazenar inline (Railway sem storage persistente)
    const base64 = f.buffer.toString('base64');
    const dataUrl = `data:${f.mimetype};base64,${base64}`;

    const preview = type === 'audio' ? '🎵 Áudio'
                  : type === 'sticker' ? '🎭 Figurinha'
                  : type === 'image' ? '📷 Imagem'
                  : type === 'video' ? '🎥 Vídeo'
                  : `📎 ${f.originalname}`;

    const { rows: [msg] } = await query(`
      INSERT INTO mensagens (conversa_id, from_type, type, content, filename, mimetype, file_size, sender_id, sender_nome)
      VALUES ($1, 'me', $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.params.id, type, dataUrl, f.originalname, f.mimetype, f.size, req.user.id, req.user.nome]
    );

    await query("UPDATE conversas SET last_message = $1, last_from = 'me', last_message_at = NOW() WHERE id = $2", [preview, req.params.id]);

    // Envia via Evolution API usando base64
    const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [req.params.id]);
    if (conv && conv.channel === 'whatsapp') {
      try {
        const waNumber = conv.contact_id
          ? conv.contact_id.replace('@s.whatsapp.net', '')
          : `55${conv.phone}`;
        const phone55 = waNumber.startsWith('55') ? waNumber : `55${waNumber}`;
        let sent = false;

        // ── Z-API (caminho principal em produção) ──────────────────────────────
        if (zapiOk()) {
          let zr;
          if (type === 'audio')        zr = await zapiCall('/send-audio',   'POST', { phone: phone55, audio: dataUrl });
          else if (type === 'sticker') zr = await zapiCall('/send-sticker', 'POST', { phone: phone55, sticker: dataUrl });
          else if (type === 'image')   zr = await zapiCall('/send-image',   'POST', { phone: phone55, image: dataUrl, caption: '' });
          else if (type === 'video')   zr = await zapiCall('/send-video',   'POST', { phone: phone55, video: dataUrl, caption: '' });
          else {
            const ext = (f.originalname.split('.').pop() || 'bin').toLowerCase().slice(0, 5);
            zr = await zapiCall(`/send-document/${ext}`, 'POST', { phone: phone55, document: dataUrl, fileName: f.originalname });
          }
          if (zr?.ok) {
            const zd = await zr.json().catch(() => ({}));
            if (zd.zaapId || zd.messageId) {
              await query("UPDATE mensagens SET status = 'delivered', wa_msg_id = $1 WHERE id = $2", [zd.messageId || zd.zaapId, msg.id]);
              sent = true;
            }
          } else if (zr) {
            console.error('Z-API media send falhou:', zr.status, (await zr.text().catch(() => '')).slice(0, 200));
          }
        }

        // ── Evolution (fallback legado) ────────────────────────────────────────
        if (!sent && EVO_URL() && EVO_KEY()) {
          if (type === 'audio') {
            await evoFetch(`/message/sendWhatsAppAudio/${EVO_INST()}`, 'POST', {
              number: waNumber,
              audio: base64,
              encoding: true
            });
          } else {
            const mediatype = type === 'image' || type === 'sticker' ? 'image' : type === 'video' ? 'video' : 'document';
            await evoFetch(`/message/sendMedia/${EVO_INST()}`, 'POST', {
              number: waNumber,
              mediatype,
              mimetype: f.mimetype,
              media: base64,
              fileName: f.originalname,
              caption: ''
            });
          }
          await query("UPDATE mensagens SET status = 'delivered' WHERE id = $1", [msg.id]);
        }
      } catch (e) { console.error('Media send error:', e.message); }
    }

    res.json(msg);
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── CONVERT TO LEAD ──────────────────────────────────────────────────────────
r.post('/conversations/:id/to-lead', async (req, res) => {
  try {
    const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Não encontrado' });

    if (conv.lead_id) {
      const { rows: [l] } = await query('SELECT * FROM leads WHERE id = $1', [conv.lead_id]);
      if (l) return res.json({ lead: l, created: false });
    }

    // Check by phone
    if (conv.phone) {
      const { rows: [existing] } = await query('SELECT * FROM leads WHERE telefone = $1 LIMIT 1', [conv.phone]);
      if (existing) {
        await query('UPDATE conversas SET lead_id = $1 WHERE id = $2', [existing.id, conv.id]);
        return res.json({ lead: existing, created: false });
      }
    }

    // Create new lead
    const { rows: [lead] } = await query(`
      INSERT INTO leads (nome, telefone, origem, interesse, status, responsavel_id, observacoes, setor)
      VALUES ($1,$2,$3,'Consulta','Novo lead',$4,$5, $6) RETURNING *`,
      [conv.contact_name, conv.phone || '', conv.channel === 'instagram' ? 'Instagram' : 'WhatsApp', conv.responsavel_id || req.user.id, `Lead automático via ${conv.channel}`, conv.setor || 'vacinas']
    );

    await query('UPDATE conversas SET lead_id = $1 WHERE id = $2', [lead.id, conv.id]);
    await query('INSERT INTO notificacoes (tipo,titulo,texto,lead_id) VALUES ($1,$2,$3,$4)', ['novo_lead','Lead criado',`${lead.nome} adicionado ao funil`,lead.id]);

    res.json({ lead, created: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── AI ASSIST — Copiloto da equipe (análise estruturada) ────────────────────
// v2: o frontend manda só { convId, mode } e o backend monta o contexto inteiro
// (conversa + lead + catálogo/calendário/preços da clínica) e devolve JSON
// estruturado — sem emojis, sem markdown cru. O modo legado { prompt } continua
// funcionando para compatibilidade.
const AI_ASSIST_MODES = {
  resumo: {
    instrucao: `Analise a conversa e devolva um diagnóstico comercial preciso e específico (nada de generalidades).`,
    schema: `{
  "resumo": "2 a 3 frases objetivas sobre onde esta conversa está e o que importa agora",
  "paciente": "para quem é o atendimento (nome e idade se houver) ou null",
  "interesse": "o que o cliente quer, específico (ex: Pacote de 5 meses para a Antonella)",
  "estagio": "descoberta | consideracao | negociacao | fechamento | pos_venda",
  "intencao": "baixa | media | alta",
  "objecoes": ["objeções reais detectadas na conversa, vazio se nenhuma"],
  "sinais": ["sinais de compra ou de risco observados, citando o que o cliente disse"],
  "proximo_passo": "a UMA ação concreta que a equipe deve fazer agora"
}`,
  },
  score: {
    instrucao: `Avalie o potencial deste lead com rigor de gestor comercial. Score baixo se a conversa esfriou ou não há intenção real; alto somente com sinais concretos.`,
    schema: `{
  "score": 0,
  "classificacao": "frio | morno | quente",
  "urgencia": "baixa | media | alta",
  "justificativa": "1 a 2 frases diretas explicando o score com base no que foi dito",
  "fatores": [{ "fator": "descrição curta", "impacto": "positivo | negativo" }],
  "recomendacao": "o que fazer com este lead agora, em 1 frase"
}`,
  },
  estrategia: {
    instrucao: `Defina a melhor estratégia de fechamento AGORA, específica para esta conversa: qual produto/pacote oferecer (use o catálogo), qual objeção atacar, qual gatilho usar. Proibido conselho genérico.`,
    schema: `{
  "leitura": "1 a 2 frases sobre o momento do cliente e o que está travando",
  "produto_alvo": "produto/pacote/plano específico do catálogo a oferecer, com valor",
  "objecao_principal": "a principal barreira a vencer ou null",
  "passos": ["sequência de 2 a 4 passos concretos, na ordem"],
  "frase_pronta": "uma mensagem pronta para a atendente enviar agora, no tom das melhores atendentes"
}`,
  },
  resposta: {
    instrucao: `Escreva a próxima mensagem perfeita para a atendente enviar a este cliente. Curta (1 a 4 frases), tom acolhedor e humano das melhores atendentes da clínica, no máximo uma pergunta, conduzindo para a próxima etapa. Sem emojis.`,
    schema: `{
  "texto": "a mensagem pronta para enviar",
  "racional": "1 frase explicando por que essa abordagem"
}`,
  },
};

// Marcar conversa como NÃO lida (a atendente leu/ouviu mas quer voltar depois)
r.patch('/conversations/:id/unread', async (req, res) => {
  try {
    const { rows: [conv] } = await query(
      'UPDATE conversas SET unread = GREATEST(unread, 1) WHERE id = $1 RETURNING *', [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Não encontrada' });
    cacheUpdate(conv);
    socketEmit('conv_updated', { convId: conv.id, unread: conv.unread });
    res.json({ ok: true, unread: conv.unread });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── COPILOTO CHAT — conversa livre com a IA, com anexo de imagem (vision) ───
// Caso de uso real: a mãe manda a foto da carteira de vacinação, a atendente
// anexa aqui e pergunta "quais vacinas faltam?" — a IA lê a imagem e responde
// com base no calendário oficial da clínica.
// ─── EDITAR mensagem enviada (limite do WhatsApp: ~15 min) ───────────────────
r.put('/conversations/:id/messages/:msgId', async (req, res) => {
  try {
    const novo = String(req.body.content || '').trim().slice(0, 4000);
    if (!novo) return res.status(400).json({ error: 'Mensagem vazia' });
    const { rows: [m] } = await query('SELECT * FROM mensagens WHERE id = $1 AND conversa_id = $2', [req.params.msgId, req.params.id]);
    if (!m) return res.status(404).json({ error: 'Mensagem não encontrada' });
    if (m.from_type !== 'me') return res.status(403).json({ error: 'Só dá pra editar mensagens enviadas pela equipe' });
    if (m.type !== 'text') return res.status(400).json({ error: 'Só mensagens de texto podem ser editadas' });
    if (m.status === 'deleted') return res.status(400).json({ error: 'Essa mensagem foi apagada' });
    if (!m.wa_msg_id) return res.status(400).json({ error: 'Aguarde a confirmação de envio pra editar' });
    if (Date.now() - new Date(m.created_at).getTime() > 15 * 60 * 1000)
      return res.status(400).json({ error: 'O WhatsApp só permite editar até 15 minutos após o envio' });

    const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [req.params.id]);
    let phoneNum = String(conv?.phone || '').replace(/\D/g, '');
    if (phoneNum.startsWith('55') && phoneNum.length >= 12) phoneNum = phoneNum.slice(2);
    const primeiroNome = (m.sender_nome || '').trim().split(' ')[0];
    const comAssinatura = primeiroNome && !novo.trimStart().startsWith('*') ? `*${primeiroNome}:*\n${novo}` : novo;

    if (zapiOk()) {
      const zr = await zapiCall('/edit-message', 'POST', { phone: `55${phoneNum}`, messageId: m.wa_msg_id, message: comAssinatura });
      if (!zr?.ok) {
        const corpo = await zr?.text().catch(() => '');
        console.error('edit-message falhou:', zr?.status, corpo.slice(0, 150));
        return res.status(502).json({ error: 'O WhatsApp recusou a edição (talvez o tempo tenha passado).' });
      }
    }
    const { rows: [upd] } = await query('UPDATE mensagens SET content = $1, editada = true WHERE id = $2 RETURNING *', [novo, m.id]);
    await query(`UPDATE conversas SET last_message = $1 WHERE id = $2 AND last_message_at = (SELECT MAX(created_at) FROM mensagens WHERE conversa_id = $2) AND $3 = (SELECT id FROM mensagens WHERE conversa_id = $2 ORDER BY created_at DESC LIMIT 1)`, [novo, conv.id, m.id]).catch(() => {});
    socketEmit('message_updated', { convId: conv.id, messageId: m.id, content: novo, editada: true });
    res.json(upd);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── APAGAR mensagem enviada (apaga pra todos no WhatsApp) ───────────────────
r.delete('/conversations/:id/messages/:msgId', async (req, res) => {
  try {
    const { rows: [m] } = await query('SELECT * FROM mensagens WHERE id = $1 AND conversa_id = $2', [req.params.msgId, req.params.id]);
    if (!m) return res.status(404).json({ error: 'Mensagem não encontrada' });
    if (m.from_type !== 'me') return res.status(403).json({ error: 'Só dá pra apagar mensagens enviadas pela equipe' });
    if (m.status === 'deleted') return res.json({ ok: true, whatsapp: true });

    const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [req.params.id]);
    let phoneNum = String(conv?.phone || '').replace(/\D/g, '');
    if (phoneNum.startsWith('55') && phoneNum.length >= 12) phoneNum = phoneNum.slice(2);

    // Tenta apagar no WhatsApp (pra todos) — best-effort. Se a Z-API recusar (passou
    // do tempo limite do WhatsApp, sem wa_msg_id, etc.), AINDA assim apaga no CRM,
    // pra a mensagem sumir da tela. Não trava mais o apagar.
    let whatsappOk = false, aviso = null;
    if (m.wa_msg_id && zapiOk()) {
      try {
        const zr = await zapiCall(`/messages?phone=55${phoneNum}&messageId=${encodeURIComponent(m.wa_msg_id)}&owner=true`, 'DELETE');
        whatsappOk = !!zr?.ok;
        if (!whatsappOk) {
          const corpo = await zr?.text().catch(() => '');
          console.error('delete-message Z-API recusou:', zr?.status, corpo.slice(0, 150));
          aviso = 'Apaguei aqui no CRM, mas o WhatsApp não deixou apagar pra todos (geralmente porque passou do tempo limite dele).';
        }
      } catch (e) { console.error('delete-message erro:', e.message); aviso = 'Apaguei no CRM; o WhatsApp não respondeu.'; }
    } else {
      aviso = 'Apaguei aqui no CRM. (Não havia ID de envio confirmado pra apagar no WhatsApp.)';
    }

    await query(`UPDATE mensagens SET status = 'deleted', content = '🚫 Mensagem apagada', media_data = NULL, editada = false WHERE id = $1`, [m.id]);
    await query(`UPDATE conversas SET last_message = '🚫 Mensagem apagada' WHERE id = $1 AND $2 = (SELECT id FROM mensagens WHERE conversa_id = $1 ORDER BY created_at DESC LIMIT 1)`, [conv.id, m.id]).catch(() => {});
    socketEmit('message_updated', { convId: conv.id, messageId: m.id, content: '🚫 Mensagem apagada', status: 'deleted' });
    res.json({ ok: true, whatsapp: whatsappOk, aviso });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── RESET DE TRIAGEM (gestão): força o menu de boas-vindas na próxima msg ───
r.post('/conversations/:id/reset-triagem', async (req, res) => {
  try {
    if (req.user?.role !== 'master') return res.status(403).json({ error: 'Apenas o master (Miécio ou Nágila) pode reativar o bot.' });
    const { rows: [conv] } = await query(
      `UPDATE conversas SET bot_ativo = true, menu_enviado = false, triagem_ts = NULL, captura_etapa = NULL
       WHERE id = $1 RETURNING id, bot_ativo`, [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
    const cached = convoCache.get(conv.id);
    if (cached) cacheUpdate({ ...cached, bot_ativo: true });
    socketEmit('bot_status', { convId: conv.id, bot_ativo: true });
    console.log(`TRIAGEM conv=${conv.id} RESET manual por ${req.user.nome}`);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── IA EXTRAI DADOS DA CONVERSA (pré-preenche o agendamento/ficha) ──────────
r.post('/ai-extrair', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'IA não configurada' });
    const { convId } = req.body;
    if (!convId) return res.status(400).json({ error: 'convId é obrigatório' });
    const { rows: msgs } = await query(
      `SELECT from_type, content FROM mensagens
       WHERE conversa_id = $1 AND type = 'text' AND length(content) > 1
       ORDER BY created_at DESC LIMIT 50`, [convId]);
    if (!msgs.length) return res.json({});
    const texto = msgs.reverse().map(m => `${m.from_type === 'contact' ? 'CLIENTE' : 'ATENDENTE'}: ${m.content.slice(0, 400)}`).join('\n');
    const data = await openaiMessages({
      model: 'gpt-4o-mini', max_tokens: 350, json: true,
      system: `Extraia da conversa abaixo os dados cadastrais que o CLIENTE informou. Devolva APENAS um JSON com as chaves: paciente (nome do paciente/bebê), responsavel (nome do responsável/mãe/pai), endereco (endereço completo com bairro), email, nascimento (data de nascimento do paciente no formato YYYY-MM-DD), telefone_extra (outro telefone citado), observacao (preferências relevantes, ex: atendimento domiciliar). Use null quando o dado não foi informado. Não invente nada.`,
      messages: [{ role: 'user', content: texto.slice(0, 8000) }],
    });
    if (data.error) return res.status(502).json({ error: data.error.message || 'Erro na IA' });
    const raw = (data.content?.find(c => c.type === 'text')?.text || '{}').trim();
    let extraido = {};
    try { extraido = JSON.parse(raw.replace(/^```json|```$/g, '')); } catch {}
    res.json(extraido);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BIBLIOTECA → CONVERSA: envia a mídia escolhida pelo WhatsApp ────────────
r.post('/conversations/:id/send-midia', async (req, res) => {
  try {
    const { midiaId } = req.body;
    const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
    const { rows: [m] } = await query('SELECT * FROM biblioteca_midias WHERE id = $1', [midiaId]);
    if (!m) return res.status(404).json({ error: 'Mídia não encontrada' });
    if (!zapiOk()) return res.status(503).json({ error: 'Z-API não configurada' });

    let phoneNum = String(conv.phone || '').replace(/\D/g, '');
    if (phoneNum.startsWith('55') && phoneNum.length >= 12) phoneNum = phoneNum.slice(2);
    const dataUrl = `data:${m.mime || 'image/jpeg'};base64,${m.data}`;

    let zr, tipoMsg = 'image', preview = `🖼️ ${m.titulo}`;
    if (m.tipo === 'video') {
      zr = await zapiCall('/send-video', 'POST', { phone: `55${phoneNum}`, video: dataUrl });
      tipoMsg = 'video'; preview = `🎥 ${m.titulo}`;
    } else if (m.tipo === 'figurinha') {
      zr = await zapiCall('/send-sticker', 'POST', { phone: `55${phoneNum}`, sticker: dataUrl });
      tipoMsg = 'sticker'; preview = '💟 Figurinha';
    } else {
      zr = await zapiCall('/send-image', 'POST', { phone: `55${phoneNum}`, image: dataUrl, caption: m.tipo === 'depoimento' ? '⭐' : '' });
    }
    if (!zr?.ok) {
      const corpo = await zr?.text().catch(() => '');
      console.error('send-midia falhou:', zr?.status, corpo.slice(0, 150));
      return res.status(502).json({ error: 'O WhatsApp recusou o envio. Tente de novo.' });
    }
    const { rows: [pm] } = await query(
      `INSERT INTO mensagens (conversa_id, from_type, sender_id, sender_nome, type, content, media_data, status, created_at)
       VALUES ($1,'me',$2,$3,$4,$5,$6,'delivered',NOW()) RETURNING *`,
      [conv.id, req.user?.id || null, req.user?.nome || 'Atendente', tipoMsg, preview, dataUrl]);
    await query("UPDATE conversas SET last_message = $1, last_from = 'me', last_message_at = NOW() WHERE id = $2", [preview, conv.id]);
    const cached = convoCache.get(conv.id);
    if (cached) cacheUpdate({ ...cached, last_message: preview, last_from: 'me', last_message_at: new Date().toISOString() });
    if (pm) socketEmit('new_message', { convId: conv.id, message: pm, conv });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PROPOSTA MANUAL (modal do Inbox) ─────────────────────────────────────────
// Catálogo REAL (mesmo da Vitta): planos com preço fechado, pacotes por idade
// e vacinas avulsas — substitui o catálogo fake que estava chumbado no modal.
r.get('/proposta/catalogo', async (req, res) => {
  try {
    const planos = propostaGen.PLANOS.map(pl => {
      const pr = propostaGen.PRECOS_PLANO[pl.id] || {};
      return { id: pl.id, nome: pl.nome, periodo: pl.periodo, avista: pr.avista, credito: pr.credito, parcelas: pr.parcelas };
    });
    const pacotes = propostaGen.PACOTES.map(pc => ({
      id: pc.id, label: pc.label, avista: pc.avista, credito: pc.credito, parcelas: pc.parcelas,
      vacinas: pc.vacinas.map(i => propostaGen.VACINAS[i]?.nome).filter(Boolean),
    }));
    const vacinas = propostaGen.VACINAS.map((v, idx) => ({ idx, nome: v.nome, avista: v.avista, credito: v.credito, descricao: v.descricao }));
    res.json({ planos, pacotes, vacinas });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Gera o PDF real (mesmos templates da Vitta) e envia pelo WhatsApp da conversa
r.post('/proposta/enviar', async (req, res) => {
  try {
    const { convId, tipo, planoId, pacoteId, vacinasIdx, nomeCliente, nomeBebe, template, parcelas } = req.body;
    if (!convId) return res.status(400).json({ error: 'convId é obrigatório' });
    const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [convId]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
    if (!zapiOk()) return res.status(503).json({ error: 'Z-API não configurada' });

    let phoneNum = String(conv.phone || '').replace(/\D/g, '');
    if (phoneNum.startsWith('55') && phoneNum.length >= 12) phoneNum = phoneNum.slice(2);

    let pdfBuf, fileName, descricao;

    if (tipo === 'plano') {
      const plano = propostaGen.PLANOS.find(pl => pl.id === planoId);
      if (!plano) return res.status(400).json({ error: 'Plano inválido' });
      pdfBuf = await gerarPlanoPDF({ planoId });
      fileName = `${plano.nome.replace(/\s+/g, '-')}.pdf`;
      descricao = plano.nome;
    } else if (tipo === 'pacote') {
      const mp = propostaGen.montarPacote(pacoteId);
      if (!mp) return res.status(400).json({ error: 'Pacote inválido' });
      pdfBuf = await gerarPropostaPDF({
        nomeCliente: String(nomeCliente || conv.contact_name || 'Cliente').slice(0, 60),
        nomeBebe: String(nomeBebe || '').slice(0, 60) || undefined,
        template: 'infantil',
        pacoteNome: mp.label,
        vacinas: mp.vacinas,
        desconto: mp.desconto,
        parcelas: mp.parcelas,
        creditoFechado: mp.credito,
      });
      fileName = 'Proposta-Vittalis.pdf';
      descricao = mp.label;
    } else { // avulsas
      const idxs = Array.isArray(vacinasIdx) ? vacinasIdx.map(Number).filter(n => Number.isInteger(n) && propostaGen.VACINAS[n]) : [];
      const vacs = idxs.map(n => propostaGen.VACINAS[n]);
      if (!vacs.length) return res.status(400).json({ error: 'Selecione pelo menos uma vacina' });
      const parc = Math.min(Math.max(parseInt(parcelas) || 1, 1), 12);
      pdfBuf = await gerarPropostaPDF({
        nomeCliente: String(nomeCliente || conv.contact_name || 'Cliente').slice(0, 60),
        nomeBebe: String(nomeBebe || '').slice(0, 60) || undefined,
        template: template === 'infantil' ? 'infantil' : 'adulto',
        pacoteNome: 'Proposta de Vacinas',
        vacinas: vacs,
        desconto: 0,
        parcelas: parc,
      });
      fileName = 'Proposta-Vittalis.pdf';
      descricao = `Proposta: ${vacs.map(v => v.nome).join(', ')}`.slice(0, 90);
    }

    const zr = await enviarPDFZapi(`55${phoneNum}`, pdfBuf.toString('base64'), fileName);
    const zrBody = await zr?.text().catch(() => '');
    if (!zr?.ok) {
      console.error('Proposta manual Z-API falhou:', zr?.status, zrBody.slice(0, 200));
      return res.status(502).json({ error: 'O WhatsApp recusou o envio do PDF. Tente novamente.' });
    }

    const { rows: [pmsg] } = await query(
      `INSERT INTO mensagens (conversa_id, from_type, sender_id, sender_nome, type, content, filename, status, created_at)
       VALUES ($1,'me',$2,$3,'document',$4,$5,'delivered',NOW()) RETURNING *`,
      [convId, req.user?.id || null, req.user?.nome || 'Atendente', `📎 ${descricao}`, fileName]
    );
    await query("UPDATE conversas SET last_message = $1, last_from = 'me', last_message_at = NOW() WHERE id = $2", [`📎 ${descricao}`.slice(0, 100), convId]);
    const cached = convoCache.get(convId);
    if (cached) cacheUpdate({ ...cached, last_message: `📎 ${descricao}`.slice(0, 100), last_from: 'me', last_message_at: new Date().toISOString() });
    if (pmsg) socketEmit('new_message', { convId, message: pmsg, conv });

    res.json({ ok: true, descricao });
  } catch (err) {
    console.error('proposta/enviar:', err.message);
    res.status(500).json({ error: err.message });
  }
});


r.post('/ai-image', async (req, res) => {
  try {
    const KEY = process.env.OPENAI_API_KEY;
    if (!KEY) return res.status(503).json({ error: 'IA não configurada (OPENAI_API_KEY ausente)' });

    const { message = '', image } = req.body;
    const promptUsuario = String(message || '').trim();
    if (!promptUsuario && !image?.data) return res.status(400).json({ error: 'Descreva a imagem que deseja gerar ou editar' });

    const { default: fetch } = await import('node-fetch');
    const FormData = (await import('form-data')).default;

    const size = process.env.OPENAI_IMAGE_SIZE || '1024x1536';
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

    const promptBase = `Você é um designer profissional da Vittalis Saúde, clínica de saúde, pediatria, vacinação e terapias.

Tarefa do usuário:
${promptUsuario || 'Melhore a imagem anexada mantendo a proposta original.'}

REGRAS OBRIGATÓRIAS:
- Se houver imagem anexada, edite a própria imagem. Não transforme em conselho de design.
- Preserve a arte inteira, sem cortar topo, rodapé, preço, contatos, logo, benefícios, texto, bebê/pessoa ou informações importantes.
- Mantenha o enquadramento vertical completo quando a imagem for folder/story.
- Ao adicionar balões, ícones ou elementos decorativos, use poucos elementos, com acabamento profissional, sem cobrir textos ou valores.
- Se o usuário reclamar que cortou algo, corrija mantendo a imagem completa e adicionando apenas o ajuste pedido.
- Preserve a identidade visual da Vittalis Saúde, usando azul/tiffany, branco e tons limpos quando fizer sentido.
- Entregue uma imagem pronta para WhatsApp/Instagram, com boa legibilidade e aparência comercial.`;

    let data;

    if (image?.data && image?.media_type) {
      const form = new FormData();
      const buf = Buffer.from(String(image.data), 'base64');
      const ext = image.media_type.includes('png') ? 'png' : image.media_type.includes('webp') ? 'webp' : 'jpg';
      form.append('model', model);
      form.append('image', buf, { filename: `imagem.${ext}`, contentType: image.media_type });
      form.append('prompt', promptBase);
      form.append('size', size);

      const resp = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, ...form.getHeaders() },
        body: form,
      });
      data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error?.message || `Erro ao editar imagem (${resp.status})`);
      }
    } else {
      const resp = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model, prompt: promptBase, size }),
      });
      data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error?.message || `Erro ao gerar imagem (${resp.status})`);
      }
    }

    const item = data.data?.[0] || {};
    const imageOut = item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url;
    if (!imageOut) throw new Error('A OpenAI não retornou a imagem');

    res.json({ texto: 'Imagem gerada. Confira abaixo.', image: imageOut });
  } catch (err) {
    console.error('ai-image:', err.message);
    res.status(500).json({ error: err.message });
  }
});

r.post('/ai-chat', async (req, res) => {
  try {
    const KEY = process.env.OPENAI_API_KEY;
    if (!KEY) return res.status(503).json({ error: 'IA não configurada' });
    const { convId, history = [], message = '', image } = req.body;
    if (!message.trim() && !image && !req.body.pdf && !req.body.audio) return res.status(400).json({ error: 'Mensagem vazia' });

    // Contexto opcional: a conversa do WhatsApp aberta ao lado
    let contexto = '';
    if (convId) {
      const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [convId]);
      if (conv) {
        const { rows: histRows } = await query(
          `SELECT from_type, type, content, filename FROM mensagens
           WHERE conversa_id = $1 AND type IN ('text','document') AND from_type <> 'system'
           ORDER BY created_at DESC LIMIT 20`, [convId]);
        const transcript = histRows.reverse().map(m => {
          const quem = m.from_type === 'contact' ? (conv.contact_name || 'Cliente') : m.from_type === 'bot' ? 'Vitta' : 'Atendente';
          const txt = m.type === 'document' ? `[PDF: ${m.filename || 'documento'}]` : String(m.content || '').slice(0, 300);
          return `${quem}: ${txt}`;
        }).join('\n');
        contexto = `\n\nCONVERSA ABERTA NO MOMENTO (${conv.contact_name || 'cliente'}):\n${transcript}`;
      }
    }

    const conhecimento = montarConhecimentoVacinal();
    const tabelaPrecos = formatarPrecos(await getPrecosVittaSys());
    const sysPrompt = `Você é o Copiloto da equipe da Vittalis Saúde (clínica de pediatria, vacinação e especialidades em São Luís-MA). Quem fala com você é a ATENDENTE, não o cliente. Ajude com o que ela pedir: analisar carteiras de vacinação em foto, dizer quais vacinas faltam por idade, calcular valores, sugerir abordagens de venda, redigir mensagens, tirar dúvidas do calendário.

Seja direto, prático e específico. Sem emojis. Quando analisar uma carteira de vacinação, liste o que JÁ foi aplicado (se legível), o que FALTA segundo o calendário da clínica para a idade, e o valor (pacote ou avulsas). Se a imagem estiver ilegível em algum ponto, diga exatamente o que não deu pra ler em vez de inventar. Se a atendente pedir edição visual, folder, flyer, post, story, balões, cor, layout ou geração de imagem, responda no máximo que a edição será feita pela ferramenta de imagem; não dê tutorial de Canva/Photoshop.

CALENDÁRIO VACINAL OFICIAL:
${conhecimento.calendario}

PACOTES MENSAIS (preço fechado):
${conhecimento.pacotes}

PLANOS COMPLETOS:
${conhecimento.planos}
${tabelaPrecos}${contexto}`;

    // Áudio da atendente? Transcreve primeiro (Whisper) e usa como pergunta
    let pergunta = String(message || '').trim();
    let transcricao = null;
    if (req.body.audio?.data) {
      transcricao = await transcreverAudio(req.body.audio.data, req.body.audio.media_type || 'audio/webm');
      pergunta = pergunta ? `${pergunta}\n${transcricao}` : transcricao;
      if (!pergunta) return res.status(400).json({ error: 'Não entendi o áudio — tente de novo' });
    }

    // Histórico (turnos texto) no formato da Responses API
    const input = [];
    for (const h of (history || []).slice(-12)) {
      if (!h?.content) continue;
      const role = h.role === 'assistant' ? 'assistant' : 'user';
      input.push({ role, content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text: String(h.content).slice(0, 1500) }] });
    }
    // Turno atual: texto + imagem e/ou PDF anexados
    const userContent = [];
    if (image?.data && image?.media_type) {
      userContent.push({ type: 'input_image', image_url: `data:${image.media_type};base64,${image.data}` });
    }
    if (req.body.pdf?.data) {
      userContent.push({ type: 'input_file', filename: String(req.body.pdf.name || 'documento.pdf').slice(0, 80), file_data: `data:application/pdf;base64,${req.body.pdf.data}` });
    }
    userContent.push({ type: 'input_text', text: pergunta || 'Analise o arquivo anexado.' });
    input.push({ role: 'user', content: userContent });

    const { default: fetch } = await import('node-fetch');
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-4o', max_output_tokens: 1000, instructions: sysPrompt, input }),
    });
    const data = await resp.json();
    if (data.error) return res.status(502).json({ error: data.error.message || 'Erro na IA' });
    const texto = (data.output_text
      || data.output?.flatMap(o => o.content || []).find(c => c.type === 'output_text')?.text
      || '').trim();
    res.json({ texto, transcricao });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/ai-assist', async (req, res) => {
  try {
    const { prompt, convId, mode } = req.body;
    const KEY = process.env.OPENAI_API_KEY;
    const { default: fetch } = await import('node-fetch');

    // ── Modo legado: repassa o prompt cru (compatibilidade) ──────────────────
    if (prompt && !mode) {
      if (!KEY) return res.json({ text: 'IA não configurada (OPENAI_API_KEY ausente).' });
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await resp.json();
      return res.json({ text: data.choices?.[0]?.message?.content || 'Sem resposta' });
    }

    // ── Modo estruturado ──────────────────────────────────────────────────────
    const cfgMode = AI_ASSIST_MODES[mode];
    if (!cfgMode) return res.status(400).json({ error: 'Modo inválido' });
    if (!convId) return res.status(400).json({ error: 'convId é obrigatório' });
    if (!KEY) return res.status(503).json({ error: 'IA não configurada (OPENAI_API_KEY ausente)' });

    const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [convId]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    // Lead vinculado (se houver) dá contexto extra
    let leadInfo = '';
    if (conv.lead_id) {
      const { rows: [lead] } = await query('SELECT * FROM leads WHERE id = $1', [conv.lead_id]);
      if (lead) {
        leadInfo = `\nLEAD NO FUNIL: etapa "${lead.status}", interesse ${lead.interesse}` +
          (lead.valor_proposta > 0 ? `, proposta de R$ ${lead.valor_proposta}` : '') +
          (lead.tags?.length ? `, tags: ${lead.tags.join(', ')}` : '') +
          (lead.observacoes ? `\nObservações da equipe: ${lead.observacoes}` : '');
      }
    }

    // Conversa em ordem cronológica (texto + documentos enviados)
    const { rows: histRows } = await query(
      `SELECT from_type, type, content, filename, sender_nome, created_at FROM mensagens
       WHERE conversa_id = $1 AND type IN ('text','document') AND from_type <> 'system'
       ORDER BY created_at DESC LIMIT 40`, [convId]);
    const hist = histRows.reverse();
    if (!hist.length) return res.status(400).json({ error: 'Conversa sem mensagens para analisar' });

    const transcript = hist.map(m => {
      const quem = m.from_type === 'contact' ? (conv.contact_name || 'Cliente')
        : m.from_type === 'bot' ? 'Vitta (IA)'
        : `Atendente${m.sender_nome ? ` (${m.sender_nome})` : ''}`;
      const txt = m.type === 'document' ? `[enviou PDF: ${m.filename || m.content || 'documento'}]` : String(m.content || '').slice(0, 500);
      const hora = new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `[${hora}] ${quem}: ${txt}`;
    }).join('\n');

    const conhecimento = montarConhecimentoVacinal();
    const tabelaPrecos = formatarPrecos(await getPrecosVittaSys());

    // ── Modo CORRIGIR: só ortografia/pontuação, sem mudar o tom (pedido da equipe) ──
    if (mode === 'corrigir') {
      const texto = String(req.body.texto || prompt || '').slice(0, 2000);
      if (!texto.trim()) return res.status(400).json({ error: 'Nada pra corrigir' });
      const data = await openaiMessages({
        model: 'gpt-4o-mini', max_tokens: 700, json: true,
        system: 'Corrija APENAS ortografia, acentuação e pontuação do texto em português, preservando o tom, gírias leves, emojis e o sentido. NÃO reescreva, NÃO formalize, NÃO acrescente nada. Responda somente JSON: {"texto":"..."}',
        messages: [{ role: 'user', content: texto }],
      });
      if (data.error) return res.status(502).json({ error: data.error.message || 'Erro na IA' });
      const raw = (data.content?.find(c => c.type === 'text')?.text || '{}').trim();
      let out = null;
      try { out = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()); } catch {}
      return res.json({ texto: out?.texto || texto });
    }

    const sysPrompt = `Você é o copiloto comercial da equipe da Vittalis Saúde (clínica de pediatria, vacinação e especialidades em São Luís-MA). Quem lê sua análise é a ATENDENTE, não o cliente. Seja específico, direto e útil — análise rasa ou genérica não tem valor.

CONTEXTO DA CLÍNICA:
- Serviços: vacinação infantil/adulto (clínica ou domiciliar), planos vacinais, pediatria, pneumologia, psicologia, neuropsicologia, psicopedagogia, terapias
- Pagamento: Pix, espécie, crédito parcelado sem juros. Sinal de R$ 60 para consultas de especialidade (abatido no valor)
- Diferenciais: Buzzy (reduz até 90% da dor), vacinação simultânea com 2 vacinadoras, atendimento domiciliar, brinquedo musical, carteira personalizada, cineminha
${tabelaPrecos}

CALENDÁRIO VACINAL OFICIAL:
${conhecimento.calendario}

PACOTES MENSAIS (preço fechado):
${conhecimento.pacotes}

PLANOS COMPLETOS:
${conhecimento.planos}
${leadInfo}

REGRAS DE SAÍDA (obrigatórias):
- Responda APENAS com o JSON pedido. Nada antes, nada depois, sem cercas de código.
- PROIBIDO usar emojis em qualquer campo.
- Português do Brasil, frases curtas e concretas. Cite o que o cliente disse quando relevante.
- Ancore valores e produtos no catálogo acima — nunca invente preço.`;

    const userPrompt = `${cfgMode.instrucao}

CONVERSA (${conv.contact_name || 'cliente'}):
${transcript}

Devolva exatamente este JSON:
${cfgMode.schema}`;

    const data = await openaiMessages({
      model: 'gpt-4o',
      max_tokens: 800,
      system: sysPrompt,
      json: true,
      messages: [{ role: 'user', content: userPrompt }],
    });
    if (data.error) return res.status(502).json({ error: data.error.message || 'Erro na IA' });

    const raw = (data.content?.find(c => c.type === 'text')?.text || '').trim();
    let parsed = null;
    try {
      parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim());
    } catch {
      // Fallback: devolve como texto para o painel não quebrar
      parsed = mode === 'resposta' ? { texto: raw, racional: '' } : null;
    }
    if (!parsed) return res.status(502).json({ error: 'A IA devolveu um formato inesperado. Tente novamente.' });

    res.json({ mode, data: parsed });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ ANÁLISE DE QUALIDADE DO ATENDIMENTO (IA, nota 0-100) ═══════════════════
   Audita COMO a atendente conduziu o atendimento (não o potencial do lead).
   On-demand e em lote pequeno (controle de custo) com gpt-4o-mini. Só master. */

async function montarTranscriptConversa(convId, limite = 40) {
  const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [convId]);
  if (!conv) return null;
  const { rows: histRows } = await query(
    `SELECT from_type, type, content, filename, sender_nome, created_at FROM mensagens
     WHERE conversa_id = $1 AND type IN ('text','document') AND from_type <> 'system'
     ORDER BY created_at DESC LIMIT $2`, [convId, limite]);
  const hist = histRows.reverse();
  const transcript = hist.map(m => {
    const quem = m.from_type === 'contact' ? (conv.contact_name || 'Cliente')
      : m.from_type === 'bot' ? 'Vitta (IA)'
      : `Atendente${m.sender_nome ? ` (${m.sender_nome})` : ''}`;
    const txt = m.type === 'document' ? `[enviou PDF: ${m.filename || 'documento'}]` : String(m.content || '').slice(0, 400);
    const hora = new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `[${hora}] ${quem}: ${txt}`;
  }).join('\n');
  return { conv, hist, transcript };
}

async function resolverAtendente(conv, hist) {
  // Quem é o atendente do atendimento: o responsável da conversa; senão, o
  // remetente humano mais frequente das mensagens enviadas.
  if (conv.responsavel_id) {
    const { rows: [u] } = await query('SELECT id, nome FROM usuarios WHERE id = $1', [conv.responsavel_id]);
    if (u) return { id: u.id, nome: u.nome };
  }
  const cont = {};
  for (const m of hist) if (m.from_type === 'me' && m.sender_nome) cont[m.sender_nome] = (cont[m.sender_nome] || 0) + 1;
  const nome = Object.entries(cont).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { id: null, nome };
}

async function analisarQualidade(convId) {
  if (!process.env.OPENAI_API_KEY) return { error: 'IA não configurada' };
  const t = await montarTranscriptConversa(convId);
  if (!t) return { error: 'Conversa não encontrada' };
  if (t.hist.filter(m => m.from_type === 'me').length < 1) return { error: 'Sem mensagens da atendente para avaliar' };
  const sys = `Você é auditor de qualidade de atendimento de uma clínica de pediatria e vacinação (Vittalis Saúde). Avalie COMO A ATENDENTE conduziu o atendimento ao cliente — não o potencial de venda do lead. Seja rigoroso e justo: nota alta só com atendimento realmente bom. Responda APENAS o JSON pedido, sem emojis, em português do Brasil.`;
  const user = `Avalie o atendimento abaixo e dê uma nota de 0 a 100 (e por critério, 0 a 100).

Critérios:
- agilidade: rapidez e não deixar o cliente sem resposta
- cordialidade: educação, empatia, acolhimento
- clareza: respostas claras, completas e sem ambiguidade
- conducao: conduziu bem para a próxima etapa (tirou dúvidas, ofereceu, contornou objeção)
- fechamento: encaminhou para fechamento/agendamento ou deixou o próximo passo claro

CONVERSA (cliente: ${t.conv.contact_name || 'cliente'}):
${t.transcript}

Devolva exatamente:
{"score":0,"criterios":{"agilidade":0,"cordialidade":0,"clareza":0,"conducao":0,"fechamento":0},"pontos_fortes":"1 a 2 frases","pontos_fracos":"1 a 2 frases","resumo":"1 frase resumindo o atendimento"}`;
  const data = await openaiMessages({ model: 'gpt-4o-mini', max_tokens: 500, json: true, system: sys, messages: [{ role: 'user', content: user }] });
  if (data.error) return { error: data.error.message || 'Erro na IA' };
  const raw = (data.content?.find(c => c.type === 'text')?.text || '').trim();
  let p = null;
  try { p = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim()); } catch {}
  if (!p || typeof p.score === 'undefined') return { error: 'Formato inesperado da IA' };
  const clamp = n => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const crit = {};
  for (const k of ['agilidade', 'cordialidade', 'clareza', 'conducao', 'fechamento']) crit[k] = clamp(p.criterios?.[k]);
  const at = await resolverAtendente(t.conv, t.hist);
  const { rows: [row] } = await query(
    `INSERT INTO analises_atendimento (conversa_id, atendente_id, atendente_nome, cliente_nome, score, criterios, pontos_fortes, pontos_fracos, resumo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [convId, at.id, at.nome, t.conv.contact_name || null, clamp(p.score), JSON.stringify(crit),
     String(p.pontos_fortes || '').slice(0, 400), String(p.pontos_fracos || '').slice(0, 400), String(p.resumo || '').slice(0, 300)]);
  return { row };
}

// Lote: avalia as conversas recentes ainda não avaliadas (máx 8/chamada — custo)
r.post('/qualidade/analisar', masterOnly, async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'IA não configurada (OPENAI_API_KEY ausente)' });
    const limite = Math.max(1, Math.min(parseInt(req.body?.limite) || 6, 8));
    const { rows: alvos } = await query(`
      SELECT c.id FROM conversas c
      WHERE EXISTS (SELECT 1 FROM mensagens m WHERE m.conversa_id = c.id AND m.from_type='me')
        AND NOT EXISTS (SELECT 1 FROM analises_atendimento a WHERE a.conversa_id = c.id AND a.created_at > NOW() - INTERVAL '7 days')
      ORDER BY c.last_message_at DESC NULLS LAST LIMIT $1`, [limite]);
    let ok = 0; const erros = [];
    for (const a of alvos) { const r2 = await analisarQualidade(a.id); if (r2.row) ok++; else if (r2.error) erros.push(r2.error); }
    res.json({ analisadas: ok, tentadas: alvos.length, erros: [...new Set(erros)].slice(0, 3) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// On-demand: avalia UMA conversa específica
r.post('/conversations/:id/qualidade', masterOnly, async (req, res) => {
  try {
    const r2 = await analisarQualidade(req.params.id);
    if (r2.error) return res.status(400).json({ error: r2.error });
    res.json(r2.row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Resumo: média por atendente (por critério) + análises recentes
r.get('/qualidade/resumo', masterOnly, async (req, res) => {
  try {
    const [porAtendente, recentes, geral] = await Promise.all([
      query(`SELECT COALESCE(atendente_nome,'(sem atendente)') nome,
               ROUND(AVG(score))::int media, COUNT(*)::int n,
               ROUND(AVG(NULLIF(criterios->>'agilidade','')::int))::int agilidade,
               ROUND(AVG(NULLIF(criterios->>'cordialidade','')::int))::int cordialidade,
               ROUND(AVG(NULLIF(criterios->>'clareza','')::int))::int clareza,
               ROUND(AVG(NULLIF(criterios->>'conducao','')::int))::int conducao,
               ROUND(AVG(NULLIF(criterios->>'fechamento','')::int))::int fechamento
             FROM analises_atendimento WHERE created_at > NOW() - INTERVAL '60 days'
             GROUP BY atendente_nome ORDER BY media DESC`),
      query(`SELECT id, conversa_id, atendente_nome, cliente_nome, score, resumo, pontos_fortes, pontos_fracos, created_at
             FROM analises_atendimento ORDER BY created_at DESC LIMIT 15`),
      query(`SELECT COUNT(*)::int n, ROUND(AVG(score))::int media FROM analises_atendimento WHERE created_at > NOW() - INTERVAL '60 days'`),
    ]);
    res.json({ porAtendente: porAtendente.rows, recentes: recentes.rows, geral: geral.rows[0] || { n: 0, media: 0 } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ AGENDAMENTO POR IA: lê a conversa e extrai o pedido de agendamento ══════
   On-demand: a atendente clica e a IA puxa data/hora/serviço/endereço da
   conversa, convertendo "amanhã/sexta/semana que vem" em data real. Devolve a
   sugestão pra pré-preencher o Agendar e confirmar em 1 clique. */
async function sugerirAgenda(convId) {
  if (!process.env.OPENAI_API_KEY) return { error: 'IA não configurada (OPENAI_API_KEY ausente)' };
  const t = await montarTranscriptConversa(convId);
  if (!t) return { error: 'Conversa não encontrada' };
  if (!t.hist.some(m => m.from_type === 'contact')) return { error: 'Sem mensagens do cliente para analisar' };
  const hojeStr = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const sys = `Você extrai pedidos de AGENDAMENTO de conversas de uma clínica de pediatria e vacinação (Vittalis). Hoje é ${hojeStr}. Responda APENAS o JSON pedido, em português do Brasil, sem emojis. Se não houver pedido de agendamento claro do cliente, retorne tem_intencao=false.`;
  const user = `Da conversa abaixo, extraia o agendamento SE o cliente pediu pra marcar/agendar algo. Converta referências de tempo ("amanhã", "sexta", "semana que vem", "dia 20") para uma DATA real (YYYY-MM-DD) a partir de hoje. Se algum dado não aparecer, deixe null.

CONVERSA (cliente: ${t.conv.contact_name || 'cliente'}):
${t.transcript}

Devolva exatamente:
{"tem_intencao":true,"paciente":"nome do paciente ou null","data":"YYYY-MM-DD ou null","hora":"HH:MM ou null","servico":"o que o cliente quer (ex: vacina 6 meses, consulta pediatria) ou null","setor":"vacinas|consultas|terapias","endereco":"endereço se for domiciliar, ou null","resumo":"1 frase do que o cliente quer"}`;
  const data = await openaiMessages({ model: 'gpt-4o-mini', max_tokens: 320, json: true, system: sys, messages: [{ role: 'user', content: user }] });
  if (data.error) return { error: data.error.message || 'Erro na IA' };
  const raw = (data.content?.find(c => c.type === 'text')?.text || '').trim();
  let p = null;
  try { p = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim()); } catch {}
  if (!p) return { error: 'A IA devolveu um formato inesperado. Tente de novo.' };
  const setor = ['vacinas', 'consultas', 'terapias'].includes(p.setor) ? p.setor : (t.conv.setor || 'vacinas');
  return { sugestao: {
    tem_intencao: !!p.tem_intencao,
    paciente: p.paciente || t.conv.contact_name || '',
    data: /^\d{4}-\d{2}-\d{2}$/.test(p.data || '') ? p.data : '',
    hora: /^([01]\d|2[0-3]):[0-5]\d$/.test(p.hora || '') ? p.hora : '',
    servico: p.servico || '',
    setor, endereco: p.endereco || '',
    telefone: (t.conv.phone || '').replace(/\D/g, ''),
    resumo: p.resumo || '',
  } };
}
r.post('/conversations/:id/sugerir-agenda', async (req, res) => {
  try {
    const r2 = await sugerirAgenda(req.params.id);
    if (r2.error) return res.status(400).json({ error: r2.error });
    res.json(r2.sugestao);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CASES DE SUCESSO: conversas que viraram VENDA (padrão de atendimento vencedor)
// pra equipe estudar e replicar. Respeita o acesso por setor.
r.get('/cases-sucesso', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT DISTINCT ON (v.conversa_id)
             v.conversa_id id, c.contact_name, c.phone, c.setor, c.classificacao, c.responsavel_id,
             v.categoria, v.servico, v.valor, v.atendente_nome, v.data_venda
      FROM vendas v JOIN conversas c ON c.id = v.conversa_id
      WHERE v.status_pagamento IN ('pago','cortesia') AND v.conversa_id IS NOT NULL
      ORDER BY v.conversa_id, v.data_venda DESC, v.created_at DESC
      LIMIT 400`);
    const out = rows
      .filter(r2 => podeVerSetor(req.user, r2))
      .sort((a, b) => new Date(b.data_venda) - new Date(a.data_venda));
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Roteiro-padrão de atendimento salvo (gerado pela IA a partir dos cases). Todos leem.
r.get('/cases-sucesso/padrao', async (req, res) => {
  try {
    const setor = ['vacinas', 'consultas', 'terapias'].includes(req.query.setor) ? req.query.setor : 'geral';
    const { rows } = await query("SELECT valor FROM configuracoes WHERE chave = 'padrao_atendimento'");
    const todos = rows[0]?.valor || {};
    res.json(todos[setor] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Gera (IA) o roteiro-padrão "do oi ao fechamento" a partir das conversas que
// viraram venda. Gestão ou líder. Salva pra consulta de toda a equipe.
r.post('/cases-sucesso/gerar-padrao', async (req, res) => {
  try {
    if (!(['master', 'supervisor'].includes(req.user.role) || req.user.lider)) return res.status(403).json({ error: 'Acesso restrito à liderança.' });
    if (!process.env.OPENAI_API_KEY) return res.status(400).json({ error: 'IA não configurada (OPENAI_API_KEY ausente).' });
    const setor = ['vacinas', 'consultas', 'terapias'].includes((req.body || {}).setor) ? req.body.setor : null;
    const { rows } = await query(`
      SELECT DISTINCT ON (v.conversa_id) v.conversa_id id, c.setor, c.classificacao, c.responsavel_id, c.contact_name, v.data_venda
      FROM vendas v JOIN conversas c ON c.id = v.conversa_id
      WHERE v.status_pagamento IN ('pago','cortesia') AND v.conversa_id IS NOT NULL ${setor ? 'AND c.setor = $1' : ''}
      ORDER BY v.conversa_id, v.data_venda DESC, v.created_at DESC LIMIT 60`, setor ? [setor] : []);
    const visiveis = rows.filter(r2 => podeVerSetor(req.user, r2)).slice(0, 6);
    if (!visiveis.length) return res.status(400).json({ error: 'Ainda não há cases de sucesso suficientes para gerar o padrão.' });
    const transcripts = [];
    for (const cv of visiveis) {
      const t = await montarTranscriptConversa(cv.id, 30);
      if (t && t.transcript) transcripts.push(`### Case (${cv.contact_name || 'cliente'}):\n${t.transcript.slice(0, 1800)}`);
    }
    if (!transcripts.length) return res.status(400).json({ error: 'Não consegui ler as conversas dos cases.' });
    const sys = `Você é um treinador de vendas de uma clínica de pediatria, vacinação e terapias (Vittalis Saúde). A partir de conversas REAIS que fecharam venda, extraia o PADRÃO de atendimento vencedor e escreva um roteiro claro, replicável e motivador, em português do Brasil. Foque no que funcionou: abordagem, descoberta da necessidade, apresentação de valor, contorno de objeções, condução ao fechamento e pós. Seja prático — frases-modelo que a atendente possa usar. Não invente dados; baseie-se no que aparece nas conversas.`;
    const user = `Analise estes atendimentos que viraram VENDA${setor ? ` (setor ${setor})` : ''} e produza o ROTEIRO-PADRÃO da equipe, organizado em etapas numeradas do "oi" ao fechamento. Em cada etapa: (a) objetivo, (b) 1-2 frases-modelo prontas, (c) erro comum a evitar. Ao final, liste os "3 gatilhos que mais fecharam" observados. Use markdown com títulos e listas.\n\n${transcripts.join('\n\n')}`;
    const data = await openaiMessages({ model: 'gpt-4o-mini', max_tokens: 1600, system: sys, messages: [{ role: 'user', content: user }] });
    if (data.error) return res.status(400).json({ error: data.error.message || 'Erro na IA.' });
    const texto = (data.content?.find(c => c.type === 'text')?.text || '').trim();
    if (!texto) return res.status(400).json({ error: 'A IA não retornou conteúdo. Tente de novo.' });
    const chave = setor || 'geral';
    const registro = { texto, base: visiveis.length, por: req.user.nome };
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('padrao_atendimento', jsonb_build_object($1::text, $2::jsonb))
                 ON CONFLICT (chave) DO UPDATE SET valor = jsonb_set(COALESCE(configuracoes.valor,'{}'::jsonb), ARRAY[$1::text], $2::jsonb), updated_at = NOW()`,
      [chave, JSON.stringify(registro)]);
    res.json({ ...registro, setor: chave });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── QUICK REPLIES (mensagens rápidas) ────────────────────────────────────────
// Cada usuário vê os modelos GLOBAIS (da gestão) + os SEUS (personalizados).
const gestaoUser = (req) => ['master', 'supervisor'].includes(req.user.role);
r.get('/quick-replies', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT *, (usuario_id IS NULL) AS global FROM respostas_rapidas
       WHERE usuario_id IS NULL OR usuario_id = $1
       ORDER BY (usuario_id IS NULL) DESC, created_at`, [req.user.id]);
    res.json(rows.map(r2 => ({ ...r2, minha: r2.usuario_id === req.user.id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/quick-replies', async (req, res) => {
  try {
    const titulo = String(req.body.titulo || '').trim().slice(0, 60);
    const texto = String(req.body.texto || '').trim().slice(0, 1000);
    if (!titulo || !texto) return res.status(400).json({ error: 'Título e texto são obrigatórios' });
    // Só a gestão cria modelo GLOBAL (escopo:'global'); os demais criam pessoal.
    const dono = (gestaoUser(req) && req.body.escopo === 'global') ? null : req.user.id;
    const { rows: [qr] } = await query('INSERT INTO respostas_rapidas (titulo,texto,usuario_id) VALUES ($1,$2,$3) RETURNING *', [titulo, texto, dono]);
    res.json({ ...qr, minha: qr.usuario_id === req.user.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Só edita/exclui o que é SEU; global só a gestão mexe.
async function podeMexerQR(req, id) {
  const { rows: [qr] } = await query('SELECT usuario_id FROM respostas_rapidas WHERE id = $1', [id]);
  if (!qr) return { erro: 404 };
  if (qr.usuario_id === req.user.id) return { ok: true };
  if (qr.usuario_id === null && gestaoUser(req)) return { ok: true };
  return { erro: 403 };
}

r.put('/quick-replies/:id', async (req, res) => {
  try {
    const perm = await podeMexerQR(req, req.params.id);
    if (perm.erro === 404) return res.status(404).json({ error: 'Modelo não encontrado' });
    if (perm.erro === 403) return res.status(403).json({ error: 'Você só edita os seus modelos.' });
    const titulo = String(req.body.titulo || '').trim().slice(0, 60);
    const texto = String(req.body.texto || '').trim().slice(0, 1000);
    if (!titulo || !texto) return res.status(400).json({ error: 'Título e texto são obrigatórios' });
    const { rows: [qr] } = await query('UPDATE respostas_rapidas SET titulo=$1, texto=$2 WHERE id=$3 RETURNING *', [titulo, texto, req.params.id]);
    res.json({ ...qr, minha: qr.usuario_id === req.user.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/quick-replies/:id', async (req, res) => {
  try {
    const perm = await podeMexerQR(req, req.params.id);
    if (perm.erro === 404) return res.status(404).json({ error: 'Modelo não encontrado' });
    if (perm.erro === 403) return res.status(403).json({ error: 'Você só exclui os seus modelos.' });
    await query('DELETE FROM respostas_rapidas WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BOT CONFIG ────────────────────────────────────────────────────────────────
r.get('/bot-config', async (req, res) => {
  try {
    const { rows: [row] } = await query("SELECT valor FROM configuracoes WHERE chave = 'bot'");
    res.json(row?.valor || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/bot-config', async (req, res) => {
  try {
    if (req.user?.role !== 'master') return res.status(403).json({ error: 'Apenas o master (Miécio ou Nágila) pode alterar a configuração do bot.' });
    // Estado anterior, pra saber se os toggles mudaram de liga<->desliga
    const { rows: [antes] } = await query("SELECT valor FROM configuracoes WHERE chave = 'bot'").catch(() => ({ rows: [{}] }));
    const antesAtivo = antes?.valor?.ativo !== false;
    const antesConsultaIA = antes?.valor?.consultaIA !== false;

    await query("INSERT INTO configuracoes (chave,valor) VALUES ('bot',$1) ON CONFLICT (chave) DO UPDATE SET valor=$1, updated_at=NOW()", [JSON.stringify(req.body)]);

    // O toggle "Bot ativo" é o interruptor MESTRE: ao mudar, aplica pra TODAS as
    // conversas (liga/desliga o bot pra todos os usuários de uma vez).
    const novoAtivo = req.body?.ativo !== false;
    const novoConsultaIA = req.body?.consultaIA !== false;
    if (novoAtivo !== antesAtivo) {
      await query('UPDATE conversas SET bot_ativo = $1', [novoAtivo]);
      await loadCache();
      socketEmit('bots_global', { ativo: novoAtivo });
      console.log(`Bot global ${novoAtivo ? 'LIGADO' : 'DESLIGADO'} para todas as conversas por ${req.user?.nome || 'master'}`);
    }
    // Ligou a IA de Consultas: assume na hora as conversas NÃO-vacina que estão
    // esperando resposta (última mensagem do cliente), sem mexer nas de vacina nem
    // nas que um humano está atendendo (última do 'me').
    if (novoConsultaIA && !antesConsultaIA) {
      const { rowCount } = await query(
        `UPDATE conversas c SET bot_ativo = true
         WHERE COALESCE(c.setor,'') NOT IN ('vacinas')
           AND c.last_from = 'contact' AND COALESCE(c.bot_ativo,false) = false`).catch(() => ({ rowCount: 0 }));
      await loadCache();
      socketEmit('bots_global', { ativo: true, soConsultas: true });
      console.log(`IA de Consultas LIGADA por ${req.user?.nome || 'master'} — ${rowCount} conversa(s) não-vacina reassumidas`);
    }
    res.json(req.body);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Botão de emergência (master): desliga TODOS os bots de uma vez — limpa o
// bot_ativo de todas as conversas E o interruptor global.
r.post('/bot/desligar-todos', async (req, res) => {
  try {
    if (req.user?.role !== 'master') return res.status(403).json({ error: 'Apenas o master (Miécio ou Nágila) pode desligar os bots.' });
    const { rowCount } = await query('UPDATE conversas SET bot_ativo = false WHERE bot_ativo = true');
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('bot', '{"ativo":false}'::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = jsonb_set(COALESCE(configuracoes.valor, '{}'::jsonb), '{ativo}', 'false'::jsonb), updated_at = NOW()`);
    await loadCache();
    socketEmit('bots_desligados', { por: req.user?.nome || 'master', total: rowCount });
    console.log(`🔌 ${req.user?.nome || 'master'} desligou TODOS os bots (${rowCount} conversas)`);
    res.json({ ok: true, desligados: rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PROPOSTA: preços reais do VittaSys ──────────────────────────────────────
r.get('/proposta/precos', async (req, res) => {
  try {
    const precos = await getPrecosVittaSys();
    res.json(precos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PROPOSTA: gerar PDF e enviar via WhatsApp ───────────────────────────────
// Body: { conversaId, nomeCliente, nomeBebe, template, pacoteNome, vacinas[], desconto, parcelas }
r.post('/proposta/enviar', async (req, res) => {
  try {
    const { conversaId, nomeCliente, nomeBebe, template, pacoteNome, vacinas, desconto, parcelas } = req.body;
    if (!conversaId) return res.status(400).json({ error: 'conversaId obrigatório' });
    if (!vacinas?.length) return res.status(400).json({ error: 'selecione ao menos uma vacina' });

    // Pega o telefone da conversa
    const { rows: [conv] } = await query('SELECT phone, contact_name FROM conversas WHERE id = $1', [conversaId]);
    if (!conv) return res.status(404).json({ error: 'conversa não encontrada' });

    // Gera o PDF no VittaSys
    const pdfBuf = await gerarPropostaPDF({
      nomeCliente: nomeCliente || conv.contact_name || 'Cliente',
      nomeBebe, template: template || 'adulto', pacoteNome,
      vacinas, desconto, parcelas,
    });

    // Envia via Z-API
    let phone = conv.phone.replace(/\D/g, '');
    if (phone.startsWith('55') && phone.length >= 12) phone = phone.slice(2);
    const zr = await enviarPDFZapi(`55${phone}`, pdfBuf.toString('base64'), `Proposta-${(nomeCliente||'Vittalis').replace(/\s+/g,'-')}.pdf`);
    const zrText = await zr?.text().catch(() => '');

    if (!zr?.ok) return res.status(502).json({ error: 'falha ao enviar PDF', detalhe: zrText.slice(0,200) });

    // Registra a mensagem no histórico
    const { rows: [msg] } = await query(
      `INSERT INTO mensagens (conversa_id, from_type, sender_nome, type, content, filename, created_at)
       VALUES ($1,'me','Atendente','document',$2,$3,NOW()) RETURNING *`,
      [conversaId, '📎 Proposta enviada', `Proposta-${nomeCliente||'Vittalis'}.pdf`]
    ).catch(() => ({ rows: [null] }));
    if (msg) socketEmit('new_message', { convId: conversaId, message: msg, conv });

    res.json({ ok: true, enviado: true, tamanho_pdf: pdfBuf.length });
  } catch (err) {
    console.error('Erro proposta/enviar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── VITTASYS MOCK ─────────────────────────────────────────────────────────────
r.get('/vittasys/planos', (req, res) => res.json([
  { id:'p1', nome:'Plano Vacinal Adulto Básico',   preco:420,  descricao:'HPV + Varicela + Hepatite A' },
  { id:'p2', nome:'Plano Vacinal Adulto Completo', preco:760,  descricao:'8 vacinas essenciais' },
  { id:'p3', nome:'Plano Infantil 0-6 meses',      preco:1850, descricao:'Hexacelular, Rotavírus e mais' },
  { id:'p4', nome:'Plano Infantil 0-9 meses',      preco:2400, descricao:'Cobertura completa até 9 meses' },
  { id:'p5', nome:'Plano Gestante',                preco:680,  descricao:'dTpa, Influenza, Hepatite B' },
  { id:'p6', nome:'Plano Idoso (60+)',             preco:540,  descricao:'Pneumocócica, Influenza, Zóster' },
]));

r.get('/vittasys/vacinas', (req, res) => res.json([
  { id:'v1',  nome:'HPV 9-valente',      preco:950,  doses:3 },
  { id:'v2',  nome:'Febre Amarela',       preco:250,  doses:1 },
  { id:'v3',  nome:'Varicela',            preco:450,  doses:2 },
  { id:'v4',  nome:'Hepatite A',          preco:250,  doses:2 },
  { id:'v5',  nome:'Influenza',           preco:180,  doses:1 },
  { id:'v6',  nome:'Pneumocócica 20',     preco:800,  doses:1 },
  { id:'v7',  nome:'Meningocócica ACWY',  preco:500,  doses:1 },
  { id:'v8',  nome:'Herpes Zóster',       preco:1200, doses:2 },
  { id:'v9',  nome:'dTpa (adulto)',        preco:180,  doses:1 },
  { id:'v10', nome:'Hexacelular',         preco:450,  doses:3 },
]));

r.post('/vittasys/proposta', (req, res) => {
  res.json({ source:'mock', planos:[
    { id:'p1', nome:'Plano Vacinal Adulto Básico',   preco:420,  descricao:'HPV + Varicela + Hepatite A' },
    { id:'p2', nome:'Plano Vacinal Adulto Completo', preco:760,  descricao:'8 vacinas essenciais' },
    { id:'p3', nome:'Plano Infantil 0-6 meses',      preco:1850, descricao:'Hexacelular, Rotavírus e mais' },
    { id:'p4', nome:'Plano Gestante',                preco:680,  descricao:'dTpa, Influenza, Hepatite B' },
  ], vacinas:[
    { id:'v1', nome:'HPV 9-valente', preco:950, doses:3 },
    { id:'v2', nome:'Febre Amarela', preco:250, doses:1 },
    { id:'v3', nome:'Varicela',      preco:450, doses:2 },
    { id:'v4', nome:'Influenza',     preco:180, doses:1 },
    { id:'v5', nome:'Pneumocócica',  preco:800, doses:1 },
  ]});
});

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
r.get('/notifications', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM notificacoes ORDER BY created_at DESC LIMIT 30');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/notifications/read-all', async (req, res) => {
  try {
    await query('UPDATE notificacoes SET lida = true WHERE lida = false');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── UPDATE NAMES + PROFILE PICS ─────────────────────────────────────────────
r.post('/whatsapp/update-contacts', masterOnly, async (req, res) => {
  const EVO = EVO_URL(), KEY = EVO_KEY(), INST = EVO_INST();
  const zapiBase = zapiOk() ? `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}` : null;

  try {
    const { default: fetch } = await import('node-fetch');

    const { rows: convos } = await query(
      `SELECT id, contact_id, phone, contact_name FROM conversas
       WHERE contact_id LIKE '%@s.whatsapp.net'
       ORDER BY last_message_at DESC`
    );

    if (!convos.length) return res.json({ ok: true, namesUpdated: 0, picsUpdated: 0 });

    let namesUpdated = 0, picsUpdated = 0;

    // Batch name lookup via whatsappNumbers
    const batchSize = 20;
    for (let i = 0; i < convos.length; i += batchSize) {
      const batch = convos.slice(i, i + batchSize);
      const numbers = batch.map(c => c.contact_id.replace('@s.whatsapp.net', ''));
      try {
        const endpoint = zapiOk()
          ? `${zapiBase}/chat/whatsapp-numbers`
          : `${EVO}/chat/whatsappNumbers/${INST}`;
        const headers = zapiOk()
          ? { 'Content-Type': 'application/json', ...(process.env.ZAPI_CLIENT_TOKEN ? { 'Client-Token': process.env.ZAPI_CLIENT_TOKEN } : {}) }
          : { 'Content-Type': 'application/json', apikey: KEY };

        const r2 = await fetch(endpoint, {
          method: 'POST', headers,
          body: JSON.stringify({ phones: numbers }),
          signal: AbortSignal.timeout(15000)
        });
        if (r2.ok) {
          const results = await r2.json();
          for (const item of (Array.isArray(results) ? results : [])) {
            const jid = item.jid || ((item.phone || item.number || '') + '@s.whatsapp.net');
            const name = item.name || item.pushName || '';
            if (name && name.length > 2) {
              const { rowCount } = await query(
                `UPDATE conversas SET contact_name = $1
                 WHERE contact_id = $2 AND (length(contact_name) <= 11 OR contact_name = phone)`,
                [name, jid]
              );
              namesUpdated += rowCount || 0;
            }
          }
        }
      } catch (e) { console.log('name batch error:', e.message); }
    }

    // Fetch profile pics using Z-API /profile-picture?phone=NUMBER
    for (const conv of convos) {
      if (conv.profile_pic) continue; // skip if already has pic
      try {
        const phone = conv.contact_id.replace('@s.whatsapp.net', '');
        let pic = null;

        if (zapiOk()) {
          // Z-API: GET /profile-picture?phone=559888278736
          const headers = { 'Content-Type': 'application/json' };
          if (process.env.ZAPI_CLIENT_TOKEN) headers['Client-Token'] = process.env.ZAPI_CLIENT_TOKEN;
          const rp = await fetch(`${zapiBase}/profile-picture?phone=${phone}`, {
            headers, signal: AbortSignal.timeout(6000)
          });
          if (rp.ok) {
            const pd = await rp.json();
            pic = pd.link || pd.url || pd.profilePicUrl || '';
          }
        } else if (EVO && KEY) {
          const rp = await fetch(`${EVO}/contact/getProfilePicture/${INST}?number=${conv.contact_id}`, {
            headers: { apikey: KEY }, signal: AbortSignal.timeout(5000)
          });
          if (rp.ok) {
            const pd = await rp.json();
            pic = pd.profilePictureUrl || pd.base64 || pd.imgUrl || '';
          }
        }

        if (pic) {
          await query('UPDATE conversas SET profile_pic = $1 WHERE id = $2', [pic, conv.id]);
          picsUpdated++;
        }
        await new Promise(r => setTimeout(r, 150)); // rate limit
      } catch {}
    }

    console.log(`UPDATE_CONTACTS: ${namesUpdated} names, ${picsUpdated} pics`);
    res.json({ ok: true, namesUpdated, picsUpdated });
  } catch (e) {
    console.error('update-contacts error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── WHATSAPP QR CODE (Evolution API) ────────────────────────────────────────
r.get('/whatsapp/status', async (req, res) => {
  // Z-API (preferred)
  if (zapiOk()) {
    try {
      const r2 = await zapiCall('/status');
      if (r2.ok) {
        const data = await r2.json();
        const connected = data.connected === true || data.status === 'CONNECTED' || data.smartphone?.connection === 'CONNECTED';
        return res.json({ connected, status: connected ? 'open' : 'closed', provider: 'zapi' });
      }
    } catch (e) { console.error('Z-API status error:', e.message); }
  }
  // Evolution API fallback
  const EVO = process.env.EVOLUTION_API_URL, KEY = process.env.EVOLUTION_API_KEY, INST = process.env.EVOLUTION_INSTANCE || 'vittalis';
  if (!EVO || !KEY) return res.json({ connected: false, status: 'not_configured', message: 'Configure ZAPI ou Evolution API' });
  try {
    const { default: fetch } = await import('node-fetch');
    const r2 = await fetch(`${EVO}/instance/connectionState/${INST}`, { headers: { apikey: KEY }, signal: AbortSignal.timeout(8000) });
    if (r2.ok) {
      const data = await r2.json();
      const state = data?.instance?.state || data?.state || data?.currentState || 'closed';
      return res.json({ connected: state === 'open', status: state, provider: 'evolution' });
    }
    const r3 = await fetch(`${EVO}/instance/fetchInstances`, { headers: { apikey: KEY }, signal: AbortSignal.timeout(8000) });
    const list = await r3.json();
    const arr = Array.isArray(list) ? list : (list?.data || [list]);
    const inst = arr.find(i => i.name === INST || i.instance?.instanceName === INST || i.instanceName === INST);
    const state = inst?.instance?.state || inst?.state || inst?.connectionStatus || 'closed';
    res.json({ connected: state === 'open', status: state, provider: 'evolution' });
  } catch (e) { res.json({ connected: false, status: 'error', message: e.message }); }
});

// ─── IMPORT WHATSAPP HISTORY (via Z-API) ──────────────────────────────────────
r.post('/whatsapp/import-history', masterOnly, async (req, res) => {
  if (!zapiOk()) return res.status(400).json({ error: 'Z-API não configurada' });
  try {
    let imported = 0;
    let page = 1;
    const pageSize = 50;

    while (true) {
      const r2 = await zapiCall(`/chats?page=${page}&pageSize=${pageSize}`, 'GET');
      if (!r2?.ok) break;

      let chats = [];
      try {
        const d = await r2.json();
        chats = Array.isArray(d) ? d : (d.chats || d.data || []);
      } catch { break; }

      if (!chats.length) break;

      console.log(`IMPORT Z-API: página ${page}, ${chats.length} chats`);

      for (const chat of chats) {
        try {
          const phone = (chat.phone || '').replace(/\D/g, '');
          if (!phone || phone.length < 8) continue;
          if (chat.isGroup === true || chat.isGroup === 'true') continue;

          const contactId   = `${phone}@s.whatsapp.net`;
          const contactName = chat.name || chat.phone || phone;
          // Z-API usa lastMessageTime em milissegundos (string)
          const lastMsgAt = chat.lastMessageTime
            ? new Date(parseInt(chat.lastMessageTime))
            : new Date();
          const unread = parseInt(chat.messagesUnread || chat.unread || 0) || 0;

          await query(`
            INSERT INTO conversas (contact_id, phone, contact_name, channel, last_message, last_message_at, unread)
            VALUES ($1, $2, $3, 'whatsapp', '', $4, $5)
            ON CONFLICT (contact_id) DO UPDATE SET
              contact_name    = CASE WHEN length(EXCLUDED.contact_name) > 3 THEN EXCLUDED.contact_name ELSE conversas.contact_name END,
              last_message_at = EXCLUDED.last_message_at,
              unread          = EXCLUDED.unread`,
            [contactId, phone, contactName, lastMsgAt, unread]
          );
          imported++;
        } catch {}
      }

      if (chats.length < pageSize) break;
      page++;
      await new Promise(r => setTimeout(r, 300));
    }

    // Recarrega cache
    convoCache.clear(); cacheReady = false;
    await loadCache();

    // Carrega fotos em background (não bloqueia a resposta)
    setImmediate(async () => {
      console.log('IMPORT: iniciando carregamento de fotos em background...');
      let photoPage = 1;
      let totalPhotos = 0;
      while (true) {
        const { rows } = await query(
          `SELECT id, phone FROM conversas WHERE (profile_pic IS NULL OR profile_pic = '') AND phone IS NOT NULL ORDER BY last_message_at DESC LIMIT 50 OFFSET $1`,
          [(photoPage - 1) * 50]
        ).catch(() => ({ rows: [] }));
        if (!rows.length) break;
        let updated = 0;
        for (const conv of rows) {
          try {
            let ph = conv.phone?.replace(/\D/g,'') || '';
            if (!ph || ph.length < 8) continue;
            if (ph.startsWith('55') && ph.length >= 12) ph = ph.slice(2);
            const r2 = await zapiCall(`/contacts/55${ph}`, 'GET');
            if (r2?.ok) {
              const text = await r2.text().catch(() => '{}');
              let pic = null;
              try { const d = JSON.parse(text); pic = d.imgUrl || d.profilePic || null; } catch {}
              if (pic && pic !== 'null' && pic.startsWith('http')) {
                await query('UPDATE conversas SET profile_pic=$1 WHERE id=$2', [pic, conv.id]);
                const cached = convoCache.get(conv.id);
                if (cached) cacheUpdate({ ...cached, profile_pic: pic });
                updated++;
              }
            }
            await new Promise(r => setTimeout(r, 200));
          } catch {}
        }
        totalPhotos += updated;
        photoPage++;
        if (rows.length < 50) break;
      }
      console.log(`IMPORT FOTOS: ${totalPhotos} fotos carregadas em background`);
    });

    console.log(`IMPORT Z-API DONE: ${imported} conversas`);
    res.json({ ok: true, imported, message: `${imported} conversas importadas. Fotos sendo carregadas em background...` });
  } catch (err) {
    console.error('Import error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

r.get('/whatsapp/qrcode', async (req, res) => {
  const EVO = process.env.EVOLUTION_API_URL;
  const KEY = process.env.EVOLUTION_API_KEY;
  const INST = process.env.EVOLUTION_INSTANCE || 'vittalis';
  if (!EVO || !KEY) return res.status(400).json({ error: 'Evolution API não configurada. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY.' });
  try {
    const { default: fetch } = await import('node-fetch');
    // Try to connect (get QR)
    const r2 = await fetch(`${EVO}/instance/connect/${INST}`, { headers: { apikey: KEY }, signal: AbortSignal.timeout(10000) });
    const data = await r2.json();
    if (data.base64) return res.json({ qrcode: data.base64, status: 'qrcode' });
    if (data.instance?.state === 'open') return res.json({ connected: true, status: 'open' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/whatsapp/create-instance', masterOnly, async (req, res) => {
  const EVO = process.env.EVOLUTION_API_URL;
  const KEY = process.env.EVOLUTION_API_KEY;
  const INST = process.env.EVOLUTION_INSTANCE || 'vittalis';
  if (!EVO || !KEY) return res.status(400).json({ error: 'Evolution API não configurada' });
  try {
    const { default: fetch } = await import('node-fetch');
    const r2 = await fetch(`${EVO}/instance/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ instanceName: INST, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await r2.json();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/whatsapp/disconnect', masterOnly, async (req, res) => {
  const EVO = process.env.EVOLUTION_API_URL;
  const KEY = process.env.EVOLUTION_API_KEY;
  const INST = process.env.EVOLUTION_INSTANCE || 'vittalis';
  if (!EVO || !KEY) return res.status(400).json({ error: 'Não configurado' });
  try {
    const { default: fetch } = await import('node-fetch');
    await fetch(`${EVO}/instance/logout/${INST}`, { method: 'DELETE', headers: { apikey: KEY } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Z-API: disconnect ─────────────────────────────────────────────────────────
r.post('/whatsapp/zapi/disconnect', masterOnly, async (req, res) => {
  if (!zapiOk()) return res.status(400).json({ error: 'Z-API não configurada' });
  try {
    const r2 = await zapiCall('/disconnect', 'POST');
    const d = r2?.ok ? await r2.json() : {};
    res.json({ ok: true, ...d });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// CÓDIGO DE PAREAMENTO: gera um código de 8 dígitos que se digita no celular
// (WhatsApp → Aparelhos conectados → Conectar com número). Não precisa de câmera,
// mas AINDA precisa de alguém no aparelho pra digitar o código.
r.post('/whatsapp/zapi/phone-code', masterOnly, async (req, res) => {
  if (!zapiOk()) return res.status(400).json({ error: 'Z-API não configurada' });
  try {
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    if (phone.length < 12) return res.status(400).json({ error: 'Informe o número com DDI + DDD (ex.: 5598912345678).' });
    const r2 = await zapiCall(`/phone-code/${phone}`, 'GET');
    if (!r2?.ok) {
      const t = await r2?.text().catch(() => '');
      return res.status(502).json({ error: 'A Z-API não gerou o código. ' + (t?.slice(0, 120) || `HTTP ${r2?.status}`) });
    }
    const d = await r2.json().catch(() => ({}));
    const code = d.code || d.value || d.pairingCode || null;
    if (!code) return res.status(502).json({ error: 'A Z-API não retornou um código. Tente pelo QR.' });
    res.json({ code: String(code) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// RECONECTAR SEM QR: só reinicia a instância (restart). Funciona SE o aparelho
// ainda estiver com o dispositivo vinculado (queda temporária). Se o WhatsApp
// tiver deslogado o dispositivo, aí não tem jeito — precisa do celular.
r.post('/whatsapp/zapi/restart', masterOnly, async (req, res) => {
  if (!zapiOk()) return res.status(400).json({ error: 'Z-API não configurada' });
  try {
    await zapiCall('/restart', 'GET').catch(() => {});
    let connected = false, smartphone = null;
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 3500));
      const r2 = await zapiCall('/status', 'GET').catch(() => null);
      if (r2?.ok) {
        const d = await r2.json().catch(() => ({}));
        smartphone = d.smartphoneConnected ?? smartphone;
        if (d.connected === true || d.smartphoneConnected === true) { connected = true; break; }
      }
    }
    if (connected) { await configurarWebhooksZapi().catch(() => {}); }
    res.json({ ok: true, connected, smartphone });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Z-API: status ────────────────────────────────────────────────────────────
// ─── DEBUG: ver resposta raw do Z-API /chats ─────────────────────────────────
r.get('/whatsapp/zapi/debug-chats', async (req, res) => {
  if (!zapiOk()) return res.json({ error: 'Z-API não configurada' });
  try {
    const r2 = await zapiCall('/chats?page=1&pageSize=5', 'GET');
    const text = await r2?.text() || '{}';
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    res.json({ 
      status: r2?.status, 
      raw: text.slice(0, 3000),
      parsed_type: Array.isArray(parsed) ? 'array' : typeof parsed,
      first_item: Array.isArray(parsed) ? parsed[0] : (parsed?.chats?.[0] || parsed?.data?.[0] || parsed)
    });
  } catch (e) { res.json({ error: e.message }); }
});

r.get('/whatsapp/zapi/status', async (req, res) => {
  if (!zapiOk()) return res.json({ connected: false, error: 'Z-API não configurada' });
  try {
    // Tenta /status primeiro
    const r2 = await zapiCall('/status', 'GET');
    const text = await r2?.text() || '{}';
    let d = {};
    try { d = JSON.parse(text); } catch {}
    console.log('Z-API /status:', r2?.status, text.slice(0, 150));

    let connected = d.connected === true || d.status === 'open' || d.status === 'connected';

    // Se /status não confirmar, valida via /chats (se retorna chats, está conectado)
    if (!connected && !d.error) {
      try {
        const rc = await zapiCall('/chats?page=1&pageSize=1', 'GET');
        if (rc?.ok) {
          const chatsText = await rc.text();
          const chats = JSON.parse(chatsText);
          if (Array.isArray(chats)) {
            connected = true; // conseguiu listar chats = conectado
          }
        }
      } catch {}
    }

    if (connected) setZapiConnected(true, d.phone || zapiPhone);

    res.json({
      connected,
      phone: d.phone || zapiPhone || null,
      provider: 'zapi',
    });
  } catch (e) {
    res.json({ connected: zapiConnected, phone: zapiPhone, provider: 'zapi' });
  }
});

// Marca conexão manualmente (quando usuário confirma que conectou no painel Z-API)
r.post('/whatsapp/zapi/mark-connected', masterOnly, async (req, res) => {
  setZapiConnected(true, req.body?.phone || null);
  socketEmit('zapi_status', { connected: true, phone: req.body?.phone || null });
  res.json({ ok: true, connected: true });
});

// ─── Z-API: Auto-configurar webhooks ─────────────────────────────────────────
// Configura TODOS os webhooks da Z-API apontando para este backend. Inclui o
// "received-delivery" (notificar enviadas por mim) — é o que faz a Z-API avisar
// o backend quando a equipe responde direto pelo CELULAR. Chamado no boot
// (auto-cura) e pelo botão da tela do WhatsApp.
export async function configurarWebhooksZapi() {
  if (!zapiOk()) return { skipped: 'zapi não configurada' };
  const BACKEND = process.env.BACKEND_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://vittahub-backend-production.up.railway.app');
  const webhookUrl = `${BACKEND}/api/inbox/webhook/zapi`;
  const endpoints = [
    'update-webhook-received',          // ao receber mensagem (cliente)
    'update-webhook-delivery',          // ao enviar
    'update-webhook-received-delivery', // notificar enviadas por mim (CELULAR)
    'update-webhook-message-status',    // status da mensagem
    'update-webhook-connected',         // ao conectar
    'update-webhook-disconnected',      // ao desconectar
  ];
  const results = {};
  for (const ep of endpoints) {
    try {
      const r2 = await zapiCall(`/${ep}`, 'PUT', { value: webhookUrl });
      const txt = await r2?.text().catch(() => '');
      results[ep] = r2?.ok ? 'ok' : `erro(${r2?.status}): ${txt.slice(0, 60)}`;
    } catch (e) { results[ep] = `erro: ${e.message}`; }
  }
  return { webhookUrl, results };
}

r.post('/whatsapp/zapi/setup-webhooks', masterOnly, async (req, res) => {
  if (!zapiOk()) return res.status(400).json({ error: 'Z-API não configurada' });
  const out = await configurarWebhooksZapi();
  console.log('Z-API webhooks configurados:', JSON.stringify(out.results));
  res.json({ ok: true, ...out });
});

// Mescla conversas DUPLICADAS (mesmo contato em 2 chats por causa do bug @lid).
// Junta pela chatLid — identificador estável do contato no WhatsApp. Sem body
// (ou {apply:false}) faz uma SIMULAÇÃO (só conta). Com {apply:true}, aplica:
// move as mensagens pra conversa canônica e remove a duplicada.
r.post('/whatsapp/merge-duplicadas', masterOnly, async (req, res) => {
  try {
    const apply = req.body?.apply === true;
    // Canônica = contact_id mais longo (com o 55) e mais antiga. As demais são as duplicadas.
    const { rows: grupos } = await query(`
      SELECT chat_lid, array_agg(id ORDER BY length(contact_id) DESC, created_at ASC) ids
        FROM conversas
       WHERE chat_lid IS NOT NULL AND chat_lid <> ''
       GROUP BY chat_lid
      HAVING COUNT(*) > 1`);

    let conversasMescladas = 0, mensagensMovidas = 0;
    const exemplos = [];

    for (const g of grupos) {
      const [canonica, ...dups] = g.ids;
      if (exemplos.length < 12) exemplos.push({ chat_lid: g.chat_lid, canonica, duplicadas: dups });
      if (!apply) continue;
      for (const dupId of dups) {
        // Evita violar o índice único de wa_msg_id: remove da duplicada o que já
        // existe na canônica antes de mover.
        await query(`DELETE FROM mensagens WHERE conversa_id = $1 AND wa_msg_id IS NOT NULL
                     AND wa_msg_id IN (SELECT wa_msg_id FROM mensagens WHERE conversa_id = $2 AND wa_msg_id IS NOT NULL)`,
          [dupId, canonica]).catch(() => {});
        const mv = await query('UPDATE mensagens SET conversa_id = $1 WHERE conversa_id = $2', [canonica, dupId]).catch(() => ({ rowCount: 0 }));
        mensagensMovidas += mv.rowCount || 0;
        await query('DELETE FROM conversas WHERE id = $1', [dupId]).catch(() => {});
        conversasMescladas++;
      }
      // Atualiza a prévia (última mensagem) da canônica
      await query(`UPDATE conversas c SET last_message = m.content, last_message_at = m.created_at
                   FROM (SELECT content, created_at FROM mensagens WHERE conversa_id = $1 AND type='text'
                         ORDER BY created_at DESC LIMIT 1) m WHERE c.id = $1`, [canonica]).catch(() => {});
    }

    if (apply) await loadCache();
    console.log(`Merge duplicadas: apply=${apply} grupos=${grupos.length} mescladas=${conversasMescladas} msgs=${mensagensMovidas}`);
    res.json({ apply, gruposDuplicados: grupos.length, conversasMescladas, mensagensMovidas, exemplos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


r.get('/whatsapp/zapi/qrcode', async (req, res) => {
  if (!zapiOk()) return res.status(400).json({ error: 'Z-API não configurada' });
  try {
    console.log('Z-API: restart para modo QR...');
    await zapiCall('/restart', 'GET').catch(() => {});
    await new Promise(r => setTimeout(r, 4000));

    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 3000));

        // /qr-code/image retorna PNG binário
        const r2 = await zapiCall('/qr-code/image', 'GET');
        if (r2?.ok) {
          const contentType = r2.headers?.get('content-type') || '';
          if (contentType.includes('image')) {
            const buf = Buffer.from(await r2.arrayBuffer());
            if (buf.length > 500) {
              console.log(`Z-API: QR PNG obtido na tentativa ${attempt + 1}`);
              return res.json({ qrcode: `data:image/png;base64,${buf.toString('base64')}` });
            }
          }
        }

        // /qr-code retorna JSON com value = URL raw do QR
        const r3 = await zapiCall('/qr-code', 'GET');
        if (r3?.ok) {
          const d = await r3.json().catch(() => ({}));
          const raw = d.value || d.qrcode || '';
          if (raw && raw.length > 20) {
            // Raw pode ser URL wa.me ou base64 — renderiza via serviço externo
            const encoded = encodeURIComponent(raw);
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encoded}&size=256x256&format=png`;
            console.log(`Z-API: QR raw → renderizando via qrserver na tentativa ${attempt + 1}`);
            return res.json({ qrcode: qrUrl });
          }
        }
      } catch (e) { console.log(`QR attempt ${attempt + 1}:`, e.message); }
    }
    res.status(400).json({ error: 'Não foi possível gerar QR Code. Certifique-se de ter desconectado o aparelho no WhatsApp do celular.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Limpar todas as conversas (ao trocar número) ─────────────────────────────
r.post('/whatsapp/clear-all', masterOnly, async (req, res) => {
  try {
    await query('DELETE FROM mensagens');
    await query('DELETE FROM conversas');
    convoCache.clear();
    cacheReady = false;
    await loadCache();
    res.json({ ok: true, message: 'Todas as conversas foram removidas' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


r.post('/whatsapp/switch-number', masterOnly, async (req, res) => {
  try {
    const { clearConversations = false } = req.body;
    // Limpa o cache em memória sempre
    convoCache.clear();
    cacheReady = false;
    let cleared = { contacts: 0, conversations: 0 };

    if (clearConversations) {
      // Limpa apenas contatos sem nome real (gerados automaticamente)
      const { rowCount: c } = await query(
        `DELETE FROM conversas WHERE contact_name = phone OR contact_name LIKE 'Contato%'`
      );
      cleared.conversations = c;
    }

    // Reinicia o cache com os dados do banco
    await loadCache();
    res.json({ ok: true, cleared, message: 'Pronto para conectar novo número' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── FOLLOW-UP AUTOMÁTICO ─────────────────────────────────────────────────────
   Reativa leads que ficaram em silêncio depois que a Vitta falou. Só age em
   conversas ainda nas mãos da Vitta (bot_ativo=true) cuja última mensagem foi
   da própria Vitta (last_from='bot') — se um humano assumiu ou respondeu, ele
   conduz. Cadência carinhosa e escalonada (2h → +1d → +3d), no máximo 3 toques,
   só em horário comercial. Zera quando o cliente responde (webhook).          */
const FOLLOWUP_MAX = 3;

// Horário comercial de São Luís-MA (UTC-3, sem horário de verão): 8h às 20h
function dentroDoHorarioComercial() {
  const horaLocal = (new Date().getUTCHours() - 3 + 24) % 24;
  return horaLocal >= 8 && horaLocal < 20;
}

async function gerarMensagemFollowup(conv, count) {
  const { rows: histRows } = await query(
    `SELECT from_type, type, content, filename FROM mensagens
     WHERE conversa_id = $1 AND type IN ('text','document') AND from_type <> 'system'
     ORDER BY created_at DESC LIMIT 12`, [conv.id]
  );
  const hist = histRows.reverse();
  const enviouPdf = hist.some(m => m.from_type === 'bot' && m.type === 'document');
  const primeiroNome = String(conv.contact_name || '').trim().split(/\s+/)[0] || '';
  const trato = primeiroNome && !/^\d+$/.test(primeiroNome) ? primeiroNome : 'mamãe';

  // Templates de segurança (tom real da Vittalis) — usados sem IA ou em falha
  const fallback = (() => {
    if (count === 0) return enviouPdf
      ? `Oi, ${trato}! 😊 Conseguiu dar uma olhadinha na proposta que te enviei? Posso esclarecer qualquer dúvida e já deixar seu horário reservado 💙`
      : `Oi, ${trato}! 😊 Passando aqui pra saber se ficou alguma dúvida. Vai ser um prazer te ajudar a deixar tudo certinho 💙`;
    if (count === 1) return `Oii, ${trato}, ainda está por aí? 🥰 Qualquer dúvida sobre valores ou datas é só me chamar — será um prazer cuidar de vocês 💙`;
    return `Oi, ${trato}! Não quero te incomodar 😊 Só deixar registrado que estou por aqui quando quiser seguir. Será um prazer receber vocês na Vittalis 💎`;
  })();

  if (!process.env.OPENAI_API_KEY || !hist.length) return fallback;

  try {
    const resumo = hist.map(m => {
      const quem = m.from_type === 'contact' ? 'Cliente' : 'Vitta';
      const txt = m.type === 'document' ? `[enviou PDF: ${m.filename || 'proposta'}]` : String(m.content || '').slice(0, 200);
      return `${quem}: ${txt}`;
    }).join('\n');

    const sys = `Você é a Vitta, atendente carinhosa da Vittalis Saúde no WhatsApp. O cliente parou de responder e você quer reativar a conversa com delicadeza. Escreva UMA única mensagem curta (1 a 2 frases), calorosa e humana, no tom da Vittalis: trate por "${trato}", use 1 emoji de afeto (💙🥰😊✨), e convide gentilmente para o próximo passo (tirar dúvida ou agendar). NÃO repita literalmente o que já foi dito. NÃO seja insistente nem cobre. Esta é a tentativa de retomada número ${count + 1} de ${FOLLOWUP_MAX} — quanto maior o número, mais leve e sem pressão. Responda APENAS a mensagem, sem aspas.`;

    const aiData = await openaiMessages({
      model: 'gpt-4o-mini', max_tokens: 150, system: sys,
      messages: [{ role: 'user', content: `Conversa até agora:\n${resumo}\n\nEscreva a mensagem de retomada.` }],
    });
    const txt = aiData?.content?.find(c => c.type === 'text')?.text?.trim();
    return txt || fallback;
  } catch (e) {
    console.error('Follow-up IA erro:', e.message);
    return fallback;
  }
}

let followupRodando = false;
export async function rodarFollowups() {
  if (followupRodando) return;          // evita sobreposição de ticks
  followupRodando = true;
  try {
    if (!zapiOk() || !dentroDoHorarioComercial()) return;

    const { rows: [cfgRow] } = await query("SELECT valor FROM configuracoes WHERE chave = 'bot'");
    const cfg = cfgRow?.valor || {};
    // Opt-in: o follow-up só dispara quando explicitamente ligado (cfg.followup === true).
    // Dado o histórico de IA "queimando leads", nasce desligado — ligue com consciência.
    if (cfg.ativo === false || cfg.followup !== true) return;

    const { rows: candidatos } = await query(`
      SELECT * FROM conversas
      WHERE bot_ativo = true
        AND last_from = 'bot'
        AND COALESCE(followup_pausado, false) = false
        AND COALESCE(followup_count, 0) < $1
        AND phone IS NOT NULL AND phone <> ''
        AND contact_id NOT LIKE '%g.us%'
        AND last_message_at < NOW() - (CASE COALESCE(followup_count, 0)
              WHEN 0 THEN INTERVAL '2 hours'
              WHEN 1 THEN INTERVAL '1 day'
              ELSE INTERVAL '3 days' END)
      ORDER BY last_message_at ASC
      LIMIT 15`, [FOLLOWUP_MAX]);

    for (const conv of candidatos) {
      try {
        let phoneNum = String(conv.phone || '').replace(/\D/g, '');
        if (phoneNum.startsWith('55') && phoneNum.length >= 12) phoneNum = phoneNum.slice(2);
        if (phoneNum.length < 10) continue;

        const count = conv.followup_count || 0;
        const msg = await gerarMensagemFollowup(conv, count);

        const zr = await zapiCall('/send-text', 'POST', { phone: `55${phoneNum}`, message: msg });
        if (!zr?.ok) { console.error('Follow-up Z-API falhou:', conv.id, zr?.status); continue; }

        const { rows: [botMsg] } = await query(
          `INSERT INTO mensagens (conversa_id, from_type, type, content, sender_nome)
           VALUES ($1,'bot','text',$2,'Vitta') RETURNING *`, [conv.id, msg]
        ).catch(() => ({ rows: [null] }));

        await query(
          `UPDATE conversas SET last_message = $1, last_from = 'bot', last_message_at = NOW(),
             followup_count = COALESCE(followup_count, 0) + 1, followup_last_at = NOW()
           WHERE id = $2`, [msg.slice(0, 100), conv.id]
        );

        const { rows: [convAtual] } = await query('SELECT * FROM conversas WHERE id = $1', [conv.id]);
        if (convAtual) cacheUpdate(convAtual);
        if (botMsg) socketEmit('new_message', { convId: conv.id, message: botMsg, conv: convAtual });
        console.log(`Follow-up #${count + 1} → ${conv.contact_name || conv.phone}`);
      } catch (e) { console.error('Follow-up erro na conversa', conv.id, e.message); }
    }
  } catch (e) {
    console.error('rodarFollowups erro:', e.message);
  } finally {
    followupRodando = false;
  }
}

export default r;

/* ─── ALERTA DE LEAD NÃO RESPONDIDO ────────────────────────────────────────────
   Pra nenhum contato ser esquecido: avisa a EQUIPE quando um cliente está
   esperando resposta há tempo demais e ninguém (humano) respondeu. Diferente do
   follow-up (que fala com o cliente), aqui é um alerta interno (sino/notificação).
   Só conta conversa fora das mãos do bot (bot_ativo=false = fila humana). Dedupe:
   um alerta por "espera" — não repete enquanto o cliente não mandar nova msg. */
let alertaRodando = false;
export async function alertarLeadsSemResposta() {
  if (alertaRodando) return;
  alertaRodando = true;
  try {
    const { rows: [cfgRow] } = await query("SELECT valor FROM configuracoes WHERE chave = 'bot'").catch(() => ({ rows: [{}] }));
    const minutos = Math.max(5, Math.min(parseInt(cfgRow?.valor?.alerta_sem_resposta_min) || 30, 1440));
    const { rows: pendentes } = await query(`
      SELECT c.id, c.contact_name, c.phone, c.last_message_at
      FROM conversas c
      WHERE c.last_from = 'contact'
        AND COALESCE(c.bot_ativo, false) = false
        AND c.last_message_at < NOW() - ($1 || ' minutes')::interval
        AND c.last_message_at > NOW() - INTERVAL '24 hours'
        AND COALESCE(c.contact_id,'') NOT LIKE '%g.us%'
        AND NOT EXISTS (
          SELECT 1 FROM notificacoes n
          WHERE n.conv_id = c.id AND n.tipo = 'lead_sem_resposta'
            AND n.created_at > c.last_message_at)
      ORDER BY c.last_message_at ASC
      LIMIT 30`, [String(minutos)]);

    for (const c of pendentes) {
      const espera = Math.round((Date.now() - new Date(c.last_message_at).getTime()) / 60000);
      const { rows: [n] } = await query(
        `INSERT INTO notificacoes (tipo, titulo, texto, conv_id) VALUES ('lead_sem_resposta',$1,$2,$3) RETURNING *`,
        [`⏰ Lead esperando: ${c.contact_name || c.phone || 'cliente'}`,
         `O cliente está sem resposta há ${espera} min. Não deixe esfriar — responda ou transfira.`, c.id]
      ).catch(() => ({ rows: [null] }));
      if (n) socketEmit('notificacao', n);
    }
    if (pendentes.length) console.log(`ALERTA sem-resposta: ${pendentes.length} lead(s) esperando há +${minutos}min`);
  } catch (e) {
    console.error('alertarLeadsSemResposta erro:', e.message);
  } finally {
    alertaRodando = false;
  }
}

