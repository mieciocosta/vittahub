import express from 'express';
import { v4 as uuid } from 'uuid';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { conversations, leads, quickReplies, users, botConfig, vittasysPlanos, vittasysVacinas, notifications, nextAtendente } from '../data/db.js';
import { auth } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = express.Router();
const upload = multer({ storage: multer.diskStorage({ destination: path.join(__dirname,'../../../uploads'), filename: (_, f, cb) => cb(null, `${Date.now()}-${f.originalname}`) }), limits: { fileSize: 25*1024*1024 } });

// Bot processing
function processBot(conv, content) {
  if (!conv.botAtivo) return null;
  const resp = botConfig.respostas[content.trim()] || botConfig.respostas['default'];
  const msg = { id: uuid(), from: 'bot', type: 'text', content: resp, timestamp: new Date().toISOString(), status: 'sent', senderNome: 'Bot Vittalis' };
  conv.messages.push(msg);
  conv.lastMessage = resp;
  conv.lastMessageTime = msg.timestamp;
  // Transfer after N contact messages
  const contactMsgs = conv.messages.filter(m => m.from === 'contact').length;
  if (contactMsgs >= botConfig.transferirApos) {
    conv.botAtivo = false;
    if (!conv.responsavelId) conv.responsavelId = nextAtendente();
    const transferMsg = { id: uuid(), from: 'system', type: 'event', content: `Conversa transferida para ${users.find(u=>u.id===conv.responsavelId)?.nome || 'atendente'}`, timestamp: new Date().toISOString() };
    conv.messages.push(transferMsg);
  }
  return msg;
}

r.use(auth);

r.get('/conversations', (req, res) => {
  const { channel, responsavelId, search } = req.query;
  let list = [...conversations];
  if (channel && channel !== 'all') list = list.filter(c => c.channel === channel);
  if (responsavelId) list = list.filter(c => c.responsavelId === responsavelId);
  if (search) list = list.filter(c => c.contactName.toLowerCase().includes(search.toLowerCase()));
  list.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
  res.json(list.map(({ messages, ...rest }) => ({ ...rest, messageCount: rest.messageCount || 0 })));
});

r.get('/conversations/:id', (req, res) => {
  const c = conversations.find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Não encontrado' });
  const enriched = { ...c, responsavelNome: users.find(u => u.id === c.responsavelId)?.nome || null, lead: leads.find(l => l.id === c.leadId) || null };
  res.json(enriched);
});

r.patch('/conversations/:id/read', (req, res) => {
  const c = conversations.find(c => c.id === req.params.id);
  if (c) { c.unread = 0; c.messages.forEach(m => m.status = 'read'); }
  res.json({ ok: true });
});

r.patch('/conversations/:id/assign', (req, res) => {
  const c = conversations.find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Não encontrado' });
  c.responsavelId = req.body.responsavelId;
  res.json({ ok: true });
});

r.patch('/conversations/:id/bot', (req, res) => {
  const c = conversations.find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Não encontrado' });
  c.botAtivo = req.body.ativo;
  res.json({ ok: true, botAtivo: c.botAtivo });
});

