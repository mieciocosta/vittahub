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
// Erro da IA — mostra só "IA inativa" (sem detalhe técnico)
const erroIA = () => 'IA inativa';

/* ═══ AGENDA ═════════════════════════════════════════════════════════════════ */
const AG_STATUS = ['Agendado', 'Confirmado', 'Realizado', 'Cancelado', 'Reagendado'];

r.get('/agenda', async (req, res) => {
  try {
    const data = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data : new Date().toISOString().slice(0, 10);
    const { rows } = await query(`
      SELECT a.*, u.nome resp_nome, u.avatar resp_avatar, u.cor resp_cor
      FROM agenda_eventos a LEFT JOIN usuarios u ON u.id = a.responsavel_id
      WHERE a.data = $1 ORDER BY a.hora, a.created_at`, [data]);
    // Motorista único: a colega do MESMO setor vê que o horário está OCUPADO
    // (pra não agendar em cima), mas SEM o contato do cliente da outra. Dona e
    // gestão veem tudo. Atendente só vê o macro-setor dela.
    // Cada setor tem a SUA agenda: a equipe de vacinas compartilha a agenda
    // entre si (motorista único) e vê tudo — precisa gerar o PDF completo (cliente,
    // vacina, pagamento, endereço) para as vacinadoras. Não compartilha com
    // consultas nem terapias, e vice-versa. Gestão vê tudo.
    const isGestao = ['master', 'supervisor'].includes(req.user.role);
    const meuSetor = req.user.setor;
    const meusSetores = Array.isArray(req.user.setores) && req.user.setores.length ? req.user.setores : null;
    const out = isGestao
      ? rows
      : meusSetores
        ? rows.filter(a => meusSetores.includes(a.setor || 'vacinas'))   // multi-setor (Danielle)
        : !meuSetor ? rows : rows.filter(a => (a.setor || 'vacinas') === meuSetor);
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Agendamentos vinculados a uma conversa (mostra no chat)
r.get('/agenda/conversa/:convId', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, paciente, servico, data, hora, status, setor, valor
       FROM agenda_eventos WHERE conversa_id = $1 ORDER BY data DESC, hora DESC LIMIT 50`,
      [req.params.convId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Meta de agendamentos do MÊS — por SETOR (vacinas/consultas/terapias): conta o
// que foi agendado, abate da meta do setor e devolve quanto falta. + por atendente.
const SETORES_META = ['vacinas', 'consultas', 'terapias'];
r.get('/agenda/meta', async (req, res) => {
  try {
    const ini = new Date(); ini.setDate(1); const iniStr = ini.toISOString().slice(0, 10);
    const fim = new Date(ini.getFullYear(), ini.getMonth() + 1, 1).toISOString().slice(0, 10);
    const [porSetor, porResp, cfg] = await Promise.all([
      query(`SELECT COALESCE(setor,'vacinas') setor, COUNT(*)::int n
              FROM agenda_eventos WHERE data >= $1 AND data < $2 AND status <> 'Cancelado'
              GROUP BY setor`, [iniStr, fim]),
      query(`SELECT COALESCE(responsavel_nome,'(sem nome)') nome, COUNT(*)::int n
              FROM agenda_eventos WHERE data >= $1 AND data < $2 AND status <> 'Cancelado'
              GROUP BY responsavel_nome ORDER BY n DESC`, [iniStr, fim]),
      query("SELECT valor FROM configuracoes WHERE chave = 'metas'"),
    ]);
    const metas = cfg.rows[0]?.valor?.agendamentos || {};
    const feitosPor = Object.fromEntries(porSetor.rows.map(r2 => [r2.setor, r2.n]));
    const setores = {};
    let totFeitos = 0, totAlvo = 0;
    for (const s of SETORES_META) {
      const feitos = feitosPor[s] || 0;
      const alvo = parseInt(metas[s]) || 0;
      setores[s] = { feitos, alvo, falta: Math.max(alvo - feitos, 0), pct: alvo ? +((feitos / alvo) * 100).toFixed(1) : null };
      totFeitos += feitos; totAlvo += alvo;
    }
    res.json({
      setores,
      total: { feitos: totFeitos, alvo: totAlvo, falta: Math.max(totAlvo - totFeitos, 0), pct: totAlvo ? +((totFeitos / totAlvo) * 100).toFixed(1) : null },
      // compat: campos antigos (total geral)
      feitos: totFeitos, alvo: totAlvo, pct: totAlvo ? +((totFeitos / totAlvo) * 100).toFixed(1) : null,
      porAtendente: porResp.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Define o alvo mensal de agendamentos POR SETOR (gestão)
r.put('/agenda/meta', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão pode alterar a meta.' });
    const b = req.body || {};
    const clamp = (v) => Math.max(0, Math.min(parseInt(v) || 0, 100000));
    const agend = {
      vacinas: clamp(b.vacinas), consultas: clamp(b.consultas), terapias: clamp(b.terapias),
    };
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('metas', jsonb_build_object('agendamentos', $1::jsonb))
                 ON CONFLICT (chave) DO UPDATE SET valor = jsonb_set(COALESCE(configuracoes.valor,'{}'::jsonb), '{agendamentos}', $1::jsonb), updated_at = NOW()`, [JSON.stringify(agend)]);
    res.json({ ok: true, agendamentos: agend });
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
    const parcelas = formaPag === 'Crédito' && b.parcelas ? Math.max(1, Math.min(parseInt(b.parcelas) || 1, 12)) : null;
    const { rows: [ev] } = await query(`
      INSERT INTO agenda_eventos (paciente, responsavel_nome, servico, data, hora, profissional, telefone, observacoes, status, setor, responsavel_id, lead_id, endereco, local_link, email, valor, forma_pagamento, parcelas, conversa_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Agendado',$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [paciente, cut(b.responsavel_nome, 80), cut(b.servico, 80), b.data, b.hora,
       cut(b.profissional, 80), cut((b.telefone || '').replace(/\D/g, ''), 13),
       cut(b.observacoes, 300), setor, b.responsavel_id || req.user.id, b.lead_id || null,
       cut(b.endereco, 160), localLink, email, valor, formaPag, parcelas, cut(b.conversa_id, 40)]);
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
    if (b.parcelas !== undefined || b.forma_pagamento !== undefined) set('parcelas', b.forma_pagamento === 'Crédito' && b.parcelas ? Math.max(1, Math.min(parseInt(b.parcelas) || 1, 12)) : null);
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

/* ═══ VENDAS (espinha comercial) ═════════════════════════════════════════════ */
const CATEGORIAS_VENDA = ['Vacinação Geral', 'Plano Vacinal', 'Fidelidade Mensal', 'Consulta', 'Terapia'];
const FORMAS_PG = ['Pix', 'Cartão', 'Dinheiro', 'Link de pagamento', 'Parcelado', 'Cortesia'];
const STATUS_PG = ['pago', 'sinal', 'aguardando', 'parcelado', 'cortesia', 'pendente'];
const setorDaCategoria = (cat) => ['Vacinação Geral', 'Plano Vacinal', 'Fidelidade Mensal'].includes(cat) ? 'vacinas'
  : cat === 'Consulta' ? 'consultas' : cat === 'Terapia' ? 'terapias' : null;

// Registrar venda
r.post('/vendas', async (req, res) => {
  try {
    const b = req.body || {};
    console.log(`VENDA POST recebida: categoria=${b.categoria} valor=${b.valor} por=${req.user?.nome}`);
    const categoria = CATEGORIAS_VENDA.includes(b.categoria) ? b.categoria : null;
    if (!categoria) return res.status(400).json({ error: 'Escolha a categoria da venda.' });
    const valor = b.valor !== undefined && b.valor !== '' && !isNaN(parseFloat(b.valor)) ? Math.max(0, Math.min(parseFloat(b.valor), 1000000)) : 0;
    const desconto = b.desconto !== undefined && !isNaN(parseFloat(b.desconto)) ? Math.max(0, Math.min(parseFloat(b.desconto), 1000000)) : 0;
    const setor = ['vacinas', 'consultas', 'terapias'].includes(b.setor) ? b.setor : setorDaCategoria(categoria);
    // Atribuição ao ATENDENTE dono do atendimento: se a venda veio de uma conversa,
    // credita ao responsável dela (quem cuidou do cliente) e não a quem clicou em
    // registrar (ex.: o master lançando pela equipe). Sem conversa/responsável,
    // fica com quem registrou. Um atendente_id explícito no corpo tem prioridade.
    let atendenteId = req.user.id, atendenteNome = req.user.nome;
    if (b.conversa_id) {
      const { rows: [c] } = await query(
        `SELECT u.id, u.nome FROM conversas c JOIN usuarios u ON u.id = c.responsavel_id WHERE c.id = $1`,
        [cut(b.conversa_id, 40)]);
      if (c) { atendenteId = c.id; atendenteNome = c.nome; }
    }
    const { rows: [v] } = await query(`
      INSERT INTO vendas (conversa_id, lead_id, atendente_id, atendente_nome, setor, categoria, cliente_nome, paciente_nome, servico, valor, desconto, forma_pagamento, status_pagamento, data_venda, data_atendimento, origem, observacao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14,CURRENT_DATE),$15,$16,$17) RETURNING *`,
      [cut(b.conversa_id, 40), b.lead_id || null, atendenteId, atendenteNome, setor, categoria,
       cut(b.cliente_nome, 80), cut(b.paciente_nome, 80), cut(b.servico, 120), valor, desconto,
       FORMAS_PG.includes(b.forma_pagamento) ? b.forma_pagamento : null,
       STATUS_PG.includes(b.status_pagamento) ? b.status_pagamento : 'pago',
       /^\d{4}-\d{2}-\d{2}$/.test(b.data_venda || '') ? b.data_venda : null,
       /^\d{4}-\d{2}-\d{2}$/.test(b.data_atendimento || '') ? b.data_atendimento : null,
       cut(b.origem, 40), cut(b.observacao, 300)]);
    socketEmit('venda_registrada', { id: v.id, setor, valor });
    console.log(`VENDA OK: ${categoria} R$${valor} (id=${v.id})`);
    res.status(201).json(v);
  } catch (err) { console.error('VENDA ERRO:', err.message); res.status(500).json({ error: err.message }); }
});

// Placar do dia (motivacional): quantas vendas a equipe fechou HOJE. O VALOR em
// R$ só vai para a gestão (regra do painel comercial); a contagem é pra todos.
r.get('/vendas/hoje', async (req, res) => {
  try {
    const podeValor = gestao(req);
    const { rows: [r2] } = await query(
      `SELECT COUNT(*)::int n,
              COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float total
       FROM vendas WHERE data_venda = CURRENT_DATE`);
    // Campeã(o) do dia — quem mais fechou hoje. Só pra gestão (nomeia pessoas).
    let campeao = null;
    if (podeValor) {
      const { rows: [c] } = await query(
        `SELECT COALESCE(atendente_nome,'—') nome, COUNT(*)::int n,
                COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float total
         FROM vendas WHERE data_venda = CURRENT_DATE
         GROUP BY atendente_nome ORDER BY n DESC, total DESC LIMIT 1`);
      if (c && c.n > 0) campeao = c;
    }
    res.json({ n: r2?.n || 0, total: podeValor ? (r2?.total || 0) : null, campeao });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Meta GLOBAL do setor do mês — visível pra TODA a equipe (clima de time). Cada
// um vê a meta do seu setor; master/sem setor vê a geral (todos os setores).
r.get('/meta-setor', async (req, res) => {
  try {
    const { rows: cfg } = await query("SELECT valor FROM configuracoes WHERE chave = 'metas'");
    const metaV = cfg[0]?.valor?.vendas || {};
    const mesCol = "to_char(data_venda,'YYYY-MM') = to_char(NOW(),'YYYY-MM')";
    const METfilter = "status_pagamento IN ('pago','cortesia')";
    const META_GLOBAL = 500000; // meta global do setor (bônus) — mostrada no atendimento
    // Setores do usuário (autoridade: banco — evita token velho). Multi-setor separa.
    const { rows: [u] } = await query('SELECT setor, setores FROM usuarios WHERE id = $1', [req.user.id]);
    let setores = [];
    if (u && Array.isArray(u.setores) && u.setores.length) setores = u.setores.filter(s => ['vacinas', 'consultas', 'terapias'].includes(s));
    else if (u && ['vacinas', 'consultas', 'terapias'].includes(u.setor)) setores = [u.setor];
    const confDe = async (s) => {
      const { rows: [r2] } = await query(`SELECT COALESCE(SUM(valor) FILTER (WHERE ${METfilter}),0)::float conf FROM vendas WHERE COALESCE(setor,'vacinas') = $1 AND ${mesCol}`, [s]);
      const meta = parseFloat(metaV[s]) || 0, conf = r2?.conf || 0;
      return { setor: s, confirmado: conf, meta, pct: meta ? +((conf / meta) * 100).toFixed(1) : 0, falta: Math.max(meta - conf, 0),
        metaGlobal: META_GLOBAL, pctGlobal: +((conf / META_GLOBAL) * 100).toFixed(1), faltaGlobal: Math.max(META_GLOBAL - conf, 0) };
    };
    if (setores.length) {
      const porSetor = [];
      for (const s of setores) porSetor.push(await confDe(s));
      // Topo = primeiro setor (compat com quem lê os campos direto); porSetor separa cada um.
      return res.json({ ...porSetor[0], porSetor, multi: porSetor.length > 1 });
    }
    // Master / sem setor → mostra CADA setor separado (cada um tem sua meta e produção);
    // nada de "Geral" que mistura vacinas com consultas/terapias.
    const porSetor = [];
    for (const s of ['vacinas', 'consultas', 'terapias']) porSetor.push(await confDe(s));
    res.json({ ...porSetor[0], porSetor, multi: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Planejamento (líder/gestão): progresso do setor rumo à meta de bônus (R$ 500k).
r.get('/planejamento', async (req, res) => {
  try {
    if (!(gestao(req) || req.user.lider)) return res.status(403).json({ error: 'Acesso restrito.' });
    const setor = ['vacinas', 'consultas', 'terapias'].includes(req.user.setor) ? req.user.setor : 'vacinas';
    const { rows: [r2] } = await query(
      `SELECT COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float confirmado
       FROM vendas WHERE COALESCE(setor,'vacinas') = $1 AND to_char(data_venda,'YYYY-MM') = to_char(NOW(),'YYYY-MM')`, [setor]);
    const meta = 500000, conf = r2?.confirmado || 0;
    res.json({ setor, confirmado: conf, meta, pct: +((conf / meta) * 100).toFixed(1), falta: Math.max(meta - conf, 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── Planejamento: estratégias, notas e lembretes (do líder/gestão) ───────────
   Cada líder organiza o próprio planejamento: cria estratégias, blocos de notas
   e lembretes com data. Pessoal — cada um vê os seus. */
const PLAN_TIPOS = ['estrategia', 'nota', 'lembrete'];
const podePlan = (req) => gestao(req) || req.user.lider;

r.get('/planejamento/notas', async (req, res) => {
  try {
    if (!podePlan(req)) return res.status(403).json({ error: 'Acesso restrito.' });
    const { rows } = await query(
      `SELECT * FROM planejamento_notas WHERE usuario_id = $1
       ORDER BY concluido ASC, COALESCE(lembrete_em, '9999-12-31') ASC, created_at DESC`, [req.user.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/planejamento/notas', async (req, res) => {
  try {
    if (!podePlan(req)) return res.status(403).json({ error: 'Acesso restrito.' });
    const b = req.body || {};
    const tipo = PLAN_TIPOS.includes(b.tipo) ? b.tipo : 'nota';
    if (!String(b.titulo || '').trim() && !String(b.conteudo || '').trim()) return res.status(400).json({ error: 'Escreva um título ou conteúdo.' });
    const lembrete = /^\d{4}-\d{2}-\d{2}$/.test(b.lembrete_em || '') ? b.lembrete_em : null;
    const { rows: [n] } = await query(
      `INSERT INTO planejamento_notas (usuario_id, tipo, titulo, conteudo, lembrete_em)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, tipo, cut(b.titulo, 160), cut(b.conteudo, 4000), lembrete]);
    res.status(201).json(n);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/planejamento/notas/:id', async (req, res) => {
  try {
    if (!podePlan(req)) return res.status(403).json({ error: 'Acesso restrito.' });
    const b = req.body || {};
    const sets = [], params = []; let i = 1;
    const set = (c, v) => { sets.push(`${c} = $${i++}`); params.push(v); };
    if (b.tipo !== undefined && PLAN_TIPOS.includes(b.tipo)) set('tipo', b.tipo);
    if (b.titulo !== undefined) set('titulo', cut(b.titulo, 160));
    if (b.conteudo !== undefined) set('conteudo', cut(b.conteudo, 4000));
    if (b.lembrete_em !== undefined) set('lembrete_em', /^\d{4}-\d{2}-\d{2}$/.test(b.lembrete_em || '') ? b.lembrete_em : null);
    if (b.concluido !== undefined) set('concluido', !!b.concluido);
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    params.push(req.user.id, req.params.id);
    const { rows: [n] } = await query(
      `UPDATE planejamento_notas SET ${sets.join(', ')}, updated_at = NOW() WHERE usuario_id = $${i++} AND id = $${i} RETURNING *`, params);
    if (!n) return res.status(404).json({ error: 'Não encontrado.' });
    res.json(n);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/planejamento/notas/:id', async (req, res) => {
  try {
    if (!podePlan(req)) return res.status(403).json({ error: 'Acesso restrito.' });
    await query('DELETE FROM planejamento_notas WHERE usuario_id = $1 AND id = $2', [req.user.id, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── Liderados: o líder cadastra sua equipe e vê o que cada um fez no dia ──────
   Proatividade (mensagens, atendimentos, ações), presença e metas (vendas). */

// Usuários que o líder pode adicionar (ainda não são liderados dele)
r.get('/planejamento/liderados/disponiveis', async (req, res) => {
  try {
    if (!podePlan(req)) return res.status(403).json({ error: 'Acesso restrito.' });
    const { rows } = await query(
      `SELECT id, nome, setor, avatar, cor, lider_id FROM usuarios
       WHERE id <> $1 AND role <> 'master' AND ativo IS NOT FALSE
       ORDER BY nome`, [req.user.id]);
    res.json(rows.map(u => ({ ...u, jaLiderado: u.lider_id === req.user.id, temOutroLider: u.lider_id && u.lider_id !== req.user.id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/planejamento/liderados', async (req, res) => {
  try {
    if (!podePlan(req)) return res.status(403).json({ error: 'Acesso restrito.' });
    const uid = String((req.body || {}).usuario_id || '');
    if (!uid || uid === req.user.id) return res.status(400).json({ error: 'Selecione um liderado válido.' });
    const { rows: [u] } = await query(`UPDATE usuarios SET lider_id = $1 WHERE id = $2 AND role <> 'master' RETURNING id, nome`, [req.user.id, uid]);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.status(201).json({ ok: true, id: u.id, nome: u.nome });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/planejamento/liderados/:usuarioId', async (req, res) => {
  try {
    if (!podePlan(req)) return res.status(403).json({ error: 'Acesso restrito.' });
    await query('UPDATE usuarios SET lider_id = NULL WHERE id = $1 AND lider_id = $2', [req.params.usuarioId, req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Define a meta individual mensal (R$) de um liderado
r.patch('/planejamento/liderados/:usuarioId/meta', async (req, res) => {
  try {
    if (!podePlan(req)) return res.status(403).json({ error: 'Acesso restrito.' });
    const meta = Math.max(0, Math.min(parseFloat((req.body || {}).meta) || 0, 100000000));
    const cond = gestao(req) ? '' : ' AND lider_id = $3';
    const params = gestao(req) ? [meta, req.params.usuarioId] : [meta, req.params.usuarioId, req.user.id];
    const { rows: [u] } = await query(`UPDATE usuarios SET meta_mensal = $1 WHERE id = $2${cond} RETURNING id, meta_mensal`, params);
    if (!u) return res.status(404).json({ error: 'Liderado não encontrado.' });
    res.json({ ok: true, id: u.id, meta_mensal: parseFloat(u.meta_mensal) || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Painel dos liderados: o que cada um fez HOJE + resultado do mês
r.get('/planejamento/liderados', async (req, res) => {
  try {
    if (!podePlan(req)) return res.status(403).json({ error: 'Acesso restrito.' });
    const { rows: liderados } = await query(
      `SELECT id, nome, setor, avatar, cor, COALESCE(meta_mensal,0)::float meta_mensal FROM usuarios WHERE lider_id = $1 ORDER BY nome`, [req.user.id]);
    if (!liderados.length) return res.json([]);
    const ids = liderados.map(u => u.id);
    const mes = new Date().toISOString().slice(0, 7);
    const [vHoje, vMes, msgs, acoes, pres] = await Promise.all([
      query(`SELECT atendente_id, COUNT(*)::int n, COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float v
             FROM vendas WHERE atendente_id = ANY($1) AND data_venda = CURRENT_DATE GROUP BY atendente_id`, [ids]),
      query(`SELECT atendente_id, COUNT(*)::int n, COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float v
             FROM vendas WHERE atendente_id = ANY($1) AND to_char(data_venda,'YYYY-MM') = $2 GROUP BY atendente_id`, [ids, mes]),
      query(`SELECT sender_id, COUNT(*)::int n, COUNT(DISTINCT conversa_id)::int convs
             FROM mensagens WHERE sender_id = ANY($1) AND from_type = 'me' AND created_at::date = CURRENT_DATE GROUP BY sender_id`, [ids]),
      query(`SELECT usuario_id, COUNT(*)::int n FROM audit_logs WHERE usuario_id = ANY($1) AND created_at::date = CURRENT_DATE GROUP BY usuario_id`, [ids]),
      query(`SELECT usuario_id, ultimo_heartbeat, pagina FROM presenca WHERE usuario_id = ANY($1)`, [ids]),
    ]);
    const map = (rows, key = 'atendente_id') => Object.fromEntries(rows.map(r2 => [r2[key], r2]));
    const mVHoje = map(vHoje.rows), mVMes = map(vMes.rows), mMsgs = map(msgs.rows, 'sender_id'), mAcoes = map(acoes.rows, 'usuario_id'), mPres = map(pres.rows, 'usuario_id');
    const agora = Date.now();
    const out = liderados.map(u => {
      const pr = mPres[u.id];
      const hb = pr?.ultimo_heartbeat ? new Date(pr.ultimo_heartbeat).getTime() : 0;
      const online = hb && (agora - hb) < 5 * 60 * 1000;
      const msgsHoje = mMsgs[u.id]?.n || 0, convsHoje = mMsgs[u.id]?.convs || 0, acoesHoje = mAcoes[u.id]?.n || 0;
      // Proatividade simples (0-100): pondera mensagens, atendimentos e ações do dia
      const prot = Math.min(100, Math.round(msgsHoje * 2 + convsHoje * 6 + acoesHoje * 1.5));
      return {
        id: u.id, nome: u.nome, setor: u.setor, avatar: u.avatar, cor: u.cor,
        online, ultima_atividade: pr?.ultimo_heartbeat || null, pagina: pr?.pagina || null,
        hoje: { mensagens: msgsHoje, atendimentos: convsHoje, acoes: acoesHoje, vendas: mVHoje[u.id]?.n || 0, vendas_valor: mVHoje[u.id]?.v || 0 },
        mes: { vendas: mVMes[u.id]?.n || 0, vendas_valor: mVMes[u.id]?.v || 0 },
        meta_mensal: u.meta_mensal || 0,
        meta_pct: u.meta_mensal > 0 ? +(((mVMes[u.id]?.v || 0) / u.meta_mensal) * 100).toFixed(1) : null,
        proatividade: prot,
      };
    });
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── QUIZ DIÁRIO DE VENDAS (gamificação) ──────────────────────────────────────
   Cada dia, um quiz de perguntas e respostas sobre vendas no contexto do setor.
   Gerado por IA, com pontuação. Objetivo: a equipe se aperfeiçoar em vendas. */
const setorQuiz = (req) => ['vacinas', 'consultas', 'terapias'].includes(req.user.setor) ? req.user.setor : 'geral';
const CTX_SETOR = {
  vacinas: 'vacinação infantil e adulta, planos vacinais, aplicação domiciliar',
  consultas: 'consultas pediátricas e especializadas, agendamento com profissionais',
  terapias: 'terapias (fono, psico, TO, etc.), pacotes de sessões',
  geral: 'saúde, vacinas, consultas e terapias',
};

// Quiz de reserva (sempre disponível se a IA falhar) — vendas no WhatsApp da clínica
const FALLBACK_QUIZ = [
  { q: 'A cliente diz "tá caro". Qual a melhor resposta?', opcoes: ['"É esse preço, não tem desconto."', '"Entendo! Posso te mostrar tudo o que está incluso pra ver se faz sentido pra você?"', '"Todo mundo acha caro no começo."', '"Então deixa pra lá."'], correta: 1, explicacao: 'Acolher a objeção e mostrar valor abre a conversa, em vez de encerrá-la.' },
  { q: 'A cliente sumiu depois de receber o orçamento. O que fazer?', opcoes: ['Esperar ela voltar sozinha.', 'Mandar um follow-up gentil, lembrando e se colocando à disposição.', 'Reenviar o mesmo orçamento sem contexto.', 'Cobrar uma resposta.'], correta: 1, explicacao: 'Follow-up gentil recupera muitas vendas; o silêncio raramente vira compra sozinho.' },
  { q: 'Qual a melhor forma de começar um atendimento?', opcoes: ['Já mandar a tabela de preços.', 'Cumprimentar pelo nome e entender a necessidade antes de oferecer.', 'Perguntar só "o que você quer?".', 'Colar uma mensagem padrão fria.'], correta: 1, explicacao: 'Entender a necessidade personaliza a oferta e aumenta a conversão.' },
  { q: 'A cliente está indecisa entre dois serviços. Você:', opcoes: ['Escolhe por ela sem explicar.', 'Explica a diferença e recomenda o que melhor atende o caso dela.', 'Diz "tanto faz".', 'Manda ela pesquisar sozinha.'], correta: 1, explicacao: 'Orientar com clareza gera confiança e ajuda a cliente a decidir.' },
  { q: 'A cliente pede desconto. A resposta mais estratégica é:', opcoes: ['Dar o maior desconto possível na hora.', 'Entender o contexto e oferecer uma condição/combo, mantendo o valor percebido.', 'Recusar de forma seca.', 'Ignorar o pedido.'], correta: 1, explicacao: 'Negociar com combo/condição preserva a margem e o valor percebido do serviço.' },
];

async function gerarQuizIA(setor) {
  if (!process.env.OPENAI_API_KEY) return FALLBACK_QUIZ;
  try {
    const { default: fetch } = await import('node-fetch');
    const ctx = CTX_SETOR[setor] || CTX_SETOR.geral;
    const sys = 'Você é um treinador de vendas de uma clínica de saúde (Vittalis Saúde) que cria quizzes curtos e práticos para as atendentes venderem melhor no WhatsApp. Responda APENAS um JSON válido, em português do Brasil.';
    const user = `Crie um quiz de 5 perguntas de múltipla escolha sobre VENDAS no dia a dia de uma atendente do setor de ${ctx}. As situações devem parecer conversas reais de WhatsApp (cliente com dúvida de preço, objeção, indecisão, pedido de desconto, etc.). Cada pergunta com 4 alternativas, só UMA correta, e uma explicação curta do porquê. Varie a dificuldade. Formato EXATO:
{"perguntas":[{"q":"pergunta","opcoes":["a","b","c","d"],"correta":0,"explicacao":"por que essa é a melhor"}]}`;
    const body = { model: 'gpt-4o-mini', max_tokens: 1400, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] };
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || 'Erro na IA');
    let p = null;
    try { p = JSON.parse(d.choices?.[0]?.message?.content || '{}'); } catch {}
    const perguntas = (p?.perguntas || [])
      .map(x => {
        if (!x || !x.q || !Array.isArray(x.opcoes) || x.opcoes.length < 2) return null;
        let correta = parseInt(x.correta); if (!Number.isInteger(correta)) correta = 0;
        const opcoes = x.opcoes.slice(0, 4).map(o => String(o).slice(0, 200));
        return { q: String(x.q).slice(0, 300), opcoes, correta: Math.max(0, Math.min(correta, opcoes.length - 1)), explicacao: String(x.explicacao || '').slice(0, 300) };
      })
      .filter(Boolean).slice(0, 5);
    if (perguntas.length < 3) throw new Error('Quiz insuficiente');
    return perguntas;
  } catch (e) {
    console.error('QUIZ IA falhou, usando fallback:', e.message);
    return FALLBACK_QUIZ; // nunca deixa o quiz sem carregar
  }
}

// Busca (ou gera) o quiz de HOJE do setor + estado do usuário (já respondeu?)
r.get('/quiz/hoje', async (req, res) => {
  try {
    const setor = setorQuiz(req);
    let { rows } = await query(`SELECT perguntas FROM quiz_diario WHERE data = CURRENT_DATE AND setor = $1`, [setor]);
    if (!rows.length) {
      const perguntas = await gerarQuizIA(setor); // sempre retorna (IA ou fallback)
      await query(`INSERT INTO quiz_diario (data, setor, perguntas) VALUES (CURRENT_DATE, $1, $2::jsonb) ON CONFLICT (data, setor) DO NOTHING`, [setor, JSON.stringify(perguntas)]);
      ({ rows } = await query(`SELECT perguntas FROM quiz_diario WHERE data = CURRENT_DATE AND setor = $1`, [setor]));
    }
    const perguntas = rows[0].perguntas || [];
    const { rows: resp } = await query(`SELECT score, acertos, total, respostas FROM quiz_respostas WHERE usuario_id = $1 AND data = CURRENT_DATE`, [req.user.id]);
    // Nunca envia a resposta correta antes de responder
    const semGabarito = perguntas.map(p => ({ q: p.q, opcoes: p.opcoes }));
    res.json({
      setor, total: perguntas.length, perguntas: semGabarito,
      jaRespondeu: resp.length > 0,
      resultado: resp.length ? { score: resp[0].score, acertos: resp[0].acertos, total: resp[0].total, respostas: resp[0].respostas, gabarito: perguntas.map(p => ({ correta: p.correta, explicacao: p.explicacao })) } : null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Responde o quiz de hoje → corrige e pontua
r.post('/quiz/responder', async (req, res) => {
  try {
    const setor = setorQuiz(req);
    const { rows } = await query(`SELECT perguntas FROM quiz_diario WHERE data = CURRENT_DATE AND setor = $1`, [setor]);
    if (!rows.length) return res.status(400).json({ error: 'Quiz de hoje não encontrado.' });
    const { rows: ja } = await query(`SELECT score, acertos, total, respostas FROM quiz_respostas WHERE usuario_id = $1 AND data = CURRENT_DATE`, [req.user.id]);
    const perguntas = rows[0].perguntas || [];
    const gabarito = perguntas.map(p => ({ correta: p.correta, explicacao: p.explicacao }));
    if (ja.length) return res.json({ jaRespondeu: true, score: ja[0].score, acertos: ja[0].acertos, total: ja[0].total, respostas: ja[0].respostas, gabarito });
    const marcadas = Array.isArray((req.body || {}).respostas) ? req.body.respostas : [];
    let acertos = 0;
    perguntas.forEach((p, i) => { if (marcadas[i] === p.correta) acertos++; });
    const total = perguntas.length, score = total ? Math.round((acertos / total) * 100) : 0;
    await query(`INSERT INTO quiz_respostas (usuario_id, usuario_nome, data, setor, score, acertos, total, respostas)
                 VALUES ($1,$2,CURRENT_DATE,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (usuario_id, data) DO NOTHING`,
      [req.user.id, req.user.nome, setor, score, acertos, total, JSON.stringify(marcadas)]);
    res.json({ score, acertos, total, respostas: marcadas, gabarito });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Status pro aviso "chegou a hora do quiz" (badge) + ranking simples do dia
r.get('/quiz/status', async (req, res) => {
  try {
    const { rows } = await query(`SELECT 1 FROM quiz_respostas WHERE usuario_id = $1 AND data = CURRENT_DATE`, [req.user.id]);
    res.json({ pendente: rows.length === 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/quiz/ranking', async (req, res) => {
  try {
    const { rows } = await query(`SELECT usuario_nome nome, score, acertos, total FROM quiz_respostas WHERE data = CURRENT_DATE ORDER BY score DESC, created_at ASC LIMIT 20`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── MEU PAINEL: mural pessoal (notas, tarefas e documentos) ───────────────────
   Cada um monta o seu mural. Privado por usuário. */
const PAINEL_TIPOS = ['nota', 'tarefa', 'documento'];
r.get('/painel', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, tipo, titulo, conteudo, filename, mimetype, concluido, ordem, created_at,
              (arquivo IS NOT NULL) AS tem_arquivo
       FROM painel_itens WHERE usuario_id = $1 ORDER BY ordem, created_at DESC`, [req.user.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/painel/:id/download', async (req, res) => {
  try {
    const { rows: [it] } = await query(`SELECT arquivo, filename, mimetype FROM painel_itens WHERE id = $1 AND usuario_id = $2`, [req.params.id, req.user.id]);
    if (!it || !it.arquivo) return res.status(404).json({ error: 'Arquivo não encontrado.' });
    res.json({ arquivo: it.arquivo, filename: it.filename, mimetype: it.mimetype });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/painel', async (req, res) => {
  try {
    const b = req.body || {};
    const tipo = PAINEL_TIPOS.includes(b.tipo) ? b.tipo : 'nota';
    if (tipo === 'documento') {
      if (typeof b.arquivo !== 'string' || !b.arquivo.startsWith('data:')) return res.status(400).json({ error: 'Envie o documento.' });
      if (b.arquivo.length > 16 * 1024 * 1024) return res.status(413).json({ error: 'Documento muito grande (máx. ~12MB).' });
    } else if (!String(b.titulo || '').trim() && !String(b.conteudo || '').trim()) {
      return res.status(400).json({ error: 'Escreva um título ou conteúdo.' });
    }
    const { rows: [it] } = await query(
      `INSERT INTO painel_itens (usuario_id, tipo, titulo, conteudo, arquivo, filename, mimetype)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, tipo, titulo, conteudo, filename, mimetype, concluido, ordem, created_at, (arquivo IS NOT NULL) AS tem_arquivo`,
      [req.user.id, tipo, cut(b.titulo, 200), cut(b.conteudo, 8000), tipo === 'documento' ? b.arquivo : null, cut(b.filename, 160), cut(b.mimetype, 80)]);
    res.status(201).json(it);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/painel/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const sets = [], params = []; let i = 1;
    const set = (c, v) => { sets.push(`${c} = $${i++}`); params.push(v); };
    if (b.titulo !== undefined) set('titulo', cut(b.titulo, 200));
    if (b.conteudo !== undefined) set('conteudo', cut(b.conteudo, 8000));
    if (b.concluido !== undefined) set('concluido', !!b.concluido);
    if (b.ordem !== undefined) set('ordem', parseInt(b.ordem) || 0);
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    params.push(req.user.id, req.params.id);
    const { rows: [it] } = await query(
      `UPDATE painel_itens SET ${sets.join(', ')}, updated_at = NOW() WHERE usuario_id = $${i++} AND id = $${i}
       RETURNING id, tipo, titulo, conteudo, filename, mimetype, concluido, ordem, created_at, (arquivo IS NOT NULL) AS tem_arquivo`, params);
    if (!it) return res.status(404).json({ error: 'Não encontrado.' });
    res.json(it);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/painel/:id', async (req, res) => {
  try {
    await query(`DELETE FROM painel_itens WHERE id = $1 AND usuario_id = $2`, [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── ARQUIVOS DAS ABAS (PDF/Word/imagem dentro de cada pasta) ─────────────────── */
const CHAVES_PASTA = ['fidelidade', 'banco_dados', 'planos_vacinais', 'vacinacao', 'consultas', 'terapias'];
r.get('/pasta-arquivos', async (req, res) => {
  try {
    const chave = String(req.query.chave || '');
    if (!CHAVES_PASTA.includes(chave)) return res.status(400).json({ error: 'Aba inválida.' });
    const { rows } = await query(`SELECT id, nome, mimetype, criado_por, created_at FROM pasta_arquivos WHERE chave = $1 ORDER BY created_at DESC`, [chave]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/pasta-arquivos/:id/download', async (req, res) => {
  try {
    const { rows: [a] } = await query(`SELECT arquivo, nome, mimetype FROM pasta_arquivos WHERE id = $1`, [req.params.id]);
    if (!a) return res.status(404).json({ error: 'Arquivo não encontrado.' });
    res.json({ arquivo: a.arquivo, nome: a.nome, mimetype: a.mimetype });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/pasta-arquivos', async (req, res) => {
  try {
    const b = req.body || {};
    if (!CHAVES_PASTA.includes(b.chave)) return res.status(400).json({ error: 'Aba inválida.' });
    if (typeof b.arquivo !== 'string' || !b.arquivo.startsWith('data:')) return res.status(400).json({ error: 'Envie o arquivo (PDF, Word, imagem).' });
    if (b.arquivo.length > 16 * 1024 * 1024) return res.status(413).json({ error: 'Arquivo muito grande (máx. ~12MB).' });
    const { rows: [a] } = await query(
      `INSERT INTO pasta_arquivos (chave, nome, arquivo, mimetype, criado_por) VALUES ($1,$2,$3,$4,$5) RETURNING id, nome, mimetype, criado_por, created_at`,
      [b.chave, cut(b.nome, 160), b.arquivo, cut(b.mimetype, 80), req.user.nome]);
    res.status(201).json(a);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/pasta-arquivos/:id', async (req, res) => {
  try {
    await query(`DELETE FROM pasta_arquivos WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── MEU AMIGO: IA acolhedora pra desabafar ───────────────────────────────────
   Espaço PRIVADO: cada pessoa conversa só com a IA, ninguém mais lê (nem o
   master). A IA escuta, acolhe e dá conselhos com empatia. */
r.get('/amigo/historico', async (req, res) => {
  try {
    const { rows } = await query(`SELECT role, content, created_at FROM amigo_mensagens WHERE usuario_id = $1 ORDER BY created_at ASC LIMIT 200`, [req.user.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/amigo/historico', async (req, res) => {
  try {
    await query(`DELETE FROM amigo_mensagens WHERE usuario_id = $1`, [req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Só o MASTER: lista quem usou o "Meu Amigo" e pode abrir a conversa (cuidado/apoio).
r.get('/amigo/usuarios', async (req, res) => {
  try {
    if (req.user.role !== 'master') return res.status(403).json({ error: 'Apenas o master.' });
    const { rows } = await query(`
      SELECT a.usuario_id, u.nome, u.setor, u.avatar, u.cor,
             COUNT(*)::int total, MAX(a.created_at) ultima
      FROM amigo_mensagens a LEFT JOIN usuarios u ON u.id = a.usuario_id
      GROUP BY a.usuario_id, u.nome, u.setor, u.avatar, u.cor
      ORDER BY ultima DESC`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/amigo/conversa/:usuarioId', async (req, res) => {
  try {
    if (req.user.role !== 'master') return res.status(403).json({ error: 'Apenas o master.' });
    const { rows } = await query(`SELECT role, content, created_at FROM amigo_mensagens WHERE usuario_id = $1 ORDER BY created_at ASC LIMIT 500`, [req.params.usuarioId]);
    const { rows: [u] } = await query(`SELECT nome, setor FROM usuarios WHERE id = $1`, [req.params.usuarioId]);
    res.json({ usuario: u || null, mensagens: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/amigo/mensagem', async (req, res) => {
  try {
    const texto = String((req.body || {}).texto || '').trim();
    if (!texto) return res.status(400).json({ error: 'Escreva algo pra desabafar.' });
    if (!process.env.OPENAI_API_KEY) return res.status(400).json({ error: 'Seu amigo virtual está indisponível no momento.' });
    await query(`INSERT INTO amigo_mensagens (usuario_id, role, content) VALUES ($1,'user',$2)`, [req.user.id, cut(texto, 4000)]);
    // Histórico recente pra dar contexto (últimas ~16 mensagens)
    const { rows: hist } = await query(`SELECT role, content FROM amigo_mensagens WHERE usuario_id = $1 ORDER BY created_at DESC LIMIT 16`, [req.user.id]);
    const mensagens = hist.reverse().map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) }));
    const primeiro = (req.user.nome || '').split(' ')[0];
    const sys = `Você é o "Amigo", um companheiro virtual acolhedor da equipe da Vittalis Saúde. ${primeiro} veio desabafar com você. Seja caloroso, empático e sem julgamentos, como um amigo de verdade — em português do Brasil, informal e humano. Escute de verdade, valide o sentimento, e só então ofereça conselhos práticos e gentis, um de cada vez. Faça perguntas abertas pra entender melhor. Nada de respostas longas demais nem de clichês frios. Use o nome ${primeiro} com naturalidade e, quando fizer sentido, um emoji leve. IMPORTANTE (segurança): se ${primeiro} demonstrar sofrimento intenso, pensamentos de se machucar, autolesão ou crise, acolha com carinho, leve a sério, incentive procurar alguém de confiança e um profissional, e informe o CVV: ligue 188 (24h, gratuito) ou cvv.org.br. Você não substitui ajuda profissional — deixe isso claro com gentileza quando for grave.`;
    const { default: fetch } = await import('node-fetch');
    const body = { model: 'gpt-4o-mini', max_tokens: 600, temperature: 0.8, messages: [{ role: 'system', content: sys }, ...mensagens] };
    const r2 = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify(body),
    });
    const d = await r2.json();
    if (d.error) return res.status(400).json({ error: 'Não consegui responder agora. Tenta de novo em instantes.' });
    const resposta = (d.choices?.[0]?.message?.content || '').trim() || 'Tô aqui com você. Me conta mais?';
    await query(`INSERT INTO amigo_mensagens (usuario_id, role, content) VALUES ($1,'assistant',$2)`, [req.user.id, cut(resposta, 4000)]);
    res.json({ resposta });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Lista de vendas (gestão vê tudo; atendente vê as suas). Filtros: setor, mes (YYYY-MM)
r.get('/vendas', async (req, res) => {
  try {
    const cond = [], params = []; let i = 1;
    if (!gestao(req)) { cond.push(`atendente_id = $${i++}`); params.push(req.user.id); }
    if (['vacinas', 'consultas', 'terapias'].includes(req.query.setor)) { cond.push(`setor = $${i++}`); params.push(req.query.setor); }
    if (/^\d{4}-\d{2}$/.test(req.query.mes || '')) { cond.push(`to_char(data_venda,'YYYY-MM') = $${i++}`); params.push(req.query.mes); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.dia || '')) { cond.push(`data_venda = $${i++}`); params.push(req.query.dia); }
    if (STATUS_PG.includes(req.query.status)) { cond.push(`status_pagamento = $${i++}`); params.push(req.query.status); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    // Lista leve: NÃO traz o base64 do comprovante (só um booleano) — o arquivo é
    // buscado sob demanda em /vendas/:id/comprovante ao clicar em visualizar.
    const { rows } = await query(`
      SELECT v.id, v.conversa_id, v.lead_id, v.atendente_id, v.atendente_nome, v.setor, v.categoria,
             v.cliente_nome, v.paciente_nome, v.servico, v.valor, v.desconto, v.forma_pagamento,
             v.status_pagamento, v.data_venda, v.data_atendimento, v.origem, v.observacao,
             v.conferido, v.conferido_em, v.conferido_por, v.repasse,
             COALESCE((SELECT COUNT(*) FROM venda_comprovantes c WHERE c.venda_id = v.id),0)::int n_comprovantes,
             v.created_at, v.updated_at
      FROM vendas v ${where} ORDER BY v.data_venda DESC, v.created_at DESC LIMIT 500`, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CAIXA — marca/desmarca a venda como conferida (conciliação financeira). Só gestão.
r.patch('/vendas/:id/conferido', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão confere o caixa.' });
    const conf = !!(req.body || {}).conferido; // booleano — seguro interpolar NOW()/NULL
    const { rows: [v] } = await query(
      `UPDATE vendas SET conferido = $1, conferido_em = ${conf ? 'NOW()' : 'NULL'}, conferido_por = $2, updated_at = NOW()
       WHERE id = $3 RETURNING id, conferido`,
      [conf, conf ? req.user.nome : null, req.params.id]);
    if (!v) return res.status(404).json({ error: 'Venda não encontrada' });
    res.json({ ok: true, id: v.id, conferido: v.conferido });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CAIXA — define o valor de repasse (ex.: pago à vacinadora/profissional). Só gestão.
r.patch('/vendas/:id/repasse', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão define o repasse.' });
    const rep = Math.max(0, Math.min(parseFloat((req.body || {}).repasse) || 0, 1000000));
    const { rows: [v] } = await query(`UPDATE vendas SET repasse = $1, updated_at = NOW() WHERE id = $2 RETURNING id, repasse`, [rep, req.params.id]);
    if (!v) return res.status(404).json({ error: 'Venda não encontrada' });
    res.json({ ok: true, id: v.id, repasse: v.repasse });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CAIXA — baixa de pendência: marca a venda como recebida (1 clique). Gestão ou dono.
r.patch('/vendas/:id/receber', async (req, res) => {
  try {
    const { rows: [v] } = await query(`SELECT atendente_id, setor, valor FROM vendas WHERE id = $1`, [req.params.id]);
    if (!v) return res.status(404).json({ error: 'Venda não encontrada' });
    if (!gestao(req) && v.atendente_id !== req.user.id) return res.status(403).json({ error: 'Sem permissão.' });
    const novo = STATUS_PG.includes((req.body || {}).status) ? req.body.status : 'pago';
    const forma = FORMAS_PG.includes((req.body || {}).forma_pagamento) ? req.body.forma_pagamento : null;
    const sets = ['status_pagamento = $1']; const params = [novo];
    if (forma) { sets.push(`forma_pagamento = $${params.length + 1}`); params.push(forma); }
    params.push(req.params.id);
    const { rows: [u] } = await query(`UPDATE vendas SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING id, status_pagamento, forma_pagamento`, params);
    // Recebido muda o "confirmado" do setor → atualiza banners de meta em tempo real
    socketEmit('venda_registrada', { id: u.id, setor: v.setor, valor: v.valor });
    res.json({ ok: true, ...u });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SAÍDAS / DESPESAS (fecham o saldo real do caixa) ─────────────────────────
const DESPESA_CATS = ['Repasse', 'Insumos', 'Salário', 'Aluguel', 'Marketing', 'Imposto', 'Manutenção', 'Outros'];
r.get('/despesas', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão vê as saídas.' });
    const cond = [], params = []; let i = 1;
    if (/^\d{4}-\d{2}$/.test(req.query.mes || '')) { cond.push(`to_char(data,'YYYY-MM') = $${i++}`); params.push(req.query.mes); }
    if (['vacinas', 'consultas', 'terapias'].includes(req.query.setor)) { cond.push(`setor = $${i++}`); params.push(req.query.setor); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    const { rows } = await query(`SELECT * FROM despesas ${where} ORDER BY data DESC, created_at DESC LIMIT 500`, params);
    const total = rows.reduce((s, d) => s + (parseFloat(d.valor) || 0), 0);
    res.json({ despesas: rows, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/despesas', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão lança saídas.' });
    const b = req.body || {};
    if (!String(b.descricao || '').trim()) return res.status(400).json({ error: 'Descreva a despesa.' });
    const valor = Math.max(0, Math.min(parseFloat(b.valor) || 0, 100000000));
    const categoria = DESPESA_CATS.includes(b.categoria) ? b.categoria : 'Outros';
    const setor = ['vacinas', 'consultas', 'terapias'].includes(b.setor) ? b.setor : null;
    const data = /^\d{4}-\d{2}-\d{2}$/.test(b.data || '') ? b.data : null;
    const { rows: [d] } = await query(
      `INSERT INTO despesas (descricao, categoria, valor, setor, forma_pagamento, data, criado_por)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,CURRENT_DATE),$7) RETURNING *`,
      [cut(b.descricao, 160), categoria, valor, setor, FORMAS_PG.includes(b.forma_pagamento) ? b.forma_pagamento : null, data, req.user.nome]);
    res.status(201).json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/despesas/:id', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão remove saídas.' });
    await query('DELETE FROM despesas WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CAIXA — permissão de mexer nos comprovantes da venda (gestão ou dono)
async function podeComprovante(req, vendaId) {
  const { rows: [v] } = await query(`SELECT atendente_id, valor FROM vendas WHERE id = $1`, [vendaId]);
  if (!v) return { erro: 404 };
  if (!gestao(req) && v.atendente_id !== req.user.id) return { erro: 403 };
  return { ok: true, venda: v };
}

// Lista os comprovantes de uma venda (sem o base64 — só metadados + análise)
r.get('/vendas/:id/comprovantes', async (req, res) => {
  try {
    const perm = await podeComprovante(req, req.params.id);
    if (perm.erro) return res.status(perm.erro).json({ error: perm.erro === 404 ? 'Venda não encontrada' : 'Sem permissão.' });
    const { rows } = await query(`SELECT id, nome, tipo, analise, criado_por, created_at FROM venda_comprovantes WHERE venda_id = $1 ORDER BY created_at`, [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Baixa 1 comprovante (data URL) pra visualizar
r.get('/vendas/:id/comprovantes/:compId', async (req, res) => {
  try {
    const perm = await podeComprovante(req, req.params.id);
    if (perm.erro) return res.status(perm.erro).json({ error: perm.erro === 404 ? 'Venda não encontrada' : 'Sem permissão.' });
    const { rows: [c] } = await query(`SELECT data_url, nome, tipo FROM venda_comprovantes WHERE id = $1 AND venda_id = $2`, [req.params.compId, req.params.id]);
    if (!c) return res.status(404).json({ error: 'Comprovante não encontrado.' });
    res.json({ comprovante: c.data_url, comprovante_nome: c.nome, comprovante_tipo: c.tipo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Anexa MAIS um comprovante (2+ por venda)
r.post('/vendas/:id/comprovantes', async (req, res) => {
  try {
    const perm = await podeComprovante(req, req.params.id);
    if (perm.erro) return res.status(perm.erro).json({ error: perm.erro === 404 ? 'Venda não encontrada' : 'Sem permissão.' });
    const b = req.body || {};
    if (typeof b.comprovante !== 'string' || !b.comprovante.startsWith('data:')) return res.status(400).json({ error: 'Envie o comprovante como data URL (imagem ou PDF).' });
    if (b.comprovante.length > 16 * 1024 * 1024) return res.status(413).json({ error: 'Comprovante muito grande (máx. ~12MB).' });
    const { rows: [c] } = await query(
      `INSERT INTO venda_comprovantes (venda_id, data_url, nome, tipo, criado_por) VALUES ($1,$2,$3,$4,$5) RETURNING id, nome, tipo, created_at`,
      [req.params.id, b.comprovante, cut(b.filename, 160), cut(b.mimetype, 80), req.user.nome]);
    res.status(201).json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Exclui 1 comprovante (se anexou errado)
r.delete('/vendas/:id/comprovantes/:compId', async (req, res) => {
  try {
    const perm = await podeComprovante(req, req.params.id);
    if (perm.erro) return res.status(perm.erro).json({ error: perm.erro === 404 ? 'Venda não encontrada' : 'Sem permissão.' });
    await query(`DELETE FROM venda_comprovantes WHERE id = $1 AND venda_id = $2`, [req.params.compId, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// IA analisa 1 comprovante (imagem): extrai valor/data/pagador/forma e confere com a venda
r.post('/vendas/:id/comprovantes/:compId/analisar', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(400).json({ error: 'IA não configurada (OPENAI_API_KEY ausente).' });
    const perm = await podeComprovante(req, req.params.id);
    if (perm.erro) return res.status(perm.erro).json({ error: perm.erro === 404 ? 'Venda não encontrada' : 'Sem permissão.' });
    const { rows: [c] } = await query(`SELECT data_url, tipo FROM venda_comprovantes WHERE id = $1 AND venda_id = $2`, [req.params.compId, req.params.id]);
    if (!c) return res.status(404).json({ error: 'Comprovante não encontrado.' });
    if (!String(c.tipo || '').startsWith('image')) return res.status(400).json({ error: 'A IA analisa comprovantes em imagem (foto/print). Para PDF, confira manualmente.' });
    const { default: fetch } = await import('node-fetch');
    const sys = 'Você confere comprovantes de pagamento de uma clínica (Vittalis Saúde). Analise a imagem e responda APENAS um JSON válido, em português do Brasil, sem texto extra. Se a imagem não parecer um comprovante de pagamento, retorne parece_comprovante=false.';
    const valorVenda = parseFloat(perm.venda.valor) || 0;
    const prompt = `Extraia os dados deste comprovante de pagamento e devolva exatamente:
{"parece_comprovante":true,"valor":0,"data":"YYYY-MM-DD ou null","pagador":"nome ou null","recebedor":"nome ou null","forma":"Pix|Cartão|Dinheiro|TED|Boleto|null","instituicao":"banco/instituição ou null","observacao":"1 frase"}
O valor esperado desta venda é R$ ${valorVenda.toFixed(2)} — não force esse número; extraia o que estiver na imagem.`;
    const body = {
      model: 'gpt-4o-mini', max_tokens: 500, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sys }, { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: c.data_url } }] }],
    };
    const r2 = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify(body),
    });
    const d = await r2.json();
    if (d.error) return res.status(400).json({ error: erroIA(d.error) });
    let p = null;
    try { p = JSON.parse(d.choices?.[0]?.message?.content || '{}'); } catch {}
    if (!p) return res.status(400).json({ error: 'A IA devolveu um formato inesperado.' });
    const valorExtraido = parseFloat(p.valor) || 0;
    const confere = valorExtraido > 0 && Math.abs(valorExtraido - valorVenda) <= Math.max(1, valorVenda * 0.02);
    const analise = {
      parece_comprovante: !!p.parece_comprovante,
      valor: valorExtraido, data: p.data || null, pagador: p.pagador || null, recebedor: p.recebedor || null,
      forma: p.forma || null, instituicao: p.instituicao || null, observacao: p.observacao || null,
      valor_venda: valorVenda, confere, analisado_por: req.user.nome,
    };
    await query(`UPDATE venda_comprovantes SET analise = $1::jsonb WHERE id = $2`, [JSON.stringify(analise), req.params.compId]);
    res.json(analise);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Resumo comercial do MÊS: as 4 camadas de valor (potencial/agendado/pendente/
// confirmado) por SETOR com meta e "quanto falta" + ranking por atendente/categoria.
const SET3 = ['vacinas', 'consultas', 'terapias'];
r.get('/vendas/resumo', async (req, res) => {
  try {
    // Painel comercial agregado (faturamento, metas, ranking) — só o master vê.
    if (req.user.role !== 'master') return res.status(403).json({ error: 'Apenas o master vê o painel comercial.' });
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : new Date().toISOString().slice(0, 7);
    const soMinhas = !gestao(req) ? `AND atendente_id = '${String(req.user.id).replace(/[^a-zA-Z0-9-]/g, '')}'` : '';
    const [vendasSetor, porAtendente, porCategoria, agSetor, cfg] = await Promise.all([
      query(`SELECT setor,
          COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float confirmado,
          COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('sinal','aguardando','parcelado','pendente')),0)::float pendente,
          COALESCE(SUM(desconto),0)::float desconto,
          COUNT(*)::int n
        FROM vendas WHERE to_char(data_venda,'YYYY-MM') = $1 ${soMinhas} GROUP BY setor`, [mes]),
      query(`SELECT COALESCE(atendente_nome,'(sem nome)') nome, COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float confirmado, COUNT(*)::int n
              FROM vendas WHERE to_char(data_venda,'YYYY-MM') = $1 ${soMinhas} GROUP BY atendente_nome ORDER BY confirmado DESC`, [mes]),
      query(`SELECT categoria, COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float confirmado, COUNT(*)::int n
              FROM vendas WHERE to_char(data_venda,'YYYY-MM') = $1 ${soMinhas} GROUP BY categoria ORDER BY confirmado DESC`, [mes]),
      query(`SELECT COALESCE(setor,'vacinas') setor, COALESCE(SUM(valor),0)::float agendado FROM agenda_eventos
              WHERE to_char(data,'YYYY-MM') = $1 AND status IN ('Agendado','Confirmado','Reagendado') AND valor IS NOT NULL GROUP BY setor`, [mes]),
      query("SELECT valor FROM configuracoes WHERE chave = 'metas'"),
    ]);
    const metaV = cfg.rows[0]?.valor?.vendas || {};
    const vMap = Object.fromEntries(vendasSetor.rows.map(r2 => [r2.setor, r2]));
    const aMap = Object.fromEntries(agSetor.rows.map(r2 => [r2.setor, r2.agendado]));
    const setores = {}; let totConf = 0, totPend = 0, totAg = 0, totMeta = 0, totDesc = 0;
    for (const s of SET3) {
      const conf = vMap[s]?.confirmado || 0, pend = vMap[s]?.pendente || 0, ag = aMap[s] || 0, desc = vMap[s]?.desconto || 0;
      const meta = parseFloat(metaV[s]) || 0;
      setores[s] = { meta, confirmado: conf, pendente: pend, agendado: ag, desconto: desc, falta: Math.max(meta - conf, 0), pct: meta ? +((conf / meta) * 100).toFixed(1) : null, n: vMap[s]?.n || 0 };
      totConf += conf; totPend += pend; totAg += ag; totMeta += meta; totDesc += desc;
    }
    res.json({
      mes, setores,
      total: { meta: totMeta, confirmado: totConf, pendente: totPend, agendado: totAg, desconto: totDesc, falta: Math.max(totMeta - totConf, 0), pct: totMeta ? +((totConf / totMeta) * 100).toFixed(1) : null },
      porAtendente: porAtendente.rows, porCategoria: porCategoria.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Define a meta de VENDAS (R$) por setor do mês (gestão)
r.put('/vendas/meta', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão define metas.' });
    const b = req.body || {};
    const clamp = (v) => Math.max(0, Math.min(parseFloat(v) || 0, 100000000));
    const vendas = { vacinas: clamp(b.vacinas), consultas: clamp(b.consultas), terapias: clamp(b.terapias) };
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('metas', jsonb_build_object('vendas', $1::jsonb))
                 ON CONFLICT (chave) DO UPDATE SET valor = jsonb_set(COALESCE(configuracoes.valor,'{}'::jsonb), '{vendas}', $1::jsonb), updated_at = NOW()`, [JSON.stringify(vendas)]);
    res.json({ ok: true, vendas });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── METAS DE AGENDAMENTO (quantidade por setor no mês) ───────────────────────
// Configuráveis pela gestão. Guardadas em configuracoes.metas.agendamentos.
r.get('/agendamentos/meta', async (req, res) => {
  try {
    const { rows } = await query("SELECT valor FROM configuracoes WHERE chave = 'metas'");
    const ag = rows[0]?.valor?.agendamentos || {};
    res.json({ vacinas: +ag.vacinas || 0, consultas: +ag.consultas || 0, terapias: +ag.terapias || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/agendamentos/meta', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão define metas.' });
    const b = req.body || {};
    const clamp = (v) => Math.max(0, Math.min(parseInt(v) || 0, 100000));
    const agendamentos = { vacinas: clamp(b.vacinas), consultas: clamp(b.consultas), terapias: clamp(b.terapias) };
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('metas', jsonb_build_object('agendamentos', $1::jsonb))
                 ON CONFLICT (chave) DO UPDATE SET valor = jsonb_set(COALESCE(configuracoes.valor,'{}'::jsonb), '{agendamentos}', $1::jsonb), updated_at = NOW()`, [JSON.stringify(agendamentos)]);
    res.json({ ok: true, agendamentos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Resumo de agendamentos do mês por setor (feitos vs meta). Gestão ou líder.
r.get('/agendamentos/resumo', async (req, res) => {
  try {
    if (!(gestao(req) || req.user.lider)) return res.status(403).json({ error: 'Acesso restrito.' });
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : new Date().toISOString().slice(0, 7);
    const [feitosQ, cfgQ] = await Promise.all([
      query(`SELECT COALESCE(setor,'vacinas') setor, COUNT(*)::int n FROM agenda_eventos
             WHERE to_char(data,'YYYY-MM') = $1 AND status IN ('Agendado','Confirmado','Realizado','Reagendado')
             GROUP BY setor`, [mes]),
      query("SELECT valor FROM configuracoes WHERE chave = 'metas'"),
    ]);
    const metaAg = cfgQ.rows[0]?.valor?.agendamentos || {};
    const feitos = Object.fromEntries(feitosQ.rows.map(r2 => [r2.setor, r2.n]));
    const setores = {};
    for (const s of SET3) {
      const feito = feitos[s] || 0, meta = +metaAg[s] || 0;
      setores[s] = { feito, meta, falta: Math.max(meta - feito, 0), pct: meta ? +((feito / meta) * 100).toFixed(1) : null };
    }
    res.json({ mes, setores });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Editar/excluir venda (gestão)
r.put('/vendas/:id', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão edita vendas.' });
    const b = req.body || {};
    const sets = [], params = []; let i = 1;
    const set = (c, v) => { sets.push(`${c} = $${i++}`); params.push(v); };
    if (b.valor !== undefined) set('valor', isNaN(parseFloat(b.valor)) ? 0 : Math.max(0, parseFloat(b.valor)));
    if (b.status_pagamento !== undefined && STATUS_PG.includes(b.status_pagamento)) set('status_pagamento', b.status_pagamento);
    if (b.forma_pagamento !== undefined) set('forma_pagamento', FORMAS_PG.includes(b.forma_pagamento) ? b.forma_pagamento : null);
    if (b.categoria !== undefined && CATEGORIAS_VENDA.includes(b.categoria)) { set('categoria', b.categoria); set('setor', setorDaCategoria(b.categoria)); }
    if (b.observacao !== undefined) set('observacao', cut(b.observacao, 300));
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar' });
    params.push(req.params.id);
    const { rows: [v] } = await query(`UPDATE vendas SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, params);
    if (!v) return res.status(404).json({ error: 'Venda não encontrada' });
    res.json(v);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/vendas/:id', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão remove vendas.' });
    await query('DELETE FROM vendas WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Resumo de PERDAS do mês: total, valor potencial perdido, por motivo e setor.
r.get('/perdas/resumo', async (req, res) => {
  try {
    if (req.user.role !== 'master') return res.status(403).json({ error: 'Apenas o master vê o painel comercial.' });
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : new Date().toISOString().slice(0, 7);
    const soMinhas = !gestao(req) ? ` AND atendente_id = '${String(req.user.id).replace(/[^a-zA-Z0-9-]/g, '')}'` : '';
    const [tot, porMotivo, porSetor] = await Promise.all([
      query(`SELECT COUNT(*)::int n, COALESCE(SUM(valor_potencial),0)::float valor FROM perdas WHERE to_char(created_at,'YYYY-MM')=$1 ${soMinhas}`, [mes]),
      query(`SELECT motivo, COUNT(*)::int n, COALESCE(SUM(valor_potencial),0)::float valor FROM perdas WHERE to_char(created_at,'YYYY-MM')=$1 ${soMinhas} GROUP BY motivo ORDER BY n DESC`, [mes]),
      query(`SELECT COALESCE(setor,'(sem)') setor, COUNT(*)::int n FROM perdas WHERE to_char(created_at,'YYYY-MM')=$1 ${soMinhas} GROUP BY setor ORDER BY n DESC`, [mes]),
    ]);
    res.json({ mes, total: tot.rows[0]?.n || 0, valorPerdido: tot.rows[0]?.valor || 0, porMotivo: porMotivo.rows, porSetor: porSetor.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ PAINEL DE PROFISSIONAIS ════════════════════════════════════════════════ */
// Painel de Profissionais é do setor de CONSULTAS (e da gestão).
const podeGerirProf = (req) => gestao(req) || req.user?.setor === 'consultas';
// Sanitiza a foto (data URL de imagem, até ~2,5MB) e os documentos anexados.
const limparFoto = (f) => (f && /^data:image\/(jpeg|png|webp);base64,/.test(f) && f.length < 2_500_000) ? f : null;
const limparDocs = (arr) => (Array.isArray(arr) ? arr : [])
  .filter(d => d && d.arquivo && /^data:[\w/+.\-]+;base64,/.test(d.arquivo) && d.arquivo.length < 11_000_000)
  .slice(0, 10)
  .map(d => ({ nome: String(d.nome || 'documento').slice(0, 120), arquivo: d.arquivo, mimetype: String(d.mimetype || '').slice(0, 100) }));
// Cadastro de médicos/especialistas + disponibilidade semanal.
r.get('/profissionais', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM profissionais ORDER BY ativo DESC, nome');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/profissionais', async (req, res) => {
  try {
    if (!podeGerirProf(req)) return res.status(403).json({ error: 'Sem permissão pra cadastrar profissionais.' });
    const b = req.body || {};
    const nome = cut((b.nome || '').trim(), 80);
    if (!nome) return res.status(400).json({ error: 'Informe o nome do profissional.' });
    const setor = ['vacinas', 'consultas', 'terapias'].includes(b.setor) ? b.setor : 'consultas';
    const { rows: [p] } = await query(
      `INSERT INTO profissionais (nome, especialidade, setor, cor, telefone, ativo, disponibilidade, observacoes, foto, documentos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [nome, cut(b.especialidade, 80), setor, cut(b.cor, 9) || '#00B8C0',
       cut(String(b.telefone || '').replace(/\D/g, ''), 13), b.ativo !== false,
       JSON.stringify(b.disponibilidade || {}), cut(b.observacoes, 300),
       limparFoto(b.foto), JSON.stringify(limparDocs(b.documentos))]);
    res.status(201).json(p);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/profissionais/:id', async (req, res) => {
  try {
    if (!podeGerirProf(req)) return res.status(403).json({ error: 'Sem permissão pra editar profissionais.' });
    const b = req.body || {};
    const sets = [], params = []; let i = 1;
    const set = (c, v) => { sets.push(`${c} = $${i++}`); params.push(v); };
    if (b.nome !== undefined) set('nome', cut(b.nome.trim(), 80));
    if (b.especialidade !== undefined) set('especialidade', cut(b.especialidade, 80));
    if (b.setor !== undefined) set('setor', ['vacinas', 'consultas', 'terapias'].includes(b.setor) ? b.setor : 'consultas');
    if (b.cor !== undefined) set('cor', cut(b.cor, 9) || '#00B8C0');
    if (b.telefone !== undefined) set('telefone', cut(String(b.telefone).replace(/\D/g, ''), 13));
    if (b.ativo !== undefined) set('ativo', !!b.ativo);
    if (b.disponibilidade !== undefined) set('disponibilidade', JSON.stringify(b.disponibilidade || {}));
    if (b.observacoes !== undefined) set('observacoes', cut(b.observacoes, 300));
    if (b.foto !== undefined) set('foto', limparFoto(b.foto));
    if (b.documentos !== undefined) set('documentos', JSON.stringify(limparDocs(b.documentos)));
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar' });
    params.push(req.params.id);
    const { rows: [p] } = await query(`UPDATE profissionais SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, params);
    if (!p) return res.status(404).json({ error: 'Profissional não encontrado' });
    res.json(p);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/profissionais/:id', async (req, res) => {
  try {
    if (!podeGerirProf(req)) return res.status(403).json({ error: 'Sem permissão pra remover profissionais.' });
    await query('DELETE FROM profissionais WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ CURSOS / TREINAMENTO ═══════════════════════════════════════════════════ */
r.get('/cursos', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM cursos ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
r.post('/cursos', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão adiciona cursos.' });
    const b = req.body || {};
    const titulo = cut((b.titulo || '').trim(), 120);
    if (!titulo) return res.status(400).json({ error: 'Informe o título do curso.' });
    let arquivo = null;
    if (b.arquivo) {
      if (!/^data:[\w/+.\-]+;base64,/.test(b.arquivo)) return res.status(400).json({ error: 'Arquivo inválido.' });
      if (b.arquivo.length > 16_000_000) return res.status(400).json({ error: 'Arquivo muito grande (máx. ~12MB). Para vídeos grandes, use um link (YouTube/Drive).' });
      arquivo = b.arquivo;
    }
    const { rows: [c] } = await query(
      `INSERT INTO cursos (titulo, descricao, url, categoria, criado_por, arquivo, filename, mimetype) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [titulo, cut(b.descricao, 600), cut(b.url, 500), cut(b.categoria, 40) || 'Geral', cut(req.user?.nome, 80),
       arquivo, arquivo ? cut(b.filename, 160) : null, arquivo ? cut(b.mimetype, 100) : null]);
    res.status(201).json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
r.delete('/cursos/:id', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão remove cursos.' });
    await query('DELETE FROM cursos WHERE id = $1', [req.params.id]);
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
