import express from 'express';
import { auth } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { socketEmit } from '../socketServer.js';

// ─── ÁREA DE TERAPIAS ────────────────────────────────────────────────────────
// Pedido do master: uma aba só de TERAPIAS, onde a equipe puxa o paciente para
// essa área e registra o plano terapêutico. A meta do setor deixa de ser só
// dinheiro e passa a ser 100 PLANOS no mês.
//
// A área é da equipe de terapias (e da gestão). Vacinas e consultas não entram.

const r = express.Router();

const ehGestao = (req) => ['master', 'supervisor'].includes(req.user?.role);
function daTerapia(req) {
  if (ehGestao(req)) return true;
  const setores = Array.isArray(req.user?.setores) && req.user.setores.length ? req.user.setores : [req.user?.setor];
  return setores.includes('terapias');
}
function guarda(req, res) {
  if (!daTerapia(req)) { res.status(403).json({ error: 'A área de Terapias é da equipe de terapias.' }); return false; }
  return true;
}

const cut = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));
const tel = (v) => cut(String(v || '').replace(/\D/g, ''), 13);
const STATUS_PAC = ['avaliacao', 'em_terapia', 'pausado', 'alta'];
const STATUS_PLANO = ['ativo', 'concluido', 'cancelado'];
const META_PLANOS_PADRAO = 100; // pedido do master

// Mês corrente no fuso de São Luís (UTC-3)
const mesLocal = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7);

