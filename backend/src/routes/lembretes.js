import express from 'express';
import { query } from '../db/pool.js';
import { auth } from '../middleware/auth.js';
import { zapiOk, zapiSendText } from '../services/zapi.js';

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
        const zr = await zapiSendText(ev.telefone, msgAmanha(ev)).catch(() => null);
        if (zr?.ok) { enviados++; await query(`UPDATE agenda_eventos SET lembrete_enviado_em = NOW() WHERE id = $1`, [ev.id]); }
        else falhas++;
      }
    } else if (tipo === 'aniversarios') {
      const { rows } = await query(`SELECT id, nome, telefone FROM leads WHERE id = ANY($1::text[])`, [ids.map(String)]);
      for (const l of rows) {
        if (!l.telefone || String(l.telefone).replace(/\D/g, '').length < 10) { pulados++; continue; }
        const zr = await zapiSendText(l.telefone, msgAniversario(l.nome)).catch(() => null);
        if (zr?.ok) enviados++; else falhas++;
      }
    } else if (tipo === 'indicacoes') {
      const { rows } = await query(
        `SELECT v.id, COALESCE(v.cliente_nome, v.paciente_nome) AS nome, c.phone AS telefone
           FROM vendas v LEFT JOIN conversas c ON c.id = v.conversa_id WHERE v.id = ANY($1::int[])`, [ids.map(Number)]);
      for (const v of rows) {
        if (!v.telefone || String(v.telefone).replace(/\D/g, '').length < 10) { pulados++; continue; }
        const zr = await zapiSendText(v.telefone, msgIndicacao(v.nome)).catch(() => null);
        if (zr?.ok) enviados++; else falhas++;
      }
    } else {
      return res.status(400).json({ error: 'Tipo inválido.' });
    }

    res.json({ enviados, falhas, pulados });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default r;
