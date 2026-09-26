import express from 'express';
import { auth } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { socketEmit } from '../socketServer.js';
import { agendaVittaMedDoDia } from './vittamed.js';
import { hojeSLZ, horaSLZ, somaDias, aconteceu, planejarPosConsulta, planejarLimpeza } from '../services/posConsulta.js';

/* ═══════════════════════════════════════════════════════════════════════════
   🩺 PÓS CONSULTA NA AGENDA — pedido do master (26/09):
   "Cria na Agenda do dia seguinte o Pós Consulta de todos os pacientes que
    fizeram consulta e terapia no dia, igual tem no VittaHub (o Pós Vacinal),
    de forma que não conflita com agendamentos. Pode ficar em uma parte
    separada."

   Como vira regra:
    • QUEM "FEZ" CONSULTA OU TERAPIA vem de três lugares, sem repetir a criança:
      a Agenda daqui (setores consultas e terapias), as sessões lançadas na
      área de Terapias (presente/reposição) e a agenda do VittaMed pela ponte,
      quando ela está ligada. Conta quando o horário já passou e não virou
      cancelado, falta ou remarcado.
    • O PÓS CAI NO DIA SEGUINTE (se esse dia já passou, hoje; domingo vira
      segunda), em lista com hora, 9:00, 10:00… igual ao Pós Vacinal. Um pós
      por paciente por dia: consulta + terapia no mesmo dia viram um contato.
    • NÃO CONFLITA: mora na tabela agenda_pos_consulta, fora de agenda_eventos.
      Lembrete de véspera, confirmação, motorista, choque de horário e números
      do dia nunca o enxergam, e NENHUMA mensagem sai sozinha — é tarefa da
      equipe, feita pelo botão "Mandar Pós Consulta" na Agenda.
    • SE O ATENDIMENTO VIRA FALTA/CANCELADO depois, o pós ainda pendente some
      sozinho. O que a equipe excluiu não renasce; o que ela marcou como feito
      fica.
   Regras puras em services/posConsulta.js.
   ═══════════════════════════════════════════════════════════════════════════ */

const r = express.Router();
const STATUS = ['Pendente', 'Feito'];
const TIPOS_VMED = { consulta: 'Consulta', retorno: 'Retorno', sessao: 'Sessão', avaliacao: 'Avaliação', procedimento: 'Procedimento' };

/** A conversa do WhatsApp pelo telefone (últimos 8 dígitos, como a agenda já faz). */
async function conversaDoTelefone(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  const { rows: [c] } = await query(
    `SELECT id FROM conversas WHERE RIGHT(regexp_replace(COALESCE(phone,''), '\\D', '', 'g'), 8) = $1
     ORDER BY last_message_at DESC NULLS LAST LIMIT 1`, [d.slice(-8)]).catch(() => ({ rows: [] }));
  return c?.id || null;
}

let rodando = false;

