import express from 'express';
import { query } from '../db/pool.js';
import { auth, masterOnly } from '../middleware/auth.js';
import { socketEmit } from '../socketServer.js';
import { htmlParaPDF } from '../services/pdf.js';
import { versoDoDia } from '../versiculos.js';
import { getVapid, enviarPush } from '../services/push.js';
import { temIA, usaClaude, openaiMessages, anthropicClient, CLAUDE_MODEL, CLAUDE_MODEL_MINI, podeVerSetor, gerarBaseConsultas, zapiCall } from './inbox.js';
import propostaGen from '../services/proposta-gen.js';
import { mascararLista } from '../middleware/privacidade.js';
import { cartaoDoEvento } from '../services/cartaoAgenda.js';

/* ─── FERRAMENTAS VITTAHUB ────────────────────────────────────────────────────
   Agenda · Programa de Indicações · Biblioteca de Experiências (fotos, vídeos,
   depoimentos, apresentações e figurinhas) · Registro de Ligações.            */

const r = express.Router();
r.use(auth);

const cut = (v, n) => (v == null ? null : String(v).slice(0, n));
const gestao = (req) => ['master', 'supervisor'].includes(req.user.role);

/* 👁️ VISÃO GERAL — quem enxerga a clínica INTEIRA (todos os setores e a linha
   de cada colega). Regra do master, repetida por ele mais de uma vez:
   só a GESTÃO (ele) e o MARKETING. Supervisora NÃO entra aqui — ela é
   supervisora DO SETOR dela, e já custou vazamento tratar `supervisor` como
   "vê tudo". A marca fica num campo próprio (`ve_geral`) em vez de ser
   adivinhada por papel ou por `ve_tudo`: cadastro explícito não vaza por
   acidente quando alguém muda de função. */
const veGeral = (req) => req.user.role === 'master' || req.user.ve_geral === true;
// Erro da IA — mostra só "IA inativa" (sem detalhe técnico)
const erroIA = () => 'IA inativa';

/* Setores de quem está pedindo — a AUTORIDADE é o banco, nunca o token (que
   pode ser velho, de antes de a gestão arrumar o cadastro). Só o master enxerga
   os três; supervisora é supervisora DO SETOR DELA (regra do master, já custou
   vazamento de placar entre vacinas e consultas). Sem setor cadastrado NÃO
   significa "vê tudo": significa lista vazia, e as telas escondem as abas. */
const SETORES_VALIDOS = ['vacinas', 'consultas', 'terapias'];
export async function setoresDoUsuario(req) {
  if (veGeral(req)) return [...SETORES_VALIDOS];   // gestão e marketing
  const { rows: [u] } = await query('SELECT setor, setores FROM usuarios WHERE id = $1', [req.user.id])
    .catch(() => ({ rows: [null] }));
  if (u && Array.isArray(u.setores) && u.setores.length) return u.setores.filter(s => SETORES_VALIDOS.includes(s));
  if (u && SETORES_VALIDOS.includes(u.setor)) return [u.setor];
  return [];
}

/* ═══ AGENDA ═════════════════════════════════════════════════════════════════ */
const AG_STATUS = ['Agendado', 'Confirmado', 'Realizado', 'Cancelado', 'Reagendado', 'Faltou'];

// Acha a conversa do WhatsApp de um evento da agenda: pelo vínculo direto ou
// pelos 8 últimos dígitos do telefone (como o cliente costuma estar salvo).
async function convDoEvento(ev) {
  if (ev?.conversa_id) {
    const { rows: [c] } = await query('SELECT id FROM conversas WHERE id = $1', [ev.conversa_id]).catch(() => ({ rows: [] }));
    if (c) return c.id;
  }
  const tel = String(ev?.telefone || '').replace(/\D/g, '');
  if (tel.length < 8) return null;
  const { rows: [c] } = await query(
    `SELECT id FROM conversas WHERE RIGHT(regexp_replace(COALESCE(phone,''), '\\D', '', 'g'), 8) = $1
     ORDER BY last_message_at DESC NULLS LAST LIMIT 1`, [tel.slice(-8)]).catch(() => ({ rows: [] }));
  return c?.id || null;
}

r.get('/agenda', async (req, res) => {
  try {
    // Dia padrão no fuso de São Luís (UTC-3) — toISOString puro virava 'amanhã' após as 21h
    const data = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data : new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const { rows } = await query(`
      SELECT a.*, u.nome resp_nome, u.avatar resp_avatar, u.cor resp_cor,
             EXISTS(SELECT 1 FROM agenda_comprovantes ac WHERE ac.evento_id = a.id) AS tem_comprovante
      FROM agenda_eventos a LEFT JOIN usuarios u ON u.id = a.responsavel_id
      WHERE a.data = $1 ORDER BY a.hora, a.created_at`, [data]);
    // Motorista único: a colega do MESMO setor vê que o horário está OCUPADO
    // (pra não agendar em cima), mas SEM o contato do cliente da outra. Dona e
    // gestão veem tudo. Atendente só vê o macro-setor dela.
    // Cada setor tem a SUA agenda: a equipe de vacinas compartilha a agenda
    // entre si (motorista único) e vê tudo — precisa gerar o PDF completo (cliente,
    // vacina, pagamento, endereço) para as vacinadoras. Não compartilha com
    // consultas nem terapias, e vice-versa. Gestão vê tudo.
    /* Só o MASTER vê a agenda inteira. 'supervisor' não serve: Raylane e
       Danielle são supervisoras DO SETOR delas, e cada setor tem a sua agenda —
       era por isso que a separação parecia não valer pra elas. */
    const isGestao = req.user.role === 'master';
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
    // Janela do mês em São Luís — new Date() é UTC e virava o mês às 21h
    const agoraSLZ = new Date(Date.now() - 3 * 3600 * 1000);
    const iniStr = `${agoraSLZ.getUTCFullYear()}-${String(agoraSLZ.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const fimD = new Date(Date.UTC(agoraSLZ.getUTCFullYear(), agoraSLZ.getUTCMonth() + 1, 1));
    const fim = fimD.toISOString().slice(0, 10);
    const [porSetor, porResp, cfg] = await Promise.all([
      query(`SELECT COALESCE(setor,'vacinas') setor, COUNT(*)::int n
              FROM agenda_eventos WHERE data >= $1 AND data < $2 AND status <> 'Cancelado'
              GROUP BY setor`, [iniStr, fim]),
      /* O nome vem do CADASTRO quando existe (responsavel_id); o texto solto
         em `responsavel_nome` é só a última saída. Sem isso o placar mostrava
         "(sem" e "—" no pódio — lixo de agendamento antigo virando 1º lugar. */
      query(`SELECT COALESCE(NULLIF(TRIM(u.nome),''), NULLIF(TRIM(a.responsavel_nome),''), 'Sem responsável') nome,
                    COUNT(*)::int n
              FROM agenda_eventos a
              LEFT JOIN usuarios u ON u.id = a.responsavel_id
             WHERE a.data >= $1 AND a.data < $2 AND a.status <> 'Cancelado'
             GROUP BY 1 ORDER BY n DESC`, [iniStr, fim]),
      query("SELECT valor FROM configuracoes WHERE chave = 'metas'"),
    ]);
    const metas = cfg.rows[0]?.valor?.agendamentos || {};
    const feitosPor = Object.fromEntries(porSetor.rows.map(r2 => [r2.setor, r2.n]));
    const setores = {};
    let totFeitos = 0, totAlvo = 0;
    /* Cada uma vê a meta de agendamento DO SETOR DELA. Era aqui que a Raylane
       (vacinas) continuava enxergando consultas e terapias no painel. */
    const meus = await setoresDoUsuario(req);
    for (const s of SETORES_META.filter(x => meus.includes(x))) {
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
      /* Placar nominal da equipe é da GESTÃO (pedido do master). A atendente vê
         a meta do SETOR (que é de todas) e a SUA própria linha — nunca o número
         das colegas. Expor produção alheia vira comparação e fofoca de corredor. */
      porAtendente: veGeral(req) ? porResp.rows
        : porResp.rows.filter(x => x.nome === req.user.nome),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* 📊 MINHA PRODUÇÃO — o que EU fiz hoje e no mês ────────────────────────────
   Cada uma acompanha o próprio resultado sem ver o das colegas (pedido do
   master). A gestão pode olhar a de qualquer uma passando ?usuario_id=.
   Números pessoais: agendamentos marcados, vendas fechadas, valor confirmado e
   o quanto falta pra meta individual. */
r.get('/minha-producao', async (req, res) => {
  try {
    // Só a gestão escolhe de quem é o painel; a atendente vê sempre o dela.
    // Produção/carteira de OUTRA pessoa é da visão geral — supervisora vê a dela
    const alvoId = (veGeral(req) && req.query.usuario_id) ? String(req.query.usuario_id) : req.user.id;
    const { rows: [u] } = await query(
      `SELECT id, nome, cor, COALESCE(meta_individual,0)::float meta,
              COALESCE(meta_tipo,'valor') meta_tipo, COALESCE(meta_qtd_dia,0)::int meta_qtd_dia,
              COALESCE(NULLIF(meta_dias_uteis,0),26)::int meta_dias_uteis
         FROM usuarios WHERE id = $1`, [alvoId]);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });

    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);   // dia de São Luís
    const mes = hoje.slice(0, 7);
    const PAGO = "status_pagamento IN ('pago','cortesia')";

    // Consultas MARCADAS por ela (é assim que se mede quem agenda): conta pelo
    // dia em que o agendamento foi criado, não pelo dia do atendimento.
    const consultasCriadas = (de, ate) => query(
      `SELECT COUNT(*)::int n FROM agenda_eventos
        WHERE responsavel_id = $1 AND COALESCE(setor,'vacinas') = 'consultas'
          AND (created_at - interval '3 hours')::date BETWEEN $2::date AND $3::date
          AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'`, [alvoId, de, ate])
      .catch(() => ({ rows: [{ n: 0 }] }));

    const [vHoje, vMes, agHoje, agMes, convHoje] = await Promise.all([
      query(`SELECT COUNT(*)::int n, COALESCE(SUM(valor) FILTER (WHERE ${PAGO}),0)::float confirmado,
                    COALESCE(SUM(valor) FILTER (WHERE NOT (${PAGO})),0)::float pendente
               FROM vendas WHERE atendente_id = $1 AND data_venda = $2::date`, [alvoId, hoje]),
      query(`SELECT COUNT(*)::int n, COALESCE(SUM(valor) FILTER (WHERE ${PAGO}),0)::float confirmado
               FROM vendas WHERE atendente_id = $1 AND to_char(data_venda,'YYYY-MM') = $2`, [alvoId, mes]),
      query(`SELECT COUNT(*)::int n FROM agenda_eventos
              WHERE responsavel_id = $1 AND data = $2::date
                AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'`, [alvoId, hoje]),
      query(`SELECT COUNT(*)::int n FROM agenda_eventos
              WHERE responsavel_id = $1 AND to_char(data,'YYYY-MM') = $2
                AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'`, [alvoId, mes]),
      // Atendimento de verdade: conversas DIFERENTES que ela respondeu hoje
      query(`SELECT COUNT(DISTINCT conversa_id)::int n FROM mensagens
              WHERE sender_id = $1 AND from_type = 'me'
                AND created_at >= (NOW() - interval '3 hours')::date + interval '3 hours'`, [alvoId])
        .catch(() => ({ rows: [{ n: 0 }] })),
    ]);

    const confMes = vMes.rows[0]?.confirmado || 0;

    /* 🎯 A meta pode estar em R$ (mês) ou em CONSULTAS por dia. Cada uma tem o
       seu "realizado" próprio — comparar 10 consultas com R$ 100 mil na mesma
       barra daria um número sem sentido. */
    const ehConsultas = u.meta_tipo === 'consultas' && u.meta_qtd_dia > 0;
    let metaBloco;
    if (ehConsultas) {
      const [cDia, cMes] = await Promise.all([
        consultasCriadas(hoje, hoje),
        consultasCriadas(`${mes}-01`, hoje),
      ]);
      const feitasDia = cDia.rows[0]?.n || 0, feitasMes = cMes.rows[0]?.n || 0;
      const alvoMes = u.meta_qtd_dia * u.meta_dias_uteis;
      metaBloco = {
        tipo: 'consultas', unidade: 'consultas',
        alvo_dia: u.meta_qtd_dia, feito_dia: feitasDia,
        falta_dia: Math.max(u.meta_qtd_dia - feitasDia, 0),
        pct_dia: +((feitasDia / u.meta_qtd_dia) * 100).toFixed(0),
        alvo_mes: alvoMes, feito_mes: feitasMes,
        falta_mes: Math.max(alvoMes - feitasMes, 0),
        pct_mes: +((feitasMes / alvoMes) * 100).toFixed(1),
        dias_uteis: u.meta_dias_uteis,
      };
    } else {
      metaBloco = u.meta > 0 ? {
        tipo: 'valor', unidade: 'R$',
        alvo_mes: u.meta, feito_mes: confMes,
        falta_mes: Math.max(u.meta - confMes, 0),
        pct_mes: +((confMes / u.meta) * 100).toFixed(1),
      } : null;
      /* 🎯 AS DUAS METAS JUNTAS (ordem do master, 24/08: "que apareça a meta de
         100 mil e diga que a meta são 5 agendamentos por dia"). Uma é o
         resultado do mês, a outra é o ritmo do dia — e é o ritmo que faz o
         resultado acontecer. */
      if (u.meta_qtd_dia > 0) {
        const [cDia2, cMes2] = await Promise.all([
          consultasCriadas(hoje, hoje),
          consultasCriadas(`${mes}-01`, hoje),
        ]);
        const fDia = cDia2.rows[0]?.n || 0, fMes = cMes2.rows[0]?.n || 0;
        const alvoMes2 = u.meta_qtd_dia * (u.meta_dias_uteis || 26);
        metaBloco = { ...(metaBloco || { tipo: 'valor', unidade: 'R$' }),
          agenda: {
            alvo_dia: u.meta_qtd_dia, feito_dia: fDia,
            falta_dia: Math.max(u.meta_qtd_dia - fDia, 0),
            pct_dia: +((fDia / u.meta_qtd_dia) * 100).toFixed(0),
            alvo_mes: alvoMes2, feito_mes: fMes,
            pct_mes: +((fMes / alvoMes2) * 100).toFixed(0),
            dias_uteis: u.meta_dias_uteis || 26,
          } };
      }
    }

    res.json({
      usuario: { id: u.id, nome: u.nome, cor: u.cor },
      hoje: {
        data: hoje,
        vendas: vHoje.rows[0]?.n || 0,
        confirmado: vHoje.rows[0]?.confirmado || 0,
        pendente: vHoje.rows[0]?.pendente || 0,
        agendamentos: agHoje.rows[0]?.n || 0,
        conversas: convHoje.rows[0]?.n || 0,
      },
      mes: {
        ref: mes,
        vendas: vMes.rows[0]?.n || 0,
        confirmado: confMes,
        agendamentos: agMes.rows[0]?.n || 0,
        // compat: campos antigos (meta em R$)
        meta: u.meta,
        falta: u.meta ? Math.max(u.meta - confMes, 0) : null,
        pct: u.meta ? +((confMes / u.meta) * 100).toFixed(1) : null,
      },
      metaInd: metaBloco,
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

/* 💉 MOTORISTA ÚNICO — a agenda de VACINAS é compartilhada por toda a equipe
   de vacinas: existe UMA equipe saindo por vez, então dois agendamentos no
   mesmo dia e horário são impossíveis na vida real. A tela já avisa antes de
   salvar, mas duas atendentes clicando ao mesmo tempo passariam pelo aviso —
   por isso a trava de verdade fica aqui no servidor (pedido do master). */
async function choqueVacina({ data, hora, ignorarId }) {
  if (!data || !hora) return null;
  const { rows } = await query(
    `SELECT id, paciente FROM agenda_eventos
      WHERE COALESCE(setor,'vacinas') = 'vacinas' AND data = $1 AND hora = $2
        AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'
        AND servico IS DISTINCT FROM 'Pós Vacinal'  -- pós é contato, não ocupa o motorista
        AND ($3::int IS NULL OR id <> $3::int) LIMIT 1`,
    [data, hora, ignorarId || null]).catch(() => ({ rows: [] }));
  return rows[0] || null;
}
const msgChoque = (c) => `Esse horário já está ocupado na agenda de vacinas (${c.paciente || 'outro cliente'}). Como a equipe é uma só, escolha outro horário.`;

r.post('/agenda', async (req, res) => {
  try {
    const b = req.body || {};
    const paciente = cut((b.paciente || '').trim(), 80);
    if (!paciente) return res.status(400).json({ error: 'Nome do paciente é obrigatório' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.data || '')) return res.status(400).json({ error: 'Data inválida' });
    if (!/^\d{2}:\d{2}$/.test(b.hora || '')) return res.status(400).json({ error: 'Hora inválida (HH:MM)' });
    const setor = ['vacinas', 'consultas', 'terapias'].includes(b.setor) ? b.setor : 'vacinas';
    // A tela pergunta antes; se a equipe confirmar que quer mesmo assim, manda
    // forcar=true. Sem confirmação, o servidor barra — é o que impede duas
    // atendentes clicando junto pegarem o mesmo horário.
    if (setor === 'vacinas' && b.forcar !== true) {
      const c = await choqueVacina({ data: b.data, hora: b.hora });
      if (c) return res.status(409).json({ error: msgChoque(c), choque: { id: c.id, paciente: c.paciente } });
    }
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

    /* 💉 Agendou vacina → a solicitação das doses nasce junto (pedido do master).
       O serviço vira uma linha por vacina; sem serviço, entra como "A definir"
       pra a equipe completar na aba Solicitar Vacinas. Nunca trava o salvamento. */
    try {
      if (setor === 'vacinas') {
        const vacinas = String(b.servico || '').split(/[,;+]/).map(v => v.trim()).filter(Boolean);
        const lista = vacinas.length ? vacinas.slice(0, 8) : ['A definir'];
        for (const vac of lista) {
          await query(`INSERT INTO solicitacoes_vacinas (agenda_id, conversa_id, lead_id, paciente, vacina,
            quantidade, data_prevista, hora, setor, solicitante_id, solicitante_nome)
            VALUES ($1,$2,$3,$4,$5,1,$6,$7,'vacinas',$8,$9)`,
            [ev.id, cut(b.conversa_id, 40) || null, b.lead_id || null, paciente, cut(vac, 120),
             b.data, b.hora, req.user.id, req.user.nome]);
        }
      }
    } catch (e) { console.error('Solicitação automática:', e.message); }

    socketEmit('agenda_update', { id: ev.id });
    socketEmit('vacinas_solicitacao', { agenda_id: ev.id });
    /* 👏 FESTA NO AGENDAMENTO (ordem do master, 28/08: "sempre que clicar no
       botão agendar também"). Horário marcado é venda encaminhada — o time vê
       o personagem bater palma na hora. Pós-vacinal não conta: é tarefa
       interna, não conquista com a família. */
    if (String(b.servico || '') !== 'Pós Vacinal') {
      socketEmit('celebracao', {
        tipo: 'setor', setor, festa: 'palmas',
        userId: req.user?.id, quem: req.user?.nome,
        titulo: '🗓️ Agendamento fechado!',
        texto: `${String(req.user?.nome || 'A equipe').split(' ')[0]} marcou ${paciente || 'mais um atendimento'}`,
      });
    }
    res.status(201).json(ev);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* 🧾 Comprovante do atendimento concluído (pedido do master): anexado ao
   marcar Realizado, é o lastro que deixa o ranking fidedigno. */
r.post('/agenda/:id/comprovante', async (req, res) => {
  try {
    const data = String(req.body?.data || '');
    const m = data.match(/^data:([\w.+-]+\/[\w.+-]+);base64,/);
    if (!m) return res.status(400).json({ error: 'Arquivo inválido.' });
    if (data.length > 9_000_000) return res.status(400).json({ error: 'Arquivo muito grande (máx ~6MB).' });
    const { rows: [ev] } = await query('SELECT id, setor FROM agenda_eventos WHERE id = $1', [req.params.id]);
    if (!ev) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    await query(`INSERT INTO agenda_comprovantes (evento_id, nome, mime, data, autor_nome)
                 VALUES ($1,$2,$3,$4,$5)`,
      [ev.id, cut(String(req.body?.nome || 'comprovante'), 120), m[1], data, req.user.nome]);
    // 👏 Comprovante no agendamento também dá festa (ordem do master, 28/08)
    socketEmit('celebracao', {
      tipo: 'setor', setor: ev.setor || 'geral', festa: 'palmas',
      userId: req.user?.id, quem: req.user?.nome,
      titulo: '🧾 Pagamento comprovado!',
      texto: `${String(req.user?.nome || 'A equipe').split(' ')[0]} anexou o comprovante do atendimento`,
    });
    res.status(201).json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
r.get('/agenda/:id/comprovante', async (req, res) => {
  try {
    const { rows: [c] } = await query(`SELECT nome, mime, data, autor_nome, created_at
      FROM agenda_comprovantes WHERE evento_id = $1 ORDER BY created_at DESC LIMIT 1`, [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Sem comprovante anexado.' });
    res.json(c);
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
    // Remarcar/arrastar também passa pela trava do motorista único
    if ((b.data !== undefined || b.hora !== undefined) && b.forcar !== true) {
      const { rows: [atual] } = await query(
        `SELECT TO_CHAR(data,'YYYY-MM-DD') AS data, hora, COALESCE(setor,'vacinas') AS setor
           FROM agenda_eventos WHERE id = $1`, [req.params.id]).catch(() => ({ rows: [] }));
      const setorFinal = ['vacinas', 'consultas', 'terapias'].includes(b.setor) ? b.setor : (atual?.setor || 'vacinas');
      if (setorFinal === 'vacinas') {
        const c = await choqueVacina({ data: b.data ?? atual?.data, hora: b.hora ?? atual?.hora, ignorarId: Number(req.params.id) });
        if (c) return res.status(409).json({ error: msgChoque(c), choque: { id: c.id, paciente: c.paciente } });
      }
    }
    // Pro resgate de faltosos: precisa saber o status ANTERIOR (só dispara na virada)
    const { rows: [antes] } = b.status === 'Faltou'
      ? await query('SELECT status FROM agenda_eventos WHERE id = $1', [req.params.id]).catch(() => ({ rows: [] }))
      : { rows: [] };
    params.push(req.params.id);
    const { rows: [ev] } = await query(`UPDATE agenda_eventos SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, params);
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    socketEmit('agenda_update', { id: ev.id });

    /* 💉 Agendamento mudou → a reserva das doses acompanha.
       · Remarcou dia/hora: as doses ainda NÃO pedidas andam junto (senão o
         estoque ficava separado pro dia errado).
       · Cancelou/faltou: o pedido pendente é cancelado — não se compra dose
         pra quem não vem.
       · Virou vacina (ou trocou o serviço): a varredura cria o que faltar.
       Só mexe no que está 'solicitada'; o que a equipe já pediu ao fornecedor
       fica intacto — aquele trabalho não pode ser desfeito por uma edição. */
    try {
      const cancelou = /^(cancel|faltou)/i.test(String(ev.status || ''));
      if (cancelou) {
        await query(`UPDATE solicitacoes_vacinas SET status = 'cancelada'
                      WHERE agenda_id = $1 AND status = 'solicitada'`, [ev.id]);
      } else {
        if (b.data !== undefined || b.hora !== undefined) {
          await query(`UPDATE solicitacoes_vacinas SET data_prevista = $1, hora = $2
                        WHERE agenda_id = $3 AND status = 'solicitada'`, [ev.data, ev.hora, ev.id]);
        }
        await gerarSolicitacoesDaAgenda({ dias: 60, usuario: req.user });
      }
      socketEmit('vacinas_solicitacao', { agenda_id: ev.id });
    } catch (e) { console.error('Sincronia da solicitação:', e.message); }
    // ── 🔄 RESGATE DE FALTOSO: marcou "Faltou" → 1h depois a Vitta chama pra
    // remarcar (dentro do horário comercial). Só na transição, nunca repetido.
    try {
      if (b.status === 'Faltou' && antes && antes.status !== 'Faltou') {
        const convId = await convDoEvento(ev);
        if (convId) {
          const quando = new Date(Date.now() + 60 * 60000);
          const hSLZ = (quando.getUTCHours() - 3 + 24) % 24;
          if (hSLZ < 9) quando.setUTCHours(12, 30, 0, 0);                                     // manhã seguinte 9h30 SLZ
          else if (hSLZ >= 18) { quando.setUTCDate(quando.getUTCDate() + 1); quando.setUTCHours(12, 30, 0, 0); }
          const nome = String(ev.paciente || '').split(' ')[0];
          const txt = `Oi${nome ? `! Aqui é da Vittalis 💙 Sobre o horário de ${nome}` : '! Aqui é da Vittalis 💙 Sobre o seu horário'} de hoje: sentimos a falta de vocês! Sabemos que imprevistos acontecem 😊 Quer remarcar? Me diz o melhor dia e horário que eu já deixo reservado.`;
          await query(`INSERT INTO mensagens_agendadas (conversa_id, texto, enviar_em, criado_por) VALUES ($1, $2, $3, 'Vitta · Resgate de faltoso')`,
            [convId, txt, quando.toISOString()]);
        }
      }
    } catch (e) { console.error('Resgate faltoso erro (status salvo normalmente):', e.message); }
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
      INSERT INTO vendas (conversa_id, lead_id, atendente_id, atendente_nome, setor, categoria, cliente_nome, paciente_nome, servico, valor, desconto, forma_pagamento, status_pagamento, data_venda, data_atendimento, origem, observacao, ligou)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14,(NOW() - interval '3 hours')::date),$15,$16,$17,$18) RETURNING *`,
      [cut(b.conversa_id, 40), b.lead_id || null, atendenteId, atendenteNome, setor, categoria,
       cut(b.cliente_nome, 80), cut(b.paciente_nome, 80), cut(b.servico, 120), valor, desconto,
       FORMAS_PG.includes(b.forma_pagamento) ? b.forma_pagamento : null,
       STATUS_PG.includes(b.status_pagamento) ? b.status_pagamento : 'pago',
       /^\d{4}-\d{2}-\d{2}$/.test(b.data_venda || '') ? b.data_venda : null,
       /^\d{4}-\d{2}-\d{2}$/.test(b.data_atendimento || '') ? b.data_atendimento : null,
       cut(b.origem, 40), cut(b.observacao, 300), !!b.ligou]);
    socketEmit('venda_registrada', { id: v.id, setor, valor });
    /* 👏 FESTA NA TELA (ordem do master, 28/08: "toda vez que a equipe registrar
       uma venda, um personagem aparece e dá palmas"). Vai pro SETOR: quem
       vendeu comemora e as colegas veem — é o que faz o time correr junto.
       O valor entra formatado; o personagem é sorteado na tela. */
    socketEmit('celebracao', {
      tipo: 'setor', setor, festa: 'palmas',
      userId: atendenteId, quem: atendenteNome,
      valorTxt: valor > 0 ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '',
      titulo: '🎉 Venda registrada!',
      texto: `${String(atendenteNome || 'A equipe').split(' ')[0]} fechou mais uma em ${setor}`,
    });
    console.log(`VENDA OK: ${categoria} R$${valor} (id=${v.id})`);

    // ── 🔁 PRÓXIMA DOSE (recompra automática de vacinas) ─────────────────────
    // Venda de pacote mensal ("vacinas de X meses") agenda sozinha um lembrete
    // amigável para ~2 dias antes da próxima etapa do calendário. É o motor de
    // recompra da clínica: o cliente é chamado de volta no momento certo.
    try {
      if (setor === 'vacinas' && v.conversa_id) {
        const SEQ = [2, 3, 4, 5, 6, 7, 9, 12, 13, 15, 16, 18];
        const mtxt = `${b.servico || ''} ${categoria || ''}`.toLowerCase();
        const m = mtxt.match(/(\d{1,2})\s*m(?:es|eses|\b)/);
        const atual = m ? parseInt(m[1]) : null;
        const idx = atual != null ? SEQ.indexOf(atual) : -1;
        if (idx >= 0 && idx < SEQ.length - 1) {
          const prox = SEQ[idx + 1];
          const dias = Math.max(5, (prox - atual) * 30 - 2); // ~2 dias antes da etapa
          const base = /^\d{4}-\d{2}-\d{2}$/.test(b.data_atendimento || '') ? new Date(b.data_atendimento)
                     : /^\d{4}-\d{2}-\d{2}$/.test(b.data_venda || '') ? new Date(b.data_venda) : new Date();
          const quando = new Date(base.getTime() + dias * 86400000);
          quando.setHours(13, 0, 0, 0); // 10h em São Luís (UTC-3) — horário comercial
          if (quando.getTime() > Date.now()) {
            const bebe = cut(b.paciente_nome, 40);
            const texto = `Oi! 💙 Aqui é da Vittalis. ${bebe ? `O(a) ${bebe} já` : 'Seu bebê já'} está chegando na fase das *vacinas de ${prox} meses* — as próximas do calendário de proteção. Quer garantir seu horário? Atendemos também no conforto da sua casa 🏠😊`;
            await query(
              `INSERT INTO mensagens_agendadas (conversa_id, texto, enviar_em, criado_por)
               SELECT $1, $2, $3, 'Vitta · Próxima dose'
                WHERE NOT EXISTS (SELECT 1 FROM mensagens_agendadas WHERE conversa_id = $1
                                    AND criado_por = 'Vitta · Próxima dose' AND status = 'pendente')`,
              [v.conversa_id, texto, quando.toISOString()]);
            console.log(`PRÓXIMA DOSE agendada: conv=${v.conversa_id} ${atual}m→${prox}m em ${quando.toISOString().slice(0, 10)}`);
          }
        }
      }
    } catch (e) { console.error('PRÓXIMA DOSE erro (venda salva normalmente):', e.message); }

    // ── 💙 PÓS-VENDA + INDICAÇÃO: 2 dias depois, mensagem de carinho + pedido
    // de indicação (programa de indicações da clínica). Só vendas com conversa.
    try {
      if (v.conversa_id && ['pago', 'cortesia'].includes(v.status_pagamento || 'pago')) {
        const qd = new Date(Date.now() + 2 * 86400000);
        qd.setHours(17, 0, 0, 0); // 14h em São Luís (UTC-3)
        const nomeCli = cut(b.cliente_nome, 40);
        const txt = `Oi${nomeCli ? `, ${String(nomeCli).split(' ')[0]}` : ''}! 💙 Passando pra saber como foi a experiência de vocês com a gente — sua opinião vale ouro pra nossa equipe! E se você conhecer outra mamãe que cuida do calendário de proteção do bebê, indica a Vittalis 😊 Temos mimos especiais no nosso programa de indicações!`;
        // Segunda venda na mesma conversa NÃO agenda outro pós-venda igual
        // (foi assim que o cliente recebeu em dobro)
        await query(`INSERT INTO mensagens_agendadas (conversa_id, texto, enviar_em, criado_por)
                     SELECT $1, $2, $3, 'Vitta · Pós-venda'
                      WHERE NOT EXISTS (SELECT 1 FROM mensagens_agendadas WHERE conversa_id = $1
                                          AND criado_por = 'Vitta · Pós-venda' AND status = 'pendente')`,
          [v.conversa_id, txt, qd.toISOString()]);

        // ── ⭐ AVALIAÇÃO NO GOOGLE: 4 dias depois da venda, pede a avaliação com
        // o link direto. Só dispara se o link estiver configurado (Configurações).
        const { rows: [gr] } = await query("SELECT valor FROM configuracoes WHERE chave = 'google_review'").catch(() => ({ rows: [] }));
        const urlReview = gr?.valor?.url;
        if (urlReview && /^https?:\/\//i.test(urlReview)) {
          const qd2 = new Date(Date.now() + 4 * 86400000);
          qd2.setUTCHours(17, 30, 0, 0); // 14h30 em São Luís
          const txt2 = `Oi${nomeCli ? `, ${String(nomeCli).split(' ')[0]}` : ''}! 💙 Que alegria cuidar da proteção da sua família! Se a experiência com a Vittalis foi boa, você nos ajudaria MUITO deixando uma avaliação no Google — leva 1 minutinho: ${urlReview} ⭐ Obrigada!`;
          await query(`INSERT INTO mensagens_agendadas (conversa_id, texto, enviar_em, criado_por) VALUES ($1, $2, $3, 'Vitta · Avaliação Google')`,
            [v.conversa_id, txt2, qd2.toISOString()]);
        }
      }
    } catch (e) { console.error('PÓS-VENDA erro (venda salva normalmente):', e.message); }

    // 🧩 COMBO INTELIGENTE: o que famílias que levaram este mesmo serviço
    // costumam levar junto (histórico REAL da clínica). Nunca trava a venda.
    let sugestao = null;
    try {
      if (v.servico) {
        const { rows: [combo] } = await query(`
          SELECT v2.servico, COUNT(*)::int n
            FROM vendas v1
            JOIN vendas v2 ON v2.cliente_nome = v1.cliente_nome
                          AND v2.servico IS DISTINCT FROM v1.servico
                          AND v2.data_venda BETWEEN v1.data_venda AND v1.data_venda + 90
           WHERE v1.servico = $1 AND v2.servico IS NOT NULL AND v2.id <> $2
           GROUP BY v2.servico ORDER BY n DESC LIMIT 1`, [v.servico, v.id]);
        if (combo && combo.n >= 2) {
          sugestao = { servico: combo.servico, vezes: combo.n,
            texto: `Quem levou "${v.servico}" costuma levar também "${combo.servico}" (${combo.n} famílias). Vale oferecer! 💡` };
        }
      }
    } catch (e) { console.error('Combo inteligente:', e.message); }

    res.status(201).json({ ...v, sugestao });
  } catch (err) { console.error('VENDA ERRO:', err.message); res.status(500).json({ error: err.message }); }
});

// Placar do dia (motivacional): quantas vendas a equipe fechou HOJE. O VALOR em
// R$ só vai para a gestão (regra do painel comercial); a contagem é pra todos.
/* 🏁 FECHAR MEU CAIXA (pedido do master, 22/08): a colaboradora fecha o
   caixa do dia dela e o relatório sai no GRUPO Caixa do WhatsApp — cada uma
   com o seu. Master fecha o da casa inteira. */
r.get('/caixa/fechar-meu/status', async (req, res) => {
  try {
    const hojeCx = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const alvoId = req.user.role === 'master' ? 'casa' : req.user.id;
    const { rows: [f] } = await query(`SELECT enviado_em FROM caixa_fechamentos
      WHERE usuario_id = $1 AND data = $2::date ORDER BY enviado_em DESC LIMIT 1`, [alvoId, hojeCx]).catch(() => ({ rows: [] }));
    const { rows: [g] } = await query("SELECT valor FROM configuracoes WHERE chave = 'grupo_caixa'").catch(() => ({ rows: [] }));
    res.json({ fechado_hoje: !!f, enviado_em: f?.enviado_em || null, grupo: g?.valor?.nome || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
r.post('/caixa/fechar-meu', async (req, res) => {
  try {
    const { rows: [g] } = await query("SELECT valor FROM configuracoes WHERE chave = 'grupo_caixa'").catch(() => ({ rows: [] }));
    const grupoId = String(g?.valor?.id || '').replace('@g.us', '').replace('@s.whatsapp.net', '');
    if (!grupoId) return res.status(400).json({ error: 'O grupo Caixa ainda não foi configurado — peça ao master (o grupo precisa ter mandado ao menos 1 mensagem pro número da central).' });
    const hojeCx = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const ehCasa = req.user.role === 'master';
    const filtroU = ehCasa ? '' : `AND atendente_id = '${String(req.user.id).replace(/[^a-zA-Z0-9-]/g, '')}'`;
    const { rows: vds } = await query(`
      SELECT cliente_nome, servico, categoria, valor, forma_pagamento, status_pagamento
        FROM vendas WHERE data_venda = $1::date ${filtroU} ORDER BY created_at`, [hojeCx]);
    const total = vds.reduce((a, v) => a + (parseFloat(v.valor) || 0), 0);
    const recebido = vds.filter(v => ['pago', 'cortesia'].includes(v.status_pagamento)).reduce((a, v) => a + (parseFloat(v.valor) || 0), 0);
    const brlF = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const norm = (f) => { const t = String(f || '').toLowerCase();
      if (/pix|link/.test(t)) return 'Pix'; if (/cart|cr[eé]d|d[eé]b|parcel/.test(t)) return 'Cartão';
      if (/dinheiro|vista/.test(t)) return 'Dinheiro'; return 'Outros'; };
    const formas = {};
    for (const v of vds) { const k = norm(v.forma_pagamento); formas[k] = (formas[k] || 0) + (parseFloat(v.valor) || 0); }
    const { rows: [rep] } = await query(`SELECT 1 FROM caixa_fechamentos WHERE usuario_id = $1 AND data = $2::date LIMIT 1`,
      [ehCasa ? 'casa' : req.user.id, hojeCx]).catch(() => ({ rows: [] }));
    const dataBR = hojeCx.split('-').reverse().join('/');
    const linhas = [
      `🏁 *Fechamento de caixa${rep ? ' (reenvio)' : ''}, ${ehCasa ? 'Vittalis Saúde (casa inteira)' : req.user.nome}*`,
      `📅 ${dataBR}`,
      '',
      `💰 *Vendas do dia:* ${vds.length} · *Total:* ${brlF(total)}`,
      `✅ Recebido: ${brlF(recebido)} · ⏳ A receber: ${brlF(Math.max(total - recebido, 0))}`,
      Object.keys(formas).length ? Object.entries(formas).map(([k, v]) => `${k === 'Pix' ? '⚡' : k === 'Cartão' ? '💳' : k === 'Dinheiro' ? '💵' : '🔗'} ${k}: ${brlF(v)}`).join('\n') : null,
      '',
      vds.length ? '*Vendas:*\n' + vds.slice(0, 25).map(v => `• ${String(v.cliente_nome || 'Cliente').slice(0, 40)} · ${String(v.servico || v.categoria || '').slice(0, 40)} · ${brlF(v.valor)}`).join('\n') : '(nenhuma venda registrada hoje)',
      vds.length > 25 ? `… e mais ${vds.length - 25} venda(s)` : null,
      '',
      `_Enviado pelo VittaHub às ${new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(11, 16)}_`,
    ].filter(x => x !== null).join('\n');
    const zr = await zapiCall('/send-text', 'POST', { phone: grupoId, message: linhas });
    if (!zr?.ok) return res.status(502).json({ error: 'O WhatsApp não aceitou o envio pro grupo agora, tente de novo.' });
    await query(`INSERT INTO caixa_fechamentos (usuario_id, usuario_nome, data, total, vendas)
                 VALUES ($1,$2,$3::date,$4,$5)`,
      [ehCasa ? 'casa' : req.user.id, ehCasa ? 'Casa inteira' : req.user.nome, hojeCx, total, vds.length]).catch(() => {});
    res.json({ ok: true, total, vendas: vds.length, grupo: g?.valor?.nome || 'grupo Caixa' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/vendas/hoje', async (req, res) => {
  try {
    const podeValor = req.user.role === 'master';   // o número da casa e a campeã são só do dono
    /* "Vendas hoje" passa a ser o que a PRÓPRIA pessoa fechou (pedido do
       master). O número da casa não movia ninguém: a atendente via "12
       fechadas" sem saber quantas eram dela. O total da clínica continua, mas
       só pra gestão, e como informação secundária. */
    const hojeSLZ = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    /* Régua única: a contagem sempre foi de TODA venda; o valor filtrava só o
       PAGO — "2 fechadas · R$ 0,00" quando as duas eram parceladas. Agora os
       dois andam juntos. */
    const { rows: [meu] } = await query(
      `SELECT COUNT(*)::int n, COALESCE(SUM(valor),0)::float total
       FROM vendas WHERE data_venda = $2::date AND atendente_id = $1`, [req.user.id, hojeSLZ]);
    const { rows: [r2] } = await query(
      `SELECT COUNT(*)::int n, COALESCE(SUM(valor),0)::float total
       FROM vendas WHERE data_venda = $1::date`, [hojeSLZ]);
    // Campeã(o) do dia — quem mais fechou hoje. Só pra gestão (nomeia pessoas).
    let campeao = null;
    if (podeValor) {
      const { rows: [c] } = await query(
        `SELECT COALESCE(atendente_nome,'—') nome, COUNT(*)::int n,
                COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float total
         FROM vendas WHERE data_venda = $1::date
         GROUP BY atendente_nome ORDER BY n DESC, total DESC LIMIT 1`, [hojeSLZ]);
      if (c && c.n > 0) campeao = c;
    }
    res.json({
      // n/total = as MINHAS de hoje (é o que o placar mostra pra todo mundo)
      n: meu?.n || 0, total: meu?.total || 0,
      // a casa inteira segue disponível, mas só pra gestão
      casa: podeValor ? { n: r2?.n || 0, total: r2?.total || 0 } : null,
      campeao,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* 💉 PLANO VACINAL — a aba dela (pedido do master) ───────────────────────────
   Meta: 20 planos no mês, 1 por dia. NÃO cria tabela nova: plano fechado é uma
   VENDA de categoria 'Plano Vacinal'. Guardar em outro lugar faria o placar, o
   caixa e o relatório divergirem entre si — o mesmo plano contado num lugar e
   sumido no outro. Aqui é só a lente certa sobre o dado que já existe.        */
const META_PLANOS_MES = 20;
r.get('/planos-vacinais', async (req, res) => {
  try {
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes
      : new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7);
    // Só a gestão escolhe de quem é a lista; a atendente vê sempre a dela
    const alvoId = (req.user.role === 'master' && req.query.usuario_id) ? String(req.query.usuario_id) : req.user.id;
    const { rows: [u] } = await query('SELECT id, nome FROM usuarios WHERE id = $1', [alvoId]);

    const { rows: planos } = await query(`
      SELECT id, cliente_nome, paciente_nome, servico, valor::float valor, forma_pagamento,
             status_pagamento, TO_CHAR(data_venda,'YYYY-MM-DD') data_venda, conversa_id, observacao
        FROM vendas
       WHERE atendente_id = $1 AND categoria = 'Plano Vacinal'
         AND to_char(data_venda,'YYYY-MM') = $2
         AND status_pagamento IN ('pago','cortesia','sinal','parcelado')
       ORDER BY data_venda DESC, created_at DESC`, [alvoId, mes]);

    // Um ponto por dia do mês: mostra a sequência e onde furou a meta diária
    const porDia = {};
    for (const p of planos) porDia[p.data_venda] = (porDia[p.data_venda] || 0) + 1;
    const [ano, mm] = mes.split('-').map(Number);
    const totalDias = new Date(ano, mm, 0).getDate();
    const hojeSLZ = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const dias = [];
    for (let d = 1; d <= totalDias; d++) {
      const iso = `${mes}-${String(d).padStart(2, '0')}`;
      const dow = new Date(iso + 'T12:00:00').getDay();
      dias.push({
        dia: d, data: iso, n: porDia[iso] || 0,
        domingo: dow === 0,                       // domingo não conta na cobrança
        passou: iso < hojeSLZ, hoje: iso === hojeSLZ,
      });
    }
    const feitos = planos.length;
    const valor = planos.reduce((s, p) => s + (p.valor || 0), 0);
    // Dias úteis já vencidos sem nenhum plano — é onde a meta diária furou
    const furos = dias.filter(d => d.passou && !d.domingo && d.n === 0).length;

    res.json({
      mes, usuario: { id: u?.id, nome: u?.nome },
      meta_mes: META_PLANOS_MES, meta_dia: 1,
      feitos, falta: Math.max(META_PLANOS_MES - feitos, 0),
      pct: +((feitos / META_PLANOS_MES) * 100).toFixed(1),
      valor, hoje: porDia[hojeSLZ] || 0, furos, dias, planos,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ 🏆 RANKING — quem está em 1º, 2º e 3º ═══════════════════════════════════
   Pedido do master: um pódio por QUANTIDADE de vendas, nunca por valor. A
   diferença não é detalhe — é o que faz o placar ser justo e não virar fofoca:
   · quantidade todo mundo consegue comparar (fechou 8, fechou 5);
   · valor exporia o número de faturamento de cada colega, que é do master.
   O ranking é DENTRO DO SETOR: consultas fecha 10 por dia e vacina fecha 1
   Plano — misturar os dois só humilharia quem vende o item mais caro.
   O master vê o pódio de cada setor. */
r.get('/ranking', async (req, res) => {
  try {
    const periodo = ['hoje', 'semana', 'mes'].includes(req.query.periodo) ? req.query.periodo : 'mes';
    const hojeSLZ = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    /* Conta VENDA REALIZADA, igual ao resto do painel: fechou é fechou. Filtrar
       por "já pago" deixava fora sinal e parcelado e colocava no fim do pódio
       quem tinha vendido mais (o master comparou com Vendas realizadas). */
    const filtroPeriodo = periodo === 'hoje'
      ? `v.data_venda = '${hojeSLZ}'::date`
      : periodo === 'semana'
        ? `v.data_venda >= '${hojeSLZ}'::date - INTERVAL '6 days' AND v.data_venda <= '${hojeSLZ}'::date`
        : `to_char(v.data_venda,'YYYY-MM') = to_char('${hojeSLZ}'::date,'YYYY-MM')`;

    /* Ranking é da CLÍNICA INTEIRA pra TODO MUNDO (pedido do master: "o
       ranking quero que apareça para todos") — é quantidade, sem um centavo na
       tela, então não fere a regra dos valores nominais. O recorte por setor
       do cadastro zerava a tela da Danielle, Stefany e Mayara: agendamento sem
       setor caía em 'vacinas' e sumia pra quem é de consultas. */
    const meus = ['vacinas', 'consultas', 'terapias'];

    /* O que conta no pódio (pedido do master): AGENDAMENTO, não venda.
       Faz sentido porque é o trabalho que a equipe controla — marcar a família.
       A venda vem depois e nem sempre no mesmo dia; cobrar por ela punia quem
       agendou bem e foi furada. "Vendas" continua como opção na tela. */
    /* 🧾 'concluidos' (pedido do master: ranking fidedigno): conta o
       agendamento REALIZADO, pelo dia do atendimento — só trabalho terminado. */
    const porConcluido = req.query.metrica === 'concluidos';
    const porVenda = req.query.metrica === 'vendas';
    /* 🏅 % DA META ALCANÇADA (ordem do master, 24/08: "faz conforme a sua meta
       alcançada"). É o critério JUSTO entre setores: quem vende plano de
       milhares e quem vende consulta de R$ 350 correm cada uma contra o
       próprio alvo, e ganha quem está mais perto de bater a sua. E continua
       respeitando a regra dos valores: na tela aparece o PERCENTUAL, nunca o
       dinheiro de ninguém. Sempre no mês, porque a meta é mensal. */
    const porMeta = req.query.metrica === 'meta';
    const { rows } = porMeta
      ? await query(
        `SELECT COALESCE(u.setor,'vacinas') setor, u.id aid, u.nome, u.avatar, u.cor,
                CASE WHEN COALESCE(u.meta_individual,0) > 0
                     THEN LEAST(999, ROUND((COALESCE(vv.total,0) / u.meta_individual) * 100))::int
                     ELSE 0 END n,
                COALESCE(vh.hoje_pct, 0)::int hoje
           FROM usuarios u
           LEFT JOIN (SELECT atendente_id, SUM(COALESCE(valor,0)) total FROM vendas v
                       WHERE to_char(v.data_venda,'YYYY-MM') = to_char($2::date,'YYYY-MM')
                       GROUP BY 1) vv ON vv.atendente_id = u.id
           LEFT JOIN (SELECT atendente_id, COUNT(*)::int hoje_pct FROM vendas v
                       WHERE v.data_venda = $2::date GROUP BY 1) vh ON vh.atendente_id = u.id
          WHERE u.ativo = true AND u.role IN ('atendente','supervisor')
            AND COALESCE(u.setor,'vacinas') = ANY($1)
          ORDER BY n DESC, u.nome ASC`, [meus, hojeSLZ])
      : porConcluido
      ? await query(
        `SELECT COALESCE(a.setor,'vacinas') setor,
                COALESCE(a.responsavel_id,'') aid,
                COALESCE(u.nome, a.responsavel_nome, '(sem nome)') nome,
                u.avatar, u.cor,
                COUNT(*)::int n,
                COUNT(*) FILTER (WHERE a.data = $2::date)::int hoje
           FROM agenda_eventos a
           LEFT JOIN usuarios u ON u.id = a.responsavel_id
          WHERE ${filtroPeriodo.replace(/v\.data_venda/g, 'a.data')}
            AND a.status = 'Realizado'
            AND a.servico IS DISTINCT FROM 'Pós Vacinal'
            AND COALESCE(a.setor,'vacinas') = ANY($1)
          GROUP BY 1,2,3,4,5
          ORDER BY n DESC, nome ASC`, [meus, hojeSLZ])
      : porVenda
      ? await query(
        `SELECT COALESCE(v.setor,'vacinas') setor,
                COALESCE(v.atendente_id,'') aid,
                COALESCE(u.nome, v.atendente_nome, '(sem nome)') nome,
                u.avatar, u.cor,
                COUNT(*)::int n,
                COUNT(*) FILTER (WHERE v.data_venda = $2::date)::int hoje
           FROM vendas v
           LEFT JOIN usuarios u ON u.id = v.atendente_id
          WHERE ${filtroPeriodo} AND COALESCE(v.setor,'vacinas') = ANY($1)
          GROUP BY 1,2,3,4,5
          ORDER BY n DESC, nome ASC`, [meus, hojeSLZ])
      : await query(
        // Agendamento cancelado não conta: marcar e desmarcar não é trabalho feito
        `SELECT COALESCE(a.setor,'vacinas') setor,
                COALESCE(a.responsavel_id,'') aid,
                COALESCE(u.nome, a.responsavel_nome, '(sem nome)') nome,
                u.avatar, u.cor,
                COUNT(*)::int n,
                COUNT(*) FILTER (WHERE (a.created_at - interval '3 hours')::date = $2::date)::int hoje
           FROM agenda_eventos a
           LEFT JOIN usuarios u ON u.id = a.responsavel_id
          WHERE ${filtroPeriodo.replace(/v\.data_venda/g, "(a.created_at - interval '3 hours')::date")}
            AND LOWER(COALESCE(a.status,'')) NOT LIKE 'cancel%'
            AND a.servico IS DISTINCT FROM 'Pós Vacinal'  -- automático não é mérito de agendamento
            AND COALESCE(a.setor,'vacinas') = ANY($1)
          GROUP BY 1,2,3,4,5
          ORDER BY n DESC, nome ASC`, [meus, hojeSLZ]);

    /* Quem ainda não vendeu no período some da consulta acima — mas precisa
       aparecer no fim do pódio, senão a pessoa não se acha na lista e o
       ranking deixa de cobrar justamente quem mais precisa. */
    const { rows: equipe } = await query(
      `SELECT id, nome, avatar, cor, setor, setores FROM usuarios
        WHERE ativo = true AND role IN ('atendente','supervisor','master')`).catch(() => ({ rows: [] }));

    const setores = meus.map((s) => {
      const doSetor = rows.filter(x => x.setor === s);
      const daCasa = equipe.filter(u => {
        const ss = (Array.isArray(u.setores) && u.setores.length) ? u.setores : [u.setor].filter(Boolean);
        return ss.includes(s) && u.role !== 'master';
      });
      for (const u of daCasa) {
        if (!doSetor.some(x => x.aid === u.id)) doSetor.push({ setor: s, aid: u.id, nome: u.nome, avatar: u.avatar, cor: u.cor, n: 0, hoje: 0 });
      }
      doSetor.sort((a, b) => b.n - a.n || b.hoje - a.hoje || String(a.nome).localeCompare(String(b.nome)));
      // Empate divide a mesma posição — "2º lugar" pras duas, sem desempate inventado
      let pos = 0, ultimo = null;
      const itens = doSetor.map((x, i) => {
        if (x.n !== ultimo) { pos = i + 1; ultimo = x.n; }
        return {
          pos, id: x.aid, nome: x.nome, avatar: x.avatar || null, cor: x.cor || null,
          n: x.n, hoje: x.hoje, voce: x.aid === req.user.id,
        };
      });
      const lider = itens[0]?.n || 0;
      const eu = itens.find(x => x.voce) || null;
      return {
        setor: s, itens,
        // "Falta 1 pra alcançar a líder" é o que faz a pessoa correr hoje
        minhaPos: eu?.pos || null, meuTotal: eu?.n ?? null,
        paraLiderar: eu && eu.pos > 1 ? Math.max(lider - eu.n + 1, 1) : 0,
        total: itens.reduce((a, x) => a + x.n, 0),
      };
    });

    /* PÓDIO ÚNICO DA EQUIPE — o master pediu uma lista só com as cinco: Raylane,
       Danielle, Suellen, Stefany e Mayara. A quebra por setor continua na tela
       como opção (é ela que compara laranja com laranja), mas o padrão é a
       equipe inteira disputando junto. */
    const juntas = new Map();
    for (const b2 of setores) {
      for (const it of b2.itens) {
        const k = it.id || it.nome;
        const j = juntas.get(k);
        if (j) { j.n += it.n; j.hoje += it.hoje; }
        else juntas.set(k, { ...it });
      }
    }
    /* TODO colaborador ativo entra no pódio da equipe, mesmo com o cadastro
       sem setor (cobrança do master: "coloca todos, falta ainda"). Era a
       brecha que sumia com gente: quem perdia o setor no cadastro não entrava
       em bloco nenhum — e ficava invisível no ranking, sem ninguém notar. */
    for (const u of equipe) {
      if (u.role === 'master') continue;
      const k = u.id || u.nome;
      if (!juntas.has(k)) juntas.set(k, {
        pos: 0, id: u.id, nome: u.nome, avatar: u.avatar || null, cor: u.cor || null,
        n: 0, hoje: 0, voce: u.id === req.user.id,
      });
    }
    const lista = [...juntas.values()].sort((a, b2) => b2.n - a.n || b2.hoje - a.hoje || String(a.nome).localeCompare(String(b2.nome)));
    let posG = 0, ultG = null;
    const itensGeral = lista.map((x, i) => { if (x.n !== ultG) { posG = i + 1; ultG = x.n; } return { ...x, pos: posG }; });
    const liderG = itensGeral[0]?.n || 0;
    const euG = itensGeral.find(x => x.voce) || null;

    res.json({
      periodo, metrica: porVenda ? 'vendas' : 'agendamentos', setores,
      geral: {
        setor: 'equipe', itens: itensGeral,
        minhaPos: euG?.pos || null, meuTotal: euG?.n ?? null,
        paraLiderar: euG && euG.pos > 1 ? Math.max(liderG - euG.n + 1, 1) : 0,
        total: itensGeral.reduce((a, x) => a + x.n, 0),
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ 👥 SUA EQUIPE — o time da supervisora e o que ELA ganha em cima ═══════
   Pedido do master. A supervisora acumula dois papéis: vende como atendente e
   responde pelo setor. O segundo papel não aparecia em lugar nenhum — ela via
   a própria meta e mais nada, sem saber quanto o time dela vale no bolso dela.
   Aqui fica explícito: cada integrante tem a meta de R$ 100 mil e um prêmio; e
   quando o integrante ganha, ela ganha o MESMO valor EM CIMA. É o que
   transforma "cobrar a colega" em "construir meu time".
   O tamanho do time sai da conta do master: meta global do setor ÷ 100 mil.
   R$ 500 mil = 5 pessoas; com 2 no time, faltam 3. */
r.get('/minha-equipe', async (req, res) => {
  try {
    const meus = await setoresDoUsuario(req);
    if (!meus.length) return res.json({ ativo: false, motivo: 'sem setor' });
    // Time de quem responde pelo setor: supervisora e master. Atendente não tem time.
    if (!['master', 'supervisor'].includes(req.user.role)) return res.json({ ativo: false, motivo: 'sem time' });

    const { rows: cfg } = await query("SELECT valor FROM configuracoes WHERE chave = 'metas'");
    const v = cfg[0]?.valor || {};
    const METfilter = "status_pagamento IN ('pago','cortesia')";
    const mesCol = "to_char(data_venda,'YYYY-MM') = to_char(NOW() - interval '3 hours','YYYY-MM')";
    const META_POR_PESSOA = 100000;   // combinado com o master: cada uma fica com 100 mil

    const setor = meus[0];
    const metaGlobal = Math.max(1, parseFloat(v.globais?.[setor]) || 500000);
    const premioPessoa = Math.max(0, parseFloat(v.premiosMin?.[setor]) || 1500);  // padrão R$ 1.500; o 2.500 é só da Raylane (premiosPessoa)

    // Time = quem é do MESMO setor (a própria supervisora fica de fora da lista)
    /* Marketing (ve_geral) fica FORA do time: eles enxergam tudo mas não
       vendem — apareciam no card com meta de R$ 100 mil que nunca vão bater,
       inflando as "vagas" e o ganho potencial da supervisora (auditoria). */
    const { rows: pessoas } = await query(
      `SELECT id, nome, cor, avatar, role, COALESCE(meta_individual,0)::float meta
         FROM usuarios
        WHERE ativo = true AND role IN ('atendente','supervisor') AND id <> $1
          AND COALESCE(ve_geral, false) = false
          AND (setor = $2 OR $2 = ANY(COALESCE(setores, ARRAY[]::text[])))
        ORDER BY nome`, [req.user.id, setor]).catch(() => ({ rows: [] }));

    const membros = [];
    for (const p of pessoas) {
      const { rows: [x] } = await query(
        `SELECT COALESCE(SUM(valor),0)::float vendido FROM vendas WHERE atendente_id = $1 AND ${mesCol}`,
        [p.id]).catch(() => ({ rows: [{ vendido: 0 }] }));
      const meta = p.meta > 0 ? p.meta : META_POR_PESSOA;
      const feito = x?.vendido || 0;
      membros.push({
        id: p.id, nome: p.nome, cor: p.cor, avatar: p.avatar,
        papel: p.role === 'supervisor' ? 'Supervisão' : 'Atendimento',
        meta, feito, falta: Math.max(meta - feito, 0),
        pct: +((feito / meta) * 100).toFixed(1),
        premio: premioPessoa,            // o que O INTEGRANTE ganha ao bater
        ganhoLider: premioPessoa,        // o que a supervisora ganha EM CIMA dele
        bateu: feito >= meta,
      });
    }

    const tamanhoIdeal = Math.max(1, Math.round(metaGlobal / META_POR_PESSOA));
    const noTime = membros.length + 1;   // + ela mesma
    res.json({
      ativo: true, setor,
      meta_por_pessoa: META_POR_PESSOA, meta_global: metaGlobal,
      premio_por_pessoa: premioPessoa,
      membros,
      tamanho_ideal: tamanhoIdeal, no_time: noTime,
      vagas: Math.max(tamanhoIdeal - noTime, 0),
      // O que ela leva se o time inteiro bater — o número que dá sentido ao painel
      ganho_potencial: membros.reduce((a2, m) => a2 + m.ganhoLider, 0),
      ganho_conquistado: membros.filter(m => m.bateu).reduce((a2, m) => a2 + m.ganhoLider, 0),
      // Vaga preenchida também aumenta o teto dela
      ganho_se_time_completo: tamanhoIdeal > noTime
        ? (tamanhoIdeal - 1) * premioPessoa : membros.length * premioPessoa,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Meta GLOBAL do setor do mês — visível pra TODA a equipe (clima de time). Cada
// um vê a meta do seu setor; master/sem setor vê a geral (todos os setores).
/* 💰 FATURAMENTO DOS TRÊS SETORES + TOTAL (ordem do master, 28/08: "no meu
   painel quero o faturamento de todos os setores e também o total").
   Visão da clínica inteira = SÓ MASTER (regra da casa; supervisora vê o setor
   dela em /meta-setor). Traz hoje e o mês, e separa o que já foi recebido do
   que está a receber — dinheiro na conta é diferente de venda fechada. */
r.get('/faturamento-setores', async (req, res) => {
  try {
    if (req.user.role !== 'master') return res.status(403).json({ error: 'Visão da clínica inteira é do master.' });
    const HOJE = "(NOW() - interval '3 hours')::date";
    const MES  = "to_char(NOW() - interval '3 hours','YYYY-MM')";
    /* Venda antiga podia ficar sem setor. Em vez de cair num limbo, o setor é
       deduzido da CATEGORIA — que é obrigatória no registro. Sem isso, consulta
       e terapia sumiam do painel (cobrança do master, 28/08). */
    const SETOR_VENDA = `COALESCE(NULLIF(setor,''),
      CASE WHEN categoria = 'Consulta' THEN 'consultas'
           WHEN categoria = 'Terapia'  THEN 'terapias'
           WHEN categoria IN ('Vacinação Geral','Plano Vacinal','Fidelidade Mensal') THEN 'vacinas'
      END, 'sem setor')`;
    const { rows } = await query(`
      SELECT ${SETOR_VENDA} AS setor,
             COALESCE(SUM(valor) FILTER (WHERE data_venda = ${HOJE}), 0)::float AS hoje,
             COALESCE(SUM(valor) FILTER (WHERE to_char(data_venda,'YYYY-MM') = ${MES}), 0)::float AS mes,
             COALESCE(SUM(valor) FILTER (WHERE to_char(data_venda,'YYYY-MM') = ${MES}
                        AND status_pagamento IN ('pago','cortesia')), 0)::float AS recebido,
             COUNT(*) FILTER (WHERE to_char(data_venda,'YYYY-MM') = ${MES})::int AS vendas_mes
        FROM vendas
       WHERE data_venda >= (${HOJE} - 40)
       GROUP BY 1 ORDER BY mes DESC`);

    /* 🗓️ E o que foi cobrado direto na AGENDA (consulta e terapia costumam ser
       lançadas ali, no atendimento) — sem isso o painel dizia zero mesmo com a
       casa faturando. Vem numa coluna própria, NUNCA somado às vendas: quem
       lançou nos dois lugares não conta duas vezes. */
    const { rows: ag } = await query(`
      SELECT COALESCE(NULLIF(setor,''),'sem setor') AS setor,
             COALESCE(SUM(valor) FILTER (WHERE data = ${HOJE}), 0)::float AS hoje,
             COALESCE(SUM(valor) FILTER (WHERE to_char(data,'YYYY-MM') = ${MES}), 0)::float AS mes,
             COUNT(*) FILTER (WHERE to_char(data,'YYYY-MM') = ${MES} AND COALESCE(valor,0) > 0)::int AS n
        FROM agenda_eventos
       WHERE data >= (${HOJE} - 40) AND COALESCE(valor,0) > 0
         AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'
       GROUP BY 1`).catch(() => ({ rows: [] }));
    const ordem = ['vacinas', 'consultas', 'terapias'];
    const daAgenda = (setor) => ag.find(x => x.setor === setor) || { hoje: 0, mes: 0, n: 0 };
    const montar = (base) => ({
      ...base,
      agenda_mes: daAgenda(base.setor).mes || 0,
      agenda_hoje: daAgenda(base.setor).hoje || 0,
      agenda_n: daAgenda(base.setor).n || 0,
    });
    const setores = ordem.map(s => montar(rows.find(r2 => r2.setor === s)
      || { setor: s, hoje: 0, mes: 0, recebido: 0, vendas_mes: 0 }));
    // Setor fora dos três (dado antigo) não some do total
    for (const r2 of rows) if (!ordem.includes(r2.setor)) setores.push(montar(r2));
    const soma = (c) => setores.reduce((t, x) => t + (x[c] || 0), 0);
    res.json({
      setores,
      total: { hoje: soma('hoje'), mes: soma('mes'), recebido: soma('recebido'),
               vendas_mes: soma('vendas_mes'), agenda_mes: soma('agenda_mes') },
      mes_ref: new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/meta-setor', async (req, res) => {
  try {
    const { rows: cfg } = await query("SELECT valor FROM configuracoes WHERE chave = 'metas'");
    const metaV = cfg[0]?.valor?.vendas || {};
    const mesCol = "to_char(data_venda,'YYYY-MM') = to_char(NOW() - interval '3 hours','YYYY-MM')";
    const METfilter = "status_pagamento IN ('pago','cortesia')";
    // Metas POR SETOR (configuráveis em Configurações): mínima e global.
    // Padrões: mínima R$ 100 mil, global R$ 500 mil.
    const minimasCfg = cfg[0]?.valor?.minimas || {};
    const globaisCfg = cfg[0]?.valor?.globais || {};
    const premiosCfg = cfg[0]?.valor?.premios || {};
    const premiosMinCfg = cfg[0]?.valor?.premiosMin || {};
    /* 🎁 PRÊMIO DA DIÁRIA — bater a meta do DIA vale dinheiro no mesmo dia
       (ordem do master: consultas = R$ 100 a diária, além dos R$ 2.600 do mês).
       Prêmio mensal move no fim do mês; a diária move HOJE — e é o dia que a
       equipe consegue enxergar. */
    const premiosDiaCfg = cfg[0]?.valor?.premiosDia || {};
    const premioDiaDe = (s2) => Math.max(0, parseFloat(premiosDiaCfg[s2]) || 0);
    const metaMinimaDe = (s) => Math.max(0, parseFloat(minimasCfg[s]) || 100000);
    const metaGlobalDe = (s) => Math.max(1, parseFloat(globaisCfg[s]) || 500000);
    const premioDe     = (s) => Math.max(0, parseFloat(premiosCfg[s]) || 10000);
    const premioMinDe  = (s) => Math.max(0, parseFloat(premiosMinCfg[s]) || 1500);  // padrão R$ 1.500; exceção pessoal via premiosPessoa
    // Setores do usuário (autoridade: banco — evita token velho). Multi-setor separa.
    const { rows: [u] } = await query('SELECT setor, setores FROM usuarios WHERE id = $1', [req.user.id]);
    let setores = [];
    if (u && Array.isArray(u.setores) && u.setores.length) setores = u.setores.filter(s => ['vacinas', 'consultas', 'terapias'].includes(s));
    else if (u && ['vacinas', 'consultas', 'terapias'].includes(u.setor)) setores = [u.setor];
    /* O placar conta VENDA REALIZADA, não só o dinheiro que já entrou (o master
       comparou com a tela de Vendas realizadas e o painel estava atrás).
       Fechou é fechou: sinal, parcelado e aguardando entram no avanço da meta.
       O que ainda não caiu no caixa fica visível à parte, em `aReceber` —
       transparência sem punir quem já vendeu. */
    const confDe = async (s) => {
      const { rows: [r2] } = await query(
        `SELECT COALESCE(SUM(valor),0)::float vendido,
                COALESCE(SUM(valor) FILTER (WHERE ${METfilter}),0)::float recebido
           FROM vendas WHERE COALESCE(setor,'vacinas') = $1 AND ${mesCol}`, [s]);
      const meta = parseFloat(metaV[s]) || 0, conf = r2?.vendido || 0;
      const recebido = r2?.recebido || 0, aReceber = Math.max(conf - recebido, 0);
      const MG = metaGlobalDe(s), MM = metaMinimaDe(s);
      return { setor: s, confirmado: conf, recebido, aReceber, meta, pct: meta ? +((conf / meta) * 100).toFixed(1) : 0, falta: Math.max(meta - conf, 0),
        metaGlobal: MG, pctGlobal: +((conf / MG) * 100).toFixed(1), faltaGlobal: Math.max(MG - conf, 0),
        metaMinima: MM, pctMinima: MM ? +((conf / MM) * 100).toFixed(1) : 100, faltaMinima: Math.max(MM - conf, 0),
        premio: premioDe(s), premioConquistado: conf >= MG,
        premioMinimo: premioMinDe(s), premioMinimoConquistado: conf >= MM,
        premioDia: premioDiaDe(s) };
    };
    // Meta INDIVIDUAL do usuário (se definida no cadastro): produção própria no mês
    let individual = null;
    const { rows: [meU] } = await query('SELECT meta_individual FROM usuarios WHERE id = $1', [req.user.id]).catch(() => ({ rows: [{}] }));
    const metaInd = parseFloat(meU?.meta_individual) || 0;
    if (metaInd > 0) {
      const { rows: [mv] } = await query(
        `SELECT COALESCE(SUM(valor),0)::float vendido,
                COALESCE(SUM(valor) FILTER (WHERE ${METfilter}),0)::float recebido
           FROM vendas WHERE atendente_id = $1 AND ${mesCol}`,
        [req.user.id]).catch(() => ({ rows: [{ vendido: 0, recebido: 0 }] }));
      const confI = mv?.vendido || 0, recI = mv?.recebido || 0;
      individual = { meta: metaInd, confirmado: confI, recebido: recI, aReceber: Math.max(confI - recI, 0),
        falta: Math.max(metaInd - confI, 0), pct: +((confI / metaInd) * 100).toFixed(1) };
    }

    /* 🎯 FOCO DO DIA POR SETOR — metas em QUANTIDADE, não em dinheiro (pedido
       do master). "Falta R$ 99.600" não diz o que fazer hoje; "faltam 7
       consultas" diz. Cada setor tem o seu alvo diário:
         · vacinas   → 1 Plano Vacinal
         · consultas → 10 consultas marcadas
         · terapias  → 1 Plano Mensal OU 5 sessões (alternativas: bater uma basta)
       Onde existe foco do dia, o placar mostra ele NO LUGAR do valor em R$. */
    const hojeSLZ = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const contaVenda = async (categoria, setorV) => {
      // Fechou é fechou: plano parcelado conta na meta do dia (régua única)
      const { rows: [x] } = await query(
        `SELECT COUNT(*)::int n FROM vendas
          WHERE atendente_id = $1 AND data_venda = $2::date AND categoria = $3
            AND COALESCE(setor,'vacinas') = $4`,
        [req.user.id, hojeSLZ, categoria, setorV]).catch(() => ({ rows: [{ n: 0 }] }));
      return x?.n || 0;
    };
    const focoDia = {};
    const focoMes = {};                       // alvo do MÊS, ao lado do alvo do dia
    if (setores.includes('vacinas')) {
      const feitos = await contaVenda('Plano Vacinal', 'vacinas');
      focoDia.vacinas = [{ rotulo: 'Plano Vacinal', alvo: 1, feitos }];
      /* 20 Planos Vacinais no mês (pedido do master), ao lado da meta do dia:
         1 por dia é o passo, 20 é o destino — e ver os dois juntos mostra se
         está no ritmo ou já ficou pra trás. */
      const { rows: [pm] } = await query(
        `SELECT COUNT(*)::int n FROM vendas
          WHERE atendente_id = $1 AND ${mesCol}
            AND categoria = 'Plano Vacinal' AND COALESCE(setor,'vacinas') = 'vacinas'`,
        [req.user.id]).catch(() => ({ rows: [{ n: 0 }] }));
      const feitosMes = pm?.n || 0;
      focoMes.vacinas = { rotulo: 'Planos', alvo: 20, feitos: feitosMes, falta: Math.max(20 - feitosMes, 0) };
    }
    if (setores.includes('consultas')) {
      // Consultas MARCADAS por ela hoje — é o trabalho de quem agenda
      const { rows: [c] } = await query(
        `SELECT COUNT(*)::int n FROM agenda_eventos
          WHERE responsavel_id = $1 AND COALESCE(setor,'vacinas') = 'consultas'
            AND (created_at - interval '3 hours')::date = $2::date
            AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'`,
        [req.user.id, hojeSLZ]).catch(() => ({ rows: [{ n: 0 }] }));
      focoDia.consultas = [{ rotulo: 'Consultas', alvo: 10, feitos: c?.n || 0 }];
    }
    if (setores.includes('terapias')) {
      const [planos, sessoes] = await Promise.all([
        contaVenda('Fidelidade Mensal', 'terapias'),
        contaVenda('Terapia', 'terapias'),
      ]);
      focoDia.terapias = [
        { rotulo: 'Plano Mensal', alvo: 1, feitos: planos, ou: true },
        { rotulo: 'Sessões', alvo: 5, feitos: sessoes, ou: true },
      ];
    }
    // Alternativas: bateu uma do grupo, o setor está cumprido — não cobra a outra
    for (const s of Object.keys(focoDia)) {
      const itens = focoDia[s];
      const algumOk = itens.some(i => i.feitos >= i.alvo);
      itens.forEach(i => { i.falta = algumOk && i.ou ? 0 : Math.max(i.alvo - i.feitos, 0); });
    }

    /* Quem TEM setor definido vê só o dela — inclusive supervisora. Raylane e
       Danielle são supervisoras DO SETOR delas, não da clínica inteira; a regra
       anterior ("gestão vê tudo") devolvia os três pra elas.
       Os três setores ficam pra quem realmente cuida de todos: o master e quem
       está sem setor definido (aí não dá pra adivinhar qual mostrar). */
    /* Só o master vê os três. "Sem setor cadastrado" NÃO abre mais tudo: era
       essa exceção que fazia a Raylane seguir vendo consultas e terapias — o
       setor dela nunca chegou a ser gravado (o seed comparava o CPF cru e não
       achava ninguém), e a regra lia a falta de dado como permissão.
       Agora cadastro faltando ESCONDE os blocos de setor: fica visível, alguém
       reclama e se corrige — em vez de vazar em silêncio. O marketing tem os
       três setores marcados de propósito no cadastro. */
    const veTodosSetores = veGeral(req);
    const ordem = veTodosSetores
      ? [...setores, ...['vacinas', 'consultas', 'terapias'].filter(s => !setores.includes(s))]
      : setores;
    const porSetor = [];
    for (const s of ordem) porSetor.push(await confDe(s));

    /* 🏅 PRÊMIO PESSOAL (ordem do master, 22/08: "R$ 2.500 é somente para a
       Raylane; as demais, R$ 1.500"): configuracoes.metas.premiosPessoa =
       { "raylane": 2500 } sobrepõe o prêmio da mínima SÓ pra pessoa logada,
       e premiosMsg carrega o recado dela ("seu prêmio aumentou!"). */
    const premiosPessoaCfg = cfg[0]?.valor?.premiosPessoa || {};
    const premiosMsgCfg = cfg[0]?.valor?.premiosMsg || {};
    const chaveEu = String(req.user.nome || '').trim().split(/\s+/)[0].toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const premioEu = Math.max(0, parseFloat(premiosPessoaCfg[chaveEu]) || 0);
    const premioMsgEu = premiosMsgCfg[chaveEu] || null;
    if (premioEu > 0) for (const ps of porSetor) { ps.premioMinimo = premioEu; }

    /* 💵 DIÁRIAS CONQUISTADAS — o prêmio de consultas não é "bateu a mínima,
       ganhou R$ X": é R$ 100 POR DIA em que a meta do dia foi batida, até 26
       dias úteis = R$ 2.600 no mês (regra do master, cobrada por ele quando o
       placar mostrou R$ 1.500). Aqui contamos, dia a dia do mês, em quantos a
       pessoa marcou as 10 consultas — e o placar mostra o acumulado. */
    for (const ps of porSetor) {
      if (!(ps.premioDia > 0)) continue;
      const alvoDia = ps.setor === 'consultas' ? 10 : 1;
      const { rows: [dq] } = await query(
        `SELECT COUNT(*)::int dias FROM (
           SELECT (created_at - interval '3 hours')::date d, COUNT(*) n
             FROM agenda_eventos
            WHERE responsavel_id = $1 AND COALESCE(setor,'vacinas') = $2
              AND to_char(created_at - interval '3 hours','YYYY-MM') = to_char(NOW() - interval '3 hours','YYYY-MM')
              AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'
            GROUP BY 1 HAVING COUNT(*) >= $3) t`,
        [req.user.id, ps.setor, alvoDia]).catch(() => ({ rows: [{ dias: 0 }] }));
      const dias = dq?.dias || 0;
      ps.diarias = {
        conquistadas: dias,
        valor: +(dias * ps.premioDia).toFixed(2),
        teto_dias: 26,
        teto: +(26 * ps.premioDia).toFixed(2),
      };
    }
    // Topo = primeiro setor (compat com quem lê os campos direto); porSetor separa cada um.
    /* 🔒 Colega não vê o número da colega — nem por subtração (pedido do
       master). Raylane e Stefany dividem o setor de vacinas: se as duas veem o
       total do SETOR e cada uma sabe o próprio, descobrir o da outra é uma
       conta de menos. Fora da gestão, os valores em R$ do setor não são nem
       enviados: sobra a meta do dia (que já é individual) e a "Sua meta". */
    /* Supervisora ACUMULA dois papéis (esclarecido pelo master): é atendente do
       setor — com meta própria — e responde pelo setor. Então ela vê o TOTAL do
       setor dela (os setores já vêm filtrados acima), mas nunca a linha de cada
       colega: a Raylane não vê o número da Stefany, nem o contrário.
       Total do setor = trabalho dela. Número da colega = do master. */
    /* Ordem do master (22/08, depois do susto da Raylane: "lá em cima está um
       valor e dentro do caixa está outro"): mesmo a SUPERVISORA vê no placar
       só os números DELA — a barra mostra a produção própria e o "falta" é o
       dela, contra a meta dela. O total do setor em R$ é visão do master. */
    const podeValores = req.user.role === 'master';
    const porSetorSeguro = podeValores ? porSetor : porSetor.map(s => ({
      setor: s.setor, metaGlobal: s.metaGlobal, metaMinima: s.metaMinima,
      premio: s.premio, premioMinimo: s.premioMinimo, premioDia: s.premioDia,
      diarias: s.diarias || null,   // diária é o dinheiro DELA — sempre passa
      confirmado: null, recebido: null, aReceber: null,
      faltaMinima: null, faltaGlobal: null, pctMinima: null, pctGlobal: null,
    }));
    res.json({
      ...porSetorSeguro[0], porSetor: porSetorSeguro,
      multi: true, individual, focoDia, focoMes, mostra_valores: podeValores,
      premioMsg: premioMsgEu,   // 🏅 recado pessoal do prêmio (ex.: Raylane)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Planejamento (líder/gestão): progresso do setor rumo à meta de bônus (R$ 500k).
r.get('/planejamento', async (req, res) => {
  try {
    if (!(gestao(req) || req.user.lider)) return res.status(403).json({ error: 'Acesso restrito.' });
    const setor = ['vacinas', 'consultas', 'terapias'].includes(req.user.setor) ? req.user.setor : 'vacinas';
    const { rows: [r2] } = await query(
      `SELECT COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float confirmado
       FROM vendas WHERE COALESCE(setor,'vacinas') = $1 AND to_char(data_venda,'YYYY-MM') = to_char(NOW() - interval '3 hours','YYYY-MM')`, [setor]);
    const meta = 500000, conf = r2?.confirmado || 0;
    res.json({ setor, confirmado: conf, meta, pct: +((conf / meta) * 100).toFixed(1), falta: Math.max(meta - conf, 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


/* ─── ESTUDOS: conversas que a equipe escolheu estudar ────────────────────────
   Irmão dos Cases de Sucesso, e de propósito diferente dele: Cases é AUTOMÁTICO
   (toda conversa que virou venda entra sozinha). Aqui é CURADORIA — alguém
   olhou, achou que ensina alguma coisa e trouxe. Por isso cabe a venda perdida,
   a objeção que travou, o atendimento que a gente não quer repetir. O que mais
   ensina raramente é o que deu certo.

   As mensagens NÃO são copiadas: o estudo aponta para a conversa e lê ao vivo.
   Duplicar conversa de paciente por causa de estudo seria criar uma segunda
   cópia de dado clínico sem ninguém cuidando dela.

   Quem enxerga a conversa pode estudá-la (mesma regra de setor do Inbox, via
   podeVerSetor). Apagar estudo é gestão. */
const ESTUDO_STATUS = ['aberto', 'estudado', 'arquivado'];
const ESTUDO_TAGS = ['ganhou', 'perdeu', 'objecao', 'modelo', 'erro', 'duvida'];
const limparTags = (v) => (Array.isArray(v) ? v : []).filter(t => ESTUDO_TAGS.includes(t)).slice(0, 6);

// Conversa que este usuário pode ver — usada tanto para criar quanto para ler.
async function conversaVisivel(req, conversaId) {
  const { rows } = await query(
    `SELECT id, contact_name, phone, setor, responsavel_id, classificacao FROM conversas WHERE id = $1`, [conversaId]);
  const c = rows[0];
  if (!c) return null;
  return podeVerSetor(req.user, c) ? c : false;
}

r.get('/estudos', async (req, res) => {
  try {
    const { status, tag, busca } = req.query;
    const cond = [], params = [];
    if (ESTUDO_STATUS.includes(status)) { params.push(status); cond.push(`e.status = $${params.length}`); }
    if (ESTUDO_TAGS.includes(tag)) { params.push(tag); cond.push(`$${params.length} = ANY(e.tags)`); }
    if (String(busca || '').trim()) {
      params.push(`%${String(busca).trim()}%`);
      cond.push(`(e.titulo ILIKE $${params.length} OR e.motivo ILIKE $${params.length} OR e.contact_nome ILIKE $${params.length} OR e.aprendizado ILIKE $${params.length})`);
    }
    const { rows } = await query(
      `SELECT e.*, c.setor AS conv_setor, c.responsavel_id, c.last_message_at,
              (e.conversa_id IS NULL) AS conversa_sumiu
         FROM estudos e LEFT JOIN conversas c ON c.id = e.conversa_id
        ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
        ORDER BY e.status = 'arquivado', e.created_at DESC
        LIMIT 300`, params);
    // O filtro de setor é aplicado DEPOIS, na linha: estudo cuja conversa já
    // sumiu não tem setor para conferir e fica visível para a gestão.
    const out = rows.filter(x => x.conversa_sumiu ? gestao(req) : podeVerSetor(req.user, { setor: x.conv_setor, responsavel_id: x.responsavel_id }));
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/estudos', async (req, res) => {
  try {
    const b = req.body || {};
    const conversaId = String(b.conversa_id || '').trim();
    if (!conversaId) return res.status(400).json({ error: 'Informe a conversa.' });
    const conv = await conversaVisivel(req, conversaId);
    if (conv === null) return res.status(404).json({ error: 'Conversa não encontrada.' });
    if (conv === false) return res.status(403).json({ error: 'Essa conversa não é do seu setor.' });

    // Mover duas vezes a mesma conversa não cria duas fichas — atualiza o motivo.
    const { rows: [e] } = await query(
      `INSERT INTO estudos (conversa_id, contact_nome, setor, titulo, motivo, tags, criado_por, criado_por_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (conversa_id) DO UPDATE
         SET motivo = COALESCE(NULLIF(EXCLUDED.motivo, ''), estudos.motivo),
             titulo = COALESCE(NULLIF(EXCLUDED.titulo, ''), estudos.titulo),
             tags = CASE WHEN cardinality(EXCLUDED.tags) > 0 THEN EXCLUDED.tags ELSE estudos.tags END,
             status = CASE WHEN estudos.status = 'arquivado' THEN 'aberto' ELSE estudos.status END,
             updated_at = NOW()
       RETURNING *`,
      [conversaId, cut(conv.contact_name, 120), conv.setor || null,
       cut(b.titulo, 160) || cut(conv.contact_name, 120), cut(b.motivo, 2000),
       limparTags(b.tags), req.user.id, cut(req.user.nome, 120)]);
    res.status(201).json(e);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Estudo aberto: a ficha + a conversa lida AO VIVO.
r.get('/estudos/:id', async (req, res) => {
  try {
    const { rows: [e] } = await query('SELECT * FROM estudos WHERE id = $1', [req.params.id]);
    if (!e) return res.status(404).json({ error: 'Estudo não encontrado.' });

    let mensagens = [], conversa = null, aviso = null;
    if (e.conversa_id) {
      const conv = await conversaVisivel(req, e.conversa_id);
      if (conv === false) return res.status(403).json({ error: 'Essa conversa não é do seu setor.' });
      conversa = conv;
      const { rows } = await query(
        `SELECT from_type, type, content, sender_nome, created_at
           FROM mensagens WHERE conversa_id = $1 ORDER BY created_at ASC LIMIT 400`, [e.conversa_id]);
      mensagens = rows;
    } else {
      aviso = 'A conversa original foi excluída. O que a equipe aprendeu continua aqui.';
    }
    res.json({ estudo: e, conversa, mensagens, aviso });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/estudos/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const sets = [], params = []; let i = 1;
    const set = (c, v) => { sets.push(`${c} = $${i++}`); params.push(v); };
    if (b.titulo !== undefined) set('titulo', cut(b.titulo, 160));
    if (b.motivo !== undefined) set('motivo', cut(b.motivo, 2000));
    if (b.aprendizado !== undefined) set('aprendizado', cut(b.aprendizado, 6000));
    if (b.tags !== undefined) set('tags', limparTags(b.tags));
    if (b.status !== undefined && ESTUDO_STATUS.includes(b.status)) set('status', b.status);
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    params.push(req.params.id);
    const { rows: [e] } = await query(
      `UPDATE estudos SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, params);
    if (!e) return res.status(404).json({ error: 'Estudo não encontrado.' });
    res.json(e);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/estudos/:id', async (req, res) => {
  try {
    if (!gestao(req) && !req.user.lider) return res.status(403).json({ error: 'Só a gestão apaga estudo.' });
    await query('DELETE FROM estudos WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* A Vitta lê a conversa e diz o que viu. O prompt pede uma coisa incomum de
   propósito: APONTAR O QUE FALTOU, mesmo quando a venda aconteceu. Análise que
   só elogia não ensina ninguém — e a equipe para de ler na segunda vez. */
r.post('/estudos/:id/analisar', async (req, res) => {
  try {
    if (!temIA()) return res.status(503).json({ error: 'A Vitta está sem chave de IA configurada.' });
    const { rows: [e] } = await query('SELECT * FROM estudos WHERE id = $1', [req.params.id]);
    if (!e) return res.status(404).json({ error: 'Estudo não encontrado.' });
    if (!e.conversa_id) return res.status(410).json({ error: 'A conversa original foi excluída — não há o que ler.' });

    const conv = await conversaVisivel(req, e.conversa_id);
    if (conv === false) return res.status(403).json({ error: 'Essa conversa não é do seu setor.' });

    const { rows: msgs } = await query(
      `SELECT from_type, type, content, sender_nome, created_at
         FROM mensagens WHERE conversa_id = $1 ORDER BY created_at ASC LIMIT 250`, [e.conversa_id]);
    if (!msgs.length) return res.status(400).json({ error: 'Essa conversa não tem mensagens para analisar.' });

    const transcricao = msgs.map(m => {
      const quem = m.from_type === 'contact' ? 'CLIENTE' : (m.sender_nome || 'ATENDENTE');
      const texto = m.type === 'text' ? (m.content || '') : `[${m.type}]${m.content ? ' ' + m.content : ''}`;
      const dia = new Date(m.created_at).toISOString().slice(0, 10);
      return `[${dia}] ${quem}: ${String(texto).slice(0, 600)}`;
    }).join('\n').slice(0, 24000);

    const sys = `Você é a Vitta, assistente da Vittalis Saúde (clínica de pediatria e vacinação em São Luís-MA).
Analise o atendimento abaixo para a EQUIPE APRENDER com ele. Escreva em português do Brasil, direto, sem enrolação.

Regras da análise:
- Seja específico: cite a fala exata que fez diferença, não generalidades como "foi atencioso".
- APONTE O QUE FALTOU mesmo quando a venda aconteceu. Análise que só elogia não ensina ninguém.
- Se a família ficou sem resposta ou o atendimento demorou, diga com todas as letras.
- Não invente contexto que não está na conversa. Se faltou informação, diga que faltou.

Formato (markdown, títulos com ##):
## O que aconteceu — 2 a 3 linhas
## O que funcionou — no máximo 3 itens, com a fala citada
## O que faltou — no máximo 3 itens, com o momento em que faltou
## O que repetir da próxima vez — 1 a 3 frases prontas para a equipe usar`;

    const contexto = [
      e.motivo ? `Motivo pelo qual essa conversa foi trazida para estudo: ${e.motivo}` : null,
      e.tags?.length ? `Marcada como: ${e.tags.join(', ')}` : null,
    ].filter(Boolean).join('\n');

    const d = await openaiMessages({
      model: 'gpt-4o', max_tokens: 1600, system: sys,
      messages: [{ role: 'user', content: `${contexto ? contexto + '\n\n' : ''}CONVERSA:\n${transcricao}` }],
    });
    const analise = d?.choices?.[0]?.message?.content || d?.content || '';
    if (!analise) return res.status(502).json({ error: 'A Vitta não conseguiu responder agora.' });

    const { rows: [atualizado] } = await query(
      'UPDATE estudos SET analise = $1, analise_em = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *',
      [cut(analise, 12000), e.id]);
    res.json(atualizado);
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

/* ─── Planejamento: sugestões de pacotes a partir dos valores já praticados ─────
   Agrupa as vendas do setor da líder (últimos meses) por serviço e devolve o
   ticket médio + volume. A montagem dos pacotes (avulso/mensal/intensivo) é feita
   no front, a partir desses valores reais — nada de número inventado. */
r.get('/planejamento/pacotes', async (req, res) => {
  try {
    if (!podePlan(req)) return res.status(403).json({ error: 'Acesso restrito.' });
    const setor = ['vacinas', 'consultas', 'terapias'].includes(req.user.setor) ? req.user.setor : 'vacinas';
    const { rows } = await query(
      `SELECT COALESCE(NULLIF(TRIM(servico), ''), NULLIF(TRIM(categoria), ''), 'Serviço') AS servico,
              ROUND(AVG(valor)::numeric, 2)::float AS valor_medio,
              COUNT(*)::int AS qtd
         FROM vendas
        WHERE COALESCE(setor, 'vacinas') = $1 AND valor > 0
          AND data_venda >= (CURRENT_DATE - INTERVAL '120 days')
        GROUP BY 1
        ORDER BY qtd DESC, valor_medio DESC
        LIMIT 6`, [setor]);
    res.json({ setor, itens: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── Planejamento: anexos (documentos) da líder — arquivo em base64 ──────────── */
r.get('/planejamento/anexos', async (req, res) => {
  try {
    if (!podePlan(req)) return res.status(403).json({ error: 'Acesso restrito.' });
    const { rows } = await query(
      `SELECT id, nome, tipo, created_at, LENGTH(data_url) AS tamanho
         FROM planejamento_anexos WHERE usuario_id = $1 ORDER BY created_at DESC`, [req.user.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
r.get('/planejamento/anexos/:id', async (req, res) => {
  try {
    if (!podePlan(req)) return res.status(403).json({ error: 'Acesso restrito.' });
    const { rows: [a] } = await query(
      `SELECT nome, tipo, data_url FROM planejamento_anexos WHERE usuario_id = $1 AND id = $2`, [req.user.id, req.params.id]);
    if (!a) return res.status(404).json({ error: 'Não encontrado.' });
    res.json(a);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
r.post('/planejamento/anexos', async (req, res) => {
  try {
    if (!podePlan(req)) return res.status(403).json({ error: 'Acesso restrito.' });
    const b = req.body || {};
    const dataUrl = String(b.data_url || '');
    if (!dataUrl.startsWith('data:')) return res.status(400).json({ error: 'Arquivo inválido.' });
    if (dataUrl.length > 52 * 1024 * 1024) return res.status(413).json({ error: 'Arquivo muito grande (máx. ~40MB).' });
    const { rows: [a] } = await query(
      `INSERT INTO planejamento_anexos (usuario_id, nome, tipo, data_url)
       VALUES ($1,$2,$3,$4) RETURNING id, nome, tipo, created_at`,
      [req.user.id, cut(b.nome, 200) || 'arquivo', cut(b.tipo, 100), dataUrl]);
    res.status(201).json(a);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
r.delete('/planejamento/anexos/:id', async (req, res) => {
  try {
    if (!podePlan(req)) return res.status(403).json({ error: 'Acesso restrito.' });
    await query('DELETE FROM planejamento_anexos WHERE usuario_id = $1 AND id = $2', [req.user.id, req.params.id]);
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
             FROM vendas WHERE atendente_id = ANY($1) AND data_venda = (NOW() - interval '3 hours')::date GROUP BY atendente_id`, [ids]),
      query(`SELECT atendente_id, COUNT(*)::int n, COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float v
             FROM vendas WHERE atendente_id = ANY($1) AND to_char(data_venda,'YYYY-MM') = $2 GROUP BY atendente_id`, [ids, mes]),
      query(`SELECT sender_id, COUNT(*)::int n, COUNT(DISTINCT conversa_id)::int convs
             FROM mensagens WHERE sender_id = ANY($1) AND from_type = 'me' AND created_at >= (NOW() - interval '3 hours')::date + interval '3 hours' GROUP BY sender_id`, [ids]),
      query(`SELECT usuario_id, COUNT(*)::int n FROM audit_logs WHERE usuario_id = ANY($1) AND created_at >= (NOW() - interval '3 hours')::date + interval '3 hours' GROUP BY usuario_id`, [ids]),
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
  if (!temIA()) return FALLBACK_QUIZ;
  try {
    const ctx = CTX_SETOR[setor] || CTX_SETOR.geral;
    const sys = 'Você é um treinador de vendas de uma clínica de saúde (Vittalis Saúde) que cria quizzes curtos e práticos para as atendentes venderem melhor no WhatsApp. Responda APENAS um JSON válido, em português do Brasil.';
    const user = `Crie um quiz de 5 perguntas de múltipla escolha sobre VENDAS no dia a dia de uma atendente do setor de ${ctx}. As situações devem parecer conversas reais de WhatsApp (cliente com dúvida de preço, objeção, indecisão, pedido de desconto, etc.). Cada pergunta com 4 alternativas, só UMA correta, e uma explicação curta do porquê. Varie a dificuldade. Formato EXATO:
{"perguntas":[{"q":"pergunta","opcoes":["a","b","c","d"],"correta":0,"explicacao":"por que essa é a melhor"}]}`;
    const d = await openaiMessages({ model: 'gpt-4o-mini', max_tokens: 1400, json: true, system: sys, messages: [{ role: 'user', content: user }] });
    if (d.error) throw new Error(d.error.message || 'Erro na IA');
    const txt = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    let p = null;
    try { p = JSON.parse(txt || '{}'); } catch {}
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
const PAINEL_TIPOS = ['nota', 'tarefa', 'documento', 'cliente'];
r.get('/painel', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, tipo, titulo, conteudo, filename, mimetype, concluido, ordem, ref_id, telefone, created_at,
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
      if (b.arquivo.length > 52 * 1024 * 1024) return res.status(413).json({ error: 'Documento muito grande (máx. ~40MB).' });
    } else if (tipo === 'cliente') {
      if (!String(b.titulo || '').trim()) return res.status(400).json({ error: 'Cliente sem nome.' });
    } else if (!String(b.titulo || '').trim() && !String(b.conteudo || '').trim()) {
      return res.status(400).json({ error: 'Escreva um título ou conteúdo.' });
    }
    const { rows: [it] } = await query(
      `INSERT INTO painel_itens (usuario_id, tipo, titulo, conteudo, arquivo, filename, mimetype, ref_id, telefone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, tipo, titulo, conteudo, filename, mimetype, concluido, ordem, ref_id, telefone, created_at, (arquivo IS NOT NULL) AS tem_arquivo`,
      [req.user.id, tipo, cut(b.titulo, 200), cut(b.conteudo, 8000), tipo === 'documento' ? b.arquivo : null, cut(b.filename, 160), cut(b.mimetype, 80), cut(b.ref_id, 60), cut(b.telefone, 30)]);
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
       RETURNING id, tipo, titulo, conteudo, filename, mimetype, concluido, ordem, ref_id, telefone, created_at, (arquivo IS NOT NULL) AS tem_arquivo`, params);
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
const CHAVES_PASTA = ['fidelidade', 'banco_dados', 'planos_vacinais', 'vacinacao', 'consultas', 'terapias', 'tabela_precos_consultas', 'tabela_precos_vacinas', 'tabela_precos_terapias'];

/* ═══ 💲 TABELA DE PREÇOS — CONSULTAS (pedido do master) ═══════════════════════
   A equipe de consultas anexa as tabelas oficiais (PDF/planilha, via
   pasta-arquivos com a chave tabela_precos_consultas) e mantém aqui a lista de
   itens digitada — é dela que o orçamento é montado na tela. Gestão edita;
   a equipe do setor consulta e monta orçamento. */
/* 📲 RELATÓRIO EM PDF → WHATSAPP (pedido do master): o relatório emitido na
   tela tem o botão de enviar — o HTML chega aqui, vira PDF no servidor e sai
   pelo Z-API pro número escolhido. Gestão apenas. */
// Gera o PDF do relatório e devolve em base64 — o navegador abre a folha de
// compartilhar do aparelho com o arquivo anexado (WhatsApp entre as opções).
r.post('/relatorio-pdf', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Só a gestão emite relatórios.' });
    const html = String(req.body?.html || '');
    if (html.length < 100 || html.length > 900_000) return res.status(400).json({ error: 'Relatório inválido.' });
    const pdf = await htmlParaPDF(html, { formato: 'A4' });
    res.json({ pdf: pdf.toString('base64'), filename: `Relatorio-Vittalis-${new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)}.pdf` });
  } catch (err) { console.error('relatorio-pdf:', err.message); res.status(500).json({ error: 'Não consegui gerar o PDF agora.' }); }
});

r.post('/relatorio-pdf-whats', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Só a gestão envia relatórios.' });
    const html = String(req.body?.html || '');
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    if (html.length < 100 || html.length > 900_000) return res.status(400).json({ error: 'Relatório inválido.' });
    if (phone.length < 10) return res.status(400).json({ error: 'Informe o número com DDD (ex.: 98 91234-5678).' });
    const pdf = await htmlParaPDF(html, { formato: 'A4' });
    const ph55 = phone.startsWith('55') ? phone : `55${phone}`;
    const nomeArq = `Relatorio-Vittalis-${new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)}.pdf`;
    const zr = await zapiCall('/send-document/pdf', 'POST', {
      phone: ph55, document: `data:application/pdf;base64,${pdf.toString('base64')}`, fileName: nomeArq });
    if (!zr?.ok) return res.status(502).json({ error: 'O WhatsApp não aceitou o envio — confira o número.' });
    res.json({ ok: true });
  } catch (err) { console.error('relatorio-pdf-whats:', err.message); res.status(500).json({ error: 'Não consegui gerar/enviar agora.' }); }
});

/* 💎 CARTEIRA DE UPGRADE (vacinas): clientes com 2+ compras de PACOTE mensal
   e nenhum Plano — os candidatos naturais ao upgrade (máquina de vendas).
   Vacinas/gestão veem; cada linha aponta a conversa. */
/* 👶 RELATÓRIO: PLANOS COM BEBÊS ATÉ 9 MESES (pedido do master, 22/08 —
   "qualquer uma consegue pegar"): clientes com Plano Vacinal cuja criança tem
   até 9 meses de idade — a fase de mais doses pela frente. Aberto a toda a
   equipe logada; telefones seguem a máscara de privacidade das listas. */
r.get('/relatorio-planos-9m', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT DISTINCT ON (COALESCE(l.id::text, v.conversa_id, v.id))
             COALESCE(l.nome, v.paciente_nome, v.cliente_nome) paciente,
             COALESCE(l.responsavel_cliente, v.cliente_nome) responsavel,
             COALESCE(l.telefone, c.phone) phone,
             l.nascimento, v.data_venda, v.atendente_nome, v.valor,
             c.id conv_id, c.codigo
        FROM vendas v
        LEFT JOIN conversas c ON c.id = v.conversa_id
        LEFT JOIN leads l ON l.id = c.lead_id
       WHERE (v.categoria ILIKE '%plano%' OR v.servico ILIKE '%plano%')
         AND COALESCE(v.setor, 'vacinas') = 'vacinas'
         AND l.nascimento IS NOT NULL
         AND l.nascimento > (NOW() - interval '9 months')::date
         AND l.nascimento <= (NOW() - interval '0 days')::date
       ORDER BY COALESCE(l.id::text, v.conversa_id, v.id), v.data_venda DESC`).catch(() => ({ rows: [] }));
    const hoje = Date.now();
    const itens = rows.map(r2 => {
      const nasc = new Date(String(r2.nascimento).slice(0, 10) + 'T12:00:00Z');
      const meses = Math.floor((hoje - nasc.getTime()) / (30.44 * 86400000));
      return { ...r2, meses: Math.max(0, meses) };
    }).sort((a, b) => a.meses - b.meses);
    res.json({ itens: mascararLista(itens, req.user), total: itens.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/carteira-upgrade', async (req, res) => {
  try {
    const meusCU = await setoresDoUsuario(req);
    const podeCU = req.user.role === 'master' || meusCU.includes('vacinas');
    if (!podeCU) return res.status(403).json({ error: 'A Carteira de Upgrade é do setor de vacinas.' });
    const { rows } = await query(`
      SELECT c.id conv_id, c.contact_name, c.responsavel_id, u.nome resp_nome,
             COUNT(v.id)::int pacotes, MAX(v.data_venda) ultima, SUM(v.valor)::float total_gasto
      FROM vendas v
      JOIN conversas c ON c.id = v.conversa_id
      LEFT JOIN usuarios u ON u.id = c.responsavel_id
      WHERE (v.servico ILIKE '%pacote%' OR v.categoria ILIKE '%pacote%')
        AND COALESCE(v.setor, c.setor, 'vacinas') = 'vacinas'
        AND NOT EXISTS (SELECT 1 FROM vendas v2 WHERE v2.conversa_id = c.id
                          AND (v2.servico ILIKE '%plano%' OR v2.categoria ILIKE '%plano%'))
      GROUP BY 1, 2, 3, 4
      HAVING COUNT(v.id) >= 2
      ORDER BY COUNT(v.id) DESC, MAX(v.data_venda) DESC
      LIMIT 60`);
    res.json({ itens: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* 💡 CAMINHO DA META — dica estratégica por usuária (pedido do master, a
   primeira foi pra Raylane). Fica no cartão de perfil, visível todo dia.
   Editar: configuracoes.dicas_meta = { "primeironome": "frase" }. */
r.get('/dica-meta', async (req, res) => {
  try {
    const { rows: [c] } = await query("SELECT valor FROM configuracoes WHERE chave = 'dicas_meta'").catch(() => ({ rows: [] }));
    const chave = String(req.user.nome || '').trim().split(' ')[0].toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    res.json({ dica: (c?.valor || {})[chave] || null });
  } catch { res.json({ dica: null }); }
});

r.get('/tabela-precos', async (req, res) => {
  try {
    const { rows: [c] } = await query("SELECT valor FROM configuracoes WHERE chave = 'tabela_precos_consultas'").catch(() => ({ rows: [] }));
    // "por/em" mostram na tela quem publicou e quando — a equipe confia mais
    // num preço que ela sabe que está fresco.
    res.json({ itens: Array.isArray(c?.valor?.itens) ? c.valor.itens : [], por: c?.valor?.por || null, em: c?.valor?.em || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
r.put('/tabela-precos', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão edita a tabela de preços.' });
    const itens = (Array.isArray(req.body?.itens) ? req.body.itens : [])
      .map(i => ({
        id: String(i.id || Math.random().toString(36).slice(2, 10)),
        nome: cut(String(i.nome || '').trim(), 120),
        valor: Math.max(0, Math.min(parseFloat(String(i.valor).replace(',', '.')) || 0, 100000)),
        obs: cut(String(i.obs || '').trim(), 160) || null,
        categoria: cut(String(i.categoria || '').trim(), 60) || null,
        // Aba do item (pedido do master: tabela repartida igual Profissionais)
        setor: ['vacinas', 'consultas', 'terapias'].includes(i.setor) ? i.setor : 'consultas',
      }))
      .filter(i => i.nome)
      .slice(0, 200);
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('tabela_precos_consultas', $1::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify({ itens, por: req.user.nome, em: new Date().toISOString() })]);
    res.json({ ok: true, itens });
    /* 🧠 Preço mudou → a Vitta RE-TREINA sozinha em segundo plano (o manual
       dela cita valores; manual velho venderia com preço errado). Nunca atrasa
       nem derruba o salvamento da tabela. */
    if (temIA()) setImmediate(() => gerarBaseConsultas(`Vitta · tabela atualizada por ${req.user.nome}`).catch(e => console.error('re-treino pós-tabela:', e.message)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
/* 🧾 ORÇAMENTOS ENVIADOS — cada orçamento copiado/enviado fica registrado.
   É a memória da proposta: a gestão enxerga quantos saíram e por quem, e a
   atendente reencontra o que mandou ontem sem remontar do zero. */
r.post('/orcamentos', async (req, res) => {
  try {
    const b = req.body || {};
    const itens = (Array.isArray(b.itens) ? b.itens : []).slice(0, 60).map(i => ({
      nome: cut(String(i.nome || ''), 120), valor: parseFloat(i.valor) || 0, qtd: Math.max(1, parseInt(i.qtd) || 1),
    })).filter(i => i.nome);
    if (!itens.length) return res.status(400).json({ error: 'Orçamento sem itens.' });
    const { rows: [o] } = await query(`
      INSERT INTO orcamentos (criado_por, criado_por_nome, cliente_nome, conversa_id, itens, subtotal, desconto, total, parcelas)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9) RETURNING id, created_at`,
      [req.user.id, req.user.nome || '', cut(String(b.cliente_nome || '').trim(), 80) || null,
       b.conversa_id ? String(b.conversa_id) : null, JSON.stringify(itens),
       Math.max(0, parseFloat(b.subtotal) || 0), Math.max(0, parseFloat(b.desconto) || 0),
       Math.max(0, parseFloat(b.total) || 0), Math.max(1, Math.min(parseInt(b.parcelas) || 1, 12))]);
    res.json({ ok: true, id: o.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
r.get('/orcamentos', async (req, res) => {
  try {
    // Cada uma vê os SEUS orçamentos; a gestão vê os da casa toda.
    const souGestao = gestao(req);
    const { rows } = await query(`
      SELECT id, criado_por, criado_por_nome, cliente_nome, conversa_id, itens, subtotal, desconto, total, parcelas, fechado, venda_id, created_at
        FROM orcamentos ${souGestao ? '' : 'WHERE criado_por = $1'}
       ORDER BY created_at DESC LIMIT 30`, souGestao ? [] : [req.user.id]);
    res.json({ itens: rows, gestao: souGestao });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Sanitização única dos itens de orçamento (POST /orcamentos e PDF usam a mesma)
const itensOrcamento = (b) => (Array.isArray(b?.itens) ? b.itens : []).slice(0, 60).map(i => ({
  nome: cut(String(i.nome || '').trim(), 120), obs: i.obs ? cut(String(i.obs), 160) : null,
  valor: parseFloat(i.valor) || 0, qtd: Math.max(1, parseInt(i.qtd) || 1),
})).filter(i => i.nome);
/* 📄 Orçamento em PDF (baixar) — papel timbrado da Vittalis. O envio direto na
   conversa mora no inbox (/conversations/:id/orcamento-pdf), que conhece o
   WhatsApp; aqui é só gerar pra baixar/imprimir. */
r.post('/orcamentos/pdf', async (req, res) => {
  try {
    const b = req.body || {};
    const itens = itensOrcamento(b);
    if (!itens.length) return res.status(400).json({ error: 'Orçamento sem itens.' });
    const html = propostaGen.gerarHtmlOrcamentoServicos({
      itens, nomeCliente: cut(String(b.cliente_nome || '').trim(), 80) || '',
      subtotal: Math.max(0, parseFloat(b.subtotal) || 0), desconto: Math.max(0, parseFloat(b.desconto) || 0),
      total: Math.max(0, parseFloat(b.total) || 0), parcelas: Math.max(1, Math.min(parseInt(b.parcelas) || 1, 12)),
      atendente: String(req.user.nome || '').split(' ')[0],
    });
    const pdf = await htmlParaPDF(html);
    res.json({ pdf: pdf.toString('base64'), filename: 'Orcamento-Vittalis.pdf' });
  } catch (err) { console.error('PDF orçamento:', err.message); res.status(500).json({ error: 'Não consegui gerar o PDF agora — tente de novo.' }); }
});
/* 💰 Orçamento VIROU VENDA — fecha o ciclo sem redigitar: registra a venda no
   Caixa com os itens e o total do orçamento. A venda nasce no nome de QUEM
   MONTOU o orçamento (é dela a meta), no setor dela. */
r.post('/orcamentos/:id/virou-venda', async (req, res) => {
  try {
    const { rows: [o] } = await query('SELECT * FROM orcamentos WHERE id = $1', [req.params.id]);
    if (!o) return res.status(404).json({ error: 'Orçamento não encontrado.' });
    if (!gestao(req) && String(o.criado_por) !== String(req.user.id)) return res.status(403).json({ error: 'Só quem montou o orçamento (ou a gestão) fecha a venda.' });
    if (o.fechado) return res.json({ ok: true, ja_fechado: true, venda_id: o.venda_id });
    const { rows: [u] } = await query('SELECT setor, setores FROM usuarios WHERE id = $1', [o.criado_por]).catch(() => ({ rows: [null] }));
    const setor = u?.setor || (Array.isArray(u?.setores) && u.setores[0]) || 'consultas';
    const itens = Array.isArray(o.itens) ? o.itens : [];
    const servico = cut(itens.map(i => (i.qtd > 1 ? `${i.nome} (${i.qtd}x)` : i.nome)).join(' + '), 200) || 'Orçamento fechado';
    const forma = cut(String(req.body?.forma_pagamento || '').trim(), 40) || null;
    const { rows: [v] } = await query(`
      INSERT INTO vendas (conversa_id, atendente_id, atendente_nome, setor, cliente_nome, servico, valor, forma_pagamento, status_pagamento, data_venda, origem, observacao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pago',(NOW() - interval '3 hours')::date,'orcamento',$9)
      RETURNING id`,
      [o.conversa_id, o.criado_por, o.criado_por_nome, setor, o.cliente_nome, servico,
       parseFloat(o.total) || 0, forma, `Fechada a partir do orçamento (por ${req.user.nome})`]);
    await query('UPDATE orcamentos SET fechado = true, venda_id = $1 WHERE id = $2', [v.id, req.params.id]);
    res.json({ ok: true, venda_id: v.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
/* 🤖 IA LÊ A TABELA ANEXADA e devolve os itens prontos pro editor (gestão
   revisa e salva — a IA nunca grava direto no banco). Mata o retrabalho de
   anexar o PDF e depois digitar item por item. */
r.post('/tabela-precos/ler-anexo', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão importa a tabela.' });
    if (!temIA() || !usaClaude()) return res.status(400).json({ error: 'IA não configurada.' });
    const { rows: [a] } = await query(`SELECT nome, mimetype, arquivo FROM pasta_arquivos WHERE id = $1 AND chave LIKE 'tabela_precos_%'`, [String(req.body?.id || '')]);
    if (!a) return res.status(404).json({ error: 'Anexo não encontrado.' });
    const m = String(a.arquivo || '').match(/^data:([^;]+);base64,(.+)$/s);
    if (!m) return res.status(400).json({ error: 'Arquivo em formato inesperado.' });
    const mime = m[1]; const data = m[2].replace(/\s/g, '');
    if (data.length > 28_000_000) return res.status(400).json({ error: 'Arquivo grande demais pra IA ler — anexe uma versão menor (ou foto por página).' });
    let bloco = null;
    if (mime.startsWith('image/')) bloco = { type: 'image', source: { type: 'base64', media_type: mime, data } };
    else if (mime === 'application/pdf') bloco = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
    else return res.status(400).json({ error: 'A IA lê PDF ou foto — planilhas ainda não. Exporte em PDF e anexe.' });
    const client = await anthropicClient();
    const resp = await client.messages.create({
      model: CLAUDE_MODEL(), max_tokens: 8000,
      system: 'Você extrai tabelas de preços de uma clínica de saúde (Vittalis Saúde, São Luís-MA). Responda SOMENTE um JSON válido, sem markdown e sem texto extra.',
      messages: [{ role: 'user', content: [bloco, { type: 'text', text:
        `Extraia TODOS os serviços com preço deste arquivo e devolva exatamente neste formato:
{"itens":[{"nome":"Consulta Pediátrica","valor":350,"categoria":"Consultas","obs":"com a Dra. Ana ou null"}]}
Regras: valor em número (sem "R$"); categoria curta agrupando serviços parecidos (ex.: Consultas, Exames, Terapias, Pacotes); obs só se houver detalhe relevante (profissional, validade, condição), senão null. Não invente serviço nem preço que não estejam no arquivo.` }] }],
    });
    const txt = (resp.content || []).filter(bl => bl.type === 'text').map(bl => bl.text).join('')
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    let p = null; try { p = JSON.parse(txt || '{}'); } catch {}
    const itens = (Array.isArray(p?.itens) ? p.itens : []).slice(0, 200).map(i => ({
      id: Math.random().toString(36).slice(2, 10),
      nome: cut(String(i.nome || '').trim(), 120),
      valor: Math.max(0, Math.min(parseFloat(String(i.valor).replace(',', '.')) || 0, 100000)),
      categoria: cut(String(i.categoria || '').trim(), 60) || null,
      obs: i.obs ? cut(String(i.obs).trim(), 160) : null,
    })).filter(i => i.nome && i.valor > 0);
    if (!itens.length) return res.status(400).json({ error: 'Não achei serviços com preço nesse arquivo — confira se é mesmo a tabela.' });
    res.json({ itens, arquivo: a.nome });
  } catch (err) { console.error('ler-anexo tabela:', err.message); res.status(500).json({ error: 'A IA não conseguiu ler agora — tente de novo em instantes.' }); }
});
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

/* 📝 NOTAS DE PRECIFICAÇÃO (ordem do master, 02/09: "cada um possa anexar
   documentos e também escrever informações sobre precificação").

   É o combinado que não cabe numa linha de tabela: parcelamento, desconto de
   irmão, validade da promoção, o que entra e o que não entra no pacote. Antes
   isso vivia na cabeça de cada uma — e cada cliente ouvia uma versão.

   Uma nota por setor, escrita por qualquer pessoa da equipe, com o nome de
   quem escreveu e quando. Deixar aberto pra todas é decisão do master: quem
   está na ponta é quem descobre a dúvida que se repete. A assinatura é o que
   mantém a responsabilidade junto da liberdade. */
const SETORES_NOTA = ['vacinas', 'consultas', 'terapias'];

r.get('/tabela-precos/notas', async (req, res) => {
  try {
    const { rows: [c] } = await query("SELECT valor FROM configuracoes WHERE chave = 'tabela_precos_notas'")
      .catch(() => ({ rows: [] }));
    res.json(c?.valor || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/tabela-precos/notas', async (req, res) => {
  try {
    const setor = String(req.body?.setor || '');
    if (!SETORES_NOTA.includes(setor)) return res.status(400).json({ error: 'Setor inválido.' });
    const texto = cut(String(req.body?.texto || '').trim(), 4000);
    const { rows: [c] } = await query("SELECT valor FROM configuracoes WHERE chave = 'tabela_precos_notas'")
      .catch(() => ({ rows: [] }));
    const atual = c?.valor && typeof c.valor === 'object' ? c.valor : {};
    /* Nota vazia APAGA a do setor: sem isso ficaria um bloco em branco na tela
       da equipe, que é pior que não ter nota nenhuma. */
    if (texto) atual[setor] = { texto, por: req.user.nome, em: new Date().toISOString() };
    else delete atual[setor];
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('tabela_precos_notas', $1::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify(atual)]);
    res.json(atual);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/pasta-arquivos', async (req, res) => {
  try {
    const b = req.body || {};
    if (!CHAVES_PASTA.includes(b.chave)) return res.status(400).json({ error: 'Aba inválida.' });
    if (typeof b.arquivo !== 'string' || !b.arquivo.startsWith('data:')) return res.status(400).json({ error: 'Envie o arquivo (PDF, Word, imagem).' });
    if (b.arquivo.length > 52 * 1024 * 1024) return res.status(413).json({ error: 'Arquivo muito grande (máx. ~40MB).' });
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

/* ═══ 📖 DEVOCIONAL DO DIA — tema curado (estilo devocional diário), um por dia,
   IGUAL para toda a equipe. Gera uma vez, guarda em configuracoes e serve do
   cache o dia inteiro. Os temas rodam pelo dia do ano. ═══════════════════════ */
// 🎵 Louvores consagrados — um por dia, com link de BUSCA no YouTube (nunca quebra)
const LOUVORES = [
  ['Oceanos (Onde Meus Pés Podem Falhar)', 'Hillsong em Português'], ['Bondade de Deus', 'Isaias Saad'],
  ['Ousado Amor', 'Isaias Saad'], ['Lugar Secreto', 'Gabriela Rocha'], ['Teu Santo Nome', 'Gabriela Rocha'],
  ['Me Atraiu', 'Gabriela Rocha'], ['Raridade', 'Anderson Freire'], ['Deus é Deus', 'Delino Marçal'],
  ['A Casa É Sua', 'Casa Worship'], ['Céu na Terra', 'Casa Worship'], ['Aquieta Minh\'alma', 'Ministério Zoe'],
  ['Nada Além do Sangue', 'Fernandinho'], ['Faz Chover', 'Fernandinho'], ['Grandes Coisas', 'Fernandinho'],
  ['Uma Nova História', 'Fernandinho'], ['Sonda-me, Usa-me', 'Aline Barros'], ['Ressuscita-me', 'Aline Barros'],
  ['Casa do Pai', 'Aline Barros'], ['Advogado Fiel', 'Bruna Karla'], ['Espírito Santo', 'Fernanda Brum'],
  ['Tua Graça Me Basta', 'Davi Sacer'], ['No Caminho do Milagre', 'Davi Sacer'], ['Confio em Ti', 'Ludmila Ferber'],
  ['Nunca Pare de Lutar', 'Ludmila Ferber'], ['Os Sonhos de Deus', 'Ludmila Ferber'], ['Lindo És', 'Juliano Son'],
  ['Santo Espírito', 'Laura Souguellis'], ['Em Teus Braços', 'Laura Souguellis'], ['Quão Grande É o Meu Deus', 'Soraya Moraes'],
  ['Perto Quero Estar', 'Nívea Soares'], ['Rei do Meu Coração', 'Nívea Soares'], ['Aclame ao Senhor', 'Diante do Trono'],
  ['Águas Purificadoras', 'Diante do Trono'], ['Preciso de Ti', 'Diante do Trono'], ['Deus Proverá', 'Gabriela Gomes'],
  ['Deserto', 'Maria Marçal'], ['Ninguém Explica Deus', 'Preto no Branco'], ['Abraça-me', 'David Quinlan'],
  ['Atos 2', 'Gabriel Guedes'], ['Eu Navegarei', 'Harpa Cristã'],
];
function louvorDeHoje() {
  const agoraSLZ = new Date(Date.now() - 3 * 3600 * 1000);
  const dia = Math.floor((agoraSLZ - new Date(Date.UTC(agoraSLZ.getUTCFullYear(), 0, 0))) / 86400000);
  const [titulo, artista] = LOUVORES[dia % LOUVORES.length];
  return { titulo, artista, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${titulo} ${artista}`)}` };
}

// Pedido do master: o devocional nasce do VERSÍCULO DO DIA (o mesmo da barra
// lateral e da página inicial) — a IA cria o título/palavra a partir dele.
function temaDeHoje() {
  const { data, verso, ref } = versoDoDia();
  return { data, tema: ref, verso, ref };
}

r.get('/amigo/devocional-hoje', async (req, res) => {
  try {
    const { data, verso, ref } = temaDeHoje();
    const { rows: [c] } = await query("SELECT valor FROM configuracoes WHERE chave = 'devocional_dia'").catch(() => ({ rows: [] }));
    // Só serve do cache se for de hoje E no formato novo (nascido do verso do dia).
    // Master pode forçar um novo com ?regerar=1 (descarta o de hoje na hora).
    const forcar = req.query.regerar === '1' && req.user.role === 'master';
    if (!forcar && c?.valor?.data === data && c.valor.versiculo && c.valor.frase && c.valor.base === 'verso-dia') return res.json({ ...c.valor, louvor: louvorDeHoje() });
    const fallback = { data, tema: ref, ref, versiculo: verso, referencia: ref, louvor: louvorDeHoje(), texto: `${verso} (${ref}). Medite nessa palavra e leve-a com você durante o dia. 🙏` };
    if (!temIA()) return res.json(fallback);
    // Texto PREMIUM: gerado 1x/dia, então usa o modelo PRINCIPAL (mais capaz),
    // com instruções de escritor devocional — motivacional, sem clichê.
    const sys = `Você é um escritor devocional experiente e refinado (na linha de Max Lucado), escrevendo o devocional diário da equipe da Vittalis Saúde, uma clínica cristã de pediatria e vacinação em São Luís-MA. Português do Brasil impecável, tom caloroso, pastoral e MOTIVACIONAL — a equipe lê de manhã antes de atender famílias o dia inteiro; o devocional deve dar ânimo, foco e propósito pro dia de trabalho.

REGRAS DE ESCRITA (obrigatórias):
- O devocional NASCE do versículo do dia (fornecido). Cite-o fielmente.
- Crie um TÍTULO motivador curto (3 a 6 palavras) a partir do versículo — estilo "Renove suas forças hoje", "Deus no controle do seu dia".
- Reflexão com IMAGENS CONCRETAS do cotidiano (uma mãe na sala de espera, o telefone que não para, o cansaço do fim do dia) — nunca abstrações vazias.
- PROIBIDO clichê: nada de "Deus tem um propósito pra você", "basta ter fé", "tudo vai dar certo". Surpreenda com um ângulo novo do texto bíblico.
- Frases com ritmo: alterne curtas e longas. Uma ideia por frase.
- A "frase de ouro" deve ser memorável e citável — algo que a pessoa quer anotar.
- Aplicações REALIZÁVEIS no mesmo dia, específicas, com verbo de ação.
- Oração em primeira pessoa, íntima e concreta — não genérica.
Responda APENAS um JSON válido, sem markdown e sem asteriscos.`;
    const userMsg = `O versículo de hoje é: "${verso}" (${ref}). Crie o devocional de hoje A PARTIR desse versículo. Formato EXATO (texto puro em cada campo, sem formatação):
{"tema":"título motivador curto criado do versículo","versiculo":"texto fiel da passagem ${ref} (pode completar o trecho se o verso acima estiver resumido)","referencia":"${ref}","reflexao":"4 a 6 frases ligando a passagem à vida real, profundas, concretas e motivadoras","frase":"a frase de ouro: uma sentença curta e memorável que resume a mensagem","aplicacoes":["atitude prática e concreta pra hoje","outra atitude concreta","terceira atitude concreta"],"oracao":"oração íntima de 2-3 frases, em primeira pessoa"}`;
    const d = await openaiMessages({ model: 'gpt-4o', max_tokens: 4096, json: true, system: sys, messages: [{ role: 'user', content: userMsg }] });
    let j = null;
    try { j = JSON.parse(((d.content || []).filter(b => b.type === 'text').map(b => b.text).join('')).trim()); } catch {}
    const limpa = (t) => String(t || '').replace(/\*+/g, '').trim();
    if (d.error || !j?.versiculo || !j?.reflexao) return res.json(fallback);
    const valor = { data, base: 'verso-dia', tema: limpa(j.tema) || ref, ref, versiculo: limpa(j.versiculo), referencia: limpa(j.referencia) || ref,
      reflexao: limpa(j.reflexao), frase: limpa(j.frase),
      aplicacoes: (Array.isArray(j.aplicacoes) ? j.aplicacoes : []).slice(0, 3).map(limpa).filter(Boolean),
      oracao: limpa(j.oracao) };
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('devocional_dia', $1::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`, [JSON.stringify(valor)]).catch(() => {});
    res.json({ ...valor, louvor: louvorDeHoje() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/amigo/mensagem', async (req, res) => {
  try {
    const texto = String((req.body || {}).texto || '').trim();
    if (!texto) return res.status(400).json({ error: 'Escreva o que você precisa: um tema, um sentimento ou "palavra do dia".' });
    if (!temIA()) return res.status(400).json({ error: 'O devocional está indisponível no momento.' });
    await query(`INSERT INTO amigo_mensagens (usuario_id, role, content) VALUES ($1,'user',$2)`, [req.user.id, cut(texto, 4000)]);
    // Histórico recente pra dar contexto (últimas ~16 mensagens)
    const { rows: hist } = await query(`SELECT role, content FROM amigo_mensagens WHERE usuario_id = $1 ORDER BY created_at DESC LIMIT 16`, [req.user.id]);
    const mensagens = hist.reverse().map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) }));
    const primeiro = (req.user.nome || '').split(' ')[0];
    const sys = `Você é o "Meu Devocional", o devocional diário da equipe da Vittalis Saúde (clínica cristã de São Luís-MA). ${primeiro} veio buscar uma palavra de Deus. Sua missão: entregar UMA PALAVRA bíblica + APLICAÇÕES PRÁTICAS pra vida real, em português do Brasil, tom caloroso de devocional evangélico.

FORMATO da resposta (use exatamente estas seções, curtas — SEM asteriscos nem markdown, só o emoji e o título):
📖 A PALAVRA — um versículo ou passagem (texto + referência certa, ex.: Filipenses 4:6-7). Escolha algo que fale DIRETO ao tema/sentimento que ${primeiro} trouxe. Não repita versículos já usados na conversa.
💡 REFLEXÃO — 2 a 4 frases ligando a passagem à vida de ${primeiro} (trabalho, família, coração). Profundo mas simples, sem clichê.
✅ APLICAÇÕES DE HOJE — 2 ou 3 atitudes práticas e concretas pra viver essa palavra HOJE (numeradas). Bem específicas, ex.: "antes de responder aquela conversa difícil, respire e ore 10 segundos".
🙏 ORAÇÃO — uma oração curtinha (2-3 frases) sobre o tema.

Se ${primeiro} pedir "palavra do dia" sem tema, use o VERSÍCULO DE HOJE do devocional da equipe: "${temaDeHoje().verso}" (${temaDeHoje().ref}). Se fizer uma pergunta bíblica, responda com fidelidade à Bíblia e simplicidade. Se demonstrar sofrimento intenso ou pensamentos de se machucar: acolha com muito carinho, dê uma palavra de esperança, incentive procurar alguém de confiança e um profissional, e informe o CVV (ligue 188, 24h, gratuito). Use o nome ${primeiro} com naturalidade. Escreva com beleza e profundidade: imagens concretas do cotidiano, zero clichê ("basta ter fé", "tudo vai dar certo"), frases com ritmo.`;
    const d = await openaiMessages({ model: 'gpt-4o-mini', max_tokens: 700, system: sys, messages: mensagens });
    if (d.error) return res.status(400).json({ error: 'Não consegui buscar a palavra agora. Tenta de novo em instantes.' });
    const resposta = ((d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')).trim() || 'Estou aqui. Me diz que palavra você precisa hoje? 🙏';
    await query(`INSERT INTO amigo_mensagens (usuario_id, role, content) VALUES ($1,'assistant',$2)`, [req.user.id, cut(resposta, 4000)]);
    res.json({ resposta });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Lista de vendas (gestão vê tudo; atendente vê as suas). Filtros: setor, mes (YYYY-MM)
r.get('/vendas', async (req, res) => {
  try {
    const cond = [], params = []; let i = 1;
    /* Ordem do master (22/08, "em todos os lugares fidedigno"): fora o master
       (e o marketing com ve_geral), CADA UMA vê no Caixa só as próprias
       vendas — inclusive a supervisora. Assim o Caixa bate com o placar e
       com a meta dela, sem misturar número de colega. */
    if (req.user.role !== 'master' && !veGeral(req)) { cond.push(`atendente_id = $${i++}`); params.push(req.user.id); }
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
             v.conferido, v.conferido_em, v.conferido_por, v.repasse, v.ligou,
             (SELECT u.role FROM usuarios u WHERE u.id = v.atendente_id) AS atendente_role,
             COALESCE((SELECT COUNT(*) FROM venda_comprovantes c WHERE c.venda_id = v.id),0)::int n_comprovantes,
             v.created_at, v.updated_at
      FROM vendas v ${where} ORDER BY v.data_venda DESC, v.created_at DESC LIMIT 2000`, params);
    /* ⚖️ LIMIT 2000 (era 500): o total do Caixa é a SOMA das linhas listadas —
       num mês com mais de 500 vendas, as mais antigas caíam fora e o Caixa
       mostrava MENOS que o placar (mesma tabela, mesma régua, soma diferente).
       Achado na conferência do master (22/08): "veja se está batendo". */
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// REPASSES DO MÊS — extrato por atendente (1% das vendas da função atendente,
// respeitando ajuste manual por venda) + controle de pagamento (marcar pago).
r.get('/repasses-mes', async (req, res) => {
  try {
    // Quanto cada colega recebe é assunto do dono, não da supervisora de setor
    if (!veGeral(req)) return res.status(403).json({ error: 'Apenas a gestão e o marketing veem os repasses.' });
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : new Date().toISOString().slice(0, 7);
    const { rows } = await query(
      `SELECT v.atendente_id, COALESCE(NULLIF(v.atendente_nome,''), u.nome, '—') AS nome,
              COUNT(*)::int AS vendas,
              COALESCE(SUM(v.valor),0)::float AS vendido,
              COALESCE(SUM(CASE WHEN COALESCE(v.repasse,0) > 0 THEN v.repasse
                                WHEN u.role = 'atendente' THEN v.valor * 0.01
                                ELSE 0 END),0)::float AS repasse
         FROM vendas v LEFT JOIN usuarios u ON u.id = v.atendente_id
        WHERE to_char(v.data_venda,'YYYY-MM') = $1
        GROUP BY v.atendente_id, COALESCE(NULLIF(v.atendente_nome,''), u.nome, '—')
        ORDER BY 5 DESC`, [mes]);
    const { rows: pagos } = await query(`SELECT * FROM repasses_pagamentos WHERE mes = $1`, [mes]);
    const pagoPor = Object.fromEntries(pagos.map(p2 => [String(p2.atendente_id), p2]));
    const itens = rows.filter(x => (x.repasse || 0) > 0.004).map(x => ({
      ...x, repasse: +(+x.repasse).toFixed(2),
      pago: !!pagoPor[String(x.atendente_id)],
      pago_em: pagoPor[String(x.atendente_id)]?.pago_em || null,
      pago_por: pagoPor[String(x.atendente_id)]?.pago_por || null,
      valor_pago: pagoPor[String(x.atendente_id)] ? +pagoPor[String(x.atendente_id)].valor : null,
    }));
    res.json({ mes, itens, total: +itens.reduce((s2, x) => s2 + x.repasse, 0).toFixed(2) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/repasses-mes/pagar', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão.' });
    const b = req.body || {};
    const mes = /^\d{4}-\d{2}$/.test(b.mes || '') ? b.mes : null;
    if (!mes || !b.atendente_id) return res.status(400).json({ error: 'Informe mes e atendente.' });
    if (b.desfazer) {
      await query(`DELETE FROM repasses_pagamentos WHERE mes = $1 AND atendente_id = $2`, [mes, String(b.atendente_id)]);
      return res.json({ ok: true, desfeito: true });
    }
    const valor = Math.max(0, Math.min(parseFloat(b.valor) || 0, 1000000));
    await query(
      `INSERT INTO repasses_pagamentos (mes, atendente_id, atendente_nome, valor, pago_por)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (mes, atendente_id) DO UPDATE SET valor = EXCLUDED.valor, pago_em = NOW(), pago_por = EXCLUDED.pago_por`,
      [mes, String(b.atendente_id), cut(b.atendente_nome, 120), valor, req.user.nome]);
    res.json({ ok: true });
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

// CAIXA — EDITAR valores/dados de uma venda (gestão). Atualiza caixa/metas ao vivo.
r.patch('/vendas/:id', async (req, res) => {
  try {
    // Pedido do master: TODAS editam as vendas — cada atendente edita as suas;
    // gestão edita qualquer uma. Venda já conferida só a gestão mexe.
    const { rows: [vAtual] } = await query('SELECT atendente_id, conferido FROM vendas WHERE id = $1', [req.params.id]);
    if (!vAtual) return res.status(404).json({ error: 'Venda não encontrada' });
    const dona = String(vAtual.atendente_id) === String(req.user.id);
    if (!gestao(req) && !dona) return res.status(403).json({ error: 'Você só pode editar as suas vendas.' });
    if (!gestao(req) && vAtual.conferido) return res.status(403).json({ error: 'Venda já conferida pelo financeiro — peça à gestão.' });
    const b = req.body || {};
    const num = (v) => Math.max(0, Math.min(parseFloat(v) || 0, 100000000));
    const sets = [], params = []; let i = 1;
    if (b.valor !== undefined) { sets.push(`valor = $${i++}`); params.push(num(b.valor)); }
    if (b.desconto !== undefined) { sets.push(`desconto = $${i++}`); params.push(num(b.desconto)); }
    if (b.forma_pagamento !== undefined && FORMAS_PG.includes(b.forma_pagamento)) { sets.push(`forma_pagamento = $${i++}`); params.push(b.forma_pagamento); }
    if (b.status_pagamento !== undefined && STATUS_PG.includes(b.status_pagamento)) { sets.push(`status_pagamento = $${i++}`); params.push(b.status_pagamento); }
    if (b.data_venda !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(b.data_venda)) { sets.push(`data_venda = $${i++}`); params.push(b.data_venda); }
    if (b.servico !== undefined) { sets.push(`servico = $${i++}`); params.push(String(b.servico).slice(0, 120)); }
    if (b.cliente_nome !== undefined) { sets.push(`cliente_nome = $${i++}`); params.push(String(b.cliente_nome).slice(0, 80)); }
    if (b.paciente_nome !== undefined) { sets.push(`paciente_nome = $${i++}`); params.push(String(b.paciente_nome).slice(0, 80)); }
    if (b.setor !== undefined && ['vacinas', 'consultas', 'terapias'].includes(b.setor)) { sets.push(`setor = $${i++}`); params.push(b.setor); }
    if (b.categoria !== undefined) { sets.push(`categoria = $${i++}`); params.push(String(b.categoria).slice(0, 60)); }
    if (b.observacao !== undefined) { sets.push(`observacao = $${i++}`); params.push(String(b.observacao).slice(0, 300)); }
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    params.push(req.params.id);
    const { rows: [v] } = await query(`UPDATE vendas SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, params);
    if (!v) return res.status(404).json({ error: 'Venda não encontrada' });
    socketEmit('venda_registrada', { id: v.id, setor: v.setor, valor: v.valor, editada: true });
    res.json(v);
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
/* 💸 Fila de baixas aguardando o master */
r.get('/baixas-pendentes', async (req, res) => {
  try {
    const filtro = req.user.role === 'master' ? '' : `AND bp.solicitante_id = '${String(req.user.id).replace(/[^a-zA-Z0-9-]/g, '')}'`;
    const { rows } = await query(`
      SELECT bp.*, v.cliente_nome, v.valor, v.servico, v.categoria, v.data_venda
        FROM baixas_pendentes bp JOIN vendas v ON v.id = bp.venda_id
       WHERE bp.status = 'pendente' ${filtro}
       ORDER BY bp.created_at DESC LIMIT 50`).catch(() => ({ rows: [] }));
    res.json({ itens: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
r.post('/baixas-pendentes/:id/decidir', async (req, res) => {
  try {
    if (req.user.role !== 'master') return res.status(403).json({ error: 'Só o Dr. Miécio autoriza baixas.' });
    const aprovar = req.body?.aprovar === true;
    const { rows: [bp] } = await query(`SELECT * FROM baixas_pendentes WHERE id = $1 AND status = 'pendente'`, [req.params.id]);
    if (!bp) return res.status(404).json({ error: 'Solicitação não encontrada (ou já decidida).' });
    if (aprovar) {
      const { rows: [v] } = await query(`UPDATE vendas SET status_pagamento = 'pago', updated_at = NOW()
        WHERE id = $1 RETURNING id, setor, valor`, [bp.venda_id]);
      if (v) socketEmit('venda_registrada', { id: v.id, setor: v.setor, valor: v.valor });
    }
    await query(`UPDATE baixas_pendentes SET status = $1, decidido_por = $2, decidido_em = NOW() WHERE id = $3`,
      [aprovar ? 'aprovada' : 'negada', req.user.nome, bp.id]);
    await query(`INSERT INTO notificacoes (tipo, titulo, texto) VALUES ('info', $1, $2)`,
      [`💸 Baixa ${aprovar ? 'APROVADA ✅' : 'negada'} pelo Dr. Miécio`,
       `A baixa solicitada por ${bp.solicitante_nome} foi ${aprovar ? 'autorizada e aplicada' : 'negada'}.`]).catch(() => {});
    res.json({ ok: true, status: aprovar ? 'aprovada' : 'negada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.patch('/vendas/:id/receber', async (req, res) => {
  try {
    const { rows: [v] } = await query(`SELECT atendente_id, setor, valor, cliente_nome FROM vendas WHERE id = $1`, [req.params.id]);
    if (!v) return res.status(404).json({ error: 'Venda não encontrada' });
    /* 💸 BAIXA SUPERVISIONADA (ordem do master, 22/08): fora da gestão, SÓ a
       Jéssica (flag baixa_supervisionada) tem baixa manual — e a dela vira
       SOLICITAÇÃO: justificativa obrigatória + autorização do Dr. Miécio. */
    if (!gestao(req)) {
      const { rows: [euB] } = await query('SELECT baixa_supervisionada FROM usuarios WHERE id = $1', [req.user.id]).catch(() => ({ rows: [{}] }));
      if (!euB?.baixa_supervisionada) return res.status(403).json({ error: 'Baixa manual é da gestão. Se o pagamento caiu, avise a Jéssica ou o financeiro.' });
      const just = String((req.body || {}).justificativa || '').trim();
      if (just.length < 10) return res.status(400).json({ error: 'Justificativa obrigatória (mínimo 10 caracteres) — explique como o pagamento foi confirmado.' });
      const { rows: [jaPend] } = await query(`SELECT 1 FROM baixas_pendentes WHERE venda_id = $1 AND status = 'pendente' LIMIT 1`, [req.params.id]);
      if (jaPend) return res.status(409).json({ error: 'Esta venda já tem uma baixa aguardando autorização do Dr. Miécio.' });
      await query(`INSERT INTO baixas_pendentes (venda_id, solicitante_id, solicitante_nome, justificativa)
                   VALUES ($1,$2,$3,$4)`, [req.params.id, req.user.id, req.user.nome, just.slice(0, 400)]);
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('alerta', $1, $2, true)`,
        [`💸 ${String(req.user.nome).split(' ')[0]} pediu baixa manual`,
         `Venda de ${v.cliente_nome || 'cliente'} (R$ ${Number(v.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}). Justificativa: ${just.slice(0, 200)}. Aprove ou negue no Caixa, no cartão de baixas pendentes.`]).catch(() => {});
      return res.json({ pendente: true, mensagem: 'Solicitação enviada ao Dr. Miécio — a baixa aplica quando ele autorizar.' });
    }
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

// CAIXA — EXCLUIR uma venda (e seus comprovantes). Só gestão (master/supervisor).
// Remove a venda do faturamento/metas; emite socket para atualizar caixa e placar.
r.delete('/vendas/:id', async (req, res) => {
  try {
    // Liberado para toda a equipe (a venda fica arquivada em vendas_excluidas).
    const { rows: [v] } = await query('SELECT id, setor, valor FROM vendas WHERE id = $1', [req.params.id]);
    if (!v) return res.status(404).json({ error: 'Venda não encontrada' });
    // Arquiva a venda completa ANTES de excluir — nada se perde (recuperável).
    await query(
      `INSERT INTO vendas_excluidas (venda_id, dados, excluida_por)
       SELECT id, to_jsonb(vendas.*), $2 FROM vendas WHERE id = $1`,
      [req.params.id, req.user.nome || req.user.email || 'gestão']
    ).catch(() => {});
    // Apaga os comprovantes ligados (não há cascade nessa tabela) e a venda.
    await query('DELETE FROM venda_comprovantes WHERE venda_id = $1', [req.params.id]).catch(() => {});
    await query('DELETE FROM vendas WHERE id = $1', [req.params.id]);
    // Atualiza caixa/placar/metas em tempo real (mesmo evento do registro).
    socketEmit('venda_registrada', { id: v.id, setor: v.setor, valor: v.valor, excluida: true });
    res.json({ ok: true, id: v.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CAIXA — lista as vendas excluídas (arquivo, para conferência/recuperação). Só gestão.
r.get('/vendas/excluidas', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão.' });
    const { rows } = await query('SELECT * FROM vendas_excluidas ORDER BY excluida_em DESC LIMIT 200');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CAIXA — restaura uma venda excluída (volta para as contas). Só gestão.
r.post('/vendas/excluidas/:id/restaurar', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão.' });
    const { rows: [arq] } = await query('SELECT * FROM vendas_excluidas WHERE id = $1', [req.params.id]);
    if (!arq) return res.status(404).json({ error: 'Registro não encontrado' });
    // Reinsere a venda a partir do snapshot (não duplica se o id já existir).
    await query(
      `INSERT INTO vendas SELECT (jsonb_populate_record(null::vendas, $1)).* ON CONFLICT (id) DO NOTHING`,
      [arq.dados]
    );
    await query('DELETE FROM vendas_excluidas WHERE id = $1', [req.params.id]);
    socketEmit('venda_registrada', { id: arq.venda_id, setor: arq.dados?.setor, valor: arq.dados?.valor, restaurada: true });
    res.json({ ok: true, id: arq.venda_id });
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
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,(NOW() - interval '3 hours')::date),$7) RETURNING *`,
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
/* 📄 RELATÓRIO DO CAIXA COM OS COMPROVANTES (ordem do master, 28/08: "quero
   ter de cada setor e o total, e que cada setor ao puxar o relatório venha com
   o comprovante").

   Devolve o mês fechado por setor, o total da casa e a lista de vendas com o
   comprovante embutido — é o documento de conferência: cada linha de dinheiro
   com o papel do lado. Visão da clínica inteira, então SÓ MASTER.

   Cuidado com o peso: comprovante é imagem, e um mês inteiro passaria de
   centenas de MB. Vai um comprovante por venda (o primeiro), com teto de
   tamanho — o que passar do teto vem sinalizado, e o arquivo continua
   abrindo em vez de travar o navegador. */
/* 📋 PLANOS FECHADOS — o histórico de quem vende plano (ordem do master, 28/08:
   "já que ela fica com planos vacinais e planos terapêuticos, é importante que
   tenha um histórico separado: uma aba com todos os planos que foram fechados").

   Plano não é venda avulsa: é contrato, tem começo e continuidade. Separar dá
   à pessoa a noção do que ela construiu, e à casa a noção da carteira ativa.
   Cada uma vê os seus; gestão vê de todo mundo e pode filtrar por pessoa. */
const TIPOS_PLANO = { vacinal: 'Plano Vacinal', terapeutico: 'Terapia', fidelidade: 'Fidelidade Mensal' };
/* 🧭 PAINEL COMERCIAL (ordem do master, 28/08: "quero todas as funções dentro
   do usuário dela... que ela possa gerenciar os seus atendimentos e os de cada
   colaborador que está debaixo da cobertura dela").

   Junta numa resposta só o que hoje está espalhado: a fila, o dia da casa, o
   que cada pessoa está fazendo agora, como os leads foram repartidos e o que
   pede ação. Quem vê: master, supervisora e quem distribui. */
/* 💎 O QUE CHEIRA A NEGÓCIO GRANDE (ordem do master, 28/08: "ela fica com os
   planos vacinais e os planos terapêuticos"). A mesma régua da fila do chat —
   serve pra Danielle bater o olho e segurar o que é dela antes de distribuir. */
const PISTA_GRANDE = /(plano\s*vacinal|plano\s*fidelidade|pacote|todas as vacinas|calend[áa]rio|terapia|fono|psico|ocupacional|\baba\b|avalia[çc][ãa]o|acompanhamento|mensal)/i;

r.get('/painel-comercial', async (req, res) => {
  try {
    const podeVer = ['master', 'supervisor'].includes(req.user.role)
      || req.user.distribuidor === true || veGeral(req);
    if (!podeVer) return res.status(403).json({ error: 'Painel de gestão comercial.' });

    const HOJE = "(NOW() - interval '3 hours')::date";
    const DIA_TS = "((NOW() - interval '3 hours')::date + interval '3 hours')";
    const MES = "to_char(NOW() - interval '3 hours','YYYY-MM')";

    const [fila, semResp, agenda, vendasHoje, equipe, distrib, paradas, presenca, minhas,
           filaConvs, meusAtend] = await Promise.all([
      // Fila esperando distribuição (com o corte de 7 dias, igual à tela)
      query(`SELECT COUNT(*)::int n,
                    COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(last_message_at)))/60, 0)::int espera_max
               FROM conversas
              WHERE responsavel_id IS NULL AND COALESCE(arquivada,false) = false
                AND COALESCE(simulacao,false) = false AND categoria IS NULL
                AND last_message_at > NOW() - interval '7 days'`),
      // Clientes esperando resposta agora
      query(`SELECT COUNT(*)::int n,
                    COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(last_message_at)))/60, 0)::int espera_max
               FROM conversas
              WHERE last_from = 'contact' AND COALESCE(arquivada,false) = false
                AND COALESCE(simulacao,false) = false
                AND last_message_at > NOW() - interval '48 hours'`),
      query(`SELECT COUNT(*)::int n FROM agenda_eventos
              WHERE data = ${HOJE} AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'
                AND servico IS DISTINCT FROM 'Pós Vacinal'`),
      query(`SELECT COALESCE(SUM(valor),0)::float total, COUNT(*)::int n
               FROM vendas WHERE data_venda = ${HOJE}`),
      /* A linha de cada pessoa: o que tem na mão, o que está devendo e o que
         produziu hoje. É a leitura que transforma supervisão em ação. */
      query(`
        SELECT u.id, u.nome, u.cor, u.titulo, u.setor,
               (SELECT COUNT(*) FROM conversas c WHERE c.responsavel_id = u.id
                  AND COALESCE(c.arquivada,false) = false)::int abertas,
               (SELECT COUNT(*) FROM conversas c WHERE c.responsavel_id = u.id
                  AND c.last_from = 'contact' AND c.last_message_at > NOW() - interval '48 hours')::int sem_resposta,
               (SELECT COUNT(DISTINCT m.conversa_id) FROM mensagens m
                 WHERE m.sender_id = u.id AND m.from_type = 'me' AND m.created_at >= ${DIA_TS})::int atendeu_hoje,
               (SELECT COUNT(*) FROM agenda_eventos a WHERE a.responsavel_id = u.id AND a.data = ${HOJE}
                  AND LOWER(COALESCE(a.status,'')) NOT LIKE 'cancel%')::int agendou_hoje,
               (SELECT COALESCE(SUM(v.valor),0) FROM vendas v WHERE v.atendente_id = u.id AND v.data_venda = ${HOJE})::float vendeu_hoje,
               (SELECT COALESCE(SUM(v.valor),0) FROM vendas v WHERE v.atendente_id = u.id
                  AND to_char(v.data_venda,'YYYY-MM') = ${MES})::float vendeu_mes,
               COALESCE(u.meta_individual,0)::float meta
          FROM usuarios u
         WHERE u.ativo = true AND u.role IN ('atendente','supervisor')
           -- 🏛️ Donos da casa e 📣 marketing ficam fora: o painel acompanha
           -- quem tem CARTEIRA (01/09: "retira José e Carlos do painel").
           AND COALESCE(u.dono_casa,false) = false
           AND COALESCE(u.fora_do_painel,false) = false
         ORDER BY u.nome`),
      // Como os leads foram repartidos hoje
      query(`SELECT c.responsavel_id, u.nome, u.cor, COUNT(*)::int n
               FROM conversas c JOIN usuarios u ON u.id = c.responsavel_id
              WHERE c.responsavel_desde >= ${DIA_TS}
              GROUP BY 1,2,3 ORDER BY n DESC`).catch(() => ({ rows: [] })),
      // Conversas paradas: ninguém fala há 3 dias e não estão fechadas
      query(`SELECT COUNT(*)::int n FROM conversas
              WHERE responsavel_id IS NOT NULL AND COALESCE(arquivada,false) = false
                AND COALESCE(status_atend,'aberto') <> 'resolvido'
                AND last_message_at BETWEEN NOW() - interval '30 days' AND NOW() - interval '3 days'`),
      query(`SELECT usuario_id, status, ultimo_heartbeat FROM presenca`).catch(() => ({ rows: [] })),
      /* 💎 MINHAS NEGOCIAÇÕES (ordem do master, 28/08): quem fecha plano grande
         precisa ver DINHEIRO por etapa, não contagem de conversa. Junta a etapa
         do funil da conversa com o valor da proposta do lead, e mostra há
         quantos dias cada uma está parada — é onde o dinheiro esfria. */
      query(`
        SELECT COALESCE(NULLIF(c.funil_etapa,''), l.status, 'Sem etapa') AS etapa,
               COUNT(*)::int n,
               COALESCE(SUM(l.valor_proposta),0)::float valor,
               COUNT(*) FILTER (WHERE c.last_message_at < NOW() - interval '3 days')::int parados
          FROM conversas c
          LEFT JOIN leads l ON l.id = c.lead_id
         WHERE c.responsavel_id = $1
           AND COALESCE(c.arquivada,false) = false
           AND COALESCE(c.status_atend,'aberto') <> 'resolvido'
         GROUP BY 1 ORDER BY valor DESC, n DESC`, [req.user.id]).catch(() => ({ rows: [] })),
      /* 📥 AS DUAS FILEIRAS, LADO A LADO (ordem do master, 01/09).

         A da esquerda é a DISTRIBUIÇÃO: lead que chegou e ainda não tem dona.
         Só o que teve mensagem nos últimos 7 dias — o passado (quase 2 mil
         conversas de antes deste modelo) não cai no colo de ninguém. Quem
         espera há mais tempo vem primeiro: é quem está mais perto de desistir. */
      query(`
        SELECT c.id, c.contact_name, c.last_message, c.last_message_at, c.setor,
               EXTRACT(EPOCH FROM (NOW() - c.last_message_at))/60 AS min_espera
          FROM conversas c
         WHERE c.responsavel_id IS NULL AND COALESCE(c.arquivada,false) = false
           AND COALESCE(c.simulacao,false) = false AND c.categoria IS NULL
           AND c.last_message_at > NOW() - interval '7 days'
         ORDER BY c.last_message_at ASC LIMIT 60`).catch(() => ({ rows: [] })),
      /* A da direita é a carteira DELA: o que ficou no nome dela pra atender —
         plano vacinal e plano terapêutico, os negócios grandes que ela fecha.
         Aqui quem espera resposta sobe. */
      query(`
        SELECT c.id, c.contact_name, c.last_message, c.last_message_at, c.setor,
               c.last_from, c.funil_etapa, COALESCE(c.unread,0)::int unread,
               EXTRACT(EPOCH FROM (NOW() - c.last_message_at))/60 AS min_parada
          FROM conversas c
         WHERE c.responsavel_id = $1 AND COALESCE(c.arquivada,false) = false
           AND COALESCE(c.simulacao,false) = false
           AND c.last_message_at > NOW() - interval '90 days'
         ORDER BY (c.last_from = 'contact') DESC, c.last_message_at DESC
         LIMIT 60`, [req.user.id]).catch(() => ({ rows: [] })),
    ]);

    const pres = {};
    for (const p of presenca.rows) {
      const min = (Date.now() - new Date(p.ultimo_heartbeat).getTime()) / 60000;
      pres[String(p.usuario_id)] = min < 6 ? 'online' : min < 45 ? 'ausente' : 'offline';
    }

    const time = equipe.rows.map(u => ({
      ...u,
      vendeu_hoje: Number(u.vendeu_hoje) || 0,
      vendeu_mes: Number(u.vendeu_mes) || 0,
      meta: Number(u.meta) || 0,
      pct_meta: Number(u.meta) > 0 ? Math.round((Number(u.vendeu_mes) / Number(u.meta)) * 100) : null,
      recebeu_hoje: (distrib.rows.find(d => String(d.responsavel_id) === String(u.id)) || {}).n || 0,
      presenca: pres[String(u.id)] || 'offline',
    }));

    /* 🚨 O que pede ação — a lista que faz o painel virar trabalho, não enfeite */
    const alertas = [];
    const f = fila.rows[0] || {}; const sr = semResp.rows[0] || {};
    if (f.n > 0 && f.espera_max >= 15) {
      alertas.push({ nivel: 'alto', txt: `${f.n} lead(s) na fila — o mais antigo espera há ${Math.round(f.espera_max)} min`, acao: 'distribuir' });
    }
    for (const u of time) {
      if (u.sem_resposta >= 3) alertas.push({ nivel: 'alto', txt: `${u.nome.split(' ')[0]} com ${u.sem_resposta} clientes sem resposta`, quem: u.id });
      if (u.presenca === 'online' && u.atendeu_hoje === 0) alertas.push({ nivel: 'medio', txt: `${u.nome.split(' ')[0]} está online e ainda não respondeu ninguém hoje`, quem: u.id });
      if (u.recebeu_hoje === 0 && u.presenca !== 'offline') alertas.push({ nivel: 'baixo', txt: `${u.nome.split(' ')[0]} não recebeu nenhum lead hoje`, quem: u.id });
    }
    if ((paradas.rows[0] || {}).n > 0) {
      alertas.push({ nivel: 'medio', txt: `${paradas.rows[0].n} conversa(s) sem movimento há mais de 3 dias`, acao: 'ver' });
    }

    res.json({
      fila: { n: f.n || 0, espera_max: Math.round(f.espera_max || 0) },
      sem_resposta: { n: sr.n || 0, espera_max: Math.round(sr.espera_max || 0) },
      agendamentos_hoje: (agenda.rows[0] || {}).n || 0,
      vendas_hoje: { total: Number((vendasHoje.rows[0] || {}).total) || 0, n: (vendasHoje.rows[0] || {}).n || 0 },
      equipe: time,
      distribuicao_hoje: distrib.rows.map(d => ({ ...d, n: Number(d.n) })),
      paradas: (paradas.rows[0] || {}).n || 0,
      /* 💎 A carteira DELA por etapa: quantos, quanto vale e quantos pararam */
      minhas_negociacoes: (minhas.rows || []).map(x => ({
        etapa: x.etapa, n: x.n, valor: Number(x.valor) || 0, parados: x.parados,
      })),
      alertas: alertas.slice(0, 12),
      /* 🔎 A pista de negócio grande vai calculada daqui: a tela não precisa
         saber as palavras, e assim a régra vive num lugar só. */
      fila_conversas: (filaConvs.rows || []).map(c => ({
        id: c.id, nome: c.contact_name, ultima: c.last_message, setor: c.setor || null,
        min: Math.round(Number(c.min_espera) || 0),
        grande: PISTA_GRANDE.test(`${c.contact_name || ''} ${c.last_message || ''}`),
      })),
      meus_atendimentos: (meusAtend.rows || []).map(c => ({
        id: c.id, nome: c.contact_name, ultima: c.last_message, setor: c.setor || null,
        etapa: c.funil_etapa || null, unread: c.unread || 0,
        esperando: c.last_from === 'contact',
        min: Math.round(Number(c.min_parada) || 0),
      })),
    });
  } catch (err) {
    console.error('painel-comercial:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* 👤 O DOSSIÊ DE CADA COLABORADORA (ordem do master, 01/09: "do lado esquerdo o
   nome de cada uma das meninas, onde ela pode olhar tudo — com quem está
   conversando, quem já agendou, relatórios de produtividade do dia").

   O painel geral responde "como está a casa". Este responde "como está a
   FULANA": o que ela tem na mão agora, quem está esperando resposta, o que ela
   agendou, o que vendeu e a linha dos últimos dias. Tudo do mesmo lugar, pra
   Danielle cobrar com número na mão em vez de impressão. */
r.get('/painel-comercial/pessoa/:id', async (req, res) => {
  try {
    const podeVer = req.user.role === 'master' || req.user.distribuidor === true
      || ['master', 'supervisor'].includes(req.user.role) || veGeral(req);
    if (!podeVer) return res.status(403).json({ error: 'Painel de gestão comercial.' });

    const { rows: [u] } = await query(
      'SELECT id, nome, cor, titulo, setor, setores, meta_individual FROM usuarios WHERE id = $1',
      [req.params.id]);
    if (!u) return res.status(404).json({ error: 'Pessoa não encontrada.' });

    /* Período: hoje (padrão), 7 dias ou o mês. O "dia" da casa começa às 3h UTC
       porque São Luís é UTC-3 — sem isso, depois das 21h o relatório pula. */
    const per = ['hoje', '7d', 'mes'].includes(String(req.query.periodo)) ? String(req.query.periodo) : 'hoje';
    const HOJE = "(NOW() - interval '3 hours')::date";
    const DIA_TS = "((NOW() - interval '3 hours')::date + interval '3 hours')";
    const DE = per === 'hoje' ? HOJE
      : per === '7d' ? `(${HOJE} - interval '6 days')`
      : `date_trunc('month', ${HOJE})::date`;
    const DE_TS = per === 'hoje' ? DIA_TS : `((${DE})::date + interval '3 hours')`;

    const [resumo, conversas, agenda, vendas, parados, dias, etapas, fatias, porSetor] = await Promise.all([
      query(`
        SELECT
          (SELECT COUNT(*) FROM conversas c WHERE c.responsavel_id = $1
             AND COALESCE(c.arquivada,false) = false)::int abertas,
          (SELECT COUNT(*) FROM conversas c WHERE c.responsavel_id = $1
             AND c.last_from = 'contact' AND COALESCE(c.arquivada,false) = false
             AND c.last_message_at > NOW() - interval '48 hours')::int esperando,
          (SELECT COUNT(*) FROM conversas c WHERE c.responsavel_id = $1
             AND c.responsavel_desde >= ${DE_TS})::int recebeu,
          (SELECT COUNT(DISTINCT m.conversa_id) FROM mensagens m
            WHERE m.sender_id = $1 AND m.from_type = 'me' AND m.created_at >= ${DE_TS})::int atendeu,
          (SELECT COUNT(*) FROM mensagens m
            WHERE m.sender_id = $1 AND m.from_type = 'me' AND m.created_at >= ${DE_TS})::int mensagens,
          (SELECT COUNT(*) FROM agenda_eventos a WHERE a.responsavel_id = $1
             AND a.data >= ${DE} AND LOWER(COALESCE(a.status,'')) NOT LIKE 'cancel%'
             AND a.servico IS DISTINCT FROM 'Pós Vacinal')::int agendou,
          (SELECT COALESCE(SUM(v.valor),0) FROM vendas v WHERE v.atendente_id = $1
             AND v.data_venda >= ${DE})::float vendeu,
          (SELECT COUNT(*) FROM vendas v WHERE v.atendente_id = $1 AND v.data_venda >= ${DE})::int n_vendas,
          (SELECT COALESCE(SUM(v.valor),0) FROM vendas v WHERE v.atendente_id = $1
             AND to_char(v.data_venda,'YYYY-MM') = to_char(NOW() - interval '3 hours','YYYY-MM'))::float vendeu_mes,
          /* 📅 HOJE vai SEMPRE, mesmo com o filtro em 7 dias ou no mês (ordem do
             master, 01/09: "o quanto ele faturou hoje"). O período muda o resto
             do dossiê; o dia corrente é pergunta fixa da gestora. */
          (SELECT COALESCE(SUM(v.valor),0) FROM vendas v WHERE v.atendente_id = $1
             AND v.data_venda = ${HOJE})::float vendeu_hoje,
          (SELECT COUNT(*) FROM agenda_eventos a WHERE a.responsavel_id = $1 AND a.data = ${HOJE}
             AND LOWER(COALESCE(a.status,'')) NOT LIKE 'cancel%'
             AND a.servico IS DISTINCT FROM 'Pós Vacinal')::int agendou_hoje,
          (SELECT COUNT(DISTINCT m.conversa_id) FROM mensagens m
            WHERE m.sender_id = $1 AND m.from_type = 'me' AND m.created_at >= ${DIA_TS})::int atendeu_hoje`,
        [u.id]),
      /* 💬 COM QUEM ELA ESTÁ CONVERSANDO AGORA — a lista que o master pediu.
         Quem está esperando resposta vem primeiro, do mais antigo pro mais novo:
         é a fila de quem está mais perto de desistir. */
      /* 📋 A FILEIRA DE ATENDIMENTO INTEIRA (ordem do master, 01/09: "quando a
         master muda de usuário consegue ver as conversas que cada um está
         tendo; quero que ao clicar em cada um ela tenha esse acesso").

         Antes vinham só 25 — dava pra espiar, não pra supervisionar. Agora vem
         a carteira toda dos últimos 90 dias, com o não-lido, e a tela filtra
         e rola. É a mesma lista que a pessoa vê quando entra no sistema. */
      query(`
        SELECT c.id, c.contact_name, c.phone, c.last_from, c.last_message, c.last_message_at,
               c.funil_etapa, c.setor, COALESCE(c.unread,0)::int unread,
               EXTRACT(EPOCH FROM (NOW() - c.last_message_at))/60 AS min_parada
          FROM conversas c
         WHERE c.responsavel_id = $1 AND COALESCE(c.arquivada,false) = false
           AND COALESCE(c.simulacao,false) = false
           AND c.last_message_at > NOW() - interval '90 days'
         ORDER BY (c.last_from = 'contact') DESC, c.last_message_at DESC
         LIMIT 400`, [u.id]),
      query(`
        SELECT a.id, a.paciente, a.hora, a.servico, a.status, a.data, a.setor, a.conversa_id
          FROM agenda_eventos a
         WHERE a.responsavel_id = $1 AND a.data >= ${DE}
           AND a.servico IS DISTINCT FROM 'Pós Vacinal'
         ORDER BY a.data, a.hora LIMIT 40`, [u.id]),
      query(`
        SELECT v.id, v.cliente_nome, v.paciente_nome, v.servico, v.valor::float, v.data_venda,
               v.forma_pagamento, (v.comprovante IS NOT NULL) AS tem_comprovante
          FROM vendas v WHERE v.atendente_id = $1 AND v.data_venda >= ${DE}
         ORDER BY v.created_at DESC LIMIT 40`, [u.id]),
      // ⏳ O dinheiro que esfria: dela, sem movimento há 3 dias ou mais
      query(`
        SELECT c.id, c.contact_name, c.last_message_at, c.funil_etapa,
               EXTRACT(EPOCH FROM (NOW() - c.last_message_at))/86400 AS dias
          FROM conversas c
         WHERE c.responsavel_id = $1 AND COALESCE(c.arquivada,false) = false
           AND COALESCE(c.status_atend,'aberto') <> 'resolvido'
           AND c.last_message_at BETWEEN NOW() - interval '30 days' AND NOW() - interval '3 days'
         ORDER BY c.last_message_at LIMIT 20`, [u.id]),
      /* 📈 A linha dos últimos 14 dias: atendeu, agendou e vendeu por dia.
         É o que mostra ritmo — um dia fraco acontece, três seguidos é conversa. */
      query(`
        WITH d AS (
          SELECT generate_series(${HOJE} - interval '13 days', ${HOJE}, interval '1 day')::date dia
        )
        SELECT to_char(d.dia,'DD/MM') rotulo, d.dia,
               (SELECT COUNT(DISTINCT m.conversa_id) FROM mensagens m
                 WHERE m.sender_id = $1 AND m.from_type = 'me'
                   AND (m.created_at - interval '3 hours')::date = d.dia)::int atendeu,
               (SELECT COUNT(*) FROM agenda_eventos a WHERE a.responsavel_id = $1 AND a.data = d.dia
                  AND LOWER(COALESCE(a.status,'')) NOT LIKE 'cancel%'
                  AND a.servico IS DISTINCT FROM 'Pós Vacinal')::int agendou,
               (SELECT COALESCE(SUM(v.valor),0) FROM vendas v
                 WHERE v.atendente_id = $1 AND v.data_venda = d.dia)::float vendeu
          FROM d ORDER BY d.dia`, [u.id]).catch(() => ({ rows: [] })),
      // O funil dela: onde está cada conversa e quanto vale
      query(`
        SELECT COALESCE(NULLIF(c.funil_etapa,''), l.status, 'Sem etapa') AS etapa,
               COUNT(*)::int n, COALESCE(SUM(l.valor_proposta),0)::float valor
          FROM conversas c LEFT JOIN leads l ON l.id = c.lead_id
         WHERE c.responsavel_id = $1 AND COALESCE(c.arquivada,false) = false
           AND COALESCE(c.status_atend,'aberto') <> 'resolvido'
         GROUP BY 1 ORDER BY valor DESC, n DESC`, [u.id]).catch(() => ({ rows: [] })),
      /* 🥧 A PIZZA DOS ATENDIMENTOS (ordem do master, 01/09: "uma pizza de
         gráfico contendo todos atendimentos"). Três fatias que dizem o ESTADO
         de cada conversa na mão dela — é a leitura que vira cobrança:
         quem está esperando, quem está em conversa e quem esfriou. */
      query(`
        SELECT CASE
                 WHEN c.last_from = 'contact' THEN 'Esperando resposta'
                 WHEN c.last_message_at <= NOW() - interval '3 days' THEN 'Parado há +3 dias'
                 ELSE 'Em conversa'
               END AS fatia, COUNT(*)::int n
          FROM conversas c
         WHERE c.responsavel_id = $1 AND COALESCE(c.arquivada,false) = false
           AND COALESCE(c.simulacao,false) = false
           AND c.last_message_at > NOW() - interval '60 days'
         GROUP BY 1`, [u.id]).catch(() => ({ rows: [] })),
      // 🥧 E a mesma carteira repartida por setor
      query(`
        SELECT COALESCE(NULLIF(c.setor,''), 'Sem setor') AS fatia, COUNT(*)::int n
          FROM conversas c
         WHERE c.responsavel_id = $1 AND COALESCE(c.arquivada,false) = false
           AND COALESCE(c.simulacao,false) = false
           AND c.last_message_at > NOW() - interval '60 days'
         GROUP BY 1 ORDER BY n DESC`, [u.id]).catch(() => ({ rows: [] })),
    ]);

    const r0 = resumo.rows[0] || {};
    const meta = Number(u.meta_individual) || 0;
    res.json({
      pessoa: { id: u.id, nome: u.nome, cor: u.cor, titulo: u.titulo, setor: u.setor, setores: u.setores, meta },
      periodo: per,
      resumo: {
        abertas: r0.abertas || 0, esperando: r0.esperando || 0, recebeu: r0.recebeu || 0,
        atendeu: r0.atendeu || 0, mensagens: r0.mensagens || 0, agendou: r0.agendou || 0,
        vendeu: Number(r0.vendeu) || 0, n_vendas: r0.n_vendas || 0,
        vendeu_mes: Number(r0.vendeu_mes) || 0,
        vendeu_hoje: Number(r0.vendeu_hoje) || 0,
        agendou_hoje: r0.agendou_hoje || 0,
        atendeu_hoje: r0.atendeu_hoje || 0,
        falta_meta: meta > 0 ? Math.max(0, meta - (Number(r0.vendeu_mes) || 0)) : null,
        pct_meta: meta > 0 ? Math.round(((Number(r0.vendeu_mes) || 0) / meta) * 100) : null,
      },
      conversas: conversas.rows.map(c => ({
        id: c.id, nome: c.contact_name, ultima: c.last_message, de: c.last_from,
        etapa: c.funil_etapa || null, setor: c.setor || null, unread: c.unread || 0,
        esperando: c.last_from === 'contact',
        min: Math.round(Number(c.min_parada) || 0),
      })),
      agendamentos: agenda.rows.map(a => ({
        id: a.id, paciente: a.paciente, hora: a.hora, servico: a.servico,
        status: a.status, data: a.data, setor: a.setor, conversa_id: a.conversa_id,
      })),
      vendas: vendas.rows.map(v => ({
        id: v.id, cliente: v.cliente_nome || v.paciente_nome, servico: v.servico,
        valor: Number(v.valor) || 0, data: v.data_venda,
        forma: v.forma_pagamento, comprovante: v.tem_comprovante === true,
      })),
      parados: parados.rows.map(c => ({
        id: c.id, nome: c.contact_name, etapa: c.funil_etapa || null,
        dias: Math.floor(Number(c.dias) || 0),
      })),
      dias: dias.rows.map(x => ({ rotulo: x.rotulo, atendeu: x.atendeu, agendou: x.agendou, vendeu: Number(x.vendeu) || 0 })),
      etapas: etapas.rows.map(x => ({ etapa: x.etapa, n: x.n, valor: Number(x.valor) || 0 })),
      /* 🥧 Ordem FIXA das fatias: a cor segue o significado, nunca a posição no
         ranking — senão a mesma cor muda de dono quando o número vira. */
      pizza_situacao: ['Esperando resposta', 'Em conversa', 'Parado há +3 dias']
        .map(k => ({ fatia: k, n: (fatias.rows.find(r2 => r2.fatia === k) || {}).n || 0 }))
        .filter(x => x.n > 0),
      pizza_setor: ['vacinas', 'consultas', 'terapias', 'Sem setor']
        .map(k => ({ fatia: k, n: (porSetor.rows.find(r2 => r2.fatia === k) || {}).n || 0 }))
        .filter(x => x.n > 0),
    });
  } catch (err) {
    console.error('painel-comercial/pessoa:', err.message);
    res.status(500).json({ error: err.message });
  }
});

r.get('/planos-fechados', async (req, res) => {
  try {
    const cond = [], params = []; let i = 1;
    cond.push(`categoria = ANY($${i++})`);
    params.push(req.query.tipo && TIPOS_PLANO[req.query.tipo]
      ? [TIPOS_PLANO[req.query.tipo]] : Object.values(TIPOS_PLANO));

    // Cada uma vê os seus; gestão vê tudo e pode filtrar por pessoa
    if (!gestao(req) && !veGeral(req)) { cond.push(`atendente_id = $${i++}`); params.push(req.user.id); }
    else if (req.query.pessoa) { cond.push(`atendente_id = $${i++}`); params.push(req.query.pessoa); }

    // Ano, mês ou dia: o filtro mais fino manda (ordem do master, 28/08)
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.dia || '')) { cond.push(`data_venda = $${i++}`); params.push(req.query.dia); }
    else if (/^\d{4}-\d{2}$/.test(req.query.mes || '')) { cond.push(`to_char(data_venda,'YYYY-MM') = $${i++}`); params.push(req.query.mes); }
    else if (/^\d{4}$/.test(req.query.ano || '')) { cond.push(`to_char(data_venda,'YYYY') = $${i++}`); params.push(req.query.ano); }

    const where = `WHERE ${cond.join(' AND ')}`;
    const { rows: itens } = await query(`
      SELECT v.id, v.data_venda, v.categoria, v.cliente_nome, v.paciente_nome, v.servico,
             v.valor, v.desconto, v.forma_pagamento, v.status_pagamento, v.parcelas,
             v.atendente_id, v.atendente_nome, v.conferido, v.conversa_id,
             EXISTS (SELECT 1 FROM venda_comprovantes vc WHERE vc.venda_id = v.id) AS tem_comprovante
        FROM vendas v ${where}
       ORDER BY v.data_venda DESC, v.id DESC LIMIT 500`, params);

    // Resumo por tipo de plano — quantos, quanto e o ticket médio
    const { rows: resumo } = await query(`
      SELECT categoria, COUNT(*)::int n, COALESCE(SUM(valor),0)::float total,
             COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float recebido
        FROM vendas ${where} GROUP BY 1 ORDER BY total DESC`, params);

    // Por mês, pra desenhar a linha do tempo da carteira
    const { rows: porMes } = await query(`
      SELECT to_char(data_venda,'YYYY-MM') mes, COUNT(*)::int n, COALESCE(SUM(valor),0)::float total
        FROM vendas ${where} GROUP BY 1 ORDER BY 1 DESC LIMIT 13`, params);

    /* 📅 Dias do mês escolhido: é o calendário que o master pediu, pra ela
       clicar no dia e ver o que foi fechado ali. */
    let porDia = [];
    if (/^\d{4}-\d{2}$/.test(req.query.mes || '')) {
      const pDia = params.slice();
      ({ rows: porDia } = await query(`
        SELECT to_char(data_venda,'YYYY-MM-DD') dia, COUNT(*)::int n, COALESCE(SUM(valor),0)::float total
          FROM vendas ${where} GROUP BY 1 ORDER BY 1`, pDia).catch(() => ({ rows: [] })));
    }

    const soma = (c) => resumo.reduce((t, r2) => t + (Number(r2[c]) || 0), 0);
    res.json({
      por_dia: porDia.map(x => ({ ...x, total: Number(x.total) })),
      itens: itens.map(v => ({ ...v, valor: parseFloat(v.valor) || 0, desconto: parseFloat(v.desconto) || 0 })),
      resumo: resumo.map(r2 => ({ ...r2, total: Number(r2.total), recebido: Number(r2.recebido),
        ticket: r2.n ? Number(r2.total) / r2.n : 0 })),
      total: { n: soma('n'), total: soma('total'), recebido: soma('recebido'),
               ticket: soma('n') ? soma('total') / soma('n') : 0 },
      por_mes: porMes.map(m => ({ ...m, total: Number(m.total) })).reverse(),
      pode_filtrar_pessoa: gestao(req) || veGeral(req),
    });
  } catch (err) {
    console.error('planos-fechados:', err.message);
    res.status(500).json({ error: err.message });
  }
});

r.get('/caixa/relatorio', async (req, res) => {
  try {
    if (req.user.role !== 'master') return res.status(403).json({ error: 'Relatório da clínica inteira é do master.' });
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '')
      ? req.query.mes : new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7);
    const setor = ['vacinas', 'consultas', 'terapias'].includes(req.query.setor) ? req.query.setor : null;
    /* Setor da venda, deduzido da categoria quando o campo veio vazio (dado
       antigo). Montado por função, com e sem o prefixo da tabela: trocar por
       replace corromperia o texto 'sem setor' no fim da expressão. */
    const setorExpr = (pre = '') => `COALESCE(NULLIF(${pre}setor,''),
      CASE WHEN ${pre}categoria = 'Consulta' THEN 'consultas'
           WHEN ${pre}categoria = 'Terapia'  THEN 'terapias'
           WHEN ${pre}categoria IN ('Vacinação Geral','Plano Vacinal','Fidelidade Mensal') THEN 'vacinas'
      END, 'sem setor')`;
    const SETOR_VENDA = setorExpr();
    const SETOR_V = setorExpr('v.');

    // Resumo: cada setor e o total da casa (o total sempre vem, mesmo filtrando)
    const { rows: resumo } = await query(`
      SELECT ${SETOR_VENDA} AS setor,
             COUNT(*)::int n,
             COALESCE(SUM(valor),0)::float total,
             COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float recebido,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM venda_comprovantes vc WHERE vc.venda_id = vendas.id))::int com_comp
        FROM vendas WHERE to_char(data_venda,'YYYY-MM') = $1
       GROUP BY 1 ORDER BY total DESC`, [mes]);

    const { rows: vendas } = await query(`
      SELECT v.id, v.data_venda, v.cliente_nome, v.paciente_nome, v.servico, v.categoria,
             ${SETOR_V} AS setor,
             v.valor, v.desconto, v.forma_pagamento, v.status_pagamento, v.atendente_nome, v.conferido
        FROM vendas v
       WHERE to_char(v.data_venda,'YYYY-MM') = $1
         ${setor ? `AND ${SETOR_V} = $2` : ''}
       ORDER BY v.data_venda, v.id`, setor ? [mes, setor] : [mes]);

    /* Comprovantes: um por venda, com teto de 22 MB no total. Passou do teto,
       a venda vem marcada como "comprovante grande demais pra imprimir" — o
       relatório continua saindo, e o arquivo segue disponível no Caixa. */
    const TETO = 22 * 1024 * 1024;
    let peso = 0;
    const itens = [];
    for (const v of vendas) {
      const { rows: [c] } = await query(
        `SELECT data_url, nome, tipo FROM venda_comprovantes WHERE venda_id = $1 ORDER BY created_at LIMIT 1`,
        [v.id]).catch(() => ({ rows: [] }));
      let comprovante = null, pesado = false;
      if (c?.data_url) {
        if (peso + c.data_url.length <= TETO) { comprovante = c.data_url; peso += c.data_url.length; }
        else pesado = true;
      }
      itens.push({ ...v, valor: parseFloat(v.valor) || 0, desconto: parseFloat(v.desconto) || 0,
        comprovante, comprovante_nome: c?.nome || null, comprovante_pesado: pesado,
        sem_comprovante: !c });
    }

    const soma = (col) => resumo.reduce((t, r2) => t + (r2[col] || 0), 0);
    res.json({
      mes, setor,
      resumo: resumo.map(r2 => ({ ...r2, total: Number(r2.total), recebido: Number(r2.recebido) })),
      total: { n: soma('n'), total: soma('total'), recebido: soma('recebido'), com_comp: soma('com_comp') },
      itens,
      sem_comprovante: itens.filter(i => i.sem_comprovante).length,
    });
  } catch (err) {
    console.error('caixa/relatorio:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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
    if (b.comprovante.length > 52 * 1024 * 1024) return res.status(413).json({ error: 'Comprovante muito grande (máx. ~40MB).' });
    const { rows: [c] } = await query(
      `INSERT INTO venda_comprovantes (venda_id, data_url, nome, tipo, criado_por) VALUES ($1,$2,$3,$4,$5) RETURNING id, nome, tipo, created_at`,
      [req.params.id, b.comprovante, cut(b.filename, 160), cut(b.mimetype, 80), req.user.nome]);
    /* 👏 FESTA TAMBÉM NO COMPROVANTE (ordem do master, 28/08). Dinheiro
       comprovado é a venda de verdade — merece a mesma comemoração. */
    try {
      const { rows: [vd] } = await query('SELECT setor, valor, atendente_nome FROM vendas WHERE id = $1', [req.params.id]);
      const val = parseFloat(vd?.valor) || 0;
      socketEmit('celebracao', {
        tipo: 'setor', setor: vd?.setor || 'geral', festa: 'palmas',
        userId: req.user?.id, quem: vd?.atendente_nome || req.user?.nome,
        valorTxt: val > 0 ? val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '',
        titulo: '🧾 Pagamento comprovado!',
        texto: `${String(vd?.atendente_nome || req.user?.nome || 'A equipe').split(' ')[0]} anexou o comprovante`,
      });
    } catch (e) { console.error('celebracao comprovante:', e.message); }
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
/* 🔍 Núcleo da leitura de comprovante por IA — usado pelo botão manual e pela
   AUDITORIA AUTOMÁTICA (pedido do master: IA lê os comprovantes, autentica e
   sinaliza divergência pra gestão e pra quem registrou a venda). */
async function analisarComprovanteIA(comp, valorVenda, analisadoPor) {
  const sys = 'Você confere comprovantes de pagamento de uma clínica (Vittalis Saúde). Analise a imagem e responda APENAS um JSON válido, em português do Brasil, sem texto extra. Se a imagem não parecer um comprovante de pagamento verdadeiro (montagem, print de conversa, imagem aleatória), retorne parece_comprovante=false e explique na observacao.';
  const prompt = `Extraia os dados deste comprovante de pagamento e devolva exatamente:
{"parece_comprovante":true,"valor":0,"data":"YYYY-MM-DD ou null","pagador":"nome ou null","recebedor":"nome ou null","forma":"Pix|Cartão|Dinheiro|TED|Boleto|null","instituicao":"banco/instituição ou null","suspeita_fraude":false,"observacao":"1 frase"}
O valor esperado desta venda é R$ ${valorVenda.toFixed(2)} — não force esse número; extraia o que estiver na imagem. Marque suspeita_fraude=true se houver sinais de edição, fonte inconsistente, dados cortados ou layout que não bate com a instituição.`;
  let par = null;
  if (usaClaude()) {
    const mImg = String(comp.data_url || '').match(/^data:([^;]+);base64,(.+)$/s);
    if (!mImg) return null;
    const client = await anthropicClient();
    const resp = await client.messages.create({
      model: CLAUDE_MODEL_MINI(), max_tokens: 1024,
      system: sys + ' Responda SOMENTE o JSON, sem markdown.',
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mImg[1], data: mImg[2].replace(/\s/g, '') } },
        { type: 'text', text: prompt },
      ] }],
    });
    const txt = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try { par = JSON.parse(txt || '{}'); } catch { par = null; }
  } else if (process.env.OPENAI_API_KEY) {
    const { default: fetch } = await import('node-fetch');
    const body = {
      model: 'gpt-4o-mini', max_tokens: 500, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sys }, { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: comp.data_url } }] }],
    };
    const r2 = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify(body),
    });
    const d = await r2.json();
    if (d.error) return null;
    try { par = JSON.parse(d.choices?.[0]?.message?.content || '{}'); } catch { par = null; }
  }
  if (!par) return null;
  const valorExtraido = parseFloat(par.valor) || 0;
  const confere = !!par.parece_comprovante && !par.suspeita_fraude
    && valorExtraido > 0 && Math.abs(valorExtraido - valorVenda) <= Math.max(1, valorVenda * 0.02);
  return {
    parece_comprovante: !!par.parece_comprovante,
    valor: valorExtraido, data: par.data || null, pagador: par.pagador || null, recebedor: par.recebedor || null,
    forma: par.forma || null, instituicao: par.instituicao || null,
    suspeita_fraude: !!par.suspeita_fraude, observacao: par.observacao || null,
    valor_venda: valorVenda, confere, analisado_por: analisadoPor,
  };
}

/* 🕵️ AUDITORIA AUTOMÁTICA DOS COMPROVANTES — a cada 30 min a IA lê os
   comprovantes recém-anexados que ainda não foram analisados. Divergência
   (não parece comprovante, valor não bate ou suspeita de fraude) entra na
   caixa de sinalização do Caixa (gestão vê tudo; quem registrou vê a sua)
   e alerta o master no sino. */
async function auditarComprovantes() {
  try {
    if (!usaClaude() && !process.env.OPENAI_API_KEY) return;
    const { rows } = await query(`
      SELECT vc.id, vc.data_url, vc.tipo, v.id v_id, v.valor v_valor, v.cliente_nome, v.atendente_nome
        FROM venda_comprovantes vc JOIN vendas v ON v.id = vc.venda_id
       WHERE vc.analise IS NULL AND vc.tipo LIKE 'image%'
         AND vc.created_at > NOW() - interval '7 days'
       ORDER BY vc.created_at LIMIT 4`).catch(() => ({ rows: [] }));
    for (const c of rows) {
      const analise = await analisarComprovanteIA(c, parseFloat(c.v_valor) || 0, 'Vitta · Auditoria automática');
      if (!analise) {
        await query(`UPDATE venda_comprovantes SET analise = '{"erro":"não foi possível analisar"}'::jsonb WHERE id = $1`, [c.id]).catch(() => {});
        continue;
      }
      await query(`UPDATE venda_comprovantes SET analise = $1::jsonb WHERE id = $2`, [JSON.stringify(analise), c.id]).catch(() => {});
      if (!analise.confere) {
        const motivo = !analise.parece_comprovante ? 'a imagem não parece um comprovante de pagamento'
          : analise.suspeita_fraude ? 'há sinais de possível adulteração na imagem'
          : `o valor lido (R$ ${analise.valor.toFixed(2)}) não bate com a venda (R$ ${(parseFloat(c.v_valor) || 0).toFixed(2)})`;
        await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('alerta', $1, $2, true)`,
          [`🕵️ Comprovante com divergência — ${String(c.atendente_nome || '').split(' ')[0] || 'venda'}`,
           `Na venda de ${c.cliente_nome || 'cliente'} (${c.atendente_nome || 'sem atendente'}): ${motivo}. Veja na caixa de sinalização do Caixa.`]).catch(() => {});
      }
    }
    if (rows.length) console.log(`🕵️ Auditoria de comprovantes: ${rows.length} analisado(s)`);
  } catch (e) { console.error('auditoria comprovantes:', e.message); }
}
setInterval(auditarComprovantes, 30 * 60 * 1000);
setTimeout(auditarComprovantes, 240000);

/* 🚨 Caixa de sinalização: comprovantes reprovados pela IA. Gestão vê todos;
   quem registrou a venda vê os dela (pedido do master: "todos que registraram
   aquela venda possam olhar"). */
r.get('/comprovantes/divergencias', async (req, res) => {
  try {
    const soMinhas = gestao(req) ? '' : `AND v.atendente_id = '${String(req.user.id).replace(/[^a-zA-Z0-9-]/g, '')}'`;
    const { rows } = await query(`
      SELECT vc.id, vc.venda_id, vc.analise, vc.created_at,
             v.cliente_nome, v.valor, v.atendente_nome, v.data_venda
        FROM venda_comprovantes vc JOIN vendas v ON v.id = vc.venda_id
       WHERE vc.analise IS NOT NULL
         AND ((vc.analise->>'parece_comprovante') = 'false' OR (vc.analise->>'confere') = 'false')
         AND vc.created_at > NOW() - interval '60 days' ${soMinhas}
       ORDER BY vc.created_at DESC LIMIT 50`).catch(() => ({ rows: [] }));
    res.json({ itens: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/vendas/:id/comprovantes/:compId/analisar', async (req, res) => {
  try {
    if (!temIA()) return res.status(400).json({ error: 'IA não configurada.' });
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
    let p = null;
    if (usaClaude()) {
      // Claude com visão nativa: envia a imagem como bloco base64
      const mImg = String(c.data_url || '').match(/^data:([^;]+);base64,(.+)$/s);
      if (!mImg) return res.status(400).json({ error: 'Comprovante em formato inesperado.' });
      const client = await anthropicClient();
      const resp = await client.messages.create({
        model: CLAUDE_MODEL_MINI(), max_tokens: 1024,
        system: sys + ' Responda SOMENTE o JSON, sem markdown.',
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mImg[1], data: mImg[2].replace(/\s/g, '') } },
          { type: 'text', text: prompt },
        ] }],
      });
      const txt = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      try { p = JSON.parse(txt || '{}'); } catch {}
    } else {
      const body = {
        model: 'gpt-4o-mini', max_tokens: 500, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: sys }, { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: c.data_url } }] }],
      };
      const r2 = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify(body),
      });
      const d = await r2.json();
      if (d.error) return res.status(400).json({ error: erroIA(d.error) });
      try { p = JSON.parse(d.choices?.[0]?.message?.content || '{}'); } catch {}
    }
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
    /* Painel comercial: o master (e o marketing com ve_geral) vê a CASA; todo
       o resto vê o próprio recorte — cada uma controla a própria meta e as
       próprias vendas (ordem do master, 22/08: "em todos os lugares
       fidedigno"). O soMinhas logo abaixo faz o corte. */
    /* ⚖️ RÉGUA ÚNICA (auditoria de 16/08): este endpoint contava só o PAGO
       enquanto o placar (/meta-setor) conta VENDIDO — o mesmo "faturamento do
       mês" dava dois valores conforme a tela. Agora: confirmado = TODA venda
       fechada; recebido/pendente é a decomposição (pendente = vendido -
       recebido, sem lista de status que esquece um). Mês em fuso de São Luís
       (toISOString é UTC: virava o mês às 21h do último dia). E setor com
       COALESCE: venda sem setor aparecia no placar e SUMIA daqui. */
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes
      : new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7);
    const soMinhas = (req.user.role === 'master' || veGeral(req)) ? '' : `AND atendente_id = '${String(req.user.id).replace(/[^a-zA-Z0-9-]/g, '')}'`;
    const [vendasSetor, porAtendente, porCategoria, agSetor, cfg] = await Promise.all([
      query(`SELECT COALESCE(setor,'vacinas') setor,
          COALESCE(SUM(valor),0)::float confirmado,
          COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float recebido,
          COALESCE(SUM(valor) FILTER (WHERE status_pagamento NOT IN ('pago','cortesia')),0)::float pendente,
          COALESCE(SUM(desconto),0)::float desconto,
          COUNT(*)::int n
        FROM vendas WHERE to_char(data_venda,'YYYY-MM') = $1 ${soMinhas} GROUP BY 1`, [mes]),
      query(`SELECT COALESCE(NULLIF(TRIM(u.nome),''), NULLIF(TRIM(v.atendente_nome),''), 'Sem responsável') nome,
              COALESCE(SUM(v.valor),0)::float confirmado, COUNT(*)::int n
              FROM vendas v LEFT JOIN usuarios u ON u.id = v.atendente_id
              WHERE to_char(v.data_venda,'YYYY-MM') = $1 ${soMinhas.replace('atendente_id', 'v.atendente_id')} GROUP BY 1 ORDER BY confirmado DESC`, [mes]),
      query(`SELECT categoria, COALESCE(SUM(valor),0)::float confirmado, COUNT(*)::int n
              FROM vendas WHERE to_char(data_venda,'YYYY-MM') = $1 ${soMinhas} GROUP BY categoria ORDER BY confirmado DESC`, [mes]),
      query(`SELECT COALESCE(setor,'vacinas') setor, COALESCE(SUM(valor),0)::float agendado FROM agenda_eventos
              WHERE to_char(data,'YYYY-MM') = $1 AND status IN ('Agendado','Confirmado','Reagendado') AND valor IS NOT NULL GROUP BY setor`, [mes]),
      query("SELECT valor FROM configuracoes WHERE chave = 'metas'"),
    ]);
    /* Meta exibida = MÍNIMA do setor (ordem do master: a mínima é a régua na
       frente da equipe). Era daqui que saía o "R$ 759.000" do card Geral
       enquanto a faixa dividia por R$ 300.000 — 3% e 8,4% pro MESMO dinheiro. */
    const minimasR = cfg.rows[0]?.valor?.minimas || {};
    const metaV = Object.fromEntries(SET3.map(s2 => [s2, Math.max(0, parseFloat(minimasR[s2]) || 100000)]));
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

// ─── METAS DE FATURAMENTO POR SETOR (mínima e global, em R$) ─────────────────
r.get('/vendas/metas-faturamento', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão.' });
    const { rows: cfg } = await query("SELECT valor FROM configuracoes WHERE chave = 'metas'");
    const minimas = cfg[0]?.valor?.minimas || {};
    const globais = cfg[0]?.valor?.globais || {};
    const premios = cfg[0]?.valor?.premios || {};
    const premiosMin = cfg[0]?.valor?.premiosMin || {};
    const preencher = (o, padrao) => ({ vacinas: parseFloat(o.vacinas) || padrao, consultas: parseFloat(o.consultas) || padrao, terapias: parseFloat(o.terapias) || padrao });
    res.json({ minimas: preencher(minimas, 100000), globais: preencher(globais, 500000), premios: preencher(premios, 10000), premiosMin: preencher(premiosMin, 1500) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/vendas/metas-faturamento', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão define metas.' });
    const b = req.body || {};
    const clamp = (v, padrao) => Math.max(0, Math.min(parseFloat(v) || padrao, 100000000));
    const minimas = { vacinas: clamp(b.minimas?.vacinas, 100000), consultas: clamp(b.minimas?.consultas, 100000), terapias: clamp(b.minimas?.terapias, 100000) };
    const globais = { vacinas: clamp(b.globais?.vacinas, 500000), consultas: clamp(b.globais?.consultas, 500000), terapias: clamp(b.globais?.terapias, 500000) };
    const premios = { vacinas: clamp(b.premios?.vacinas, 10000), consultas: clamp(b.premios?.consultas, 10000), terapias: clamp(b.premios?.terapias, 10000) };
    const premiosMin = { vacinas: clamp(b.premiosMin?.vacinas, 1500), consultas: clamp(b.premiosMin?.consultas, 1500), terapias: clamp(b.premiosMin?.terapias, 1500) };
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('metas', jsonb_build_object('minimas', $1::jsonb, 'globais', $2::jsonb, 'premios', $3::jsonb, 'premiosMin', $4::jsonb))
                 ON CONFLICT (chave) DO UPDATE SET valor = jsonb_set(jsonb_set(jsonb_set(jsonb_set(COALESCE(configuracoes.valor,'{}'::jsonb), '{minimas}', $1::jsonb), '{globais}', $2::jsonb), '{premios}', $3::jsonb), '{premiosMin}', $4::jsonb), updated_at = NOW()`,
      [JSON.stringify(minimas), JSON.stringify(globais), JSON.stringify(premios), JSON.stringify(premiosMin)]);
    res.json({ ok: true, minimas, globais, premios, premiosMin });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── METAS DE AGENDAMENTO (quantidade por setor no mês) ───────────────────────
// Configuráveis pela gestão. Guardadas em configuracoes.metas.agendamentos.
// Meta de PLANOS terapêuticos do mês — aparece na aba Metas ao lado das de
// venda. Pedido do master: em terapias o que conta é plano, não só dinheiro.
r.get('/terapias/meta-planos', async (req, res) => {
  try {
    const { resumoPlanos } = await import('./terapias.js');
    res.json(await resumoPlanos(req.query.mes));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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

/* ═══ META DE CONSULTAS — QUANTIDADE, NAO DINHEIRO ═══════════════════════════
   Pedido do master: no setor de CONSULTAS a meta deixa de ser "valor a
   alcancar" e passa a ser QUANTIDADE — 10 consultas por dia. O que a equipe
   precisa enxergar e quantas faltam para fechar o dia de hoje; reais nao dizem
   nada para quem esta marcando horario.
   O mes nasce da MESMA regua: 10 x dias uteis (domingo a clinica nao atende,
   mesma conta dos 26 planos de terapia). */
const META_CONSULTAS_DIA = 10;

// Dias uteis do mes (segunda a sabado) e quantos ja passaram ate o dia dado.
// Meio-dia UTC de proposito: com 00h o fuso vira o dia e a conta erra por 1.
function diasUteisDoMes(mes, ateDia) {
  const [ano, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  let total = 0, ateHoje = 0;
  for (let d = 1; d <= ultimo; d++) {
    if (new Date(Date.UTC(ano, m - 1, d, 12)).getUTCDay() === 0) continue;  // domingo nao conta
    total++;
    if (!ateDia || d <= ateDia) ateHoje++;
  }
  return { total, ateHoje };
}

const metaConsultasDia = async () => {
  const { rows } = await query("SELECT valor FROM configuracoes WHERE chave = 'metas'");
  const v = parseInt(rows[0]?.valor?.consultas_dia);
  return Number.isFinite(v) && v >= 0 ? v : META_CONSULTAS_DIA;
};

r.get('/consultas/meta', async (req, res) => {
  try { res.json({ dia: await metaConsultasDia(), padrao: META_CONSULTAS_DIA }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/consultas/meta', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestao define metas.' });
    const dia = Math.max(0, Math.min(parseInt(req.body?.dia) || 0, 200));
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('metas', jsonb_build_object('consultas_dia', $1::int))
                 ON CONFLICT (chave) DO UPDATE SET valor = jsonb_set(COALESCE(configuracoes.valor,'{}'::jsonb), '{consultas_dia}', to_jsonb($1::int)), updated_at = NOW()`, [dia]);
    res.json({ ok: true, dia });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Resumo de CONSULTAS: o dia de hoje (quantas faltam para a meta) e o mes pela
// mesma regua. Mesmo publico do resumo de agendamentos — e numero de setor.
r.get('/consultas/resumo', async (req, res) => {
  try {
    if (!(gestao(req) || req.user.lider)) return res.status(403).json({ error: 'Acesso restrito.' });
    // Hoje no fuso de Sao Luis (UTC-3): depois das 21h o toISOString() puro
    // pularia para amanha e a meta do dia zeraria antes da hora.
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : hoje.slice(0, 7);
    const ATIVOS = "status IN ('Agendado','Confirmado','Realizado','Reagendado')";
    const DO_SETOR = "COALESCE(setor,'vacinas') = 'consultas'";

    const [meta, hojeQ, mesQ, serieQ] = await Promise.all([
      metaConsultasDia(),
      query(`SELECT COUNT(*)::int n, COUNT(*) FILTER (WHERE status = 'Realizado')::int realizadas
               FROM agenda_eventos WHERE data = $1::date AND ${DO_SETOR} AND ${ATIVOS}`, [hoje]),
      query(`SELECT COUNT(*)::int n FROM agenda_eventos
              WHERE to_char(data,'YYYY-MM') = $1 AND ${DO_SETOR} AND ${ATIVOS}`, [mes]),
      query(`SELECT to_char(data,'YYYY-MM-DD') dia, COUNT(*)::int n FROM agenda_eventos
              WHERE data BETWEEN $1::date - INTERVAL '6 days' AND $1::date AND ${DO_SETOR} AND ${ATIVOS}
              GROUP BY 1`, [hoje]),
    ]);

    const feitasHoje = hojeQ.rows[0]?.n || 0;
    const noMes = mesQ.rows[0]?.n || 0;
    const mesCorrente = mes === hoje.slice(0, 7);
    const du = diasUteisDoMes(mes, mesCorrente ? +hoje.slice(8, 10) : null);
    const metaMes = meta * du.total;
    const esperado = meta * du.ateHoje;   // onde a equipe deveria estar hoje

    // Ultimos 7 dias com os buracos preenchidos — grafiquinho do card.
    const porDia = Object.fromEntries(serieQ.rows.map(x => [x.dia, x.n]));
    const ultimos = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoje + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      ultimos.push({ dia: iso, n: porDia[iso] || 0, domingo: d.getUTCDay() === 0 });
    }

    res.json({
      data: hoje, mes, meta_dia: meta,
      hoje: {
        agendadas: feitasHoje,
        realizadas: hojeQ.rows[0]?.realizadas || 0,
        falta: Math.max(meta - feitasHoje, 0),
        pct: meta ? Math.round((feitasHoje / meta) * 100) : null,
        domingo: new Date(hoje + 'T12:00:00Z').getUTCDay() === 0,
      },
      mes_resumo: {
        feitas: noMes, meta: metaMes, falta: Math.max(metaMes - noMes, 0),
        pct: metaMes ? +((noMes / metaMes) * 100).toFixed(1) : null,
        dias_uteis: du.total, dias_corridos: du.ateHoje,
        esperado, diferenca: noMes - esperado,
        media_dia: du.ateHoje ? +(noMes / du.ateHoje).toFixed(1) : 0,
      },
      ultimos,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ OPORTUNIDADES DE VENDA — O PAINEL DA ATENDENTE ═════════════════════════
   Pedido do master: melhorar o painel da atendente para ela vender MAIS
   consultas e terapias. O que trava a venda quase nunca e falta de vontade — e
   nao saber PARA QUEM falar hoje. Entao o sistema monta a lista de quem ja e
   cliente da casa e tem o proximo passo obvio esperando:

     1. vacinou aqui e nunca consultou   → consulta pediatrica
     2. consultou e nao faz terapia      → avaliacao / terapia
     3. terapia parada (pausado ou sem plano ativo) → retomar

   Cada linha vem com o motivo (ha quantos dias) e abre a conversa com a frase
   ja escrita — quem le, ajusta e envia e a atendente, nunca o robo.

   Carteira: atendente ve as vendas QUE ELA fez; gestao ve a casa. Telefone sai
   mascarado pela mesma regra das outras listas (anti-furto de base). */
const ATIVOS_AG = "status IN ('Agendado','Confirmado','Reagendado')";

r.get('/oportunidades', async (req, res) => {
  try {
    const ehG = gestao(req);
    const meuId = String(req.user.id);
    const setores = Array.isArray(req.user?.setores) && req.user.setores.length ? req.user.setores : [req.user?.setor];
    const daTerapia = ehG || setores.includes('terapias');
    // Atendente enxerga a propria carteira; gestao enxerga tudo.
    const filtroV = ehG ? '' : ' AND v.atendente_id = $1';
    const pV = ehG ? [] : [meuId];
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

    const [vacSemConsulta, consSemTerapia, terapiaParada, minhas] = await Promise.all([
      // 1) Vacinou e nunca consultou — e nao tem consulta marcada pra frente
      query(`SELECT v.conversa_id, c.contact_name AS nome, c.phone AS telefone,
                    MAX(v.paciente_nome) AS paciente,
                    (CURRENT_DATE - MAX(v.data_venda))::int AS dias
               FROM vendas v JOIN conversas c ON c.id = v.conversa_id
              WHERE v.setor = 'vacinas' AND v.data_venda >= CURRENT_DATE - INTERVAL '180 days'${filtroV}
                AND NOT EXISTS (SELECT 1 FROM vendas x WHERE x.conversa_id = v.conversa_id AND x.categoria = 'Consulta')
                AND NOT EXISTS (SELECT 1 FROM agenda_eventos a WHERE a.conversa_id = v.conversa_id
                                  AND COALESCE(a.setor,'vacinas') = 'consultas' AND a.data >= CURRENT_DATE AND a.${ATIVOS_AG})
              GROUP BY v.conversa_id, c.contact_name, c.phone
              ORDER BY MAX(v.data_venda) DESC LIMIT 12`, pV),
      // 2) Consultou e ainda nao faz terapia (nem esta na area de Terapias)
      query(`SELECT v.conversa_id, c.contact_name AS nome, c.phone AS telefone,
                    MAX(v.paciente_nome) AS paciente,
                    (CURRENT_DATE - MAX(v.data_venda))::int AS dias
               FROM vendas v JOIN conversas c ON c.id = v.conversa_id
              WHERE v.categoria = 'Consulta' AND v.data_venda >= CURRENT_DATE - INTERVAL '180 days'${filtroV}
                AND NOT EXISTS (SELECT 1 FROM vendas x WHERE x.conversa_id = v.conversa_id AND x.categoria = 'Terapia')
                AND NOT EXISTS (SELECT 1 FROM terapia_pacientes t WHERE t.conversa_id = v.conversa_id)
              GROUP BY v.conversa_id, c.contact_name, c.phone
              ORDER BY MAX(v.data_venda) DESC LIMIT 12`, pV),
      // 3) Terapia parada: avaliado ou pausado, sem nenhum plano ativo
      daTerapia
        ? query(`SELECT t.conversa_id, t.nome, t.telefone, t.nome AS paciente, t.status,
                        (CURRENT_DATE - t.updated_at::date)::int AS dias
                   FROM terapia_pacientes t
                  WHERE t.status IN ('avaliacao','pausado')
                    AND NOT EXISTS (SELECT 1 FROM terapia_planos p WHERE p.paciente_id = t.id AND p.status = 'ativo')
                  ORDER BY t.updated_at DESC LIMIT 12`)
        : Promise.resolve({ rows: [] }),
      // Placar pessoal do dia/mes — so o numero DELA, nunca o da colega
      query(`SELECT COUNT(*) FILTER (WHERE categoria = 'Consulta' AND data_venda = $2::date)::int consultas_hoje,
                    COUNT(*) FILTER (WHERE categoria = 'Terapia'  AND data_venda = $2::date)::int terapias_hoje,
                    COUNT(*) FILTER (WHERE categoria = 'Consulta')::int consultas_mes,
                    COUNT(*) FILTER (WHERE categoria = 'Terapia')::int terapias_mes
               FROM vendas
              WHERE atendente_id = $1 AND to_char(data_venda,'YYYY-MM') = to_char($2::date,'YYYY-MM')`, [meuId, hoje]),
    ]);

    const grupos = [
      { chave: 'consulta', titulo: 'Vacinou e ainda não consultou', emoji: '🩺', cor: '#00B8C0',
        porque: 'Já confia na casa: falta oferecer o acompanhamento com a pediatra.',
        itens: mascararLista(vacSemConsulta.rows, req.user) },
      { chave: 'terapia', titulo: 'Consultou e ainda não faz terapia', emoji: '🧩', cor: '#a855f7',
        porque: 'Consulta feita é a porta natural da avaliação (fono, ABA, T.O.).',
        itens: mascararLista(consSemTerapia.rows, req.user) },
      { chave: 'retomar', titulo: 'Terapia parada — dá pra retomar', emoji: '🔁', cor: '#f59e0b',
        porque: 'Avaliado ou pausado, sem plano ativo. Um contato costuma trazer de volta.',
        itens: mascararLista(terapiaParada.rows, req.user) },
    ];

    res.json({
      data: hoje,
      minhas: minhas.rows[0] || { consultas_hoje: 0, terapias_hoje: 0, consultas_mes: 0, terapias_mes: 0 },
      grupos,
      total: grupos.reduce((a, g) => a + g.itens.length, 0),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Editar/excluir venda (gestão)
r.put('/vendas/:id', async (req, res) => {
  try {
    // Pedido do master: TODAS editam as vendas — cada atendente edita as suas;
    // gestão edita qualquer uma. Venda já conferida só a gestão mexe.
    const { rows: [vAtual] } = await query('SELECT atendente_id, conferido FROM vendas WHERE id = $1', [req.params.id]);
    if (!vAtual) return res.status(404).json({ error: 'Venda não encontrada' });
    const dona = String(vAtual.atendente_id) === String(req.user.id);
    if (!gestao(req) && !dona) return res.status(403).json({ error: 'Você só pode editar as suas vendas.' });
    if (!gestao(req) && vAtual.conferido) return res.status(403).json({ error: 'Venda já conferida pelo financeiro — peça à gestão.' });
    const b = req.body || {};
    const sets = [], params = []; let i = 1;
    const set = (c, v) => { sets.push(`${c} = $${i++}`); params.push(v); };
    if (b.valor !== undefined) set('valor', isNaN(parseFloat(b.valor)) ? 0 : Math.max(0, parseFloat(b.valor)));
    if (b.status_pagamento !== undefined && STATUS_PG.includes(b.status_pagamento)) set('status_pagamento', b.status_pagamento);
    if (b.forma_pagamento !== undefined) set('forma_pagamento', FORMAS_PG.includes(b.forma_pagamento) ? b.forma_pagamento : null);
    if (b.categoria !== undefined && CATEGORIAS_VENDA.includes(b.categoria)) { set('categoria', b.categoria); set('setor', setorDaCategoria(b.categoria)); }
    if (b.observacao !== undefined) set('observacao', cut(b.observacao, 300));
    if (b.ligou !== undefined) set('ligou', !!b.ligou);
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar' });
    params.push(req.params.id);
    const { rows: [v] } = await query(`UPDATE vendas SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, params);
    if (!v) return res.status(404).json({ error: 'Venda não encontrada' });
    res.json(v);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// (rota DELETE /vendas/:id definida acima — arquiva e libera p/ toda a equipe)

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
// Pedido do master: até 20 anexos por profissional (diploma, conselho,
// contrato, certificados — a pasta do profissional cabe inteira aqui).
const MAX_DOCS_PROF = 20;
const limparFoto = (f) => (f && /^data:image\/(jpeg|png|webp);base64,/.test(f) && f.length < 2_500_000) ? f : null;
const limparDocs = (arr) => (Array.isArray(arr) ? arr : [])
  .filter(d => d && d.arquivo && /^data:[\w/+.\-]+;base64,/.test(d.arquivo) && d.arquivo.length < 11_000_000)
  .slice(0, MAX_DOCS_PROF)
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
      if (b.arquivo.length > 52_000_000) return res.status(400).json({ error: 'Arquivo muito grande (máx. ~40MB). Para vídeos grandes, use um link (YouTube/Drive).' });
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

// 💟 Carrega as figurinhas OFICIAIS da Vittalis (arquivos do repositório) na
// biblioteca — botão da gestão na página Figurinhas. Idempotente (não duplica).
r.post('/figurinhas/seed', async (req, res) => {
  try {
    // Pedido do master: TODA a equipe pode carregar (idempotente, não duplica)
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const aqui = path.dirname(fileURLToPath(import.meta.url));
    const dirFig = path.join(aqui, '../assets/figurinhas');
    if (!fs.existsSync(dirFig)) return res.status(500).json({ error: `Pasta não encontrada no servidor: ${dirFig}` });
    const NOMES = { 'bom-dia': 'Vitta · Bom dia', 'boa-tarde': 'Vitta · Boa tarde', 'obrigada': 'Vitta · Obrigada pela confiança',
      'confirmado': 'Vitta · Confirmadíssimo', 'esperando': 'Vitta · Estamos te esperando', 'protecao': 'Vitta · Proteção em dia',
      'parabens': 'Vitta · Parabéns', 'conta-comigo': 'Vitta · Conta com a gente',
      'excelente-semana': 'Vitta · Excelente semana', 'abencoado-mes': 'Vitta · Abençoado mês',
      'agendamento-confirmado': 'Vitta · Agendamento confirmado', 'princesa': 'Vitta · Princesa linda e protegida',
      'principe': 'Vitta · Príncipe lindo e protegido', 'consulta-confirmada': 'Vitta · Consulta confirmada' };
    /* Figurinhas novas (24/08) vêm nomeadas como "categoria__frase.webp": a
       categoria do arquivo vira a categoria da Biblioteca, e o nome vira o
       título legível. As antigas continuam pelo mapa acima. */
    const CATS = { bomdia: 'Bom dia', boatarde: 'Boa tarde', boanoite: 'Boa noite',
      agradecimento: 'Agradecimento', vacinas: 'Vacinas', consultas: 'Consultas',
      terapias: 'Terapias', psvacinal: 'Pós-vacinal', posvacinal: 'Pós-vacinal',
      datascomemorativas: 'Datas comemorativas', indicaes: 'Indicações', indicacoes: 'Indicações',
      posagendamento: 'Pós-agendamento', frases: 'Frases carinhosas', vitta: 'Vittalis Premium',
      vittalis: 'Vittalis' };
    const arquivos = fs.readdirSync(dirFig).filter(x => x.endsWith('.webp'));
    let inseridas = 0, existiam = 0;
    for (const f of arquivos) {
      const base = f.replace('.webp', '');
      let categoria = 'Vittalis';
      let titulo = NOMES[base];
      if (!titulo && base.includes('__')) {
        const [catArq, nomeArq] = base.split('__');
        categoria = CATS[catArq] || 'Vittalis';
        titulo = `Vitta · ${nomeArq.replace(/-/g, ' ').replace(/\b\w/, c => c.toUpperCase())}`;
      }
      if (!titulo) titulo = `Vitta · ${base}`;
      const { rows: [ja] } = await query(`SELECT 1 FROM biblioteca_midias WHERE titulo = $1 AND tipo = 'figurinha' LIMIT 1`, [titulo]);
      if (ja) { existiam++; continue; }
      const b64 = fs.readFileSync(path.join(dirFig, f)).toString('base64');
      await query(`INSERT INTO biblioteca_midias (titulo, tipo, setor, categoria, mime, data)
                   VALUES ($1, 'figurinha', 'geral', $3, 'image/webp', $2)`, [titulo, b64, categoria]);
      inseridas++;
    }
    res.json({ ok: true, arquivos: arquivos.length, inseridas, existiam });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* 📚 Foto da CONVERSA → Biblioteca (gestão): muitas imagens do chat são URLs
   do WhatsApp — o navegador não consegue exportá-las (CORS), então quem baixa
   é o SERVIDOR. Aceita data URL ou http(s). */
r.post('/biblioteca/da-conversa', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Só a gestão exporta fotos pra Biblioteca.' });
    const setor = ['vacinas', 'consultas', 'terapias', 'geral'].includes(req.body?.setor) ? req.body.setor : 'terapias';
    const titulo = cut(String(req.body?.titulo || 'Foto da conversa').trim(), 70) || 'Foto da conversa';
    const fontes = (Array.isArray(req.body?.fotos) ? req.body.fotos : []).slice(0, 20);
    if (!fontes.length) return res.status(400).json({ error: 'Nenhuma foto selecionada.' });
    const { default: fetch } = await import('node-fetch');
    let ok = 0, falhas = 0;
    for (let i = 0; i < fontes.length; i++) {
      try {
        const src = String(fontes[i] || '');
        let mime, b64;
        if (src.startsWith('data:image/')) {
          const m = src.match(/^data:([^;]+);base64,(.+)$/s);
          if (!m) { falhas++; continue; }
          mime = m[1]; b64 = m[2];
        } else if (/^https?:\/\//.test(src)) {
          const r2 = await fetch(src, { signal: AbortSignal.timeout(15000) });
          if (!r2.ok) { falhas++; continue; }
          mime = String(r2.headers.get('content-type') || 'image/jpeg').split(';')[0];
          if (!mime.startsWith('image/')) { falhas++; continue; }
          const buf = Buffer.from(await r2.arrayBuffer());
          if (buf.length > 5 * 1024 * 1024) { falhas++; continue; }
          b64 = buf.toString('base64');
        } else { falhas++; continue; }
        await query(`INSERT INTO biblioteca_midias (titulo, tipo, setor, categoria, mime, data)
                     VALUES ($1, 'foto', $2, 'prova social', $3, $4)`,
          [fontes.length > 1 ? `${titulo} — ${i + 1}` : titulo, setor, mime, b64]);
        ok++;
      } catch { falhas++; }
    }
    res.json({ ok: true, salvas: ok, falhas });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/biblioteca', async (req, res) => {
  try {
    const conds = [], params = []; let i = 1;
    if (MIDIA_TIPOS.includes(req.query.tipo)) { conds.push(`tipo = $${i++}`); params.push(req.query.tipo); }
    if (['vacinas', 'consultas', 'terapias', 'geral'].includes(req.query.setor)) { conds.push(`setor = $${i++}`); params.push(req.query.setor); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    // Lista SEM o base64 (leve); o dado pesado sai só no item
    // origem = 'conversa' marca a foto que a família mandou (entra sozinha)
    /* Paginação: com a foto da conversa entrando sozinha, a biblioteca cresce
       todo dia. Sem página, a tela puxaria a lista inteira e ia ficando mais
       lenta a cada semana. */
    const limite = Math.min(200, Math.max(12, parseInt(req.query.limite) || 60));
    const pulo = Math.max(0, parseInt(req.query.pulo) || 0);
    const { rows } = await query(
      `SELECT id, titulo, tipo, setor, categoria, origem, mime, COALESCE(ordem, 999) AS ordem,
              COALESCE(octet_length(data), 0) tamanho, created_at
         FROM biblioteca_midias ${where}
        ORDER BY COALESCE(ordem, 999) ASC, created_at DESC LIMIT ${limite + 1} OFFSET ${pulo}`, params);
    const tem_mais = rows.length > limite;
    res.json({ itens: rows.slice(0, limite), tem_mais, pulo, limite });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* Foto da conversa não é copiada: a biblioteca APONTA pra mensagem onde a
   imagem já está (msg_id). Aqui é onde isso é resolvido — quem chama continua
   recebendo { mime, data } igual, sem saber de onde veio. */
export async function midiaComDados(id) {
  const { rows: [m] } = await query('SELECT * FROM biblioteca_midias WHERE id = $1', [id]);
  if (!m) return null;
  if (m.data) return m;
  if (!m.msg_id) return { ...m, indisponivel: true };
  const { rows: [msg] } = await query('SELECT content FROM mensagens WHERE id = $1', [m.msg_id]).catch(() => ({ rows: [] }));
  const url = String(msg?.content || '');
  if (!url.startsWith('data:')) return { ...m, indisponivel: true };   // mensagem apagada
  const [cab, base64] = url.split(',');
  return { ...m, mime: (cab.match(/data:([^;]+)/) || [])[1] || m.mime || 'image/jpeg', data: base64 };
}

r.get('/biblioteca/:id', async (req, res) => {
  try {
    const m = await midiaComDados(req.params.id);
    if (!m) return res.status(404).json({ error: 'Mídia não encontrada' });
    if (m.indisponivel) return res.status(410).json({ error: 'A imagem saiu da conversa — remova este item da biblioteca.' });
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
    const limite = b.tipo === 'video' ? 52_000_000 : 4_000_000; // base64: ~12MB vídeo / ~3MB imagem
    if (b.data.length > limite) return res.status(400).json({ error: `Arquivo muito grande (máx ${b.tipo === 'video' ? '12MB' : '3MB'})` });
    const setor = ['vacinas', 'consultas', 'terapias', 'geral'].includes(b.setor) ? b.setor : 'geral';
    const { rows: [m] } = await query(`
      INSERT INTO biblioteca_midias (titulo, tipo, setor, categoria, mime, data)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, titulo, tipo, setor, categoria, mime, created_at`,
      [titulo, b.tipo, setor, cut(b.categoria, 40), cut(b.mime, 60) || 'image/jpeg', b.data]);
    res.status(201).json(m);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* Trazer as fotos que JÁ ESTÃO nas conversas — pedido do master ("quero que
   toda foto venha pra cá"). A entrada automática só pega as próximas; o
   material bom dos últimos meses estava para trás.

   Não copia nada: cria a ligação com a mensagem, então importar 500 fotos não
   ocupa espaço nenhum a mais no banco. Roda quantas vezes quiser — o índice
   único no id da mensagem impede repetir. */
r.post('/biblioteca/importar-conversas', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Importar é da gestão.' });
    const dias = Math.min(365, Math.max(1, parseInt(req.body?.dias) || 30));
    const { rows } = await query(`
      SELECT m.id, m.wa_msg_id, m.content, m.created_at, c.id AS conversa_id,
             COALESCE(c.contact_name, c.phone) AS nome, c.setor
        FROM mensagens m
        JOIN conversas c ON c.id = m.conversa_id
       WHERE m.from_type = 'contact' AND m.type = 'image'
         AND m.created_at > NOW() - ($1 || ' days')::interval
         AND m.content LIKE 'data:image/%'
         AND COALESCE(c.contact_id,'') NOT LIKE '%g.us%'
         AND NOT EXISTS (SELECT 1 FROM biblioteca_midias b WHERE b.msg_id = m.id)
       ORDER BY m.created_at DESC
       LIMIT 800`, [String(dias)]);

    let criadas = 0;
    for (const r2 of rows) {
      const primeiro = String(r2.nome || '').trim().split(/\s+/)[0] || 'Cliente';
      const d = new Date(r2.created_at);
      const dia = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      const setor = ['vacinas', 'consultas', 'terapias'].includes(r2.setor) ? r2.setor : 'geral';
      const rot = { vacinas: 'Vacinas', consultas: 'Consultas', terapias: 'Terapias', geral: 'Atendimento' }[setor];
      const mime = (String(r2.content).match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
      const ok = await query(`
        INSERT INTO biblioteca_midias (titulo, tipo, setor, categoria, mime, data, origem, origem_msg_id, conversa_id, msg_id)
        VALUES ($1,'foto',$2,'Prova Social',$3,NULL,'conversa',$4,$5,$6)
        ON CONFLICT (origem_msg_id) DO NOTHING RETURNING id`,
        [`${primeiro} · ${rot} · ${dia}`.slice(0, 80), setor, mime, r2.wa_msg_id || null, r2.conversa_id, r2.id]).catch(() => ({ rows: [] }));
      if (ok.rows?.length) criadas++;
    }
    res.json({ ok: true, encontradas: rows.length, importadas: criadas, dias });
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

/* ═══ 📄 RELATÓRIO INDIVIDUAL DA LÍDER (modelo do Dr. Miécio) ══════════════
   Acompanhamento DIÁRIO de desempenho e conversão, por pessoa: metas do dia
   por categoria e financeiras, com "Realizado" e "Faltam" já preenchidos pelo
   sistema. Os alvos do dia ficam configuráveis por setor. */
/* Metas de FOCO por setor. As de terapias são ALTERNATIVAS entre si (grupo
   'terapia_mes'): o master definiu "1 Plano Mensal OU 5 sessões" — bater
   qualquer uma das duas cumpre o mês, não as duas. */
const CATS_RELATORIO = [
  { rotulo: 'Planos Vacinais', categorias: ['Plano Vacinal'], setor: 'vacinas', meta: 1 },
  { rotulo: 'Pacotes Mensais', categorias: ['Fidelidade Mensal'], setor: 'vacinas', meta: 5 },
  { rotulo: 'Plano Mensal (Terapia)', categorias: ['Fidelidade Mensal'], setor: 'terapias', meta: 1, grupo_ou: 'terapia_mes' },
  { rotulo: 'Sessões de Terapia', categorias: ['Terapia'], setor: 'terapias', meta: 5, grupo_ou: 'terapia_mes' },
];

async function cfgRelatorioLider() {
  try {
    const { rows: [c] } = await query("SELECT valor FROM configuracoes WHERE chave = 'relatorio_lider'");
    if (c?.valor) return c.valor;
  } catch { /* usa o padrão */ }
  return {};
}

r.get('/relatorio-lider/config', async (req, res) => {
  try { res.json({ padrao_categorias: CATS_RELATORIO, ...(await cfgRelatorioLider()) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
r.put('/relatorio-lider/config', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão altera as metas do relatório.' });
    const b = req.body || {};
    const num = (x) => Math.max(0, parseFloat(x) || 0);
    const setores = {};
    for (const st of ['vacinas', 'consultas', 'terapias']) {
      const d = b.setores?.[st] || {};
      setores[st] = { dia: num(d.dia), individual: num(d.individual) };
    }
    const cfg = {
      setores,
      // compatibilidade com o formato antigo (valor único)
      meta_diaria_setor: num(b.meta_diaria_setor),
      meta_individual: num(b.meta_individual),
      categorias: (Array.isArray(b.categorias) ? b.categorias : []).slice(0, 12)
        .map(c => ({ rotulo: String(c.rotulo || '').slice(0, 60), meta: Math.max(0, parseInt(c.meta) || 0),
          categorias: Array.isArray(c.categorias) ? c.categorias.slice(0, 6).map(x => String(x).slice(0, 40)) : [],
          adulto: !!c.adulto })).filter(c => c.rotulo),
    };
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('relatorio_lider', $1::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`, [JSON.stringify(cfg)]);
    res.json({ ok: true, ...cfg });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/relatorio-lider', async (req, res) => {
  try {
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data
      : new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const mes = dia.slice(0, 7);
    // Atendente do relatório: a pedida (gestão) ou a própria pessoa logada
    const alvoId = (gestao(req) && req.query.usuario_id) ? req.query.usuario_id : req.user.id;
    const { rows: [u] } = await query('SELECT id, nome, setor, setores, meta_individual, lider FROM usuarios WHERE id = $1', [alvoId]);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const setor = u.setor || 'vacinas';
    // Híbrida atende mais de um setor — o relatório dela precisa enxergar todos.
    const setoresPessoa = (Array.isArray(u.setores) && u.setores.length) ? u.setores : [setor];

    const [{ rows: cfgMetas }, cfg] = await Promise.all([
      query("SELECT valor FROM configuracoes WHERE chave = 'metas'"),
      cfgRelatorioLider(),
    ]);
    const v = cfgMetas[0]?.valor || {};
    const metaGlobalMes = Math.max(1, parseFloat(v.globais?.[setor]) || 500000);
    const metaMinimaMes = Math.max(0, parseFloat(v.minimas?.[setor]) || 100000);
    const premioMinima = Math.max(0, parseFloat(v.premiosMin?.[setor]) || 1500);
    const premioGeral = Math.max(0, parseFloat(v.premios?.[setor]) || 10000);
    // Meta do dia: a configurada ou a global dividida por 26 dias de atendimento
    const doSetor = cfg.setores?.[setor] || {};
    const metaDiaSetor = doSetor.dia || cfg.meta_diaria_setor || Math.round(metaGlobalMes / 26);
    // Meta individual da PESSOA (cadastro) tem prioridade; depois a do setor
    const metaPessoal = Math.max(0, parseFloat(u.meta_individual) || 0);
    const metaIndividual = metaPessoal || doSetor.individual || cfg.meta_individual || Math.round(metaDiaSetor / 2);

    const PAGO = "status_pagamento IN ('pago','cortesia')";
    const [indQ, setorDiaQ, setorMesQ, vendasDiaQ] = await Promise.all([
      query(`SELECT COUNT(*)::int n, COALESCE(SUM(valor) FILTER (WHERE ${PAGO}),0)::float total
               FROM vendas WHERE data_venda = $1 AND atendente_id = $2`, [dia, alvoId]),
      query(`SELECT COALESCE(SUM(valor) FILTER (WHERE ${PAGO}),0)::float total
               FROM vendas WHERE data_venda = $1 AND COALESCE(setor,'vacinas') = $2`, [dia, setor]),
      query(`SELECT COALESCE(SUM(valor) FILTER (WHERE ${PAGO}),0)::float total
               FROM vendas WHERE to_char(data_venda,'YYYY-MM') = $1 AND COALESCE(setor,'vacinas') = $2`, [mes, setor]),
      // Vendas do dia da pessoa, com categoria, idade do paciente e se houve ligação
      query(`SELECT v.categoria, v.paciente_nome, v.ligou, l.nascimento
               FROM vendas v LEFT JOIN leads l ON l.id = v.lead_id
              WHERE v.data_venda = $1 AND v.atendente_id = $2`, [dia, alvoId]),
    ]);

    // Realizado por categoria do relatório (infantil = paciente com menos de 12 anos)
    const ehInfantil = (nasc) => {
      if (!nasc) return true;   // sem data, conta como infantil (pediatria é o padrão da casa)
      const anos = (Date.now() - new Date(nasc).getTime()) / (365.25 * 86400000);
      return anos < 12;
    };
    /* As metas de foco são POR SETOR: "2 Planos Vacinais por dia" faz sentido pra
       vacinas, não pra quem atende terapia. Categoria sem setor definido vale
       pra todo mundo; com setor, só aparece pra quem trabalha nele (a híbrida vê
       as dos três). Antes, todas recebiam as de vacina — inclusive consultas. */
    const lista = (cfg.categorias?.length ? cfg.categorias : CATS_RELATORIO)
      .filter(c => !c.setor || setoresPessoa.includes(c.setor));
    const categorias = lista.map(c => {
      const realizado = vendasDiaQ.rows.filter(vd => {
        if (!(c.categorias || []).includes(vd.categoria)) return false;
        if (c.adulto) return !ehInfantil(vd.nascimento);
        if (/infanti/i.test(c.rotulo)) return ehInfantil(vd.nascimento);
        return true;
      }).length;
      return { rotulo: c.rotulo, meta: c.meta || 0, realizado, faltam: Math.max((c.meta || 0) - realizado, 0), grupo_ou: c.grupo_ou || null };
    });
    /* Metas alternativas ("1 Plano Mensal OU 5 sessões"): se uma do grupo já foi
       batida, as outras do mesmo grupo deixam de cobrar — senão o relatório
       apontaria como pendente algo que o mês já resolveu por outro caminho. */
    const gruposOk = new Set(categorias.filter(c => c.grupo_ou && c.meta > 0 && c.realizado >= c.meta).map(c => c.grupo_ou));
    for (const c of categorias) {
      if (c.grupo_ou && gruposOk.has(c.grupo_ou)) { c.faltam = 0; c.cumprido_por_alternativa = c.realizado < c.meta; }
    }
    const totMeta = categorias.reduce((sm, c) => sm + c.meta, 0);
    const totReal = categorias.reduce((sm, c) => sm + c.realizado, 0);

    /* 🚧 GARGALOS — o que está travando o resultado dela AGORA. Cada item vem
       com o número e a ação sugerida, pra virar conversa objetiva na reunião. */
    const gargalos = [];
    try {
      const donoFiltro = `c.responsavel_id = '${String(alvoId).replace(/[^a-zA-Z0-9-]/g, '')}'`;
      const [espera, propostas, quentes, faltasQ, tempoQ, silencio] = await Promise.all([
        query(`SELECT COUNT(*)::int n FROM conversas c
                WHERE ${donoFiltro} AND c.last_from = 'contact' AND COALESCE(c.perdido,false) = false
                  AND COALESCE(c.contact_id,'') NOT LIKE '%g.us%'
                  AND c.last_message_at < NOW() - interval '30 minutes'
                  AND c.last_message_at > NOW() - interval '3 days'`),
        query(`SELECT COUNT(DISTINCT m.conversa_id)::int n FROM mensagens m JOIN conversas c ON c.id = m.conversa_id
                WHERE ${donoFiltro} AND m.filename LIKE 'Proposta-%' AND m.from_type IN ('me','bot')
                  AND m.created_at BETWEEN NOW() - interval '10 days' AND NOW() - interval '20 hours'
                  AND COALESCE(c.perdido,false) = false
                  AND NOT EXISTS (SELECT 1 FROM mensagens m2 WHERE m2.conversa_id = m.conversa_id
                                    AND m2.from_type = 'contact' AND m2.created_at > m.created_at)`),
        query(`SELECT COUNT(*)::int n FROM conversas c
                WHERE ${donoFiltro} AND c.lead_score = 'quente' AND COALESCE(c.perdido,false) = false
                  AND c.last_message_at < NOW() - interval '1 day'
                  AND c.last_message_at > NOW() - interval '15 days'`),
        query(`SELECT COUNT(*)::int n FROM agenda_eventos WHERE data = $1 AND status = 'Faltou'
                  AND responsavel_id = $2`, [dia, alvoId]),
        query(`WITH seq AS (
                 SELECT from_type, sender_id,
                        LAG(from_type) OVER (PARTITION BY conversa_id ORDER BY created_at) prev,
                        created_at - LAG(created_at) OVER (PARTITION BY conversa_id ORDER BY created_at) gap
                   FROM mensagens WHERE created_at >= NOW() - interval '7 days' AND from_type IN ('contact','me'))
               SELECT ROUND(AVG(EXTRACT(EPOCH FROM gap))/60)::int m FROM seq
                WHERE from_type = 'me' AND prev = 'contact' AND gap < interval '8 hours' AND sender_id = $1`, [alvoId]),
        query(`SELECT COUNT(*)::int n FROM conversas c
                WHERE ${donoFiltro} AND COALESCE(c.perdido,false) = false AND c.categoria IS NULL
                  AND c.lead_score IN ('quente','morno')
                  AND c.last_message_at BETWEEN NOW() - interval '20 days' AND NOW() - interval '4 days'`),
      ]);
      const add = (n, nivel, titulo, causa, solucao) => { if (n > 0) gargalos.push({ n, nivel, titulo, causa, solucao }); };
      add(espera.rows[0]?.n, 'alto', 'clientes esperando resposta',
        'Fila acumulada: o cliente falou e ficou sem retorno.',
        'Abrir o "Meu foco de hoje" e zerar a fila do mais antigo pro mais novo. Se não souber o preço na hora, responda mesmo assim: "Já estou verificando pra você, me dá 5 minutinhos 💙" — o silêncio é que perde a venda.');
      add(propostas.rows[0]?.n, 'alto', 'propostas sem retorno',
        'Orçamento enviado e o cliente não respondeu — quase sempre é preço.',
        'Ligar (não só mandar mensagem) e apresentar a facilidade: entrada de 50% e o restante em 30 dias, ou 12x no cartão. Perguntar "o que te impediu de fechar?" abre a objeção real.');
      add(quentes.rows[0]?.n, 'alto', 'leads QUENTES parados',
        'Cliente demonstrou intenção de fechar e a conversa esfriou.',
        'Prioridade da primeira hora do dia. Retomar de onde parou citando o nome do bebê e já sugerindo dia e hora: "reservo quinta às 14h pra você?" — decisão fácil converte mais que pergunta aberta.');
      add(faltasQ.rows[0]?.n, 'medio', 'faltas na agenda hoje',
        'Cliente marcou e não veio — o horário ficou vazio.',
        'Chamar hoje mesmo com o botão 👻 Faltou (a Vitta manda o convite de remarcação em 1h). Pra evitar: confirmar na véspera e reforçar na manhã do atendimento.');
      add(silencio.rows[0]?.n, 'medio', 'clientes em silêncio há dias',
        'Base parada esfriando sem motivo definido.',
        'Usar a aba 💉 Calendário vacinal e convidar pela idade do bebê — é o motivo mais natural pra reabrir conversa, sem parecer cobrança.');
      const tmed = tempoQ.rows[0]?.m;
      if (tmed != null && tmed > 15) {
        gargalos.push({ n: tmed, nivel: tmed > 60 ? 'alto' : 'medio', titulo: 'minutos de tempo médio de resposta',
          causa: 'Demora entre a mensagem do cliente e a resposta.',
          solucao: 'Meta: responder em até 10 minutos. Usar as respostas prontas (⚡) e a "IA responde" pra dar o primeiro retorno rápido, ajustando o texto depois. Manter o CRM aberto e o aviso do celular ligado.' });
      }
      // 📞 Vendas fechadas sem ligação — ligação aumenta muito a conversão
      const semLig = vendasDiaQ.rows.filter(x => !x.ligou).length;
      if (semLig > 0) {
        gargalos.push({ n: semLig, nivel: 'medio', titulo: 'vendas fechadas SEM ligação',
          causa: 'Atendimento só por mensagem — a voz cria vínculo e derruba objeção que o texto não alcança.',
          solucao: 'Ligar em todo atendimento com proposta enviada, avisando antes no WhatsApp de forma afirmativa: "vou te ligar daqui a pouco pra complementar nosso atendimento". Marcar o check 📞 ao registrar a venda.' });
      }

      // Gargalo de conversão: categoria do foco parada
      for (const c of categorias) {
        if (c.meta > 0 && c.realizado === 0) {
          gargalos.push({ n: c.meta, nivel: 'medio', titulo: `${c.rotulo}: nenhum fechado hoje (meta ${c.meta})`,
            causa: 'O foco do dia não foi oferecido — normalmente por falta de oferta ativa, não por recusa.',
            solucao: `Oferecer ${c.rotulo.toLowerCase()} em TODA conversa de vacina avulsa: "por esse valor você leva só uma dose; com o plano, o calendário inteiro sai mais em conta e parcelado". Ticket maior com o mesmo esforço de atendimento.` });
        }
      }
    } catch (e) { console.error('Gargalos:', e.message); }

    const indiv = indQ.rows[0] || { n: 0, total: 0 };
    const setorDia = setorDiaQ.rows[0]?.total || 0;
    const setorMes = setorMesQ.rows[0]?.total || 0;

    res.json({
      data: dia, usuario: { id: u.id, nome: u.nome, setor, lider: !!u.lider },
      metas: { global_mes: metaGlobalMes, minima_mes: metaMinimaMes, dia_setor: metaDiaSetor, individual: metaIndividual },
      // 🎁 O que ela ganha ao bater cada meta do mês (repasse futuro)
      premios: {
        minima: { meta: metaMinimaMes, valor: premioMinima, conquistado: setorMes >= metaMinimaMes, falta: Math.max(metaMinimaMes - setorMes, 0) },
        geral: { meta: metaGlobalMes, valor: premioGeral, conquistado: setorMes >= metaGlobalMes, falta: Math.max(metaGlobalMes - setorMes, 0) },
      },
      // 📞 Ligações: quantas vendas do dia tiveram ligação antes de fechar
      ligacoes: (() => {
        const comLigacao = vendasDiaQ.rows.filter(x => x.ligou).length;
        const total = vendasDiaQ.rows.length;
        return { com_ligacao: comLigacao, total_vendas: total,
          pct: total ? Math.round((comLigacao / total) * 100) : null };
      })(),
      categorias, total_categorias: { meta: totMeta, realizado: totReal, faltam: Math.max(totMeta - totReal, 0) },
      financeiro: [
        { indicador: 'Meta individual diária', meta: metaIndividual, realizado: indiv.total, faltam: Math.max(metaIndividual - indiv.total, 0) },
        { indicador: 'Meta diária do setor', meta: metaDiaSetor, realizado: setorDia, faltam: Math.max(metaDiaSetor - setorDia, 0) },
        { indicador: 'Meta MÍNIMA do mês (setor)', meta: metaMinimaMes, realizado: setorMes, faltam: Math.max(metaMinimaMes - setorMes, 0) },
        { indicador: 'Meta GERAL do mês (setor)', meta: metaGlobalMes, realizado: setorMes, faltam: Math.max(metaGlobalMes - setorMes, 0) },
      ],
      resultado: { vendas: indiv.n, valor: indiv.total, bateu: indiv.total >= metaIndividual },
      gargalos: (() => {
        const ord = gargalos.sort((a, b) => (a.nivel === 'alto' ? 0 : 1) - (b.nivel === 'alto' ? 0 : 1));
        return ord.slice(0, 5);
      })(),
      // 📌 As 3 prioridades pra amanhã, tiradas dos próprios gargalos
      plano: (() => {
        const ord = [...gargalos].sort((a, b) => (a.nivel === 'alto' ? 0 : 1) - (b.nivel === 'alto' ? 0 : 1));
        const passos = ord.slice(0, 3).map((g, i) => `${i + 1}. ${g.titulo.charAt(0).toUpperCase()}${g.titulo.slice(1)} (${g.n}) — ${String(g.solucao || '').split('.')[0]}.`);
        if (!passos.length) passos.push('1. Manter o padrão: nenhum gargalo detectado hoje. Seguir ofertando plano e pacote em toda conversa.');
        if (categorias.some(c => c.faltam > 0)) {
          const f = categorias.filter(c => c.faltam > 0).map(c => `${c.faltam} ${c.rotulo.toLowerCase()}`).join(' e ');
          passos.push(`${passos.length + 1}. Recuperar o foco do dia: faltaram ${f}.`);
        }
        return passos.slice(0, 4);
      })(),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ 📋 RELATÓRIO DE AGENDAMENTOS DO DIA + PRODUTIVIDADE ══════════════════
   O raio-X do dia: quem veio, quem faltou, quanto entrou — e a produtividade
   de cada atendente (agendou x compareceu x faturou). Serve pra reunião de
   equipe e pra saber quem está puxando o resultado. */
r.get('/agenda/relatorio-dia', async (req, res) => {
  try {
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data
      : new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

    const [evQ, vendasQ, dosesQ, criadosQ] = await Promise.all([
      query(`SELECT a.id, a.paciente, a.servico, a.hora, a.status, a.setor, a.profissional,
                    a.telefone, a.valor, a.forma_pagamento, a.conversa_id, a.responsavel_id,
                    u.nome resp_nome
               FROM agenda_eventos a LEFT JOIN usuarios u ON u.id = a.responsavel_id
              WHERE a.data = $1
                AND a.servico IS DISTINCT FROM 'Pós Vacinal'  -- pós é seção própria da agenda; não infla os números do dia
              ORDER BY a.hora, a.paciente`, [dia]),
      query(`SELECT COALESCE(atendente_nome,'—') nome, COUNT(*)::int n,
                    COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float confirmado
               FROM vendas WHERE data_venda = $1 GROUP BY 1`, [dia]),
      query(`SELECT COUNT(*)::int n FROM carteira_doses WHERE data_aplicacao = $1 AND aplicada = true`, [dia]).catch(() => ({ rows: [{ n: 0 }] })),
      // Agendamentos CRIADOS hoje (produtividade de quem agenda, não só de quem atende)
      query(`SELECT COALESCE(u.nome,'—') nome, COUNT(*)::int n
               FROM agenda_eventos a LEFT JOIN usuarios u ON u.id = a.responsavel_id
              WHERE a.created_at::date = $1
                AND a.servico IS DISTINCT FROM 'Pós Vacinal' GROUP BY 1`, [dia]).catch(() => ({ rows: [] })),
    ]);

    const eventos = evQ.rows.map(e => ({ ...e, valor: e.valor == null ? null : Number(e.valor) }));
    const st = (x) => eventos.filter(e => e.status === x).length;
    const ativos = eventos.filter(e => e.status !== 'Cancelado');
    const compareceu = eventos.filter(e => e.status === 'Realizado').length;
    const faltou = st('Faltou');
    const base = compareceu + faltou;   // só quem já tem desfecho entra na taxa

    // Produtividade por atendente responsável pelos atendimentos do dia
    const porAtend = {};
    for (const e of eventos) {
      const nome = e.resp_nome || '— sem responsável —';
      const p = porAtend[nome] || (porAtend[nome] = { nome, agendados: 0, realizados: 0, faltas: 0, cancelados: 0, previsto: 0 });
      p.agendados++;
      if (e.status === 'Realizado') p.realizados++;
      else if (e.status === 'Faltou') p.faltas++;
      else if (e.status === 'Cancelado') p.cancelados++;
      if (e.status !== 'Cancelado') p.previsto += Number(e.valor || 0);
    }
    const vendasPorNome = Object.fromEntries(vendasQ.rows.map(v => [v.nome, v]));
    const criadosPorNome = Object.fromEntries(criadosQ.rows.map(c => [c.nome, c.n]));
    const produtividade = Object.values(porAtend).map(p => {
      const v = vendasPorNome[p.nome] || { n: 0, confirmado: 0 };
      const desfecho = p.realizados + p.faltas;
      return { ...p, vendas: v.n, faturado: v.confirmado, novos_agendamentos: criadosPorNome[p.nome] || 0,
        taxa_comparecimento: desfecho ? +((p.realizados / desfecho) * 100).toFixed(0) : null };
    }).sort((a, b) => b.faturado - a.faturado || b.realizados - a.realizados);

    // Quebra por setor e por profissional (quem executou)
    const agrupa = (campo) => {
      const m = {};
      for (const e of ativos) {
        const k = e[campo] || '—';
        const g = m[k] || (m[k] = { nome: k, total: 0, realizados: 0, faltas: 0 });
        g.total++;
        if (e.status === 'Realizado') g.realizados++;
        if (e.status === 'Faltou') g.faltas++;
      }
      return Object.values(m).sort((a, b) => b.total - a.total);
    };

    const faturado = vendasQ.rows.reduce((sm, v) => sm + Number(v.confirmado || 0), 0);
    /* 🔒 Valores e produção NOMINAL das colegas são da gestão (pedido do master).
       A atendente vê o movimento do dia — quantos vieram, quantos faltaram, taxa
       de comparecimento — e a SUA linha de produtividade. O faturamento da casa
       e o de cada colega ficam de fora. */
    const ehGestor = req.user.role === 'master';    // supervisora tambem nao ve a linha da colega
    res.json({
      data: dia, eventos,
      resumo: {
        total: eventos.length, ativos: ativos.length,
        agendados: st('Agendado'), confirmados: st('Confirmado'), realizados: compareceu,
        faltas: faltou, cancelados: st('Cancelado'), reagendados: st('Reagendado'),
        taxa_comparecimento: base ? +((compareceu / base) * 100).toFixed(0) : null,
        taxa_falta: base ? +((faltou / base) * 100).toFixed(0) : null,
        doses_aplicadas: dosesQ.rows[0]?.n || 0,
        ...(ehGestor ? {
          previsto: ativos.reduce((sm, e) => sm + Number(e.valor || 0), 0),
          faturado,
          ticket_medio: compareceu ? +(faturado / compareceu).toFixed(2) : 0,
        } : {}),
      },
      produtividade: ehGestor ? produtividade : produtividade.filter(p => p.nome === req.user.nome),
      por_setor: agrupa('setor'), por_profissional: agrupa('profissional'),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ 🔒 FECHAMENTO DIÁRIO — CAIXA E ESTOQUE ═══════════════════════════════
   Rotina de fim de dia: confere o que entrou (por forma de pagamento) e as
   doses que saíram do estoque. Ao fechar, vira a foto do dia — não muda mais,
   e fica registrado quem fechou. Divergências ficam visíveis pra gestão. */
r.get('/fechamento-diario', async (req, res) => {
  try {
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data
      : new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

    // Já fechado? Devolve a foto guardada
    const { rows: [f] } = await query('SELECT * FROM fechamentos_diarios WHERE data = $1', [dia]).catch(() => ({ rows: [] }));
    // A foto guardada é da CASA — atendente calcula sempre o recorte próprio
    if (f && req.query.recalcular !== '1' && veGeral(req)) {
      return res.json({ ...f.dados, data: dia, fechado: true, fechado_por: f.fechado_por_nome,
        fechado_em: f.fechado_em, observacao: f.observacao });
    }

    const PAGO = "status_pagamento IN ('pago','cortesia')";
    /* Ordem do master (22/08: "o caixa da Poliana está pegando o da Stefany —
       cada caixa separado"): fora o master/ve_geral, o fechamento do dia é da
       PRÓPRIA pessoa — as vendas dela, o dinheiro dela, o relatório dela.
       Setor não é mais o recorte: pessoa é. */
    const ehCasaF = veGeral(req);
    const setoresCaixa = ehCasaF ? null : await setoresDoUsuario(req);   // usado só pro bloco de estoque
    const filtroSetor = ehCasaF ? '' : ` AND atendente_id = $2`;
    const parDia = ehCasaF ? [dia] : [dia, req.user.id];
    const [vendasQ, formasQ, dosesQ, agendaQ] = await Promise.all([
      // Vendas do dia (lista curta pra conferência)
      query(`SELECT id, cliente_nome, paciente_nome, servico, categoria, setor, valor, forma_pagamento,
                    status_pagamento, atendente_nome,
                    (SELECT COUNT(*) FROM venda_comprovantes c WHERE c.venda_id = v.id)::int comprovantes
               FROM vendas v WHERE data_venda = $1${ehCasaF ? '' : ' AND v.atendente_id = $2'} ORDER BY created_at`, parDia),
      // Total por forma de pagamento (o que precisa bater no fim do dia)
      query(`SELECT COALESCE(forma_pagamento,'Outros') forma, COUNT(*)::int n,
                    COALESCE(SUM(valor) FILTER (WHERE ${PAGO}),0)::float recebido,
                    COALESCE(SUM(valor) FILTER (WHERE NOT (${PAGO})),0)::float a_receber
               FROM vendas WHERE data_venda = $1${filtroSetor} GROUP BY 1 ORDER BY recebido DESC`, parDia),
      // 💉 Doses aplicadas no dia (saída de estoque pela carteira vacinal)
      query(`SELECT COALESCE(vacina,'(sem nome)') vacina, COUNT(*)::int qtd
               FROM carteira_doses WHERE data_aplicacao = $1 AND aplicada = true
              GROUP BY 1 ORDER BY qtd DESC`, [dia]).catch(() => ({ rows: [] })),
      // Atendimentos do dia (contexto: quantos realizados x faltas)
      query(`SELECT status, COUNT(*)::int n FROM agenda_eventos WHERE data = $1${ehCasaF ? '' : ' AND responsavel_id = $2'} GROUP BY 1`, parDia).catch(() => ({ rows: [] })),
    ]);

    // Doses que estavam solicitadas pra hoje (o que era esperado sair)
    const { rows: solQ } = await query(
      `SELECT vacina, COALESCE(SUM(quantidade),0)::int qtd FROM solicitacoes_vacinas
        WHERE data_prevista = $1 AND status <> 'cancelada' GROUP BY 1`, [dia]).catch(() => ({ rows: [] }));

    // Estoque de doses é assunto de VACINAS — não aparece pro caixa de consultas
    const veVacinas = !setoresCaixa || setoresCaixa.includes('vacinas');
    const aplicadas = veVacinas ? Object.fromEntries(dosesQ.rows.map(d => [d.vacina, d.qtd])) : {};
    const vacinas = veVacinas ? new Set([...dosesQ.rows.map(d => d.vacina), ...solQ.map(s2 => s2.vacina)]) : new Set();
    const estoque = [...vacinas].map(v => ({
      vacina: v,
      previstas: solQ.find(s2 => s2.vacina === v)?.qtd || 0,
      aplicadas: aplicadas[v] || 0,
      contado: null,   // a equipe preenche o saldo contado no fechamento
    })).sort((a, b) => b.aplicadas - a.aplicadas);

    const vendas = vendasQ.rows;
    const recebido = formasQ.rows.reduce((sm, x) => sm + Number(x.recebido || 0), 0);
    const aReceber = formasQ.rows.reduce((sm, x) => sm + Number(x.a_receber || 0), 0);

    res.json({
      data: dia, fechado: false,
      caixa: {
        vendas: vendas.length, recebido, a_receber: aReceber,
        formas: formasQ.rows,
        sem_comprovante: vendas.filter(v => !v.comprovantes).length,
        lista: vendas.map(v => ({ ...v, valor: Number(v.valor) || 0 })),
        dinheiro_esperado: Number(formasQ.rows.find(x => x.forma === 'Dinheiro')?.recebido || 0),
      },
      estoque, atendimentos: Object.fromEntries(agendaQ.rows.map(a => [a.status, a.n])),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fecha o dia (caixa + estoque). Guarda a contagem e as divergências.
r.post('/fechamento-diario', async (req, res) => {
  try {
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.data || '') ? req.body.data
      : new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const dados = req.body?.dados;
    if (!dados?.caixa) return res.status(400).json({ error: 'Dados do fechamento ausentes.' });

    // Divergência do dinheiro em espécie (contado x esperado)
    const contado = parseFloat(req.body?.dinheiro_contado);
    if (!isNaN(contado)) {
      dados.caixa.dinheiro_contado = contado;
      dados.caixa.diferenca = +(contado - Number(dados.caixa.dinheiro_esperado || 0)).toFixed(2);
    }
    if (Array.isArray(req.body?.estoque)) dados.estoque = req.body.estoque;

    const { rows: [f] } = await query(`
      INSERT INTO fechamentos_diarios (data, dados, observacao, fechado_por_id, fechado_por_nome)
      VALUES ($1, $2::jsonb, $3, $4, $5)
      ON CONFLICT (data) DO UPDATE SET dados = $2::jsonb, observacao = $3,
        fechado_por_id = $4, fechado_por_nome = $5, fechado_em = NOW()
      RETURNING *`,
      [dia, JSON.stringify(dados), String(req.body?.observacao || '').slice(0, 600) || null, req.user.id, req.user.nome]);

    const dif = dados.caixa.diferenca;
    await query(`INSERT INTO notificacoes (tipo, titulo, texto) VALUES ('novo_lead', $1, $2)`,
      [`🔒 Caixa e estoque de ${dia.split('-').reverse().join('/')} fechados`,
       `${req.user.nome} fechou o dia: ${dados.caixa.vendas} venda(s), R$ ${Number(dados.caixa.recebido || 0).toLocaleString('pt-BR')} recebidos` +
       `${dif ? ` · ⚠️ diferença de R$ ${Number(dif).toLocaleString('pt-BR')} no dinheiro` : ''}.`]).catch(() => {});
    res.json({ ok: true, ...f.dados, data: dia, fechado: true, fechado_por: f.fechado_por_nome, fechado_em: f.fechado_em, observacao: f.observacao });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/fechamento-diario/:data', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão reabre um dia fechado.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.data)) return res.status(400).json({ error: 'Data inválida.' });
    await query('DELETE FROM fechamentos_diarios WHERE data = $1', [req.params.data]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Histórico dos últimos fechamentos (pra gestão acompanhar a rotina)
r.get('/fechamento-diario/historico', async (req, res) => {
  try {
    const { rows } = await query(`SELECT TO_CHAR(data,'YYYY-MM-DD') data, fechado_por_nome, fechado_em,
             (dados->'caixa'->>'recebido')::float recebido, (dados->'caixa'->>'diferenca')::float diferenca
        FROM fechamentos_diarios ORDER BY data DESC LIMIT 30`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ 🏁 FECHAMENTO DO RELATÓRIO DE METAS ══════════════════════════════════
   No fim do mês a equipe fecha o relatório: por setor (mínima, global, quanto
   faltou, prêmio) e por atendente. Ao FECHAR, os números viram uma foto do
   mês — não mudam mais, mesmo que uma venda antiga seja editada depois. */
r.get('/metas/fechamento', async (req, res) => {
  try {
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes
      : new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7);

    // Já fechado? Devolve a foto guardada (números congelados)
    const { rows: [fech] } = await query("SELECT valor FROM configuracoes WHERE chave = $1", [`metas_fechamento_${mes}`]).catch(() => ({ rows: [] }));
    if (fech?.valor && req.query.recalcular !== '1') return res.json({ ...fech.valor, fechado: true });

    const { rows: cfg } = await query("SELECT valor FROM configuracoes WHERE chave = 'metas'");
    const v = cfg[0]?.valor || {};
    const minDe = (s2) => Math.max(0, parseFloat(v.minimas?.[s2]) || 100000);
    const gloDe = (s2) => Math.max(1, parseFloat(v.globais?.[s2]) || 500000);
    const preDe = (s2) => Math.max(0, parseFloat(v.premios?.[s2]) || 10000);
    const preMinDe = (s2) => Math.max(0, parseFloat(v.premiosMin?.[s2]) || 1500);
    const PAGO = "status_pagamento IN ('pago','cortesia')";

    const [porSetorQ, porAtendQ, totQ] = await Promise.all([
      query(`SELECT COALESCE(setor,'vacinas') setor, COUNT(*)::int n,
                    COALESCE(SUM(valor) FILTER (WHERE ${PAGO}),0)::float confirmado
               FROM vendas WHERE to_char(data_venda,'YYYY-MM') = $1 GROUP BY 1`, [mes]),
      query(`SELECT COALESCE(atendente_nome,'—') nome, atendente_id, COUNT(*)::int n,
                    COALESCE(SUM(valor) FILTER (WHERE ${PAGO}),0)::float confirmado
               FROM vendas WHERE to_char(data_venda,'YYYY-MM') = $1
              GROUP BY 1,2 ORDER BY confirmado DESC`, [mes]),
      query(`SELECT COUNT(*)::int n, COALESCE(SUM(valor) FILTER (WHERE ${PAGO}),0)::float confirmado,
                    COALESCE(SUM(valor) FILTER (WHERE status_pagamento NOT IN ('pago','cortesia')),0)::float pendente
               FROM vendas WHERE to_char(data_venda,'YYYY-MM') = $1`, [mes]),
    ]);

    const mapa = Object.fromEntries(porSetorQ.rows.map(r2 => [r2.setor, r2]));
    /* O fechamento do mês também respeita o setor: a supervisora de vacinas via
       aqui o valor atingido de consultas e terapias (e vice-versa). Só o master
       fecha a clínica inteira. */
    const meusSet = await setoresDoUsuario(req);
    const setores = ['vacinas', 'consultas', 'terapias'].filter(x => meusSet.includes(x)).map(s2 => {
      const d = mapa[s2] || { n: 0, confirmado: 0 };
      const MM = minDe(s2), MG = gloDe(s2);
      return { setor: s2, vendas: d.n, confirmado: d.confirmado,
        meta_minima: MM, falta_minima: Math.max(MM - d.confirmado, 0), bateu_minima: d.confirmado >= MM,
        meta_global: MG, falta_global: Math.max(MG - d.confirmado, 0), bateu_global: d.confirmado >= MG,
        pct_minima: MM ? +((d.confirmado / MM) * 100).toFixed(1) : 0,
        pct_global: +((d.confirmado / MG) * 100).toFixed(1),
        premio_minima: preMinDe(s2), premio_global: preDe(s2),
        premio_conquistado: (d.confirmado >= MG ? preDe(s2) : d.confirmado >= MM ? preMinDe(s2) : 0) };
    });

    // Meta individual de cada atendente (quando cadastrada). A LINHA NOMINAL de
    // cada colega é do master — a supervisora vê só a dela (regra do master:
    // Raylane e Stefany são do mesmo setor e não veem o número uma da outra).
    const { rows: usuarios } = await query('SELECT id, nome, meta_individual FROM usuarios').catch(() => ({ rows: [] }));
    const metaInd = Object.fromEntries(usuarios.map(u => [u.id, parseFloat(u.meta_individual) || 0]));
    const atendentes = porAtendQ.rows
      .filter(a => veGeral(req) || a.atendente_id === req.user.id)
      .map(a => {
      const meta = metaInd[a.atendente_id] || 0;
      return { nome: a.nome, vendas: a.n, confirmado: a.confirmado, meta,
        falta: meta ? Math.max(meta - a.confirmado, 0) : null,
        pct: meta ? +((a.confirmado / meta) * 100).toFixed(1) : null, bateu: meta ? a.confirmado >= meta : null };
    });

    /* O TOTAL da casa (soma dos três setores) é do master. Pra quem é de um
       setor só, o "total" é o total do setor dela — senão o número da colega
       de outro setor voltaria pela soma. */
    const t = totQ.rows[0] || { n: 0, confirmado: 0, pendente: 0 };
    const totalVisivel = veGeral(req)
      ? { vendas: t.n, confirmado: t.confirmado, pendente: t.pendente }
      : { vendas: setores.reduce((sm, s2) => sm + s2.vendas, 0),
          confirmado: setores.reduce((sm, s2) => sm + s2.confirmado, 0), pendente: null };
    res.json({
      mes, fechado: false,
      total: { ...totalVisivel, premios: setores.reduce((sm, s2) => sm + s2.premio_conquistado, 0) },
      setores, atendentes,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fecha o mês: guarda a foto dos números (quem fechou e quando)
r.post('/metas/fechamento', async (req, res) => {
  try {
    const mes = /^\d{4}-\d{2}$/.test(req.body?.mes || '') ? req.body.mes
      : new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7);
    const dados = req.body?.dados;
    if (!dados || !dados.setores) return res.status(400).json({ error: 'Dados do fechamento ausentes.' });
    const foto = { ...dados, mes, fechado: true, fechado_por: req.user.nome, fechado_em: new Date().toISOString(),
      observacao: String(req.body?.observacao || '').slice(0, 500) || null };
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ($1, $2::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = $2::jsonb, updated_at = NOW()`,
      [`metas_fechamento_${mes}`, JSON.stringify(foto)]);
    await query(`INSERT INTO notificacoes (tipo, titulo, texto) VALUES ('novo_lead', $1, $2)`,
      [`🏁 Metas de ${mes.split('-').reverse().join('/')} fechadas`,
       `${req.user.nome} fechou o relatório do mês. Prêmios conquistados: R$ ${Number(foto.total?.premios || 0).toLocaleString('pt-BR')}.`]).catch(() => {});
    res.json({ ok: true, ...foto });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reabrir (gestão) — pra corrigir algo depois de fechado
r.delete('/metas/fechamento/:mes', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão reabre um mês fechado.' });
    if (!/^\d{4}-\d{2}$/.test(req.params.mes)) return res.status(400).json({ error: 'Mês inválido.' });
    await query('DELETE FROM configuracoes WHERE chave = $1', [`metas_fechamento_${req.params.mes}`]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ 🏥 VITTASYS — endereço da aba embutida ═══════════════════════════════ */
r.get('/vittasys/config', async (req, res) => {
  try {
    const { rows: [c] } = await query("SELECT valor FROM configuracoes WHERE chave = 'vittasys'");
    res.json({ url: c?.valor?.url || process.env.VITTASYS_API_URL || 'https://vittasys.vittalissaude.com.br',
      busca_url: c?.valor?.busca_url || '' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
r.put('/vittasys/config', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão altera o endereço.' });
    const url = String(req.body?.url || '').trim().slice(0, 300);
    const busca_url = String(req.body?.busca_url || '').trim().slice(0, 400);
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Informe um endereço válido (https://…).' });
    if (busca_url && !/^https?:\/\//i.test(busca_url)) return res.status(400).json({ error: 'O modelo de busca também precisa começar com https://' });
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('vittasys', $1::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`, [JSON.stringify({ url, busca_url })]);
    res.json({ ok: true, url, busca_url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ 💉 SOLICITAÇÃO DE VACINAS — CONFORME A AGENDA ════════════════════════
   A equipe olha a agenda dos próximos dias e pede/separa as vacinas que serão
   aplicadas. Cada pedido nasce de um agendamento real, então nada é aplicado
   sem dose reservada — e ninguém pede a mais. */
const SOLVAC_STATUS = ['solicitada', 'pedida', 'disponivel', 'aplicada', 'cancelada'];

// Agenda dos próximos dias com o que JÁ foi solicitado em cada atendimento
r.get('/vacinas/agenda', async (req, res) => {
  try {
    const dias = Math.max(1, Math.min(parseInt(req.query.dias) || 15, 60));
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    // Antes de mostrar, garante que todo atendimento de vacina da janela já tem
    // seu pedido — assim a tela nunca abre "atrasada" em relação à agenda.
    await gerarSolicitacoesDaAgenda({ dias, usuario: req.user }).catch(() => {});
    const { rows: eventos } = await query(`
      SELECT a.id, a.paciente, a.servico, TO_CHAR(a.data,'YYYY-MM-DD') data, a.hora, a.setor,
             a.status, a.telefone, a.conversa_id, a.observacoes
        FROM agenda_eventos a
       WHERE a.data BETWEEN $1::date AND ($1::date + $2::int)
         AND LOWER(COALESCE(a.status,'')) NOT LIKE 'cancel%'
       ORDER BY a.data, a.hora`, [hoje, dias]);
    const { rows: sols } = await query(`
      SELECT *, TO_CHAR(data_prevista,'YYYY-MM-DD') AS data_prevista FROM solicitacoes_vacinas
       WHERE data_prevista BETWEEN $1::date AND ($1::date + $2::int) AND status <> 'cancelada'
       ORDER BY created_at`, [hoje, dias]);

    const porAgenda = {};
    for (const so of sols) {
      const k = so.agenda_id || `avulso-${so.id}`;
      (porAgenda[k] = porAgenda[k] || []).push(so);
    }
    res.json({
      eventos: eventos.map(e => ({ ...e, solicitacoes: porAgenda[e.id] || [] })),
      avulsas: sols.filter(x => !x.agenda_id),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* 💉 A SOLICITAÇÃO NASCE DA AGENDA — SOZINHA ─────────────────────────────────
   Existem CINCO caminhos que criam agendamento no sistema: esta tela, o site
   público, a Vitta pela conversa, a carteira vacinal e a integração com o
   VittaMed/VittaSys. Remendar um por um sempre deixaria algum de fora — então a
   geração é feita AQUI, varrendo a agenda inteira da janela, não importa quem
   marcou. Roda sozinha a cada 5 min, ao abrir a tela e ao salvar/editar.
   Nunca duplica: só cria pra atendimento de vacina que não tem pedido nenhum. */
export async function gerarSolicitacoesDaAgenda({ dias = 30, atras = 7, usuario = null } = {}) {
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  /* A janela olha alguns dias PRA TRÁS também: agendamento lançado ontem (ou no
     início da semana) ficaria fora pra sempre de uma janela que começa hoje —
     foi assim que a agenda apareceu cheia com a solicitação zerada. */
  const { rows: pendentes } = await query(`
    SELECT a.id, a.paciente, a.servico, TO_CHAR(a.data,'YYYY-MM-DD') data, a.hora,
           a.conversa_id, a.lead_id
      FROM agenda_eventos a
     WHERE a.data BETWEEN ($1::date - $3::int) AND ($1::date + $2::int)
       AND COALESCE(a.setor,'vacinas') = 'vacinas'
       AND LOWER(COALESCE(a.status,'')) NOT LIKE 'cancel%'
       AND NOT EXISTS (SELECT 1 FROM solicitacoes_vacinas s
                        WHERE s.agenda_id = a.id AND s.status <> 'cancelada')
     ORDER BY a.data, a.hora`, [hoje, dias, atras]).catch(() => ({ rows: [] }));

  let criadas = 0;
  for (const ev of pendentes) {
    // O serviço vira uma linha por vacina ("Hexavalente, Rotavírus" = 2 doses);
    // sem serviço preenchido, entra "A definir" pra a equipe completar.
    const vacinas = String(ev.servico || '').split(/[,;+]/).map(v => v.trim()).filter(Boolean);
    const lista = vacinas.length ? vacinas.slice(0, 8) : ['A definir'];
    for (const vac of lista) {
      const { rows: novo } = await query(`
        INSERT INTO solicitacoes_vacinas (agenda_id, conversa_id, lead_id, paciente, vacina,
          quantidade, data_prevista, hora, setor, solicitante_id, solicitante_nome)
        VALUES ($1,$2,$3,$4,$5,1,$6,$7,'vacinas',$8,$9) RETURNING id`,
        [ev.id, ev.conversa_id || null, ev.lead_id || null, ev.paciente, cut(vac, 120),
         ev.data, ev.hora, usuario?.id || null, usuario?.nome || 'Automático · agenda'])
        .catch(() => ({ rows: [] }));
      criadas += novo.length;
    }
  }
  if (criadas) socketEmit('vacinas_solicitacao', { automatico: true, criadas });

  /* Diagnóstico: quando não gera nada, o motivo tem que aparecer. "Agenda cheia
     e solicitação vazia" quase sempre é agendamento lançado em OUTRO setor —
     e sem este número ninguém descobre isso olhando a tela. */
  const { rows: [d] } = await query(`
    SELECT COUNT(*)::int total,
           COUNT(*) FILTER (WHERE COALESCE(setor,'vacinas') = 'vacinas')::int vacinas,
           COUNT(*) FILTER (WHERE COALESCE(setor,'vacinas') <> 'vacinas')::int outros_setores
      FROM agenda_eventos
     WHERE data BETWEEN ($1::date - $3::int) AND ($1::date + $2::int)
       AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'`, [hoje, dias, atras])
    .catch(() => ({ rows: [{ total: 0, vacinas: 0, outros_setores: 0 }] }));

  return {
    atendimentos: pendentes.length, criadas,
    agenda: { total: d.total, de_vacinas: d.vacinas, de_outros_setores: d.outros_setores },
    janela: { de: `${atras} dia(s) atrás`, ate: `${dias} dia(s) à frente` },
  };
}

/* 👛 MINHA CARTEIRA — o ano inteiro da atendente numa tela ──────────────────
   Cada mês traz quem FECHOU com ela e se esse cliente já foi retomado no mês
   corrente. É a diferença entre "vendi" e "mantive": cliente de plano vacinal
   e pacote mensal precisa voltar todo mês, e sem esta visão ninguém percebe
   quem sumiu. A atendente vê a carteira dela; a gestão vê a de qualquer uma. */
r.get('/carteira/anual', async (req, res) => {
  try {
    const ano = /^\d{4}$/.test(req.query.ano || '') ? req.query.ano
      : String(new Date(Date.now() - 3 * 3600 * 1000).getFullYear());
    // Produção/carteira de OUTRA pessoa é da visão geral — supervisora vê a dela
    const alvoId = (veGeral(req) && req.query.usuario_id) ? String(req.query.usuario_id) : req.user.id;
    const { rows: [u] } = await query('SELECT id, nome FROM usuarios WHERE id = $1', [alvoId]);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });

    const mesAtual = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7);
    const PAGO = "status_pagamento IN ('pago','cortesia')";

    // Uma linha por cliente/mês de fechamento. DISTINCT ON evita repetir quem
    // comprou duas vezes no mesmo mês — a carteira é de PESSOAS, não de vendas.
    const { rows: vendas } = await query(`
      SELECT DISTINCT ON (to_char(v.data_venda,'YYYY-MM'), COALESCE(v.conversa_id, v.cliente_nome))
             to_char(v.data_venda,'YYYY-MM') mes,
             v.conversa_id, v.lead_id, v.cliente_nome, v.paciente_nome, v.servico, v.categoria,
             v.valor::float valor, TO_CHAR(v.data_venda,'YYYY-MM-DD') data_venda,
             c.contact_name, c.phone
        FROM vendas v
        LEFT JOIN conversas c ON c.id = v.conversa_id
       WHERE v.atendente_id = $1 AND ${PAGO}
         AND to_char(v.data_venda,'YYYY') = $2
       ORDER BY to_char(v.data_venda,'YYYY-MM'),
                COALESCE(v.conversa_id, v.cliente_nome), v.data_venda DESC`, [alvoId, ano]);

    /* 🔁 FOLLOW-UP: quem está na carteira dela e NÃO tem venda registrada.
       É a metade que faltava — a carteira mostrava só quem fechou, e quem não
       fechou simplesmente sumia da vista. Aqui eles aparecem por mês de
       entrada, com há quantos dias estão parados. */
    const { rows: semVenda } = await query(`
      SELECT c.id conversa_id, c.lead_id, c.contact_name, c.phone, c.setor,
             to_char(c.created_at - interval '3 hours','YYYY-MM') mes,
             TO_CHAR(c.last_message_at,'YYYY-MM-DD') ultima,
             GREATEST(0, EXTRACT(DAY FROM (NOW() - c.last_message_at))::int) parado_ha,
             l.interesse, l.status
        FROM conversas c
        LEFT JOIN leads l ON l.id = c.lead_id
       WHERE c.responsavel_id = $1
         AND to_char(c.created_at - interval '3 hours','YYYY') = $2
         AND NOT EXISTS (SELECT 1 FROM vendas v
                          WHERE (v.conversa_id = c.id OR (c.lead_id IS NOT NULL AND v.lead_id = c.lead_id))
                            AND v.status_pagamento IN ('pago','cortesia'))
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT 800`, [alvoId, ano]).catch(() => ({ rows: [] }));

    /* 🚨 SEM DONO — os que realmente se perdem. A carteira filtra por
       responsável, então quem entrou e nunca foi assumido não aparece na tela de
       NINGUÉM: fica invisível até morrer. Aqui eles ficam à vista, e qualquer
       uma pode pegar pra si. */
    const { rows: semDono } = await query(`
      SELECT c.id conversa_id, c.contact_name, c.setor,
             GREATEST(0, EXTRACT(DAY FROM (NOW() - c.last_message_at))::int) parado_ha,
             TO_CHAR(c.created_at,'YYYY-MM-DD') entrou_em
        FROM conversas c
       WHERE c.responsavel_id IS NULL
         AND COALESCE(c.contact_id,'') NOT LIKE '%g.us%'
         AND c.last_message_at > NOW() - INTERVAL '90 days'
         AND NOT EXISTS (SELECT 1 FROM vendas v WHERE v.conversa_id = c.id
                          AND v.status_pagamento IN ('pago','cortesia'))
       ORDER BY c.last_message_at DESC
       LIMIT 60`).catch(() => ({ rows: [] }));

    // Quem já foi retomado NESTE mês (o check da Fidelidade é a fonte da verdade)
    const { rows: checks } = await query(
      `SELECT conversa_id FROM fidelidade_checks WHERE mes = $1 AND feito = true`, [mesAtual])
      .catch(() => ({ rows: [] }));
    const retomados = new Set(checks.map(c => String(c.conversa_id)));

    const NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const meses = NOMES.map((nome, i) => {
      const ref = `${ano}-${String(i + 1).padStart(2, '0')}`;
      const doMes = vendas.filter(v => v.mes === ref).map(v => ({
        conversa_id: v.conversa_id, lead_id: v.lead_id,
        nome: v.paciente_nome || v.cliente_nome || v.contact_name || 'Cliente',
        responsavel_nome: v.contact_name && v.paciente_nome && v.contact_name !== v.paciente_nome ? v.contact_name : null,
        telefone: v.phone, servico: v.servico, categoria: v.categoria,
        valor: v.valor || 0, data_venda: v.data_venda,
        // "Recorrente" = plano/pacote: é quem TEM que voltar todo mês
        recorrente: /plano|fidelidade|pacote|mensal/i.test(`${v.categoria || ''} ${v.servico || ''}`),
        retomado_no_mes: v.conversa_id ? retomados.has(String(v.conversa_id)) : false,
      }));
      const semVendaMes = semVenda.filter(v => v.mes === ref).map(v => ({
        conversa_id: v.conversa_id, lead_id: v.lead_id,
        nome: v.contact_name || 'Cliente', telefone: v.phone,
        interesse: v.interesse || v.setor, etapa: v.status,
        ultima: v.ultima, parado_ha: v.parado_ha ?? null,
      }));
      return {
        ref, nome, n: doMes.length,
        valor: +doMes.reduce((s, c) => s + c.valor, 0).toFixed(2),
        recorrentes: doMes.filter(c => c.recorrente).length,
        clientes: doMes,
        followup: semVendaMes, n_followup: semVendaMes.length,
      };
    });

    const todos = meses.flatMap(m => m.clientes);
    const recorrentes = todos.filter(c => c.recorrente);
    res.json({
      ano, usuario: { id: u.id, nome: u.nome }, mes_atual: mesAtual, meses,
      resumo: {
        clientes: todos.length,
        valor: +todos.reduce((s, c) => s + c.valor, 0).toFixed(2),
        recorrentes: recorrentes.length,
        // O número que importa: recorrentes que ainda NÃO voltaram este mês
        a_retomar: recorrentes.filter(c => !c.retomado_no_mes).length,
        melhor_mes: meses.reduce((a, b) => (b.n > a.n ? b : a), meses[0])?.nome || null,
        // Follow-up: quem ainda não comprou nada — e quantos já esfriaram
        sem_venda: semVenda.length,
        parados_7d: semVenda.filter(v => (v.parado_ha ?? 0) >= 7).length,
        sem_dono: semDono.length,
      },
      sem_dono: semDono,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* 📄 SOLICITAR VACINAS → PDF PRONTO ──────────────────────────────────────────
   Um clique só faz o serviço inteiro: garante que a agenda virou solicitação e
   devolve o PDF assinável pra levar ao fornecedor/estoque. O PDF sai do
   servidor (Puppeteer), não da caixa de impressão do navegador — assim o
   arquivo é igual pra todo mundo, em qualquer aparelho. */
r.post('/vacinas/solicitar-pdf', async (req, res) => {
  try {
    const dias = Math.max(1, Math.min(parseInt(req.body?.dias) || 30, 60));
    const geracao = await gerarSolicitacoesDaAgenda({ dias, atras: 30, usuario: req.user });

    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const { rows } = await query(`
      SELECT TO_CHAR(data_prevista,'YYYY-MM-DD') dia, paciente, hora, vacina,
             COALESCE(quantidade,1)::int qtd, status
        FROM solicitacoes_vacinas
       WHERE status <> 'cancelada'
         AND data_prevista BETWEEN ($1::date - 30) AND ($1::date + $2::int)
       ORDER BY data_prevista, hora, paciente`, [hoje, dias]);

    // Por dia (o que separar em cada data) e o total de cada vacina no período
    const porDia = {}, totais = {};
    for (const s of rows) {
      const d = s.dia || 'sem-data';
      (porDia[d] = porDia[d] || []).push(s);
      totais[s.vacina] = (totais[s.vacina] || 0) + s.qtd;
    }
    const esc = (t) => String(t ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const dataBR = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d)
      ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
      : 'Sem data definida';

    const diasOrdenados = Object.keys(porDia).sort();
    const totalDoses = Object.values(totais).reduce((n, q) => n + q, 0);
    const maiorTotal = Math.max(...Object.values(totais), 1);

    const blocos = diasOrdenados.map(d => {
      const itens = porDia[d];
      const doses = itens.reduce((n, i) => n + i.qtd, 0);
      const [semana, ...resto] = dataBR(d).split(', ');
      // Só a 1ª letra em maiúscula: o capitalize do CSS escreve "sexta-Feira",
      // porque ele capitaliza depois do hífen também.
      const semanaFmt = semana ? semana[0].toUpperCase() + semana.slice(1) : '';
      return `<section class="dia">
        <div class="dia-cab">
          <div class="dia-data"><span class="dia-num">${esc(resto.join(', ') || semanaFmt)}</span><span class="dia-sem">${esc(resto.length ? semanaFmt : '')}</span></div>
          <div class="chips"><span class="chip">${itens.length} atendimento${itens.length > 1 ? 's' : ''}</span><span class="chip chip-forte">${doses} dose${doses > 1 ? 's' : ''}</span></div>
        </div>
        <table>
          <thead><tr><th style="width:58px">Hora</th><th>Paciente</th><th>Vacina</th>
            <th style="width:52px;text-align:center">Doses</th><th style="width:96px">Lote</th></tr></thead>
          <tbody>${itens.map(i => `<tr>
            <td class="hora">${esc(i.hora || '—')}</td>
            <td class="nome">${esc(i.paciente)}</td>
            <td>${esc(i.vacina)}</td>
            <td class="qtd">${i.qtd}</td>
            <td class="lote"></td></tr>`).join('')}</tbody>
        </table>
      </section>`;
    }).join('');

    const linhasTotais = Object.entries(totais).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([v, q]) => `<tr>
        <td class="tv">${esc(v)}</td>
        <td class="tb"><span class="barra" style="width:${Math.round((q / maiorTotal) * 100)}%"></span></td>
        <td class="tq">${q}</td></tr>`).join('');

    const agora = new Date(Date.now() - 3 * 3600 * 1000);
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
      @page{size:A4;margin:0}
      *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;margin:0;font-size:12px}
      .pag{padding:0 34px 34px}

      /* Cabeçalho de marca — a faixa sangra até a borda da folha */
      .topo{background:linear-gradient(120deg,#0E8C96 0%,#12a9ab 55%,#3fc9b8 100%);
            color:#fff;padding:26px 34px 22px;margin-bottom:22px}
      .marca{font-size:10.5px;letter-spacing:2.4px;text-transform:uppercase;opacity:.85;font-weight:600}
      .topo h1{margin:5px 0 0;font-size:25px;font-weight:800;letter-spacing:-.4px}
      .topo .meta{margin-top:7px;font-size:11px;opacity:.9}

      /* Resumo em três números — a leitura de 3 segundos */
      .kpis{display:flex;gap:11px;margin:-40px 0 24px}
      .kpi{flex:1;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;
           box-shadow:0 2px 8px rgba(14,140,150,.09)}
      .kpi b{display:block;font-size:23px;color:#0E8C96;line-height:1.1;font-weight:800}
      .kpi span{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.7px;font-weight:700}

      /* Um cartão por dia — nunca partido entre duas páginas */
      .dia{margin-bottom:17px;page-break-inside:avoid;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
      .dia-cab{display:flex;align-items:center;justify-content:space-between;
               background:#E6F7F8;padding:9px 14px;border-bottom:1px solid #cfeaec}
      .dia-num{font-weight:800;font-size:13.5px;color:#0a6b73}
      .dia-sem{font-size:11px;color:#4d8d92;margin-left:7px}
      .chip{display:inline-block;background:#fff;color:#0a6b73;border:1px solid #b7e0e3;
            border-radius:20px;padding:2px 10px;font-size:10px;font-weight:700;margin-left:5px}
      .chip-forte{background:#0E8C96;color:#fff;border-color:#0E8C96}

      table{width:100%;border-collapse:collapse;font-size:11.5px}
      th{background:#fafcfc;color:#5b7276;font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;
         font-weight:700;padding:7px 12px;text-align:left;border-bottom:1px solid #e2e8f0}
      td{padding:7px 12px;border-bottom:1px solid #f1f5f9}
      tbody tr:nth-child(even) td{background:#fcfdfd}
      tbody tr:last-child td{border-bottom:none}
      .hora{color:#64748b;font-variant-numeric:tabular-nums}
      .nome{font-weight:600}
      .qtd{text-align:center;font-weight:800;color:#0E8C96}
      .lote{border-bottom:1px solid #f1f5f9;background:#fffdf5}

      /* Total por vacina — é o pedido que vai pro fornecedor */
      .tot{page-break-inside:avoid;margin-top:22px;border:1.5px solid #0E8C96;border-radius:12px;overflow:hidden}
      .tot-cab{background:#0E8C96;color:#fff;padding:9px 14px;font-weight:800;font-size:13px;
               display:flex;justify-content:space-between;align-items:center}
      .tot-cab span{font-size:11px;font-weight:600;opacity:.9}
      .tot td{padding:6px 14px}
      .tv{font-weight:600;width:46%}
      .tb{width:38%}
      .barra{display:block;height:8px;border-radius:5px;background:linear-gradient(90deg,#0E8C96,#3fc9b8);min-width:6px}
      .tq{text-align:right;font-weight:800;color:#0a6b73;font-size:13px;width:16%}

      .assin{margin-top:36px;display:flex;gap:46px;page-break-inside:avoid}
      .assin div{flex:1;border-top:1.5px solid #cbd5e1;padding-top:6px;font-size:10.5px;
                 color:#64748b;text-align:center;font-weight:600}
      .rod{margin-top:22px;padding-top:11px;border-top:1px solid #eef2f4;
           font-size:9.5px;color:#94a3b8;text-align:center;letter-spacing:.3px}
      .vazio{padding:26px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:12px}
    </style></head><body>
      <div class="topo">
        <div class="marca">Vittalis Saúde · São Luís / MA</div>
        <h1>Solicitação de Vacinas</h1>
        <div class="meta">Gerada a partir da agenda · ${esc(agora.toLocaleString('pt-BR'))} · por ${esc(req.user?.nome || '—')}</div>
      </div>
      <div class="pag">
        <div class="kpis">
          <div class="kpi"><b>${rows.length}</b><span>Atendimentos</span></div>
          <div class="kpi"><b>${totalDoses}</b><span>Doses</span></div>
          <div class="kpi"><b>${Object.keys(totais).length}</b><span>Vacinas diferentes</span></div>
        </div>
        ${blocos || '<div class="vazio"><b>Nenhum atendimento de vacina na agenda deste período.</b></div>'}
        ${linhasTotais ? `<div class="tot">
          <div class="tot-cab">Total por vacina <span>${totalDoses} doses no período</span></div>
          <table><tbody>${linhasTotais}</tbody></table>
        </div>` : ''}
        <div class="assin"><div>Solicitado por</div><div>Conferido / Separado por</div></div>
        <div class="rod">VittaHub CRM · Vittalis Saúde — documento gerado automaticamente a partir da agenda</div>
      </div>
    </body></html>`;

    const pdf = await htmlParaPDF(html);
    res.json({
      ok: true,
      pdf: pdf.toString('base64'),
      filename: `Solicitacao-Vacinas-${hoje}.pdf`,
      atendimentos: rows.length, doses: totalDoses,
      geradas_agora: geracao.criadas, agenda: geracao.agenda,
    });
  } catch (err) {
    console.error('PDF solicitação de vacinas:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Botão manual (a varredura automática já faz isso sozinha; o botão é pra quem
// quer ver acontecer na hora, sem esperar o próximo ciclo).
r.post('/vacinas/puxar-da-agenda', async (req, res) => {
  try {
    const dias = Math.max(1, Math.min(parseInt(req.body?.dias) || 30, 60));
    const out = await gerarSolicitacoesDaAgenda({ dias, atras: 30, usuario: req.user });
    res.json({ ok: true, ...out });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 📋 RELATÓRIO DA SEMANA — a agenda com as doses de cada atendimento e o
// total de cada vacina no fim (é o que a equipe leva pro estoque/fornecedor).
r.get('/vacinas/relatorio-semana', async (req, res) => {
  try {
    // Semana começa na segunda; sem parâmetro, a semana corrente (fuso SLZ)
    let inicio = req.query.inicio;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio || '')) {
      const hoje = new Date(Date.now() - 3 * 3600 * 1000);
      const dow = (hoje.getUTCDay() + 6) % 7;                 // 0 = segunda
      hoje.setUTCDate(hoje.getUTCDate() - dow);
      inicio = hoje.toISOString().slice(0, 10);
    }
    const fimD = new Date(inicio + 'T12:00:00Z');
    fimD.setUTCDate(fimD.getUTCDate() + 6);
    const fim = fimD.toISOString().slice(0, 10);

    const [{ rows: eventos }, { rows: sols }] = await Promise.all([
      query(`SELECT id, paciente, servico, TO_CHAR(data,'YYYY-MM-DD') data, hora, status, setor,
                    profissional, telefone, endereco
               FROM agenda_eventos
              WHERE data BETWEEN $1::date AND $2::date
                AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'
              ORDER BY data, hora`, [inicio, fim]),
      query(`SELECT *, TO_CHAR(data_prevista,'YYYY-MM-DD') AS data_prevista FROM solicitacoes_vacinas
              WHERE data_prevista BETWEEN $1::date AND $2::date AND status <> 'cancelada'
              ORDER BY data_prevista, hora`, [inicio, fim]),
    ]);

    const porAgenda = {};
    for (const so of sols) if (so.agenda_id) (porAgenda[so.agenda_id] = porAgenda[so.agenda_id] || []).push(so);

    // Um bloco por dia da semana, com os atendimentos e as doses de cada um
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicio + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const doDia = eventos.filter(e => e.data === iso).map(e => ({ ...e, doses: porAgenda[e.id] || [] }));
      const avulsas = sols.filter(x => !x.agenda_id && String(x.data_prevista || '').slice(0, 10) === iso);
      // Total de doses do dia (dos atendimentos + avulsas)
      const totalDia = doDia.reduce((n, e) => n + e.doses.reduce((m, x) => m + (x.quantidade || 1), 0), 0)
        + avulsas.reduce((n, x) => n + (x.quantidade || 1), 0);
      dias.push({ data: iso, eventos: doDia, avulsas, atendimentos: doDia.length, doses: totalDia });
    }

    // 🧮 Total de cada vacina na semana — o pedido pro fornecedor
    const mapa = {};
    for (const so of sols) {
      const v = so.vacina || '(sem nome)';
      mapa[v] = (mapa[v] || 0) + (so.quantidade || 1);
    }
    const totais = Object.entries(mapa).map(([vacina, qtd]) => ({ vacina, qtd }))
      .sort((a, b) => b.qtd - a.qtd || a.vacina.localeCompare(b.vacina));

    res.json({
      inicio, fim, dias, totais,
      resumo: {
        atendimentos: eventos.length,
        doses: totais.reduce((n, t) => n + t.qtd, 0),
        vacinas_diferentes: totais.length,
        sem_definir: sols.filter(x => /a definir/i.test(x.vacina || '')).length,
        pendentes: sols.filter(x => x.status === 'solicitada').length,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Lista de pedidos + CONSOLIDADO por data (o que comprar/separar em cada dia)
r.get('/vacinas/solicitacoes', async (req, res) => {
  try {
    const cond = [], params = []; let i = 1;
    if (SOLVAC_STATUS.includes(req.query.status)) { cond.push(`status = $${i++}`); params.push(req.query.status); }
    else cond.push(`status <> 'cancelada'`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.de || '')) { cond.push(`data_prevista >= $${i++}`); params.push(req.query.de); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.ate || '')) { cond.push(`data_prevista <= $${i++}`); params.push(req.query.ate); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    const { rows } = await query(`SELECT *, TO_CHAR(data_prevista,'YYYY-MM-DD') AS data_prevista FROM solicitacoes_vacinas ${where} ORDER BY data_prevista, hora, paciente LIMIT 400`, params);

    // Consolidado: quantas doses de cada vacina por dia (é o que se pede ao fornecedor)
    const mapa = {};
    for (const s2 of rows) {
      if (s2.status === 'cancelada') continue;
      const d = s2.data_prevista ? String(s2.data_prevista).slice(0, 10) : 'sem-data';
      mapa[d] = mapa[d] || {};
      mapa[d][s2.vacina] = (mapa[d][s2.vacina] || 0) + (s2.quantidade || 1);
    }
    const consolidado = Object.entries(mapa).sort(([a], [b]) => a.localeCompare(b))
      .map(([data, vacs]) => ({ data, itens: Object.entries(vacs).map(([vacina, qtd]) => ({ vacina, qtd })).sort((a, b) => b.qtd - a.qtd) }));
    res.json({ solicitacoes: rows, consolidado });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Cria pedido(s) — normalmente a partir de um agendamento
r.post('/vacinas/solicitacoes', async (req, res) => {
  try {
    const b = req.body || {};
    const itens = Array.isArray(b.itens) && b.itens.length ? b.itens : [{ vacina: b.vacina, quantidade: b.quantidade }];
    let ev = null;
    if (b.agenda_id) {
      const { rows: [e] } = await query(`SELECT id, paciente, TO_CHAR(data,'YYYY-MM-DD') data, hora, setor, conversa_id FROM agenda_eventos WHERE id = $1`, [parseInt(b.agenda_id)]);
      ev = e || null;
    }
    const paciente = cut((b.paciente || ev?.paciente || '').trim(), 80);
    if (!paciente) return res.status(400).json({ error: 'Informe o paciente.' });
    const dataPrev = /^\d{4}-\d{2}-\d{2}$/.test(b.data_prevista || '') ? b.data_prevista : (ev?.data || null);
    if (!dataPrev) return res.status(400).json({ error: 'Informe a data prevista (ou vincule a um agendamento).' });

    const criadas = [];
    for (const it of itens) {
      const vacina = cut(String(it?.vacina || '').trim(), 120);
      if (!vacina) continue;
      const qtd = Math.max(1, Math.min(parseInt(it?.quantidade) || 1, 50));
      const { rows: [nova] } = await query(`
        INSERT INTO solicitacoes_vacinas (agenda_id, conversa_id, lead_id, paciente, vacina, quantidade,
          data_prevista, hora, setor, urgente, observacao, solicitante_id, solicitante_nome)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [ev?.id || (b.agenda_id ? parseInt(b.agenda_id) : null), b.conversa_id || ev?.conversa_id || null,
         b.lead_id || null, paciente, vacina, qtd, dataPrev, cut(b.hora || ev?.hora, 5),
         ['vacinas', 'consultas', 'terapias'].includes(b.setor || ev?.setor) ? (b.setor || ev.setor) : 'vacinas',
         !!b.urgente, cut(b.observacao, 300), req.user.id, req.user.nome]);
      if (nova) criadas.push(nova);
    }
    if (!criadas.length) return res.status(400).json({ error: 'Informe ao menos uma vacina.' });

    await query(`INSERT INTO notificacoes (tipo, titulo, texto) VALUES ('novo_lead', $1, $2)`,
      [`💉 Vacinas solicitadas: ${paciente}`,
       `${criadas.map(c => `${c.quantidade}x ${c.vacina}`).join(', ')} para ${dataPrev.split('-').reverse().join('/')}${b.urgente ? ' · URGENTE' : ''} — pedido de ${String(req.user.nome || '').split(' ')[0]}.`]).catch(() => {});
    socketEmit('vacinas_solicitacao', { n: criadas.length });
    res.status(201).json({ ok: true, criadas });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Andar o status (solicitada → pedida → disponível → aplicada) ou ajustar
r.patch('/vacinas/solicitacoes/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const sets = [], params = []; let i = 1;
    if (SOLVAC_STATUS.includes(b.status)) { sets.push(`status = $${i++}`); params.push(b.status); }
    if (b.quantidade !== undefined) { sets.push(`quantidade = $${i++}`); params.push(Math.max(1, Math.min(parseInt(b.quantidade) || 1, 50))); }
    if (b.vacina !== undefined) { sets.push(`vacina = $${i++}`); params.push(cut(b.vacina, 120)); }
    if (b.urgente !== undefined) { sets.push(`urgente = $${i++}`); params.push(!!b.urgente); }
    if (b.observacao !== undefined) { sets.push(`observacao = $${i++}`); params.push(cut(b.observacao, 300)); }
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    params.push(parseInt(req.params.id));
    const { rows: [so] } = await query(`UPDATE solicitacoes_vacinas SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, params);
    if (!so) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    socketEmit('vacinas_solicitacao', { id: so.id });
    res.json(so);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/vacinas/solicitacoes/:id', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão exclui. Use "cancelar" para desfazer um pedido.' });
    await query('DELETE FROM solicitacoes_vacinas WHERE id = $1', [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ 🔔 PUSH (notificação com o app fechado) ═══════════════════════════════ */
r.get('/push/chave', async (req, res) => {
  try { const v = await getVapid(); res.json({ publicKey: v?.publicKey || null }); }
  catch { res.json({ publicKey: null }); }
});
r.post('/push/inscrever', async (req, res) => {
  try {
    const b = req.body || {};
    const endpoint = String(b.endpoint || '').slice(0, 500);
    const p256dh = String(b.keys?.p256dh || '').slice(0, 200);
    const auth = String(b.keys?.auth || '').slice(0, 200);
    if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: 'Inscrição inválida.' });
    await query(`INSERT INTO push_subscriptions (endpoint, usuario_id, p256dh, auth)
                 VALUES ($1,$2,$3,$4) ON CONFLICT (endpoint) DO UPDATE SET usuario_id = $2, p256dh = $3, auth = $4`,
      [endpoint, req.user.id, p256dh, auth]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
r.post('/push/testar', async (req, res) => {
  try {
    await enviarPush(req.user.id, { titulo: '🔔 VittaHub', texto: 'Funcionou! As notificações estão ativas neste aparelho. 💙', url: '/' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ 📈 COMPARATIVO MÊS A MÊS (gestão) ════════════════════════════════════
   Gestão é comparação: mostra este mês contra o mês passado no MESMO dia do
   mês (comparar 5 dias contra 30 mentiria), com variação em %. */
r.get('/comparativo-mes', async (req, res) => {
  try {
    /* Faturamento da CASA inteira é do dono, não da supervisora de setor
       (regra do master). A supervisora acompanha o número do setor dela no
       placar — este comparativo soma vacinas + consultas + terapias. */
    if (!veGeral(req)) return res.status(403).json({ error: 'Acesso restrito à gestão e ao marketing.' });
    const agora = new Date(Date.now() - 3 * 3600 * 1000); // São Luís
    const diaAtual = agora.getUTCDate();
    const mesAtual = agora.toISOString().slice(0, 7);
    const antMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1));
    const mesAnterior = antMes.toISOString().slice(0, 7);
    const PAGO = "status_pagamento IN ('pago','cortesia')";

    const [vend, leadsQ, vendasN, agend] = await Promise.all([
      // Faturamento até o mesmo dia do mês — régua única: VENDIDO (fechou é
      // fechou), igual ao placar. Antes filtrava PAGO e divergia do resto.
      query(`SELECT to_char(data_venda,'YYYY-MM') m, COALESCE(SUM(valor),0)::float v
               FROM vendas WHERE to_char(data_venda,'YYYY-MM') = ANY($1) AND EXTRACT(DAY FROM data_venda) <= $2
              GROUP BY 1`, [[mesAtual, mesAnterior], diaAtual]),
      // Leads novos (conversas criadas)
      query(`SELECT to_char(created_at - interval '3 hours','YYYY-MM') m, COUNT(*)::int n
               FROM conversas WHERE to_char(created_at - interval '3 hours','YYYY-MM') = ANY($1)
                 AND EXTRACT(DAY FROM (created_at - interval '3 hours')) <= $2
              GROUP BY 1`, [[mesAtual, mesAnterior], diaAtual]),
      // Nº de vendas fechadas
      query(`SELECT to_char(data_venda,'YYYY-MM') m, COUNT(*)::int n
               FROM vendas WHERE to_char(data_venda,'YYYY-MM') = ANY($1) AND EXTRACT(DAY FROM data_venda) <= $2
              GROUP BY 1`, [[mesAtual, mesAnterior], diaAtual]),
      // Agendamentos criados
      query(`SELECT to_char(data,'YYYY-MM') m, COUNT(*)::int n
               FROM agenda_eventos WHERE to_char(data,'YYYY-MM') = ANY($1) AND EXTRACT(DAY FROM data) <= $2
                 AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'
              GROUP BY 1`, [[mesAtual, mesAnterior], diaAtual]).catch(() => ({ rows: [] })),
    ]);

    const pega = (rows, mes, campo) => Number(rows.find(r2 => r2.m === mes)?.[campo] || 0);
    const monta = (rows, campo, rotulo, formato) => {
      const atual = pega(rows, mesAtual, campo), anterior = pega(rows, mesAnterior, campo);
      const variacao = anterior > 0 ? +(((atual - anterior) / anterior) * 100).toFixed(1) : (atual > 0 ? 100 : 0);
      return { rotulo, atual, anterior, variacao, formato };
    };

    const fat = monta(vend.rows, 'v', 'Faturamento', 'brl');
    const nv = monta(vendasN.rows, 'n', 'Vendas fechadas', 'num');
    const lds = monta(leadsQ.rows, 'n', 'Leads novos', 'num');
    const ags = monta(agend.rows, 'n', 'Agendamentos', 'num');
    // Conversão = vendas / leads novos do período
    const convA = lds.atual > 0 ? +((nv.atual / lds.atual) * 100).toFixed(1) : 0;
    const convP = lds.anterior > 0 ? +((nv.anterior / lds.anterior) * 100).toFixed(1) : 0;
    const conversao = { rotulo: 'Conversão', atual: convA, anterior: convP,
      variacao: convP > 0 ? +(((convA - convP) / convP) * 100).toFixed(1) : (convA > 0 ? 100 : 0), formato: 'pct' };

    res.json({ mes_atual: mesAtual, mes_anterior: mesAnterior, dia: diaAtual, itens: [fat, nv, lds, ags, conversao] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ 🎯 MEU FOCO DE HOJE — fila de prioridade por atendente ═══════════════
   Junta tudo que pede ação (cliente esperando, lead quente parado, orçamento
   sem resposta, faltoso, silêncio) e entrega os contatos JÁ ordenados por
   chance de fechar. A atendente abre o CRM e sabe por onde começar. */
r.get('/foco-hoje', async (req, res) => {
  try {
    // Só a visão geral (master e marketing) enxerga a fila da clínica inteira
    const ehGestao = veGeral(req) || req.user.ve_tudo;
    const idSeguro = String(req.user.id).replace(/[^a-zA-Z0-9-]/g, '');
    // 🏠 Home office (so_carteira): SÓ o que foi transferido — sem o pool sem dono
    const filtroDono = req.user.so_carteira === true
      ? ` AND c.responsavel_id = '${idSeguro}'`
      : ehGestao ? '' : ` AND (c.responsavel_id = '${idSeguro}' OR c.responsavel_id IS NULL)`;
    const grupo = `COALESCE(c.contact_id,'') NOT LIKE '%g.us%'`;

    const [esperando, quentes, orcamentos, faltosos, silencio] = await Promise.all([
      // 1) Cliente falou por último e está esperando há mais de 10 min
      query(`SELECT c.id, c.contact_name, c.phone, c.last_message, c.last_message_at,
                    EXTRACT(EPOCH FROM (NOW() - c.last_message_at))/60 AS min
               FROM conversas c
              WHERE c.last_from = 'contact' AND ${grupo} AND c.categoria IS NULL
                AND COALESCE(c.perdido,false) = false
                AND c.last_message_at < NOW() - interval '10 minutes'
                AND c.last_message_at > NOW() - interval '3 days' ${filtroDono}
              ORDER BY c.last_message_at LIMIT 15`),
      // 2) Lead marcado como QUENTE que parou
      query(`SELECT c.id, c.contact_name, c.phone, c.lead_score_motivo, c.last_message_at
               FROM conversas c
              WHERE c.lead_score = 'quente' AND ${grupo} AND COALESCE(c.perdido,false) = false
                AND c.last_message_at > NOW() - interval '10 days' ${filtroDono}
              ORDER BY c.last_message_at DESC LIMIT 15`),
      // 3) Proposta enviada há 1-5 dias e o cliente não respondeu depois
      query(`SELECT DISTINCT c.id, c.contact_name, c.phone, MAX(m.created_at) AS enviada
               FROM mensagens m JOIN conversas c ON c.id = m.conversa_id
              WHERE m.filename LIKE 'Proposta-%' AND m.from_type IN ('me','bot')
                AND m.created_at BETWEEN NOW() - interval '5 days' AND NOW() - interval '20 hours'
                AND COALESCE(c.perdido,false) = false
                AND NOT EXISTS (SELECT 1 FROM mensagens m2 WHERE m2.conversa_id = m.conversa_id
                                  AND m2.from_type = 'contact' AND m2.created_at > m.created_at) ${filtroDono}
              GROUP BY c.id, c.contact_name, c.phone LIMIT 15`),
      // 4) Faltou nos últimos 3 dias e ainda não remarcou
      query(`SELECT a.id, a.paciente, a.telefone, TO_CHAR(a.data,'DD/MM') AS dia, a.hora
               FROM agenda_eventos a
              WHERE a.status = 'Faltou' AND a.data >= (NOW() - interval '3 days')::date
              ORDER BY a.data DESC LIMIT 10`).catch(() => ({ rows: [] })),
      // 5) Silêncio de 3 a 20 dias em quem demonstrou interesse
      query(`SELECT c.id, c.contact_name, c.phone, c.last_message_at
               FROM conversas c
              WHERE ${grupo} AND c.categoria IS NULL AND COALESCE(c.perdido,false) = false
                AND c.lead_score IN ('quente','morno')
                AND c.last_message_at BETWEEN NOW() - interval '20 days' AND NOW() - interval '3 days' ${filtroDono}
              ORDER BY c.last_message_at DESC LIMIT 15`),
    ]);

    const itens = [];
    const visto = new Set();
    const add = (o) => { const k = `${o.tipo}:${o.conv_id || o.ref}`; if (visto.has(k)) return; visto.add(k); itens.push(o); };

    for (const c of esperando.rows) {
      const min = Math.round(c.min);
      add({ peso: 100 + Math.min(min, 200), tipo: 'esperando', emoji: '⏱️', cor: '#dc2626',
        titulo: c.contact_name || c.phone, conv_id: c.id,
        motivo: `Esperando resposta há ${min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`}`,
        acao: 'Responder agora', detalhe: String(c.last_message || '').slice(0, 70) });
    }
    for (const c of quentes.rows) {
      add({ peso: 90, tipo: 'quente', emoji: '🔥', cor: '#ea580c', titulo: c.contact_name || c.phone, conv_id: c.id,
        motivo: `Lead QUENTE — ${c.lead_score_motivo || 'pronto pra fechar'}`, acao: 'Fechar a venda' });
    }
    for (const c of orcamentos.rows) {
      add({ peso: 80, tipo: 'orcamento', emoji: '💰', cor: '#d97706', titulo: c.contact_name || c.phone, conv_id: c.id,
        motivo: 'Recebeu proposta e não respondeu', acao: 'Dar um toque' });
    }
    for (const a of faltosos.rows) {
      add({ peso: 70, tipo: 'faltou', emoji: '🔄', cor: '#c2410c', titulo: a.paciente || 'Cliente', ref: a.id,
        telefone: a.telefone, motivo: `Faltou dia ${a.dia} às ${a.hora}`, acao: 'Remarcar' });
    }
    for (const c of silencio.rows) {
      const dias = Math.floor((Date.now() - new Date(c.last_message_at)) / 86400000);
      add({ peso: 50 - Math.min(dias, 20), tipo: 'silencio', emoji: '💤', cor: '#6366f1',
        titulo: c.contact_name || c.phone, conv_id: c.id, motivo: `Sem falar há ${dias} dias`, acao: 'Reativar' });
    }

    itens.sort((a, b) => b.peso - a.peso);
    res.json({ total: itens.length, itens: itens.slice(0, 12) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ 🤖 VITTA HOJE — o que a automação fez/fará hoje (card da página inicial) ═ */
r.get('/vitta-hoje', async (req, res) => {
  try {
    // "Hoje" no fuso de São Luís (UTC-3): 03:00Z de hoje até 03:00Z de amanhã
    const hojeSLZ = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const ini = `${hojeSLZ}T03:00:00.000Z`;
    const fim = new Date(new Date(ini).getTime() + 86400000).toISOString();
    const { rows } = await query(`
      SELECT COALESCE(criado_por, 'Mensagem programada') origem, status, COUNT(*)::int n
      FROM mensagens_agendadas
      WHERE enviar_em >= $1 AND enviar_em < $2 AND status IN ('pendente', 'enviada')
      GROUP BY 1, 2`, [ini, fim]);
    const porOrigem = {};
    for (const r2 of rows) {
      const o = porOrigem[r2.origem] || (porOrigem[r2.origem] = { origem: r2.origem, enviadas: 0, pendentes: 0 });
      if (r2.status === 'enviada') o.enviadas += r2.n; else o.pendentes += r2.n;
    }
    const lista = Object.values(porOrigem).sort((a, b) => (b.enviadas + b.pendentes) - (a.enviadas + a.pendentes));
    res.json({ lista,
      enviadas: lista.reduce((s, x) => s + x.enviadas, 0),
      pendentes: lista.reduce((s, x) => s + x.pendentes, 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ ⭐ LINK DE AVALIAÇÃO NO GOOGLE (pós-venda automático) ═══════════════════ */
r.get('/config-review', async (req, res) => {
  try {
    const { rows: [gr] } = await query("SELECT valor FROM configuracoes WHERE chave = 'google_review'");
    res.json({ url: gr?.valor?.url || '' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
r.put('/config-review', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Apenas a gestão altera o link de avaliação.' });
    const url = String(req.body?.url || '').trim().slice(0, 300);
    if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Informe um link válido (https://…) ou deixe vazio para desativar.' });
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('google_review', $1::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`, [JSON.stringify({ url })]);
    res.json({ ok: true, url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ 🩺 PRONTUÁRIO DO PACIENTE ═══════════════════════════════════════════════
   Pedido do master (22/08): "um verdadeiro prontuário onde posso anotar o que
   eu quiser sobre meu paciente e anexar documentos". Ancorado na CONVERSA:
   funciona mesmo sem lead cadastrado. Anotações têm autor e hora (prontuário
   é rastro clínico); documentos guardam base64 e saem sob demanda. */
r.get('/prontuario', async (req, res) => {
  try {
    const convId = String(req.query.conversa_id || '');
    if (!convId) return res.status(400).json({ error: 'Informe a conversa.' });
    const [notas, docs] = await Promise.all([
      query(`SELECT id, autor_id, autor_nome, texto, created_at FROM prontuario_notas
              WHERE conversa_id = $1 ORDER BY created_at DESC LIMIT 200`, [convId]),
      query(`SELECT id, nome, mime, tamanho, autor_nome, created_at FROM prontuario_docs
              WHERE conversa_id = $1 ORDER BY created_at DESC LIMIT 100`, [convId]),
    ]);
    res.json({ notas: notas.rows, docs: docs.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/prontuario/nota', async (req, res) => {
  try {
    const convId = String(req.body?.conversa_id || '');
    const texto = String(req.body?.texto || '').trim().slice(0, 4000);
    if (!convId || !texto) return res.status(400).json({ error: 'Escreva a anotação.' });
    const { rows: [n] } = await query(
      `INSERT INTO prontuario_notas (conversa_id, lead_id, autor_id, autor_nome, texto)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, autor_id, autor_nome, texto, created_at`,
      [convId, parseInt(req.body?.lead_id) || null, req.user.id, req.user.nome, texto]);
    res.status(201).json(n);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/prontuario/nota/:id', async (req, res) => {
  try {
    // Prontuário é rastro: só o próprio autor (ou o master) apaga uma anotação
    const { rows: [n] } = await query('SELECT autor_id FROM prontuario_notas WHERE id = $1', [req.params.id]);
    if (!n) return res.status(404).json({ error: 'Anotação não encontrada.' });
    if (n.autor_id !== req.user.id && req.user.role !== 'master')
      return res.status(403).json({ error: 'Só quem escreveu (ou o master) apaga a anotação.' });
    await query('DELETE FROM prontuario_notas WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/prontuario/doc', async (req, res) => {
  try {
    const convId = String(req.body?.conversa_id || '');
    const data = String(req.body?.data || '');
    const nome = String(req.body?.nome || '').trim().slice(0, 140) || 'documento';
    if (!convId) return res.status(400).json({ error: 'Informe a conversa.' });
    const m = data.match(/^data:([\w.+-]+\/[\w.+-]+);base64,/);
    if (!m) return res.status(400).json({ error: 'Arquivo inválido.' });
    if (data.length > 9_000_000) return res.status(400).json({ error: 'Arquivo muito grande (máx ~6MB).' });
    const tamanho = Math.round((data.length - m[0].length) * 3 / 4);
    const { rows: [d] } = await query(
      `INSERT INTO prontuario_docs (conversa_id, lead_id, nome, mime, tamanho, data, autor_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, nome, mime, tamanho, autor_nome, created_at`,
      [convId, parseInt(req.body?.lead_id) || null, nome, m[1], tamanho, data, req.user.nome]);
    res.status(201).json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/prontuario/doc/:id', async (req, res) => {
  try {
    const { rows: [d] } = await query('SELECT nome, mime, data FROM prontuario_docs WHERE id = $1', [req.params.id]);
    if (!d) return res.status(404).json({ error: 'Documento não encontrado.' });
    res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/prontuario/doc/:id', async (req, res) => {
  try {
    if (!gestao(req)) return res.status(403).json({ error: 'Excluir documento do prontuário é da gestão.' });
    await query('DELETE FROM prontuario_docs WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default r;


// ─── 📊 RELATÓRIO SEMANAL AUTOMÁTICO ─────────────────────────────────────────
// Toda segunda-feira ~8h (São Luís) gera um resumo da semana anterior e publica
// como notificação: vendas por setor, top vendedora, leads novos e atividade da
// Vitta. Dedup por semana em configuracoes.relatorio_semanal.
async function relatorioSemanal() {
  try {
    const agora = new Date();
    if (agora.getUTCDay() !== 1 || agora.getUTCHours() !== 11) return; // segunda 11h UTC = 8h SLZ
    const chave = agora.toISOString().slice(0, 10);
    const { rows: [cfgR] } = await query("SELECT valor FROM configuracoes WHERE chave = 'relatorio_semanal'").catch(() => ({ rows: [] }));
    if (cfgR?.valor?.ultima === chave) return; // já rodou hoje
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('relatorio_semanal', $1::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`, [JSON.stringify({ ultima: chave })]);

    const [vendasQ, topQ, leadsQ, vittaQ, perdasQ, respQ] = await Promise.all([
      query(`SELECT COALESCE(setor,'vacinas') s, COUNT(*)::int n, COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float v
             FROM vendas WHERE data_venda >= (NOW() - interval '3 hours')::date - 7 GROUP BY 1`),
      query(`SELECT COALESCE(atendente_nome,'—') nome, COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float v
             FROM vendas WHERE data_venda >= (NOW() - interval '3 hours')::date - 7 GROUP BY 1 ORDER BY v DESC LIMIT 1`),
      query(`SELECT COUNT(*)::int n FROM conversas WHERE created_at >= NOW() - interval '7 days'`),
      query(`SELECT COUNT(*)::int n FROM mensagens WHERE from_type = 'bot' AND created_at >= NOW() - interval '7 days'`),
      query(`SELECT motivo, COUNT(*)::int n, COALESCE(SUM(valor_potencial),0)::float v FROM perdas
             WHERE created_at >= NOW() - interval '7 days' GROUP BY 1 ORDER BY n DESC LIMIT 3`).catch(() => ({ rows: [] })),
      // ⏱️ Tempo médio de resposta por atendente: resposta 'me' logo após msg de
      // cliente na mesma conversa (gaps > 8h fora — atravessou a noite)
      query(`WITH seq AS (
               SELECT sender_nome, from_type,
                      LAG(from_type) OVER (PARTITION BY conversa_id ORDER BY created_at) prev_from,
                      created_at - LAG(created_at) OVER (PARTITION BY conversa_id ORDER BY created_at) gap
               FROM mensagens
               WHERE created_at >= NOW() - interval '7 days' AND from_type IN ('contact','me'))
             SELECT COALESCE(sender_nome,'—') nome, COUNT(*)::int n,
                    ROUND(AVG(EXTRACT(EPOCH FROM gap)) / 60)::int media_min
             FROM seq WHERE from_type = 'me' AND prev_from = 'contact' AND gap < interval '8 hours'
             GROUP BY 1 HAVING COUNT(*) >= 5 ORDER BY media_min ASC LIMIT 5`).catch(() => ({ rows: [] })),
    ]);
    const porSetor = vendasQ.rows.map(r2 => `${r2.s}: ${r2.n} venda(s) · R$ ${Number(r2.v).toLocaleString('pt-BR')}`).join(' | ') || 'nenhuma venda';
    const totalV = vendasQ.rows.reduce((sum, r2) => sum + Number(r2.v || 0), 0);
    const top = topQ.rows[0];

    // 🧠 Raio-X das objeções: a IA transforma os motivos de perda da semana em
    // UMA dica prática de treino. Se a IA falhar, sai só a contagem (nunca trava).
    let objecoes = '';
    if (perdasQ.rows.length) {
      const resumoPerdas = perdasQ.rows.map(p => `"${p.motivo}" (${p.n}x${p.v > 0 ? `, R$ ${Number(p.v).toLocaleString('pt-BR')} perdidos` : ''})`).join('; ');
      objecoes = ` ⚠️ Perdas da semana: ${resumoPerdas}.`;
      if (temIA()) {
        try {
          const d = await openaiMessages({
            model: 'gpt-4o-mini', max_tokens: 300,
            system: 'Você é um treinador de vendas de uma clínica pediátrica/vacinação (Vittalis Saúde). Responda em português do Brasil, em NO MÁXIMO 2 frases curtas, práticas e acionáveis, sem enrolação.',
            messages: [{ role: 'user', content: `Motivos das vendas perdidas nesta semana: ${resumoPerdas}. Dê UMA dica prática pra equipe reverter o motivo mais frequente na próxima semana.` }],
          });
          const dica = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
          if (dica && !d.error) objecoes += ` 🧠 Dica da semana: ${dica}`;
        } catch { /* segue sem a dica */ }
      }
    }

    const texto = `Semana: R$ ${totalV.toLocaleString('pt-BR')} confirmados (${porSetor}). ` +
      `${top && top.v > 0 ? `🏅 Destaque: ${top.nome} (R$ ${Number(top.v).toLocaleString('pt-BR')}). ` : ''}` +
      `Leads novos: ${leadsQ.rows[0]?.n ?? 0}. Mensagens da Vitta: ${vittaQ.rows[0]?.n ?? 0}.` +
      `${respQ.rows.length ? ` ⏱️ Tempo médio de resposta: ${respQ.rows.map(r2 => `${String(r2.nome).split(' ')[0]} ${r2.media_min}min`).join(' · ')}.` : ''}${objecoes}`;
    await query(`INSERT INTO notificacoes (tipo, titulo, texto) VALUES ('novo_lead', '📊 Relatório semanal de vendas', $1)`, [texto.slice(0, 900)]);
    console.log('📊 Relatório semanal publicado:', texto);
  } catch (e) { console.error('Relatório semanal erro:', e.message); }
}
setInterval(relatorioSemanal, 20 * 60 * 1000);

// ─── 📅 CONFIRMAÇÃO DE AGENDAMENTO (véspera) ─────────────────────────────────
// Todo dia às ~17h de São Luís (20h UTC), manda WhatsApp confirmando os horários
// de AMANHÃ (status Agendado/Confirmado). Dedup por evento (confirmacao_enviada).
async function confirmacaoVespera() {
  try {
    /* A janela é "das 17h em diante", não "às 17h em ponto". Antes a checagem
       era `hora !== 20 UTC` e, com o tick de 20 min, bastava o backend reiniciar
       perto do horário (deploy, por exemplo) pra a janela inteira passar batido
       e NINGUÉM daquele dia receber lembrete — sem erro nenhum aparecer.
       Agora um marcador diário garante que roda uma vez por dia, mais cedo ou
       mais tarde, mas roda. */
    const agoraSLZ = new Date(Date.now() - 3 * 3600 * 1000);
    if (agoraSLZ.getUTCHours() < 17) return;                  // antes das 17h de São Luís
    const hojeSLZ = agoraSLZ.toISOString().slice(0, 10);
    const { rows: [marca] } = await query(
      "SELECT valor FROM configuracoes WHERE chave = 'confirmacao_vespera_dia'").catch(() => ({ rows: [] }));
    if (marca?.valor?.dia === hojeSLZ) return;                // já rodou hoje
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('confirmacao_vespera_dia', $1::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify({ dia: hojeSLZ })]).catch(() => {});

    const amanha = new Date(Date.now() - 3 * 3600 * 1000 + 86400000).toISOString().slice(0, 10); // amanhã no fuso SLZ
    const { rows: eventos } = await query(`
      SELECT * FROM agenda_eventos
      WHERE data = $1 AND status IN ('Agendado','Confirmado')
        AND COALESCE(confirmacao_enviada, false) = false
        AND servico IS DISTINCT FROM 'Pós Vacinal'  -- ordem do master: pós-vacinal SÓ na agenda, nenhuma mensagem sai sozinha
      ORDER BY hora LIMIT 60`, [amanha]);
    let n = 0, semConversa = 0;
    for (const ev of eventos) {
      // Marca ANTES de enviar: mesmo sem conversa, não fica re-tentando pra sempre
      await query('UPDATE agenda_eventos SET confirmacao_enviada = true WHERE id = $1', [ev.id]).catch(() => {});
      const convId = await convDoEvento(ev);
      if (!convId) { semConversa++; continue; }
      const nome = String(ev.paciente || '').split(' ')[0];
      /* O lembrete é o MESMO cartão da confirmação (ordem do master, 24/08):
         muda só o título e a frase inicial. Tom afirmativo, avisando que está
         tudo pronto, em vez de pedir confirmação — reduz desistência. */
      const txt = await cartaoDoEvento(ev, {
        lembrete: true,
        frase: `Oi! 💙 Aqui é da Vittalis Saúde 😊 Passando para lembrar que é amanhã o atendimento${nome ? ` do(a) ${nome}` : ''}, e está tudo organizado, com muito amor e carinho, para receber vocês 🥰`,
      });
      await query(`INSERT INTO mensagens_agendadas (conversa_id, texto, enviar_em, criado_por) VALUES ($1, $2, NOW(), 'Vitta · Confirmação de agenda')`,
        [convId, txt]).catch(() => {});
      n++;
    }
    if (n) console.log(`📅 Confirmação de véspera: ${n} mensagem(ns) para ${amanha}`);
    /* Agendamento sem conversa no WhatsApp (marcado por telefone, pelo site ou
       importado) nunca receberia o lembrete e ninguém saberia. Vira alerta pra
       gestão ligar — é a diferença entre falha silenciosa e falha avisada. */
    if (semConversa) {
      console.warn(`📅 Confirmação de véspera: ${semConversa} agendamento(s) de ${amanha} sem conversa no WhatsApp`);
      await query(
        `INSERT INTO notificacoes (tipo, titulo, texto, apenas_master)
         VALUES ('agenda', $1, $2, true)`,
        ['📵 Lembretes de amanhã não enviados',
         `${semConversa} agendamento(s) de amanhã não têm conversa no WhatsApp, então não receberam o lembrete automático. Vale ligar ou mandar mensagem manual.`]
      ).catch(() => {});
    }
  } catch (e) { console.error('Confirmação véspera erro:', e.message); }
}
// Tick de 20 min: com o marcador diário acima, basta uma passada depois das 17h.
setInterval(confirmacaoVespera, 20 * 60 * 1000);
setTimeout(confirmacaoVespera, 45000);   // e uma logo após o boot, pra deploy tardio não perder o dia

// ─── 💰 RESGATE DE ORÇAMENTO SEM RESPOSTA ────────────────────────────────────
// Proposta (PDF) enviada há 24-48h e o cliente não respondeu nada desde então →
// a Vitta dá um toque gentil. Roda em horário comercial; nunca repete na semana.
async function resgateProposta() {
  try {
    const hSLZ = (new Date().getUTCHours() - 3 + 24) % 24;
    if (hSLZ < 9 || hSLZ >= 17) return;
    const { rows: alvos } = await query(`
      SELECT m.conversa_id, MAX(m.created_at) AS proposta_em, c.contact_name
      FROM mensagens m
      JOIN conversas c ON c.id = m.conversa_id
      WHERE m.filename LIKE 'Proposta-%' AND m.from_type IN ('me', 'bot')
        AND m.created_at BETWEEN NOW() - interval '48 hours' AND NOW() - interval '24 hours'
        AND COALESCE(c.perdido, false) = false
        AND NOT EXISTS (SELECT 1 FROM mensagens m2 WHERE m2.conversa_id = m.conversa_id
                          AND m2.from_type = 'contact' AND m2.created_at > m.created_at)
        AND NOT EXISTS (SELECT 1 FROM mensagens_agendadas ma WHERE ma.conversa_id = m.conversa_id
                          AND ma.criado_por = 'Vitta · Resgate de orçamento'
                          AND ma.created_at > NOW() - interval '7 days')
      GROUP BY m.conversa_id, c.contact_name LIMIT 20`);
    let n = 0;
    for (const a of alvos) {
      const nome = String(a.contact_name || '').split(' ')[0];
      // ⏳ Urgência saudável: a proposta tem validade de 2 dias — lembrar disso
      // é o que transforma "depois eu vejo" em decisão hoje.
      const venceEm = new Date(new Date(a.proposta_em).getTime() + 2 * 86400000);
      const venceTxt = venceEm.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Fortaleza' });
      const expirou = venceEm.getTime() < Date.now();
      const txt = `Oi${nome && !/^\d+$/.test(nome) ? `, ${nome}` : ''}! 💙 Conseguiu dar uma olhadinha na proposta que te enviei?\n\n` +
        (expirou
          ? `As condições eram válidas até ${venceTxt}, mas se você ainda tiver interesse eu falo com a coordenação pra manter o valor pra vocês 😊`
          : `⏳ As condições ficam garantidas até ${venceTxt} — se quiser, já deixo o horário reservado no nome de vocês.`) +
        `\n\nQualquer dúvida sobre valores, parcelamento ou o calendário de proteção, é só me chamar! 🥰`;
      await query(`INSERT INTO mensagens_agendadas (conversa_id, texto, enviar_em, criado_por)
                   VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval, 'Vitta · Resgate de orçamento')`,
        [a.conversa_id, txt, String(n * 3)]).catch(() => {});
      n++;
    }
    if (n) console.log(`💰 Resgate de orçamento: ${n} cliente(s) tocados`);
  } catch (e) { console.error('Resgate de orçamento erro:', e.message); }
}
setInterval(resgateProposta, 30 * 60 * 1000);
