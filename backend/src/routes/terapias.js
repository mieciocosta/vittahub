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
      `SELECT id, paciente_id, especialidade, sessoes_semana, valor_mensal,
              TO_CHAR(data_inicio,'YYYY-MM-DD') AS data_inicio, status, observacoes,
              criado_por_nome, created_at
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

// ── Registrar plano terapêutico ──────────────────────────────────────────────
r.post('/planos', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  const b = req.body || {};
  const pacienteId = parseInt(b.paciente_id) || 0;
  if (!pacienteId) return res.status(400).json({ error: 'Escolha o paciente.' });
  const especialidade = cut((b.especialidade || '').trim(), 60);
  if (!especialidade) return res.status(400).json({ error: 'Informe a especialidade do plano.' });
  const valor = b.valor_mensal !== undefined && b.valor_mensal !== '' && !isNaN(parseFloat(b.valor_mensal))
    ? Math.max(0, Math.min(parseFloat(b.valor_mensal), 100000)) : null;
  const dataInicio = /^\d{4}-\d{2}-\d{2}$/.test(b.data_inicio || '') ? b.data_inicio : null;
  try {
    const { rows: [pl] } = await query(`
      INSERT INTO terapia_planos (paciente_id, especialidade, sessoes_semana, valor_mensal, data_inicio, status, observacoes, criado_por_id, criado_por_nome)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [pacienteId, especialidade, Math.max(0, Math.min(parseInt(b.sessoes_semana) || 1, 14)), valor, dataInicio,
       STATUS_PLANO.includes(b.status) ? b.status : 'ativo', cut(b.observacoes, 400), req.user.id, req.user.nome]);
    // Registrar plano coloca o paciente em terapia — é o que o plano significa
    await query(`UPDATE terapia_pacientes SET status = 'em_terapia', updated_at = NOW()
                  WHERE id = $1 AND status = 'avaliacao'`, [pacienteId]).catch(() => {});
    try { socketEmit('terapias_update', { plano: pl.id }); } catch (_) {}
    res.json({ ok: true, plano: pl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/planos/:id', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  const b = req.body || {};
  if (!STATUS_PLANO.includes(b.status)) return res.status(400).json({ error: 'Situação inválida.' });
  try {
    await query(`UPDATE terapia_planos SET status = $1 WHERE id = $2`, [b.status, req.params.id]);
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
