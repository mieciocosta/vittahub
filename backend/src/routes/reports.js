import express from 'express';
import { query } from '../db/pool.js';
import { auth } from '../middleware/auth.js';

const r = express.Router();
r.use(auth);

r.get('/dashboard', async (req, res) => {
  try {
    const isMaster = req.user.role === 'master';
    const uid = String(req.user.id).replace(/[^a-zA-Z0-9-]/g, ''); // só charset de UUID (anti-injection)
    const verTudo = isMaster || req.user.role === 'supervisor';
    const uFilter = verTudo ? '' : `AND l.responsavel_id = '${uid}'`;
    // Período dos gráficos: ?days=7|30|90 (validado — nunca interpola entrada crua)
    const days = [7, 30, 90].includes(parseInt(req.query.days)) ? parseInt(req.query.days) : 7;

    const [totals, porStatus, porOrigem, porResp, porDia, unread, retornos, perdas, followups, metaVac, consHoje, cfgMetas, impacto] = await Promise.all([
      query(`SELECT
        COUNT(*) total,
        COUNT(*) FILTER (WHERE data_entrada = CURRENT_DATE) hoje,
        COUNT(*) FILTER (WHERE status IN ('Fechado','Venda Fechada')) fechados,
        COUNT(*) FILTER (WHERE status = 'Perdido') perdidos,
        COUNT(*) FILTER (WHERE status = 'Em atendimento') em_atendimento,
        ${isMaster ? 'SUM(CASE WHEN status IN (\'Fechado\',\'Venda Fechada\') THEN valor_proposta ELSE 0 END) total_vendido,' : ''}
        ${isMaster ? 'AVG(CASE WHEN status=\'Fechado\' THEN valor_proposta END) ticket_medio,' : ''}
        COUNT(*) FILTER (WHERE data_retorno = CURRENT_DATE) retornos_hoje,
        COUNT(*) FILTER (WHERE data_retorno < CURRENT_DATE AND status NOT IN ('Fechado','Venda Fechada','Perdido')) retornos_vencidos,
        ${isMaster ? "SUM(CASE WHEN status NOT IN ('Fechado','Venda Fechada','Perdido') THEN valor_proposta ELSE 0 END) pipeline," : ''}
        COUNT(*) FILTER (WHERE status NOT IN ('Fechado','Venda Fechada','Perdido')) abertos
        FROM leads l WHERE 1=1 ${uFilter}`),
      query(`SELECT status, COUNT(*) n FROM leads l WHERE 1=1 ${uFilter} GROUP BY status`),
      query(`SELECT origem, COUNT(*) total, COUNT(*) FILTER (WHERE status IN ('Fechado','Venda Fechada')) fechados FROM leads l WHERE 1=1 ${uFilter} GROUP BY origem ORDER BY total DESC`),
      isMaster ? query(`SELECT u.id, u.nome, u.cor, u.avatar, u.setor, COUNT(l.id) leads, COUNT(l.id) FILTER (WHERE l.status_changed_at::date = CURRENT_DATE) atend_hoje, COUNT(l.id) FILTER (WHERE l.status IN ('Fechado','Venda Fechada')) fechados, SUM(CASE WHEN l.status IN ('Fechado','Venda Fechada') THEN l.valor_proposta ELSE 0 END) valor FROM usuarios u LEFT JOIN leads l ON l.responsavel_id = u.id WHERE u.role IN ('atendente','supervisor') AND u.ativo = true GROUP BY u.id ORDER BY valor DESC`) : Promise.resolve({ rows: [] }),
      query(`SELECT data_entrada::text data, COUNT(*) leads, COUNT(*) FILTER (WHERE status IN ('Fechado','Venda Fechada')) fechados FROM leads l WHERE data_entrada >= CURRENT_DATE - INTERVAL '${days} days' ${uFilter} GROUP BY data_entrada ORDER BY data_entrada`),
      query('SELECT SUM(unread) unread FROM conversas'),
      query(`SELECT COUNT(*) n FROM leads WHERE data_retorno = CURRENT_DATE ${uFilter.replace('l.', '')}`),
      query(`SELECT motivo_perda, COUNT(*) n FROM leads WHERE status = 'Perdido' AND motivo_perda IS NOT NULL ${uFilter} GROUP BY motivo_perda ORDER BY n DESC`),
      // Follow-ups: vencidos e de hoje (alimenta Agenda-Hoje e Atividades)
      query(`SELECT l.id, l.nome, l.status, l.servico, l.data_retorno::text, l.setor,
                    u.nome resp_nome, u.avatar resp_avatar, c.id conv_id
             FROM leads l
             LEFT JOIN usuarios u ON u.id = l.responsavel_id
             LEFT JOIN conversas c ON c.lead_id = l.id
             WHERE l.data_retorno <= CURRENT_DATE
               AND l.status NOT IN ('Fechado','Venda Fechada','Perdido','Finalizado')
               ${uFilter}
             ORDER BY l.data_retorno ASC LIMIT 8`),
      // Metas: vendido no mês (vacinas) e consultas confirmadas hoje
      query(`SELECT COALESCE(SUM(valor_proposta),0) vendido FROM leads
             WHERE status IN ('Fechado','Venda Fechada') AND COALESCE(setor,'vacinas')='vacinas'
               AND date_trunc('month', status_changed_at) = date_trunc('month', NOW())`),
      query(`SELECT COUNT(*) n FROM leads
             WHERE status = 'Consulta Confirmada' AND COALESCE(setor,'vacinas')='consultas'
               AND status_changed_at::date = CURRENT_DATE`),
      query("SELECT valor FROM configuracoes WHERE chave = 'metas'"),
      // Painel de impacto (números do propósito, não só faturamento)
      query(`SELECT
        (SELECT COUNT(*) FROM conversas) familias,
        (SELECT COUNT(*) FROM leads WHERE status IN ('Vacinado','Pós-Vacinal')) criancas_vacinadas,
        (SELECT COUNT(*) FROM leads WHERE status IN ('Consulta Realizada','Retorno','Finalizado') AND COALESCE(setor,'vacinas')='consultas') consultas_realizadas,
        (SELECT COUNT(*) FROM leads WHERE status IN ('Em Tratamento','Renovação') AND COALESCE(setor,'vacinas')='terapias') terapias_iniciadas`),
      // Agenda REAL (agenda_eventos) — o que de fato está marcado, não status de lead
      query(`SELECT
        COUNT(*) FILTER (WHERE data = CURRENT_DATE AND status <> 'Cancelado') hoje,
        COUNT(*) FILTER (WHERE data >= CURRENT_DATE AND status IN ('Agendado','Confirmado','Reagendado')) proximos,
        COUNT(*) FILTER (WHERE data >= CURRENT_DATE AND status = 'Agendado') a_confirmar
        FROM agenda_eventos WHERE ($1::text IS NULL OR responsavel_id = $1)`, [verTudo ? null : uid]),
      // Atividade real das conversas (WhatsApp/Instagram)
      query(`SELECT
        COUNT(*) total,
        COUNT(*) FILTER (WHERE last_from = 'contact') aguardando,
        COUNT(*) FILTER (WHERE last_message_at::date = CURRENT_DATE) hoje
        FROM conversas`),
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
      porResponsavel: isMaster ? porResp.rows : [],
      porDia: porDia.rows,
      motivosPerda: perdas.rows,
      followups: followups.rows,
      metas: (() => {
        const metaMes = parseFloat(cfgMetas.rows[0]?.valor?.vacinas_mensal) || 200000;
        const metaDiaCons = parseInt(cfgMetas.rows[0]?.valor?.consultas_dia) || 10;
        const vendido = parseFloat(metaVac.rows[0]?.vendido) || 0;
        const hojeN = new Date().getDate();
        const diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        return {
          vacinas: {
            meta: metaMes, vendido,
            pct: +((vendido / metaMes) * 100).toFixed(1),
            falta: Math.max(metaMes - vendido, 0),
            projecao: hojeN > 0 ? +((vendido / hojeN) * diasMes).toFixed(0) : 0,
          },
          consultas: { metaDia: metaDiaCons, confirmadasHoje: parseInt(consHoje.rows[0]?.n) || 0 },
        };
      })(),
      impacto: {
        familias: parseInt(impacto.rows[0]?.familias) || 0,
        criancasVacinadas: parseInt(impacto.rows[0]?.criancas_vacinadas) || 0,
        consultasRealizadas: parseInt(impacto.rows[0]?.consultas_realizadas) || 0,
        terapiasIniciadas: parseInt(impacto.rows[0]?.terapias_iniciadas) || 0,
      },
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

export default r;