r.post('/conversations/:id/send', async (req, res) => {
  const c = conversations.find(cv => cv.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Não encontrado' });
  const { content, type = 'text' } = req.body;
  const msg = { id: uuid(), from: 'me', type, content, timestamp: new Date().toISOString(), status: 'sent', senderId: req.user.id, senderNome: req.user.nome };
  c.messages.push(msg);
  c.lastMessage = type === 'text' ? content : type === 'audio' ? '🎵 Áudio' : type === 'image' ? '📷 Imagem' : `📎 Arquivo`;
  c.lastMessageTime = msg.timestamp;

  // Evolution API
  const EVO = process.env.EVOLUTION_API_URL, KEY = process.env.EVOLUTION_API_KEY, INST = process.env.EVOLUTION_INSTANCE || 'vittalis';
  if (EVO && KEY && c.channel === 'whatsapp') {
    try { const { default: fetch } = await import('node-fetch'); await fetch(`${EVO}/message/sendText/${INST}`, { method:'POST', headers:{'Content-Type':'application/json',apikey:KEY}, body: JSON.stringify({ number: c.phone, text: content }) }); msg.status = 'delivered'; }
    catch(e) { console.error('EVO:', e.message); }
  }
  res.json(msg);
});

r.post('/conversations/:id/upload', upload.single('file'), (req, res) => {
  const c = conversations.find(cv => cv.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Não encontrado' });
  const f = req.file;
  const type = f.mimetype.startsWith('audio/') ? 'audio' : f.mimetype.startsWith('image/') ? 'image' : f.mimetype.startsWith('video/') ? 'video' : 'document';
  const msg = { id: uuid(), from: 'me', type, content: `/uploads/${f.filename}`, filename: f.originalname, mimetype: f.mimetype, size: f.size, timestamp: new Date().toISOString(), status: 'sent', senderId: req.user.id, senderNome: req.user.nome };
  c.messages.push(msg);
  c.lastMessage = type === 'audio' ? '🎵 Áudio' : type === 'image' ? '📷 Imagem' : type === 'video' ? '🎥 Vídeo' : `📎 ${f.originalname}`;
  c.lastMessageTime = msg.timestamp;
  res.json(msg);
});

// AI summary
r.post('/conversations/:id/summary', async (req, res) => {
  const c = conversations.find(cv => cv.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Não encontrado' });
  const transcript = c.messages.filter(m=>m.type==='text').map(m => `${m.from==='me'?`Atendente(${m.senderNome||'Equipe'})`:m.from==='bot'?'Bot':c.contactName}: ${m.content}`).join('\n');
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) {
    return res.json({ summary: `📋 **Resumo — ${c.contactName}**\n\n• Canal: ${c.channel==='whatsapp'?'WhatsApp':'Instagram'}\n• Interesse: Vacinas / Plano Vacinal\n• Intenção: **Alta** 🔥\n• Objeções: Preço\n• ✅ Próximo passo: Enviar proposta + PDF com valores`, mock: true });
  }
  try {
    const { default: fetch } = await import('node-fetch');
    const resp = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY,'anthropic-version':'2023-06-01'}, body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:600, messages:[{role:'user',content:`Analise esta conversa do CRM da Vittalis Saúde (clínica de vacinas, São Luís-MA) e gere resumo comercial: interesse, objeções, intenção (baixo/médio/alto), próximo passo sugerido. Conversa:\n${transcript}\n\nFormato markdown simples, pt-BR.`}] }) });
    const data = await resp.json();
    res.json({ summary: data.content[0].text });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Convert to lead (auto-assign)
