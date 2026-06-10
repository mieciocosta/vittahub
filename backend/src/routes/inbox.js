import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db/pool.js';
import { auth, SECRET } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';
import { socketEmit } from '../socketServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = express.Router();

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

function cacheGetList({ channel, search, unread_only, page = 1, limit = 100 }) {
  let list = Array.from(convoCache.values())
    .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
  if (channel && channel !== 'all') list = list.filter(c => c.channel === channel);
  if (unread_only === 'true') list = list.filter(c => (c.unread || 0) > 0);
  if (search) {
    const s = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    list = list.filter(c =>
      (c.contact_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(s) ||
      (c.phone || '').includes(s)
    );
  }
  const total = list.length;
  const offset = (Number(page) - 1) * Number(limit);
  return { data: list.slice(offset, offset + Number(limit)), total, page: Number(page) };
}

function cacheGetUpdatedSince(since, filter = {}) {
  const ts = new Date(since);
  return Array.from(convoCache.values())
    .filter(c => new Date(c.last_message_at || 0) > ts)
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
              await query('UPDATE conversas SET last_message=$1, last_message_at=NOW() WHERE id=$2', [botReply.slice(0, 100), conv.id]);
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
          ON CONFLICT (contact_id) DO UPDATE SET unread = conversas.unread + 1, last_message = $3, last_message_at = NOW()
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

// ─── WEBHOOK Z-API (sem JWT — chamado pela Z-API) ─────────────────────────
r.post('/webhook/zapi', async (req, res) => {
  res.json({ received: true });
  try {
    const body = req.body;
    console.log(`ZAPI_WH: ${JSON.stringify(body).slice(0, 300)}`);

    // Z-API webhook payload:
    // { phone, senderName, profilePicUrl, isFromMe, messageId,
    //   text: { message }, image: { imageUrl, caption },
    //   audio: { audioUrl }, video: { videoUrl, caption },
    //   document: { documentUrl, fileName, caption },
    //   sticker: { stickerUrl }, location: { lat, lng } }

    const phone = body.phone; // already formatted: 5511999999999
    if (!phone) return;
    if (body.isGroup) return; // skip groups

    const isMe = !!body.isFromMe;
    const msgId = body.messageId || body.zaapId || null;
    const senderName = body.senderName || '';
    const profilePic = body.profilePicUrl || body.photo || '';

    if (isMe) {
      // fromMe: just update delivery status
      if (msgId) {
        await query(
          `UPDATE mensagens SET status = 'delivered'
           WHERE wa_msg_id = $1`,
          [msgId]
        ).catch(() => {});
      }
      return;
    }

    // Deduplication
    if (msgId) {
      const { rows: exists } = await query('SELECT id FROM mensagens WHERE wa_msg_id = $1 LIMIT 1', [msgId]);
      if (exists.length > 0) return;
    }

    // Extract content
    let content = '[mensagem]', type = 'text', mediaData = null, filename = null;
    if (body.text?.message)            { content = body.text.message; type = 'text'; }
    else if (body.image?.imageUrl)     { content = body.image.caption || ''; type = 'image'; mediaData = body.image.imageUrl; }
    else if (body.audio?.audioUrl)     { content = '🎵 Áudio'; type = 'audio'; mediaData = body.audio.audioUrl; }
    else if (body.video?.videoUrl)     { content = body.video.caption || ''; type = 'video'; mediaData = body.video.videoUrl; }
    else if (body.document?.documentUrl) {
      filename = body.document.fileName || 'Documento';
      content = `📎 ${filename}`;
      type = 'document';
      mediaData = body.document.documentUrl;
    }
    else if (body.sticker?.stickerUrl) { content = ''; type = 'sticker'; mediaData = body.sticker.stickerUrl; }
    else if (body.gif?.gifUrl)         { content = ''; type = 'gif'; mediaData = body.gif.gifUrl; }
    else if (body.location)            { content = `📍 ${body.location.address || `${body.location.lat},${body.location.lng}`}`; }
    else if (body.contact?.displayName){ content = `👤 ${body.contact.displayName}`; }
    else if (body.reaction?.text)      { content = `${body.reaction.text} (reação)`; }
    else if (body.pix?.pixKey)         { content = `💰 Pix: ${body.pix.pixKey}`; }

    // Foto de perfil: tenta buscar via Z-API na primeira mensagem do contato
    let fetchedPic = profilePic;
    if (!fetchedPic && zapiOk()) {
      try {
        const picResp = await zapiCall(`/profile-picture?phone=55${phone.startsWith('55') ? phone.slice(2) : phone}`, 'GET');
        if (picResp?.ok) {
          const picData = await picResp.json();
          fetchedPic = picData.value || picData.url || null;
        }
      } catch {}
    }

    const remoteJid = `${phone}@s.whatsapp.net`;
    const displayPhone = phone.startsWith('55') ? phone.slice(2) : phone;
    const contactName = senderName && senderName.length > 2 ? senderName : displayPhone;
    const ts = body.momment ? new Date(body.momment).toISOString() : new Date().toISOString();
    const previewContent = type === 'text' ? content : type === 'sticker' ? '🎭 Sticker' : type === 'gif' ? '🎞️ GIF' : type === 'image' ? '📷 Imagem' : type === 'audio' ? '🎵 Áudio' : type === 'video' ? '🎥 Vídeo' : type === 'document' ? `📎 ${filename}` : content;

    console.log(`ZAPI_MSG: from="${contactName}" phone="${displayPhone}" type="${type}"`);

    // Upsert conversa
    const { rows: [conv] } = await query(`
      INSERT INTO conversas (channel, contact_name, contact_id, phone, unread, last_message, last_message_at, profile_pic)
      VALUES ('whatsapp', $1, $2, $3, 1, $4, $5, $6)
      ON CONFLICT (contact_id) DO UPDATE SET
        contact_name = CASE
          WHEN length(EXCLUDED.contact_name) > 5 AND EXCLUDED.contact_name != EXCLUDED.phone
          THEN EXCLUDED.contact_name
          ELSE conversas.contact_name
        END,
        profile_pic = COALESCE(EXCLUDED.profile_pic, conversas.profile_pic),
        unread = conversas.unread + 1,
        last_message = EXCLUDED.last_message,
        last_message_at = EXCLUDED.last_message_at
      RETURNING *`,
      [contactName, remoteJid, displayPhone, previewContent, ts, fetchedPic || null]
    );

    // Atualiza cache em memória imediatamente
    cacheUpdate(conv);

    // Salva mensagem
    const finalContent = mediaData || content;
    const { rows: [newMsg] } = await query(
      `INSERT INTO mensagens (conversa_id, from_type, type, content, filename, created_at, wa_msg_id)
       SELECT $1, 'contact', $2, $3, $4, $5, $6
       WHERE NOT EXISTS (SELECT 1 FROM mensagens WHERE wa_msg_id = $6 AND $6 IS NOT NULL)
       RETURNING *`,
      [conv.id, type, finalContent, filename, ts, msgId]
    );

    // ── Socket.io: entrega instantânea para todos os clientes ──
    if (newMsg) {
      socketEmit('new_message', { convId: conv.id, message: newMsg, conv });
      await query(`SELECT pg_notify('vittahub', $1)`, [
        JSON.stringify({ event:'new_message', convId:conv.id, messageId:newMsg.id, conv })
      ]).catch(() => {});
      notifyWaiters(conv.id, newMsg);
    }


    await query(
      `INSERT INTO notificacoes (tipo, titulo, texto, conv_id) VALUES ('mensagem',$1,$2,$3)`,
      [contactName, content.slice(0, 80), conv.id]
    ).catch(() => {});

    // ─── VITTA — BOT INTELIGENTE COM CLAUDE AI ────────────────────────────────
    if (conv.bot_ativo) {
      try {
        const { rows: [cfgRow] } = await query("SELECT valor FROM configuracoes WHERE chave = 'bot'");
        const cfg = cfgRow?.valor || {};
        if (cfg.ativo === false) throw new Error('bot desabilitado');

        // Histórico da conversa para contexto
        const { rows: history } = await query(
          `SELECT from_type, content FROM mensagens
           WHERE conversa_id = $1 AND type = 'text'
           ORDER BY created_at DESC LIMIT 12`,
          [conv.id]
        );
        const historyText = history.reverse()
          .filter(m => m.content && m.content.length < 500)
          .map(m => `${m.from_type === 'me' || m.from_type === 'bot' ? 'Vitta' : 'Cliente'}: ${m.content}`)
          .join('\n');

        let botReply = '';

        // ── CLAUDE AI (quando ANTHROPIC_API_KEY está configurada) ──────────────
        if (process.env.ANTHROPIC_API_KEY) {
          try {
            const { default: fetch } = await import('node-fetch');
            const botInstrucoes = process.env.BOT_INSTRUCOES || cfg.instrucoes || '';

            const sysPrompt = `Você é a Vitta, assistente virtual da Vittalis Saúde.

Informações da clínica:
- Clínica particular de pediatria e vacinação em São Luís, MA
- Localização: Business Center, Av. Coronel Colares Moreira 3, Jardim Renascença
- Funcionamento: segunda a sexta 8h-18h, sábado 8h-12h
- WhatsApp da clínica: (98) 98422-1002
- Site: vittalissaude.com.br
- Slogan: "Sua vida é preciosa."
${botInstrucoes ? `\nInformações adicionais: ${botInstrucoes}` : ''}

Como se comportar:
- Se apresente como Vitta quando for a primeira mensagem
- Seja acolhedora, humana e profissional — como uma recepcionista excelente
- Para agendamentos: peça nome, idade do paciente e qual vacina/consulta deseja
- Para valores: diga que varia por vacina/consulta e ofereça enviar tabela de valores
- Para dúvidas médicas complexas: diga que vai conectar com um especialista da equipe
- Encerre sempre deixando espaço para mais perguntas
- Máximo 3 parágrafos. Português brasileiro. Não use linguagem robótica.`;

            const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 350,
                system: sysPrompt,
                messages: [
                  ...(historyText ? [
                    { role: 'user', content: historyText },
                    { role: 'assistant', content: 'Entendido.' }
                  ] : []),
                  { role: 'user', content: content },
                ],
              }),
            });
            const aiData = await aiResp.json();
            if (aiData.error) {
              console.error('Vitta (Claude) erro:', JSON.stringify(aiData.error));
            } else {
              botReply = aiData.content?.[0]?.text?.trim() || '';
            }
          } catch (e) { console.error('Vitta bot error:', e.message); }
        }

        // ── FALLBACK INTELIGENTE (sem API key ou erro) ─────────────────────────
        // Responde baseado em palavras-chave — NÃO usa mais "Vou chamar um atendente"
        if (!botReply) {
          const msg = content.toLowerCase().trim();
          const isFirstMsg = history.length <= 1;

          if (isFirstMsg || /^(oi|olá|ola|bom dia|boa tarde|boa noite|hey|hi|hello|tudo bem)/.test(msg)) {
            botReply = `Olá! 😊 Sou a Vitta, assistente da Vittalis Saúde. Posso ajudar com informações sobre vacinas, agendamentos e consultas.\n\nComo posso te ajudar hoje?`;
          } else if (/vacin|dose|imun/.test(msg)) {
            botReply = `Temos um calendário vacinal completo para bebês, crianças e adultos! 💉\n\nPara saber quais vacinas estão disponíveis e os valores, pode me passar a idade do paciente?`;
          } else if (/preço|valor|custa|quanto/.test(msg)) {
            botReply = `Os valores variam de acordo com a vacina ou consulta desejada. Para te passar uma informação precisa, nossa equipe entrará em contato em breve! 📋\n\nQual vacina ou consulta você tem interesse?`;
          } else if (/agend|marcar|consulta|hora/.test(msg)) {
            botReply = `Ficamos felizes em agendar! 📅\n\nPode me informar: nome do paciente, idade e qual vacina ou consulta deseja? Assim nossa equipe confirma a disponibilidade.`;
          } else if (/horário|funciona|abre|fecha|sábado|domingo/.test(msg)) {
            botReply = `Nosso horário de atendimento é:\n• Segunda a sexta: 8h às 18h\n• Sábado: 8h às 12h\n\nEstamos localizados no Business Center, Av. Coronel Colares Moreira 3, Jardim Renascença — São Luís, MA. 📍`;
          } else if (/endereço|onde|localiz|chegar/.test(msg)) {
            botReply = `Estamos no Business Center, Av. Coronel Colares Moreira 3, Salas 36-37, Jardim Renascença — São Luís, MA. 📍\n\nPosso te ajudar com mais alguma informação?`;
          } else if (/obrig|valeu|ok|perfeito|ótimo|entend/.test(msg)) {
            botReply = `De nada! 💙 Estamos à disposição. Sua vida é preciosa — a gente quer cuidar dela!\n\nSe precisar de mais alguma informação, é só me chamar. 😊`;
          } else {
            // Resposta genérica mas útil — sem "Vou chamar um atendente"
            botReply = `Obrigada pela mensagem! 😊 Recebi sua dúvida e nossa equipe da Vittalis Saúde vai responder em breve.\n\nEnquanto isso, posso te ajudar com informações sobre vacinas, agendamentos ou horários de atendimento. O que você prefere?`;
          }
        }

        if (botReply && zapiOk()) {
          await zapiCall('/send-text', 'POST', { phone: `55${displayPhone}`, message: botReply });
          const { rows: [botMsg] } = await query(
            `INSERT INTO mensagens (conversa_id, from_type, type, content, sender_nome)
             VALUES ($1,'bot','text',$2,'Vitta') RETURNING *`,
            [conv.id, botReply]
          );
          await query('UPDATE conversas SET last_message=$1, last_message_at=NOW() WHERE id=$2',
            [botReply.slice(0, 100), conv.id]);
          if (botMsg) socketEmit('new_message', { convId: conv.id, message: botMsg, conv });
        }
      } catch (e) { if (e.message !== 'bot desabilitado') console.error('Vitta error:', e.message); }
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

// Keep Evolution webhook for backward compat
r.use(auth);
r.use(auth);

// ─── POLL: conversas atualizadas — servido do CACHE (zero DB query) ──────────
r.get('/conversations/updates', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache');
  const since = req.query.since;
  if (!since) return res.json({ data: [] });
  const updated = cacheGetUpdatedSince(since);
  res.json({ data: updated });
});

// ─── LISTAGEM de conversas — servido do CACHE (zero DB query na maioria) ─────
// ─── BATCH: carregar fotos de perfil via Z-API ────────────────────────────────
r.post('/conversations/load-photos', async (req, res) => {
  try {
    if (!zapiOk()) return res.json({ ok: false, updated: 0, error: 'Z-API não configurada' });
    const { rows } = await query(
      `SELECT id, phone FROM conversas WHERE profile_pic IS NULL AND phone IS NOT NULL ORDER BY last_message_at DESC LIMIT 50`
    );
    let updated = 0;
    for (const conv of rows) {
      try {
        const phone = conv.phone?.replace(/\D/g, '');
        if (!phone || phone.length < 8) continue;
        const r2 = await zapiCall(`/profile-picture?phone=55${phone}`, 'GET');
        if (r2?.ok) {
          const d = await r2.json();
          const pic = d.value || d.url || d.profilePictureUrl || null;
          if (pic && pic.startsWith('http')) {
            await query('UPDATE conversas SET profile_pic = $1 WHERE id = $2', [pic, conv.id]);
            const cached = convoCache.get(conv.id);
            if (cached) cacheUpdate({ ...cached, profile_pic: pic });
            updated++;
          }
        }
        await new Promise(r => setTimeout(r, 150));
      } catch {}
    }
    res.json({ ok: true, updated, total: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/conversations', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache');
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
      if (search) {
        conditions.push(`(unaccent(lower(c.contact_name)) ILIKE unaccent(lower($${pi})) OR c.phone ILIKE $${pi})`);
        params.push(`%${search}%`); pi++;
      }
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const countRes = await query(`SELECT COUNT(*) FROM conversas c ${where}`, params);
      const total = parseInt(countRes.rows[0].count);
      const dataRes = await query(`SELECT c.* FROM conversas c ${where} ORDER BY c.last_message_at DESC LIMIT $${pi} OFFSET $${pi+1}`, [...params, parseInt(limit), offset]);
      return res.json({ data: dataRes.rows, total, page: parseInt(page) });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }
  const result = cacheGetList(req.query);
  res.json(result);
});

// ─── GET SINGLE CONVERSATION WITH MESSAGES ───────────────────────────────────
r.get('/conversations/:id', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache');
    const { rows: [conv] } = await query(`
      SELECT c.*, u.nome AS responsavel_nome, u.cor AS responsavel_cor
      FROM conversas c LEFT JOIN usuarios u ON u.id = c.responsavel_id
      WHERE c.id = $1`, [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Não encontrado' });

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
    await query("UPDATE mensagens SET status = 'read' WHERE conversa_id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ASSIGN ────────────────────────────────────────────────────────────────────
r.patch('/conversations/:id/assign', async (req, res) => {
  try {
    await query('UPDATE conversas SET responsavel_id = $1 WHERE id = $2', [req.body.responsavel_id, req.params.id]);
    res.json({ ok: true });
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
    const { rows: [c] } = await query('UPDATE conversas SET bot_ativo = $1 WHERE id = $2 RETURNING bot_ativo', [req.body.ativo, req.params.id]);
    res.json({ ok: true, botAtivo: c.bot_ativo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────
r.post('/conversations/:id/send', async (req, res) => {
  try {
    const { content, type = 'text' } = req.body;
    const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Não encontrado' });

    const { rows: [msg] } = await query(`
      INSERT INTO mensagens (conversa_id, from_type, type, content, sender_id, sender_nome, status)
      VALUES ($1, 'me', $2, $3, $4, $5, 'sent')
      RETURNING *`,
      [req.params.id, type, content, req.user.id, req.user.nome]
    );

    const preview = type === 'text' ? content : type === 'audio' ? '🎵 Áudio' : type === 'image' ? '📷 Imagem' : `📎 Arquivo`;
    const { rows: [convUpd] } = await query('UPDATE conversas SET last_message = $1, last_message_at = NOW() WHERE id = $2 RETURNING *', [preview, req.params.id]);
    if (convUpd) cacheUpdate(convUpd);

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
          if (type === 'text')     zr = await zapiCall('/send-text',     'POST', { phone: phone55, message: content });
          else if (type === 'audio')    zr = await zapiCall('/send-audio',    'POST', { phone: phone55, audio: content });
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

    res.json(msg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── UPLOAD FILE ──────────────────────────────────────────────────────────────
r.post('/conversations/:id/upload', upload.single('file'), async (req, res) => {
  try {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'Arquivo não enviado' });

    const type = f.mimetype.startsWith('audio/') ? 'audio'
               : f.mimetype.startsWith('image/') ? 'image'
               : f.mimetype.startsWith('video/') ? 'video'
               : 'document';

    // Converte para base64 para armazenar inline (Railway sem storage persistente)
    const base64 = f.buffer.toString('base64');
    const dataUrl = `data:${f.mimetype};base64,${base64}`;

    const preview = type === 'audio' ? '🎵 Áudio'
                  : type === 'image' ? '📷 Imagem'
                  : type === 'video' ? '🎥 Vídeo'
                  : `📎 ${f.originalname}`;

    const { rows: [msg] } = await query(`
      INSERT INTO mensagens (conversa_id, from_type, type, content, filename, mimetype, file_size, sender_id, sender_nome)
      VALUES ($1, 'me', $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.params.id, type, dataUrl, f.originalname, f.mimetype, f.size, req.user.id, req.user.nome]
    );

    await query('UPDATE conversas SET last_message = $1, last_message_at = NOW() WHERE id = $2', [preview, req.params.id]);

    // Envia via Evolution API usando base64
    const { rows: [conv] } = await query('SELECT * FROM conversas WHERE id = $1', [req.params.id]);
    if (conv && EVO_URL() && EVO_KEY() && conv.channel === 'whatsapp') {
      try {
        const waNumber = conv.contact_id
          ? conv.contact_id.replace('@s.whatsapp.net', '')
          : `55${conv.phone}`;

        if (type === 'audio') {
          await evoFetch(`/message/sendWhatsAppAudio/${EVO_INST()}`, 'POST', {
            number: waNumber,
            audio: base64,
            encoding: true
          });
        } else {
          const mediatype = type === 'image' ? 'image' : type === 'video' ? 'video' : 'document';
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
      } catch (e) { console.error('EVO media send error:', e.message); }
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
      INSERT INTO leads (nome, telefone, origem, interesse, status, responsavel_id, observacoes)
      VALUES ($1,$2,$3,'Consulta','Novo lead',$4,$5) RETURNING *`,
      [conv.contact_name, conv.phone || '', conv.channel === 'instagram' ? 'Instagram' : 'WhatsApp', conv.responsavel_id || req.user.id, `Lead automático via ${conv.channel}`]
    );

    await query('UPDATE conversas SET lead_id = $1 WHERE id = $2', [lead.id, conv.id]);
    await query('INSERT INTO notificacoes (tipo,titulo,texto,lead_id) VALUES ($1,$2,$3,$4)', ['novo_lead','Lead criado',`${lead.nome} adicionado ao funil`,lead.id]);

    res.json({ lead, created: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── AI ASSIST ────────────────────────────────────────────────────────────────
r.post('/ai-assist', async (req, res) => {
  try {
    const { prompt } = req.body;
    const KEY = process.env.ANTHROPIC_API_KEY;
    if (!KEY) {
      const mocks = {
        summary: '📋 **Resumo**\n\n◆ **Interesse:** Plano Vacinal / Vacinas\n◆ **Intenção:** Alta 🔥\n◆ **Objeções:** Preço (possível)\n◆ **Próximo passo:** Enviar proposta personalizada com condições',
        qualify: '⭐ **Score: 8/10**\n\nAlto potencial. Cliente demonstra interesse real, está comparando opções. Urgência média-alta. Recomendo proposta imediata com desconto de fidelidade.',
        suggest: '💡 **Estratégia:** Envie a proposta do Plano Adulto agora. Destaque o valor preventivo e mencione parcelamento. Crie urgência: "temos agenda disponível esta semana".',
      };
      const isReply = prompt?.includes('próxima mensagem');
      const isSuggest = prompt?.includes('estratégia') || prompt?.includes('consultor');
      const isScore = prompt?.includes('Score') || prompt?.includes('score');
      if (isReply) return res.json({ text: 'Olá! 😊 Preparei uma proposta personalizada para você — posso enviar agora? Temos condições especiais esta semana! 💎' });
      return res.json({ text: isScore ? mocks.qualify : isSuggest ? mocks.suggest : mocks.summary });
    }
    const { default: fetch } = await import('node-fetch');
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await resp.json();
    res.json({ text: data.content?.[0]?.text || 'Sem resposta' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── QUICK REPLIES ────────────────────────────────────────────────────────────
r.get('/quick-replies', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM respostas_rapidas ORDER BY created_at');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/quick-replies', async (req, res) => {
  try {
    const { rows: [qr] } = await query('INSERT INTO respostas_rapidas (titulo,texto) VALUES ($1,$2) RETURNING *', [req.body.titulo, req.body.texto]);
    res.json(qr);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/quick-replies/:id', async (req, res) => {
  try {
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
    await query("INSERT INTO configuracoes (chave,valor) VALUES ('bot',$1) ON CONFLICT (chave) DO UPDATE SET valor=$1, updated_at=NOW()", [JSON.stringify(req.body)]);
    res.json(req.body);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
r.post('/whatsapp/update-contacts', async (req, res) => {
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

// ─── IMPORT WHATSAPP HISTORY ──────────────────────────────────────────────────
r.post('/whatsapp/import-history', async (req, res) => {
  const EVO = process.env.EVOLUTION_API_URL;
  const KEY = process.env.EVOLUTION_API_KEY;
  const INST = process.env.EVOLUTION_INSTANCE || 'vittalis';
  if (!EVO || !KEY) return res.status(400).json({ error: 'Não configurado' });
  try {
    const { default: fetch } = await import('node-fetch');
    const limit = parseInt(req.body?.limit) || 150;

    // Busca lista de chats
    const r2 = await fetch(`${EVO}/chat/findChats/${INST}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(30000)
    });
    const chatsRaw = await r2.json();
    const chatList = Array.isArray(chatsRaw) ? chatsRaw : (chatsRaw?.data || []);
    console.log(`IMPORT: ${chatList.length} chats encontrados`);

    // Busca contatos para resolver nomes
    let contacts = {};
    try {
      const rc = await fetch(`${EVO}/contact/findContacts/${INST}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: KEY },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(15000)
      });
      if (rc.ok) {
        const cRaw = await rc.json();
        const cList = Array.isArray(cRaw) ? cRaw : (cRaw?.data || []);
        for (const c of cList) {
          const jid = c.remoteJid || c.id || '';
          const name = c.pushName || c.name || c.verifiedName || '';
          const pic  = c.profilePicUrl || c.imgUrl || '';
          if (jid) {
            if (name) contacts[jid] = { name, pic };
          }
        }
        console.log(`IMPORT: ${Object.keys(contacts).length} contatos carregados`);
      }
    } catch (e) { console.log('Contacts fetch failed:', e.message); }

    let imported = 0, msgsImported = 0;

    for (const chat of chatList.slice(0, limit)) {
      const remoteJid = chat.id || chat.remoteJid || '';
      // Pula grupos, broadcast e LIDs (formato novo do WA Business sem número real)
      if (!remoteJid) continue;
      if (remoteJid.endsWith('@g.us')) continue;
      if (remoteJid.endsWith('@broadcast')) continue;
      if (remoteJid.endsWith('@lid')) continue;  // LID não tem telefone real
      if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.match(/^\d+@/)) continue;

      const rawPhone2 = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, ''); const phone = rawPhone2.startsWith('55') ? rawPhone2.slice(2) : rawPhone2;

      // Resolve nome e foto: prioridade contatos > pushName do chat > nome do chat
      const contactInfo = contacts[remoteJid] || {};
      const name = contactInfo.name || chat.pushName || chat.name || phone;
      const profilePic = contactInfo.pic || chat.profilePicUrl || '';

      const extractContent = (msgObj) => {
        const m = msgObj?.message || msgObj || {};
        if (m.conversation) return { content: m.conversation, type: 'text' };
        if (m.extendedTextMessage?.text) return { content: m.extendedTextMessage.text, type: 'text' };
        if (m.imageMessage) return { content: m.imageMessage.caption || '📷 Imagem', type: 'image' };
        if (m.videoMessage) return { content: m.videoMessage.caption || '🎥 Vídeo', type: 'video' };
        if (m.audioMessage || m.pttMessage) return { content: '🎵 Áudio', type: 'audio' };
        if (m.documentMessage) return { content: `📎 ${m.documentMessage.fileName || 'Documento'}`, type: 'document' };
        if (m.stickerMessage) return { content: '🎭 Sticker', type: 'text' };
        if (m.locationMessage) return { content: '📍 Localização', type: 'text' };
        return null;
      };

      const lastExtracted = extractContent(chat.lastMessage);
      const lastMsg = lastExtracted?.content || '...';
      const lastTime = chat.lastMessage?.messageTimestamp
        ? new Date(parseInt(String(chat.lastMessage.messageTimestamp)) * 1000).toISOString()
        : new Date().toISOString();

      // Upsert conversa com nome e foto corretos
      const { rows: [conv] } = await query(`
        INSERT INTO conversas (channel, contact_name, contact_id, phone, last_message, last_message_at, unread, profile_pic)
        VALUES ('whatsapp', $1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (contact_id) DO UPDATE SET
          contact_name = CASE
            WHEN length(EXCLUDED.contact_name) > 5 AND EXCLUDED.contact_name != EXCLUDED.phone
            THEN EXCLUDED.contact_name
            ELSE conversas.contact_name
          END,
          profile_pic = COALESCE(EXCLUDED.profile_pic, conversas.profile_pic),
          last_message = EXCLUDED.last_message,
          last_message_at = EXCLUDED.last_message_at
        RETURNING *`,
        [name, remoteJid, phone, lastMsg, lastTime, chat.unreadCount || 0, profilePic || null]
      );

      // Busca mensagens do chat (últimas 50)
      try {
        const rm = await fetch(`${EVO}/chat/findMessages/${INST}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: KEY },
          body: JSON.stringify({ where: { key: { remoteJid } }, limit: 50 }),
          signal: AbortSignal.timeout(12000)
        });
        if (rm.ok) {
          const msgsRaw = await rm.json();
          const msgs = Array.isArray(msgsRaw) ? msgsRaw
            : (msgsRaw?.messages?.records || msgsRaw?.records || msgsRaw?.data || []);

          for (const m of msgs) {
            const extracted = extractContent(m);
            if (!extracted) continue;
            const fromType = m.key?.fromMe ? 'me' : 'contact';
            const ts = m.messageTimestamp
              ? new Date(parseInt(String(m.messageTimestamp)) * 1000).toISOString()
              : new Date().toISOString();
            await query(
              `INSERT INTO mensagens (conversa_id, from_type, type, content, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
              [conv.id, fromType, extracted.type, extracted.content, ts]
            ).catch(() => {});
            msgsImported++;
          }
        }
      } catch (e) { /* mensagens são best-effort */ }

      imported++;
    }

    // Atualiza nomes de conversas antigas que ainda têm ID como nome
    if (Object.keys(contacts).length > 0) {
      for (const [jid, nome] of Object.entries(contacts)) {
        if (nome && nome.length > 2) {
          await query(
            `UPDATE conversas SET contact_name = $1 WHERE contact_id = $2 AND (contact_name = phone OR length(contact_name) < 5)`,
            [nome, jid]
          ).catch(() => {});
        }
      }
    }

    console.log(`IMPORT DONE: ${imported} conversas, ${msgsImported} mensagens`);
    res.json({ ok: true, imported, msgsImported, total: chatList.length });
  } catch (e) {
    console.error('Import error:', e.message);
    res.status(500).json({ error: e.message });
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

r.post('/whatsapp/create-instance', async (req, res) => {
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

r.post('/whatsapp/disconnect', async (req, res) => {
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
r.post('/whatsapp/zapi/disconnect', async (req, res) => {
  if (!zapiOk()) return res.status(400).json({ error: 'Z-API não configurada' });
  try {
    const r2 = await zapiCall('/disconnect', 'POST');
    const d = r2?.ok ? await r2.json() : {};
    res.json({ ok: true, ...d });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Z-API: status ────────────────────────────────────────────────────────────
r.get('/whatsapp/zapi/status', async (req, res) => {
  if (!zapiOk()) return res.json({ connected: false, error: 'Z-API não configurada' });
  try {
    const r2 = await zapiCall('/status', 'GET');
    if (!r2?.ok) return res.json({ connected: false });
    const d = await r2.json();
    res.json({ connected: d.connected || d.status === 'connected', phone: d.phone, ...d });
  } catch (e) { res.json({ connected: false, error: e.message }); }
});

// ─── Z-API: QR Code com restart + retry ──────────────────────────────────────
r.get('/whatsapp/zapi/qrcode', async (req, res) => {
  if (!zapiOk()) return res.status(400).json({ error: 'Z-API não configurada' });
  try {
    // Restart coloca a instância em modo "aguardando QR" quando desconectada
    console.log('Z-API: chamando /restart para forçar modo QR...');
    await zapiCall('/restart', 'GET').catch(() => {});
    // Aguarda Z-API processar o restart
    await new Promise(r => setTimeout(r, 4000));

    // Tenta obter QR com até 6 tentativas
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 3000));
        // Tenta /qr-code (base64) primeiro, depois /qrcode-image como fallback
        for (const ep of ['/qr-code', '/qrcode-image']) {
          const r2 = await zapiCall(ep, 'GET');
          if (!r2) continue;
          const text = await r2.text();
          if (!text || text.length < 20) continue;
          // Tenta parsear como JSON
          try {
            const d = JSON.parse(text);
            const qr = d.value || d.qrcode || d.base64 || d.qr || null;
            if (qr) {
              console.log(`Z-API: QR Code obtido via ${ep} na tentativa ${attempt+1}`);
              return res.json({ qrcode: qr });
            }
          } catch {
            // Pode ser base64 direto (PNG)
            if (/^[A-Za-z0-9+/=]{50,}/.test(text.trim())) {
              console.log(`Z-API: QR Code base64 direto via ${ep}`);
              return res.json({ qrcode: text.trim() });
            }
          }
        }
      } catch (e) { console.log(`QR attempt ${attempt+1} error:`, e.message); }
    }
    res.status(400).json({ error: 'Não foi possível gerar QR Code após restart. Verifique se a instância Z-API está ativa no painel.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── TROCA DE NÚMERO: limpa dados conflitantes do número anterior ─────────────
r.post('/whatsapp/switch-number', async (req, res) => {
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

export default r;

