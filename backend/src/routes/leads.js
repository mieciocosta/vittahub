import express from 'express';
import { query } from '../db/pool.js';
import { auth } from '../middleware/auth.js';
import { socketEmit } from '../socketServer.js';

const r = express.Router();
r.use(auth);

// Helper: hide financial data from non-master
const guard = (row, role) => role === 'master' ? row : { ...row, valor_proposta: null };

// Helper: aceita payload em camelCase OU snake_case (o LeadModal envia camelCase;
// antes disso, responsável/valor/retorno/motivo NUNCA eram salvos — bug silencioso)
const normBody = (b = {}) => ({
  nome: b.nome, telefone: b.telefone, email: b.email,
  origem: b.origem, interesse: b.interesse, status: b.status,
  responsavel_id: b.responsavel_id ?? b.responsavelId,
  valor_proposta: b.valor_proposta ?? b.valorProposta,
  servico: b.servico,
  data_retorno: b.data_retorno ?? b.dataRetorno,
  observacoes: b.observacoes,
  motivo_perda: b.motivo_perda ?? b.motivoPerda,
  tags: b.tags,
});

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
    const { rows: colunas } = await query('SELECT * FROM funil_colunas ORDER BY ordem, created_at');
    res.json({
      origens:     ['Instagram','Google','WhatsApp','Indicação','Facebook','Tráfego Pago','Orgânico','Outro'],
      interesses:  ['Consulta','Vacina','Plano Vacinal','Terapia','Plano Infantil','Gestante','Outro'],
      statusList:  colunas.map(c => c.nome),
      colunas,
      motivosPerda:['Preço','Concorrência','Sem interesse','Sem retorno','Adiou','Outro'],
      tags:        ['urgente','quente','plano','vip','infantil','retorno','casal','gestante','indicação','frio'],
      users,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── FUNIL: COLUNAS DO KANBAN ─────────────────────────────────────────────────
// IMPORTANTE: estas rotas ficam ANTES de GET /:id, senão "colunas" casa com :id

r.get('/colunas', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM funil_colunas ORDER BY ordem, created_at');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/colunas', async (req, res) => {
  try {
    const nome = String(req.body.nome || '').trim();
    const cor = req.body.cor || '#3b82f6';
    if (!nome) return res.status(400).json({ error: 'Nome da etapa é obrigatório' });
    const { rows: [dup] } = await query('SELECT 1 FROM funil_colunas WHERE LOWER(nome) = LOWER($1)', [nome]);
    if (dup) return res.status(409).json({ error: 'Já existe uma etapa com esse nome' });
    const { rows: [{ max }] } = await query('SELECT COALESCE(MAX(ordem), -1) AS max FROM funil_colunas');
    const { rows: [col] } = await query(
      'INSERT INTO funil_colunas (nome, cor, ordem) VALUES ($1, $2, $3) RETURNING *',
      [nome, cor, parseInt(max) + 1]
    );
    socketEmit('funil_update', { tipo: 'coluna' });
    res.status(201).json(col);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reordenar (antes de /colunas/:id para não casar "reorder" com :id)
r.patch('/colunas/reorder', async (req, res) => {
  try {
    const ids = req.body.ids || [];
    for (let i = 0; i < ids.length; i++) {
      await query('UPDATE funil_colunas SET ordem = $1 WHERE id = $2', [i, ids[i]]);
    }
    socketEmit('funil_update', { tipo: 'coluna' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/colunas/:id', async (req, res) => {
  try {
    const { rows: [col] } = await query('SELECT * FROM funil_colunas WHERE id = $1', [req.params.id]);
    if (!col) return res.status(404).json({ error: 'Etapa não encontrada' });
    const novoNome = req.body.nome !== undefined ? String(req.body.nome).trim() : col.nome;
    const novaCor = req.body.cor || col.cor;
    if (!novoNome) return res.status(400).json({ error: 'Nome da etapa é obrigatório' });
    if (col.fixa && novoNome !== col.nome) {
      return res.status(403).json({ error: `A etapa "${col.nome}" é usada nos relatórios e não pode ser renomeada` });
    }
    if (novoNome !== col.nome) {
      const { rows: [dup] } = await query('SELECT 1 FROM funil_colunas WHERE LOWER(nome) = LOWER($1) AND id <> $2', [novoNome, col.id]);
      if (dup) return res.status(409).json({ error: 'Já existe uma etapa com esse nome' });
    }
    // Renomear cascateia para os leads (status é o nome da etapa)
    await query('BEGIN');
    try {
      await query('UPDATE funil_colunas SET nome = $1, cor = $2 WHERE id = $3', [novoNome, novaCor, col.id]);
      if (novoNome !== col.nome) {
        await query('UPDATE leads SET status = $1 WHERE status = $2', [novoNome, col.nome]);
      }
      await query('COMMIT');
    } catch (e) { await query('ROLLBACK'); throw e; }
    socketEmit('funil_update', { tipo: 'coluna' });
    const { rows: [updated] } = await query('SELECT * FROM funil_colunas WHERE id = $1', [col.id]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/colunas/:id', async (req, res) => {
  try {
    const { rows: [col] } = await query('SELECT * FROM funil_colunas WHERE id = $1', [req.params.id]);
    if (!col) return res.status(404).json({ error: 'Etapa não encontrada' });
    if (col.fixa) return res.status(403).json({ error: `A etapa "${col.nome}" é usada nos relatórios e não pode ser excluída` });
    const { rows: [{ count }] } = await query('SELECT COUNT(*) AS count FROM leads WHERE status = $1', [col.nome]);
    if (parseInt(count) > 0) {
      return res.status(409).json({ error: `Há ${count} lead(s) nesta etapa. Mova-os antes de excluir.` });
    }
    await query('DELETE FROM funil_colunas WHERE id = $1', [col.id]);
    socketEmit('funil_update', { tipo: 'coluna' });
    res.json({ ok: true });
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
    const b = normBody(req.body);
    const nome = b.nome, telefone = b.telefone || '', email = b.email || '';
    const origem = b.origem || 'WhatsApp', interesse = b.interesse || 'Consulta';
    const respId = b.responsavel_id || req.user.id;
    const valor = req.user.role === 'master' ? parseFloat(b.valor_proposta) || 0 : 0;
    // Permite criar o lead já numa etapa específica (criar direto na coluna do Kanban)
    let status = b.status;
    if (status) {
      const { rows: [ok] } = await query('SELECT 1 FROM funil_colunas WHERE nome = $1', [status]);
      if (!ok) status = null;
    }
    if (!status) {
      const { rows: [primeira] } = await query('SELECT nome FROM funil_colunas ORDER BY ordem LIMIT 1');
      status = primeira?.nome || 'Novo lead';
    }

    const { rows } = await query(`
      INSERT INTO leads (nome, telefone, email, origem, interesse, status, responsavel_id, valor_proposta, servico, data_retorno, observacoes, tags, status_changed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
      RETURNING *`,
      [nome, telefone, email, origem, interesse, status, respId, valor, b.servico || '', b.data_retorno || null, b.observacoes || '', b.tags || []]
    );
    socketEmit('funil_update', { tipo: 'lead', leadId: rows[0].id });

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
    const { nome, telefone, email, origem, interesse, status, responsavel_id, valor_proposta, servico, data_retorno, observacoes, motivo_perda, tags } = normBody(req.body);
    const valor = req.user.role === 'master' && valor_proposta !== undefined ? parseFloat(valor_proposta) || 0 : undefined;

    const updates = [];
    const params = [];
    let pi = 1;
    let statusIdx = null;
    const set = (col, val) => { if (val !== undefined) { updates.push(`${col} = $${pi}`); params.push(val); if (col === 'status') statusIdx = pi; pi++; } };
    set('nome', nome); set('telefone', telefone); set('email', email);
    set('origem', origem); set('interesse', interesse); set('status', status);
    set('responsavel_id', responsavel_id); set('servico', servico);
    set('data_retorno', data_retorno || null); set('observacoes', observacoes);
    set('motivo_perda', motivo_perda); set('tags', tags);
    if (valor !== undefined) set('valor_proposta', valor);

    if (!updates.length) return res.status(400).json({ error: 'Nada para atualizar' });
    // Mudou de etapa via edição → reinicia o relógio "tempo na etapa".
    // No UPDATE do Postgres, "status" na expressão referencia o valor ANTIGO da linha.
    if (statusIdx) updates.push(`status_changed_at = CASE WHEN status IS DISTINCT FROM $${statusIdx} THEN NOW() ELSE status_changed_at END`);
    params.push(req.params.id);

    const { rows } = await query(`UPDATE leads SET ${updates.join(',')}, updated_at = NOW() WHERE id = $${pi} RETURNING *`, params);
    if (!rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    socketEmit('funil_update', { tipo: 'lead', leadId: rows[0].id });
    res.json(guard(rows[0], req.user.role));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PATCH STATUS ─────────────────────────────────────────────────────────────
r.patch('/:id/status', async (req, res) => {
  try {
    const { status, motivo_perda } = req.body;
    const { rows } = await query(
      `UPDATE leads SET status = $1, motivo_perda = $2,
         status_changed_at = CASE WHEN status IS DISTINCT FROM $1 THEN NOW() ELSE status_changed_at END,
         updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, motivo_perda || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    socketEmit('funil_update', { tipo: 'lead', leadId: rows[0].id });
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