/** O robô: cria os pós do dia seguinte e desfaz os que perderam o atendimento. */
export async function rodarPosConsulta(agora = new Date()) {
  if (rodando) return { pulou: true };
  rodando = true;
  try {
    const hoje = hojeSLZ(agora);
    const agoraHM = horaSLZ(agora);
    const desde = somaDias(hoje, -7);

    // 1) Agenda daqui: consultas e terapias dos últimos 7 dias até hoje
    const { rows: ag } = await query(`
      SELECT id, paciente, responsavel_nome, telefone, conversa_id, setor, servico, profissional,
             to_char(data,'YYYY-MM-DD') data, hora, status
        FROM agenda_eventos
       WHERE COALESCE(setor,'vacinas') IN ('consultas','terapias')
         AND data BETWEEN $1 AND $2
         AND COALESCE(servico,'') NOT IN ('Pós Vacinal','Pós Consulta')`, [desde, hoje]);

    // 2) Sessões lançadas na área de Terapias
    const { rows: ses } = await query(`
      SELECT s.id, p.nome paciente, p.responsavel responsavel_nome, p.telefone, p.conversa_id,
             s.especialidade, s.profissional, to_char(s.data,'YYYY-MM-DD') data, s.hora, s.presenca
        FROM terapia_sessoes s JOIN terapia_pacientes p ON p.id = s.paciente_id
       WHERE s.data BETWEEN $1 AND $2`, [desde, hoje]).catch(() => ({ rows: [] }));

    // 3) VittaMed, ontem e hoje (ponte desligada ou fora do ar = segue sem ele)
    const vmed = [];
    const vmedVistas = new Set();
    for (const dia of [somaDias(hoje, -1), hoje]) {
      const itens = await agendaVittaMedDoDia(dia);
      for (const it of itens || []) {
        vmedVistas.add(`vittamed:${it.id}`);
        if (['consultas', 'terapias'].includes(it.setor)) vmed.push({ ...it, data: it.data || dia });
      }
    }

    const atendimentos = [
      ...ag.map(e => ({
        origem: `agenda:${e.id}`, paciente: e.paciente, responsavel_nome: e.responsavel_nome, telefone: e.telefone,
        conversa_id: e.conversa_id, setor: e.setor, servico: e.servico || (e.setor === 'terapias' ? 'Terapia' : 'Consulta'),
        profissional: e.profissional, data: e.data, hora: e.hora, status: e.status,
      })),
      ...ses.map(s => ({
        origem: `sessao:${s.id}`, paciente: s.paciente, responsavel_nome: s.responsavel_nome, telefone: s.telefone,
        conversa_id: s.conversa_id, setor: 'terapias', servico: s.especialidade ? `Terapia · ${s.especialidade}` : 'Terapia',
        profissional: s.profissional, data: s.data, hora: s.hora, status: s.presenca,
      })),
      ...vmed.map(i => ({
        origem: `vittamed:${i.id}`, paciente: i.paciente, responsavel_nome: i.responsavel_nome, telefone: i.telefone,
        conversa_id: null, setor: i.setor,
        servico: [TIPOS_VMED[String(i.servico || '').toLowerCase()] || i.servico || (i.setor === 'terapias' ? 'Terapia' : 'Consulta'), i.especialidade].filter(Boolean).join(' · '),
        profissional: i.profissional, data: i.data, hora: i.hora, status: i.status,
      })),
    ];

    // 4) Desfaz o pós ainda PENDENTE cujo atendimento virou falta/cancelado/remarcado
    const { rows: pend } = await query(`SELECT id, origens FROM agenda_pos_consulta
      WHERE data >= $1 AND status = 'Pendente'`, [hoje]);
    const idsDe = (pref) => [...new Set(pend.flatMap(p => p.origens || []).filter(o => o.startsWith(pref))
      .map(o => parseInt(o.slice(pref.length), 10)).filter(Number.isFinite))];
    const idsAg = idsDe('agenda:');
    const idsSes = idsDe('sessao:');
    const agAtual = idsAg.length ? (await query(`SELECT id, to_char(data,'YYYY-MM-DD') data, hora, status, setor, servico
      FROM agenda_eventos WHERE id = ANY($1::int[])`, [idsAg])).rows : [];
    const sesAtual = idsSes.length ? (await query(`SELECT id, to_char(data,'YYYY-MM-DD') data, hora, presenca status
      FROM terapia_sessoes WHERE id = ANY($1::int[])`, [idsSes])).rows : [];
    const validas = new Set();
    agAtual.forEach(e => { if (['consultas', 'terapias'].includes(e.setor || 'vacinas') && !/^Pós /.test(e.servico || '') && aconteceu(e, hoje, agoraHM)) validas.add(`agenda:${e.id}`); });
    sesAtual.forEach(s => { if (aconteceu(s, hoje, agoraHM)) validas.add(`sessao:${s.id}`); });
    vmed.forEach(i => { if (aconteceu(i, hoje, agoraHM)) validas.add(`vittamed:${i.id}`); });
    const conferivel = (o) => o.startsWith('agenda:') || o.startsWith('sessao:') || vmedVistas.has(o);
    const { tirar, apagar } = planejarLimpeza(pend, validas, conferivel);
    for (const t of tirar) {
      await query(`UPDATE agenda_pos_consulta SET origens = ARRAY(SELECT o FROM unnest(origens) o WHERE o <> ALL($2::text[])),
                     updated_at = NOW() WHERE id = $1 AND status = 'Pendente'`, [t.id, t.origens]);
    }
    if (apagar.length) await query(`DELETE FROM agenda_pos_consulta WHERE id = ANY($1::int[]) AND status = 'Pendente'`, [apagar]);

    // 5) Cria os novos e junta o 2º atendimento do dia no pós que já existe
    const { rows: existentes } = await query(`SELECT id, to_char(data,'YYYY-MM-DD') data, paciente, origens, status
      FROM agenda_pos_consulta WHERE data >= $1`, [desde]);
    const { novos, juntar } = planejarPosConsulta(atendimentos, existentes, { hoje, agoraHM });
    let criados = 0;
    for (const n of novos) {
      const conversa = n.conversa_id || await conversaDoTelefone(n.telefone);
      const { rowCount } = await query(`
        INSERT INTO agenda_pos_consulta (data, hora, paciente, responsavel_nome, telefone, conversa_id, setor,
                                         servico_origem, profissional, data_atendimento, origens)
        SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[]
         WHERE NOT EXISTS (SELECT 1 FROM agenda_pos_consulta WHERE origens && $11::text[])`,
        [n.data, n.hora, n.paciente, n.responsavel_nome, n.telefone, conversa, n.setor,
         n.servicos.join(' + ') || null, n.profissional, n.data_atendimento, n.origens]);
      criados += rowCount;
    }
    let juntados = 0;
    for (const j of juntar) {
      const { rowCount } = await query(`
        UPDATE agenda_pos_consulta SET origens = array_append(origens, $2),
               servico_origem = CASE WHEN $3::text IS NULL OR strpos(lower(COALESCE(servico_origem,'')), lower($3::text)) > 0
                                     THEN servico_origem ELSE COALESCE(NULLIF(servico_origem,'') || ' + ', '') || $3::text END,
               updated_at = NOW()
         WHERE id = $1 AND NOT ($2 = ANY(origens))`, [j.id, j.origem, j.servico]);
      juntados += rowCount;
    }
    const desfeitos = tirar.length + apagar.length;
    if (criados || juntados || desfeitos) {
      console.log(`🩺 Pós consulta: ${criados} criado(s), ${juntados} juntado(s), ${desfeitos} desfeito(s)`);
      try { socketEmit('agenda_update', { auto: true, pos_consulta: true }); } catch (_) { /* ok */ }
    }
    return { criados, juntados, desfeitos, atendimentos: atendimentos.length, vittamed: vmedVistas.size ? 'ligado' : 'sem dados' };
  } catch (e) {
    console.error('pós consulta:', e.message);
    return { erro: e.message };
  } finally {
    rodando = false;
  }
}
// De hora em hora, como o Pós Vacinal: a consulta das 10h ganha o pós até as 11h
setInterval(() => { rodarPosConsulta(); }, 3600 * 1000);
setTimeout(() => { rodarPosConsulta(); }, 75000);

