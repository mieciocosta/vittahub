import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';
import { query } from '../db/pool.js';
import { auth } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = express.Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '../../../uploads'),
    filename: (_, f, cb) => cb(null, `${Date.now()}-${f.originalname.replace(/[^a-z0-9._-]/gi,'_')}`)
  }),
  limits: { fileSize: 25 * 1024 * 1024 }
});

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
      conditions.push(`c.contact_name ILIKE $${pi++}`);
      params.push(`%${search}%`);
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
      SELECT c.*, u.nome AS responsavel_nome
      FROM conversas c LEFT JOIN usuarios u ON u.id = c.responsavel_id
      WHERE c.id = $1`, [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Não encontrado' });

    const { rows: messages } = await query(
      'SELECT * FROM mensagens WHERE conversa_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );

    // Get associated lead if exists
    let lead = null;
    if (conv.lead_id) {
      const { rows: [l] } = await query('SELECT * FROM leads WHERE id = $1', [conv.lead_id]);
      lead = l;
    }

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

    // Evolution API (WhatsApp)
    const EVO = process.env.EVOLUTION_API_URL, KEY = process.env.EVOLUTION_API_KEY;
    const INST = process.env.EVOLUTION_INSTANCE || 'vittalis';
    if (EVO && KEY && conv.channel === 'whatsapp' && conv.phone) {
      try {
        const { default: fetch } = await import('node-fetch');
        const r = await fetch(`${EVO}/message/sendText/${INST}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: KEY },
          body: JSON.stringify({ number: conv.phone, text: content })
        });
        if (r.ok) await query("UPDATE mensagens SET status = 'delivered' WHERE id = $1", [msg.id]);
      } catch (e) { console.error('Evolution error:', e.message); }
    }

    res.json(msg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── UPLOAD FILE ──────────────────────────────────────────────────────────────
r.post('/conversations/:id/upload', upload.single('file'), async (req, res) => {
  try {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'Arquivo não enviado' });
    const type = f.mimetype.startsWith('audio/') ? 'audio' : f.mimetype.startsWith('image/') ? 'image' : f.mimetype.startsWith('video/') ? 'video' : 'document';

    const { rows: [msg] } = await query(`
      INSERT INTO mensagens (conversa_id, from_type, type, content, filename, mimetype, file_size, sender_id, sender_nome)
      VALUES ($1, 'me', $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.params.id, type, `/uploads/${f.filename}`, f.originalname, f.mimetype, f.size, req.user.id, req.user.nome]
    );

    const preview = type === 'audio' ? '🎵 Áudio' : type === 'image' ? '📷 Imagem' : type === 'video' ? '🎥 Vídeo' : `📎 ${f.originalname}`;
    await query('UPDATE conversas SET last_message = $1, last_message_at = NOW() WHERE id = $2', [preview, req.params.id]);

    res.json(msg);
  } catch (err) { res.status(500).json({ error: err.message }); }
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

// ─── WEBHOOKS ─────────────────────────────────────────────────────────────────
r.get('/webhook/instagram', (req, res) => {
  const T = process.env.INSTAGRAM_VERIFY_TOKEN || 'vittahub_2024';
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === T) res.send(req.query['hub.challenge']);
  else res.sendStatus(403);
});

r.post('/webhook/whatsapp', async (req, res) => {
  try {
    const { data, event } = req.body;
    if (event !== 'messages.upsert' || !data?.messages) return res.json({ ok: true });
    for (const msg of data.messages) {
      if (msg.key.fromMe) continue;
      const phone = msg.key.remoteJid.replace('@s.whatsapp.net','').replace(/^55/,'');
      const content = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[mídia]';
      const contactName = msg.pushName || phone;

      // Upsert conversation
      const { rows: [conv] } = await query(`
        INSERT INTO conversas (channel, contact_name, contact_id, phone, bot_ativo, unread, last_message, last_message_at)
        VALUES ('whatsapp', $1, $2, $3, $4, 1, $5, NOW())
        ON CONFLICT (contact_id) DO UPDATE SET
          unread = conversas.unread + 1, last_message = $5, last_message_at = NOW()
        RETURNING *`,
        [contactName, msg.key.remoteJid, phone, true, content]
      );

      // Insert message
      await query(`INSERT INTO mensagens (conversa_id, from_type, type, content) VALUES ($1,'contact','text',$2)`, [conv.id, content]);

      // Notify
      await query(`INSERT INTO notificacoes (tipo,titulo,texto,conv_id) VALUES ('mensagem',$1,$2,$3)`,
        [`Nova msg de ${contactName}`, content.slice(0,60), conv.id]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('WA webhook error:', err.message);
    res.json({ ok: true }); // Always 200 to Evolution
  }
});

r.post('/webhook/instagram', async (req, res) => {
  try {
    const { object, entry } = req.body;
    if (object !== 'instagram') return res.json({ ok: true });
    for (const e of (entry||[])) {
      for (const ev of (e.messaging||[])) {
        if (!ev.message) continue;
        const sid = ev.sender.id;
        const content = ev.message.text || '[mídia]';
        const { rows: [conv] } = await query(`
          INSERT INTO conversas (channel, contact_name, contact_id, unread, last_message, last_message_at)
          VALUES ('instagram', $1, $2, 1, $3, NOW())
          ON CONFLICT (contact_id) DO UPDATE SET unread = conversas.unread + 1, last_message = $3, last_message_at = NOW()
          RETURNING *`, [`@${sid}`, sid, content]);
        await query('INSERT INTO mensagens (conversa_id, from_type, type, content) VALUES ($1,\'contact\',\'text\',$2)', [conv.id, content]);
      }
    }
    res.json({ ok: true });
  } catch (err) { console.error('IG webhook:', err.message); res.json({ ok: true }); }
});

export default r;

// ─── WHATSAPP QR CODE (Evolution API) ────────────────────────────────────────
r.get('/whatsapp/status', async (req, res) => {
  const EVO = process.env.EVOLUTION_API_URL;
  const KEY = process.env.EVOLUTION_API_KEY;
  const INST = process.env.EVOLUTION_INSTANCE || 'vittalis';
  if (!EVO || !KEY) return res.json({ connected: false, status: 'not_configured', message: 'Evolution API não configurada' });
  try {
    const { default: fetch } = await import('node-fetch');
    const r2 = await fetch(`${EVO}/instance/fetchInstances`, { headers: { apikey: KEY }, signal: AbortSignal.timeout(5000) });
    const data = await r2.json();
    const inst = Array.isArray(data) ? data.find(i => i.name === INST || i.instance?.instanceName === INST) : null;
    const state = inst?.instance?.state || inst?.state || 'closed';
    res.json({ connected: state === 'open', status: state, instance: INST });
  } catch (e) { res.json({ connected: false, status: 'error', message: e.message }); }
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
