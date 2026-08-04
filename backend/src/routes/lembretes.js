import express from 'express';
import { query } from '../db/pool.js';
import { auth } from '../middleware/auth.js';
import { zapiOk, zapiSendText } from '../services/zapi.js';
import { socketEmit } from '../socketServer.js';

// Registra a mensagem enviada dentro da conversa do CRM (se existir), pra
// equipe ver no chat o que foi mandado. Melhor esforço — nunca quebra o envio.
async function registraNaConversa(telefone, texto, senderNome) {
  try {
    const dig = String(telefone || '').replace(/\D/g, '');
    const ult11 = dig.slice(-11);
    if (ult11.length < 10) return;
    const { rows: [conv] } = await query(
      `SELECT id, contact_name, phone FROM conversas
        WHERE RIGHT(regexp_replace(COALESCE(phone,''),'\\D','','g'), 11) = $1
        ORDER BY last_message_at DESC NULLS LAST LIMIT 1`, [ult11]);
    if (!conv) return;
    const { rows: [m] } = await query(
      `INSERT INTO mensagens (conversa_id, from_type, sender_nome, type, content) VALUES ($1,'me',$2,'text',$3) RETURNING *`,
      [conv.id, senderNome || 'Lembretes', texto]);
    await query(`UPDATE conversas SET last_message = $1, last_message_at = NOW() WHERE id = $2`, [String(texto).slice(0, 160), conv.id]).catch(() => {});
    if (m) socketEmit('new_message', { convId: conv.id, message: m, conv });
  } catch { /* silencioso */ }
}

// ─── Central de Lembretes (reforço pelo CRM) ─────────────────────────────────
// 🎂 Aniversários (leads.nascimento) · 📅 Agendamentos de amanhã (agenda_eventos)
// · 🎁 Indicações (vendas dos últimos 7 dias). Envio direto pelo WhatsApp da
// clínica (Z-API). Tudo autenticado.

const r = express.Router();
r.use(auth);

const fmtBR = (d) => new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function msgAmanha(ev) {
  const serv = ev.servico ? ev.servico : (ev.setor === 'terapias' ? 'sessão de terapia' : ev.setor === 'consultas' ? 'consulta' : 'atendimento');
  return `Olá! 💙 Aqui é da Vittalis Saúde. Lembrete: ${serv} de ${ev.paciente} no dia ${fmtBR(ev.data)} às ${ev.hora}${ev.profissional ? `, com ${ev.profissional}` : ''}. Responda SIM para confirmar, ou nos avise se precisar remarcar. Até lá! 😊`;
}
const msgAniversario = (nome) => `🎂🎉 Parabéns, ${String(nome || '').split(' ')[0]}! A equipe da Vittalis Saúde deseja um aniversário cheio de saúde e alegria! 💙 Conte sempre com a gente. "Sua vida é preciosa!"`;
const msgIndicacao = (nome) => `Olá! 💙 Aqui é da Vittalis Saúde. Foi um prazer atender ${String(nome || '').split(' ')[0]}! Se você conhece alguém que também precisa de vacinas, consultas ou terapias, adoraríamos receber sua indicação. 😊 É só encaminhar nosso contato: (98) 98422-1002. Obrigado pela confiança!`;

