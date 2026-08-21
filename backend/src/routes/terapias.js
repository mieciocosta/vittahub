import express from 'express';
import { auth } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { socketEmit } from '../socketServer.js';

// ─── ÁREA DE TERAPIAS ────────────────────────────────────────────────────────
// Pedido do master: uma aba só de TERAPIAS, onde a equipe puxa o paciente para
// essa área e registra o plano terapêutico. A meta do setor deixa de ser só
// dinheiro e passa a ser 26 PLANOS no mês (~1 por dia útil).
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
const META_PLANOS_PADRAO = 26; // pedido do master: 26 planos por mês (1 por dia útil)

// Mês corrente no fuso de São Luís (UTC-3)
const mesLocal = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7);

// ── Lista da área: pacientes + planos de cada um ─────────────────────────────
r.get('/', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try {
    /* O andamento das sessões vem junto na MESMA consulta: a tela mostra
       "12 de 40" em cada paciente, e buscar isso um a um seria N+1. */
    const { rows: pacientes } = await query(`
      SELECT p.*,
             COUNT(DISTINCT pl.id)::int AS planos,
             MAX(pl.created_at) AS ultimo_plano,
             COALESCE(SUM(DISTINCT CASE WHEN pl.status = 'ativo' THEN pl.valor_mensal ELSE 0 END), 0)::float AS valor_ativo,
             COALESCE(s.feitas, 0)::int AS sessoes_feitas,
             COALESCE(s.faltas, 0)::int AS sessoes_faltas,
             TO_CHAR(s.ultima, 'YYYY-MM-DD') AS ultima_sessao
        FROM terapia_pacientes p
        LEFT JOIN terapia_planos pl ON pl.paciente_id = p.id
        LEFT JOIN (
          SELECT paciente_id,
                 COUNT(*) FILTER (WHERE presenca IN ('presente','reposicao'))::int AS feitas,
                 COUNT(*) FILTER (WHERE presenca = 'falta')::int AS faltas,
                 MAX(data) AS ultima
            FROM terapia_sessoes GROUP BY paciente_id
        ) s ON s.paciente_id = p.id
       GROUP BY p.id, s.feitas, s.faltas, s.ultima
       ORDER BY (p.status = 'alta'), p.created_at DESC`);
    const { rows: planos } = await query(
      `SELECT id, paciente_id, especialidade, sessoes_semana, valor_sessao, valor_mensal,
              TO_CHAR(data_inicio,'YYYY-MM-DD') AS data_inicio, status, observacoes,
              COALESCE(horarios,'[]'::jsonb) AS horarios, profissional, dia_pagamento,
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
    if (b.sessoes_contratadas) {
      const n = parseInt(b.sessoes_contratadas);
      if (Number.isFinite(n) && n > 0) await query(`UPDATE terapia_pacientes SET sessoes_contratadas = $1 WHERE id = $2`, [Math.min(n, 999), p.id]).catch(() => {});
    }
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
  // Pacote contratado e acompanhamento — pedido do master (nº de sessões,
  // acompanhamento e observação de cada paciente).
  if (b.sessoes_contratadas !== undefined) {
    const n = parseInt(b.sessoes_contratadas);
    set('sessoes_contratadas', Number.isFinite(n) && n > 0 ? Math.min(n, 999) : null);
  }
  if (b.acompanhamento !== undefined) set('acompanhamento', cut(b.acompanhamento, 2000));
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

/* ═══ TRAZER TODO MUNDO DE UMA VEZ ══════════════════════════════════════════
   Pedido do master: "poder levar TODOS os pacientes" para a área. Puxar um a
   um pela busca serve pra encaixar alguém no meio do dia; pra montar a área do
   zero, a equipe precisa ver a lista inteira e marcar. Candidato é quem já
   apareceu na casa e ainda não está aqui — a agenda de terapias vem primeiro,
   que é a fonte mais confiável de quem faz terapia mesmo. */
r.get('/candidatos', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try {
    const [ag, conv, leads, jaTem] = await Promise.all([
      query(`SELECT DISTINCT ON (paciente) paciente AS nome, telefone, 'agenda' AS origem, MAX(data) OVER (PARTITION BY paciente) AS quando
               FROM agenda_eventos
              WHERE COALESCE(setor,'vacinas') = 'terapias' AND paciente IS NOT NULL AND paciente <> ''
              ORDER BY paciente, data DESC`).catch(() => ({ rows: [] })),
      query(`SELECT COALESCE(nome, phone) AS nome, phone AS telefone, id::text AS ref, 'conversa' AS origem, last_message_at AS quando
               FROM conversas
              WHERE COALESCE(contact_id,'') NOT LIKE '%g.us%'
                AND (categoria = 'terapias' OR tags && ARRAY['terapia','terapias'])
              ORDER BY last_message_at DESC LIMIT 200`).catch(() => ({ rows: [] })),
      query(`SELECT nome, telefone, id::text AS ref, 'lead' AS origem, created_at AS quando
               FROM leads WHERE setor = 'terapias' ORDER BY created_at DESC LIMIT 200`).catch(() => ({ rows: [] })),
      query(`SELECT telefone, nome FROM terapia_pacientes`),
    ]);

    // Quem já está na área sai da lista — por telefone e, sem telefone, por nome.
    const tel11 = (t) => String(t || '').replace(/\D/g, '').slice(-11);
    const dentroTel = new Set(jaTem.rows.map(x => tel11(x.telefone)).filter(Boolean));
    const dentroNome = new Set(jaTem.rows.map(x => String(x.nome || '').trim().toLowerCase()));

    const vistos = new Set();
    const lista = [];
    for (const x of [...ag.rows, ...conv.rows, ...leads.rows]) {
      const t = tel11(x.telefone);
      const n = String(x.nome || '').trim();
      if (!n) continue;
      if (t && dentroTel.has(t)) continue;
      if (!t && dentroNome.has(n.toLowerCase())) continue;
      const chave = t || n.toLowerCase();           // o mesmo cliente em 3 fontes entra 1 vez
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      lista.push({ nome: n, telefone: x.telefone || null, origem: x.origem, ref: x.ref || null });
    }
    res.json({ candidatos: lista.slice(0, 300), total: lista.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Cadastrar vários de uma vez (o que foi marcado na lista de candidatos).
r.post('/pacientes/lote', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  const lista = Array.isArray(req.body?.pacientes) ? req.body.pacientes.slice(0, 300) : [];
  if (!lista.length) return res.status(400).json({ error: 'Marque ao menos um paciente.' });
  let criados = 0, repetidos = 0;
  try {
    for (const b of lista) {
      const nome = cut(String(b?.nome || '').trim(), 90);
      if (!nome) continue;
      const telefone = tel(b?.telefone);
      if (telefone) {
        const { rows: dup } = await query(`SELECT id FROM terapia_pacientes WHERE telefone = $1 LIMIT 1`, [telefone]);
        if (dup.length) { repetidos++; continue; }
      }
      await query(`
        INSERT INTO terapia_pacientes (nome, telefone, conversa_id, lead_id, origem, status, criado_por_id, criado_por_nome)
        VALUES ($1,$2,$3,$4,$5,'avaliacao',$6,$7)`,
        [nome, telefone, b?.origem === 'conversa' ? cut(b.ref, 40) : null,
         b?.origem === 'lead' ? cut(b.ref, 40) : null, cut(b?.origem, 20) || 'lote',
         req.user.id, req.user.nome]);
      criados++;
    }
    try { socketEmit('terapias_update', { lote: criados }); } catch (_) {}
    res.json({ ok: true, criados, repetidos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ SESSÕES — O ACOMPANHAMENTO ════════════════════════════════════════════
   É aqui que a área deixa de ser cadastro e vira acompanhamento, do jeito que
   os sistemas de ABA fazem: cada sessão é uma linha, com presença e o que
   aconteceu. Do somatório sai "12 de 40 sessões" e a lista de faltas — que é o
   que trava a evolução da criança e precisa de conversa com a família. */
const PRESENCAS = ['presente', 'falta', 'reposicao', 'cancelada'];

r.get('/pacientes/:id/sessoes', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try {
    const { rows } = await query(
      `SELECT id, especialidade, TO_CHAR(data,'YYYY-MM-DD') AS data, hora, presenca, observacao,
              profissional, criado_por_nome, created_at
         FROM terapia_sessoes WHERE paciente_id = $1 ORDER BY data DESC, id DESC LIMIT 200`,
      [req.params.id]);
    res.json({ sessoes: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/pacientes/:id/sessoes', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  const b = req.body || {};
  // Data em São Luís: sem isso, sessão lançada de noite cai no dia seguinte.
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const data = /^\d{4}-\d{2}-\d{2}$/.test(b.data || '') ? b.data : hoje;
  try {
    const { rows: [s] } = await query(`
      INSERT INTO terapia_sessoes (paciente_id, especialidade, data, hora, presenca, observacao, profissional, criado_por_id, criado_por_nome)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [req.params.id, cut(b.especialidade, 60), data, cut(b.hora, 5),
       PRESENCAS.includes(b.presenca) ? b.presenca : 'presente',
       cut(b.observacao, 1000), cut(b.profissional, 90), req.user.id, req.user.nome]);
    // Fotos tiradas na sessão entram já ligadas a ela (viram o álbum depois).
    const fotos = await guardarFotos(+req.params.id, s.id, b.fotos, req.user);
    try { socketEmit('terapias_update', { paciente_id: +req.params.id }); } catch (_) {}
    res.json({ ok: true, id: s.id, fotos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ ÁLBUM DA CRIANÇA ══════════════════════════════════════════════════════
   Pedido do master: anexar fotos ao longo das sessões pra depois montar um
   álbum. É o registro que a família mais valoriza — dá pra ver a evolução.

   Cada foto chega em DUAS versões (a tela reduz antes de mandar): a miniatura
   alimenta a galeria e a grande só desce quando alguém abre a foto. A galeria
   NUNCA devolve a foto grande, senão o álbum de um ano de terapia derruba o
   celular da equipe. */
const MAX_FOTOS_PACIENTE = 300;
const ehImagem = (v) => typeof v === 'string' && /^data:image\/(jpeg|png|webp|jpg);base64,/.test(v) && v.length < 8_000_000;

async function guardarFotos(pacienteId, sessaoId, fotos, user) {
  const lista = (Array.isArray(fotos) ? fotos : []).filter(f => ehImagem(f?.arquivo)).slice(0, 20);
  if (!lista.length) return 0;
  const { rows: [c] } = await query(`SELECT COUNT(*)::int n FROM terapia_fotos WHERE paciente_id = $1`, [pacienteId]);
  const cabem = Math.max(0, MAX_FOTOS_PACIENTE - (c?.n || 0));
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  let n = 0;
  for (const f of lista.slice(0, cabem)) {
    await query(`INSERT INTO terapia_fotos (paciente_id, sessao_id, data, legenda, arquivo, miniatura, mimetype, criado_por_id, criado_por_nome)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [pacienteId, sessaoId, /^\d{4}-\d{2}-\d{2}$/.test(f.data || '') ? f.data : hoje,
       cut(f.legenda, 200), f.arquivo, ehImagem(f.miniatura) ? f.miniatura : f.arquivo,
       cut(f.mimetype, 40), user.id, user.nome]);
    n++;
  }
  return n;
}

// Galeria: metadados + miniatura (a foto grande fica de fora de propósito)
r.get('/pacientes/:id/fotos', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try {
    const { rows } = await query(
      `SELECT id, sessao_id, TO_CHAR(data,'YYYY-MM-DD') AS data, legenda, mimetype,
              miniatura, criado_por_nome, created_at
         FROM terapia_fotos WHERE paciente_id = $1 ORDER BY data DESC, id DESC LIMIT 200`,
      [req.params.id]);
    res.json({ fotos: rows, max: MAX_FOTOS_PACIENTE });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Foto grande, uma de cada vez (abrir no álbum ou baixar)
r.get('/fotos/:id', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try {
    const { rows: [f] } = await query(
      `SELECT id, TO_CHAR(data,'YYYY-MM-DD') AS data, legenda, arquivo, mimetype, criado_por_nome
         FROM terapia_fotos WHERE id = $1`, [req.params.id]);
    if (!f) return res.status(404).json({ error: 'Foto não encontrada.' });
    res.json(f);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/pacientes/:id/fotos', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try {
    const n = await guardarFotos(+req.params.id, req.body?.sessao_id ? +req.body.sessao_id : null, req.body?.fotos, req.user);
    if (!n) return res.status(400).json({ error: 'Nenhuma foto válida (JPG/PNG/WebP até ~6MB) — ou o álbum já chegou no limite.' });
    res.json({ ok: true, adicionadas: n });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/fotos/:id', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try {
    await query(`DELETE FROM terapia_fotos WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/sessoes/:id', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try {
    await query(`DELETE FROM terapia_sessoes WHERE id = $1`, [req.params.id]);
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
  // Dia do mês em que a família paga aquela terapia (clínica particular)
  const diaPag = b.dia_pagamento ? Math.max(1, Math.min(parseInt(b.dia_pagamento) || 0, 31)) : null;
  const { rows: [pl] } = await query(`
    INSERT INTO terapia_planos (paciente_id, especialidade, sessoes_semana, valor_sessao, valor_mensal, data_inicio,
      status, observacoes, horarios, profissional, dia_pagamento, criado_por_id, criado_por_nome)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13) RETURNING *`,
    [pacienteId, especialidade, sessoes, valorSessao, valor, dataInicio,
     STATUS_PLANO.includes(b.status) ? b.status : 'ativo', cut(b.observacoes, 400),
     JSON.stringify(horarios), cut(b.profissional, 80), diaPag,
     req.user.id, req.user.nome]);
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
  if (b.profissional !== undefined) { sets.push(`profissional = $${i++}`); params.push(cut(b.profissional, 80)); }
  if (b.dia_pagamento !== undefined) {
    sets.push(`dia_pagamento = $${i++}`);
    params.push(b.dia_pagamento === '' || b.dia_pagamento == null ? null : Math.max(1, Math.min(parseInt(b.dia_pagamento) || 1, 31)));
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

// ── Grade da semana + conflitos ──────────────────────────────────────────────
// Os sistemas da área (Terapee, Neoaba, Plataforma ABA) tratam a agenda como
// MULTIRRECURSO: o mesmo terapeuta não pode estar em dois lugares no mesmo
// horário. Aqui a grade sai dos horários fixos dos planos ativos, e a rota já
// aponta os choques em vez de deixar a equipe descobrir na hora do atendimento.
r.get('/grade', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try {
    const { rows } = await query(`
      SELECT pl.id, pl.especialidade, pl.profissional, pl.horarios,
             p.id AS paciente_id, p.nome AS paciente
        FROM terapia_planos pl
        JOIN terapia_pacientes p ON p.id = pl.paciente_id
       WHERE pl.status = 'ativo' AND p.status <> 'alta'`);

    // Uma linha por dia/hora marcado
    const slots = [];
    for (const pl of rows) {
      for (const h of (Array.isArray(pl.horarios) ? pl.horarios : [])) {
        if (!Number.isInteger(+h?.dia) || !/^\d{2}:\d{2}$/.test(h?.hora || '')) continue;
        slots.push({
          plano_id: pl.id, paciente_id: pl.paciente_id, paciente: pl.paciente,
          especialidade: pl.especialidade, profissional: pl.profissional || null,
          dia: +h.dia, hora: h.hora,
        });
      }
    }

    // Choque = MESMO terapeuta, mesmo dia e hora, em pacientes diferentes.
    // Sem terapeuta informado não dá para afirmar choque — fica de fora.
    const porChave = new Map();
    for (const s2 of slots) {
      if (!s2.profissional) continue;
      const k = `${s2.profissional.toLowerCase()}|${s2.dia}|${s2.hora}`;
      porChave.set(k, [...(porChave.get(k) || []), s2]);
    }
    const conflitos = [...porChave.values()]
      .filter(g => new Set(g.map(x => x.paciente_id)).size > 1)
      .map(g => ({ profissional: g[0].profissional, dia: g[0].dia, hora: g[0].hora, itens: g }));
    const chavesEmConflito = new Set(conflitos.map(c => `${c.profissional.toLowerCase()}|${c.dia}|${c.hora}`));
    slots.forEach(s2 => {
      s2.conflito = !!s2.profissional && chavesEmConflito.has(`${s2.profissional.toLowerCase()}|${s2.dia}|${s2.hora}`);
    });

    slots.sort((a, b) => a.hora.localeCompare(b.hora) || a.dia - b.dia);
    res.json({ slots, conflitos, sem_horario: rows.filter(r2 => !(Array.isArray(r2.horarios) && r2.horarios.length)).length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Mensalidades a receber ───────────────────────────────────────────────────
// A clínica é PARTICULAR: quem paga é a família, no dia combinado de cada mês.
// Esta lista mostra quem vence nos próximos 5 dias e quem já passou do dia,
// para a equipe cobrar antes de virar mês.
r.get('/cobrancas', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try {
    const { rows } = await query(`
      SELECT pl.id, pl.especialidade, pl.valor_mensal, pl.dia_pagamento,
             p.id AS paciente_id, p.nome AS paciente, p.responsavel, p.telefone
        FROM terapia_planos pl
        JOIN terapia_pacientes p ON p.id = pl.paciente_id
       WHERE pl.status = 'ativo' AND pl.dia_pagamento IS NOT NULL AND p.status <> 'alta'`);

    // Dia de hoje no fuso de São Luís
    const hoje = +new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(8, 10);
    const itens = rows
      .map(r2 => ({ ...r2, faltam: r2.dia_pagamento - hoje }))
      .filter(r2 => r2.faltam <= 5 && r2.faltam >= -10)   // 5 dias antes até 10 de atraso
      .sort((a, b) => a.faltam - b.faltam);
    res.json({
      itens,
      atrasadas: itens.filter(x => x.faltam < 0).length,
      vencendo: itens.filter(x => x.faltam >= 0).length,
      total: itens.reduce((s2, x) => s2 + (+x.valor_mensal || 0), 0),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/resumo', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try { res.json(await resumoPlanos(req.query.mes)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

/* 📊 RELATÓRIO DA ÁREA — números para gráfico e para impressão ───────────────
   Além do "quantos planos fiz", responde o que a gestão pergunta de verdade:
   estamos crescendo?, qual terapia sustenta a área?, quanto entra por mês de
   forma recorrente?, e o que está pedindo ação agora. */
r.get('/relatorio', auth, async (req, res) => {
  if (!guarda(req, res)) return;
  try {
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : mesLocal();
    const [evolucao, porTerapia, porStatus, recorrente, semHorario, paradosQ, resumo] = await Promise.all([
      // 6 meses pra trás: a linha do tempo é o que mostra se a área cresce
      query(`SELECT to_char(created_at,'YYYY-MM') mes, COUNT(*)::int n,
                    COALESCE(SUM(valor_mensal),0)::float valor
               FROM terapia_planos
              WHERE status <> 'cancelado'
                AND created_at >= (date_trunc('month', $1::date) - interval '5 months')
                AND created_at <  (date_trunc('month', $1::date) + interval '1 month')
              GROUP BY 1 ORDER BY 1`, [`${mes}-01`]).catch(() => ({ rows: [] })),
      query(`SELECT COALESCE(NULLIF(especialidade,''),'(sem terapia)') nome, COUNT(*)::int n,
                    COALESCE(SUM(valor_mensal),0)::float valor
               FROM terapia_planos WHERE status = 'ativo'
              GROUP BY 1 ORDER BY n DESC`).catch(() => ({ rows: [] })),
      query(`SELECT COALESCE(status,'avaliacao') status, COUNT(*)::int n
               FROM terapia_pacientes GROUP BY 1`).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int n, COALESCE(SUM(valor_mensal),0)::float mrr,
                    COALESCE(SUM(sessoes_semana),0)::int sessoes
               FROM terapia_planos WHERE status = 'ativo'`).catch(() => ({ rows: [{}] })),
      // Plano ativo sem dia/hora não entra na grade — vira sessão que ninguém marca
      query(`SELECT p.id, p.especialidade, pa.nome paciente
               FROM terapia_planos p JOIN terapia_pacientes pa ON pa.id = p.paciente_id
              WHERE p.status = 'ativo' AND COALESCE(jsonb_array_length(p.horarios),0) = 0
              ORDER BY pa.nome LIMIT 30`).catch(() => ({ rows: [] })),
      // Em avaliação há mais de 7 dias e ainda sem plano: é aqui que o lead esfria
      query(`SELECT pa.id, pa.nome, pa.telefone,
                    EXTRACT(DAY FROM (NOW() - pa.created_at))::int dias
               FROM terapia_pacientes pa
              WHERE COALESCE(pa.status,'avaliacao') = 'avaliacao'
                AND pa.created_at < NOW() - INTERVAL '7 days'
                AND NOT EXISTS (SELECT 1 FROM terapia_planos p WHERE p.paciente_id = pa.id AND p.status <> 'cancelado')
              ORDER BY pa.created_at LIMIT 30`).catch(() => ({ rows: [] })),
      resumoPlanos(mes),
    ]);

    // Preenche os 6 meses (mês sem plano precisa aparecer como zero no gráfico,
    // senão a linha "pula" o buraco e some justamente o mês ruim)
    const serie = [];
    const [a0, m0] = mes.split('-').map(Number);
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(a0, m0 - 1 - i, 1);
      const ref = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const achado = evolucao.rows.find(r2 => r2.mes === ref);
      serie.push({ mes: ref, rotulo: ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][dt.getMonth()],
        n: achado?.n || 0, valor: achado?.valor || 0 });
    }

    res.json({
      mes, resumo,
      evolucao: serie,
      por_terapia: porTerapia.rows,
      por_status: porStatus.rows,
      recorrente: {
        planos: recorrente.rows[0]?.n || 0,
        mrr: recorrente.rows[0]?.mrr || 0,
        sessoes_semana: recorrente.rows[0]?.sessoes || 0,
      },
      alertas: {
        sem_horario: semHorario.rows,
        parados: paradosQ.rows,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