// ── Lista da área: pacientes + planos de cada um ─────────────────────────────
r.get('/', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try {
    const { rows: pacientes } = await query(`
      SELECT p.*,
             COUNT(pl.id)::int AS planos,
             MAX(pl.created_at) AS ultimo_plano,
             COALESCE(SUM(CASE WHEN pl.status = 'ativo' THEN pl.valor_mensal ELSE 0 END), 0)::float AS valor_ativo
        FROM terapia_pacientes p
        LEFT JOIN terapia_planos pl ON pl.paciente_id = p.id
       GROUP BY p.id
       ORDER BY (p.status = 'alta'), p.created_at DESC`);
    const { rows: planos } = await query(
      `SELECT id, paciente_id, especialidade, sessoes_semana, valor_sessao, valor_mensal,
              TO_CHAR(data_inicio,'YYYY-MM-DD') AS data_inicio, status, observacoes,
              COALESCE(horarios,'[]'::jsonb) AS horarios, criado_por_nome, created_at
         FROM terapia_planos ORDER BY created_at DESC`);
    res.json({ pacientes, planos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Puxar para a área: procura em conversas, leads e agenda ──────────────────
r.get('/buscar', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const like = `%${q}%`;
  try {
    const [conv, leads, ag] = await Promise.all([
      query(`SELECT id::text AS ref, COALESCE(nome, phone) AS nome, phone AS telefone, 'conversa' AS origem
               FROM conversas WHERE nome ILIKE $1 OR phone ILIKE $1 ORDER BY nome LIMIT 8`, [like]).catch(() => ({ rows: [] })),
      query(`SELECT id::text AS ref, nome, telefone, 'lead' AS origem
               FROM leads WHERE nome ILIKE $1 OR telefone ILIKE $1 ORDER BY nome LIMIT 8`, [like]).catch(() => ({ rows: [] })),
      query(`SELECT DISTINCT ON (paciente) id::text AS ref, paciente AS nome, telefone, 'agenda' AS origem
               FROM agenda_eventos WHERE paciente ILIKE $1 ORDER BY paciente, data DESC LIMIT 8`, [like]).catch(() => ({ rows: [] })),
    ]);
    // Quem já está na área não aparece de novo na busca
    const { rows: jaTem } = await query(`SELECT telefone FROM terapia_pacientes WHERE telefone IS NOT NULL`);
    const dentro = new Set(jaTem.map(p => String(p.telefone || '').slice(-11)).filter(Boolean));
    const todos = [...conv.rows, ...leads.rows, ...ag.rows]
      .filter(x => !dentro.has(String(x.telefone || '').replace(/\D/g, '').slice(-11)));
    res.json(todos.slice(0, 15));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Trazer o paciente para a área ────────────────────────────────────────────
r.post('/pacientes', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  const b = req.body || {};
  const nome = cut((b.nome || '').trim(), 90);
  if (!nome) return res.status(400).json({ error: 'Informe o nome do paciente.' });
  const telefone = tel(b.telefone);
  try {
    if (telefone) {
      const { rows: dup } = await query(`SELECT id, nome FROM terapia_pacientes WHERE telefone = $1 LIMIT 1`, [telefone]);
      if (dup.length) return res.status(409).json({ error: `${dup[0].nome} já está na área de terapias.`, id: dup[0].id });
    }
    const { rows: [p] } = await query(`
      INSERT INTO terapia_pacientes (nome, telefone, responsavel, conversa_id, lead_id, origem, status, observacoes, criado_por_id, criado_por_nome)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [nome, telefone, cut(b.responsavel, 90), cut(b.conversa_id, 40), cut(b.lead_id, 40),
       cut(b.origem, 20) || 'manual', STATUS_PAC.includes(b.status) ? b.status : 'avaliacao',
       cut(b.observacoes, 400), req.user.id, req.user.nome]);
    try { socketEmit('terapias_update', { id: p.id }); } catch (_) {}
    res.json({ ok: true, paciente: p });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/pacientes/:id', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  const b = req.body || {};
  const sets = []; const params = []; let i = 1;
  const set = (c, v) => { sets.push(`${c} = $${i++}`); params.push(v); };
  if (b.nome !== undefined) set('nome', cut(b.nome, 90));
  if (b.telefone !== undefined) set('telefone', tel(b.telefone));
  if (b.responsavel !== undefined) set('responsavel', cut(b.responsavel, 90));
  if (b.observacoes !== undefined) set('observacoes', cut(b.observacoes, 400));
  if (b.status !== undefined && STATUS_PAC.includes(b.status)) set('status', b.status);
  if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
  params.push(req.params.id);
  try {
    const { rows: [p] } = await query(`UPDATE terapia_pacientes SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, params);
    if (!p) return res.status(404).json({ error: 'Paciente não encontrado.' });
    res.json({ ok: true, paciente: p });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Tirar da área não apaga o histórico de outro lugar — só sai daqui.
r.delete('/pacientes/:id', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try {
    await query(`DELETE FROM terapia_pacientes WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Dias e horários que a criança faz aquela terapia. Chega da tela como
// [{dia:1,hora:'14:00'}] — 0=domingo … 6=sábado. Guarda no máximo 14 (2 por dia).
function limpaHorarios(lista) {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set();
  return lista
    .map(h => ({ dia: parseInt(h?.dia), hora: String(h?.hora || '').trim() }))
    .filter(h => Number.isInteger(h.dia) && h.dia >= 0 && h.dia <= 6 && /^\d{2}:\d{2}$/.test(h.hora))
    .filter(h => { const k = `${h.dia}|${h.hora}`; if (vistos.has(k)) return false; vistos.add(k); return true; })
    .sort((a, b) => a.dia - b.dia || a.hora.localeCompare(b.hora))
    .slice(0, 14);
}

// Cria UM plano. Usado pelo registro em lote logo abaixo.
async function criarPlano(req, b, pacienteId) {
  const especialidade = cut((b.especialidade || '').trim(), 60);
  if (!especialidade) return null;
  const horarios = limpaHorarios(b.horarios);
  const dinheiro = (v) => (v === undefined || v === '' || v === null || isNaN(parseFloat(v))
    ? null : Math.max(0, Math.min(parseFloat(v), 100000)));
  const dataInicio = /^\d{4}-\d{2}-\d{2}$/.test(b.data_inicio || '') ? b.data_inicio : null;
  // Marcou 3 horários? São 3 sessões por semana — não precisa digitar de novo.
  const sessoes = horarios.length || Math.max(0, Math.min(parseInt(b.sessoes_semana) || 1, 14));
  const valorSessao = dinheiro(b.valor_sessao);
  // Se a equipe informou só o valor da sessão, o mensal sai da conta:
  // sessões por semana × 4 semanas. Continua editável na tela.
  const valor = dinheiro(b.valor_mensal) ?? (valorSessao != null ? Math.round(valorSessao * sessoes * 4 * 100) / 100 : null);
  const { rows: [pl] } = await query(`
    INSERT INTO terapia_planos (paciente_id, especialidade, sessoes_semana, valor_sessao, valor_mensal, data_inicio, status, observacoes, horarios, criado_por_id, criado_por_nome)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) RETURNING *`,
    [pacienteId, especialidade, sessoes, valorSessao, valor, dataInicio,
     STATUS_PLANO.includes(b.status) ? b.status : 'ativo', cut(b.observacoes, 400),
     JSON.stringify(horarios), req.user.id, req.user.nome]);
  return pl;
}

// ── Registrar plano terapêutico ──────────────────────────────────────────────
r.post('/planos', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  const b = req.body || {};
  const pacienteId = parseInt(b.paciente_id) || 0;
  if (!pacienteId) return res.status(400).json({ error: 'Escolha o paciente.' });
  // A tela manda uma lista: cada TERAPIA marcada vira um plano, com os dias e
  // horários dela. Assim a meta de 100 planos conta terapia por terapia.
  const lista = Array.isArray(b.terapias) && b.terapias.length
    ? b.terapias
    : [{ especialidade: b.especialidade, horarios: b.horarios, sessoes_semana: b.sessoes_semana, valor_mensal: b.valor_mensal, data_inicio: b.data_inicio, observacoes: b.observacoes, status: b.status }];
  if (!lista.some(t => String(t?.especialidade || '').trim())) {
    return res.status(400).json({ error: 'Marque ao menos uma terapia.' });
  }
  try {
    const criados = [];
    for (const t of lista.slice(0, 10)) {
      const pl = await criarPlano(req, { ...t, data_inicio: t.data_inicio || b.data_inicio, observacoes: t.observacoes ?? b.observacoes }, pacienteId);
      if (pl) criados.push(pl);
    }
    // Registrar plano coloca o paciente em terapia — é o que o plano significa
    await query(`UPDATE terapia_pacientes SET status = 'em_terapia', updated_at = NOW()
                  WHERE id = $1 AND status = 'avaliacao'`, [pacienteId]).catch(() => {});
    try { socketEmit('terapias_update', { paciente: pacienteId }); } catch (_) {}
    res.json({ ok: true, criados: criados.length, planos: criados });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/planos/:id', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  const b = req.body || {};
  const sets = []; const params = []; let i = 1;
  if (b.status !== undefined) {
    if (!STATUS_PLANO.includes(b.status)) return res.status(400).json({ error: 'Situação inválida.' });
    sets.push(`status = $${i++}`); params.push(b.status);
  }
  if (b.horarios !== undefined) {
    const h = limpaHorarios(b.horarios);
    sets.push(`horarios = $${i++}::jsonb`); params.push(JSON.stringify(h));
    sets.push(`sessoes_semana = $${i++}`); params.push(h.length || 1);
  }
  for (const campo of ['valor_mensal', 'valor_sessao']) {
    if (b[campo] !== undefined) {
      sets.push(`${campo} = $${i++}`);
      params.push(b[campo] === '' || isNaN(parseFloat(b[campo])) ? null : Math.max(0, Math.min(parseFloat(b[campo]), 100000)));
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
  params.push(req.params.id);
  try {
    await query(`UPDATE terapia_planos SET ${sets.join(', ')} WHERE id = $${i}`, params);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/planos/:id', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try { await query(`DELETE FROM terapia_planos WHERE id = $1`, [req.params.id]); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Meta de PLANOS do mês (padrão 100, pedido do master) ─────────────────────
export async function metaPlanos() {
  const { rows } = await query("SELECT valor FROM configuracoes WHERE chave = 'metas'").catch(() => ({ rows: [] }));
  const v = rows[0]?.valor?.planos_terapeuticos;
  return Number.isFinite(+v) && +v > 0 ? +v : META_PLANOS_PADRAO;
}

// Resumo usado pela aba Terapias E pela aba Metas
export async function resumoPlanos(mes) {
  const m = /^\d{4}-\d{2}$/.test(mes || '') ? mes : mesLocal();
  const [feitosQ, ativosQ, meta] = await Promise.all([
    query(`SELECT COUNT(*)::int n FROM terapia_planos WHERE to_char(created_at,'YYYY-MM') = $1 AND status <> 'cancelado'`, [m]).catch(() => ({ rows: [{ n: 0 }] })),
    query(`SELECT COUNT(*)::int n, COALESCE(SUM(valor_mensal),0)::float v FROM terapia_planos WHERE status = 'ativo'`).catch(() => ({ rows: [{ n: 0, v: 0 }] })),
    metaPlanos(),
  ]);
  const feitos = feitosQ.rows[0]?.n || 0;
  return {
    mes: m, meta, feitos,
    falta: Math.max(0, meta - feitos),
    pct: meta > 0 ? Math.round((feitos / meta) * 100) : 0,
    ativos: ativosQ.rows[0]?.n || 0,
    valor_ativo: ativosQ.rows[0]?.v || 0,
  };
}

r.get('/resumo', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try { res.json(await resumoPlanos(req.query.mes)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/meta', auth, async (req, res) => {
  if (!ehGestao(req)) return res.status(403).json({ error: 'Apenas a gestão define metas.' });
  const n = Math.max(0, Math.min(parseInt(req.body?.meta) || 0, 100000));
  try {
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('metas', jsonb_build_object('planos_terapeuticos', $1::int))
                 ON CONFLICT (chave) DO UPDATE SET valor = jsonb_set(COALESCE(configuracoes.valor,'{}'::jsonb), '{planos_terapeuticos}', to_jsonb($1::int)), updated_at = NOW()`, [n]);
    res.json({ ok: true, meta: n });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default r;