// GET /api/pos-consulta?data=YYYY-MM-DD — a lista do dia (a parte separada da Agenda)
r.get('/', auth, async (req, res) => {
  try {
    const data = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data : hojeSLZ();
    const { rows } = await query(`
      SELECT id, to_char(data,'YYYY-MM-DD') data, hora, paciente, responsavel_nome, telefone, conversa_id, setor,
             servico_origem, profissional, to_char(data_atendimento,'YYYY-MM-DD') data_atendimento,
             status, observacoes, feito_por, feito_em
        FROM agenda_pos_consulta
       WHERE data = $1 AND status <> 'Excluído'
       ORDER BY hora, paciente`, [data]);
    res.json({ data, itens: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/pos-consulta/gerar — o master roda o robô na hora (sem esperar a próxima hora)
r.post('/gerar', auth, async (req, res) => {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Só o master roda o robô na mão.' });
  res.json({ ok: true, ...(await rodarPosConsulta()) });
});

// PUT /api/pos-consulta/:id — { status: 'Feito' | 'Pendente', observacoes }
r.put('/:id', auth, async (req, res) => {
  const b = req.body || {};
  const status = STATUS.includes(b.status) ? b.status : null;
  const temObs = typeof b.observacoes === 'string';
  if (!status && !temObs) return res.status(400).json({ error: 'Nada para mudar.' });
  try {
    const { rows: [p] } = await query(`
      UPDATE agenda_pos_consulta SET
             status = COALESCE($2::text, status),
             observacoes = CASE WHEN $3::boolean THEN $4::text ELSE observacoes END,
             feito_por = CASE WHEN $2::text = 'Feito' THEN $5::text WHEN $2::text = 'Pendente' THEN NULL ELSE feito_por END,
             feito_em = CASE WHEN $2::text = 'Feito' THEN NOW() WHEN $2::text = 'Pendente' THEN NULL ELSE feito_em END,
             updated_at = NOW()
       WHERE id = $1 AND status <> 'Excluído'
       RETURNING id, status, observacoes, feito_por, feito_em`,
      [req.params.id, status, temObs, temObs ? b.observacoes.trim().slice(0, 500) || null : null, req.user?.nome || null]);
    if (!p) return res.status(404).json({ error: 'Pós consulta não encontrado.' });
    try { socketEmit('agenda_update', { pos_consulta: true }); } catch (_) { /* ok */ }
    res.json({ ok: true, pos: p });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/pos-consulta/:id — some da lista; a origem fica guardada e o robô não recria
r.delete('/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await query(`UPDATE agenda_pos_consulta SET status = 'Excluído', feito_por = $2, feito_em = NOW(),
                                        updated_at = NOW() WHERE id = $1`, [req.params.id, req.user?.nome || null]);
    if (!rowCount) return res.status(404).json({ error: 'Pós consulta não encontrado.' });
    try { socketEmit('agenda_update', { pos_consulta: true }); } catch (_) { /* ok */ }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default r;
