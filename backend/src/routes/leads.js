import express from 'express';
import { query } from '../db/pool.js';
import { auth } from '../middleware/auth.js';

const r = express.Router();
r.use(auth);

// Helper: hide financial data from non-master
const guard = (row, role) => role === 'master' ? row : { ...row, valor_proposta: null };

// ─── LIST (with pagination + search + filters) ────────────────────────────────
r.get('/', async (req, res) => {
  try {
    const { status, responsavel_id, origem, search, tag, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let pi = 1;

    if (status)         { conditions.push(`l.status = $${pi++}`);            params.push(status); }
    if (responsavel_id) { conditions.push(`l.responsavel_id = $${pi++}`);    params.push(responsavel_id); }
    if (origem)         { conditions.push(`l.origem = $${pi++}`);            params.push(origem); }
    if (tag)            { conditions.push(`$${pi++} = ANY(l.tags)`);         params.push(tag); }
    if (search) {
      conditions.push(`(l.nome ILIKE $${pi} OR l.telefone ILIKE $${pi} OR l.email ILIKE $${pi})`);
      params.push(`%${search}%`); pi++;
    }
    // Atendente only sees their own leads
    if (req.user.role !== 'master') {
      conditions.push(`l.responsavel_id = $${pi++}`);
      params.push(req.user.id);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countRes = await query(`SELECT COUNT(*) FROM leads l ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const dataRes = await query(`
      SELECT l.*, u.nome AS responsavel_nome, u.cor AS responsavel_cor
      FROM leads l
      LEFT JOIN usuarios u ON u.id = l.responsavel_id
      ${where}
      ORDER BY l.data_entrada DESC, l.created_at DESC
      LIMIT $${pi} OFFSET $${pi+1}
    `, [...params, parseInt(limit), offset]);

    res.json({ data: dataRes.rows.map(row => guard(row, req.user.role)), total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('leads list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── META ────────────────────────────────────────────────────────────────────
r.get('/meta', async (req, res) => {
  try {
    const { rows: users } = await query("SELECT id, nome, cor FROM usuarios WHERE role != 'bot' AND ativo = true ORDER BY nome");
    res.json({
      origens:     ['Instagram','Google','WhatsApp','Indicação','Facebook','Tráfego Pago','Orgânico','Outro'],
      interesses:  ['Consulta','Vacina','Plano Vacinal','Terapia','Plano Infantil','Gestante','Outro'],
      statusList:  ['Novo lead','Em atendimento','Orçamento enviado','Aguardando retorno','Fechado','Perdido'],
      motivosPerda:['Preço','Concorrência','Sem interesse','Sem retorno','Adiou','Outro'],
      tags:        ['urgente','quente','plano','vip','infantil','retorno','casal','gestante','indicação','frio'],
      users,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET ONE ──────────────────────────────────────────────────────────────────
r.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT l.*, u.nome AS responsavel_nome, u.cor AS responsavel_cor
      FROM leads l LEFT JOIN usuarios u ON u.id = l.responsavel_id
      WHERE l.id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    res.json(guard(rows[0], req.user.role));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CREATE ────────────────────────────────────────────────────────────────────
r.post('/', async (req, res) => {
  try {
    const { nome, telefone = '', email = '', origem = 'WhatsApp', interesse = 'Consulta', responsavel_id, valor_proposta = 0, servico = '', data_retorno, observacoes = '', tags = [] } = req.body;
    const respId = responsavel_id || req.user.id;
    const valor = req.user.role === 'master' ? parseFloat(valor_proposta) || 0 : 0;

    const { rows } = await query(`
      INSERT INTO leads (nome, telefone, email, origem, interesse, status, responsavel_id, valor_proposta, servico, data_retorno, observacoes, tags)
      VALUES ($1,$2,$3,$4,$5,'Novo lead',$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [nome, telefone, email, origem, interesse, respId, valor, servico, data_retorno || null, observacoes, tags]
    );

    // Notify
    await query(`INSERT INTO notificacoes (tipo, titulo, texto, lead_id) VALUES ($1,$2,$3,$4)`,
      ['novo_lead', 'Novo lead', `${nome} entrou via ${origem}`, rows[0].id]);

    res.status(201).json(guard(rows[0], req.user.role));
  } catch (err) {
    console.error('leads create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE ────────────────────────────────────────────────────────────────────
r.put('/:id', async (req, res) => {
  try {
    const { nome, telefone, email, origem, interesse, status, responsavel_id, valor_proposta, servico, data_retorno, observacoes, motivo_perda, tags } = req.body;
    const valor = req.user.role === 'master' ? parseFloat(valor_proposta) || 0 : undefined;

    const updates = [];
    const params = [];
    let pi = 1;
    const set = (col, val) => { if (val !== undefined) { updates.push(`${col} = $${pi++}`); params.push(val); } };
    set('nome', nome); set('telefone', telefone); set('email', email);
    set('origem', origem); set('interesse', interesse); set('status', status);
    set('responsavel_id', responsavel_id); set('servico', servico);
    set('data_retorno', data_retorno || null); set('observacoes', observacoes);
    set('motivo_perda', motivo_perda); set('tags', tags);
    if (valor !== undefined) set('valor_proposta', valor);

    if (!updates.length) return res.status(400).json({ error: 'Nada para atualizar' });
    params.push(req.params.id);

    const { rows } = await query(`UPDATE leads SET ${updates.join(',')} WHERE id = $${pi} RETURNING *`, params);
    if (!rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    res.json(guard(rows[0], req.user.role));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PATCH STATUS ─────────────────────────────────────────────────────────────
r.patch('/:id/status', async (req, res) => {
  try {
    const { status, motivo_perda } = req.body;
    const { rows } = await query(
      'UPDATE leads SET status = $1, motivo_perda = $2 WHERE id = $3 RETURNING *',
      [status, motivo_perda || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    res.json(guard(rows[0], req.user.role));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DELETE ────────────────────────────────────────────────────────────────────
r.delete('/:id', async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Somente master' });
  try {
    await query('DELETE FROM leads WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default r;
