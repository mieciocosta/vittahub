import express from 'express';
import { query } from '../db/pool.js';
import { auth } from '../middleware/auth.js';

const r = express.Router();
r.use(auth);

r.get('/dashboard', async (req, res) => {
  try {
    /* ⏰ RÉGUA ÚNICA DE TEMPO — auditoria de 16/08 (pedido do master: "as
       informações devem bater com dados reais"). O servidor roda em UTC e este
       painel usava CURRENT_DATE: às 21h de São Luís o "hoje" virava amanhã e
       TODOS os contadores diários zeravam — foi exatamente o print das 23h04
       ("0 hoje" pra equipe inteira). Daqui pra baixo, todo "hoje" e "mês" usa
       estas constantes; nenhuma query compara com CURRENT_DATE/NOW() cru. */
    const HOJE = "(NOW() - interval '3 hours')::date";                 // colunas DATE
    const DIA_TS = "(NOW() - interval '3 hours')::date + interval '3 hours'"; // início do dia SLZ p/ timestamps (sargável)
    const MES = "to_char(NOW() - interval '3 hours','YYYY-MM')";
    const isMaster = req.user.role === 'master';
    const uid = String(req.user.id).replace(/[^a-zA-Z0-9-]/g, ''); // só charset de UUID (anti-injection)
    /* Visão geral = gestão + marketing. Supervisora vê o SETOR dela (ordem do
       master); tratar `supervisor` como "vê tudo" já custou vazamento. */
    const veGeral = isMaster || req.user.ve_geral === true;
    const verTudo = veGeral;
    const uFilter = verTudo ? '' : `AND l.responsavel_id = '${uid}'`;
    /* Setores de quem pediu (autoridade: banco, não o token). Só o master vê os
       três — supervisora é supervisora DO SETOR dela. NULL = sem recorte. */
    const meusSetores = await (async () => {
      if (veGeral) return null;
      const { rows: [u] } = await query('SELECT setor, setores FROM usuarios WHERE id = $1', [req.user.id])
        .catch(() => ({ rows: [null] }));
      const vals = ['vacinas', 'consultas', 'terapias'];
      if (u && Array.isArray(u.setores) && u.setores.length) return u.setores.filter(s => vals.includes(s));
      if (u && vals.includes(u.setor)) return [u.setor];
      return [];
    })();
    // Período dos gráficos: ?days=7|30|90 (validado — nunca interpola entrada crua)
    const days = [7, 30, 90].includes(parseInt(req.query.days)) ? parseInt(req.query.days) : 7;

    const [totals, porStatus, porOrigem, porResp, porDia, unread, retornos, perdas, followups, metaVac, consHoje, cfgMetas, impacto, agenda, conversas, funilConv, porSetorConv] = await Promise.all([
      query(`SELECT
        COUNT(*) total,
        COUNT(*) FILTER (WHERE data_entrada = ${HOJE}) hoje,
        COUNT(*) FILTER (WHERE status IN ('Fechado','Venda Fechada')) fechados,
        COUNT(*) FILTER (WHERE status = 'Perdido') perdidos,
        COUNT(*) FILTER (WHERE status = 'Em atendimento') em_atendimento,
        ${isMaster ? 'SUM(CASE WHEN status IN (\'Fechado\',\'Venda Fechada\') THEN valor_proposta ELSE 0 END) total_vendido,' : ''}
        ${isMaster ? 'AVG(CASE WHEN status=\'Fechado\' THEN valor_proposta END) ticket_medio,' : ''}
        COUNT(*) FILTER (WHERE data_retorno = ${HOJE}) retornos_hoje,
        COUNT(*) FILTER (WHERE data_retorno < ${HOJE} AND status NOT IN ('Fechado','Venda Fechada','Perdido')) retornos_vencidos,
        ${isMaster ? "SUM(CASE WHEN status NOT IN ('Fechado','Venda Fechada','Perdido') THEN valor_proposta ELSE 0 END) pipeline," : ''}
        COUNT(*) FILTER (WHERE status NOT IN ('Fechado','Venda Fechada','Perdido')) abertos
        FROM leads l WHERE 1=1 ${uFilter}`),
      query(`SELECT status, COUNT(*) n FROM leads l WHERE 1=1 ${uFilter} GROUP BY status`),
      query(`SELECT origem, COUNT(*) total, COUNT(*) FILTER (WHERE status IN ('Fechado','Venda Fechada')) fechados FROM leads l WHERE 1=1 ${uFilter} GROUP BY origem ORDER BY total DESC`),
      // Desempenho da equipe baseado em atividade REAL (conversas atendidas +
      // mensagens enviadas hoje + vendas do mês), não em leads vazios.
      veGeral ? query(`SELECT u.id, u.nome, u.cor, u.avatar, u.setor,
          (SELECT COUNT(*) FROM conversas c WHERE c.responsavel_id = u.id) leads,
          (SELECT COUNT(DISTINCT m.conversa_id) FROM mensagens m WHERE m.sender_id = u.id AND m.from_type='me' AND m.created_at >= ${DIA_TS}) atend_hoje,
          (SELECT COUNT(*) FROM vendas v WHERE to_char(v.data_venda,'YYYY-MM')=${MES}
              AND (v.atendente_id = u.id OR v.conversa_id IN (SELECT c2.id FROM conversas c2 WHERE c2.responsavel_id = u.id))) fechados,
          /* Régua única (auditoria): "fechou é fechou" — o valor acompanha a
             contagem de fechados logo acima. Antes esta linha filtrava só o
             PAGO enquanto fechados contava tudo: duas réguas na mesma linha. */
          (SELECT COALESCE(SUM(v.valor),0) FROM vendas v WHERE to_char(v.data_venda,'YYYY-MM')=${MES}
              AND (v.atendente_id = u.id OR v.conversa_id IN (SELECT c2.id FROM conversas c2 WHERE c2.responsavel_id = u.id))) valor
        FROM usuarios u WHERE u.role IN ('atendente','supervisor') AND u.ativo = true ORDER BY valor DESC, atend_hoje DESC`).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),
      query(`SELECT data_entrada::text data, COUNT(*) leads, COUNT(*) FILTER (WHERE status IN ('Fechado','Venda Fechada')) fechados FROM leads l WHERE data_entrada >= ${HOJE} - INTERVAL '${days} days' ${uFilter} GROUP BY data_entrada ORDER BY data_entrada`),
      query('SELECT SUM(unread) unread FROM conversas'),
      query(`SELECT COUNT(*) n FROM leads WHERE data_retorno = ${HOJE} ${uFilter.replace('l.', '')}`),
      query(`SELECT motivo_perda, COUNT(*) n FROM leads WHERE status = 'Perdido' AND motivo_perda IS NOT NULL ${uFilter} GROUP BY motivo_perda ORDER BY n DESC`),
      // Follow-ups: vencidos e de hoje (alimenta Agenda-Hoje e Atividades)
      query(`SELECT l.id, l.nome, l.status, l.servico, l.data_retorno::text, l.setor,
                    u.nome resp_nome, u.avatar resp_avatar, c.id conv_id
             FROM leads l
             LEFT JOIN usuarios u ON u.id = l.responsavel_id
             LEFT JOIN conversas c ON c.lead_id = l.id
             WHERE l.data_retorno <= ${HOJE}
               AND l.status NOT IN ('Fechado','Venda Fechada','Perdido','Finalizado')
               ${uFilter}
             ORDER BY l.data_retorno ASC LIMIT 8`),
      // Metas: vendido no mês (vacinas) — lê da tabela REAL de vendas (Registrar
      // Venda), igual ao card "Vendas do mês" e à página de Metas. Antes lia de
      // leads.valor_proposta (fluxo antigo) e por isso vinha sempre zerado.
      // vendido = TODA venda fechada (régua única); recebido/pendente é a decomposição
      query(`SELECT
               COALESCE(SUM(valor),0)::float vendido,
               COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('pago','cortesia')),0)::float recebido,
               COALESCE(SUM(valor) FILTER (WHERE status_pagamento NOT IN ('pago','cortesia')),0)::float pendente
             FROM vendas WHERE COALESCE(setor,'vacinas')='vacinas'
               AND to_char(data_venda,'YYYY-MM') = ${MES}`).catch(() => ({ rows: [{ vendido: 0, recebido: 0, pendente: 0 }] })),
      query(`SELECT COUNT(*) n FROM leads
             WHERE status = 'Consulta Confirmada' AND COALESCE(setor,'vacinas')='consultas'
               AND status_changed_at >= ${DIA_TS}`),
      query("SELECT valor FROM configuracoes WHERE chave = 'metas'"),
      // Painel de impacto (números do propósito, não só faturamento)
      // Impacto baseado nas CONVERSAS reais (os status de lead ficam vazios) —
      // volume de famílias atendidas por setor, que é o dado que de fato existe.
      /* Auditoria: o Impacto somava os sem-setor em vacinas (COALESCE) enquanto
         o funil os separava — 2347 vs 1566+781 na MESMA tela. Agora as duas
         listas usam a mesma régua e o sem-triagem aparece como linha própria. */
      query(`SELECT
        (SELECT COUNT(*) FROM conversas) familias,
        (SELECT COUNT(*) FROM conversas WHERE setor='vacinas') conv_vacinas,
        (SELECT COUNT(*) FROM conversas WHERE setor='consultas') conv_consultas,
        (SELECT COUNT(*) FROM conversas WHERE setor='terapias') conv_terapias,
        (SELECT COUNT(*) FROM conversas WHERE setor IS NULL OR setor NOT IN ('vacinas','consultas','terapias')) conv_sem_setor`),
      // Agenda REAL (agenda_eventos) — o que de fato está marcado, não status de lead
      query(`SELECT
        COUNT(*) FILTER (WHERE data = ${HOJE} AND status <> 'Cancelado') hoje,
        COUNT(*) FILTER (WHERE data >= ${HOJE} AND status IN ('Agendado','Confirmado','Reagendado')) proximos,
        COUNT(*) FILTER (WHERE data >= ${HOJE} AND status = 'Agendado') a_confirmar
        FROM agenda_eventos WHERE ($1::text IS NULL OR responsavel_id = $1)`, [verTudo ? null : uid]),
      // Atividade real das conversas (WhatsApp/Instagram)
      query(`SELECT
        COUNT(*) total,
        COUNT(*) FILTER (WHERE last_from = 'contact') aguardando,
        COUNT(*) FILTER (WHERE last_message_at >= ${DIA_TS}) hoje
        FROM conversas`),
      // Funil REAL de atendimento — baseado nas CONVERSAS (os leads ficam vazios).
      // Master/supervisão vê todos os setores; atendente vê o seu.
      query(`SELECT
        COUNT(*)::int recebidas,
        COUNT(*) FILTER (WHERE setor IS NOT NULL OR classificacao IS NOT NULL)::int classificadas,
        COUNT(*) FILTER (WHERE responsavel_id IS NOT NULL AND NOT COALESCE(perdido,false))::int em_atendimento,
        COUNT(*) FILTER (WHERE last_from='contact' AND NOT COALESCE(perdido,false))::int aguardando,
        COUNT(*) FILTER (WHERE lower(COALESCE(lead_score,'')) LIKE 'quente%' AND NOT COALESCE(perdido,false))::int quentes,
        COUNT(*) FILTER (WHERE COALESCE(perdido,false))::int perdidas
        FROM conversas c
        WHERE ($1::text[] IS NULL OR COALESCE(c.setor,(SELECT u2.setor FROM usuarios u2 WHERE u2.id=c.responsavel_id)) = ANY($1))`,
        [meusSetores]).catch(() => ({ rows: [{}] })),
      // Conversas por setor — só o master vê a distribuição da clínica inteira;
      // a equipe vê a fatia do próprio setor (nada de vacina em consultas).
      query(`SELECT COALESCE(setor,'sem setor') setor, COUNT(*)::int n,
               COUNT(*) FILTER (WHERE last_from='contact')::int aguardando
             FROM conversas
             WHERE ($1::text[] IS NULL OR COALESCE(setor,'sem setor') = ANY($1))
             GROUP BY setor ORDER BY n DESC`, [meusSetores]).catch(() => ({ rows: [] })),
    ]);

    const t = totals.rows[0];
    res.json({
      resumo: {
        totalLeads: parseInt(t.total), leadsHoje: parseInt(t.hoje),
        fechados: parseInt(t.fechados), perdidos: parseInt(t.perdidos),
        emAtendimento: parseInt(t.em_atendimento),
        totalVendido: isMaster ? parseFloat(t.total_vendido)||0 : null,
        ticket: isMaster ? parseFloat(t.ticket_medio)||0 : null,
        taxaConversao: t.total > 0 ? +((t.fechados/t.total)*100).toFixed(1) : 0,
        retornosHoje: parseInt(t.retornos_hoje),
        retornosVencidos: parseInt(t.retornos_vencidos),
        totalUnread: parseInt(unread.rows[0]?.unread)||0,
        pipeline: isMaster ? parseFloat(t.pipeline)||0 : null,
        abertos: parseInt(t.abertos)||0,
      },
      dias: days,
      porStatus: porStatus.rows,
      porOrigem: porOrigem.rows,
      porResponsavel: veGeral ? porResp.rows : [],
      porDia: porDia.rows,
      motivosPerda: perdas.rows,
      followups: followups.rows,
      metas: (() => {
        const cfgVal = cfgMetas.rows[0]?.valor || {};
        // Meta vem da estrutura nova (valor.vendas.vacinas, definida na página de
        // Metas); cai para a chave antiga e, por fim, para o padrão de R$ 200 mil.
        const metaMes = parseFloat(cfgVal.vendas?.vacinas) || parseFloat(cfgVal.vacinas_mensal) || 200000;
        const metaDiaCons = parseInt(cfgVal.consultas_dia) || 10;
        const vendido = parseFloat(metaVac.rows[0]?.vendido) || 0;
        const recebido = parseFloat(metaVac.rows[0]?.recebido) || 0;
        const pendente = parseFloat(metaVac.rows[0]?.pendente) || 0;
        // dia/mês de São Luís, não do servidor (projeção virava o mês às 21h)
        const agoraSLZ = new Date(Date.now() - 3 * 3600 * 1000);
        const hojeN = agoraSLZ.getUTCDate();
        const diasMes = new Date(Date.UTC(agoraSLZ.getUTCFullYear(), agoraSLZ.getUTCMonth() + 1, 0)).getUTCDate();
        return {
          vacinas: {
            meta: metaMes, vendido, recebido, pendente,
            pct: metaMes > 0 ? +((vendido / metaMes) * 100).toFixed(1) : 0,
            falta: Math.max(metaMes - vendido, 0),
            projecao: hojeN > 0 ? +((vendido / hojeN) * diasMes).toFixed(0) : 0,
          },
          consultas: { metaDia: metaDiaCons, confirmadasHoje: parseInt(consHoje.rows[0]?.n) || 0 },
        };
      })(),
      // Agenda real (agenda_eventos) e atividade das conversas — eram calculadas
      // mas NÃO eram devolvidas; por isso os KPIs apareciam zerados no painel.
      agenda: {
        hoje: parseInt(agenda.rows[0]?.hoje) || 0,
        proximos: parseInt(agenda.rows[0]?.proximos) || 0,
        aConfirmar: parseInt(agenda.rows[0]?.a_confirmar) || 0,
      },
      conversas: {
        total: parseInt(conversas.rows[0]?.total) || 0,
        aguardando: parseInt(conversas.rows[0]?.aguardando) || 0,
        hoje: parseInt(conversas.rows[0]?.hoje) || 0,
      },
      // Funil de atendimento baseado nas conversas reais
      funil: (() => {
        const f = funilConv.rows[0] || {};
        return [
          { etapa: 'Recebidas',           n: parseInt(f.recebidas)      || 0 },
          { etapa: 'Classificadas',       n: parseInt(f.classificadas)  || 0 },
          { etapa: 'Em atendimento',      n: parseInt(f.em_atendimento) || 0 },
          { etapa: 'Aguardando resposta', n: parseInt(f.aguardando)     || 0 },
          { etapa: 'Leads quentes',       n: parseInt(f.quentes)        || 0 },
          { etapa: 'Perdidas',            n: parseInt(f.perdidas)       || 0 },
        ];
      })(),
      porSetorConv: (porSetorConv.rows || []).map(s => ({ setor: s.setor, n: parseInt(s.n) || 0, aguardando: parseInt(s.aguardando) || 0 })),
      /* Painel de impacto: cada linha de setor só vai pra quem é DAQUELE setor
         (o master vê os três). Era por aqui que "Conversas — Consultas" ainda
         aparecia no painel de quem só trabalha com vacina. */
      impacto: (() => {
        const meu = (s) => !meusSetores || meusSetores.includes(s);
        return {
          familias: parseInt(impacto.rows[0]?.familias) || 0,
          convVacinas: meu('vacinas') ? parseInt(impacto.rows[0]?.conv_vacinas) || 0 : null,
          convConsultas: meu('consultas') ? parseInt(impacto.rows[0]?.conv_consultas) || 0 : null,
          convTerapias: meu('terapias') ? parseInt(impacto.rows[0]?.conv_terapias) || 0 : null,
          // Sem triagem é trabalho pendente de TODO mundo — sempre visível
          convSemSetor: parseInt(impacto.rows[0]?.conv_sem_setor) || 0,
        };
      })(),
    });
  } catch (err) {
    console.error('dashboard error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

r.get('/pdf-data', async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Somente master' });
  try {
    const [totals, porOrigem, porResp] = await Promise.all([
      query(`SELECT COUNT(*) total, COUNT(*) FILTER(WHERE status IN ('Fechado','Venda Fechada')) fechados, SUM(CASE WHEN status IN ('Fechado','Venda Fechada') THEN valor_proposta ELSE 0 END) vendido FROM leads`),
      query(`SELECT origem, COUNT(*) total, COUNT(*) FILTER(WHERE status='Fechado') fechados FROM leads GROUP BY origem`),
      query(`SELECT u.nome, COUNT(l.id) leads, COUNT(l.id) FILTER(WHERE l.status='Fechado') fechados, SUM(CASE WHEN l.status='Fechado' THEN l.valor_proposta ELSE 0 END) valor FROM usuarios u LEFT JOIN leads l ON l.responsavel_id=u.id WHERE u.role='atendente' GROUP BY u.nome ORDER BY valor DESC`),
    ]);
    const t = totals.rows[0];
    const porOrigem2 = {};
    porOrigem.rows.forEach(r => { porOrigem2[r.origem] = { total: parseInt(r.total), fechados: parseInt(r.fechados) }; });
    const porResponsavel2 = {};
    porResp.rows.forEach(r => { porResponsavel2[r.nome] = { leads: parseInt(r.leads), fechados: parseInt(r.fechados), valor: parseFloat(r.valor)||0 }; });
    res.json({ totalLeads: parseInt(t.total), fechados: parseInt(t.fechados), totalVendido: parseFloat(t.vendido)||0, porOrigem: porOrigem2, porResponsavel: porResponsavel2, geradoEm: new Date().toLocaleString('pt-BR'), periodo: 'Todo período' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   📊 RELATÓRIO DE LEADS NOVOS — pedido do José, repassado pelo master (27/08):
   "todos os nossos Leads juntos numa única carteira, com filtro por mês e por
   dia; quero medir se o marketing realmente está convertendo lead". Refinado no
   mesmo dia: "precisa pegar NAS MENSAGENS se realmente o cliente fechou".

   REGRA DA CASA deste relatório (a lógica tem que ser à prova de discussão):
   · LEAD = cliente NOVO no primeiro contato. A data do lead é a da PRIMEIRA
     mensagem que ele nos mandou naquela conversa. Cada conversa conta uma vez.
   · Quem NÓS chamamos primeiro (prospecção, base antiga) não é lead de
     marketing: vem marcado e sai da conta por padrão (?entrada=0 traz todos).
   · AGENDOU = evento na agenda OU o cartão oficial de confirmação saiu na
     conversa (o cartão só sai quando existe horário marcado de verdade).
   · FECHOU = venda registrada no caixa OU o próprio cliente confirmou o
     pagamento na conversa (comprovante, "fiz o pix", "paguei"). É a leitura
     das MENSAGENS que o master pediu: muita venda fecha no WhatsApp antes de
     alguém lançar no sistema.
   · Conversão só conta o que aconteceu DEPOIS da chegada. Agenda velha do mesmo
     telefone não vira mérito da campanha do mês.
   · Fuso São Luís (UTC-3) em tudo, sem depender do fuso do servidor: mensagem
     das 21h30 é de hoje, não de amanhã.
   Só o master enxerga (ordem do master: "deixa somente o master ver por
   enquanto"). ═════════════════════════════════════════════════════════════ */

/* Sinais de fechamento lidos no texto da conversa. Ficam aqui em cima, num
   lugar só, porque é a régua que o relatório inteiro usa pra dizer "fechou". */
const SINAL_CONFIRMACAO = // nós/IA confirmando o horário (cartão oficial e variações)
  '(confirmad|agendamento realizado|seu hor[aá]rio|est[aá] agendad|te esperamos|nos vemos (dia|amanh))';
const SINAL_PAGAMENTO =  // o cliente dizendo que pagou
  '(comprovante|acabei de pagar|j[aá] paguei|paguei|fiz o pix|pix (feito|enviado|realizado)|segue o (pix|comprovante|pagamento)|transferi|pagamento (feito|realizado|enviado)|efetuei o pagamento)';
const SINAL_ACEITE =     // o cliente fechando o combinado
  '(pode (agendar|marcar|confirmar)|quero (agendar|marcar|fechar)|vamos (marcar|agendar|fechar)|pode deixar marcad|fechad[oa]|confirmo|confirmad[oa]|combinado|estarei|estaremos|vou levar|pode ser (esse|nesse|assim))';
const SINAL_OBJECAO =    // o cliente recuando (marketing caro / lead frio)
  '(n[aã]o (vou|quero|posso|tenho interesse)|desisti|muito caro|caro demais|vou pensar|depois eu (vejo|falo|retorno)|deixa pra depois|achei caro|t[aá] caro)';

/* ⚡ CACHE DA CARTEIRA DE LEADS (cobrança do master, 03/09: "quando seleciono
   a data, demora pra carregar e às vezes perde a data"). As quatro varreduras
   lá embaixo (toda a tabela de mensagens agrupada por conversa + regex de
   sinais de fechamento) dependem SÓ da janela de/até. Mês, dia, dia da
   semana, setor, origem e "só quem nos procurou" são filtro em memória — e
   mesmo assim cada clique refazia tudo no banco. Agora a janela fica guardada
   por 3 minutos: o primeiro clique paga o preço, os seguintes respondem na
   hora. O botão "Atualizar" da tela manda fresh=1 e fura o cache. */
const CACHE_LEADS_NOVOS = new Map();          // 'de|ate' → { em, leads }
const CACHE_LEADS_TTL = 3 * 60 * 1000;
const lerCacheLeads = (k) => {
  const c = CACHE_LEADS_NOVOS.get(k);
  if (!c) return null;
  if (Date.now() - c.em > CACHE_LEADS_TTL) { CACHE_LEADS_NOVOS.delete(k); return null; }
  return c.leads;
};
const guardarCacheLeads = (k, leads) => {
  CACHE_LEADS_NOVOS.set(k, { em: Date.now(), leads });
  // Não deixa crescer: guarda as últimas janelas pedidas, não todas da história
  while (CACHE_LEADS_NOVOS.size > 12) CACHE_LEADS_NOVOS.delete(CACHE_LEADS_NOVOS.keys().next().value);
};

r.get('/leads-novos', async (req, res) => {
  /* Master sempre; fora dele, só quem o master liberou (usuarios.ve_carteira_leads
     — o José, 03/09). Lê do banco, não do token: liberar não pode depender de
     a pessoa sair e entrar de novo. */
  if (req.user.role !== 'master') {
    const { rows: [u] } = await query('SELECT ve_carteira_leads FROM usuarios WHERE id = $1', [req.user.id]).catch(() => ({ rows: [] }));
    if (u?.ve_carteira_leads !== true) return res.status(403).json({ error: 'Relatório restrito ao master' });
  }
  try {
    const meses    = Math.min(24, Math.max(1, parseInt(req.query.meses) || 6));
    const soEntrada = String(req.query.entrada ?? '1') !== '0';
    const dt = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
    const fMes    = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : '';
    const fDia    = dt(req.query.dia);
    const fDow    = /^[0-6]$/.test(String(req.query.dow ?? '')) ? parseInt(req.query.dow) : null;
    const fSetor  = String(req.query.setor  || '').slice(0, 30);
    const fOrigem = String(req.query.origem || '').slice(0, 40);

    /* Janela: período escolhido à mão (de/até) ou os últimos N meses. Calculada
       aqui em JS já no horário de São Luís e mandada como data literal — assim
       o recorte não muda se o fuso do banco mudar. */
    const hojeSLZ = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    let de = dt(req.query.de), ate = dt(req.query.ate);
    if (!de) {
      const [Y, M] = hojeSLZ.split('-').map(Number);
      const d0 = new Date(Date.UTC(Y, M - 1 - (meses - 1), 1));
      de = d0.toISOString().slice(0, 10);
    }
    if (ate && ate < de) [de, ate] = [ate, de];
    const periodoManual = !!dt(req.query.de);

    /* Toda data vira "relógio de São Luís" de forma determinista: tira 3h e lê
       como UTC. Sem isso o relatório dependeria do TimeZone da sessão do banco. */
    const SLZ  = (col) => `((${col} - interval '3 hours') AT TIME ZONE 'UTC')`;
    const TXT  = (col) => `to_char(${SLZ(col)}, 'YYYY-MM-DD HH24:MI')`;
    const DEPOIS_DE = (col) => `${SLZ(col)} >= TIMESTAMP '${de} 00:00:00'`;
    // A chegada respeita o fim do período; a CONVERSÃO não (lead de agosto pode
    // fechar em setembro — e isso continua sendo mérito da campanha de agosto).
    const ATE_FIM = ate ? ` AND ${SLZ('a.pin')} < TIMESTAMP '${ate} 00:00:00' + interval '1 day'` : '';

    const DOW = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const chaveCache = `${de}|${ate}`;
    const fresh = String(req.query.fresh || '') === '1';
    let leads = fresh ? null : lerCacheLeads(chaveCache);
    if (!leads) {
    const [base, agenda, vendas, sinais] = await Promise.all([
      /* Chegada de cada conversa: primeira mensagem DO CLIENTE (pin) e primeira
         nossa (pout). Uma varredura só em mensagens, agrupada por conversa. */
      query(`
        WITH agg AS (
          SELECT conversa_id,
                 MIN(created_at) FILTER (WHERE from_type = 'contact')     AS pin,   -- chegada do lead
                 MIN(created_at) FILTER (WHERE from_type IN ('me','bot')) AS pout,
                 MAX(created_at) FILTER (WHERE from_type IN ('me','bot')) AS pout_fim,
                 COUNT(*) FILTER (WHERE from_type = 'contact')::int       AS msgs_cliente
            FROM mensagens
           GROUP BY conversa_id
        )
        SELECT c.id, c.contact_name AS nome, c.phone, c.setor, c.categoria, c.classificacao,
               c.status_atend, COALESCE(c.perdido,false) AS perdido, c.lead_score, c.lead_id,
               u.nome AS responsavel,
               COALESCE(NULLIF(l.origem, ''), 'WhatsApp') AS origem,
               ${TXT('a.pin')}  AS chegou,
               ${TXT('a.pout')} AS respondeu,
               (a.pout IS NOT NULL AND a.pout >= a.pin) AS respondido_apos,
               (a.pout_fim IS NOT NULL AND a.pout_fim >= a.pin) AS teve_resposta,
               (a.pout IS NOT NULL AND a.pout < a.pin) AS nos_chamamos,
               EXTRACT(EPOCH FROM (a.pout - a.pin))/60 AS resp_min,
               a.msgs_cliente,
               right(regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g'), 8) AS tel8
          FROM agg a
          JOIN conversas c ON c.id = a.conversa_id
          LEFT JOIN usuarios u ON u.id = c.responsavel_id
          LEFT JOIN leads    l ON l.id = c.lead_id
         WHERE a.pin IS NOT NULL
           AND ${DEPOIS_DE('a.pin')}${ATE_FIM}
           AND COALESCE(c.simulacao, false) = false
           AND COALESCE(c.arquivada,  false) = false
         ORDER BY a.pin DESC
         LIMIT 20000`),
      // Agendamentos criados na janela (casam por conversa OU por telefone)
      query(`SELECT conversa_id, data, ${TXT('created_at')} AS criado,
                    right(regexp_replace(COALESCE(telefone,''), '\\D', '', 'g'), 8) AS tel8
               FROM agenda_eventos WHERE ${DEPOIS_DE('created_at')}`),
      // Vendas lançadas no caixa
      query(`SELECT conversa_id, lead_id, COALESCE(valor,0) AS valor, data_venda,
                    ${TXT('created_at')} AS criado
               FROM vendas WHERE ${DEPOIS_DE('created_at')}`),
      /* 💬 O QUE A CONVERSA DIZ (pedido do master): o fechamento real aparece no
         texto antes de virar lançamento. Pego a PRIMEIRA vez que cada sinal
         apareceu — depois comparo com a chegada do lead. */
      query(`SELECT conversa_id,
               ${TXT(`MIN(created_at) FILTER (WHERE from_type IN ('me','bot') AND content ~* '${SINAL_CONFIRMACAO}')`)} AS t_conf,
               ${TXT(`MIN(created_at) FILTER (WHERE from_type = 'contact' AND content ~* '${SINAL_PAGAMENTO}')`)}      AS t_pago,
               ${TXT(`MIN(created_at) FILTER (WHERE from_type = 'contact' AND content ~* '${SINAL_ACEITE}')`)}         AS t_ok,
               ${TXT(`MIN(created_at) FILTER (WHERE from_type = 'contact' AND content ~* '${SINAL_OBJECAO}')`)}        AS t_obj
             FROM mensagens
            WHERE ${DEPOIS_DE('created_at')} AND content IS NOT NULL
            GROUP BY conversa_id`),
    ]);

    /* Índices de conversão. Guardo LISTA por chave (não só o primeiro) porque o
       mesmo telefone pode ter agendamento antigo e outro depois da campanha —
       e só o que veio DEPOIS da chegada é conversão. */
    const push = (mapa, chave, item) => {
      if (!chave) return;
      const arr = mapa.get(chave); if (arr) arr.push(item); else mapa.set(chave, [item]);
    };
    const agConv = new Map(), agTel = new Map();
    for (const a of agenda.rows) {
      const it = { criado: a.criado, data: a.data };
      push(agConv, a.conversa_id, it);
      if (a.tel8 && a.tel8.length === 8) push(agTel, a.tel8, it);
    }
    const vdConv = new Map();
    for (const v of vendas.rows) {
      const it = { criado: v.criado, valor: parseFloat(v.valor) || 0, data: v.data_venda };
      push(vdConv, v.conversa_id, it);
      push(vdConv, v.lead_id, it);
    }
    const sinalDe = new Map(sinais.rows.map(s => [s.conversa_id, s]));

    const dataISO = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : (d ? String(d).slice(0, 10) : null));

    // ── Monta o lead: chegada + tudo que aconteceu DEPOIS dela ───────────────
    leads = base.rows.map(c => {
      const chegou = c.chegou;                       // 'YYYY-MM-DD HH:MM' (São Luís)
      const dia = chegou.slice(0, 10), mes = chegou.slice(0, 7);
      const [Y, M, D] = dia.split('-').map(Number);
      const dow = new Date(Y, M - 1, D).getDay();
      const depois = (x) => !!x && x >= chegou;      // texto ISO compara igual a data

      const ags = [...(agConv.get(c.id) || []), ...(c.tel8 && c.tel8.length === 8 ? (agTel.get(c.tel8) || []) : [])]
        .filter(a => depois(a.criado)).sort((a, b) => a.criado.localeCompare(b.criado));
      const vds = [...new Set([...(vdConv.get(c.id) || []), ...(c.lead_id ? (vdConv.get(c.lead_id) || []) : [])])]
        .filter(v => depois(v.criado)).sort((a, b) => a.criado.localeCompare(b.criado));
      const valor = vds.reduce((s, v) => s + v.valor, 0);

      // O que a CONVERSA conta (só o que veio depois da chegada)
      const s = sinalDe.get(c.id) || {};
      const confMsg = depois(s.t_conf), pagoMsg = depois(s.t_pago);
      const okMsg = depois(s.t_ok), objecao = depois(s.t_obj);

      const agendou = ags.length > 0 || confMsg;
      const fechou  = vds.length > 0 || pagoMsg;
      const prova = vds.length ? 'venda lançada no caixa'
                  : pagoMsg   ? 'cliente confirmou o pagamento na conversa'
                  : ags.length ? 'agendamento na agenda'
                  : confMsg   ? 'confirmação enviada na conversa'
                  : okMsg     ? 'cliente disse que quer fechar'
                  : objecao   ? 'cliente recuou (preço/depois)'
                  : null;

      return {
        id: c.id, nome: c.nome || 'Contato', telefone: c.phone,
        setor: c.setor || 'sem setor', origem: c.origem,
        responsavel: c.responsavel || null,
        categoria: c.categoria, classificacao: c.classificacao,
        status: c.status_atend, perdido: c.perdido, temperatura: c.lead_score,
        chegou, dia, mes, dow, dowNome: DOW[dow],
        nosChamamos: c.nos_chamamos === true,
        respondido: c.teve_resposta === true,
        respMin: c.respondido_apos && c.resp_min != null ? Math.round(Number(c.resp_min)) : null,
        msgsCliente: c.msgs_cliente || 0,
        agendou, agendouEm: ags[0]?.criado || (confMsg ? s.t_conf : null), agendaData: dataISO(ags[0]?.data),
        fechou, fechouEm: vds[0]?.criado || (pagoMsg ? s.t_pago : null),
        valor, temVenda: vds.length > 0, pagouNaConversa: pagoMsg && !vds.length,
        querFechar: okMsg && !fechou, objecao: objecao && !fechou,
        prova,
      };
    });
    guardarCacheLeads(chaveCache, leads);
    }

    // Universo de marketing: por padrão só quem NOS PROCUROU primeiro.
    const universo = leads.filter(l => (soEntrada ? !l.nosChamamos : true));

    // ── Agregadores ─────────────────────────────────────────────────────────
    const zero = () => ({ leads: 0, respondidos: 0, agendados: 0, fechados: 0, comValor: 0, valor: 0 });
    const somar = (acc, l) => {
      acc.leads++;
      if (l.respondido) acc.respondidos++;
      if (l.agendou) acc.agendados++;
      if (l.fechou) { acc.fechados++; acc.valor += l.valor; if (l.valor > 0) acc.comValor++; }
      return acc;
    };
    const taxas = (o) => ({
      ...o,
      valor: Math.round(o.valor * 100) / 100,
      txResposta: o.leads ? Math.round((o.respondidos / o.leads) * 1000) / 10 : 0,
      txAgenda:   o.leads ? Math.round((o.agendados  / o.leads) * 1000) / 10 : 0,
      txFechou:   o.leads ? Math.round((o.fechados   / o.leads) * 1000) / 10 : 0,
      ticket:     o.comValor ? Math.round((o.valor / o.comValor) * 100) / 100 : 0,
    });
    const agrupar = (arr, chave) => {
      const m = new Map();
      for (const l of arr) {
        const k = chave(l); if (k == null) continue;
        if (!m.has(k)) m.set(k, { chave: k, ...zero() });
        somar(m.get(k), l);
      }
      return [...m.values()].map(o => taxas(o));
    };

    // Linha do tempo por MÊS: sempre a janela inteira (é o menu de meses da tela)
    const nomesMes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const mesesLista = agrupar(universo, l => l.mes)
      .sort((a, b) => b.chave.localeCompare(a.chave))
      .map(o => ({ ...o, label: `${nomesMes[parseInt(o.chave.slice(5), 10) - 1]}/${o.chave.slice(2, 4)}` }));

    /* Recorte escolhido (mês → dia da semana → dia exato → setor → origem).
       Os filtros se somam: "agosto + segunda" responde exatamente o exemplo do
       José ("os leads que nos mandaram mensagem na segunda, em agosto"). */
    const recorte = universo.filter(l =>
      (!fMes    || l.mes === fMes) &&
      (!fDia    || l.dia === fDia) &&
      (fDow === null || l.dow === fDow) &&
      (!fSetor  || l.setor === fSetor) &&
      (!fOrigem || l.origem === fOrigem)
    );

    // Dias do mês escolhido (ou da janela toda, se nenhum mês foi clicado)
    const paraDias = universo.filter(l =>
      (!fMes || l.mes === fMes) && (!fSetor || l.setor === fSetor) && (!fOrigem || l.origem === fOrigem)
    );
    const dias = agrupar(paraDias, l => l.dia)
      .map(o => { const [Y, M, D] = o.chave.split('-').map(Number); const dw = new Date(Y, M - 1, D).getDay();
        return { ...o, dia: o.chave, dow: dw, dowNome: DOW[dw], label: `${String(D).padStart(2, '0')}/${String(M).padStart(2, '0')}` }; })
      .sort((a, b) => a.chave.localeCompare(b.chave));

    // Dia da semana (o "filtro por dia" do exemplo do José) — dentro do mês escolhido
    const semana = [0, 1, 2, 3, 4, 5, 6].map(d => {
      const o = paraDias.filter(l => l.dow === d).reduce(somar, zero());
      return taxas({ ...o, chave: d, dow: d, label: DOW[d] });
    });

    const tot = recorte.reduce(somar, zero());
    const temposResp = recorte.map(l => l.respMin).filter(v => v != null && v >= 0).sort((a, b) => a - b);
    const mediana = temposResp.length ? temposResp[Math.floor(temposResp.length / 2)] : null;

    res.json({
      janela: { de, ate: ate || hojeSLZ, meses, manual: periodoManual, entradaSomente: soEntrada },
      filtros: { mes: fMes, dia: fDia, dow: fDow, setor: fSetor, origem: fOrigem },
      totais: {
        ...taxas(tot),
        semResposta: recorte.filter(l => !l.respondido).length,
        semAgenda:   recorte.filter(l => !l.agendou).length,
        prospeccao:  leads.filter(l => l.nosChamamos).length,
        // Fechamento provado pela conversa x lançado no caixa (o master quer ver os dois)
        fechadosCaixa:   recorte.filter(l => l.temVenda).length,
        fechadosConversa: recorte.filter(l => l.pagouNaConversa).length,
        querFechar:  recorte.filter(l => l.querFechar).length,
        objecoes:    recorte.filter(l => l.objecao).length,
        respostaMediana: mediana,
        respostaAte5min: temposResp.filter(v => v <= 5).length,
      },
      meses: mesesLista,
      dias, semana,
      origens: agrupar(recorte, l => l.origem).sort((a, b) => b.leads - a.leads),
      setores: agrupar(recorte, l => l.setor).sort((a, b) => b.leads - a.leads),
      equipe:  agrupar(recorte, l => l.responsavel || 'sem dono').sort((a, b) => b.leads - a.leads),
      lista: recorte.slice(0, 600),
      truncada: recorte.length > 600 ? recorte.length : 0,
    });
  } catch (err) {
    console.error('leads-novos error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default r;
