import express from 'express';
import { query } from '../db/pool.js';
import { auth, masterOnly } from '../middleware/auth.js';
import { socketEmit } from '../socketServer.js';

const r = express.Router();
r.use(auth);

// Helper: hide financial data from non-master
const guard = (row, role) => role === 'master' ? row : { ...row, valor_proposta: null };

// Helper: aceita payload em camelCase OU snake_case (o LeadModal envia camelCase;
// antes disso, responsável/valor/retorno/motivo NUNCA eram salvos — bug silencioso)
const cut = (v, n) => v === undefined ? undefined : String(v).trim().slice(0, n);
const normBody = (b = {}) => {
  let valor = b.valor_proposta ?? b.valorProposta;
  if (valor !== undefined) {
    valor = parseFloat(String(valor).replace(',', '.'));
    valor = Number.isFinite(valor) ? Math.min(Math.max(valor, 0), 999999.99) : 0;
  }
  let tel = b.telefone;
  if (tel !== undefined) tel = String(tel).replace(/\D/g, '').slice(0, 13); // só dígitos
  let retorno = b.data_retorno ?? b.dataRetorno;
  if (retorno !== undefined && retorno) {
    retorno = String(retorno).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(retorno)) retorno = null;
  }
  return {
    nome: cut(b.nome, 80), telefone: tel, email: cut(b.email, 120),
    origem: cut(b.origem, 30), interesse: cut(b.interesse, 40), status: cut(b.status, 40),
    responsavel_id: b.responsavel_id ?? b.responsavelId,
    valor_proposta: valor,
    servico: cut(b.servico, 80),
    data_retorno: retorno,
    observacoes: cut(b.observacoes, 600),
    motivo_perda: cut(b.motivo_perda ?? b.motivoPerda, 40),
    nascimento: b.nascimento === '' ? null : b.nascimento,
    endereco: cut(b.endereco, 160),
    bairro: cut(b.bairro, 60),
    responsavel_cliente: cut(b.responsavel_cliente ?? b.responsavelCliente, 80),
    setor: ['vacinas','consultas','terapias'].includes(b.setor) ? b.setor : undefined,
    tags: Array.isArray(b.tags) ? b.tags.slice(0, 10).map(t => String(t).slice(0, 20)) : b.tags,
  };
};

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
    if (['vacinas','consultas','terapias'].includes(req.query.setor)) { conditions.push(`COALESCE(l.setor,'vacinas') = $${pi++}`); params.push(req.query.setor); }
    if (origem)         { conditions.push(`l.origem = $${pi++}`);            params.push(origem); }
    if (tag)            { conditions.push(`$${pi++} = ANY(l.tags)`);         params.push(tag); }
    if (search) {
      conditions.push(`(l.nome ILIKE $${pi} OR l.telefone ILIKE $${pi} OR l.email ILIKE $${pi})`);
      params.push(`%${search}%`); pi++;
    }
    // Atendente only sees their own leads
    if (!['master', 'supervisor'].includes(req.user.role)) {
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

// ─── RETORNOS: agenda de follow-up ────────────────────────────────────────────
// Vencidos / hoje / próximos 7 dias — só leads em aberto (fora Fechado/Perdido)
r.get('/retornos', async (req, res) => {
  try {
    const uFilter = ['master','supervisor'].includes(req.user.role) ? '' : ` AND l.responsavel_id = '${req.user.id}'`;
    const { rows } = await query(`
      SELECT l.*, u.nome AS responsavel_nome, u.cor AS responsavel_cor,
        CASE
          WHEN l.data_retorno <  CURRENT_DATE THEN 'vencido'
          WHEN l.data_retorno =  CURRENT_DATE THEN 'hoje'
          ELSE 'proximo'
        END AS grupo
      FROM leads l
      LEFT JOIN usuarios u ON u.id = l.responsavel_id
      WHERE l.data_retorno IS NOT NULL
        AND l.status NOT IN ('Fechado','Perdido')
        AND l.data_retorno <= CURRENT_DATE + INTERVAL '7 days'
        ${uFilter}
      ORDER BY l.data_retorno, l.nome`);
    const guardRow = (row) => req.user.role === 'master' ? row : { ...row, valor_proposta: null };
    res.json({
      vencidos: rows.filter(r2 => r2.grupo === 'vencido').map(guardRow),
      hoje:     rows.filter(r2 => r2.grupo === 'hoje').map(guardRow),
      proximos: rows.filter(r2 => r2.grupo === 'proximo').map(guardRow),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Concluir o retorno (limpa a data) ou reagendar
r.patch('/:id/retorno', async (req, res) => {
  try {
    let { data_retorno } = req.body; // null = concluído
    if (data_retorno && !/^\d{4}-\d{2}-\d{2}$/.test(String(data_retorno).slice(0, 10))) {
      return res.status(400).json({ error: 'Data inválida' });
    }
    const { rows } = await query(
      'UPDATE leads SET data_retorno = $1, updated_at = NOW() WHERE id = $2 RETURNING id, data_retorno',
      [data_retorno ? String(data_retorno).slice(0, 10) : null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    socketEmit('funil_update', { tipo: 'lead', leadId: rows[0].id });
    res.json(rows[0]);
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

r.post('/colunas', masterOnly, async (req, res) => {
  try {
    const nome = String(req.body.nome || '').trim();
    const cor = req.body.cor || '#3b82f6';
    const setor = ['vacinas','consultas','terapias'].includes(req.body.setor) ? req.body.setor : 'vacinas';
    if (!nome) return res.status(400).json({ error: 'Nome da etapa é obrigatório' });
    const { rows: [dup] } = await query("SELECT 1 FROM funil_colunas WHERE LOWER(nome) = LOWER($1) AND COALESCE(setor,'vacinas') = $2", [nome, setor]);
    if (dup) return res.status(409).json({ error: 'Já existe uma etapa com esse nome neste setor' });
    const { rows: [{ max }] } = await query("SELECT COALESCE(MAX(ordem), -1) AS max FROM funil_colunas WHERE COALESCE(setor,'vacinas') = $1 AND ordem < 99", [setor]);
    const { rows: [col] } = await query(
      'INSERT INTO funil_colunas (nome, cor, ordem, setor) VALUES ($1, $2, $3, $4) RETURNING *',
      [nome, cor, parseInt(max) + 1, setor]
    );
    socketEmit('funil_update', { tipo: 'coluna' });
    res.status(201).json(col);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reordenar (antes de /colunas/:id para não casar "reorder" com :id)
r.patch('/colunas/reorder', masterOnly, async (req, res) => {
  try {
    const ids = req.body.ids || [];
    for (let i = 0; i < ids.length; i++) {
      await query('UPDATE funil_colunas SET ordem = $1 WHERE id = $2', [i, ids[i]]);
    }
    socketEmit('funil_update', { tipo: 'coluna' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/colunas/:id', masterOnly, async (req, res) => {
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
        await query("UPDATE leads SET status = $1 WHERE status = $2 AND COALESCE(setor,'vacinas') = COALESCE($3,'vacinas')", [novoNome, col.nome, col.setor]);
      }
      await query('COMMIT');
    } catch (e) { await query('ROLLBACK'); throw e; }
    socketEmit('funil_update', { tipo: 'coluna' });
    const { rows: [updated] } = await query('SELECT * FROM funil_colunas WHERE id = $1', [col.id]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/colunas/:id', masterOnly, async (req, res) => {
  try {
    const { rows: [col] } = await query('SELECT * FROM funil_colunas WHERE id = $1', [req.params.id]);
    if (!col) return res.status(404).json({ error: 'Etapa não encontrada' });
    if (col.fixa) return res.status(403).json({ error: `A etapa "${col.nome}" é usada nos relatórios e não pode ser excluída` });

    const { rows: [{ count }] } = await query("SELECT COUNT(*) AS count FROM leads WHERE status = $1 AND COALESCE(setor,'vacinas') = COALESCE($2,'vacinas')", [col.nome, col.setor]);
    const qtd = parseInt(count);

    // Etapa com leads: move todos para a etapa indicada (?moveTo=) ou a primeira
    let destino = null;
    if (qtd > 0) {
      const moveTo = String(req.query.moveTo || '').trim();
      if (moveTo) {
        const { rows: [d] } = await query("SELECT nome FROM funil_colunas WHERE nome = $1 AND id <> $2 AND COALESCE(setor,'vacinas') = COALESCE($3,'vacinas')", [moveTo, col.id, col.setor]);
        destino = d?.nome || null;
      }
      if (!destino) {
        const { rows: [d] } = await query("SELECT nome FROM funil_colunas WHERE id <> $1 AND COALESCE(setor,'vacinas') = COALESCE($2,'vacinas') ORDER BY ordem LIMIT 1", [col.id, col.setor]);
        destino = d?.nome;
      }
      if (!destino) return res.status(409).json({ error: 'Não há outra etapa para receber os leads' });
    }

    await query('BEGIN');
    try {
      if (qtd > 0) {
        await query("UPDATE leads SET status = $1, status_changed_at = NOW() WHERE status = $2 AND COALESCE(setor,'vacinas') = COALESCE($3,'vacinas')", [destino, col.nome, col.setor]);
      }
      await query('DELETE FROM funil_colunas WHERE id = $1', [col.id]);
      await query('COMMIT');
    } catch (e) { await query('ROLLBACK'); throw e; }

    socketEmit('funil_update', { tipo: 'coluna' });
    res.json({ ok: true, movidos: qtd, destino });
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
    // Só gestão atribui lead a outra pessoa; atendente cria sempre pra si
    const podeAtribuir = ['master', 'supervisor'].includes(req.user.role);
    const respId = (podeAtribuir && b.responsavel_id) ? b.responsavel_id : req.user.id;
    const valor = req.user.role === 'master' ? parseFloat(b.valor_proposta) || 0 : 0;
    // Permite criar o lead já numa etapa específica (criar direto na coluna do Kanban)
    let status = b.status;
    if (status) {
      const { rows: [ok] } = await query('SELECT 1 FROM funil_colunas WHERE nome = $1', [status]);
      if (!ok) status = null;
    }
    if (!status) {
      const setorPrimeira = b.setor || 'vacinas';
      const { rows: [primeira] } = await query("SELECT nome FROM funil_colunas WHERE COALESCE(setor,'vacinas') = $1 ORDER BY ordem LIMIT 1", [setorPrimeira]);
      status = primeira?.nome || 'Novo Lead';
    }

    const { rows } = await query(`
      INSERT INTO leads (nome, telefone, email, origem, interesse, status, responsavel_id, valor_proposta, servico, data_retorno, observacoes, tags, setor, status_changed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
      RETURNING *`,
      [nome, telefone, email, origem, interesse, status, respId, valor, b.servico || '', b.data_retorno || null, b.observacoes || '', b.tags || [], b.setor || 'vacinas']
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
    const { nome, telefone, email, origem, interesse, status, responsavel_id, valor_proposta, servico, data_retorno, observacoes, motivo_perda, tags, nascimento, endereco, bairro, responsavel_cliente } = normBody(req.body);
    const valor = req.user.role === 'master' && valor_proposta !== undefined ? parseFloat(valor_proposta) || 0 : undefined;

    const updates = [];
    const params = [];
    let pi = 1;
    let statusIdx = null;
    const set = (col, val) => { if (val !== undefined) { updates.push(`${col} = $${pi}`); params.push(val); if (col === 'status') statusIdx = pi; pi++; } };
    set('nome', nome); set('telefone', telefone); set('email', email);
    set('nascimento', nascimento); set('endereco', endereco); set('bairro', bairro); set('responsavel_cliente', responsavel_cliente);
    set('origem', origem); set('interesse', interesse); set('status', status);
    // Reatribuir lead a outra pessoa: só gestão (atendente não troca o responsável)
    if (['master', 'supervisor'].includes(req.user.role)) set('responsavel_id', responsavel_id);
    set('servico', servico);
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
    const { status } = req.body;
    let motivo = cut(req.body.motivo_perda, 60) || null;
    // Motivo de perda OBRIGATÓRIO: sem ele não se perde lead — é daqui que
    // sai o relatório de por que a clínica está perdendo vendas
    if (status === 'Perdido' && !motivo) {
      const { rows: [atual] } = await query('SELECT motivo_perda FROM leads WHERE id = $1', [req.params.id]);
      if (!atual?.motivo_perda) return res.status(400).json({ error: 'Informe o motivo da perda' });
      motivo = atual.motivo_perda;
    }
    if (status !== 'Perdido') motivo = null; // reativou: limpa o motivo antigo
    const { rows } = await query(
      `UPDATE leads SET status = $1, motivo_perda = $2,
         status_changed_at = CASE WHEN status IS DISTINCT FROM $1 THEN NOW() ELSE status_changed_at END,
         updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, motivo, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    socketEmit('funil_update', { tipo: 'lead', leadId: rows[0].id });

    // ── GAMIFICAÇÃO: confete na venda/consulta confirmada + marcos de meta ──
    try {
      const lead = rows[0];
      const setorL = lead.setor || 'vacinas';
      const quem = (req.user?.nome || 'Equipe').split(' ')[0];
      if (['Venda Fechada', 'Fechado'].includes(status)) {
        if (setorL === 'vacinas') {
          socketEmit('celebracao', { tipo: 'setor', setor: 'vacinas',
            titulo: 'Parabéns, Equipe de Vacinas!',
            texto: 'Mais uma família escolheu a Vittalis 💎' });
        } else {
          socketEmit('celebracao', { tipo: 'individual', userId: req.user?.id, setor: setorL,
            titulo: `Parabéns, ${quem}!`, texto: 'Você conseguiu! 🎊' });
        }
        if (setorL === 'vacinas') {
          const { rows: [cfgM] } = await query("SELECT valor FROM configuracoes WHERE chave = 'metas'");
          const metaMes = parseFloat(cfgM?.valor?.vacinas_mensal) || 200000;
          const { rows: [{ vendido }] } = await query(`
            SELECT COALESCE(SUM(valor_proposta),0) vendido FROM leads
            WHERE status IN ('Venda Fechada','Fechado') AND COALESCE(setor,'vacinas')='vacinas'
              AND date_trunc('month', status_changed_at) = date_trunc('month', NOW())`);
          const pct = (parseFloat(vendido) / metaMes) * 100;
          const mesKey = `marco_vacinas_${new Date().toISOString().slice(0, 7)}`;
          const { rows: [cfgMarco] } = await query('SELECT valor FROM configuracoes WHERE chave = $1', [mesKey]);
          const ultimo = parseInt(cfgMarco?.valor?.m) || 0;
          const MARCOS = [
            [100, '🏆 META ALCANÇADA!', 'Parabéns! A equipe de Vacinas bateu a meta do mês 🎊💎'],
            [75, '💪 75% da meta!', 'Estamos muito próximos — reta final!'],
            [50, '🚀 Metade da meta alcançada!', 'A equipe de Vacinas está voando!'],
            [25, '🎉 25% da meta!', 'Parabéns, Equipe — ótimo começo de mês!'],
          ];
          for (const [limite, titulo, texto] of MARCOS) {
            if (pct >= limite && ultimo < limite) {
              socketEmit('celebracao', { tipo: 'marco', setor: 'vacinas', titulo, texto, pct: Math.round(pct) });
              await query(`INSERT INTO configuracoes (chave, valor) VALUES ($1, $2)
                ON CONFLICT (chave) DO UPDATE SET valor = $2, updated_at = NOW()`,
                [mesKey, JSON.stringify({ m: limite })]);
              break;
            }
          }
        }
      }
      if (status === 'Consulta Confirmada' && setorL === 'consultas') {
        socketEmit('celebracao', { tipo: 'individual', userId: req.user?.id, setor: 'consultas',
          titulo: `Parabéns, ${quem}!`, texto: 'Consulta confirmada! 🎊' });
      }
    } catch (e) { console.error('celebracao:', e.message); }

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