r.post('/conversations/:id/to-lead', (req, res) => {
  const c = conversations.find(cv => cv.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Não encontrado' });
  if (c.leadId) { const existing = leads.find(l=>l.id===c.leadId); if(existing) return res.json({ lead: existing, created: false }); }
  const byPhone = c.phone && leads.find(l => l.telefone?.replace(/\D/g,'') === c.phone.replace(/\D/g,''));
  if (byPhone) { c.leadId = byPhone.id; return res.json({ lead: byPhone, created: false }); }
  const responsavelId = c.responsavelId || nextAtendente();
  const lead = { id: uuid(), nome: c.contactName, telefone: c.phone||'', email:'', origem: c.channel==='instagram'?'Instagram':'WhatsApp', interesse: req.body.interesse||'Consulta', status:'Novo lead', responsavelId, valorProposta:0, servico:'', dataEntrada:new Date().toISOString().split('T')[0], dataRetorno:null, observacoes:`Lead automático via ${c.channel}`, motivoPerda:null, tags:[], vittasysClienteId:null };
  leads.unshift(lead);
  c.leadId = lead.id;
  c.responsavelId = responsavelId;
  notifications.unshift({ id:uuid(), tipo:'novo_lead', titulo:'Lead criado', texto:`${lead.nome} adicionado ao funil`, leadId:lead.id, lida:false, createdAt:new Date().toISOString() });
  res.json({ lead, created: true });
});

// Quick replies
r.get('/quick-replies', (req, res) => res.json(quickReplies));
r.post('/quick-replies', (req, res) => {
  const qr = { id: uuid(), titulo: req.body.titulo, texto: req.body.texto };
  quickReplies.push(qr);
  res.json(qr);
});
r.delete('/quick-replies/:id', (req, res) => {
  const idx = quickReplies.findIndex(q=>q.id===req.params.id);
  if(idx!==-1) quickReplies.splice(idx,1);
  res.json({ ok: true });
});

// Bot config
r.get('/bot-config', (req, res) => res.json(botConfig));
r.put('/bot-config', (req, res) => {
  Object.assign(botConfig, req.body);
  res.json(botConfig);
});

// VittaSys integration — search proposals
r.get('/vittasys/planos', (req, res) => res.json(vittasysPlanos));
r.get('/vittasys/vacinas', (req, res) => res.json(vittasysVacinas));

r.post('/vittasys/proposta', async (req, res) => {
  // Try real VittaSys API first
  const VITTASYS = process.env.VITTASYS_URL || 'https://vittasys.vittalissaude.com.br';
  try {
    const { default: fetch } = await import('node-fetch');
    const resp = await fetch(`${VITTASYS}/api/propostas/planos`, { headers: { 'Content-Type':'application/json' }, timeout: 5000 });
    if (resp.ok) { const data = await resp.json(); return res.json({ source: 'vittasys', data }); }
  } catch {}
  // Fallback to local mock
  res.json({ source: 'mock', planos: vittasysPlanos, vacinas: vittasysVacinas });
});

// Webhook: Evolution API / WhatsApp
r.post('/webhook/whatsapp', (req, res) => {
  const { data, event } = req.body;
  if (event !== 'messages.upsert' || !data?.messages) return res.json({ ok: true });
  data.messages.forEach(msg => {
    if (msg.key.fromMe) return;
    const phone = msg.key.remoteJid.replace('@s.whatsapp.net','').replace(/^55/,'');
    const content = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[mídia]';
    const contactName = msg.pushName || phone;
    let c = conversations.find(cv => cv.phone === phone || cv.contactId === msg.key.remoteJid);
    if (!c) {
      const responsavelId = botConfig.ativo ? null : nextAtendente();
      c = { id:uuid(), channel:'whatsapp', contactName, contactId:msg.key.remoteJid, phone, lastMessage:content, lastMessageTime:new Date().toISOString(), unread:1, responsavelId, leadId:null, tags:[], botAtivo:botConfig.ativo, messages:[] };
      conversations.unshift(c);
      // Auto-create lead
      if (!botConfig.ativo) {
        const lead = { id:uuid(), nome:contactName, telefone:phone, email:'', origem:'WhatsApp', interesse:'Consulta', status:'Novo lead', responsavelId: responsavelId||nextAtendente(), valorProposta:0, servico:'', dataEntrada:new Date().toISOString().split('T')[0], dataRetorno:null, observacoes:'Lead automático via WhatsApp', motivoPerda:null, tags:[], vittasysClienteId:null };
        leads.unshift(lead);
        c.leadId = lead.id;
        notifications.unshift({ id:uuid(), tipo:'novo_lead', titulo:'Novo lead WA', texto:`${contactName} enviou mensagem`, leadId:lead.id, lida:false, createdAt:new Date().toISOString() });
      }
      // Send welcome bot msg
      if (botConfig.ativo) processBot(c, '');
    } else { c.unread = (c.unread||0)+1; c.lastMessage = content; c.lastMessageTime = new Date().toISOString(); }
    c.messages.push({ id:uuid(), from:'contact', type:'text', content, timestamp:new Date().toISOString(), status:'delivered' });
    if (c.botAtivo) processBot(c, content);
    notifications.unshift({ id:uuid(), tipo:'mensagem', titulo:`Nova msg de ${contactName}`, texto:content.slice(0,60), convId:c.id, lida:false, createdAt:new Date().toISOString() });
  });
  res.json({ ok: true });
});

r.post('/webhook/instagram', (req, res) => {
  const { object, entry } = req.body;
  if (object !== 'instagram') return res.json({ ok: true });
  entry?.forEach(e => e.messaging?.forEach(ev => {
    if (!ev.message) return;
    const sid = ev.sender.id;
    const content = ev.message.text || '[mídia]';
    let c = conversations.find(cv => cv.contactId === sid);
    if (!c) { c = { id:uuid(), channel:'instagram', contactName:`@${sid}`, contactId:sid, phone:null, lastMessage:content, lastMessageTime:new Date().toISOString(), unread:1, responsavelId:nextAtendente(), leadId:null, tags:[], botAtivo:false, messages:[] }; conversations.unshift(c); }
    else { c.unread++; c.lastMessage=content; c.lastMessageTime=new Date().toISOString(); }
    c.messages.push({ id:uuid(), from:'contact', type:'text', content, timestamp:new Date().toISOString() });
    notifications.unshift({ id:uuid(), tipo:'mensagem', titulo:`Nova msg IG @${sid}`, texto:content.slice(0,60), convId:c.id, lida:false, createdAt:new Date().toISOString() });
  }));
  res.json({ ok: true });
});

r.get('/webhook/instagram', (req, res) => {
  const T = process.env.INSTAGRAM_VERIFY_TOKEN || 'vittahub_2024';
  if (req.query['hub.mode']==='subscribe' && req.query['hub.verify_token']===T) res.send(req.query['hub.challenge']);
  else res.sendStatus(403);
});

// Notifications
r.get('/notifications', (req, res) => res.json(notifications.slice(0,20)));
r.patch('/notifications/:id/read', (req, res) => {
  const n = notifications.find(n=>n.id===req.params.id);
  if(n) n.lida = true;
  res.json({ ok: true });
});
r.post('/notifications/read-all', (req, res) => { notifications.forEach(n=>n.lida=true); res.json({ ok: true }); });

export default r;

// AI Assist endpoint
r.post('/ai-assist', async (req, res) => {
  const { prompt, convId } = req.body;
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) {
    // Mock responses when no API key
    const mocks = {
      summary: '📋 **Resumo Comercial**\n\n◆ **Interesse:** Plano Vacinal Adulto / Vacinas avulsas\n◆ **Objeções:** Preço (não confirmado)\n◆ **Intenção de compra:** Alta 🔥\n◆ **Próximo passo:** Enviar proposta personalizada com valores e condições de pagamento',
      suggest: '💡 **Estratégia recomendada:**\n\nO cliente demonstra alto interesse. Recomendo enviar a proposta do Plano Vacinal Adulto agora, destacando o valor preventivo. Mencione o parcelamento e crie urgência com "temos agenda disponível esta semana".',
    };
    const isSuggest = prompt.includes('estratégia') || prompt.includes('consultor');
    const isReply = prompt.includes('escreva a próxima mensagem');
    if (isReply) return res.json({ text: 'Olá! 😊 Aqui é a equipe da Vittalis Saúde. Consegui preparar um orçamento personalizado para você — posso enviar agora?' });
    return res.json({ text: isSuggest ? mocks.suggest : mocks.summary });
  }
  try {
    const { default: fetch } = await import('node-fetch');
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await resp.json();
    res.json({ text: data.content?.[0]?.text || 'Erro na resposta da IA' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
