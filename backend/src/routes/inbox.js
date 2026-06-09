import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db/pool.js';
import { auth } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = express.Router();

// Upload em memória (não disco — Railway não tem storage persistente)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

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

// ─── ROTAS PÚBLICAS (sem JWT) ─────────────────────────────────────────────────
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
    let content = '[mensagem]', type = 'text', mediaData = null;
    if (body.text?.message)           { content = body.text.message; type = 'text'; }
    else if (body.image?.imageUrl)     { content = body.image.caption || '📷 Imagem'; type = 'image'; mediaData = body.image.imageUrl; }
    else if (body.audio?.audioUrl)     { content = '🎵 Áudio'; type = 'audio'; mediaData = body.audio.audioUrl; }
    else if (body.video?.videoUrl)     { content = body.video.caption || '🎥 Vídeo'; type = 'video'; mediaData = body.video.videoUrl; }
    else if (body.document?.documentUrl) { content = `📎 ${body.document.fileName || 'Documento'}`; type = 'document'; mediaData = body.document.documentUrl; }
    else if (body.sticker?.stickerUrl)   { content = '🎭 Sticker'; type = 'image'; mediaData = body.sticker.stickerUrl; }
    else if (body.location)              { content = `📍 ${body.location.address || `${body.location.lat},${body.location.lng}`}`; }
    else if (body.contact?.displayName) { content = `👤 ${body.contact.displayName}`; }
    else if (body.reaction?.text)        { content = `${body.reaction.text} (reação)`; }
    else if (body.gif?.gifUrl)           { content = '🎞️ GIF'; type = 'image'; mediaData = body.gif.gifUrl; }

    const remoteJid = `${phone}@s.whatsapp.net`;
    const displayPhone = phone.startsWith('55') ? phone.slice(2) : phone;
    const contactName = senderName && senderName.length > 2 ? senderName : displayPhone;
    const ts = body.momment ? new Date(body.momment).toISOString() : new Date().toISOString();

    console.log(`ZAPI_MSG: from="${contactName}" phone="${displayPhone}" type="${type}" content="${content.slice(0,50)}"`);

    // Upsert conversa — atualiza nome e foto se tiver
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
      [contactName, remoteJid, displayPhone, content, ts, profilePic || null]
    );

    // Salva mensagem
    await query(
      `INSERT INTO mensagens (conversa_id, from_type, type, content, filename, created_at, wa_msg_id)
       SELECT $1, 'contact', $2, $3, $4, $5, $6
       WHERE NOT EXISTS (SELECT 1 FROM mensagens WHERE wa_msg_id = $6 AND $6 IS NOT NULL)`,
      [conv.id, type, mediaData || content, null, ts, msgId]
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
        if (cfg.ativo !== false && zapiOk()) {
          const { rows: countRow } = await query('SELECT COUNT(*) n FROM mensagens WHERE conversa_id = $1', [conv.id]);
          const msgCount = parseInt(countRow[0].n);
          let botReply = msgCount <= 1 && cfg.mensagemBoasVindas
            ? cfg.mensagemBoasVindas
            : (cfg.respostas?.[content.trim()] || cfg.respostas?.['default'] || '');
          if (botReply) {
            await zapiCall('/send-text', 'POST', { phone: `55${displayPhone}`, message: botReply });
            await query(`INSERT INTO mensagens (conversa_id, from_type, type, content, sender_nome) VALUES ($1,'me','text',$2,'Bot Vittalis')`, [conv.id, botReply]);
            await query('UPDATE conversas SET last_message=$1, last_message_at=NOW() WHERE id=$2', [botReply.slice(0, 100), conv.id]);
          }
        }
      } catch (e) { console.error('Bot error:', e.message); }
    }
  } catch (err) { console.error('ZAPI_ERROR:', err.message); }
});

// Keep Evolution webhook for backward compat
r.use(auth);
r.use(auth);

