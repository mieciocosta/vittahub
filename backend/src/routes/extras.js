import express from 'express';
import { query } from '../db/pool.js';
import { auth, masterOnly } from '../middleware/auth.js';
import { socketEmit } from '../socketServer.js';

/* ─── FERRAMENTAS VITTAHUB ────────────────────────────────────────────────────
   Agenda · Programa de Indicações · Biblioteca de Experiências (fotos, vídeos,
   depoimentos, apresentações e figurinhas) · Registro de Ligações.            */

const r = express.Router();
r.use(auth);

const cut = (v, n) => (v == null ? null : String(v).slice(0, n));
const gestao = (req) => ['master', 'supervisor'].includes(req.user.role);

/* ═══ AGENDA ═════════════════════════════════════════════════════════════════ */
const AG_STATUS = ['Agendado', 'Confirmado', 'Realizado', 'Cancelado', 'Reagendado'];

r.get('/agenda', async (req, res) => {
  try {
    const data = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data : new Date().toISOString().slice(0, 10);
    const { rows } = await query(`
      SELECT a.*, u.nome resp_nome, u.avatar resp_avatar, u.cor resp_cor
      FROM agenda_eventos a LEFT JOIN usuarios u ON u.id = a.responsavel_id
      WHERE a.data = $1 ORDER BY a.hora, a.created_at`, [data]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/agenda', async (req, res) => {
  try {
    const b = req.body || {};
    const paciente = cut((b.paciente || '').trim(), 80);
    if (!paciente) return res.status(400).json({ error: 'Nome do paciente é obrigatório' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.data || '')) return res.status(400).json({ error: 'Data inválida' });
    if (!/^\d{2}:\d{2}$/.test(b.hora || '')) return res.status(400).json({ error: 'Hora inválida (HH:MM)' });
    const setor = ['vacinas', 'consultas', 'terapias'].includes(b.setor) ? b.setor : 'vacinas';
    const localLink = b.local_link && /^https?:\/\//i.test(b.local_link) ? cut(b.local_link, 300) : null;
    const email = b.email && /.+@.+\..+/.test(b.email) ? cut(b.email.trim(), 120) : null;
    const FORMAS = ['À vista', 'Pix', 'Débito', 'Crédito'];
    const valor = b.valor !== undefined && b.valor !== '' && !isNaN(parseFloat(b.valor))
      ? Math.max(0, Math.min(parseFloat(b.valor), 100000)) : null;
    const formaPag = FORMAS.includes(b.forma_pagamento) ? b.forma_pagamento : null;
    const { rows: [ev] } = await query(`
      INSERT INTO agenda_eventos (paciente, responsavel_nome, servico, data, hora, profissional, telefone, observacoes, status, setor, responsavel_id, lead_id, endereco, local_link, email, valor, forma_pagamento)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Agendado',$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [paciente, cut(b.responsavel_nome, 80), cut(b.servico, 80), b.data, b.hora,
       cut(b.profissional, 80), cut((b.telefone || '').replace(/\D/g, ''), 13),
       cut(b.observacoes, 300), setor, b.responsavel_id || req.user.id, b.lead_id || null,
       cut(b.endereco, 160), localLink, email, valor, formaPag]);
    socketEmit('agenda_update', { id: ev.id });
    res.status(201).json(ev);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/agenda/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const sets = [], params = []; let i = 1;
    const set = (campo, valor) => { sets.push(`${campo} = $${i++}`); params.push(valor); };
    if (b.paciente !== undefined) set('paciente', cut(b.paciente.trim(), 80));
    if (b.servico !== undefined) set('servico', cut(b.servico, 80));
    if (b.data !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(b.data)) set('data', b.data);
    if (b.hora !== undefined && /^\d{2}:\d{2}$/.test(b.hora)) set('hora', b.hora);
    if (b.profissional !== undefined) set('profissional', cut(b.profissional, 80));
    if (b.telefone !== undefined) set('telefone', cut(String(b.telefone).replace(/\D/g, ''), 13));
    if (b.observacoes !== undefined) set('observacoes', cut(b.observacoes, 300));
    if (b.status !== undefined && AG_STATUS.includes(b.status)) set('status', b.status);
    if (b.responsavel_id !== undefined) set('responsavel_id', b.responsavel_id || null);
    if (b.responsavel_nome !== undefined) set('responsavel_nome', cut(b.responsavel_nome, 80));
    if (b.endereco !== undefined) set('endereco', cut(b.endereco, 160));
    if (b.local_link !== undefined) set('local_link', b.local_link && /^https?:\/\//i.test(b.local_link) ? cut(b.local_link, 300) : null);
    if (b.email !== undefined) set('email', b.email && /.+@.+\..+/.test(b.email) ? cut(b.email.trim(), 120) : null);
    if (b.valor !== undefined) set('valor', b.valor === '' || isNaN(parseFloat(b.valor)) ? null : Math.max(0, Math.min(parseFloat(b.valor), 100000)));
    if (b.forma_pagamento !== undefined) set('forma_pagamento', ['À vista', 'Pix', 'Débito', 'Crédito'].includes(b.forma_pagamento) ? b.forma_pagamento : null);
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar' });
    params.push(req.params.id);
    const { rows: [ev] } = await query(`UPDATE agenda_eventos SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, params);
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    socketEmit('agenda_update', { id: ev.id });
    res.json(ev);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/agenda/:id', async (req, res) => {
  try {
    await query('DELETE FROM agenda_eventos WHERE id = $1', [req.params.id]);
    socketEmit('agenda_update', { id: req.params.id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ PROGRAMA DE INDICAÇÕES ═════════════════════════════════════════════════ */
const IND_STATUS = ['Cadastrada', 'Em atendimento', 'Orçamento enviado', 'Convertida', 'Não convertida'];
const PONTOS_PADRAO = { 'Plano Vacinal': 100, 'Pacote Infantil': 70, 'Pacote Adulto': 50, 'Vacina Avulsa': 20 };

r.get('/indicacoes', async (req, res) => {
  try {
    const [lista, cfg, estr] = await Promise.all([
      query('SELECT * FROM indicacoes ORDER BY created_at DESC LIMIT 300'),
      query("SELECT valor FROM configuracoes WHERE chave = 'indicacoes_pontos'"),
      query("SELECT valor FROM configuracoes WHERE chave = 'indicacoes_estrategias'"),
    ]);
    // Ranking + barra do Retroprojetor (3 Planos Vacinais por indicador)
    const porIndicador = {};
    for (const ind of lista.rows) {
      const k = ind.indicador_nome;
      porIndicador[k] = porIndicador[k] || { nome: k, telefone: ind.indicador_telefone, total: 0, convertidas: 0, pontos: 0, planos: 0 };
      porIndicador[k].total++;
      if (ind.status === 'Convertida') {
        porIndicador[k].convertidas++;
        porIndicador[k].pontos += ind.pontos || 0;
        if (ind.tipo_conversao === 'Plano Vacinal') porIndicador[k].planos++;
      }
    }
    const ranking = Object.values(porIndicador).sort((a, b) => b.convertidas - a.convertidas || b.pontos - a.pontos);
    res.json({
      indicacoes: lista.rows,
      ranking,
      pontos: cfg.rows[0]?.valor || PONTOS_PADRAO,
      estrategias: estr.rows[0]?.valor || {},
      resumo: {
        total: lista.rows.length,
        convertidas: lista.rows.filter(x => x.status === 'Convertida').length,
        premiosPendentes: lista.rows.filter(x => x.premio && !x.premio_entregue).length,
        premiosEntregues: lista.rows.filter(x => x.premio_entregue).length,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/indicacoes', async (req, res) => {
  try {
    const b = req.body || {};
    const indicador = cut((b.indicador_nome || '').trim(), 80);
    const indicado = cut((b.indicado_nome || '').trim(), 80);
    if (!indicador || !indicado) return res.status(400).json({ error: 'Informe quem indicou e quem foi indicado' });
    const { rows: [ind] } = await query(`
      INSERT INTO indicacoes (indicador_nome, indicador_telefone, indicado_nome, indicado_telefone, status, observacoes)
      VALUES ($1,$2,$3,$4,'Cadastrada',$5) RETURNING *`,
      [indicador, cut(String(b.indicador_telefone || '').replace(/\D/g, ''), 13),
       indicado, cut(String(b.indicado_telefone || '').replace(/\D/g, ''), 13), cut(b.observacoes, 200)]);
    res.status(201).json(ind);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/indicacoes/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const { rows: [atual] } = await query('SELECT * FROM indicacoes WHERE id = $1', [req.params.id]);
    if (!atual) return res.status(404).json({ error: 'Indicação não encontrada' });

    const status = IND_STATUS.includes(b.status) ? b.status : atual.status;
    let tipo = atual.tipo_conversao, pontos = atual.pontos, premio = atual.premio;

    if (status === 'Convertida') {
      tipo = Object.keys(PONTOS_PADRAO).includes(b.tipo_conversao) ? b.tipo_conversao : tipo;
      if (!tipo) return res.status(400).json({ error: 'Informe o tipo da conversão (Plano, Pacote, Avulsa…)' });
      const { rows: [cfg] } = await query("SELECT valor FROM configuracoes WHERE chave = 'indicacoes_pontos'");
      const tabela = cfg?.valor || PONTOS_PADRAO;
      pontos = parseInt(tabela[tipo]) || PONTOS_PADRAO[tipo] || 0;
      // Regras de prêmio da espec
      if (tipo === 'Plano Vacinal' || tipo === 'Pacote Infantil' || tipo === 'Pacote Adulto') {
        premio = b.premio === 'Voucher Cabana do Sol' ? 'Voucher Cabana do Sol' : 'Voucher Coco Bambu';
      }
    }
    const { rows: [ind] } = await query(`
      UPDATE indicacoes SET status=$1, tipo_conversao=$2, pontos=$3, premio=$4,
        premio_entregue = COALESCE($5, premio_entregue), observacoes = COALESCE($6, observacoes), updated_at = NOW()
      WHERE id = $7 RETURNING *`,
      [status, tipo, pontos, premio, b.premio_entregue, b.observacoes !== undefined ? cut(b.observacoes, 200) : null, req.params.id]);

    // 3 Planos Vacinais convertidos do mesmo indicador → Retroprojetor 🎥
    if (status === 'Convertida' && tipo === 'Plano Vacinal') {
      const { rows: [{ n }] } = await query(
        `SELECT COUNT(*) n FROM indicacoes WHERE indicador_nome = $1 AND status='Convertida' AND tipo_conversao='Plano Vacinal'`,
        [ind.indicador_nome]);
      if (parseInt(n) === 3) {
        socketEmit('celebracao', { tipo: 'marco', titulo: '🎥 Retroprojetor desbloqueado!', texto: `${ind.indicador_nome} converteu 3 Planos Vacinais por indicação!` });
        await query(`INSERT INTO notificacoes (tipo, titulo, texto) VALUES ('indicacao', $1, $2)`,
          ['🎥 Prêmio: Retroprojetor', `${ind.indicador_nome} completou 3 Planos Vacinais convertidos — registrar entrega do Retroprojetor.`]).catch(() => {});
      }
    }
    res.json(ind);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/indicacoes/:id', masterOnly, async (req, res) => {
  try { await query('DELETE FROM indicacoes WHERE id = $1', [req.params.id]); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Regras (pontos) e Estratégias do programa — campos editáveis pela gestão
r.put('/indicacoes-config', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Somente gestão' });
    const { pontos, estrategias } = req.body || {};
    if (pontos && typeof pontos === 'object') {
      const limpo = {};
      for (const k of Object.keys(PONTOS_PADRAO)) limpo[k] = Math.max(0, Math.min(parseInt(pontos[k]) || PONTOS_PADRAO[k], 10000));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('indicacoes_pontos', $1)
        ON CONFLICT (chave) DO UPDATE SET valor = $1, updated_at = NOW()`, [JSON.stringify(limpo)]);
    }
    if (estrategias && typeof estrategias === 'object') {
      const e = {
        objetivo: cut(estrategias.objetivo, 400) || '',
        publico: cut(estrategias.publico, 400) || '',
        convite: cut(estrategias.convite, 600) || '',
        canais: cut(estrategias.canais, 300) || '',
        observacoes: cut(estrategias.observacoes, 600) || '',
      };
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('indicacoes_estrategias', $1)
        ON CONFLICT (chave) DO UPDATE SET valor = $1, updated_at = NOW()`, [JSON.stringify(e)]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ BIBLIOTECA DE EXPERIÊNCIAS + FIGURINHAS ═══════════════════════════════ */
const MIDIA_TIPOS = ['foto', 'video', 'depoimento', 'apresentacao', 'figurinha'];

r.get('/biblioteca', async (req, res) => {
  try {
    const conds = [], params = []; let i = 1;
    if (MIDIA_TIPOS.includes(req.query.tipo)) { conds.push(`tipo = $${i++}`); params.push(req.query.tipo); }
    if (['vacinas', 'consultas', 'terapias', 'geral'].includes(req.query.setor)) { conds.push(`setor = $${i++}`); params.push(req.query.setor); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    // Lista SEM o base64 (leve); o dado pesado sai só no item
    const { rows } = await query(`SELECT id, titulo, tipo, setor, categoria, mime, octet_length(data) tamanho, created_at FROM biblioteca_midias ${where} ORDER BY created_at DESC LIMIT 200`, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/biblioteca/:id', async (req, res) => {
  try {
    const { rows: [m] } = await query('SELECT * FROM biblioteca_midias WHERE id = $1', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Mídia não encontrada' });
    res.json(m);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/biblioteca', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Upload é da gestão' });
    const b = req.body || {};
    const titulo = cut((b.titulo || '').trim(), 80);
    if (!titulo) return res.status(400).json({ error: 'Dê um título pra mídia' });
    if (!MIDIA_TIPOS.includes(b.tipo)) return res.status(400).json({ error: 'Tipo inválido' });
    if (typeof b.data !== 'string' || b.data.length < 100) return res.status(400).json({ error: 'Arquivo inválido' });
    const limite = b.tipo === 'video' ? 16_000_000 : 4_000_000; // base64: ~12MB vídeo / ~3MB imagem
    if (b.data.length > limite) return res.status(400).json({ error: `Arquivo muito grande (máx ${b.tipo === 'video' ? '12MB' : '3MB'})` });
    const setor = ['vacinas', 'consultas', 'terapias', 'geral'].includes(b.setor) ? b.setor : 'geral';
    const { rows: [m] } = await query(`
      INSERT INTO biblioteca_midias (titulo, tipo, setor, categoria, mime, data)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, titulo, tipo, setor, categoria, mime, created_at`,
      [titulo, b.tipo, setor, cut(b.categoria, 40), cut(b.mime, 60) || 'image/jpeg', b.data]);
    res.status(201).json(m);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/biblioteca/:id', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Somente gestão' });
    await query('DELETE FROM biblioteca_midias WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ LIGAÇÕES ═══════════════════════════════════════════════════════════════ */
const LIG_STATUS = ['Atendida', 'Não atendida', 'Caixa postal', 'Retornar'];

r.get('/ligacoes', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT lg.*, u.nome usuario_nome, u.avatar usuario_avatar
      FROM ligacoes lg LEFT JOIN usuarios u ON u.id = lg.usuario_id
      ORDER BY lg.created_at DESC LIMIT 200`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/ligacoes', async (req, res) => {
  try {
    const b = req.body || {};
    const contato = cut((b.contato_nome || '').trim(), 80);
    const tel = String(b.telefone || '').replace(/\D/g, '');
    if (!contato || tel.length < 10) return res.status(400).json({ error: 'Informe contato e telefone válidos' });
    const { rows: [lg] } = await query(`
      INSERT INTO ligacoes (contato_nome, telefone, usuario_id, direcao, status, duracao_min, observacoes)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [contato, cut(tel, 13), req.user.id, b.direcao === 'recebida' ? 'recebida' : 'realizada',
       LIG_STATUS.includes(b.status) ? b.status : 'Atendida',
       Math.max(0, Math.min(parseInt(b.duracao_min) || 0, 600)), cut(b.observacoes, 300)]);
    res.status(201).json(lg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/ligacoes/:id', async (req, res) => {
  try { await query('DELETE FROM ligacoes WHERE id = $1', [req.params.id]); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

export default r;