// GET /api/lembretes/resumo?amanha=YYYY-MM-DD&hoje=YYYY-MM-DD — as 3 listas de uma vez
r.get('/resumo', async (req, res) => {
  try {
    const amanhaStr = /^\d{4}-\d{2}-\d{2}$/.test(req.query.amanha || '') ? req.query.amanha : new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const hojeStr = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hoje || '') ? req.query.hoje : new Date().toISOString().slice(0, 10);

    const { rows: amanha } = await query(
      `SELECT id, paciente, servico, TO_CHAR(data,'YYYY-MM-DD') AS data, hora, profissional, telefone, setor, lembrete_enviado_em
         FROM agenda_eventos
        WHERE data = $1 AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'
        ORDER BY hora`, [amanhaStr]);

    const { rows: leadsNasc } = await query(
      `SELECT id, nome, telefone, TO_CHAR(nascimento,'YYYY-MM-DD') AS nascimento FROM leads WHERE nascimento IS NOT NULL`);
    const base = new Date(hojeStr + 'T12:00:00');
    const aniversarios = [];
    for (const l of leadsNasc) {
      const n = new Date(l.nascimento + 'T12:00:00');
      const prox = new Date(base.getFullYear(), n.getMonth(), n.getDate(), 12);
      if (prox < new Date(base.getFullYear(), base.getMonth(), base.getDate())) prox.setFullYear(prox.getFullYear() + 1);
      const dias = Math.round((prox - new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12)) / 86400000);
      if (dias <= 7) aniversarios.push({ id: l.id, nome: l.nome, telefone: l.telefone, data: prox.toISOString().slice(0, 10), dias, idade: prox.getFullYear() - n.getFullYear() });
    }
    aniversarios.sort((a, b) => a.dias - b.dias || String(a.nome).localeCompare(String(b.nome)));

    const { rows: indicacoes } = await query(
      `SELECT DISTINCT ON (COALESCE(c.phone, v.cliente_nome))
              v.id, COALESCE(v.cliente_nome, v.paciente_nome) AS nome, v.setor,
              TO_CHAR(v.data_venda,'YYYY-MM-DD') AS data_venda, c.phone AS telefone
         FROM vendas v LEFT JOIN conversas c ON c.id = v.conversa_id
        WHERE v.data_venda >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY COALESCE(c.phone, v.cliente_nome), v.data_venda DESC`);

    res.json({ amanha, aniversarios, indicacoes, whatsapp: zapiOk() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/lembretes/enviar { tipo: 'amanha'|'aniversarios'|'indicacoes', ids: [] }
r.post('/enviar', async (req, res) => {
  try {
    if (!zapiOk()) return res.status(503).json({ error: 'WhatsApp (Z-API) não configurado.' });
    const { tipo } = req.body || {};
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'Informe os ids.' });
    let enviados = 0, falhas = 0, pulados = 0;

    if (tipo === 'amanha') {
      const { rows } = await query(
        `SELECT id, paciente, servico, TO_CHAR(data,'YYYY-MM-DD') AS data, hora, profissional, telefone, setor
           FROM agenda_eventos WHERE id = ANY($1::int[]) AND lembrete_enviado_em IS NULL`, [ids.map(Number)]);
      for (const ev of rows) {
        if (!ev.telefone || String(ev.telefone).replace(/\D/g, '').length < 10) { pulados++; continue; }
        const texto = msgAmanha(ev);
        const zr = await zapiSendText(ev.telefone, texto).catch(() => null);
        if (zr?.ok) { enviados++; await query(`UPDATE agenda_eventos SET lembrete_enviado_em = NOW() WHERE id = $1`, [ev.id]); await registraNaConversa(ev.telefone, texto, req.user?.nome); }
        else falhas++;
      }
    } else if (tipo === 'aniversarios') {
      const { rows } = await query(`SELECT id, nome, telefone FROM leads WHERE id = ANY($1::text[])`, [ids.map(String)]);
      for (const l of rows) {
        if (!l.telefone || String(l.telefone).replace(/\D/g, '').length < 10) { pulados++; continue; }
        const texto = msgAniversario(l.nome);
        const zr = await zapiSendText(l.telefone, texto).catch(() => null);
        if (zr?.ok) { enviados++; await registraNaConversa(l.telefone, texto, req.user?.nome); } else falhas++;
      }
    } else if (tipo === 'indicacoes') {
      const { rows } = await query(
        `SELECT v.id, COALESCE(v.cliente_nome, v.paciente_nome) AS nome, c.phone AS telefone
           FROM vendas v LEFT JOIN conversas c ON c.id = v.conversa_id WHERE v.id = ANY($1::int[])`, [ids.map(Number)]);
      for (const v of rows) {
        if (!v.telefone || String(v.telefone).replace(/\D/g, '').length < 10) { pulados++; continue; }
        const texto = msgIndicacao(v.nome);
        const zr = await zapiSendText(v.telefone, texto).catch(() => null);
        if (zr?.ok) { enviados++; await registraNaConversa(v.telefone, texto, req.user?.nome); } else falhas++;
      }
    } else {
      return res.status(400).json({ error: 'Tipo inválido.' });
    }

    res.json({ enviados, falhas, pulados });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/lembretes/busca?q= — acha destinatário em conversas e clientes (leads)
r.get('/busca', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ itens: [] });
    const like = `%${q}%`;
    const dig = q.replace(/\D/g, '');
    const { rows: convs } = await query(
      `SELECT contact_name AS nome, phone AS telefone FROM conversas
        WHERE contact_name ILIKE $1 ${dig.length >= 4 ? "OR regexp_replace(COALESCE(phone,''),'\\D','','g') LIKE $2" : ''}
        ORDER BY last_message_at DESC NULLS LAST LIMIT 8`,
      dig.length >= 4 ? [like, `%${dig}%`] : [like]);
    const { rows: lds } = await query(
      `SELECT nome, telefone FROM leads
        WHERE nome ILIKE $1 ${dig.length >= 4 ? "OR regexp_replace(COALESCE(telefone,''),'\\D','','g') LIKE $2" : ''}
        ORDER BY updated_at DESC LIMIT 8`,
      dig.length >= 4 ? [like, `%${dig}%`] : [like]);
    const vistos = new Set(); const itens = [];
    for (const it of [...convs, ...lds]) {
      const d = String(it.telefone || '').replace(/\D/g, '').slice(-11);
      const chave = d || it.nome;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      itens.push({ nome: it.nome, telefone: it.telefone });
      if (itens.length >= 10) break;
    }
    res.json({ itens });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/lembretes/livre { telefone, mensagem } — a atendente escreve e envia
// pra QUEM ela quiser, direto pelo WhatsApp da clinica.
r.post('/livre', async (req, res) => {
  try {
    if (!zapiOk()) return res.status(503).json({ error: 'WhatsApp (Z-API) não configurado.' });
    const tel = String(req.body?.telefone || '').replace(/\D/g, '');
    const msg = String(req.body?.mensagem || '').trim().slice(0, 3000);
    if (tel.length < 10) return res.status(400).json({ error: 'Telefone inválido (DDD + número).' });
    if (!msg) return res.status(400).json({ error: 'Escreva a mensagem.' });
    const zr = await zapiSendText(tel, msg).catch(() => null);
    if (!zr?.ok) return res.status(502).json({ error: 'Falha no envio pelo WhatsApp.' });
    await registraNaConversa(tel, msg, req.user?.nome);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default r;