// ─── CONVERSATIONS LIST (paginated + search, high-performance) ──────────────
r.get('/conversations', async (req, res) => {
  try {
    const { channel, responsavel_id, search, page = 1, limit = 50, unread_only } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let pi = 1;

    if (channel && channel !== 'all') { conditions.push(`c.channel = $${pi++}`); params.push(channel); }
    if (responsavel_id)               { conditions.push(`c.responsavel_id = $${pi++}`); params.push(responsavel_id); }
    if (unread_only === 'true')        { conditions.push(`c.unread > 0`); }
    if (search) {
      // Busca inteligente: sem acento, case insensitive, por nome ou telefone
      conditions.push(`(
        unaccent(lower(c.contact_name)) ILIKE unaccent(lower($${pi}))
        OR c.phone ILIKE $${pi}
        OR c.contact_id ILIKE $${pi}
      )`);
      params.push(`%${search}%`);
      pi++;
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const countRes = await query(`SELECT COUNT(*) FROM conversas c ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const dataRes = await query(`
      SELECT c.*,
        u.nome AS responsavel_nome,
        (SELECT COUNT(*) FROM mensagens m WHERE m.conversa_id = c.id) AS message_count
      FROM conversas c
      LEFT JOIN usuarios u ON u.id = c.responsavel_id
      ${where}
      ORDER BY c.last_message_at DESC
      LIMIT $${pi} OFFSET $${pi+1}
    `, [...params, parseInt(limit), offset]);

    res.json({ data: dataRes.rows, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('conversations list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET SINGLE CONVERSATION WITH MESSAGES ────────────────────────────────────
r.get('/conversations/:id', async (req, res) => {
  try {
    const { rows: [conv] } = await query(`
      SELECT c.*, u.nome AS responsavel_nome, u.cor AS responsavel_cor
      FROM conversas c LEFT JOIN usuarios u ON u.id = c.responsavel_id
      WHERE c.id = $1`, [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Não encontrado' });

    const { rows: messages } = await query(
      'SELECT * FROM mensagens WHERE conversa_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );

    let lead = null;
    if (conv.lead_id) {
      const { rows: [l] } = await query('SELECT * FROM leads WHERE id = $1', [conv.lead_id]);
      lead = l;
    }

    // Profile pic: save from webhook pushName data going forward
    // getProfilePicture endpoint not available in this Evolution fork

    res.json({ ...conv, messages, lead });
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
    await query('UPDATE conversas SET last_message = $1, last_message_at = NOW() WHERE id = $2', [preview, req.params.id]);

    // WhatsApp send: Z-API (preferred) or Evolution API (fallback)
    if (conv.channel === 'whatsapp') {
      try {
        const waNumber = conv.contact_id
          ? conv.contact_id.replace('@s.whatsapp.net', '')
          : `55${conv.phone}`;
        const phone55 = waNumber.startsWith('55') ? waNumber : `55${waNumber}`;
        let sent = false;

        // Z-API
        if (zapiOk()) {
          let zr;
          if (type === 'text')     zr = await zapiCall('/send-text',     'POST', { phone: phone55, message: content });
          else if (type === 'audio')    zr = await zapiCall('/send-audio',    'POST', { phone: phone55, audio: content });
          else if (type === 'image')    zr = await zapiCall('/send-image',    'POST', { phone: phone55, image: content, caption: '' });
          else if (type === 'video')    zr = await zapiCall('/send-video',    'POST', { phone: phone55, video: content, caption: '' });
          else if (type === 'document') zr = await zapiCall('/send-document', 'POST', { phone: phone55, document: content, fileName: msg.filename || 'arquivo' });
          if (zr?.ok) {
            const zd = await zr.json();
            if (zd.zaapId || zd.messageId) {
              await query("UPDATE mensagens SET status = 'delivered', wa_msg_id = $1 WHERE id = $2", [zd.messageId || zd.zaapId, msg.id]);
              sent = true;
            }
          }
        }

        // Evolution API fallback
        if (!sent && EVO_URL() && EVO_KEY()) {
          const { default: fetch } = await import('node-fetch');
          let er;
          if (type === 'text') er = await fetch(`${EVO_URL()}/message/sendText/${EVO_INST()}`, { method:'POST', headers:{'Content-Type':'application/json',apikey:EVO_KEY()}, body: JSON.stringify({number:waNumber,text:content})});
          else er = await fetch(`${EVO_URL()}/message/sendMedia/${EVO_INST()}`, { method:'POST', headers:{'Content-Type':'application/json',apikey:EVO_KEY()}, body: JSON.stringify({number:waNumber,mediatype:type,media:content,caption:''})});
          if (er?.ok) { const ed = await er.json(); if (ed.key) await query("UPDATE mensagens SET status = 'delivered' WHERE id = $1", [msg.id]); }
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
  if (!EVO || !KEY) return res.status(400).json({ error: 'Não configurado' });
  try {
    const { default: fetch } = await import('node-fetch');

    // Get all conversations
    const { rows: convos } = await query(
      `SELECT id, contact_id, phone, contact_name FROM conversas
       WHERE contact_id LIKE '%@s.whatsapp.net'
       ORDER BY last_message_at DESC`
    );

    if (!convos.length) return res.json({ ok: true, namesUpdated: 0, picsUpdated: 0 });

    let namesUpdated = 0, picsUpdated = 0;

    // Batch via whatsappNumbers — confirmed working
    const batchSize = 20;
    for (let i = 0; i < convos.length; i += batchSize) {
      const batch = convos.slice(i, i + batchSize);
      const numbers = batch.map(c => c.contact_id.replace('@s.whatsapp.net', ''));
      try {
        const r2 = await fetch(`${EVO}/chat/whatsappNumbers/${INST}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: KEY },
          body: JSON.stringify({ numbers }),
          signal: AbortSignal.timeout(15000)
        });
        if (r2.ok) {
          const results = await r2.json();
          for (const item of (Array.isArray(results) ? results : [])) {
            const jid = item.jid || (item.number + '@s.whatsapp.net');
            const name = item.name || item.pushName || '';
            if (name && name.length > 2) {
              const { rowCount } = await query(
                `UPDATE conversas SET contact_name = $1
                 WHERE contact_id = $2
                   AND (length(contact_name) <= 11 OR contact_name = phone)`,
                [name, jid]
              );
              namesUpdated += rowCount || 0;
            }
          }
        }
      } catch (e) { console.log('whatsappNumbers batch error:', e.message); }
    }

    // Try to get profile pic from instance info (has profilePicUrl for the instance)
    // For individual contacts, use the pushName webhook data going forward
    // For now, set a placeholder so the avatar shows initials nicely
    console.log(`UPDATE_CONTACTS: ${namesUpdated} names updated`);
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
  try {
    const { default: fetch } = await import('node-fetch');
    // v2 uses /instance/connectionState/:instance
    const r2 = await fetch(`${EVO}/instance/connectionState/${INST}`, { headers: { apikey: KEY }, signal: AbortSignal.timeout(8000) });
    if (r2.ok) {
      const data = await r2.json();
      // v2 returns { instance: { state: 'open' } } or { state: 'open' }
      const state = data?.instance?.state || data?.state || data?.currentState || 'closed';
      return res.json({ connected: state === 'open', status: state, instance: INST });
    }
    // Fallback: fetchInstances
    const r3 = await fetch(`${EVO}/instance/fetchInstances`, { headers: { apikey: KEY }, signal: AbortSignal.timeout(8000) });
    const list = await r3.json();
    const arr = Array.isArray(list) ? list : (list?.data || [list]);
    const inst = arr.find(i =>
      i.name === INST ||
      i.instance?.instanceName === INST ||
      i.instanceName === INST
    );
    const state = inst?.instance?.state || inst?.state || inst?.connectionStatus || 'closed';
    res.json({ connected: state === 'open', status: state, instance: INST });
  } catch (e) {
    console.error('WA status error:', e.message);
    res.json({ connected: false, status: 'error', message: e.message });
  }
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
export default r;
